"""Integrity and atomic-write checks for the transport-sized film package."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from tools.restore_film import MANIFEST, pack_films, restore_films


class FilmPartsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)
        self.body = b"a small, complete film fixture\x00\xff"
        self.target = self.root / "intro/assets/prologue/example.mp4"
        self.manifest = self.root / MANIFEST
        self.manifest.parent.mkdir(parents=True)
        pieces = [self.body[:13], self.body[13:]]
        parts = []
        for index, data in enumerate(pieces):
            path = self.manifest.parent / f"example.mp4.part{index:02d}"
            path.write_bytes(data)
            parts.append({"path": path.relative_to(self.root).as_posix(), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        self.description = {"version": 1, "files": [{"path": self.target.relative_to(self.root).as_posix(), "size": len(self.body), "sha256": hashlib.sha256(self.body).hexdigest(), "parts": parts}]}
        self.save_manifest()

    def save_manifest(self):
        self.manifest.write_text(json.dumps(self.description))

    def test_restores_exact_bytes_and_keeps_verified_existing_file(self):
        self.assertEqual(restore_films(self.root), ["intro/assets/prologue/example.mp4"])
        self.assertEqual(self.target.read_bytes(), self.body)
        before = self.target.stat().st_mtime_ns
        self.assertEqual(restore_films(self.root), [])
        self.assertEqual(self.target.stat().st_mtime_ns, before)

    def test_repacking_a_new_encode_preserves_every_byte(self):
        self.target.write_bytes(self.body + b"a changed ending")
        expected = self.target.read_bytes()
        package = pack_films(self.root, [self.target.relative_to(self.root).as_posix()], part_size=7)
        self.assertEqual(package["files"][0]["size"], len(expected))
        self.assertTrue(all(part["size"] <= 7 for part in package["files"][0]["parts"]))
        self.target.unlink()
        restore_films(self.root)
        self.assertEqual(self.target.read_bytes(), expected)

    def test_bad_part_does_not_replace_an_existing_file_or_leave_temporary_data(self):
        self.target.write_bytes(b"existing copy must survive")
        part = self.root / self.description["files"][0]["parts"][1]["path"]
        part.write_bytes(b"x" * part.stat().st_size)
        with self.assertRaisesRegex(ValueError, "part failed its integrity"):
            restore_films(self.root)
        self.assertEqual(self.target.read_bytes(), b"existing copy must survive")
        self.assertEqual(list(self.target.parent.glob("*.restore")), [])

    def test_bad_whole_file_digest_does_not_publish_a_file(self):
        self.description["files"][0]["sha256"] = "0" * 64
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "Restored film failed"):
            restore_films(self.root)
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.glob("*.restore")), [])

    def test_paths_cannot_escape_the_project(self):
        self.description["files"][0]["path"] = "../outside.mp4"
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, "inside the project"):
            restore_films(self.root)

    def test_paths_cannot_follow_symbolic_links(self):
        outside = self.root / "untouched.bin"
        outside.write_bytes(b"keep me")
        try:
            self.target.symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("This OS does not permit creating symbolic links")
        with self.assertRaisesRegex(ValueError, "symbolic links"):
            restore_films(self.root)
        self.assertEqual(outside.read_bytes(), b"keep me")

    @unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
    def test_node_builder_restores_exact_bytes_and_rejects_corruption_atomically(self):
        utility = Path(__file__).resolve().parents[1] / "tools/restore_film.mjs"
        command = ["node", str(utility), "--root", str(self.root)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.target.read_bytes(), self.body)
        self.target.write_bytes(b"old copy")
        part = self.root / self.description["files"][0]["parts"][0]["path"]
        part.write_bytes(b"x" * part.stat().st_size)
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("integrity check", result.stderr)
        self.assertEqual(self.target.read_bytes(), b"old copy")
        self.assertEqual(list(self.target.parent.glob("*.restore")), [])


if __name__ == "__main__":
    unittest.main()
