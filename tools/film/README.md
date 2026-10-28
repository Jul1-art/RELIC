# Documentary source and rendering tools

The current V9.1 film lasts 9 minutes 29 seconds. The distributed app includes a shared 1920 × 1080, 50 fps HLS picture and separate English/French mixed audio. Running the app does not require re-encoding, voice models or original footage. Historical recordings retain their source quality; scaling and frame repetition do not create native HD detail.

`scripts/prologue-edit-v9.json` defines the 52 shots. `scripts/prologue-narration-v9.json` contains the bilingual narration, and `scripts/prologue-archives-v9.json` records complete historical dialogue. The active caption and composition data are in `../../intro/prologue-data-v8.js`; its filename remains stable for the player. Source URLs, excerpts, dates, licenses and processing are recorded in `../../intro/assets/prologue/sources-v9.json` and [the third-party notices](../../docs/legal/THIRD_PARTY_NOTICES.md).

## Chronological delivery

`scripts/prologue-chronology-v9.json` defines the verified permutation from V9.0 to V9.1. Enterprise's 1977 tests precede the Voyager launches. The Falcon Heavy STP-2 mission of June 2019 and Falcon 9 / Sentinel-6 mission of November 2020 precede Perseverance and Webb in 2021. No event or spoken clause is added or removed. The closing reflection on equipment left on the Moon and Mars is explicitly labelled as an epilogue; the dates of illustrative archive material do not reorder the narrated historical events.

`scripts/reorder-prologue-v9.py` rebuilds this delivery directly from the checked V9.0 HLS package. It copies 27,850 of the 28,450 encoded picture frames unchanged and repairs the six incoming two-second GOPs at changed joins, using clean frames from the same shot after the original dissolve. The English and French mixed audio tracks are reordered at exact sample boundaries, with short click fades, then encoded as AAC. Narration is not resynthesized.

Install the optional tools and run from the repository root:

```sh
python -m pip install -r tools/film/requirements.txt
python tools/film/scripts/reorder-prologue-v9.py
```

The default output is `media-work/v9-chronology/v9-1-hd50/`; the validation report remains in `media-work/v9-chronology/report.json`. The original `v9-0-hd50/` package, `encoding-v9-0-source.json`, and `reference/prologue-edit-v9-source.json` are retained as verified production inputs. The static build deploys only `v9-1-hd50/` and the current stable metadata filenames. Publishing a new delivery also requires remapping the player scenes, bilingual captions and production/source timelines, and regenerating every offline file size, checksum and film identity.

## Original-source mastering

Narration uses the stock Kokoro voices `af_heart` and `ff_siwis`. These are synthetic voices, not human performers or cloned historical speakers. Historical speech remains genuine archive audio. The Helios score by Scott Buckley is licensed separately from the application code.

Rebuilding requires Python 3.10+, FFmpeg/ffprobe with libx264/AAC, NumPy, the licensed original media and separately installed Kokoro ONNX/runtime inputs. The original programs, source footage, voice models and intermediate masters are not redistributed. Review each source’s reuse terms before downloading or replacing it.

The V9 synthesizer and mixer expose their inputs through `--help`. The picture builder, `scripts/build-prologue-v9-hd50.py`, reuses verified V8.5 HD shot caches and the checked native origins montage; its `--media-root`, `--work`, `--reuse-root`, `--native-origins` and `--audio-root` inputs must point to those separately prepared files. Their fingerprints prevent stale shot reuse. Retain the source audit and verify both localized streams after any edit.

Older scripts and plans remain as production history. They are not the active film and should not overwrite the V9 player data or metadata. The static build deploys only the current V9 media; large review MP4s remain outside the app.

The offline option explicitly downloads and verifies both languages before reporting success. Browser storage can subsequently be cleared or evicted; it is not permanent archival storage.
