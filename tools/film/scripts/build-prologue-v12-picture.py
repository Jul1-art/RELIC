import av,importlib.util,json
from pathlib import Path
from fractions import Fraction
import argparse
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
root=ROOT;work=args.work.resolve();source=work/'source-video.mp4'
spec=importlib.util.spec_from_file_location('builder',root/'tools/film/scripts/build-prologue-v10.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
with av.open(str(source)) as src:
 template=src.streams.video[0];packets=[p for p in src.demux(template) if p.dts is not None and p.size]
 fade=builder.encode('ffmpeg',['-ss','725','-i',source],work/'final-fade.mp4',2,'fade=t=out:st=0:d=2',template)
 dest=av.open(str(work/'picture.mp4'),'w',options={'movflags':'+faststart'});out=dest.add_stream_from_template(template);out.time_base=Fraction(1,12800)
 intervals=[(0,24450),(24750,36250),(36250,36350),(36800,37300)];n=0
 for begin,end in intervals:
  assert packets[begin].is_keyframe
  selected=fade if begin==36250 else packets[begin:end]
  for i,p in enumerate(selected):
   q=av.Packet(bytes(p));q.dts=(n-2)*256;q.pts=q.dts+p.pts-p.dts;q.duration=256;q.time_base=Fraction(1,12800);q.is_keyframe=p.is_keyframe;q.stream=out;dest.mux(q);n+=1
 dest.close();assert n==731*50
print('Picture ready',n,flush=True)
release=work/'v12-0-hd50';(release/'video').mkdir(parents=True,exist_ok=True)
builder.run('ffmpeg','-i',work/'picture.mp4','-map','0:v','-c','copy','-f','hls','-hls_time','8','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_flags','independent_segments','-hls_fmp4_init_filename','init.mp4','-hls_segment_filename','segment-%03d.m4s','index.m3u8',cwd=release/'video')
