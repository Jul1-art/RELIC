"""Decode the final V8 variants and check their real presentation clocks.

Reads published media without changing it. Video packet PTS are checked as a
set, since H.264 B-frames put packets in decode order. AAC may retain normal
encoder padding; the required 529-second picture clock is exact.
"""
from pathlib import Path
from fractions import Fraction
import datetime
import hashlib
import json
import math
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
DIST = ROOT / 'intro'
MEDIA = DIST / 'assets/prologue'
ENCODING = MEDIA / 'encoding-v8.json'
OUTPUT = ROOT / 'media-work/v8-4/media-validation.json'
EXPECTED_SECONDS = 529
FPS = 24


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def run(args):
    result = subprocess.run(list(map(str, args)), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} exited {result.returncode}: {result.stderr[-3000:]}')
    return result


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-threads', '1',
                           '-show_format', '-show_streams', '-of', 'json', path]).stdout)


def local(src):
    path = (DIST / src.removeprefix('./')).resolve()
    if not path.is_relative_to(MEDIA) or not path.is_file():
        raise RuntimeError('Media path is not an existing local movie: ' + src)
    return path


def packet_clock(path, stream):
    raw = run(['ffprobe', '-v', 'error', '-threads', '1', '-select_streams', 'v:0',
               '-show_packets', '-show_entries', 'packet=pts,dts,duration',
               '-of', 'json', path])
    packets = json.loads(raw.stdout)['packets']
    if len(packets) != EXPECTED_SECONDS * FPS:
        raise RuntimeError(f'{path.name}: {len(packets)} packets instead of {EXPECTED_SECONDS * FPS}')
    clock = Fraction(stream['time_base'])
    step = Fraction(1, FPS) / clock
    if step.denominator != 1:
        raise RuntimeError(f'{path.name}: frame period does not fit its time base')
    step = int(step)
    points = sorted(int(packet['pts']) for packet in packets)
    if any(b-a != step for a, b in zip(points, points[1:])):
        raise RuntimeError(f'{path.name}: video has duplicate, missing or variable frame timestamps')
    decode_points = [int(packet['dts']) for packet in packets]
    if any(b-a != step for a, b in zip(decode_points, decode_points[1:])):
        raise RuntimeError(f'{path.name}: video decode timestamps are not constant 1/24 second')
    # Some copied H.264 packets omit duration in FFprobe, despite their exact
    # consecutive decode/presentation clocks. Infer only absent values from
    # those independently checked clocks; never accept an explicit wrong one.
    missing_durations = sum('duration' not in packet for packet in packets)
    if any(int(packet['duration']) != step for packet in packets if 'duration' in packet):
        raise RuntimeError(f'{path.name}: explicit packet durations are not constant 1/24 second')
    span = (points[-1] - points[0] + step) * clock
    if span != EXPECTED_SECONDS:
        raise RuntimeError(f'{path.name}: presentation span is {span} seconds')
    return {'packets': len(packets), 'timeBase': str(clock), 'ticksPerFrame': step,
            'firstPts': points[0], 'lastPts': points[-1],
            'decodeTimestampStep': step, 'explicitPacketDurations': len(packets)-missing_durations,
            'inferredPacketDurations': missing_durations,
            'durationInference': 'Absent duration values inferred from exact consecutive DTS and complete PTS frame grid.',
            'presentationSeconds': float(span), 'constantFrameRate': True}


def decode(path, width, height, label):
    info = probe(path)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    if (video['width'], video['height']) != (width, height):
        raise RuntimeError(f'{label}: unexpected picture dimensions')
    if video['codec_name'] != 'h264' or audio['codec_name'] != 'aac':
        raise RuntimeError(f'{label}: expected H.264/AAC')
    if Fraction(video['r_frame_rate']) != FPS or Fraction(video['avg_frame_rate']) != FPS:
        raise RuntimeError(f'{label}: declared frame rate is not 24 fps')
    if int(audio['sample_rate']) != 48000 or audio['channels'] != 2:
        raise RuntimeError(f'{label}: expected 48 kHz stereo sound')
    result = run(['ffmpeg', '-hide_banner', '-v', 'error', '-nostdin', '-threads', '1',
                  '-i', path, '-map', '0:v:0', '-map', '0:a:0', '-threads', '1',
                  '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'])
    if result.stderr.strip():
        raise RuntimeError(f'{label}: decode errors: {result.stderr[-3000:]}')
    progress = {}
    for row in result.stdout.splitlines():
        if '=' in row:
            key, value = row.split('=', 1)
            progress[key] = value
    if int(progress.get('frame', '-1')) != EXPECTED_SECONDS * FPS or progress.get('progress') != 'end':
        raise RuntimeError(f'{label}: complete frame decode was not confirmed')
    video_clock = packet_clock(path, video)
    return {'label': label, 'path': str(path.relative_to(ROOT)), 'passed': True,
            'width': width, 'height': height, 'fps': FPS,
            'decodedFrames': int(progress['frame']), 'decodeErrors': [],
            'formatDuration': float(info['format']['duration']), 'videoClock': video_clock,
            'audio': {'codec': audio['codec_name'], 'sampleRate': int(audio['sample_rate']),
                      'channels': audio['channels'], 'startTime': audio.get('start_time'),
                      'duration': audio.get('duration')}}


def loudness(path):
    result = run(['ffmpeg', '-hide_banner', '-v', 'info', '-nostdin', '-threads', '1',
                  '-i', path, '-vn', '-af',
                  'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
                  '-threads', '1', '-f', 'null', '-'])
    tail = result.stderr[result.stderr.rfind('{'):]
    measured = json.JSONDecoder().raw_decode(tail)[0]
    integrated = float(measured['input_i'])
    peak = float(measured['input_tp'])
    if not math.isfinite(integrated) or not math.isfinite(peak):
        raise RuntimeError(f'{path.name}: non-finite encoded sound measurements')
    if abs(integrated + 16) > 1:
        raise RuntimeError(f'{path.name}: integrated sound {integrated} LUFS outside -16 +/-1')
    if peak >= -1:
        raise RuntimeError(f'{path.name}: encoded true peak lacks 1 dB headroom ({peak} dBTP)')
    return {'integratedLufs': integrated, 'truePeakDbtp': peak,
            'loudnessRangeLu': float(measured['input_lra']),
            'minimumTruePeakHeadroomDb': 1,
            'method': 'FFmpeg loudnorm measurement of encoded AAC; input_* fields are measured sound, not a rewritten file.',
            'aacTargetOvershootDb': max(0, peak+1.5), 'passed': True}


def main():
    if not ENCODING.is_file():
        raise SystemExit('Final encoding-v8.json is not ready; do not validate a partial build.')
    encoding_sha = digest(ENCODING)
    metadata = json.loads(ENCODING.read_text())
    if metadata['version'] != 8 or metadata['duration'] != EXPECTED_SECONDS or metadata['fps'] != FPS:
        raise SystemExit('Unexpected V8 picture contract; review the validator if the edit deliberately changed.')
    report = {'version': 8, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'encodingSha256': encoding_sha, 'expectedSeconds': EXPECTED_SECONDS,
              'expectedFps': FPS, 'variants': [], 'mastering': {}, 'passed': False}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        for language in ['en', 'fr']:
            mastering = metadata['languages'][language]['mastering']
            expected_peak = -3.2 if metadata.get('revision') in {'8.2', '8.3', '8.4'} and language == 'fr' else -1.5
            if mastering['target'] != {'integrated': -16, 'truePeak': expected_peak, 'lra': 11}:
                raise RuntimeError('Mastering target changed for ' + language)
            if float(mastering['secondPass']['output_tp']) > -1.49:
                raise RuntimeError('Pre-encode master exceeds true-peak target for ' + language)
            report['mastering'][language] = mastering
            variant = decode(local(metadata['hls']['languages'][language]), 1280, 720, 'hls-'+language)
            variant['sound'] = loudness(local(metadata['hls']['languages'][language]))
            report['variants'].append(variant)
            print('Decoded and measured 720p HLS ' + language, flush=True)
        for language in ['en', 'fr']:
            record = metadata['fallbacks'][language]
            path = local(record['src'])
            if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
                raise RuntimeError('Encoded fallback identity changed for ' + language)
            variant = decode(path, 960, 540, 'fallback-'+language)
            variant['sound'] = loudness(path)
            report['variants'].append(variant)
            print('Decoded and measured 540p fallback ' + language, flush=True)
        if digest(ENCODING) != encoding_sha:
            raise RuntimeError('Encoding metadata changed during validation')
        report['passed'] = True
    except Exception as error:
        report['failure'] = str(error)
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUTPUT.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(OUTPUT), 'passed': report['passed'],
                      'failure': report.get('failure')}), flush=True)
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
