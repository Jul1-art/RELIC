"""Render continuous bilingual paragraphs and clause captions with stock voices.

Input JSON: {"lines": [{"id": "beginning", "start": .4, "end": 5.8,
                       "text": {"en": "...", "fr": "..."},
                       "subtitles": {"en": ["First clause.", "Next clause."],
                                     "fr": ["Première phrase.", "Suite."]}}]}.
Optional spokenText maps permit phonetic spelling of a name without changing
the displayed text; both are recorded. Historical quotes must stay archival.

Each paragraph is synthesized in one call, never once per subtitle or shot.
Clause caption timing is approximate: phoneme-length proportions, refined using
nearby measured quiet regions of that paragraph's actual waveform. It is not
word-level forced alignment. Optional spokenSubtitles gives pronunciation forms
for weighting only; historical quotations must remain archival.

Outputs live in ignored media-work/v9-narration: 48 kHz stereo PCM16 WAVs,
per-paragraph cached metadata, and manifest.json. The model uses a natural
speed between .95 and 1.08; no finished audio is time-stretched or truncated to
fit. If a line still exceeds its slot, the manifest reports the required extra
time and the command exits 2 so the edit can be lengthened.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import shutil
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = ROOT / 'media-work/v6-sound/tts-deps'
MODEL = ROOT / 'media-work/v6-sound/kokoro-v1.0.int8.onnx'
VOICES = ROOT / 'media-work/v6-sound/voices-v1.0.bin'
OUTPUT = None
TIMING_METHOD = (
    'Approximate clause timing: proportion of eSpeak phoneme counts within a '
    'continuous paragraph, snapped to nearby measured quiet regions in the '
    'recorded waveform. Not word-exact forced alignment; no subtitle is '
    'synthesized separately.'
)
VOICE_CONFIG = {
    'en': {'voice': 'af_heart', 'locale': 'en-us', 'description': 'American English stock synthetic voice'},
    'fr': {'voice': 'ff_siwis', 'locale': 'fr-fr', 'description': 'French stock synthetic voice'},
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    temporary = Path(str(path) + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def relative(path):
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def plain(value):
    return re.sub(r'\s+', ' ', str(value)).strip()


def subtitle_parts(line, language, display, spoken, parser):
    supplied = line.get('subtitles', {}).get(language)
    if supplied is None:
        parts = [display]
    elif isinstance(supplied, list) and supplied and all(isinstance(x, str) for x in supplied):
        parts = [plain(x) for x in supplied]
    else:
        parser.error(f"{line['id']}: {language} subtitles must be a non-empty string array")
    if not all(parts) or plain(' '.join(parts)) != display:
        parser.error(f"{line['id']}: {language} subtitles must preserve the complete displayed paragraph")
    pronunciation = line.get('spokenSubtitles', {}).get(language)
    if pronunciation is None:
        pronunciation = parts
    elif (not isinstance(pronunciation, list) or len(pronunciation) != len(parts)
          or not all(isinstance(x, str) and plain(x) for x in pronunciation)):
        parser.error(f"{line['id']}: {language} spokenSubtitles must match the subtitle clause count")
    else:
        pronunciation = [plain(x) for x in pronunciation]
        if plain(' '.join(pronunciation)) != spoken:
            parser.error(f"{line['id']}: {language} spokenSubtitles must preserve the spoken paragraph")
    return parts, pronunciation


def quiet_regions(samples, rate):
    """Find short low-energy regions without allocating a movie-sized matrix."""
    import numpy as np
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim == 2:
        samples = samples.mean(axis=1)
    if not samples.size or not np.isfinite(samples).all():
        raise ValueError('Caption timing requires a finite, non-empty waveform')
    window, hop = max(1, round(rate * .02)), max(1, round(rate * .01))
    if samples.size < window:
        return [], 0.0, samples.size / rate
    # Cumulative sums yield 20 ms RMS windows at 10 ms intervals in linear time.
    power = np.concatenate(([0.0], np.cumsum(samples.astype(np.float64) ** 2)))
    indices = np.arange(0, samples.size - window + 1, hop)
    rms = np.sqrt(np.maximum(0, (power[indices + window] - power[indices]) / window))
    threshold = max(.00035, float(np.percentile(rms, 65)) * .085)
    quiet = rms <= threshold
    changes = np.diff(np.concatenate(([False], quiet, [False])).astype(np.int8))
    starts, ends = np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)
    regions = []
    for first, last in zip(starts, ends):
        left = max(0.0, (int(indices[first]) + window / 2) / rate)
        right = min(samples.size / rate, (int(indices[last-1]) + window / 2 + hop) / rate)
        if right-left >= .04:
            regions.append({'start': left, 'end': right, 'mid': (left+right)/2,
                            'rms': float(np.mean(rms[first:last])), 'threshold': threshold})
    active = np.flatnonzero(~quiet)
    if active.size:
        speech_start = max(0.0, float(indices[active[0]]) / rate)
        speech_end = min(samples.size / rate, float(indices[active[-1]] + window) / rate)
    else:
        speech_start, speech_end = 0.0, samples.size / rate
    return regions, speech_start, speech_end


def align_captions(samples, rate, clauses, weights, absolute_start, duration):
    """Monotonic approximate clause boundaries, measured from one paragraph."""
    if not clauses or len(clauses) != len(weights) or any(x <= 0 for x in weights):
        raise ValueError('Caption clauses need matching positive phoneme weights')
    if duration <= 0 or not math.isfinite(duration):
        raise ValueError('Caption timing requires a positive waveform duration')
    regions, speech_start, speech_end = quiet_regions(samples, rate)
    speech_end = min(duration, speech_end)
    speech_start = min(speech_start, speech_end)
    total_weight = sum(weights)
    minimum = min(.75, duration / len(clauses) * .32)
    boundaries = [0.0]
    decisions = []
    cumulative = 0.0
    for index, weight in enumerate(weights[:-1], 1):
        cumulative += weight
        expected = speech_start + (speech_end-speech_start) * cumulative / total_weight
        left = boundaries[-1] + minimum
        right = duration - minimum * (len(clauses)-index)
        expected = max(left, min(right, expected))
        average = duration / len(clauses)
        radius = max(.35, min(1.3, average * .28))
        candidates = [r for r in regions if left <= r['mid'] <= right
                      and abs(r['mid']-expected) <= radius
                      and r['start'] > speech_start+.08 and r['end'] < speech_end-.08]
        chosen = None
        if candidates:
            # Prefer a nearby genuine pause; do not chase a distant quiet vowel.
            chosen = min(candidates, key=lambda r: abs(r['mid']-expected)/radius
                         + .22*r['rms']/max(r['threshold'], 1e-9)
                         - .12*min(.3, r['end']-r['start'])/.3)
        at = chosen['mid'] if chosen else expected
        boundaries.append(at)
        decisions.append({'afterClause': index, 'expected': round(expected, 4),
                          'boundary': round(at, 4), 'snappedToQuietRegion': chosen is not None,
                          'quietSeconds': round(chosen['end']-chosen['start'], 4) if chosen else 0})
    boundaries.append(duration)
    result = []
    for index, text in enumerate(clauses):
        begin, end = absolute_start+boundaries[index], absolute_start+boundaries[index+1]
        if end <= begin:
            raise ValueError('Caption timing produced a non-positive clause')
        result.append({'text': text, 'start': round(begin, 6), 'end': round(end, 6),
                       'relativeStart': round(boundaries[index], 6),
                       'relativeEnd': round(boundaries[index+1], 6),
                       'phonemeWeight': weights[index], 'approximate': True})
    return result, decisions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('script', type=Path)
    parser.add_argument('--media-root', type=Path, default=ROOT/'media-work')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--previous-manifest', type=Path, help='Reuse verified unchanged paragraphs with new editorial times')
    parser.add_argument('--model', type=Path, default=MODEL)
    parser.add_argument('--voices', type=Path, default=VOICES)
    parser.add_argument('--runtime', type=Path, default=RUNTIME)
    parser.add_argument('--english-voice', default='af_heart')
    parser.add_argument('--english-locale', default='en-us', choices=['en-us', 'en-gb'])
    parser.add_argument('--french-voice', default='ff_siwis')
    parser.add_argument('--speed', type=float, default=.98)
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--only', action='append', default=[], help='Render a partial manifest for these line IDs; repeatable')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--allow-overflow', action='store_true')
    args = parser.parse_args()
    args.media_root = args.media_root.resolve()
    args.output = (args.output or args.media_root/'v9-narration').resolve()
    if not args.output.is_relative_to(args.media_root): parser.error('--output must stay inside --media-root')
    if args.model == MODEL: args.model = args.media_root/'v6-sound/kokoro-v1.0.int8.onnx'
    if args.voices == VOICES: args.voices = args.media_root/'v6-sound/voices-v1.0.bin'
    if args.runtime == RUNTIME: args.runtime = args.media_root/'v6-sound/tts-deps'
    if not .95 <= args.speed <= 1.08:
        parser.error('--speed must stay between .95 and 1.08 for natural narration')
    if not 1 <= args.threads <= 4:
        parser.error('--threads must be between 1 and 4')
    source = json.loads(args.script.read_text(encoding='utf-8'))
    lines = source if isinstance(source, list) else source.get('lines', [])
    if not lines:
        parser.error('The script has no lines')
    ids = set()
    prepared = []
    for line in lines:
        identifier = line.get('id', '')
        if not re.fullmatch('[a-zA-Z0-9_-]+', identifier) or identifier in ids:
            parser.error(f'Unsafe or duplicated line ID: {identifier!r}')
        ids.add(identifier)
        if line.get('kind') == 'quote' or line.get('archival') or line.get('historical'):
            parser.error(f'{identifier}: genuine historical quotations must not be synthesized')
        start, end = float(line['start']), float(line['end'])
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            parser.error(f'{identifier}: invalid narration slot')
        for language in ['en', 'fr']:
            text = plain(line.get('text', {}).get(language, ''))
            spoken = plain(line.get('spokenText', {}).get(language, text))
            if not text or not spoken:
                parser.error(f'{identifier}: missing {language} text')
            subtitles, spoken_subtitles = subtitle_parts(line, language, text, spoken, parser)
            prepared.append((line, language, text, spoken, start, end, subtitles, spoken_subtitles))
    if args.only and not set(args.only).issubset(ids):
        parser.error('--only refers to an unknown line ID')
    prepared = [entry for entry in prepared if not args.only or entry[0]['id'] in args.only]

    # These are already installed model dependencies, never an online API call.
    sys.path.insert(0, str(args.runtime.resolve()))
    import numpy as np
    import onnxruntime as ort
    import soundfile as sf
    from kokoro_onnx import Kokoro
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(args.model), sess_options=options,
                                providers=['CPUExecutionProvider'])
    model = Kokoro.from_session(session, str(args.voices))
    config = {language: dict(record) for language, record in VOICE_CONFIG.items()}
    config['en'].update(voice=args.english_voice, locale=args.english_locale)
    config['fr']['voice'] = args.french_voice
    for item in config.values():
        if item['voice'] not in model.get_voices():
            parser.error(f"Unknown stock voice: {item['voice']}")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    native = output / 'native'
    native.mkdir(exist_ok=True)
    model_hash, voices_hash = sha256(args.model), sha256(args.voices)
    records, overflows = [], []
    previous = {}
    if args.previous_manifest:
        prior = json.loads(args.previous_manifest.read_text(encoding='utf-8'))
        previous = {(r['id'],r['language']):r for r in prior.get('lines',[])}
    for line, language, display, spoken, start, end, subtitles, spoken_subtitles in prepared:
        identifier = line['id']
        voice = config[language]
        fingerprint_data = {'text': spoken, 'voice': voice, 'model': model_hash,
                            'voices': voices_hash, 'baseSpeed': args.speed,
                            'slotSeconds': round(end-start, 6), 'subtitles': subtitles,
                            'spokenSubtitles': spoken_subtitles, 'displayText': display,
                            'renderRevision': 9}
        fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode()).hexdigest()
        target = output / f'{identifier}-{language}.wav'
        cache = output / f'{identifier}-{language}.json'
        saved = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
        prior = previous.get((identifier,language))
        if not args.force and prior and not saved:
            prior_file = (args.media_root/prior['file']).resolve()
            same = (prior.get('text')==display and prior.get('spokenText',prior.get('text'))==spoken
                    and prior.get('voice')==voice['voice'] and prior.get('locale')==voice['locale']
                    and [x['text'] for x in prior.get('captions',[])]==subtitles
                    and float(prior.get('duration',1e9))<=end-start+.02)
            if same and prior_file.is_relative_to(args.media_root) and prior_file.is_file() and sha256(prior_file)==prior['sha256']:
                shutil.copy2(prior_file,target)
                saved={'fingerprint':fingerprint,'duration':prior['duration'],'nativeSampleRate':prior.get('nativeSampleRate',24000),
                       'speed':prior.get('speed',args.speed),'sha256':prior['sha256'],'reusedFrom':str(prior_file.relative_to(args.media_root))}
                write_json(cache,saved)
                print(f"Reused {identifier}/{language}: {prior['duration']:.3f}s",flush=True)
        if not args.force and saved.get('fingerprint') == fingerprint and target.exists() and saved.get('sha256') == sha256(target):
            duration, rate, speed = saved['duration'], saved['nativeSampleRate'], saved['speed']
            print(f"Cached {identifier}/{language}: {duration:.3f}s", flush=True)
        else:
            candidates = sorted(set([args.speed, *[x for x in (1.02, 1.06, 1.08) if x > args.speed]]))
            samples = None
            for speed in candidates:
                samples, rate = model.create(spoken, voice=voice['voice'],
                    lang=voice['locale'], speed=speed, trim=True,
                    sentence_pause=.25, clause_pause=.1)
                # Small lead/tail handles and click-free fades preserve the words.
                samples = np.asarray(samples, dtype=np.float32)
                if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples)) <= 1e-6:
                    raise RuntimeError(f'{identifier}/{language}: invalid or silent synthesis')
                duration = len(samples) / rate + .12
                if duration <= end-start+.015:
                    break
            raw = native / f'{identifier}-{language}-24k.wav'
            sf.write(raw, samples, rate, subtype='FLOAT')
            command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw),
                '-af', 'afade=t=in:st=0:d=0.008,afade=t=out:st='
                + f'{max(0,len(samples)/rate-.045):.6f}:d=0.045,adelay=40:all=1,apad=pad_dur=0.08',
                '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(target)]
            subprocess.run(command, check=True)
            audio = sf.info(target)
            if audio.samplerate != 48000 or audio.channels != 2 or not audio.frames:
                raise RuntimeError(f'{identifier}/{language}: unexpected output audio format')
            duration = audio.frames / audio.samplerate
            saved = {'fingerprint': fingerprint, 'duration': duration,
                     'nativeSampleRate': rate, 'speed': speed, 'sha256': sha256(target)}
            write_json(cache, saved)
            print(f"Synthesized {identifier}/{language}: {duration:.3f}s at {speed:.2f}", flush=True)
        fits = duration <= end-start+.02
        paragraph_audio, audio_rate = sf.read(target, dtype='float32', always_2d=True)
        weights = [max(1, len(re.sub(r'\s+', '', model.tokenizer.phonemize(text, voice['locale']))))
                   for text in spoken_subtitles]
        captions, caption_decisions = align_captions(paragraph_audio, audio_rate, subtitles,
                                                   weights, start, duration)
        record = {'id': identifier, 'language': language, 'locale': voice['locale'],
            'voice': voice['voice'], 'synthetic': True, 'text': display, 'spokenText': spoken,
            'source': relative(target), 'file': str(target.relative_to(args.media_root)),
            'start': start, 'at': start, 'end': start+duration, 'slotEnd': end,
            'duration': duration, 'slotSeconds': end-start, 'fits': fits,
            'extraSecondsNeeded': round(max(0, duration-(end-start)), 3),
            'speed': speed, 'nativeSampleRate': rate, 'sampleRate': 48000,
            'channels': 2, 'bytes': target.stat().st_size, 'sha256': sha256(target),
            'role': 'voice', 'normalizeInMix': True,
            'synthesisUnit': 'continuous paragraph', 'captions': captions,
            'subtitleTimingMethod': TIMING_METHOD,
            'subtitleBoundaryDecisions': caption_decisions,
            'subtitlePronunciationAliasesProvided': spoken_subtitles != subtitles}
        records.append(record)
        if not fits:
            overflows.append(record)
    provenance = {
        'schema': 'relic.narration.synthetic.v9', 'synthetic': True,
        'authorization': 'User explicitly approved natural synthetic narration in English and French on 2026-10-22.',
        'disclosure': 'Stock synthetic voices. Not a recording of a human actor and not a clone of any historical speaker. Historical quotations remain genuine archive recordings.',
        'runtime': {'name': 'kokoro-onnx', 'version': importlib.metadata.version('kokoro-onnx'),
                    'license': 'MIT', 'source': 'https://github.com/thewh1teagle/kokoro-onnx'},
        'model': {'name': 'Kokoro-82M v1.0 INT8 ONNX', 'license': 'Apache-2.0',
                  'source': 'https://huggingface.co/hexgrad/Kokoro-82M',
                  'release': 'https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0',
                  'sha256': model_hash, 'voicesSha256': voices_hash},
        'voices': config, 'script': relative(args.script.resolve()), 'scriptSha256': sha256(args.script),
        'processing': 'One Kokoro call per continuous paragraph, never one per subtitle or shot. The model may use its native maximum-phoneme windows for long text. Natural-speed synthesis, native silence trim, 8 ms/45 ms click fades, 40 ms lead and 80 ms tail, resample to 48 kHz stereo PCM16. No post-synthesis time compression or word truncation. Normalize and duck beneath the film in the final mix.',
        'subtitleTimingMethod': TIMING_METHOD,
        'reusePreviousManifest': relative(args.previous_manifest.resolve()) if args.previous_manifest else None,
        'partial': bool(args.only), 'selectedLineIds': args.only or sorted(ids),
        'lines': records, 'allLinesFit': not overflows,
        'overflows': [{'id': r['id'], 'language': r['language'], 'extraSecondsNeeded': r['extraSecondsNeeded']} for r in overflows],
    }
    write_json(output/'manifest.json', provenance)
    print(json.dumps({'manifest': str(output/'manifest.json'), 'lines': len(records),
                      'allLinesFit': not overflows, 'overflows': provenance['overflows']}), flush=True)
    if overflows and not args.allow_overflow:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
