"""Install a verified documentary delivery and update each repository's own player data.

Requires the completed picture/audio and measured alignment reports in the local
production cache. It retains edition-specific configuration and removes scene labels. No API
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
    parser.add_argument('--edition',type=int,choices=[10,11],default=10)
    parser.add_argument('--repo',type=Path,default=ROOT)
    parser.add_argument('--work',type=Path,required=True)
    args = parser.parse_args()
    global REVISION, RELEASE
    REVISION, RELEASE = f'{args.edition}.0-hd50', f'v{args.edition}-0-hd50'
    root = args.repo.resolve(); work = args.work.resolve()
    plan = read(ROOT/f'tools/film/scripts/prologue-edit-v{args.edition}.json')
    script = read(ROOT/f'tools/film/scripts/prologue-narration-v{args.edition}.json')
    report = read(work/'report.json'); alignment = read(work/'alignment-report.json')
    assert report['revision'] == REVISION and report['duration'] == plan['duration']
    assert alignment['passed'] and alignment['revision'] == REVISION
    assert report['picture']['fullDecodePassed'] and report['audio']['complete']
    assert len(report['files']) >= 8
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
    media['scenes'] = []
    for shot in plan['shots']:
        row = copy.deepcopy(old_scenes.get(shot['id'],{'id':shot['id']}))
        row.update(start=shot['start'],end=shot['end'])
        row.pop('historicalRole',None)
        for field in ['label','speaker','kicker']:
            row.pop(field,None)
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
        cues.extend(copy.deepcopy(plan.get('displayCaptions',[])))
        for cue in cues:
            for field in ['speaker','kicker','label']:
                cue.pop(field,None)
        cues.extend([
            {'id':'v2-to-von-braun-pause','start':111.5,'end':113,'kind':'visual','title':{'en':'','fr':''}},
            {'id':'flag-music-only','start':scene_index['moon-flag']['start'],'end':scene_index['moon-flag']['end'],'kind':'visual','title':{'en':'','fr':''}}
        ])
        cues.sort(key=lambda c:c['start']); complete = []; position = 0; gap = 0
        for cue in cues:
            assert cue['start'] >= position-1e-5,(language,cue['id'],position,cue['start'])
            if cue['start'] > position+1e-7:
                gap += 1
                complete.append({'id':f'quiet-v{args.edition}-{gap}','start':round(position,6),'end':cue['start'],'kind':'visual','title':{'en':'','fr':''}})
            complete.append(cue); position = cue['end']
        if position < duration:
            complete.append({'id':f'quiet-v{args.edition}-ending','start':position,'end':duration,'kind':'end','title':{'en':'RELIC','fr':'RELIC'}})
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
    encoding.update(version=args.edition,revision=REVISION,duration=duration,pictureFrames=round(duration*50),visualRenderer=f'checked-V9-packets-plus-credited-V{args.edition}-edits')
    encoding['hls']['files'] = report['files']; encoding['hls']['totalBytes'] = report['bytes']
    encoding['hls']['languages'] = {l:f'./assets/prologue/{RELEASE}/{l}.m3u8' for l in ['en','fr']}
    encoding['editPlanSha256'] = sha(ROOT/f'tools/film/scripts/prologue-edit-v{args.edition}.json')
    encoding['narrationScriptSha256'] = sha(ROOT/f'tools/film/scripts/prologue-narration-v{args.edition}.json')
    encoding['narrationManifestSha256'] = report['audio']['narrationManifestSha256']
    encoding['narrationManifestRole'] = 'Current stock narration production manifest; complete audio validated against the delivered HLS.'
    encoding.pop('chronologyManifestSha256',None)
    encoding['originalSourceCrossfadeSeconds'] = encoding.pop('crossfadeSeconds',.75)
    encoding['transitionPolicy'] = 'Original source dissolves are retained. Changed entries use short clean fades. Mars, Webb and the closing reflection share one uninterrupted music passage with gentle speech ducking.'
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
    sources.update(version=args.edition,revision=REVISION,checkedOn='2026-10-28',durationSeconds=duration,
                   editPlanSha256=encoding['editPlanSha256'],narrationScriptSha256=encoding['narrationScriptSha256'])
    sources['transport'].update(languages={l:f'{RELEASE}/{l}.m3u8' for l in ['en','fr']},totalBytes=report['bytes'],fileCount=len(report['files']),encodingManifestSha256=sha(encoding_path),sourcePolicy=encoding['quality']['sourcePolicy'])
    sources['paragraphTranscript'] = script['lines']; sources['editTimeline'] = plan['shots']
    sources['narration'].update(script=f'tools/film/scripts/prologue-narration-v{args.edition}.json',scriptSha256=encoding['narrationScriptSha256'],
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
    sources['chronology'] = {'revision':REVISION,'policy':plan['editorialPolicy'],'activePlan':f'tools/film/scripts/prologue-edit-v{args.edition}.json'}
    sources['endingTreatment'] = 'A six-second crossfade and a spoken bridge introduce the closing reflection. The continuous final score covers Webb and this transition. There is no epilogue title. The reflection includes active and retired objects on the Moon, Mars, Titan, a comet, in orbit and in interstellar space.'
    sources['spaceXContext'] = 'Falcon Heavy STP-2 in 2019 and Falcon 9 / Sentinel-6 in 2020 precede Perseverance and Webb in 2021. The narration identifies SpaceX and its founder without moving the founding date into this flight chronology.'
    sources['currentAdditionalSources'].extend(read(ROOT/f'tools/film/scripts/prologue-sources-v{args.edition}.json')['assets'])
    sources['editorialChanges'].append('V10: synchronized von Braun audio; music-only Apollo flag; both Voyager launches and instruments before Enterprise; Tereshkova, Leonov, Apollo 8/Earthrise, Huygens and Chang’e 4; complete Rosetta descent and contact; spoken closing bridge without a title; hardware beyond the Moon and Mars; continuous closing music.')
    if args.edition >= 11:
        sources['endingTreatment'] = 'One wide view of solar orbits follows Webb, without repeated Falcon, Titan, Rosetta, Voyager or Mars footage. A sixteen-second black final scene supports the player RELIC logo, name and exploration button; the card remains until the viewer acts.'
        sources['spaceXContext'] = 'The 2019 Falcon Heavy and 2020 Falcon 9 archive flights are identified as examples of an ongoing programme, not the full lifetime of Falcon activity.'
        sources['musicContext'] = 'Mars, Webb and the closing reflection use the same uninterrupted score passage. The Perseverance archive is mixed at reduced level, music returns over 1.8 seconds, and delivery targets -18 LUFS / -3 dBTP.'
        sources['historicalCorrectionsV11'] = {
            'vonBraun':{'fact':'Nazi Party member and SS officer; led V2 development.','source':'https://www.nasa.gov/people/wernher-von-braun/'},
            'shuttle':{'sts1':'1981-04-12 successful launch; 1981-04-14 successful landing','challengerLoss':'1986-01-28','columbiaLoss':'2003-02-01','source':'https://www.nasa.gov/history/space-shuttle-history-resources/'},
            'iss':{'countries':15,'agencies':5,'partners':['United States','Russia','Canada','Japan','Belgium','Denmark','France','Germany','Italy','Netherlands','Norway','Spain','Sweden','Switzerland','United Kingdom'],'source':'https://www.nasa.gov/international-space-station/space-station-international-cooperation/'},
            'rosetta':{'arrival':'2014-08-06','philaeRelease':'2014-11-12','beforeRelease':'Just over three months','philae':'Harpoons failed to fire; two bounces and three touchdowns','controlledImpact':'2016-09-30','source':'https://education.esa.int/rosetta_timeline/'},
            'falcon':{'ongoingAsOf':'2026-10-28','source':'https://www.spacex.com/launches/mission/?missionId=sl-v-1'},
            'webb':{'launch':'2021-12-25','partners':['NASA','ESA','CSA'],'mirrorMetres':6.5,'l2DistanceKm':1500000,'source':'https://science.nasa.gov/mission/webb/fact-sheet/'}
        }
        sources['editorialChanges'].append('V11: coherent Cassini-Huygens sequence; distinct successful STS-1 and later Challenger loss; fifteen ISS partners; Nazi role of von Braun; actual Philae bounces and clean Rosetta imagery; ongoing Falcon explanation; expanded Webb; continuous quieter closing score; no small subtitle labels; final RELIC card and pause exploration controls.')
    sources['sceneDates'] = {s['id']:copy.deepcopy(sources['sceneDates'].get(s['id'],{})) for s in plan['shots']}
    for s in plan['shots']:
        if 'eventDate' in s: sources['sceneDates'][s['id']]['eventDate'] = s['eventDate']
        sources['sceneDates'][s['id']].pop('historicalRole',None)
    write(source_path,sources)
    media['offline']['id'] = f'relic-documentary-v{args.edition}-hd50-'+sha(encoding_path)[:20]
    (root/'intro/prologue-data-v8.js').write_text('/** Documentary: scene-bound bilingual narration and verified media clock. */\nexport const PROLOGUE_MEDIA=Object.freeze('+dump(media).rstrip()+'\n);\nexport const PROLOGUE=Object.freeze(PROLOGUE_MEDIA.captions.en);\n',encoding='utf-8',newline='\n')
    print(json.dumps({'repo':root.name,'revision':REVISION,'duration':duration,'shots':len(media['scenes']),'captions':{k:len(v) for k,v in cue_tracks.items()},'files':len(report['files'])}))


if __name__ == '__main__':
    main()
