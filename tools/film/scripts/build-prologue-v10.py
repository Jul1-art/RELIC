"""Render documentary editions from checked V9 HLS, credited assets and stock narration.

Outputs use the operating system local application cache, outside Documents.
Use --stage picture while narration is rendering, then --stage audio (or all).
Delivery metadata is published separately after QA. No source is auto-downloaded.
Requires PyAV, NumPy and FFmpeg/libx264/AAC; optional imageio-ffmpeg locates FFmpeg.
"""
from __future__ import annotations
import argparse
import concurrent.futures
from fractions import Fraction
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess

import av
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
EDITION, RELEASE = 10, 'v10-0-hd50'
FPS, RATE, WIDTH, HEIGHT, SCALE, TICKS = 50, 48000, 1920, 1080, 12800, 256
DEFAULT_WORK = (Path(os.environ['LOCALAPPDATA'])/'Codex/task-work/relic-film-production/v10'
                if os.name == 'nt' and os.environ.get('LOCALAPPDATA')
                else Path(os.environ.get('XDG_CACHE_HOME', Path.home()/'.cache'))/'relic-film-production/v10')


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda: f.read(1024*1024), b''):
            h.update(data)
    return h.hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def run(exe, *args, cwd=None):
    result = subprocess.run([str(exe), '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)],
                            cwd=cwd, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-5000:])


def utility():
    spec = importlib.util.spec_from_file_location('film_v9_transport', ROOT/'tools/film/scripts/reorder-prologue-v9.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def encode(exe, inputs, target, duration, filters, template, complex_filter=False):
    context = template.codec_context
    primaries, trc, matrix = context.color_primaries, context.color_trc, context.colorspace
    tail = (f'fps={FPS},tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame={round(duration*FPS)},'
            f'setpts=N/({FPS}*TB),format=yuv420p,setsar=1,'
            f'setparams=range=limited:field_mode=prog:chroma_location=left:color_primaries={primaries}:color_trc={trc}:colorspace={matrix}')
    graph = filters + (',' if filters else '') + tail
    if complex_filter:
        filtering = ['-filter_complex_threads', 1, '-filter_complex', graph+'[picture]', '-map', '[picture]']
    else:
        filtering = ['-vf', graph]
    run(exe, *inputs, '-an', *filtering, '-frames:v', round(duration*FPS), '-map_metadata', -1,
        '-c:v', 'libx264', '-threads', 2, '-preset', 'fast', '-crf', 23,
        '-maxrate', 3000000, '-bufsize', 6000000, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
        '-g', 100, '-keyint_min', 100, '-sc_threshold', 0, '-x264-params', 'repeat-headers=1:open-gop=0',
        '-color_primaries', primaries, '-color_trc', trc, '-colorspace', matrix, '-color_range', 'tv',
        '-chroma_sample_location', 'left',
        '-r', FPS, '-video_track_timescale', SCALE, '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', target)
    with av.open(str(target)) as c:
        stream = c.streams.video[0]
        if stream.codec_context.extradata != context.extradata:
            raise ValueError(f'{target.name}: H.264 parameter sets differ from the retained source')
        packets = [p for p in c.demux(stream) if p.dts is not None and p.size]
        if len(packets) != round(duration*FPS) or packets[0].dts != 0 or not packets[0].is_keyframe:
            raise ValueError(f'{target.name}: wrong frame count or decode origin')
    return packets


def picture(plan, work, exe, helper):
    original_plan = load(ROOT/'tools/film/reference/prologue-edit-v9-source.json')
    source_hash = helper.verify_source((ROOT/'intro/assets/prologue/v9-0-hd50').resolve(),
                                       ROOT/'intro/assets/prologue/encoding-v9-0-source.json')
    master = work.parent/'v9-chronology/video-master-v9.mp4'
    if not master.is_file():
        master = work/'video-master-v9.mp4'
        helper.remux(ROOT/'intro/assets/prologue/v9-0-hd50/video/index.m3u8', master, 'video')
    with av.open(str(master)) as c:
        template = c.streams.video[0]
        packets = [p for p in c.demux(template) if p.dts is not None and p.size]
    if len(packets) != 28450:
        raise ValueError('Original source frame count changed')
    predecessors = {s['start']: original_plan['shots'][i-1] if i else None for i, s in enumerate(original_plan['shots'])}
    folder = work/'picture'; folder.mkdir(exist_ok=True)
    prepared = []
    asset_hashes = {x['file']: x['sha256'] for x in load(ROOT/f'tools/film/scripts/prologue-sources-v{EDITION}.json')['assets']}
    previous = None
    for shot in plan['shots']:
        item = {'shot': shot, 'copy': False, 'repair': False}
        source_start = shot.get('sourceStart', -1)
        source_end = source_start + shot.get('sourceDuration', 0)
        first, last = round(source_start*FPS), round(source_end*FPS)
        copyable = (shot['source'] == 'v9-0' and shot['sourceDuration'] == shot['duration']
                    and abs(first/FPS-source_start) < 1e-8 and 0 <= first < last <= len(packets)
                    and packets[first].is_keyframe and (last == len(packets) or packets[last].is_keyframe))
        if copyable:
            item.update(copy=True, first=first, last=last)
            changed = shot['start'] > 0 and not (previous and previous.get('source') == 'v9-0'
                      and abs(previous['sourceStart']+previous['sourceDuration']-source_start) < 1e-8)
            if changed:
                predecessor = predecessors.get(source_start)
                incoming = float(predecessor.get('transitionOut', original_plan.get('crossfadeSeconds', .75))) if predecessor else 0
                item.update(repair=True, incoming=incoming)
        prepared.append(item)
        previous = shot

    def render(item):
        s = item['shot']
        if s['source'] == 'rendered-v10':
            cached = (work/s['file']).resolve()
            receipt = load(cached.with_suffix('.json'))
            if sha(cached) != receipt['sha256']:
                raise ValueError('Checked V10 derivative changed: '+s['id'])
            with av.open(str(cached)) as c:
                stream = c.streams.video[0]
                if stream.codec_context.extradata != template.codec_context.extradata:
                    raise ValueError('Retained V10 codec parameters differ')
                item['packets'] = [p for p in c.demux(stream) if p.dts is not None and p.size]
            if len(item['packets']) != round(s['duration']*FPS):
                raise ValueError('Retained V10 frame count differs')
            return item
        if item['copy'] and not item['repair']:
            return item
        duration = 2 if item['repair'] else s['duration']
        target = folder/(s['id']+('-repair' if item['repair'] else '')+'.mp4')
        receipt = target.with_suffix('.json')
        signature = {'shot': s, 'repair': item['repair'], 'incoming': item.get('incoming'),
                     'sourceReceipt': source_hash, 'renderer': 12, 'template': hashlib.sha256(template.codec_context.extradata).hexdigest()}
        if s['source'] == 'asset':
            expected = asset_hashes[s['file']]
            source = work/s['file']
            if source.is_file() and sha(source) != expected:
                raise ValueError('Production source checksum changed: '+s['file'])
            signature['sourceAssetSha256'] = expected
        if target.is_file() and receipt.is_file():
            saved = load(receipt)
            if saved.get('input') == signature and saved.get('sha256') == sha(target):
                with av.open(str(target)) as c:
                    stream = c.streams.video[0]
                    if stream.codec_context.extradata != template.codec_context.extradata:
                        raise ValueError('Cached codec parameters changed')
                    item['packets'] = [p for p in c.demux(stream) if p.dts is not None and p.size]
                return item
        fit = f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2'
        if item['repair']:
            clean = 2-item['incoming']
            if clean <= 0:
                raise ValueError('Old dissolve exceeds repair span')
            inputs = ['-ss', s['sourceStart']+item['incoming'], '-i', master]
            filters = f'trim=duration={clean},setpts=(PTS-STARTPTS)*2/{clean},fade=t=in:st=0:d=0.12'
        elif s['source'] == 'v9-0':
            inputs = ['-ss', s['sourceStart'], '-i', master]
            filters = f'trim=duration={s["sourceDuration"]},setpts=(PTS-STARTPTS)*{duration}/{s["sourceDuration"]},{fit},fade=t=in:st=0:d=0.16'
        elif s['source'] == 'black':
            inputs = ['-f', 'lavfi', '-i', f'color=c=black:s={WIDTH}x{HEIGHT}:r={FPS}']
            filters = ''
        elif s['source'] == 'bridge':
            inputs = ['-ss', 457, '-i', master, '-ss', 548, '-i', master]
            filters = ('[0:v]trim=duration=4,setpts=PTS-STARTPTS,fps=50,format=yuv420p[a];'
                       '[1:v]trim=duration=4,setpts=PTS-STARTPTS,fps=50,format=yuv420p[b];'
                       '[a][b]xfade=transition=fade:duration=2:offset=2')
        elif s.get('still'):
            if not (work/s['file']).is_file():
                raise FileNotFoundError('Restore the credited original to the local cache: '+s['file'])
            inputs = ['-loop', 1, '-framerate', FPS, '-i', work/s['file']]
            filters = (f'{fit},zoompan=z=\'1+0.025*on/{round(duration*FPS)}\':'
                       f'x=\'iw/2-iw/zoom/2\':y=\'ih/2-ih/zoom/2\':d=1:s=1920x1080:fps=50,'
                       'fade=t=in:st=0:d=0.35')
        else:
            inputs = ['-ss', s['in'], '-i', work/s['file']]
            filters = (f'trim=duration={s["sourceDuration"]},setpts=(PTS-STARTPTS)*{duration}/{s["sourceDuration"]},'
                       f'{fit}'+(f',fade=t=in:st=0:d={s.get("fadeIn",.25)}' if s.get('fadeIn',.25)>0 else ''))
        if s.get('fadeOut'):
            filters += f',fade=t=out:st={duration-s["fadeOut"]}:d={s["fadeOut"]}'
        item['packets'] = encode(exe, inputs, target, duration, filters, template, s['source'] == 'bridge')
        write(receipt, {'input': signature, 'sha256': sha(target)})
        print(json.dumps({'stage': 'picture-shot', 'id': s['id'], 'duration': duration}), flush=True)
        return item

    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        prepared = list(pool.map(render, prepared))
    output = work/f'picture-master-v{EDITION}.mp4'
    copied = reencoded = 0
    with av.open(str(master)) as original, av.open(str(output), 'w', options={'movflags': '+faststart'}) as dest:
        stream = dest.add_stream_from_template(original.streams.video[0]); stream.time_base = Fraction(1, SCALE)
        for item in prepared:
            s = item['shot']; count = round(s['duration']*FPS)
            for i in range(count):
                encoded = not item['copy'] or (item['repair'] and i < 100)
                packet = item['packets'][i] if encoded else packets[item['first']+i]
                new = av.Packet(bytes(packet)); new.dts = (round(s['start']*FPS)+i)*TICKS
                new.pts = new.dts + packet.pts-packet.dts; new.duration = TICKS; new.time_base = Fraction(1, SCALE)
                new.is_keyframe = packet.is_keyframe; new.stream = stream; dest.mux(new)
                if encoded: reencoded += 1
                else: copied += 1
    helper.DURATION = plan['duration']; helper.FRAME_COUNT = round(plan['duration']*FPS)
    release = work/RELEASE
    helper.package(exe, output, release/'video', 'video')
    report = {'revision': plan['revision'], 'sourceEncodingSha256': source_hash,
              'copiedFrames': copied, 'encodedFrames': reencoded, **helper.validate_video(release/'video/index.m3u8')}
    write(work/'picture-report.json', report)
    print(json.dumps({'stage': 'picture-complete', **report}), flush=True)


def decoded(exe, source, path):
    receipt = path.with_suffix(path.suffix+'.json')
    signature = {'sourceSha256':sha(source),'sampleRate':RATE,'channels':2}
    if not (path.is_file() and receipt.is_file() and load(receipt) == signature):
        run(exe, '-i', source, '-vn', '-ar', RATE, '-ac', 2, '-f', 'f32le', path)
        write(receipt,signature)
    return np.memmap(path, dtype='<f4', mode='r').reshape(-1, 2)


def fade(data, lead=.02, tail=.04):
    data = np.array(data, copy=True)
    n = min(round(lead*RATE), len(data)//2)
    if n: data[:n] *= np.linspace(0, 1, n, dtype=np.float32)[:, None]
    n = min(round(tail*RATE), len(data)//2)
    if n: data[-n:] *= np.linspace(1, 0, n, dtype=np.float32)[:, None]
    return data


def audio(plan, work, exe, helper):
    narration = load(work/'narration/manifest.json')
    if not narration.get('allLinesFit'):
        raise ValueError('A narration paragraph exceeds its picture slot')
    script = load(ROOT/f'tools/film/scripts/prologue-narration-v{EDITION}.json')
    if len(narration['lines']) != 2*len(script['lines']):
        raise ValueError('Narration manifest is incomplete')
    for row in narration['lines']:
        if row['text'] != next(x for x in script['lines'] if x['id'] == row['id'])['text'][row['language']]:
            raise ValueError('Narration text differs from the active script')
        if sha(work/row['file']) != row['sha256']:
            raise ValueError('Narration checksum mismatch')
    seconds = plan['duration']; total = round(seconds*RATE); index = {s['id']: s for s in plan['shots']}
    source_music = decoded(exe, work/'assets/helios.oga', work/'helios.f32')
    music = np.zeros((total, 2), dtype=np.float32)
    music_edits = []

    def add_music(at, source_in, length, fi, fo):
        begin, first, count = round(at*RATE), round(source_in*RATE), round(length*RATE)
        data = fade(source_music[first:first+count], fi, fo) * .52
        if len(data) < count:
            raise ValueError('Music source interval exceeds the recording')
        music[begin:begin+count] += data
        music_edits.append({'at': at, 'in': source_in, 'length': length, 'fadeIn': fi, 'fadeOut': fo, 'file': 'assets/helios.oga'})

    # The unchanged opening ends at 88. New music is phase matched to its source
    # clock and crossfaded over two seconds, rather than restarting the score.
    closing = index['mars-approach']['start']-3 if EDITION >= 11 else seconds-86
    add_music(86, 70, min(288, closing+6-86), 2, 6)
    cursor = 368
    while cursor < closing:
        span = min(183, closing+6-cursor)
        add_music(cursor, 171, span, 6, 6)
        cursor += span-6
    music_end = plan.get('musicEnd',seconds)
    source_in = min(200, len(source_music)/RATE-(music_end-closing))
    add_music(closing, source_in, music_end-closing, 6, plan.get('musicFinalFadeSeconds',8))
    # Protect the respectful Challenger passage from the heroic score.
    for interval in plan['silenceMusic']:
        a, b = round(interval['start']*RATE), round(interval['end']*RATE)
        music[max(0,a):min(total,b)] *= 0
        for boundary, inward in [(a, False), (b, True)]:
            n = round(.4*RATE)
            if 0 <= boundary-n and boundary+n < total:
                if inward: music[boundary:boundary+n] *= np.linspace(0,1,n)[:,None]
                else: music[boundary-n:boundary] *= np.linspace(1,0,n)[:,None]
    report = {'revision': plan['revision'], 'duration': seconds, 'musicEdits': music_edits,
              'narrationManifestSha256': sha(work/'narration/manifest.json'), 'languages': {}}
    archives = plan['archivalAudio']
    for language in ['en', 'fr']:
        source_master = work.parent/f'v9-chronology/audio-master-v9-{language}.m4a'
        if not source_master.is_file():
            source_master = work/f'original-{language}.m4a'
            helper.remux(ROOT/f'intro/assets/prologue/v9-0-hd50/audio-{language}/index.m3u8', source_master, 'audio')
        original = decoded(exe, source_master, work/f'original-{language}.f32')
        mix = np.array(music, copy=True); duck = np.ones(total, dtype=np.float32)
        spoken = [r for r in narration['lines'] if r['language'] == language]

        def envelope(start, end, level=.16, attack=.35, release=1.8):
            a, b = round(start*RATE), round(end*RATE); left = max(0, a-round(attack*RATE)); right = min(total,b+round(release*RATE))
            duck[a:b] = np.minimum(duck[a:b], level)
            if a > left: duck[left:a] = np.minimum(duck[left:a], np.linspace(1, level, a-left))
            if right > b: duck[b:right] = np.minimum(duck[b:right], np.linspace(level, 1, right-b))

        for row in spoken: envelope(row['at'], row['end'])
        for archive in archives:
            envelope(archive['at'], archive['at']+archive['length'], .06)
        mix *= duck[:, None]
        opening_end = round(88*RATE)
        mix[:round(86*RATE)] = original[:round(86*RATE)]
        mix[round(86*RATE):opening_end] += original[round(86*RATE):opening_end] * np.linspace(1,0,2*RATE)[:,None]
        for row in spoken:
            samples = decoded(exe, work/row['file'], work/'narration'/(row['id']+'-'+language+'.f32'))
            a = round(row['at']*RATE)
            mix[a:a+len(samples)] += np.array(samples)*.84
        for archive in archives:
            source_audio = original
            if archive.get('file'):
                asset = next(a for a in load(ROOT/f'tools/film/scripts/prologue-sources-v{EDITION}.json')['assets'] if a['file']==archive['file'])
                if sha(work/archive['file']) != asset['sha256']: raise ValueError('Historical signal checksum changed')
                source_audio = decoded(exe,work/archive['file'],work/(archive['id']+'.f32'))
            a, first, count = round(archive['at']*RATE), round(archive['sourceStart']*RATE), round(archive['length']*RATE)
            mix[a:a+count] += fade(source_audio[first:first+count], .06, .18) * archive.get('gain', 1)
        if 'musicEnd' in plan:
            assert all(row['end'] <= index['relic']['start'] for row in spoken),'Narration overlaps silent brand card'
            assert all(row['at']+row['length'] <= index['relic']['start'] for row in archives),'Archive overlaps silent brand card'
            assert not np.any(mix[round(index['relic']['start']*RATE):]),'Final brand card must be silent'

        raw = work/f'mix-{language}.f32'; mix.astype('<f4').tofile(raw)
        peak = float(np.max(np.abs(mix))); del mix, duck
        target = work/f'master-{language}.m4a'
        # Two-pass loudness normalization retains the sample clock and dynamics.
        measure = subprocess.run([str(exe),'-hide_banner','-f','f32le','-ar',str(RATE),'-ac','2','-i',str(raw),
                                  '-af','loudnorm=I=-18:TP=-3:LRA=11:print_format=json','-f','null','-'],capture_output=True,check=True)
        log = measure.stderr.decode(errors='replace'); measured = json.loads(log[log.rfind('{'):log.rfind('}')+1])
        filt = ('loudnorm=I=-18:TP=-3:LRA=11:linear=true:print_format=json:'
                f'measured_I={measured["input_i"]}:measured_TP={measured["input_tp"]}:measured_LRA={measured["input_lra"]}:'
                f'measured_thresh={measured["input_thresh"]}:offset={measured["target_offset"]}')
        run(exe,'-f','f32le','-ar',RATE,'-ac',2,'-i',raw,'-af',filt,'-ar',RATE,'-ac',2,
            '-c:a','aac','-b:a',192000,'-t',seconds,'-map_metadata',-1,'-movflags','+faststart',target)
        helper.DURATION = seconds; helper.PCM_SAMPLES = total
        directory = work/RELEASE/f'audio-{language}'
        helper.package(exe,target,directory,'audio')
        final = helper.validate_audio(directory/'index.m3u8')
        if final['samplePeak'] >= 1 or abs(final['firstAudioPtsSeconds']) > 1e-8:
            raise ValueError('Final AAC clipped or changed its zero sample origin')
        report['languages'][language] = {**final,'masterSha256':sha(target),'premixPeak':peak,'normalizationInput':measured,
                                        'narration':len(spoken),'stockVoice':'af_heart' if language=='en' else 'ff_siwis'}
        write(work/'audio-report.json',report)
        print(json.dumps({'stage':'audio-complete','language':language,**final}),flush=True)
    report['complete'] = True; write(work/'audio-report.json',report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edition', type=int, choices=[10,11], default=10)
    parser.add_argument('--stage',choices=['all','picture','audio'],default='all')
    parser.add_argument('--work',type=Path)
    args = parser.parse_args()
    global EDITION, RELEASE
    EDITION = args.edition
    work = (args.work or DEFAULT_WORK.parent/f'v{EDITION}').resolve(); work.mkdir(parents=True,exist_ok=True)
    plan = load(ROOT/f'tools/film/scripts/prologue-edit-v{EDITION}.json')
    RELEASE = plan.get('release',f'v{EDITION}-0-hd50')
    helper = utility(); exe = helper.ffmpeg_path(None)
    if args.stage in ['all','picture']: picture(plan,work,exe,helper)
    if args.stage in ['all','audio']: audio(plan,work,exe,helper)
    if (work/'picture-report.json').is_file() and (work/'audio-report.json').is_file():
        release = work/RELEASE
        for lang in ['en','fr']:
            text = (ROOT/f'intro/assets/prologue/v9-0-hd50/{lang}.m3u8').read_text(encoding='utf-8')
            (release/f'{lang}.m3u8').write_text(text,encoding='utf-8',newline='\n')
        files = [{'path':p.relative_to(work).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
                 for p in sorted(release.rglob('*')) if p.is_file()]
        if max(x['bytes'] for x in files) >= 25*1024*1024: raise ValueError('An HLS asset exceeds the static-host size limit')
        write(work/'report.json',{'revision':plan['revision'],'duration':plan['duration'],'picture':load(work/'picture-report.json'),
                                'audio':load(work/'audio-report.json'),'files':files,'bytes':sum(x['bytes'] for x in files)})
        print(json.dumps({'stage':'delivery-complete','files':len(files),'duration':plan['duration']}),flush=True)


if __name__ == '__main__':
    main()
