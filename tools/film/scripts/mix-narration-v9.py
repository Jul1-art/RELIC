"""Mix the V9 bilingual score and genuine archives at the checked edit clock.

Uses the approved V8 audio source plan, the V9 shot timeline, and separately
synthesized paragraph manifests. Every archival/effect start follows the same
piecewise timeline map as the picture. The unchanged Helios recording is edited
with short overlaps across the inserted scenes; its speed is never changed.
Produces standalone 48 kHz stereo AAC192 and bounded HLS audio fragments. No
video is copied, historical voice is synthesized, or completed speech shortened.
"""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,json,math,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def write(p,d):
 p=Path(p);t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--media-root',type=Path,required=True)
 parser.add_argument('--timeline',type=Path,required=True)
 parser.add_argument('--narration',type=Path,required=True)
 parser.add_argument('--script',type=Path,default=ROOT/'tools/film/scripts/prologue-narration-v9.json')
 parser.add_argument('--base-plan',type=Path,default=ROOT/'tools/film/scripts/prologue-edit-v8.json')
 parser.add_argument('--work',type=Path,required=True)
 args=parser.parse_args();media=args.media_root.resolve();work=args.work.resolve();work.mkdir(parents=True,exist_ok=True)
 sys.path.insert(0,str(media/'v6-sound/tts-deps'))
 import numpy as np
 spec=importlib.util.spec_from_file_location('relic_v9_audio_base',ROOT/'tools/film/scripts/build-prologue-v6.py')
 b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);b.MEDIA=media
 base=json.loads(args.base_plan.read_text());timeline=json.loads(args.timeline.read_text());narration=json.loads(args.narration.read_text());script=json.loads(args.script.read_text())
 assert narration['allLinesFit'] and len(narration['lines'])==2*len(script['lines'])
 duration=float(timeline[-1]['end']);assert duration==569
 old=[x for x in timeline if 'oldStart' in x]
 def warp(t):
  t=float(t)
  for x in old:
   if x['oldStart']<=t<x['oldStart']+x['duration']-1e-8:return round(x['start']+t-x['oldStart'],6)
  if abs(t-529)<1e-8:return duration
  raise ValueError('Audio time outside original edit: '+str(t))
 # Merge adjacent source intervals that retain the same old-to-new offset.
 spans=[]
 for x in old:
  offset=x['start']-x['oldStart'];left=x['oldStart'];right=left+x['duration']
  if spans and spans[-1]['offset']==offset and abs(spans[-1]['end']-left)<1e-8:spans[-1]['end']=right
  else:spans.append({'start':left,'end':right,'offset':offset})
 historical=[]
 for group in ['audio','effects']:
  for source in base[group]:
   x=copy.deepcopy(source);x['at']=warp(source['at']);historical.append({'group':group,'id':x['id'],'oldStart':source['at'],'start':x['at'],'duration':x['length'],'file':x['file'],'sha256':sha(media/x['file'])})
 music=[]
 for ti,track in enumerate(base['music']):
  start=float(track.get('at',0));end=start+float(track['length'])
  for si,span in enumerate(spans):
   left=max(start,span['start']);right=min(end,span['end'])
   if right<=left:continue
   x=copy.deepcopy(track);source_in=float(track.get('in',0))+left-start
   handle=min(.3,source_in) if left>start else 0
   x.update(id=f"{track['id']}-mapped-{si}",at=round(left+span['offset']-handle,6),**{'in':source_in-handle,'length':right-left+handle,'fadeIn':track.get('fadeIn',1.5) if left==start else handle,'fadeOut':track.get('fadeOut',3) if right==end else .3})
   music.append(x)
 for inserted in [x for x in timeline if 'oldStart' not in x]:
  after=next(x for x in old if x['start']>=inserted['end']);boundary=after['oldStart']
  candidates=[t for t in base['music'] if t['at']<=boundary<t['at']+t['length']]
  assert candidates,inserted['id'];track=max(candidates,key=lambda t:t['at']);x=copy.deepcopy(track)
  length=inserted['duration']+.3;available=float(b.probe(media/x['file'])['format']['duration'])
  source_in=min(max(0,float(track.get('in',0))+boundary-track['at']-.3),available-length-.01)
  x.update(id='helios-insert-'+inserted['id'],at=inserted['start']-.3,**{'in':source_in,'length':length,'fadeIn':.3,'fadeOut':.3});music.append(x)
 music.sort(key=lambda x:x['at'])
 # Source music coverage is complete across every inserted scene.
 for x in music:
  assert 0<=x['at'] and x['at']+x['length']<=duration+.001
  available=float(b.probe(media/x['file'])['format']['duration']);assert x['in']+x['length']<=available+.03
 all_records={};report={'duration':duration,'sampleRate':48000,'audioBitrate':192000,'historicalTimingMap':historical,'musicEdits':music,'narrationManifestSha256':sha(args.narration),'voices':narration['voices'],'languages':{},'silentImagery':{'start':153,'end':161,'noDialogue':True}}
 for language in ['en','fr']:
  folder=work/language;folder.mkdir(parents=True,exist_ok=True);b.WORK=folder
  spoken=[r for r in narration['lines'] if r['language']==language]
  assert {x['id'] for x in spoken}=={x['id'] for x in script['lines']}
  for x in spoken:
   assert x['fits'] and x['duration']<=x['slotSeconds']+.02 and sha(media/x['file'])==x['sha256']
   assert not (x['at']<161 and x['end']>153),x['id']
  tracks=[]
  for source in base['audio']:
   x=copy.deepcopy(source);x['at']=warp(source['at']);x['role']=x.get('role','archival');tracks.append(x)
  for source in base['effects']:
   x=copy.deepcopy(source);x['at']=warp(source['at']);x['role']='effect';tracks.append(x)
  for r in spoken:tracks.append({'id':r['id']+'-'+language,'file':r['file'],'at':r['at'],'length':r['duration'],'role':'voice'})
  for x in tracks:
   assert x['at']>=0 and x['at']+x['length']<=duration+.02
   if x['role'] in ['voice','archival']:assert not(x['at']<161 and x['at']+x['length']>153),x['id']
  total=round(duration*b.RATE);raw=folder/'documentary-mix.f32';mix=np.memmap(raw,dtype='<f4',mode='w+',shape=(total,2));mix[:]=0
  duck=np.ones(total,dtype=np.float32);floor=10**(-float(base.get('musicDuckDb',14))/20)
  for t in tracks:
   if t['role'] in ['voice','archival']:b.envelope_min(duck,t['at'],t['at']+t['length'],floor)
  for interval in base.get('silenceMusic',[]):
   if isinstance(interval,(list,tuple)):left,right=interval
   else:left=interval.get('start',interval.get('at',0));right=interval.get('end',left+interval.get('length',0))
   b.envelope_min(duck,warp(left),warp(right),0,.35,1.0)
  records=[];block=b.RATE*4
  for i,t in enumerate([dict(x,role='music') for x in music]+tracks):
   data,offset,record=b.decode_track(t,i,t['role'],duration);count=min(data.shape[0],total-offset)
   field=None
   if t['role']=='field':
    field=np.ones(data.shape[0],dtype=np.float32)
    for r in spoken:b.envelope_min(field,r['at']-t['at'],r['end']-t['at'],.12,.2,.6)
    record['duckedUnderNarrationDb']=18.4
   for at in range(0,count,block):
    end=min(count,at+block);chunk=np.array(data[at:end],dtype=np.float32,copy=True)
    if t['role']=='music':chunk*=duck[offset+at:offset+end,None]
    if field is not None:chunk*=field[at:end,None]
    mix[offset+at:offset+end]+=chunk
   records.append(record);del data,field
   print(json.dumps({'language':language,'mixed':t['id'],'at':t['at']}),flush=True)
  mix.flush();peak=max(float(np.max(np.abs(mix[at:at+block]))) for at in range(0,total,block));del mix,duck
  target={'integrated':-16,'truePeak':-1.5,'lra':11};target.update(base.get('masteringByLanguage',{}).get(language,{}))
  raw_input=['-f','f32le','-ar',b.RATE,'-ac',2,'-i',raw]
  measured=b.loudness(raw_input,target)
  af=(f"loudnorm=I={target['integrated']}:TP={target['truePeak']}:LRA={target['lra']}:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true:print_format=json")
  master=folder/'master.m4a';cmd=['ffmpeg','-hide_banner','-y',*map(str,raw_input),'-af',af,'-ar','48000','-ac','2','-c:a','aac','-b:a','192k','-t',str(duration),'-map_metadata','-1','-movflags','+faststart',str(master)]
  result=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True);final=b.extract_loudness(result.stderr.decode(errors='replace'))
  info=b.probe(master);audio=next(x for x in info['streams'] if x['codec_type']=='audio');assert audio['sample_rate']=='48000' and audio['channels']==2 and abs(float(info['format']['duration'])-duration)<.03
  hls=work/('audio-'+language);hls.mkdir(exist_ok=True)
  b.ffmpeg('-i',master,'-map','0:a:0','-vn','-c:a','copy','-f','hls','-hls_time','8','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_fmp4_init_filename','init.mp4','-hls_flags','independent_segments','-hls_segment_filename',hls/'segment-%03d.m4s',hls/'index.m3u8')
  files=[{'path':p.relative_to(work).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(hls.iterdir()) if p.is_file()]
  assert all(x['bytes']<25*1024*1024 for x in files)
  localized={'master':str(master),'masterSha256':sha(master),'duration':float(info['format']['duration']),'files':files,'sources':records,'mastering':{'target':target,'premixPeakLinear':peak,'firstPass':measured,'secondPass':final}}
  report['languages'][language]=localized;write(folder/'audio-report.json',localized);write(work/'report.json',report)
  print(json.dumps({'language':language,'master':str(master),'hlsFiles':len(files),'duration':duration}),flush=True)
 report['complete']=True;write(work/'report.json',report)
 print(json.dumps({'complete':True,'report':str(work/'report.json'),'languages':['en','fr'],'duration':duration}),flush=True)
if __name__=='__main__':main()
