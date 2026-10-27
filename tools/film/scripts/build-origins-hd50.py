"""Rebuild the existing 65-second NASA origins montage from retained HD masters.

The original six-clip edit and its 1.1-second dissolves are preserved. The two
7.75-second excerpts become 7.76 and 7.74 seconds on the 50 fps grid, so the full
montage remains exactly 65 seconds. No footage, camera motion or intermediate
frames are synthesized. 720p early-Earth footage is explicitly enlarged.
"""
from __future__ import annotations
import argparse,hashlib,json,subprocess,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
FPS,WIDTH,HEIGHT=50,1920,1080
SOURCES=[
 {'id':'big-bang','file':'cosmos/big-bang-1080-original.mov','in':0,'sourceLength':13,'frames':650,'crop':None},
 {'id':'disk','file':'cosmos/Shot_09_Protoplanetary_Disk_4k.webm','in':0,'sourceLength':19,'frames':950,'crop':'crop=3840:2160:960:0'},
 {'id':'early-earth','file':'cosmos/early-earth-original.mov','in':9,'sourceLength':10,'frames':500,'crop':None},
 {'id':'bombardment','file':'cosmos/Shot_21_Protoplanet_Bombardment_4k.webm','in':.125,'sourceLength':7.75,'frames':388,'crop':'crop=3840:2160:960:0'},
 {'id':'lava','file':'cosmos/Shot_21pt2_Protoplanets_Surface_4k.webm','in':.125,'sourceLength':7.75,'frames':387,'crop':'crop=3840:2160:960:0'},
 {'id':'oceans','file':'cosmos/earth-oceans-original.mp4','in':3,'sourceLength':13,'frames':650,'crop':'crop=1792:1008:64:0'},
]

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def probe(path):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--media-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
 media=args.media_root.resolve();output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
 inputs=[];filters=[];audit=[]
 for i,s in enumerate(SOURCES):
  path=(media/s['file']).resolve()
  if not path.is_relative_to(media) or not path.is_file():raise ValueError('Missing source '+s['file'])
  info=probe(path);video=next(x for x in info['streams'] if x['codec_type']=='video')
  inputs+=['-threads','1','-ss',str(s['in']),'-t',str(s['sourceLength']),'-i',str(path)]
  chain=['setpts=PTS-STARTPTS',f'fps={FPS}']
  if s['crop']:chain.append(s['crop'])
  chain += [f'scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos',f'crop={WIDTH}:{HEIGHT}', 'setsar=1','tpad=stop_mode=clone:stop_duration=0.06',f'trim=end_frame={s["frames"]}',f'setpts=N/({FPS}*TB)',f'fps={FPS}',f'settb=1/{FPS}','format=yuv420p']
  filters.append(f'[{i}:v]'+','.join(chain)+f'[s{i}]')
  audit.append({**s,'width':video['width'],'height':video['height'],'fps':video['avg_frame_rate'],'sha256':sha(path),'outputDuration':s['frames']/FPS})
 prior='s0';offset=0
 for i in range(1,len(SOURCES)):
  offset+=SOURCES[i-1]['frames']/FPS-1.1
  label=f'x{i}';filters.append(f'[{prior}][s{i}]xfade=transition=fade:duration=1.1:offset={offset:.8f},fps=50,settb=1/50[{label}]');prior=label
 filters.append(f'[{prior}]trim=end_frame=3250,setpts=N/(50*TB),format=yuv420p[v]')
 started=time.monotonic()
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex_threads','1','-filter_complex',';'.join(filters),'-map','[v]','-an','-frames:v','3250','-c:v','libx264','-threads','1','-preset','fast','-crf','18','-maxrate','8000000','-bufsize','16000000','-profile:v','high','-level','4.2','-pix_fmt','yuv420p','-g','100','-keyint_min','100','-sc_threshold','0','-x264-params','repeat-headers=1:open-gop=0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-r','50','-video_track_timescale','12800','-map_metadata','-1','-movflags','+faststart',str(output)],check=True)
 info=probe(output);video=next(x for x in info['streams'] if x['codec_type']=='video')
 assert (video['width'],video['height'],video['avg_frame_rate'],int(video['nb_frames']))==(1920,1080,'50/1',3250),video
 assert abs(float(info['format']['duration'])-65)<1e-6,info['format']
 report={'renderer':'native-origins-hd50-1','output':str(output),'width':1920,'height':1080,'fps':50,'frames':3250,'duration':65,'bytes':output.stat().st_size,'sha256':sha(output),'crossfadeSeconds':1.1,'sources':audit,'elapsedSeconds':round(time.monotonic()-started,1),'frameRatePolicy':'Source frames are selected/repeated onto 50 fps; no optical-flow-generated frames.','timingPolicy':'The two original 7.75-second excerpts occupy388 and387 frames respectively; the complete edit remains65seconds.'}
 output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='sources'}),flush=True)
if __name__=='__main__':main()
