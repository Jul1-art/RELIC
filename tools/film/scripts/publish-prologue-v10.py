"""Install a verified V10 delivery and update each repository's own player data.

Requires the completed picture/audio and measured alignment reports in the local
production cache. It retains edition-specific labels and configuration. No API
configuration, private file or source download is copied between repositories.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess

import av
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
REVISION = '10.0-hd50'
RELEASE = 'v10-0-hd50'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2)+'\n'


def write(path, value):
    Path(path).write_text(dump(value), encoding='utf-8', newline='\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def chunks(text, maximum=100):
    clauses = re.split(r'(?<=[.!?;])\s+', text)
    result = []
    for clause in clauses:
        if len(clause) <= maximum:
            result.append(clause)
            continue
        words = clause.split(); current = []
        for word in words:
            if current and len(' '.join([*current,word])) > maximum:
                result.append(' '.join(current)); current = []
            current.append(word)
        if current: result.append(' '.join(current))
    assert ' '.join(result) == text
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,default=ROOT)
    parser.add_argument('--work',type=Path,required=True)
    args = parser.parse_args(); root = args.repo.resolve(); work = args.work.resolve()
    plan = read(ROOT/'tools/film/scripts/prologue-edit-v10.json')
    script = read(ROOT/'tools/film/scripts/prologue-narration-v10.json')
    report = read(work/'report.json'); alignment = read(work/'alignment-report.json')
    assert report['revision'] == REVISION and report['duration'] == plan['duration']
    assert alignment['passed'] and alignment['revision'] == REVISION
    assert report['picture']['fullDecodePassed'] and report['audio']['complete']
    assert len(report['files']) == 272
    for item in report['files']:
        path = work/item['path']
        assert path.is_relative_to(work) and path.stat().st_size == item['bytes'] and sha(path) == item['sha256'],item['path']
    reference = root/'tools/film/reference/prologue-player-v9-1.json'
    if reference.is_file():
        baseline = read(reference)
    else:
        text = subprocess.check_output(['git','show','HEAD:intro/prologue-data-v8.js'],cwd=root).decode('utf-8')
        baseline,_ = json.JSONDecoder().raw_decode(text.split('export const PROLOGUE_MEDIA=Object.freeze(',1)[1])
        assert baseline['revision'] == '9.1-hd50'
        write(reference,baseline)
    media = copy.deepcopy(baseline); duration = plan['duration']
    media['revision'] = REVISION; media['duration'] = duration
    media['hls'] = f'./assets/prologue/{RELEASE}/en.m3u8'
    for language in ['en','fr']:
        media['languages'][language]['hls'] = f'./assets/prologue/{RELEASE}/{language}.m3u8'
    old_scenes = {s['id']:s for s in baseline['scenes']}
    scene_index = {s['id']:s for s in plan['shots']}
    labels = {
        'gagarin': ('Yuri Gagarin · 12 April 1961','Youri Gagarine · 12 avril 1961'),
        'tereshkova': ('Valentina Tereshkova · 16 June 1963','Valentina Terechkova · 16 juin 1963'),
        'leonov': ('Alexei Leonov · 18 March 1965','Alexeï Leonov · 18 mars 1965'),
        'apollo8-orbit': ('Apollo 8 · 24 December 1968','Apollo 8 · 24 décembre 1968'),
        'apollo8-earthrise': ('Earthrise · Bill Anders, 1968','Earthrise · Bill Anders, 1968'),
        'voyager2-launch': ('Voyager 2 · 20 August 1977','Voyager 2 · 20 août 1977'),
        'voyager1-launch': ('Voyager 1 · 5 September 1977','Voyager 1 · 5 septembre 1977'),
        'huygens-descent': ('Huygens · 14 January 2005','Huygens · 14 janvier 2005'),
        'huygens-surface': ('Titan · Huygens surface view','Titan · Vue de la surface par Huygens'),
        'rosetta-comet': ('Comet 67P · Rosetta and Philae','Comète 67P · Rosetta et Philae'),
        'rosetta-descent': ('Rosetta · 30 September 2016','Rosetta · 30 septembre 2016'),
        'change4-wide': ('Chang’e 4 · 3 January 2019','Chang’e 4 · 3 janvier 2019'),
        'change4-site': ('Chang’e 4 landing site · LRO view','Site de Chang’e 4 · Vue par LRO')
    }
    media['scenes'] = []
    for shot in plan['shots']:
        row = copy.deepcopy(old_scenes.get(shot['id'],{'id':shot['id']}))
        row.update(start=shot['start'],end=shot['end'])
        row.pop('historicalRole',None)
        if shot['id'] in ['lunar-orbiter','mars','hardware']:
            row.pop('label',None)
        if shot['id'] in labels:
            row['label'] = dict(zip(['en','fr'],labels[shot['id']]))
        if shot['id'] in ['rosetta-comet','rosetta-descent','apollo8-orbit']:
            row['speaker'] = {'en':'Official scientific visualization','fr':'Visualisation scientifique officielle'}
        media['scenes'].append(row)
    spec = importlib.util.spec_from_file_location('clause_alignment',ROOT/'tools/film/scripts/synthesize-narration-v9.py')
    timing = importlib.util.module_from_spec(spec); spec.loader.exec_module(timing)
    narration = read(work/'narration/manifest.json')
    generated = []
    cue_tracks = {}
    for language in ['en','fr']:
        cues = [copy.deepcopy(c) for c in baseline['captions'][language] if c['end'] <= 88.9]
        for row in [r for r in narration['lines'] if r['language'] == language]:
            with av.open(str(work/row['file'])) as c:
                arrays = [f.to_ndarray().reshape(-1,2).astype(np.float32)/32768 for f in c.decode(audio=0)]
            samples = np.concatenate(arrays)
            parts = chunks(row['text'])
            aligned,decisions = timing.align_captions(samples,48000,parts,[len(x) for x in parts],row['at'],row['duration'])
            safe = {k:copy.deepcopy(v) for k,v in row.items() if k not in ['source','captions','subtitleBoundaryDecisions']}
            safe['file'] = 'production-inputs/'+row['file'].replace('\\','/')
            safe['captions'] = aligned; safe['subtitleBoundaryDecisions'] = decisions
            safe['subtitleTimingMethod'] = 'Approximate clause proportions refined at quiet regions of the actual paragraph waveform. The whole scene-bound paragraph has a verified delivery onset; no word-exact forced alignment is claimed.'
            for a in safe['captions']:
                a['textWeight'] = a.pop('phonemeWeight')
            generated.append(safe)
            for i,clause in enumerate(aligned,1):
                cues.append({'id':f'{row["id"]}-{i}','start':clause['start'],'end':clause['end'],'kind':'narration',
                             'title':{language:clause['text']}})
        for archive in plan['archivalAudio']:
            prefix = 'archive-'+archive['id']+'-'
            anchor = archive['shot']
            delta = scene_index[anchor]['start']-old_scenes[anchor]['start']
            for cue in baseline['captions'][language]:
                if cue['kind'] == 'quote' and cue['id'].startswith(prefix):
                    row = copy.deepcopy(cue); row['start'] += delta; row['end'] += delta; cues.append(row)
        cues.extend([
            {'id':'v2-to-von-braun-pause','start':111.5,'end':113,'kind':'visual','title':{'en':'','fr':''}},
            {'id':'flag-music-only','start':scene_index['moon-flag']['start'],'end':scene_index['moon-flag']['end'],'kind':'visual','title':{'en':'','fr':''}}
        ])
        cues.sort(key=lambda c:c['start']); complete = []; position = 0; gap = 0
        for cue in cues:
            assert cue['start'] >= position-1e-5,(language,cue['id'],position,cue['start'])
            if cue['start'] > position+1e-7:
                gap += 1
                complete.append({'id':f'quiet-v10-{gap}','start':round(position,6),'end':cue['start'],'kind':'visual','title':{'en':'','fr':''}})
            complete.append(cue); position = cue['end']
        if position < duration:
            complete.append({'id':'quiet-v10-ending','start':position,'end':duration,'kind':'visual','title':{'en':'','fr':''}})
        cue_tracks[language] = complete
    media['captions'] = cue_tracks
    destination = root/'intro/assets/prologue'/RELEASE
    destination.mkdir(parents=True,exist_ok=True)
    shutil.copytree(work/RELEASE,destination,dirs_exist_ok=True)
    source_path = root/'intro/assets/prologue/sources-v9.json'
    encoding_path = root/'intro/assets/prologue/encoding-v9-hd50.json'
    encoding_reference = encoding_path.with_name('encoding-v9-1-source.json')
    if not encoding_reference.exists():
        assert read(encoding_path)['revision'] == '9.1-hd50'
        shutil.copyfile(encoding_path,encoding_reference)
    encoding = read(encoding_reference)
    encoding.update(version=10,revision=REVISION,duration=duration,pictureFrames=round(duration*50),visualRenderer='checked-V9-packets-plus-credited-V10-edits')
    encoding['hls']['files'] = report['files']; encoding['hls']['totalBytes'] = report['bytes']
    encoding['hls']['languages'] = {l:f'./assets/prologue/{RELEASE}/{l}.m3u8' for l in ['en','fr']}
    encoding['editPlanSha256'] = sha(ROOT/'tools/film/scripts/prologue-edit-v10.json')
    encoding['narrationScriptSha256'] = sha(ROOT/'tools/film/scripts/prologue-narration-v10.json')
    encoding['narrationManifestSha256'] = report['audio']['narrationManifestSha256']
    encoding['narrationManifestRole'] = 'Current stock narration production manifest; complete audio validated against the delivered HLS.'
    encoding.pop('chronologyManifestSha256',None)
    encoding['originalSourceCrossfadeSeconds'] = encoding.pop('crossfadeSeconds',.75)
    encoding['transitionPolicy'] = 'Original source dissolves are retained. Changed entries use short clean fades; the Webb-to-reflection picture bridge uses a two-second crossfade and the closing score continues across it.'
    encoding['narration'] = {'synthetic':True,'engine':'Kokoro-82M v1.0 INT8 ONNX','runtime':'kokoro-onnx 0.6.1',
                             'voices':{'en':'af_heart','fr':'ff_siwis'},'paragraphsPerLanguage':len(script['lines']),
                             'historicalVoicesSynthesized':False,'allLinesFit':True}
    encoding['languages'] = copy.deepcopy(report['audio']['languages'])
    for language,row in encoding['languages'].items():
        row.update(sampleRate=48000,channels=2,bitrate=192000,duration=duration,
                   audioSources=[{'id':r['id'],'start':r['at'],'duration':r['duration'],'sha256':r['sha256'],'voice':r['voice']} for r in generated if r['language']==language])
    encoding['quality']['sourcePolicy'] = 'Unchanged checked V9 encoded pictures are retained where possible. Changed joins and the credited added archive photographs/films/official visualizations are encoded at 1080p50 without generated detail. Narration is rebuilt per scene, authentic historical speech is retained from checked source audio, and the licensed score is remixed with long crossfades. Original production inputs remain outside the repository in a local application cache.'
    encoding['quality']['deliveryValidation'] = report['picture']
    encoding['quality']['narrationAlignment'] = alignment
    encoding['quality'].pop('chronologicalRemix',None)
    write(encoding_path,encoding)
    sources_reference = source_path.with_name('sources-v9-1-source.json')
    if not sources_reference.is_file():
        assert read(source_path)['revision'] == '9.1-hd50'
        shutil.copyfile(source_path,sources_reference)
    sources = read(sources_reference)
    sources.update(version=10,revision=REVISION,checkedOn='2026-10-28',durationSeconds=duration,
                   editPlanSha256=encoding['editPlanSha256'],narrationScriptSha256=encoding['narrationScriptSha256'])
    sources['transport'].update(languages={l:f'{RELEASE}/{l}.m3u8' for l in ['en','fr']},totalBytes=report['bytes'],fileCount=len(report['files']),encodingManifestSha256=sha(encoding_path),sourcePolicy=encoding['quality']['sourcePolicy'])
    sources['paragraphTranscript'] = script['lines']; sources['editTimeline'] = plan['shots']
    sources['narration'].update(script='tools/film/scripts/prologue-narration-v10.json',scriptSha256=encoding['narrationScriptSha256'],
                               lines=generated,selectedLineIds=[r['id'] for r in script['lines']],allLinesFit=True,overflows=[],partial=False,
                               processing='Scene-bound stock Kokoro paragraphs, source text decoded as UTF-8. No completed narration is truncated or time-stretched. Actual HLS onsets are measured against each rendered paragraph.')
    sources['narration']['subtitleTimingMethod'] = generated[0]['subtitleTimingMethod']
    sources['narration']['runtime'] = {'engine':'kokoro-onnx','version':'0.6.1','backend':'ONNX Runtime CPU'}
    sources['captionTiming'] = generated[0]['subtitleTimingMethod']
    sources['captionPictureAlignment'] = {'paragraph':'von-braun-postwar','languages':['en','fr'],
                                          'v2CaptionEnd':111.5,'textFreePauseSeconds':1.5,'vonBraunCaptionStart':113,
                                          'vonBraunAudioStart':113,'measuredDeliveryLagSamples':0,
                                          'policy':'Both the scene-bound stock narration and its text begin at the von Braun picture. Every narration onset has been measured against the actual delivered AAC waveform.'}
    sources['archiveSubtitlePolicy'] = {'primary':'The six delivered genuine historical speech excerpts retain their complete selected clauses and bilingual captions.',
                                       'speechTracks':[r['id'] for r in plan['archivalAudio'] if r['id']!='sputnik-original-signal'],
                                       'fieldAudio':'A short genuine Sputnik signal is retained. Original soundtracks of added visuals are muted; no invented engine or impact sound is attributed to historical footage.'}
    sources['verifiedPictureIdentity'] = plan['shots']
    sources['musicContext'] = 'The licensed Helios score is remixed with multi-second crossfades. One closing passage spans Webb, the spoken transition, and the reflection on machines elsewhere in space. There is no hard music splice at the former epilogue boundary.'
    sources['audioTimeline'] = plan['archivalAudio']; sources['historicalAudioWindows'] = plan['archivalAudio']
    sources['musicTimeline'] = report['audio']['musicEdits']
    sources['musicOnlyScenes'] = [{'id':identity,'start':scene_index[identity]['start'],'end':scene_index[identity]['end']} for identity in plan['musicOnlyScenes']]
    sources['narrativeStructure'] = plan['editorialPolicy']
    sources['chronology'] = {'revision':REVISION,'policy':plan['editorialPolicy'],'activePlan':'tools/film/scripts/prologue-edit-v10.json'}
    sources['endingTreatment'] = 'A six-second crossfade and a spoken bridge introduce the closing reflection. The continuous final score covers Webb and this transition. There is no epilogue title. The reflection includes active and retired objects on the Moon, Mars, Titan, a comet, in orbit and in interstellar space.'
    sources['spaceXContext'] = 'Falcon Heavy STP-2 in 2019 and Falcon 9 / Sentinel-6 in 2020 precede Perseverance and Webb in 2021. The narration identifies SpaceX and its founder without moving the founding date into this flight chronology.'
    sources['currentAdditionalSources'].extend(read(ROOT/'tools/film/scripts/prologue-sources-v10.json')['assets'])
    sources['editorialChanges'].append('V10: synchronized von Braun audio; music-only Apollo flag; both Voyager launches and instruments before Enterprise; Tereshkova, Leonov, Apollo 8/Earthrise, Huygens and Chang’e 4; complete Rosetta descent and contact; spoken closing bridge without a title; hardware beyond the Moon and Mars; continuous closing music.')
    sources['sceneDates'] = {s['id']:copy.deepcopy(sources['sceneDates'].get(s['id'],{})) for s in plan['shots']}
    for s in plan['shots']:
        if 'eventDate' in s: sources['sceneDates'][s['id']]['eventDate'] = s['eventDate']
        sources['sceneDates'][s['id']].pop('historicalRole',None)
    write(source_path,sources)
    media['offline']['id'] = 'relic-documentary-v10-hd50-'+sha(encoding_path)[:20]
    (root/'intro/prologue-data-v8.js').write_text('/** V10 documentary: scene-bound bilingual narration and verified media clock. */\nexport const PROLOGUE_MEDIA=Object.freeze('+dump(media).rstrip()+'\n);\nexport const PROLOGUE=Object.freeze(PROLOGUE_MEDIA.captions.en);\n',encoding='utf-8',newline='\n')
    print(json.dumps({'repo':root.name,'revision':REVISION,'duration':duration,'shots':len(media['scenes']),'captions':{k:len(v) for k,v in cue_tracks.items()},'files':len(report['files'])}))


if __name__ == '__main__':
    main()
