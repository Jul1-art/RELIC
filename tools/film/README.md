# Documentary source and rendering tools

The current V9 film lasts 9 minutes 29 seconds. The distributed app includes a shared 1920 × 1080, 50 fps HLS picture and separate English/French mixed audio. Running the app does not require re-encoding, voice models or original footage. Historical recordings retain their source quality; scaling and frame repetition do not create native HD detail.

`scripts/prologue-edit-v9.json` defines the 52 shots. `scripts/prologue-narration-v9.json` contains the bilingual narration, and `scripts/prologue-archives-v9.json` records complete historical dialogue. The active caption and composition data are in `../../intro/prologue-data-v8.js`; its filename remains stable for the player. Source URLs, excerpts, dates, licenses and processing are recorded in `../../intro/assets/prologue/sources-v9.json` and the root third-party notices.

Narration uses the stock Kokoro voices `af_heart` and `ff_siwis`. These are synthetic voices, not human performers or cloned historical speakers. Historical speech remains genuine archive audio. The Helios score by Scott Buckley is licensed separately from the application code.

Rebuilding requires Python 3.10+, FFmpeg/ffprobe with libx264/AAC, NumPy, the licensed original media and separately installed Kokoro ONNX/runtime inputs. The original programs, source footage, voice models and intermediate masters are not redistributed. Review each source’s reuse terms before downloading or replacing it.

The V9 synthesizer and mixer expose their inputs through `--help`. The picture builder, `scripts/build-prologue-v9-hd50.py`, reuses verified V8.5 HD shot caches and the checked native origins montage; its `--media-root`, `--work`, `--reuse-root`, `--native-origins` and `--audio-root` inputs must point to those separately prepared files. Their fingerprints prevent stale shot reuse. Retain the source audit and verify both localized streams after any edit.

Older scripts and plans remain as production history. They are not the active film and should not overwrite the V9 player data or metadata. The static build deploys only the current V9 media; large review MP4s remain outside the app.

The offline option explicitly downloads and verifies both languages before reporting success. Browser storage can subsequently be cleared or evicted; it is not permanent archival storage.
