# Documentary source and rendering tools

The current bilingual film uses the V8.4 edit. These files include the edit plans, narration and archive-subtitle scripts, the picture/audio renderer, metadata generator and media-clock validator. The V6 renderer supplies shared low-level functions; the V7 edit and cue data are references used by the V8 preparation code. They do not load the former application's Solar System renderer.

The distributed app already includes the finished HLS picture and English/French audio. Its large MP4 fallback files are reconstructed from bundled byte parts by the server or static build. Re-encoding is unnecessary to run the app.

## Rebuild prerequisites

Re-rendering requires Python 3.10+, FFmpeg/ffprobe with libx264/AAC, NumPy, and the original source media at the paths listed in `scripts/prologue-edit-v8.json` under the repository's ignored `media-work/` directory. Some source files are prepared audio excerpts. Their URLs, selected excerpts, processing and rights appear in `../../intro/assets/prologue/sources-v8.json` and the earlier source manifests in the same directory; also read the root third-party notices. The original stock clips, large source programs, voice models and intermediate WAV/MP4 files are not redistributed here. Review source-specific reuse terms before obtaining or replacing them.

New narration uses stock Kokoro synthetic voices, not human performers or cloned archive speakers. The narration script accepts `--model`, `--voices` and `--runtime` for separately installed Kokoro ONNX inputs. Its default locations are documented in the script. Historical excerpts remain genuine archive recordings and must not be synthesized.

Run commands from the repository root after preparing those inputs:

```sh
python3 tools/film/scripts/synthesize-narration-v8.py tools/film/scripts/prologue-narration-v8.json
python3 tools/film/scripts/build-prologue-v8.py
python3 tools/film/scripts/prepare-sources-v8.py
node tools/film/scripts/prepare-prologue-v8.mjs
python3 tools/film/scripts/validate-prologue-v8.py
```

The V8 preparation script regenerates the edit/caption data from its source paragraphs and reference cues. It can also be run before narration when intentionally editing the script; changing narration requires synthesizing it again before rendering. Generated narration must fit every declared slot. The renderer refuses partial or outdated narration manifests.

The adapted tools write final media and data into the integrated `intro/` folder. After changing either fallback MP4, run `python3 tools/restore_film.py --pack` to regenerate the transport parts and manifest, and update the encoding checksums and provenance. Renderer output depends on source bytes, codec/model versions and local tools; do not claim a bit-identical fresh encode without comparing the supplied SHA-256 records.
