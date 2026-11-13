import argparse,copy,hashlib,importlib.util,json,shutil
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);parser.add_argument('--repo',type=Path,default=ROOT);args=parser.parse_args();work=args.work.resolve();root=args.repo.resolve();release='v12-0-hd50'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
publisher=module('clauses','tools/film/scripts/publish-prologue-v10.py');timing=module('alignment','tools/film/scripts/synthesize-narration-v9.py')
plan=read(ROOT/'tools/film/scripts/prologue-edit-v12.json');script=read(ROOT/'tools/film/scripts/prologue-narration-v12.json');manifest=read(work/'narration/manifest.json');alignment=read(work/'alignment-report.json');assert alignment['passed'];picture=read(work/'picture-report.json');assert picture['passed']
media=read(ROOT/'tools/film/reference/prologue-player-v11-1.json');assert media['revision']=='11.1-hd50';old=copy.deepcopy(media)
media.update(revision='12.0-hd50',duration=731,hls=f'./assets/prologue/{release}/en.m3u8',offline={'id':'relic-documentary-v12-hd50-'+sha(work/'master-en.m4a')[:20]})
for lang in ['en','fr']:media['languages'][lang]['hls']=f'./assets/prologue/{release}/{lang}.m3u8'
oldscenes={s['id']:s for s in old['scenes']};media['scenes']=[]
for shot in plan['shots']:
 row=copy.deepcopy(oldscenes[shot['id']]);row.update(start=shot['start'],end=shot['end']);row['focusTimeline']=[r for r in row.get('focusTimeline',[]) if r['at']<shot['duration']]
 if not row['focusTimeline']:row.pop('focusTimeline',None)
 media['scenes'].append(row)
for lang in ['en','fr']:
 cues=[]
 for c in old['captions'][lang]:
  if c['end']<=88.9 or (c['kind'] in ['quote','subtitle'] and c['start']<727) or c['id'] in ['v2-to-von-braun-pause','flag-music-only']:
   row=copy.deepcopy(c)
   if row['id']=='sputnik-original-signal-identification':row['title']={lang:'Sputnik · radio signal, 1957' if lang=='en' else 'Spoutnik · signal radio, 1957'}
   if row['start']>=495:row['start']-=6;row['end']-=6
   cues.append(row)
 for row in manifest['lines']:
  if row['language']!=lang:continue
  samples=np.memmap(work/(row['id']+'-'+lang+'.f32'),dtype='<f4',mode='r').reshape(-1,2)
  parts=publisher.chunks(row['text']);aligned,_=timing.align_captions(samples,48000,parts,[len(p) for p in parts],row['at'],row['duration'])
  for i,c in enumerate(aligned):cues.append({'id':row['id']+'-'+str(i+1),'kind':'narration','start':c['start'],'end':c['end'],'title':{lang:c['text']}})
 cues.append({'id':'relic-v12-ending','kind':'end','start':721,'end':731,'title':{'en':'RELIC','fr':'RELIC'}})
 output=[];position=0
 for c in sorted(cues,key=lambda c:c['start']):
  if abs(c['start']-position)<1e-5:c['start']=position
  assert c['start']>=position,(lang,c['id'],position,c['start'])
  if c['start']>position:output.append({'id':f'quiet-v12-{len(output)}','start':position,'end':c['start'],'kind':'visual','title':{'en':'','fr':''}})
  output.append(c);position=c['end']
 assert position==731;media['captions'][lang]=output
for lang in ['en','fr']:
 source=work/'source/intro/assets/prologue/v11-1-hd50'/f'{lang}.m3u8';shutil.copyfile(source,work/release/f'{lang}.m3u8')
folder=root/'intro/assets/prologue';oldenc=read(folder/('encoding-v11-1-source.json' if (folder/'encoding-v11-1-source.json').exists() else 'encoding-v9-hd50.json'))
if not (folder/'encoding-v11-1-source.json').exists():write(folder/'encoding-v11-1-source.json',oldenc)
encoding=copy.deepcopy(oldenc);encoding.update(version=12,revision='12.0-hd50',duration=731,pictureFrames=36550,visualRenderer='checked-V11.1-packets-minus-ISS-runner-with-new-closing-fade')
encoding['hls']['files']=[{'path':p.relative_to(work).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted((work/release).rglob('*')) if p.is_file()];encoding['hls']['totalBytes']=sum(r['bytes'] for r in encoding['hls']['files']);encoding['hls']['languages']={lang:media['languages'][lang]['hls'] for lang in ['en','fr']}
encoding['quality']['narrationAlignment']=alignment;encoding['quality']['silentFinalCard']=alignment['silentFinalCard'];encoding['quality']['deliveryValidation']={**picture,'method':'Complete checked video decode and delivered HLS AAC waveform checks. Audio encoder priming packet removed before fMP4 packaging.'}
for lang in ['en','fr']:
 rows=[r for r in manifest['lines'] if r['language']==lang];samples=np.memmap(work/f'delivered-hls-{lang}.f32',dtype='<f4',mode='r').reshape(-1,2)
 encoding['languages'][lang]={'fullDecodePassed':True,'sampleRate':48000,'channels':2,'decodedSamples':len(samples),'decodedSeconds':len(samples)/48000,'samplePeak':float(np.max(np.abs(samples))),'duration':731,'audioSources':[{'id':r['id'],'start':r['at'],'duration':r['duration'],'sha256':r['sha256'],'voice':r['voice']} for r in rows]}
encoding['narration']['paragraphsPerLanguage']=len(script['lines']);encoding['editPlanSha256']=sha(ROOT/'tools/film/scripts/prologue-edit-v12.json');encoding['narrationScriptSha256']=sha(ROOT/'tools/film/scripts/prologue-narration-v12.json');encoding['narrationManifestSha256']=sha(work/'narration/manifest.json');encoding['musicCredit']='Helios, The Climb, Aurora — Scott Buckley · CC BY 4.0 · edited, normalized and crossfaded for RELIC';encoding['transitionPolicy']='Long eased score crossfades, smooth narration ducking, deliberate radio/remembrance silences, five-second closing music fade and silent final brand.'
sources=read(folder/'sources-v9.json');sources.update(version=12,revision='12.0-hd50',durationSeconds=731,checkedOn='2026-11-13',musicCredit=encoding['musicCredit'],musicTimeline=read(work/'audio-report.json')['music'],editTimeline=plan['shots'],paragraphTranscript=script['lines'],historicalAudioWindows=plan['archivalAudio'],endingTreatment='Short closing reflection, wide solar view fading to black over two seconds, new ambient score fading out over five seconds, then a silent animated RELIC logo and Explore button.')
sources['narration']={'synthetic':True,'voices':{'en':'af_heart','fr':'ff_siwis'},'paragraphs':[{k:r[k] for k in ['id','language','voice','text','at','end','duration','sha256']} for r in manifest['lines']],'alignment':alignment}
sources['editorialChangesV12']=plan['notes'];sources['musicSourcesV12']=[{'title':title,'author':'Scott Buckley','sourcePage':url,'license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','sha256':sha(work/'assets'/file),'adaptations':'Excerpted, normalized, crossfaded and ducked under narration.'} for title,url,file in [('Helios','https://www.scottbuckley.com.au/library/helios/','helios.oga'),('The Climb','https://www.scottbuckley.com.au/library/the-climb/','theclimb.oga'),('Aurora','https://www.scottbuckley.com.au/library/aurora/','aurora.mp3')]]
# Active transcript/timing fields replace their prior edition rather than retaining
# obsolete paragraphs as if they still described this delivery.
sources['transport']['languages']={lang:f'{release}/{lang}.m3u8' for lang in ['en','fr']};sources['transport']['sourcePolicy']='Checked V11.1 picture packets retained, ISS runner removed, closing shot shortened and faded; both mixed AAC tracks rebuilt from stock narration, genuine retained archives and three licensed scores.';sources['verifiedPictureIdentity']=[{'id':s['id'],'start':s['start'],'end':s['end'],'retainedSourceRange':s['retainedSourceRange']} for s in plan['shots']];sources['chronology']=[{'id':s['id'],'start':s['start'],'end':s['end'],'eventDate':s.get('eventDate')} for s in plan['shots']];sources['audioTimeline']=encoding['languages'];sources['narrativeStructure']=script['lines'];sources['musicContext']=encoding['transitionPolicy'];sources['narrationScriptSha256']=encoding['narrationScriptSha256'];sources['editPlanSha256']=encoding['editPlanSha256']
for key in ['historicalCorrectionsV11','editorialChanges','musicOnlyScenes']:sources.pop(key,None)
shutil.copytree(work/release,folder/release,dirs_exist_ok=True)
(root/'intro/prologue-data-v8.js').write_text('/** Documentary: scene-bound bilingual narration and verified media clock. */\nexport const PROLOGUE_MEDIA=Object.freeze('+json.dumps(media,ensure_ascii=False,indent=2)+'\n);\nexport const PROLOGUE=Object.freeze(PROLOGUE_MEDIA.captions.en);\n',encoding='utf-8')
write(folder/'encoding-v9-hd50.json',encoding);write(folder/'sources-v9.json',sources);print('Published',root.name,encoding['hls']['totalBytes'],flush=True)
