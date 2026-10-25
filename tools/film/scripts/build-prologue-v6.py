"""Build RELIC V6 from existing, licensed footage and recorded sound only.

Input: scripts/prologue-edit-v6.json (or --plan PATH). Files are relative to
media-work/. Schema:
  shots: [{id, file?, in?:0, duration, sourceLength?, preserveSpeed?:false,
           crop?:"crop=w:h:x:y", fit?:"contain", monochrome?:false}]
  audio: [{id, file, at, length, in?:0, gain?:1,
           role?:"voice"|"archival"|"effect", normalize?:true,
           fadeIn?:0.06, fadeOut?:0.12}]
  effects: [same as audio; defaults to role "effect"]
  music: [{id?, file, at?:0, in?:0, length?, gain?:1, loop?:false,
           fadeIn?:1.5, fadeOut?:3, credit?, license?, sourcePage?}]
         A single object is also accepted.
  silenceMusic: [{start,end}, [start,end], or {at,length}]
  crossfadeSeconds?:0.75, posterAt?:25, musicDuckDb?:14,
  musicCredits?:[], mastering?:{integrated?:-16,truePeak?:-1.5,lra?:11}

A shot without a file is black. Silent imagery may be retimed; preserveSpeed
retains source speed and holds the final frame only if the supplied handle is
short. No camera movement, objects or speech are synthesized by this script.

Outputs: ignored media-work/v6-edit/master.mp4 (720p24, AAC192); VOD fMP4 HLS
under dist/assets/prologue/v6/; a self-contained 960x540/AAC80 fallback MP4
strictly below24MiB; poster-v6.jpg and encoding-v6.json. Each published asset
must fit the host's25MiB limit. --audio-only requires the exact same shot plan
and reuses the checked silent master. --skip-fallback is for debugging only.
--output DIR and --work DIR isolate a smoke build from published assets.
Requires FFmpeg/FFprobe and NumPy; never downloads or generates narration.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
MEDIA = (ROOT / 'media-work').resolve()
WORK = MEDIA / 'v6-edit'
OUTPUT = ROOT / 'intro/assets/prologue'
FPS, WIDTH, HEIGHT, RATE = 24, 1280, 720, 48000
HOST_LIMIT = 25 * 1024 * 1024
FALLBACK_LIMIT = 24 * 1024 * 1024


def sha256(path):
    with Path(path).open('rb') as source:
        digest = hashlib.sha256()
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def run(args, capture=False):
    result = subprocess.run(args, check=True,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                            stderr=subprocess.PIPE if capture else None)
    return result.stdout.decode() if capture else None


def ffmpeg(*args, capture=False):
    return run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], capture)


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))


def source_file(name):
    path = (MEDIA / str(name)).resolve()
    if not path.is_relative_to(MEDIA) or not path.is_file():
        raise FileNotFoundError(f'Media input is missing or outside media-work: {name}')
    return path


def positive(value, name):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f'{name} must be a positive, finite number')
    return value


def json_write(path, value):
    temporary = Path(str(path) + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def metadata(path, relative=None):
    return {'path': relative or str(path.relative_to(OUTPUT)),
            'bytes': path.stat().st_size, 'sha256': sha256(path)}


def extract_loudness(stderr):
    at = stderr.rfind('{')
    if at < 0:
        raise RuntimeError('FFmpeg did not return loudness measurements')
    return json.JSONDecoder().raw_decode(stderr[at:])[0]


def loudness(args, target):
    af = f"loudnorm=I={target['integrated']}:TP={target['truePeak']}:LRA={target['lra']}:print_format=json"
    result = subprocess.run(['ffmpeg', '-hide_banner', '-y', *map(str, args),
                             '-af', af, '-f', 'null', os.devnull],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    return extract_loudness(result.stderr.decode(errors='replace'))


def build_visuals(shots, duration, cross, audio_only):
    silent = WORK / 'silent.mp4'
    cache = WORK / 'silent-plan.json'
    # A changed shot plan cannot silently reuse stale imagery at the same duration.
    source_hashes = {shot['file']: sha256(source_file(shot['file']))
                     for shot in shots if shot.get('file')}
    fingerprint = hashlib.sha256(json.dumps({'shots': shots, 'crossfade': cross,
        'sources': source_hashes, 'rendererRevision': 3, 'width': WIDTH, 'height': HEIGHT, 'fps': FPS},
        sort_keys=True).encode()).hexdigest()
    if audio_only:
        if not silent.is_file() or not cache.is_file():
            raise RuntimeError('Build the visuals before using --audio-only')
        saved = json.loads(cache.read_text())
        if saved.get('fingerprint') != fingerprint:
            raise RuntimeError('The shot plan changed; --audio-only would reuse stale visuals')
        if abs(float(probe(silent)['format']['duration']) - duration) > .1:
            raise RuntimeError('The cached silent movie has the wrong duration')
        print('Reusing checked silent master.', flush=True)
        return silent

    segments, clock = [], 0.0
    for index, shot in enumerate(shots):
        nominal = float(shot['duration'])
        length = nominal + (cross if index < len(shots) - 1 else 0)
        target = WORK / f'shot-{index:02d}.mp4'
        filters = []
        if not shot.get('file'):
            inputs = ['-f', 'lavfi', '-i', f'color=c=black:s={WIDTH}x{HEIGHT}:r={FPS}:d={length}']
        else:
            source = source_file(shot['file'])
            start = float(shot.get('in', 0))
            available = float(probe(source)['format']['duration']) - start
            consumed = min(available, length, float(shot.get('sourceLength', length)))
            if consumed <= 0:
                raise ValueError(f"No frames available for {shot['id']}")
            # Trim in the filter graph: an input -t can stop the demuxer before
            # tpad receives EOF, leaving a short source without its dissolve handle.
            inputs = ['-threads', '1', '-ss', str(start), '-i', str(source)]
            filters.append(f'trim=duration={consumed:.10f}')
            if shot.get('preserveSpeed'):
                filters.append('setpts=PTS-STARTPTS')
            else:
                filters.append(f'setpts={length/consumed:.10f}*(PTS-STARTPTS)')
            # setpts clears the advertised frame rate in this FFmpeg build.
            # Restore it BEFORE tpad; otherwise cloned frames receive duplicate
            # timestamps and are dropped, or infinite padding cannot advance.
            # The explicit output -t bounds clone padding to the shot length.
            filters += [f'fps={FPS}', 'tpad=stop_mode=clone:stop=-1']
            if shot.get('crop'):
                filters.append(shot['crop'])
            if shot.get('fit') == 'contain':
                filters += [f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease',
                            f'pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black']
            else:
                filters += [f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase',
                            f'crop={WIDTH}:{HEIGHT}']
            if shot.get('monochrome'):
                filters.append('hue=s=0')
        filters += ['setsar=1', f'fps={FPS}', f'settb=1/{FPS}', 'format=yuv420p']
        ffmpeg(*inputs, '-vf', ','.join(filters), '-t', length, '-an',
               '-map_metadata', '-1', '-map_chapters', '-1', '-c:v', 'libx264',
               '-threads', '2', '-preset', 'fast', '-crf', '20',
               '-profile:v', 'high', '-level', '3.1', '-g', '48',
               '-keyint_min', '48', '-sc_threshold', '0', '-movflags', '+faststart', target)
        actual_length = float(probe(target)['format']['duration'])
        if abs(actual_length - length) > 1/FPS + .005:
            raise RuntimeError(f"Normalized shot {shot['id']} is {actual_length:.6f}s; expected {length:.6f}s")
        segments.append(target)
        print(f"{index+1}/{len(shots)} {shot['id']}: {clock:g}–{clock+nominal:g}s", flush=True)
        clock += nominal

    if len(segments) == 1:
        shutil.copyfile(segments[0], silent)
    else:
        inputs, graph = [], []
        for path in segments:
            inputs += ['-threads', '1', '-i', str(path)]
        previous, clock = '0:v', 0.0
        for index in range(1, len(segments)):
            clock += float(shots[index-1]['duration'])
            label = f'x{index}'
            graph.append(f'[{previous}][{index}:v]xfade=transition=fade:duration={cross}:offset={clock}[{label}]')
            previous = label
        ffmpeg(*inputs, '-filter_complex_threads', '1', '-filter_complex', ';'.join(graph),
               '-map', f'[{previous}]', '-t', duration, '-an', '-c:v', 'libx264',
               '-threads', '2', '-preset', 'fast', '-crf', '22', '-maxrate', '1800k',
               '-bufsize', '3600k', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
               '-level', '3.1', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
               '-movflags', '+faststart', silent)
    if abs(float(probe(silent)['format']['duration']) - duration) > .1:
        raise RuntimeError('Rendered silent movie has the wrong duration')
    json_write(cache, {'fingerprint': fingerprint, 'duration': duration,
                      'sha256': sha256(silent)})
    return silent


def envelope_min(envelope, start, end, floor, attack=.5, release=.8):
    """Apply an index-based duck without allocating a full-duration time vector."""
    count = envelope.shape[0]
    first, last = max(0, round(start * RATE)), min(count, round(end * RATE))
    if last <= first:
        return
    attack_first = max(0, round((start - attack) * RATE))
    release_last = min(count, round((end + release) * RATE))
    if first > attack_first:
        ramp = np.linspace(1, floor, first-attack_first, dtype=np.float32)
        np.minimum(envelope[attack_first:first], ramp, out=envelope[attack_first:first])
    np.minimum(envelope[first:last], floor, out=envelope[first:last])
    if release_last > last:
        ramp = np.linspace(floor, 1, release_last-last, dtype=np.float32)
        np.minimum(envelope[last:release_last], ramp, out=envelope[last:release_last])


def decode_track(track, index, role, duration):
    source = source_file(track['file'])
    length = float(track['length'])
    raw = WORK / f'audio-{role}-{index:02d}.f32'
    inputs = ['-ss', str(float(track.get('in', 0)))]
    if track.get('loop'):
        inputs = ['-stream_loop', '-1', *inputs]
    inputs += ['-i', str(source), '-t', str(length)]
    filters = []
    if role in {'voice', 'archival'} and track.get('normalize', True):
        filters.append('loudnorm=I=-18:TP=-2:LRA=11')
    fade_in = max(0, min(float(track.get('fadeIn', 1.5 if role == 'music' else .06)), length/3))
    fade_out = max(0, min(float(track.get('fadeOut', 3 if role == 'music' else .12)), length/3))
    if fade_in:
        filters.append(f'afade=t=in:st=0:d={fade_in:.8f}')
    if fade_out:
        filters.append(f'afade=t=out:st={length-fade_out:.8f}:d={fade_out:.8f}')
    filters.append(f"volume={float(track.get('gain', 1)):.10f}")
    ffmpeg(*inputs, '-vn', '-af', ','.join(filters), '-ar', RATE, '-ac', '2',
           '-f', 'f32le', raw)
    # File-backed arrays bound memory even for the six-minute score.
    data = np.memmap(raw, dtype='<f4', mode='r').reshape(-1, 2)
    offset = round(float(track.get('at', 0)) * RATE)
    if data.shape[0] < min(round(length*RATE), round((duration-track.get('at', 0))*RATE)) - RATE//10:
        raise RuntimeError(f"Audio source {track['id']} ended before its requested length; trim or enable loop")
    return data, offset, {'id': track['id'], 'role': role, 'start': track.get('at', 0),
        'duration': length, 'sourceIn': track.get('in', 0), 'source': track['file'],
        'sha256': sha256(source), 'gain': track.get('gain', 1),
        'normalized': role in {'voice', 'archival'} and track.get('normalize', True)}


def build_audio(plan, duration, silent):
    tracks = [dict(track, role=track.get('role', 'voice')) for track in plan.get('audio', [])]
    tracks += [dict(track, role='effect') for track in plan.get('effects', [])]
    music = plan.get('music', [])
    if isinstance(music, dict):
        music = [music]
    music = [dict(track, role='music', id=track.get('id', f'music-{index}'))
             for index, track in enumerate(music)]
    total = round(duration * RATE)
    raw_mix = WORK / 'documentary-mix.f32'
    mix = np.memmap(raw_mix, dtype='<f4', mode='w+', shape=(total, 2))
    mix[:] = 0
    duck = np.ones(total, dtype=np.float32)
    floor = 10 ** (-float(plan.get('musicDuckDb', 14)) / 20)
    for track in tracks:
        if track['role'] in {'voice', 'archival'}:
            envelope_min(duck, float(track['at']), float(track['at'])+float(track['length']), floor)
    for interval in plan.get('silenceMusic', []):
        if isinstance(interval, (list, tuple)):
            start, end = map(float, interval)
        else:
            start = float(interval.get('start', interval.get('at', 0)))
            end = float(interval.get('end', start + interval.get('length', 0)))
        envelope_min(duck, start, end, 0, .35, 1.0)

    records = []
    block_size = RATE * 4
    for index, track in enumerate(music + tracks):
        role = track['role']
        data, offset, record = decode_track(track, index, role, duration)
        count = min(data.shape[0], total-offset)
        for start in range(0, count, block_size):
            end = min(count, start+block_size)
            chunk = np.array(data[start:end], dtype=np.float32, copy=True)
            if role == 'music':
                chunk *= duck[offset+start:offset+end, None]
            mix[offset+start:offset+end] += chunk
        records.append(record)
        del data
        print(f"Mixed {role}: {track['id']} @ {track.get('at', 0):g}s", flush=True)
    mix.flush()
    peak = 0.0
    for start in range(0, total, block_size):
        peak = max(peak, float(np.max(np.abs(mix[start:start+block_size]))))
    del mix, duck
    target = {'integrated': -16, 'truePeak': -1.5, 'lra': 11}
    target.update(plan.get('mastering', {}))
    raw_input = ['-f', 'f32le', '-ar', RATE, '-ac', '2', '-i', raw_mix]
    measurement = loudness(raw_input, target)
    if measurement.get('input_i') in {'-inf', 'inf'}:
        raise RuntimeError('The audio mix is silent or invalid')
    af = (f"loudnorm=I={target['integrated']}:TP={target['truePeak']}:LRA={target['lra']}:"
          f"measured_I={measurement['input_i']}:measured_TP={measurement['input_tp']}:"
          f"measured_LRA={measurement['input_lra']}:measured_thresh={measurement['input_thresh']}:"
          f"offset={measurement['target_offset']}:linear=true:print_format=json")
    master = WORK / 'master.mp4'
    command = ['ffmpeg', '-hide_banner', '-y', '-i', str(silent), *map(str, raw_input),
        '-map', '0:v:0', '-map', '1:a:0', '-af', af, '-ar', str(RATE), '-ac', '2',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(duration),
        '-movflags', '+faststart', str(master)]
    result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    final_measurement = extract_loudness(result.stderr.decode(errors='replace'))
    json_write(WORK / 'mastering.json', {'target': target, 'premixPeakLinear': peak,
        'firstPass': measurement, 'secondPass': final_measurement})
    return master, records, {'target': target, 'premixPeakLinear': peak,
        'firstPass': measurement, 'secondPass': final_measurement}


def build_hls(master):
    stage = WORK / 'hls-staging'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    ffmpeg('-i', master, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
           '-tag:v', 'avc1', '-f', 'hls', '-hls_time', '8', '-hls_playlist_type', 'vod',
           '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4',
           '-hls_flags', 'independent_segments', '-hls_segment_filename',
           stage / 'segment-%03d.m4s', stage / 'index.m3u8')
    files = sorted(path for path in stage.iterdir() if path.is_file())
    if not files or any(path.stat().st_size > HOST_LIMIT for path in files):
        raise RuntimeError('An HLS asset exceeds the hosting limit')
    playlist = (stage / 'index.m3u8').read_text()
    if '#EXT-X-ENDLIST' not in playlist or '#EXT-X-MAP:URI="init.mp4"' not in playlist:
        raise RuntimeError('The HLS VOD is incomplete')
    destination = OUTPUT / 'v6'
    if destination.exists():
        shutil.rmtree(destination)
    shutil.move(str(stage), str(destination))
    return {'src': './assets/prologue/v6/index.m3u8', 'width': WIDTH, 'height': HEIGHT,
        'segmentSeconds': 8, 'audioBitrate': 192000, 'type': 'VOD fMP4',
        'files': [metadata(destination/path.name, 'v6/'+path.name) for path in files],
        'totalBytes': sum(path.stat().st_size for path in destination.iterdir() if path.is_file())}


def build_fallback(master, duration):
    target = WORK / 'fallback.mp4'
    # Leave explicit margin for MP4 indexing and AAC frame rounding.
    bitrate = min(1200000, max(100000, int((FALLBACK_LIMIT * .965 * 8 / duration - 80000) * .98)))
    passlog = WORK / 'fallback-pass'
    for attempt in range(2):
        common = ['-i', master, '-map', '0:v:0', '-vf', 'scale=960:540:flags=lanczos',
            '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-b:v', bitrate,
            '-maxrate', int(bitrate*1.4), '-bufsize', int(bitrate*2.8),
            '-profile:v', 'high', '-level', '3.1', '-pix_fmt', 'yuv420p',
            '-g', '48', '-keyint_min', '48', '-sc_threshold', '0', '-passlogfile', passlog,
            '-t', duration]
        ffmpeg(*common, '-pass', '1', '-an', '-f', 'null', os.devnull)
        ffmpeg(*common, '-pass', '2', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '80k',
               '-ar', RATE, '-ac', '2', '-movflags', '+faststart', target)
        if target.stat().st_size < FALLBACK_LIMIT:
            break
        bitrate = int(bitrate * FALLBACK_LIMIT / target.stat().st_size * .95)
    if target.stat().st_size >= FALLBACK_LIMIT:
        raise RuntimeError('Fallback still exceeds24MiB after constrained encoding')
    info = probe(target)
    if abs(float(info['format']['duration']) - duration) > .1:
        raise RuntimeError('The fallback movie has the wrong duration')
    destination = OUTPUT / 'relic-prologue-v6.mp4'
    target.replace(destination)
    return {**metadata(destination), 'src': './assets/prologue/relic-prologue-v6.mp4',
            'width': 960, 'height': 540, 'audioBitrate': 80000, 'videoBitrate': bitrate}


def main():
    global OUTPUT, WORK
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=ROOT/'tools/film/scripts/prologue-edit-v6.json')
    parser.add_argument('--audio-only', action='store_true')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--work', type=Path, default=WORK)
    parser.add_argument('--skip-fallback', action='store_true')
    args = parser.parse_args()
    OUTPUT = args.output.resolve()
    WORK = args.work.resolve()
    plan = json.loads(args.plan.read_text())
    shots = plan.get('shots', [])
    if not shots:
        raise ValueError('At least one shot is required')
    cross = positive(plan.get('crossfadeSeconds', .75), 'crossfadeSeconds')
    duration = sum(positive(shot['duration'], f"shot {shot.get('id', '?')} duration") for shot in shots)
    if any(float(shot['duration']) <= cross for shot in shots):
        raise ValueError('Each shot must be longer than its crossfade')
    # Preflight every input before touching any published asset.
    for shot in shots:
        if shot.get('file'):
            path = source_file(shot['file'])
            if float(shot.get('in', 0)) < 0 or float(shot.get('in', 0)) >= float(probe(path)['format']['duration']):
                raise ValueError(f"Invalid source start for {shot['id']}")
    music = plan.get('music', [])
    if isinstance(music, dict):
        music = [music]
    for track in music:
        track.setdefault('at', 0)
        path = source_file(track['file'])
        available = float(probe(path)['format']['duration']) - float(track.get('in', 0))
        track.setdefault('length', duration-float(track['at']) if track.get('loop') else min(available, duration-float(track['at'])))
    plan['music'] = music
    for group in ['audio', 'effects', 'music']:
        for index, track in enumerate(plan.get(group, [])):
            track.setdefault('id', f'{group}-{index}')
            source_file(track['file'])
            length = positive(track['length'], f"{track['id']} length")
            at = float(track.get('at', 0))
            if at < 0 or at+length > duration+.01:
                raise ValueError(f"Audio {track['id']} is outside the movie")
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    silent = build_visuals(shots, duration, cross, args.audio_only)
    master, records, mastering = build_audio(plan, duration, silent)
    if abs(float(probe(master)['format']['duration']) - duration) > .1:
        raise RuntimeError('The mastered movie has the wrong duration')
    hls = build_hls(master)
    fallback = None if args.skip_fallback else build_fallback(master, duration)
    poster = OUTPUT / 'poster-v6.jpg'
    poster_at = min(max(float(plan.get('posterAt', 25)), 0), max(0, duration-.1))
    ffmpeg('-ss', poster_at, '-i', master, '-frames:v', '1', '-vf', 'scale=1280:720', '-q:v', '3', poster)
    primary = fallback or {'bytes': None, 'sha256': None, 'width': WIDTH, 'height': HEIGHT}
    encoding = {'version': 6, 'duration': duration, 'fps': FPS,
        'videoCodec': 'H.264', 'audioCodec': 'AAC', 'crossfadeSeconds': cross,
        'bytes': primary['bytes'], 'sha256': primary['sha256'],
        'width': primary['width'], 'height': primary['height'],
        'fallback': fallback, 'hls': hls, 'poster': metadata(poster),
        'audioSources': [record for record in records if record['role'] != 'music'],
        'musicSources': [record for record in records if record['role'] == 'music'],
        'musicCredits': plan.get('musicCredits', [{key: track[key] for key in
            ['id', 'credit', 'license', 'sourcePage'] if key in track} for track in music]),
        'musicDuckDb': float(plan.get('musicDuckDb', 14)),
        'silenceMusic': plan.get('silenceMusic', []), 'mastering': mastering,
        'master': {'workPath': str(master.relative_to(ROOT)) if master.is_relative_to(ROOT) else str(master), 'bytes': master.stat().st_size,
                   'sha256': sha256(master), 'width': WIDTH, 'height': HEIGHT, 'audioBitrate': 192000},
        'editPlanSha256': sha256(args.plan),
        'historicalTreatment': 'Existing footage edited with dissolves. Sources and rights are documented separately. No historical voices or camera recordings are synthesized by this builder.'}
    json_write(OUTPUT/'encoding-v6.json', encoding)
    print(json.dumps({'duration': duration, 'fallbackBytes': primary['bytes'],
        'hlsFiles': len(hls['files']), 'hlsBytes': hls['totalBytes'],
        'encoding': str(OUTPUT/'encoding-v6.json')}), flush=True)


if __name__ == '__main__':
    main()
