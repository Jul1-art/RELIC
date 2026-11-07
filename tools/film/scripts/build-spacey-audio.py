"""Render Spacey's English tour with the same stock voice as the intro.

Supply the existing Kokoro runtime, model, voices and FFmpeg as local paths.
The build never downloads models or calls a speech service.
"""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--voices', type=Path, required=True)
    parser.add_argument('--ffmpeg', type=Path, required=True)
    parser.add_argument('--script', type=Path, default=Path(__file__).with_name('spacey-narration.json'))
    parser.add_argument('--output', type=Path, default=ROOT/'assets/spacey/audio')
    args = parser.parse_args()
    source = json.loads(args.script.read_text(encoding='utf-8'))
    lines = source['lines']
    identifiers = [line['id'] for line in lines]
    if not lines or len(set(identifiers)) != len(identifiers) or any(not re.fullmatch('[a-z0-9-]+', key) for key in identifiers):
        parser.error('Narration IDs must be unique safe file names.')
    if any(not line['text'].strip() for line in lines):
        parser.error('Narration lines must contain text.')
    sys.path.insert(0, str(args.runtime.resolve()))
    import numpy as np
    import onnxruntime as ort
    import soundfile as sf
    from kokoro_onnx import Kokoro
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(args.model), sess_options=options, providers=['CPUExecutionProvider'])
    model = Kokoro.from_session(session, str(args.voices))
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with tempfile.TemporaryDirectory(prefix='relic-spacey-') as temporary:
        for line in lines:
            spoken = line.get('spokenText', line['text'])
            samples, rate = model.create(spoken, voice=source['voice'], lang=source['locale'],
                                         speed=source['speed'], trim=True, sentence_pause=.25, clause_pause=.1)
            samples = np.asarray(samples, dtype=np.float32)
            if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 1e-4:
                raise ValueError(f"Silent or invalid narration for {line['id']}")
            raw = Path(temporary)/(line['id']+'.wav')
            sf.write(raw, samples, rate, subtype='FLOAT')
            target = output/(line['id']+'.mp3')
            fades = ('afade=t=in:st=0:d=0.008,afade=t=out:st='
                     + f'{max(0,len(samples)/rate-.045):.6f}:d=0.045,'
                     + 'adelay=40:all=1,apad=pad_dur=0.08,loudnorm=I=-18:TP=-2:LRA=7')
            subprocess.run([str(args.ffmpeg), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw),
                            '-af', fades, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k',
                            '-map_metadata', '-1', str(target)], check=True)
            decoded = subprocess.check_output([str(args.ffmpeg), '-hide_banner', '-loglevel', 'error',
                                               '-i', str(target), '-f', 'f32le', '-ac', '1', '-ar', '24000', '-'])
            pcm = np.frombuffer(decoded, dtype='<f4')
            peak = float(np.max(np.abs(pcm)))
            if not pcm.size or not np.isfinite(pcm).all() or not .01 < peak < .99:
                raise ValueError(f"Invalid output level for {line['id']}")
            records.append({'id':line['id'], 'text':line['text'], 'file':target.name,
                            'duration':round(len(pcm)/24000, 3), 'peak':round(peak, 5),
                            'bytes':target.stat().st_size, 'sha256':sha256(target)})
            print(f"Rendered {line['id']} {records[-1]['duration']:.2f}s", flush=True)
    manifest = {
        'schema':'relic.spacey.narration.v1', 'language':'en-US', 'synthetic':True,
        'voice':source['voice'], 'speed':source['speed'], 'sameVoiceAs':'English intro narration',
        'namePronunciation':'Spacey /speɪsi/',
        'runtime':{'name':'kokoro-onnx', 'version':importlib.metadata.version('kokoro-onnx'), 'license':'MIT'},
        'model':{'name':'Kokoro-82M v1.0 INT8 ONNX', 'license':'Apache-2.0',
                 'source':'https://huggingface.co/hexgrad/Kokoro-82M',
                 'sha256':sha256(args.model), 'voicesSha256':sha256(args.voices)},
        'lines':records,
    }
    (output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
