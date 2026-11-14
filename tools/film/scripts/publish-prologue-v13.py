import argparse,json,hashlib,shutil,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[3]);a=p.parse_args();root=a.repo.resolve();work=a.work.resolve();folder=root/'intro/assets/prologue'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
validation=read(work/'validation.json');assert validation['passed'];receipt=read(work/'source-receipt.json');release='v13-0-hd50'
file=root/'intro/prologue-data-v8.js';text=file.read_text(encoding='utf-8');media=json.loads(text.split('Object.freeze(',1)[1].split('\n);',1)[0]);assert media['duration']==731
media.update(revision='13.0-hd50',hls=f'./assets/prologue/{release}/en.m3u8',bakedEndCard=True,offline={'id':'relic-documentary-v13-'+receipt['sourceSha256'][:20]},downloads={'mp4':read(work/'download.json')})
for lang in ['en','fr']:media['languages'][lang]['hls']=f'./assets/prologue/{release}/{lang}.m3u8'
file.write_text('/** Owner-supplied film; encoded media preserved without further cuts. */\nexport const PROLOGUE_MEDIA=Object.freeze('+json.dumps(media,ensure_ascii=False,indent=2)+'\n);\nexport const PROLOGUE=Object.freeze(PROLOGUE_MEDIA.captions.en);\n',encoding='utf-8')
plan=read(root/'tools/film/scripts/prologue-edit-v12.json');plan.update(version=13,revision='13.0-hd50',release=release,sourceRevision='owner-provided',sourceReceipt='intro/assets/prologue/source-v13.json',cutIntervals=[])
for key in ['musicEnd','musicFinalFadeSeconds']:plan.pop(key,None)
write(root/'tools/film/scripts/prologue-edit-v13.json',plan);write(root/'tools/film/scripts/prologue-download-v13.json',media['downloads']['mp4']);write(folder/'source-v13.json',receipt)
encoding=read(folder/'encoding-v9-hd50.json');encoding.update(version=13,revision='13.0-hd50',visualRenderer='Owner-supplied H.264 packets preserved; no additional cut',editPlanSha256=sha(root/'tools/film/scripts/prologue-edit-v13.json'),transitionPolicy='Preserve the complete supplied soundtrack and original montage without remixing or retiming.')
encoding['inheritedV12Quality']=encoding.pop('quality');encoding['quality']={'sourcePreservation':validation};encoding['inheritedV12Languages']=encoding.pop('languages');encoding['languages']={lang:{'fullDecodePassed':True,'source':'Owner-supplied AAC track, copied without reencoding','encodedPacketsIdentical':True} for lang in ['en','fr']};encoding['narrationManifestRole']='Inherited transcript and caption clock; current soundtrack is supplied complete, not synthesized or remixed.'
encoding['hls']['files']=[{'path':p.relative_to(work).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted((work/release).rglob('*')) if p.is_file()];encoding['hls']['totalBytes']=sum(r['bytes'] for r in encoding['hls']['files']);encoding['hls']['languages']={lang:media['languages'][lang]['hls'] for lang in ['en','fr']}
write(folder/'encoding-v9-hd50.json',encoding)
sources=read(folder/'sources-v9.json');sources.update(version=13,revision='13.0-hd50',checkedOn='2026-11-14',sourcePreservation=receipt,endingTreatment='Supplied closing montage retained. Application branding is shown once.');sources['transport']['languages']={lang:f'{release}/{lang}.m3u8' for lang in ['en','fr']};sources['transport']['sourcePolicy']=receipt['policy'];sources['inheritedV12SoundtrackDocumentation']={k:sources.pop(k) for k in ['narration','audioTimeline','musicTimeline','musicContext'] if k in sources};sources['soundtrack']='Complete owner-provided bilingual mix, retained without editing. Earlier music and narration documentation is inherited provenance, not a new measurement of this mix.';write(folder/'sources-v9.json',sources)
shutil.copytree(work/release,folder/release,dirs_exist_ok=True)
player=root/'intro/prologue-v8.js';s=player.read_text(encoding='utf-8');s=s.replace('ending ? staticEnding ? 0 : 1 - smooth(endTime / 1.4) : 1','ending ? (staticEnding || filmMedia.bakedEndCard) ? 0 : 1 - smooth(endTime / 1.4) : 1');player.write_text(s,encoding='utf-8')
print('Published',root.name,encoding['hls']['totalBytes'])
