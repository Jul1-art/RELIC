"""Rebuild RELIC's checked edit as a shared 1920x1080, 50 fps HLS picture.

Uses the retained original licensed footage, rather than enlarging the low-bitrate
fallback. Historical/720p footage is explicitly upscaled and frame-rate resampled;
this does not claim native HD or new photographic detail. Localized mixed audio is
copied byte-for-byte from the approved V8.4 release. Runtime is HLS-only, because
an eight-minute high-quality HD MP4 exceeds the static host's per-file limit.

Requires FFmpeg/FFprobe and the separately retained media inputs. Does not download
sources or synthesize frames/audio. --media-root points at that input collection.
"""
from __future__ import annotations
import argparse,hashlib,json,math,os,shutil,subprocess,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
FPS,WIDTH,HEIGHT=50,1920,1080
REVISION='8.5-hd50'
MAXRATE=3000000
RENDERER='original-source-hd50-pieces-1'

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def probe(path):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
def write(path,obj):
 path=Path(path);temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n');temp.replace(path)
def ff(*args):
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
def metadata(path,out):
 return {'path':str(path.relative_to(out)),'bytes':path.stat().st_size,'sha256':sha(path)}
def frame_count(t):
 frames=round(float(t)*FPS)
 if abs(frames/FPS-float(t))>1e-8 or frames<=0:raise ValueError('Off-grid duration')
 return frames

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--media-root',type=Path,required=True)
 parser.add_argument('--work',type=Path,required=True)
 parser.add_argument('--output',type=Path,default=ROOT/'intro/assets/prologue')
 parser.add_argument('--plan',type=Path,default=ROOT/'tools/film/scripts/prologue-edit-v8.json')
 parser.add_argument('--crf',type=int,default=23)
 parser.add_argument('--only-piece',type=int,help='Encode one edit piece for a bounded smoke check, without packaging')
 parser.add_argument('--review-mp4',action='store_true')
 parser.add_argument('--native-origins',type=Path,help='Checked65s montage produced by build-origins-hd50.py')
 parser.add_argument('--use-native-source-upgrades',action='store_true',help='Use retained native1080p60 nightlights/finale and original60fps Falcon9 footage')
 args=parser.parse_args();media=args.media_root.resolve();work=args.work.resolve();out=args.output.resolve()
 work.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
 plan=json.loads(args.plan.read_text());shots=plan['shots'];duration=sum(float(s['duration']) for s in shots)
 source_upgrades=[]
 if args.use_native_source_upgrades:
  for shot in shots:
   prior=shot.get('file')
   if prior=='v6-origins/humanity-nightlights-9s.mp4':
    shot.update(file='v6-origins/nightlights-nodates-original.mp4',**{'in':float(shot.get('in',0))+7,'sourceLength':9})
   elif prior=='v6-origins/solar-system-pullout-crop-20s.mp4':
    shot.update(file='v6-origins/solar-system-eic-original.mp4',crop='crop=1920:1080:960:0',sourceLength=min(float(shot['duration']),20-float(shot.get('in',0))))
   elif prior=='v6-falcon/falcon9-sentinel6-landing-12s.mp4':
    shot.update(file='v6-falcon/falcon9-sentinel6-landing-original.webm',**{'in':float(shot.get('in',0))+7,'sourceLength':12})
   if prior!=shot.get('file'):source_upgrades.append({'shot':shot['id'],'replacedDerivative':prior,'originalSource':shot['file'],'sourceIn':shot.get('in',0),'sourceLength':shot.get('sourceLength'),'crop':shot.get('crop')})
 original_encoding=json.loads((out/'encoding-v8.json').read_text())
 def source(name):
  if name=='v6-origins/origins-continuous-65s.mp4' and args.native_origins:
   p=args.native_origins.resolve()
   if not p.is_file():raise ValueError('Native origins master missing; run build-origins-hd50.py first')
   return p
  p=(media/name).resolve()
  if not p.is_relative_to(media) or not p.is_file():raise ValueError('Missing media input: '+name)
  return p
 sources={}
 for name in sorted({s['file'] for s in shots if s.get('file')}):
  path=source(name);info=probe(path);s=next(x for x in info['streams'] if x['codec_type']=='video')
  sources[name]={'file':name,'width':s['width'],'height':s['height'],'fps':s.get('avg_frame_rate'),'duration':float(info['format']['duration']),'sha256':sha(path)}
 if args.native_origins:
  origins_info=sources['v6-origins/origins-continuous-65s.mp4']
  if (origins_info['width'],origins_info['height'],origins_info['fps'])!=(WIDTH,HEIGHT,'50/1') or abs(origins_info['duration']-65)>.001:raise ValueError('Native origins master must be1080p50 and65s')
  provenance=args.native_origins.with_suffix('.json')
  if not provenance.is_file():raise ValueError('Native origins integrity/provenance report missing')
  report=json.loads(provenance.read_text())
  if report.get('sha256')!=origins_info['sha256']:raise ValueError('Native origins master integrity mismatch')
  source_upgrades.append({'shot':'origins','replacedDerivative':'v6-origins/origins-continuous-65s.mp4','originalSources':report.get('sources',report.get('clips',[])),'nativeMasterSha256':origins_info['sha256']})
 write(work/'source-audit.json',list(sources.values()))
 transitions=[]
 for i,shot in enumerate(shots):
  length=0 if i==len(shots)-1 else round(float(shot.get('transitionOut',plan.get('crossfadeSeconds',.75)))*FPS)/FPS
  kind=shot.get('transitionType','fade') if length else 'cut'
  if kind=='cut':length=0
  if kind not in ['cut','fade','fadeblack']:raise ValueError('Unsupported transition')
  transitions.append((length,kind))
 def normalized_input(shot,index,tail=None):
  length=float(shot['duration'])+transitions[index][0]
  if not shot.get('file'):
   inputs=['-f','lavfi','-i',f'color=c=black:s={WIDTH}x{HEIGHT}:r={FPS}:d={length}']
   filters=[]
  else:
   record=sources[shot['file']];start=float(shot.get('in',0))
   consumed=min(record['duration']-start,length,float(shot.get('sourceLength',length)))
   if start<0 or consumed<=0:raise ValueError('No source frames for '+shot['id'])
   inputs=['-threads','1','-ss',str(start),'-i',source(shot['file'])]
   filters=[f'trim=duration={consumed:.10f}', 'setpts=PTS-STARTPTS' if shot.get('preserveSpeed') else f'setpts={length/consumed:.10f}*(PTS-STARTPTS)', f'tpad=stop_mode=clone:stop_duration={max(0,length-consumed)+.1:.10f}',f'fps={FPS}']
   if shot['id']=='relic':
    # The final source has only one second left. Pad in the delivery frame
    # domain and regenerate timestamps: padding before fps can leave repeated
    # source timestamps that fps discards, shortening the eight-second card.
    filters=[f'fps={FPS}',f'trim=duration={consumed:.10f}','setpts=PTS-STARTPTS',f'tpad=stop_mode=clone:stop={frame_count(length)}',f'setpts=N/({FPS}*TB)']
  if tail is not None:
   filters += [f'trim=start={float(shot["duration"]):.10f}:end={float(shot["duration"])+tail:.10f}','setpts=PTS-STARTPTS']
  else:filters += [f'trim=end_frame={frame_count(float(shot["duration"]))}','setpts=PTS-STARTPTS']
  if shot.get('crop'):filters.append(shot['crop'])
  if shot.get('fit')=='contain':filters += [f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos',f'pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black']
  else:filters += [f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos',f'crop={WIDTH}:{HEIGHT}']
  if shot.get('monochrome'):filters.append('hue=s=0')
  filters += ['setsar=1',f'fps={FPS}',f'settb=1/{FPS}','format=yuv420p']
  return inputs,','.join(filters)
 pieces=[];started=time.monotonic();clock=0
 for i,shot in enumerate(shots):
  if args.only_piece is not None and i!=args.only_piece:continue
  current_inputs,current_filter=normalized_input(shot,i)
  incoming,kind=transitions[i-1] if i else (0,'cut')
  target=work/f'piece-{i:02d}.mp4';record=work/f'piece-{i:02d}.json';frames=frame_count(shot['duration'])
  fingerprint=hashlib.sha256(json.dumps({'renderer':RENDERER,'shot':shot,'incoming':incoming,'kind':kind,'currentSource':sources.get(shot.get('file')),'previousShot':shots[i-1] if incoming else None,'previousSource':sources.get(shots[i-1].get('file')) if incoming else None,'fps':FPS,'width':WIDTH,'height':HEIGHT,'crf':args.crf,'maxrate':MAXRATE,'finitePadCfr':True if incoming else None,**({'finiteEndCardHold':True} if shot['id']=='relic' else {})},sort_keys=True).encode()).hexdigest()
  saved=json.loads(record.read_text()) if record.exists() else {}
  if not (target.is_file() and saved.get('fingerprint')==fingerprint and saved.get('sha256')==sha(target)):
   if incoming:
    previous_inputs,previous_filter=normalized_input(shots[i-1],i-1,tail=incoming)
    inputs=previous_inputs+current_inputs
    graph=f'[0:v]{previous_filter}[p];[1:v]{current_filter}[c];[p][c]xfade=transition={kind}:duration={incoming:.10f}:offset=0,fps={FPS},trim=end_frame={frames},setpts=N/({FPS}*TB),fps={FPS},settb=1/{FPS},format=yuv420p[v]'
    filtering=['-filter_complex_threads','1','-filter_complex',graph,'-map','[v]']
   else:
    inputs=current_inputs;filtering=['-vf',current_filter]
   ff(*inputs,*filtering,'-frames:v',frames,'-an','-map_metadata','-1','-map_chapters','-1','-c:v','libx264','-threads','2','-preset','fast','-crf',args.crf,'-maxrate',MAXRATE,'-bufsize',MAXRATE*2,'-pix_fmt','yuv420p','-profile:v','high','-level','4.2','-g',100,'-keyint_min',100,'-sc_threshold',0,'-x264-params','repeat-headers=1:open-gop=0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-r',FPS,'-video_track_timescale',12800,'-movflags','+faststart',target)
   info=probe(target);stream=next(x for x in info['streams'] if x['codec_type']=='video')
   if int(stream['nb_frames'])!=frames or stream['avg_frame_rate']!='50/1' or (stream['width'],stream['height'])!=(WIDTH,HEIGHT) or abs(float(info['format']['duration'])-float(shot['duration']))>.001:raise RuntimeError('Bad piece '+shot['id'])
   write(record,{'fingerprint':fingerprint,'sha256':sha(target),'frames':frames,'duration':shot['duration']})
  pieces.append(target);clock+=shot['duration'];print(json.dumps({'piece':i+1,'total':len(shots),'id':shot['id'],'clock':clock,'elapsed':round(time.monotonic()-started,1),'bytes':target.stat().st_size}),flush=True)
 if args.only_piece is not None:return
 listing=work/'concat.txt';listing.write_text(''.join(f"file '{p.name}'\n" for p in pieces))
 silent=work/'picture-hd50.mp4'
 ff('-f','concat','-safe','0','-i',listing,'-map','0:v:0','-c:v','copy','-an','-map_metadata','-1','-r',FPS,'-video_track_timescale',12800,'-movflags','+faststart',silent)
 info=probe(silent);s=next(x for x in info['streams'] if x['codec_type']=='video')
 if int(s['nb_frames'])!=frame_count(duration) or s['avg_frame_rate']!='50/1' or abs(float(info['format']['duration'])-duration)>.001:raise RuntimeError('Bad complete HD master')
 target=out/('v'+REVISION.replace('.','-'))
 if target.exists():shutil.rmtree(target)
 (target/'video').mkdir(parents=True)
 ff('-i',silent,'-map','0:v:0','-an','-c:v','copy','-tag:v','avc1','-f','hls','-hls_time',8,'-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_fmp4_init_filename','init.mp4','-hls_flags','independent_segments','-hls_segment_filename',target/'video/segment-%03d.m4s',target/'video/index.m3u8')
 for language in ['en','fr']:
  shutil.copytree(out/f'v8-4/audio-{language}',target/f'audio-{language}')
  name='English' if language=='en' else 'Français'
  average=math.ceil(silent.stat().st_size*8/duration+192000)
  (target/(language+'.m3u8')).write_text('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-INDEPENDENT-SEGMENTS\n'+f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="voice",NAME="{name}",LANGUAGE="{language}",DEFAULT=YES,AUTOSELECT=YES,URI="audio-{language}/index.m3u8"\n'+f'#EXT-X-STREAM-INF:BANDWIDTH=3600000,AVERAGE-BANDWIDTH={average},CODECS="avc1.64002a,mp4a.40.2",RESOLUTION={WIDTH}x{HEIGHT},FRAME-RATE=50.000,AUDIO="voice"\nvideo/index.m3u8\n')
  if args.review_mp4:ff('-i',silent,'-i',target/f'audio-{language}/index.m3u8','-map','0:v:0','-map','1:a:0','-c','copy','-t',duration,'-movflags','+faststart',work/f'review-{language}-1080p50.mp4')
 poster=out/f'poster-v{REVISION.replace(".","-")}.jpg';ff('-ss',plan.get('posterAt',75),'-i',silent,'-frames:v',1,'-q:v',2,poster)
 files=[metadata(p,out) for p in sorted(target.rglob('*')) if p.is_file()]
 if max(r['bytes'] for r in files)>=25*1024*1024:raise RuntimeError('An HLS resource exceeds the host limit')
 encoding={**original_encoding,'revision':REVISION,'fps':FPS,'width':WIDTH,'height':HEIGHT,'pictureFrames':frame_count(duration),'visualRenderer':RENDERER,'hls':{'width':WIDTH,'height':HEIGHT,'fps':FPS,'type':'VOD fMP4, shared video with localized mixed audio','segmentSeconds':8,'audioBitrate':192000,'files':files,'totalBytes':sum(r['bytes'] for r in files),'languages':{l:f'./assets/prologue/{target.name}/{l}.m3u8' for l in ['en','fr']}},'poster':metadata(poster,out),'quality':{'delivery':'1920x1080 progressive 50 frames per second','sourcePolicy':'Rebuilt from retained original source clips, never enlarged from the low-bitrate fallback. Native1080/4K sources and60fps originals are used where retained and traceable; lower-resolution archival footage is upscaled with Lanczos; source frame rates are resampled by selecting/repeating frames. No optical-flow-generated frames or invented archival detail.','native1080OrHigherFiles':[r['file'] for r in sources.values() if r['width']>=1920 and r['height']>=1080],'sourceAudit':list(sources.values()),'nativeSourceUpgrades':source_upgrades,'runtimeFallback':'HLS-only HD delivery; full-resolution review MP4s remain local because they exceed the static host per-file limit.'}}
 encoding.pop('fallbacks',None);encoding.pop('fallback',None)
 write(out/'encoding-v8-5-hd50.json',encoding)
 report={'revision':REVISION,'duration':duration,'fps':FPS,'frames':int(s['nb_frames']),'width':s['width'],'height':s['height'],'videoBytes':silent.stat().st_size,'hlsBytes':encoding['hls']['totalBytes'],'largestAsset':max(files,key=lambda r:r['bytes']),'fileCount':len(files),'elapsed':round(time.monotonic()-started,1),'metadata':str(out/'encoding-v8-5-hd50.json'),'directory':str(target)}
 write(work/'report.json',report);print(json.dumps(report),flush=True)

if __name__=='__main__':main()
