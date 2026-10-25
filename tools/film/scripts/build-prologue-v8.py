"""Render one shared 720p picture, two narrated mixes, and bilingual HLS.

Existing licensed footage only. The master playlists share video fragments;
each selects its own complete English/French soundtrack. Historical voices
are original recordings. Stock synthetic narration requires a complete manifest.
"""
from pathlib import Path
import argparse,copy,hashlib,importlib.util,json,os,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'media-work/v6-sound/tts-deps'))
spec=importlib.util.spec_from_file_location('relic_v6_renderer',ROOT/'tools/film/scripts/build-prologue-v6.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
import numpy as np
WORK=ROOT/'media-work/v8-edit';OUT=ROOT/'intro/assets/prologue';LIMIT=24*1024*1024

def meta(p,relative=None):
 return {'path':relative or str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':b.sha256(p)}
def ff(*args):return b.ffmpeg(*args)
def write(p,obj):b.json_write(p,obj)

# Each transition belongs to the preceding shot. Pieces have exact nominal
# frame counts; a dissolve consumes a handle without shifting the edit clock.
RENDER_REVISION = 'v8-local-pieces-1'
SOURCE_HASHES = {}

def fingerprint(value):
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def source_sha(name):
 path=b.source_file(name);state=path.stat();key=(str(path),state.st_size,state.st_mtime_ns)
 if key not in SOURCE_HASHES:SOURCE_HASHES[key]=b.sha256(path)
 return SOURCE_HASHES[key]

def frame_count(seconds,label):
 number=round(float(seconds)*b.FPS)
 if number<=0 or abs(number/b.FPS-float(seconds))>0.00001:
  raise ValueError(f'{label} must be positive and lie on the {b.FPS} fps grid')
 return number

def transition_after(shots,index,default):
 if index==len(shots)-1:return 0.0,'cut'
 shot=shots[index];seconds=float(shot.get('transitionOut',default))
 if seconds<0:raise ValueError('A transition cannot have negative duration')
 seconds=round(seconds*b.FPS)/b.FPS
 kind=shot.get('transitionType','fade') if seconds else 'cut'
 if kind not in ('fade','fadeblack','cut'):raise ValueError('Unsupported transition '+kind)
 if kind=='cut':seconds=0.0
 if seconds>=min(float(shot['duration']),float(shots[index+1]['duration'])):
  raise ValueError('A transition must be shorter than both adjacent shots')
 return seconds,kind

def verify_picture(path,seconds):
 info=b.probe(path);stream=next(x for x in info['streams'] if x['codec_type']=='video')
 wanted=frame_count(seconds,str(path));actual=int(stream.get('nb_frames',-1))
 if actual!=wanted:raise RuntimeError(f'{path.name}: {actual} frames, expected {wanted}')
 if abs(float(info['format']['duration'])-seconds)>.0001:
  raise RuntimeError(f'{path.name}: wrong duration {info["format"]["duration"]}, expected {seconds}')
 if (stream['width'],stream['height'])!=(b.WIDTH,b.HEIGHT) or stream['pix_fmt']!='yuv420p':
  raise RuntimeError(f'{path.name}: unexpected picture format')
 return actual

def valid_cache(target,record,digest):
 if not target.is_file() or not record.is_file():return False
 try:saved=json.loads(record.read_text())
 except (ValueError,OSError):return False
 return saved.get('fingerprint')==digest and saved.get('sha256')==b.sha256(target)

def normal_key(shot,length):
 # A changed narrative ID may reuse the same verified camera footage.
 return {'file':shot.get('file'),'in':float(shot.get('in',0)),
  'sourceLength':float(shot.get('sourceLength',length)),
  'preserveSpeed':bool(shot.get('preserveSpeed',False)),
  'crop':shot.get('crop'),'fit':shot.get('fit','cover'),
  'monochrome':bool(shot.get('monochrome',False)),'length':length}

def seed_candidates():
 planfile=ROOT/'tools/film/scripts/prologue-edit-v7.json';cache=ROOT/'media-work/v7-edit/silent-plan.json'
 if not planfile.exists() or not cache.exists():return {}
 old=json.loads(planfile.read_text());shots=old['shots'];cross=old['crossfadeSeconds']
 # Bind V7's previous source bytes and transforms before trusting its shots.
 hashes={s['file']:source_sha(s['file']) for s in shots if s.get('file')}
 old_digest=hashlib.sha256(json.dumps({'shots':shots,'crossfade':cross,
  'sources':hashes,'rendererRevision':3,'width':b.WIDTH,'height':b.HEIGHT,'fps':b.FPS},
  sort_keys=True).encode()).hexdigest()
 if json.loads(cache.read_text()).get('fingerprint')!=old_digest:return {}
 result={}
 for i,shot in enumerate(shots):
  length=float(shot['duration'])+(cross if i<len(shots)-1 else 0)
  path=ROOT/'media-work/v7-edit'/f'shot-{i:02d}.mp4';record=path.with_suffix('.render.json')
  if path.is_file() and record.is_file():
   saved=json.loads(record.read_text())
   if saved.get('sha256')==b.sha256(path):result[fingerprint(normal_key(shot,length))]=path
 return result

def normalize_shot(shot,length,index,seeds):
 target=WORK/f'shot-{index:02d}.mp4';record=target.with_suffix('.normalize.json')
 props=normal_key(shot,length)
 digest=fingerprint({'revision':RENDER_REVISION,'normalized':props,
  'source':source_sha(shot['file']) if shot.get('file') else None})
 if valid_cache(target,record,digest):verify_picture(target,length);return target
 seed=seeds.get(fingerprint(props))
 if seed:
  verify_picture(seed,length);shutil.copyfile(seed,target)
 else:
  filters=[]
  if not shot.get('file'):
   inputs=['-f','lavfi','-i',f'color=c=black:s={b.WIDTH}x{b.HEIGHT}:r={b.FPS}:d={length}']
  else:
   source=b.source_file(shot['file']);start=float(shot.get('in',0))
   available=float(b.probe(source)['format']['duration'])-start
   consumed=min(available,length,float(shot.get('sourceLength',length)))
   if start<0 or consumed<=0:raise ValueError('No source frames available for '+shot['id'])
   inputs=['-threads','1','-ss',str(start),'-i',str(source)]
   filters.append(f'trim=duration={consumed:.10f}')
   filters.append('setpts=PTS-STARTPTS' if shot.get('preserveSpeed') else f'setpts={length/consumed:.10f}*(PTS-STARTPTS)')
   filters += [f'fps={b.FPS}','tpad=stop_mode=clone:stop=-1']
   if shot.get('crop'):filters.append(shot['crop'])
   if shot.get('fit')=='contain':
    filters += [f'scale={b.WIDTH}:{b.HEIGHT}:force_original_aspect_ratio=decrease',f'pad={b.WIDTH}:{b.HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black']
   else:filters += [f'scale={b.WIDTH}:{b.HEIGHT}:force_original_aspect_ratio=increase',f'crop={b.WIDTH}:{b.HEIGHT}']
   if shot.get('monochrome'):filters.append('hue=s=0')
  filters += ['setsar=1',f'fps={b.FPS}',f'settb=1/{b.FPS}','format=yuv420p']
  ff(*inputs,'-vf',','.join(filters),'-frames:v',frame_count(length,shot['id']),'-an',
   '-map_metadata','-1','-map_chapters','-1','-c:v','libx264','-threads','2','-preset','fast','-crf','20',
   '-profile:v','high','-level','3.1','-g','48','-keyint_min','48','-sc_threshold','0','-movflags','+faststart',target)
 verify_picture(target,length)
 write(record,{'fingerprint':digest,'sha256':b.sha256(target),'frames':frame_count(length,shot['id']),'seconds':length})
 return target

def render_piece(shots,normalized,index,transitions):
 shot=shots[index];seconds=float(shot['duration']);frames=frame_count(seconds,shot['id'])
 incoming,kind=transitions[index-1] if index else (0.0,'cut')
 target=WORK/f'piece-{index:02d}.mp4';record=target.with_suffix('.render.json')
 digest=fingerprint({'revision':RENDER_REVISION,'pieceRevision':2,'current':b.sha256(normalized[index]),
  'previous':b.sha256(normalized[index-1]) if incoming else None,
  'incoming':incoming,'kind':kind,'seconds':seconds})
 if valid_cache(target,record,digest):
  # Early local pieces retained the last packet's unspecified duration. Repair
  # their container clock without changing any coded picture or transition.
  info=b.probe(target);stream=next(x for x in info['streams'] if x['codec_type']=='video')
  if abs(float(info['format']['duration'])-seconds)>.0001 or stream.get('avg_frame_rate')!='24/1':
   repaired=target.with_suffix('.cfr.mp4')
   ff('-i',target,'-map','0:v:0','-c:v','copy','-r',b.FPS,'-video_track_timescale','12288','-movflags','+faststart',repaired)
   verify_picture(repaired,seconds);os.replace(repaired,target)
   saved=json.loads(record.read_text());saved['sha256']=b.sha256(target);saved['packetDurationCFR']=True;write(record,saved)
  verify_picture(target,seconds);return target
 if incoming:
  previous=float(shots[index-1]['duration'])
  inputs=['-threads','1','-i',normalized[index-1],'-threads','1','-i',normalized[index]]
  graph=(f'[0:v]trim=start={previous:.10f}:end={previous+incoming:.10f},setpts=PTS-STARTPTS,fps={b.FPS},settb=1/{b.FPS},format=yuv420p[p];'
   f'[1:v]trim=duration={seconds:.10f},setpts=PTS-STARTPTS,fps={b.FPS},settb=1/{b.FPS},format=yuv420p[c];'
   f'[p][c]xfade=transition={kind}:duration={incoming:.10f}:offset=0,fps={b.FPS},'
   f'trim=end_frame={frames},setpts=N/({b.FPS}*TB),setsar=1,format=yuv420p[v]')
  filtering=['-filter_complex_threads','1','-filter_complex',graph,'-map','[v]']
 else:
  inputs=['-threads','1','-i',normalized[index]]
  filtering=['-vf',f'trim=end_frame={frames},setpts=N/({b.FPS}*TB),setsar=1,format=yuv420p']
 ff(*inputs,*filtering,'-frames:v',frames,'-an','-map_metadata','-1','-map_chapters','-1',
  '-c:v','libx264','-threads','2','-preset','fast','-crf','22','-maxrate','1800k','-bufsize','3600k',
  '-pix_fmt','yuv420p','-profile:v','high','-level','3.1','-g','48','-keyint_min','48','-sc_threshold','0',
  '-x264-params','repeat-headers=1:open-gop=0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',
  '-r',b.FPS,'-video_track_timescale','12288','-movflags','+faststart',target)
 verify_picture(target,seconds)
 write(record,{'fingerprint':digest,'sha256':b.sha256(target),'frames':frames,'seconds':seconds,'incomingTransition':incoming,'transitionType':kind})
 return target

def build_visuals(plan,audio_only):
 shots=plan['shots'];duration=sum(float(s['duration']) for s in shots)
 transitions=[transition_after(shots,i,float(plan.get('crossfadeSeconds',.75))) for i in range(len(shots))]
 hashes={s['file']:source_sha(s['file']) for s in shots if s.get('file')}
 digest=fingerprint({'revision':RENDER_REVISION,'shots':shots,'transitions':transitions,'sources':hashes,'width':b.WIDTH,'height':b.HEIGHT,'fps':b.FPS})
 silent=WORK/'silent.mp4';cache=WORK/'silent-plan.json'
 if valid_cache(silent,cache,digest):verify_picture(silent,duration);print('Reusing checked V8 silent master.',flush=True);return silent
 if audio_only:raise RuntimeError('The exact V8 picture must be rendered before --audio-only')
 seeds=seed_candidates();normalized=[]
 for i,shot in enumerate(shots):
  length=float(shot['duration'])+transitions[i][0]
  normalized.append(normalize_shot(shot,length,i,seeds));print(f'Normalized {i+1}/{len(shots)} {shot["id"]}',flush=True)
 pieces=[];clock=0.0
 for i,shot in enumerate(shots):
  pieces.append(render_piece(shots,normalized,i,transitions))
  print(f'Edited {i+1}/{len(shots)} {shot["id"]}: {clock:g}–{clock+float(shot["duration"]):g}s',flush=True);clock+=float(shot['duration'])
 # Each independently encoded piece begins with an IDR and uses the same
 # dimensions, frame rate, color tags, time base and encoder profile.
 listing=WORK/'picture-concat.txt'
 listing.write_text(''.join(f"file '{p.name}'\n" for p in pieces))
 ff('-f','concat','-safe','0','-i',listing,'-map','0:v:0','-c:v','copy','-an',
  '-map_metadata','-1','-r',b.FPS,'-video_track_timescale','12288','-movflags','+faststart',silent)
 actual=verify_picture(silent,duration)
 write(cache,{'fingerprint':digest,'duration':duration,'frames':actual,'sha256':b.sha256(silent),'renderer':RENDER_REVISION,
  'transitions':[{'after':s['id'],'seconds':t[0],'type':t[1]} for s,t in zip(shots,transitions)]})
 return silent

def mix_language(plan,narration,language,silent,duration):
 directory=WORK/language;directory.mkdir(exist_ok=True);b.WORK=directory
 localized=copy.deepcopy(plan)
 localized['mastering']=plan.get('masteringByLanguage',{}).get(language,{})
 spoken=[r for r in narration['lines'] if r['language']==language]
 expected={x['id'] for x in json.loads((ROOT/'tools/film/scripts/prologue-narration-v8.json').read_text())['lines']}
 if {x['id'] for x in spoken}!=expected:raise RuntimeError('Incomplete '+language+' narration')
 for r in spoken:
  if not r['fits']:raise RuntimeError('Narration overflows '+r['id'])
  localized['audio'].append({'id':r['id']+'-'+language,'file':r['file'],'at':r['at'],'length':r['duration'],'role':'voice'})
 # Field recordings are audible between narration; their announcers never
 # compete with a new narrator. The score's own duck remains in the base mixer.
 decode=b.decode_track
 def decode_duck(track,index,role,total):
  data,offset,record=decode(track,index,role,total)
  if role!='field':return data,offset,record
  env=np.ones(data.shape[0],dtype=np.float32)
  for r in spoken:b.envelope_min(env,r['at']-track['at'],r['end']-track['at'],.12,.2,.6)
  target=directory/f'field-duck-{index}.f32';mixed=np.memmap(target,dtype='<f4',mode='w+',shape=data.shape)
  for at in range(0,data.shape[0],b.RATE*4):mixed[at:at+b.RATE*4]=data[at:at+b.RATE*4]*env[at:at+b.RATE*4,None]
  mixed.flush();del mixed,env,data
  record['duckedUnderNarrationDb']=18.4
  return np.memmap(target,dtype='<f4',mode='r').reshape(-1,2),offset,record
 b.decode_track=decode_duck
 try:master,records,mastering=b.build_audio(localized,duration,silent)
 finally:b.decode_track=decode
 return master,records,mastering

def hls_part(source,directory,kind):
 directory.mkdir(parents=True,exist_ok=True)
 mapping=['-map','0:v:0','-an','-c:v','copy','-tag:v','avc1'] if kind=='video' else ['-map','0:a:0','-vn','-c:a','copy']
 ff('-i',source,*mapping,'-f','hls','-hls_time','8','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_fmp4_init_filename','init.mp4','-hls_flags','independent_segments','-hls_segment_filename',directory/'segment-%03d.m4s',directory/'index.m3u8')

def build_hls(masters):
 stage=WORK/'hls-staging'
 if stage.exists():shutil.rmtree(stage)
 hls_part(masters['en'],stage/'video','video')
 for lang,master in masters.items():
  hls_part(master,stage/('audio-'+lang),'audio')
  name='English' if lang=='en' else 'Français'
  (stage/(lang+'.m3u8')).write_text('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-INDEPENDENT-SEGMENTS\n'+f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="voice",NAME="{name}",LANGUAGE="{lang}",DEFAULT=YES,AUTOSELECT=YES,URI="audio-{lang}/index.m3u8"\n'+'#EXT-X-STREAM-INF:BANDWIDTH=2200000,AVERAGE-BANDWIDTH=1650000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=24.000,AUDIO="voice"\nvideo/index.m3u8\n')
 target=OUT/'v8-4'
 if target.exists():shutil.rmtree(target)
 shutil.move(str(stage),str(target))
 files=[meta(p) for p in sorted(target.rglob('*')) if p.is_file()]
 if any(x['bytes']>=25*1024*1024 for x in files):raise RuntimeError('An HLS file exceeds hosting limit')
 return {'width':1280,'height':720,'type':'VOD fMP4, shared video with localized mixed audio','segmentSeconds':8,'audioBitrate':192000,'files':files,'totalBytes':sum(x['bytes'] for x in files),'languages':{l:'./assets/prologue/v8-4/'+l+'.m3u8' for l in masters}}

FALLBACK_AUDIO_FILTER = 'aresample=192000,alimiter=limit=0.60:attack=5:release=80:level=false:latency=true,aresample=48000'

def fallback(masters,duration):
 # The picture is unchanged for narration/player revisions. Reuse only a
 # checksum-verified encode bound to this exact source picture and duration.
 picture=WORK/'fallback-picture.mp4';record=WORK/'fallback-picture.json'
 source_sha=b.sha256(WORK/'silent.mp4')
 bitrate=int((LIMIT*.96*8/duration-80000)*.98)
 cached=json.loads(record.read_text()) if record.exists() else {}
 reuse=(picture.exists() and cached.get('sourcePictureSha256')==source_sha
  and cached.get('duration')==duration and cached.get('videoBitrate')==bitrate
  and cached.get('sha256')==b.sha256(picture))
 if reuse:
  stream=next(x for x in b.probe(picture)['streams'] if x['codec_type']=='video')
  if (stream['width'],stream['height'],int(stream['nb_frames']))!=(960,540,round(duration*b.FPS)):
   raise RuntimeError('Cached fallback picture does not match the complete edit')
 else:
  log=WORK/'fallback-pass'
  common=['-i',masters['en'],'-map','0:v:0','-vf','scale=960:540:flags=lanczos','-c:v','libx264','-threads','2','-preset','fast','-b:v',str(bitrate),'-maxrate',str(int(bitrate*1.4)),'-bufsize',str(int(bitrate*2.8)),'-profile:v','high','-level','3.1','-pix_fmt','yuv420p','-g','48','-keyint_min','48','-sc_threshold','0','-passlogfile',log,'-t',duration]
  ff(*common,'-pass','1','-an','-f','null',os.devnull)
  ff(*common,'-pass','2','-an','-movflags','+faststart',picture)
  write(record,{'sourcePictureSha256':source_sha,'sha256':b.sha256(picture),
   'duration':duration,'fps':24,'width':960,'height':540,'videoBitrate':bitrate})
 result={}
 for lang in masters:
  output=OUT/f'relic-prologue-v8-4-{lang}.mp4'
  ff('-i',picture,'-i',masters[lang],'-map','0:v:0','-map','1:a:0','-c:v','copy',
   '-af',FALLBACK_AUDIO_FILTER,'-c:a','aac','-b:a','80k','-ar','48000','-ac','2',
   '-t',duration,'-movflags','+faststart',output)
  if output.stat().st_size>=LIMIT:raise RuntimeError('Fallback exceeds24MiB')
  result[lang]={**meta(output),'src':'./assets/prologue/'+output.name,'width':960,'height':540,
   'videoBitrate':bitrate,'audioBitrate':80000,'audioProcessing':FALLBACK_AUDIO_FILTER,
   'audioContext':'Oversampled transient limiter preserves headroom before 80 kbps AAC encoding; no automatic makeup gain.'}
 return result

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--visuals-only',action='store_true');parser.add_argument('--audio-only',action='store_true');args=parser.parse_args()
 planpath=ROOT/'tools/film/scripts/prologue-edit-v8.json';plan=json.loads(planpath.read_text());duration=sum(x['duration'] for x in plan['shots'])
 WORK.mkdir(exist_ok=True);OUT.mkdir(exist_ok=True);b.WORK=WORK;b.OUTPUT=OUT
 for s in plan['shots']:
  if s.get('file'):b.source_file(s['file'])
 silent=build_visuals(plan,args.audio_only)
 if args.visuals_only:print('Checked common V8 picture ready.',flush=True);return
 narration=json.loads((ROOT/'media-work/v8-narration/manifest.json').read_text())
 if narration.get('partial') or not narration.get('allLinesFit'):raise RuntimeError('Bilingual narration must be complete and fit')
 if narration.get('scriptSha256')!=b.sha256(ROOT/'tools/film/scripts/prologue-narration-v8.json'):raise RuntimeError('The narration does not match the current bilingual script')
 masters={};details={}
 for lang in ['en','fr']:
  master,records,mastering=mix_language(plan,narration,lang,silent,duration);masters[lang]=master
  details[lang]={'audioSources':records,'mastering':mastering,'masterSha256':b.sha256(master)}
  print('Mixed complete '+lang+' soundtrack.',flush=True)
 b.WORK=WORK
 hls=build_hls(masters);fallbacks=fallback(masters,duration)
 poster=OUT/'poster-v8.jpg';ff('-ss',min(max(float(plan.get('posterAt',75)),0),duration-.1),'-i',silent,'-frames:v','1','-vf','scale=1280:720','-q:v','3',poster)
 encoding={'version':8,'revision':'8.4','duration':duration,'fps':24,'videoCodec':'H.264','audioCodec':'AAC','crossfadeSeconds':plan.get('crossfadeSeconds',.75),'visualRenderer':RENDER_REVISION,'pictureFrames':round(duration*b.FPS),'width':1280,'height':720,'hls':hls,'fallbacks':fallbacks,'poster':meta(poster),'languages':details,'narration':{'synthetic':True,'voices':narration['voices'],'scriptSha256':narration['scriptSha256'],'lineCount':len(narration['lines'])},'musicCredit':plan['music'][0]['credit'],'editPlanSha256':b.sha256(planpath),'narrationManifestSha256':b.sha256(ROOT/'media-work/v8-narration/manifest.json')}
 write(OUT/'encoding-v8.json',encoding);print(json.dumps({'duration':duration,'hlsBytes':hls['totalBytes'],'hlsFiles':len(hls['files']),'fallbackBytes':{l:r['bytes'] for l,r in fallbacks.items()}}),flush=True)
if __name__=='__main__':main()
