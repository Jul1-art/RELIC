"""Restore the documentary MP4s from their checked, transport-sized parts.

The Git repository stores every byte in parts; the server restores ordinary MP4
files before it starts. No downloads, credentials or media encoders are needed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile


MANIFEST = "intro/assets/prologue/mp4-parts/manifest.json"
BLOCK_SIZE = 1024 * 1024
PART_SIZE = 8 * 1024 * 1024
FILM_PATHS = [f"intro/assets/prologue/relic-prologue-v8-4-{language}.mp4" for language in ("en", "fr")]


def _checked_path(root: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or "\\" in name:
        raise ValueError("Film manifest contains an invalid path")
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in name.split("/")):
        raise ValueError("Film manifest path must stay inside the project")
    candidate = root
    for part in path.parts:
        candidate /= part
        if candidate.is_symlink():
            raise ValueError(f"Film paths cannot use symbolic links: {name}")
    if candidate.exists() and not candidate.is_file():
        raise ValueError(f"Film path is not a regular file: {name}")
    return candidate


def _metadata(entry: dict) -> tuple[int, str]:
    size, digest = entry.get("size"), entry.get("sha256")
    if type(size) is not int or size < 0 or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Film manifest contains invalid integrity metadata")
    return size, digest


def _digest(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while block := stream.read(BLOCK_SIZE):
            size += len(block)
            digest.update(block)
    return size, digest.hexdigest()


def restore_films(root: Path | str | None = None) -> list[str]:
    """Return restored paths, checking all parts before atomically replacing files."""
    root = Path(root or Path(__file__).resolve().parents[1]).resolve()
    manifest_path = _checked_path(root, MANIFEST)
    if not manifest_path.exists():
        return []  # The atlas can also be distributed without the documentary.
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or not isinstance(manifest.get("files"), list):
        raise ValueError("Unsupported film-parts manifest")
    restored = []
    for entry in manifest["files"]:
        target = _checked_path(root, entry.get("path"))
        expected_size, expected_digest = _metadata(entry)
        parts = entry.get("parts")
        if not isinstance(parts, list) or not parts:
            raise ValueError("Film manifest must list at least one part")
        checked = [(_checked_path(root, part.get("path")), _metadata(part)) for part in parts]
        if sum(metadata[0] for _, metadata in checked) != expected_size:
            raise ValueError(f"Film part sizes do not match: {entry['path']}")
        if target.exists() and _digest(target) == (expected_size, expected_digest):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            whole = hashlib.sha256()
            whole_size = 0
            with tempfile.NamedTemporaryFile(prefix=f".{target.name}.", suffix=".restore", dir=target.parent, delete=False) as output:
                temporary = Path(output.name)
                for part_path, (part_size, part_digest) in checked:
                    digest = hashlib.sha256()
                    size = 0
                    with part_path.open("rb") as stream:
                        while block := stream.read(BLOCK_SIZE):
                            size += len(block)
                            whole_size += len(block)
                            digest.update(block)
                            whole.update(block)
                            output.write(block)
                    if (size, digest.hexdigest()) != (part_size, part_digest):
                        raise ValueError(f"Film part failed its integrity check: {part_path.relative_to(root)}")
                if (whole_size, whole.hexdigest()) != (expected_size, expected_digest):
                    raise ValueError(f"Restored film failed its integrity check: {entry['path']}")
                output.flush()
                os.fsync(output.fileno())
            temporary.replace(target)
            restored.append(entry["path"])
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return restored


def pack_films(root: Path | str | None = None, file_paths: list[str] | None = None, part_size: int = PART_SIZE) -> dict:
    """Regenerate transport parts after a deliberate film re-encode."""
    if type(part_size) is not int or part_size <= 0 or part_size > PART_SIZE:
        raise ValueError("Film parts must be between 1 byte and 8 MiB")
    root = Path(root or Path(__file__).resolve().parents[1]).resolve()
    manifest_path = _checked_path(root, MANIFEST)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "description": "Byte-identical fallback MP4 files, split for transport. The Python server and Node static build restore them automatically.", "partSize": part_size, "files": []}
    for name in file_paths or FILM_PATHS:
        source = _checked_path(root, name)
        whole = hashlib.sha256()
        entry = {"path": name, "size": 0, "sha256": "", "parts": []}
        with source.open("rb") as stream:
            index = 0
            while block := stream.read(part_size):
                part_name = f"{manifest_path.parent.relative_to(root).as_posix()}/{source.name}.part{index:02d}"
                part = _checked_path(root, part_name)
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(prefix=f".{part.name}.", suffix=".restore", dir=part.parent, delete=False) as output:
                        temporary = Path(output.name)
                        output.write(block)
                    temporary.replace(part)
                finally:
                    if temporary is not None:
                        temporary.unlink(missing_ok=True)
                whole.update(block)
                entry["size"] += len(block)
                entry["parts"].append({"path": part_name, "size": len(block), "sha256": hashlib.sha256(block).hexdigest()})
                index += 1
        if not entry["parts"]:
            raise ValueError(f"Cannot package an empty film: {name}")
        entry["sha256"] = whole.hexdigest()
        manifest["files"].append(entry)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".manifest.", suffix=".restore", dir=manifest_path.parent, mode="w", encoding="utf-8", delete=False) as output:
            temporary = Path(output.name)
            json.dump(manifest, output, indent=2)
            output.write("\n")
        temporary.replace(manifest_path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="Project directory (defaults to this checkout)")
    parser.add_argument("--pack", action="store_true", help="Regenerate parts and checksums after re-encoding the MP4s")
    arguments = parser.parse_args()
    if arguments.pack:
        manifest = pack_films(arguments.root)
        print(f"Film package regenerated: {len(manifest['files'])} file(s).")
    else:
        restored = restore_films(arguments.root)
        print(f"Film MP4 files verified; restored {len(restored)} file(s).")
