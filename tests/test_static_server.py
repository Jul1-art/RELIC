"""Exercise browser media seeking and static-file privacy without network APIs."""

import functools
import http.client
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch


_cache = tempfile.TemporaryDirectory(prefix="relic-test-cache-")
unittest.addModuleCleanup(_cache.cleanup)
with patch.dict(os.environ, {"NASA_ATLAS_CACHE": _cache.name}):
    from server import terrain_server as server


class StaticServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="relic-http-")
        cls.root = Path(cls.directory.name)
        (cls.root / "index.html").write_text("<title>RELIC</title>", encoding="utf-8")
        (cls.root / "film.mp4").write_bytes(bytes(range(256)) * 700)
        (cls.root / "segment.m4s").write_bytes(b"0123456789")
        (cls.root / "empty.mp4").write_bytes(b"")
        (cls.root / "plain").mkdir()
        (cls.root / "page").mkdir()
        (cls.root / "page" / "index.html").write_text("A page", encoding="utf-8")
        for name in (".env", "certificate.key", "config.local.json", "credentials.json", "api-keys.json"):
            (cls.root / name).write_text("private-fixture", encoding="utf-8")
        for name in (".git", "certs", "localconfig"):
            (cls.root / name).mkdir()
            (cls.root / name / "private.txt").write_text("private-fixture", encoding="utf-8")
        cls.logs = []

        class QuietHandler(server.Handler):
            def log_message(self, format, *args):
                cls.logs.append(format % args)

        handler = functools.partial(QuietHandler, directory=str(cls.root))
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        cls.directory.cleanup()

    def request(self, path, method="GET", headers=None):
        connection = http.client.HTTPConnection(*self.httpd.server_address, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_standard_page_and_full_media(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"RELIC", body)
        self.assertEqual(int(headers["Content-Length"]), len(body))
        status, headers, body = self.request("/film.mp4")
        self.assertEqual(status, 200)
        self.assertEqual(body, bytes(range(256)) * 700)
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        self.assertEqual(headers["Content-Type"], "video/mp4")

    def test_closed_range_stops_exactly_at_end(self):
        status, headers, body = self.request("/film.mp4", headers={"Range": "bytes=65530-65540"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Range"], "bytes 65530-65540/179200")
        self.assertEqual(headers["Content-Length"], "11")
        self.assertEqual(body, (bytes(range(256)) * 700)[65530:65541])

    def test_open_suffix_and_oversized_end_ranges(self):
        for range_value, expected, content_range in (
            ("bytes=7-", b"789", "bytes 7-9/10"),
            ("bytes=-3", b"789", "bytes 7-9/10"),
            ("bytes=-999", b"0123456789", "bytes 0-9/10"),
            ("bytes=0-999", b"0123456789", "bytes 0-9/10"),
        ):
            with self.subTest(range_value=range_value):
                status, headers, body = self.request("/segment.m4s", headers={"Range": range_value})
                self.assertEqual(status, 206)
                self.assertEqual(body, expected)
                self.assertEqual(headers["Content-Range"], content_range)
                self.assertEqual(int(headers["Content-Length"]), len(expected))
                self.assertEqual(headers["Content-Type"], "video/iso.segment")

    def test_invalid_and_unsatisfiable_ranges(self):
        for value in ("bytes=10-", "bytes=4-2", "bytes=-0", "bytes=-", "bytes=abc", "bytes=0-1,3-4", "items=0-1", "bytes=" + "9" * 50 + "-"):
            with self.subTest(range_value=value):
                status, headers, body = self.request("/segment.m4s", headers={"Range": value})
                self.assertEqual(status, 416)
                self.assertEqual(headers["Content-Range"], "bytes */10")
                self.assertEqual(headers["Content-Length"], "0")
                self.assertEqual(body, b"")
        status, headers, body = self.request("/empty.mp4", headers={"Range": "bytes=0-"})
        self.assertEqual(status, 416)
        self.assertEqual(headers["Content-Range"], "bytes */0")
        self.assertEqual(body, b"")

    def test_head_ignores_range_and_never_sends_body(self):
        for value in ("bytes=2-4", "bytes=999-", "bytes=malformed"):
            with self.subTest(range_value=value):
                status, headers, body = self.request("/segment.m4s", method="HEAD", headers={"Range": value})
                self.assertEqual(status, 200)
                self.assertEqual(headers["Content-Length"], "10")
                self.assertNotIn("Content-Range", headers)
                self.assertEqual(headers["Accept-Ranges"], "bytes")
                self.assertEqual(body, b"")

    def test_if_range_requires_current_representation(self):
        _, headers, _ = self.request("/segment.m4s", method="HEAD")
        for validator in (headers["ETag"], headers["Last-Modified"]):
            status, _, body = self.request("/segment.m4s", headers={"Range": "bytes=2-4", "If-Range": validator})
            self.assertEqual((status, body), (206, b"234"))
        status, _, body = self.request("/segment.m4s", headers={"Range": "bytes=2-4", "If-Range": '"old-version"'})
        self.assertEqual((status, body), (200, b"0123456789"))

    def test_private_paths_and_encoded_traversal_are_denied_for_get_and_head(self):
        paths = (
            "/.env", "/%2eenv", "/%252eenv", "/.git/private.txt", "/certs/private.txt",
            "/certificate.key", "/config.local.json", "/credentials.json", "/api-keys.json",
            "/localconfig/private.txt", "/../index.html", "/%2e%2e/index.html",
            "/plain/../index.html", "/plain/%2E%2E/index.html", "/plain%5c..%5c.env",
            "/%00.env",
        )
        for method in ("GET", "HEAD"):
            for path in paths:
                with self.subTest(method=method, path=path):
                    status, _, body = self.request(path, method=method)
                    self.assertEqual(status, 403)
                    self.assertNotIn(b"private-fixture", body)

    def test_symbolic_links_are_denied_for_get_and_head(self):
        try:
            (self.root / "hidden-link.txt").symlink_to(self.root / ".env")
            (self.root / "outside-link.txt").symlink_to(self.root.parent / "outside-fixture.txt")
        except (OSError, NotImplementedError):
            self.skipTest("This OS does not permit creating symbolic links")
        for method in ("GET", "HEAD"):
            for path in ("/hidden-link.txt", "/outside-link.txt"):
                with self.subTest(method=method, path=path):
                    self.assertEqual(self.request(path, method=method)[0], 403)

    def test_directory_listing_is_disabled_and_index_redirect_is_relative(self):
        self.assertEqual(self.request("/plain/")[0], 403)
        status, headers, body = self.request("/page")
        self.assertEqual((status, headers["Location"], body), (301, "/page/", b""))
        self.assertEqual(self.request("/page/")[2], b"A page")

    def test_server_never_releases_environment_token(self):
        with patch.dict(os.environ, {"NASA_ATLAS_CESIUM_ION_TOKEN": "private-fixture"}):
            for method in ("GET", "HEAD"):
                status, _, body = self.request("/api/cesium-token", method=method)
                self.assertEqual(status, 410)
                self.assertNotIn(b"private-fixture", body)

    def test_access_logs_drop_all_query_parameters(self):
        self.request("/segment.m4s?token=do-not-log-me&query=private-search")
        log = self.logs[-1]
        self.assertIn("GET /segment.m4s HTTP/1.1", log)
        self.assertNotIn("do-not-log-me", log)
        self.assertNotIn("private-search", log)
        before = len(self.logs)
        self.request("/api/places?lat=do-not-log-me")
        self.assertNotIn("do-not-log-me", "\n".join(self.logs[before:]))

    def test_height_api_still_uses_original_tile_generator(self):
        with patch.object(server, "height_tile", return_value=b"height-fixture") as tile:
            status, headers, body = self.request("/api/height/mars/4/3/2.bin")
        self.assertEqual((status, body), (200, b"height-fixture"))
        self.assertEqual(headers["Content-Type"], "application/octet-stream")
        self.assertEqual(headers["Cache-Control"], "public, max-age=604800")
        tile.assert_called_once_with("mars", 4, 3, 2)

    def test_places_api_preserves_search_and_localization(self):
        places = [{"name": "Toulouse", "lat": 43.6, "lon": 1.44}]
        with patch.object(server, "search_places", return_value=places) as search:
            status, _, body = self.request("/api/places?q=Toulouse&lang=fr&lat=43.6&lon=1.44")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["places"], places)
        search.assert_called_once_with("Toulouse", "fr", 43.6, 1.44)

    def test_live_atlas_preserves_cached_sources(self):
        def cached(key, seconds, fetcher):
            return {"fixture": key, "ttl": seconds}

        with patch.object(server.LIVE, "get", side_effect=cached):
            status, _, body = self.request("/api/live/atlas")
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(set(payload["positions"]), set(server.horizons.TARGETS))
        self.assertEqual(payload["solarWind"]["ttl"], 120)
        self.assertEqual(payload["cacheSeconds"], {"positions": 600, "solarWind": 120})

    def test_tycho_imagery_still_generates_and_caches_tiles(self):
        with tempfile.TemporaryDirectory(prefix="relic-tycho-") as cache:
            with patch.object(server, "TYCHO_IMAGE_TILES", Path(cache)), patch.object(server, "tycho_image_tile", return_value=b"png-fixture") as image:
                first = self.request("/api/imagery/moon/tycho/7/1/2.png")
                second = self.request("/api/imagery/moon/tycho/7/1/2.png")
                self.assertEqual(first[0], 200)
                self.assertEqual(first[1]["Content-Type"], "image/png")
                self.assertEqual(first[2], b"png-fixture")
                self.assertEqual(second[2], b"png-fixture")
                image.assert_called_once_with(server.CACHE, 7, 1, 2)
        self.assertEqual(self.request("/api/imagery/moon/tycho/1/1/2.png")[0], 400)


@unittest.skipUnless(shutil.which("node"), "Node.js is needed for the static builder")
class StaticBuildTests(unittest.TestCase):
    def test_build_includes_film_manifest_and_catalog_but_excludes_private_files(self):
        with tempfile.TemporaryDirectory(prefix="relic-build-") as directory:
            root = Path(directory)
            (root / "tools").mkdir()
            builder = Path(server.ROOT) / "tools" / "build_static.mjs"
            shutil.copy2(builder, root / "tools" / builder.name)
            # Exercise the real builder with its runtime dependency; a checkout
            # without a packaged film legitimately has no parts manifest.
            shutil.copy2(builder.with_name("restore_film.mjs"), root / "tools" / "restore_film.mjs")
            for name in ("assets", "vendor", "intro", "src", "src/core", "src/search", "pages"):
                (root / name).mkdir(exist_ok=True)
            public_files = ("index.html", "src/core/api-config.js", "manifest.webmanifest", "catalog.json", "intro/film.mp4", "intro/film.json", "assets/icon.png", "vendor/library.js", "src/search/places.js", "pages/earth.html")
            private_files = (".env", "config.json", "settings.json", "api-keys.json", "credentials.json", "assets/.env", "intro/config.local.json", "intro/certificate.pem")
            for name in public_files + private_files:
                (root / name).write_text("fixture", encoding="utf-8")
            try:
                (root / "intro" / "linked.mp4").symlink_to(root / ".env")
            except (OSError, NotImplementedError):
                pass  # Dedicated symlink checks report unsupported OS permissions.
            (root / "assets" / ".private").mkdir()
            (root / "assets" / ".private" / "data.json").write_text("fixture", encoding="utf-8")
            subprocess.run([shutil.which("node"), str(root / "tools" / builder.name)], check=True, capture_output=True, text=True)
            for name in public_files:
                self.assertTrue((root / "dist" / name).is_file(), name)
            for name in private_files + ("intro/linked.mp4", "assets/.private/data.json"):
                self.assertFalse((root / "dist" / name).exists(), name)


if __name__ == "__main__":
    unittest.main()
