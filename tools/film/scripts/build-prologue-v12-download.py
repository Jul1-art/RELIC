import json,subprocess,hashlib,importlib.util
from pathlib import Path
from fractions import Fraction
import av
from PIL import Image,ImageDraw,ImageFont
import argparse
root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);parser.add_argument('--font',type=Path,default=Path('C:/Windows/Fonts/segoeuil.ttf'));args=parser.parse_args();work=args.work.resolve();out=work/'download';out.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('encoder',root/'tools/film/scripts/build-prologue-v10.py');encoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(encoder)
image=Image.new('RGB',(1920,1080),'black');logo=Image.open(root/'assets/relic-logo-v1.png').convert('RGBA');logo.thumbnail((168,148));image.paste(logo,((1920-logo.width)//2,400),(logo.getchannel('A')))
draw=ImageDraw.Draw(image);font=ImageFont.truetype(str(args.font),44);text='R E L I C';bbox=draw.textbbox((0,0),text,font=font);draw.text(((1920-(bbox[2]-bbox[0]))/2,580),text,font=font,fill='white');image.save(out/'brand.png')
with av.open(str(work/'picture.mp4')) as src:
 template=src.streams.video[0];packets=[p for p in src.demux(template) if p.dts is not None and p.size]
 brand=encoder.encode('ffmpeg',['-loop',1,'-framerate',50,'-i',out/'brand.png'],out/'brand.mp4',10,'fade=t=in:st=0.15:d=1.3',template)
 with av.open(str(out/'picture.mp4'),'w',options={'movflags':'+faststart'}) as dest:
  stream=dest.add_stream_from_template(template);stream.time_base=Fraction(1,12800)
  for i,p in enumerate(packets[:721*50]+brand):
   q=av.Packet(bytes(p));q.dts=(i-2)*256;q.pts=q.dts+p.pts-p.dts;q.duration=256;q.time_base=Fraction(1,12800);q.is_keyframe=p.is_keyframe;q.stream=stream;dest.mux(q)
text=(root/'intro/prologue-data-v8.js').read_text(encoding='utf-8');media,_=json.JSONDecoder().raw_decode(text.split('export const PROLOGUE_MEDIA=Object.freeze(',1)[1])
def stamp(t):
 n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
for lang in ['en','fr']:
 lines=[]
 for cue in media['captions'][lang]:
  if cue['kind'] in ['visual','end']:continue
  text=cue['title'].get(lang) or cue['title'].get('en') or cue['title'].get('fr')
  if text:lines.append(f'{len(lines)+1}\n{stamp(cue["start"])} --> {stamp(cue["end"])}\n{text}\n')
 (out/f'{lang}.srt').write_text('\n'.join(lines),encoding='utf-8')
file=out/'RELIC-film-1080p50-EN-FR.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(out/'picture.mp4'),'-i',str(work/'master-en.m4a'),'-i',str(work/'master-fr.m4a'),'-i',str(out/'en.srt'),'-i',str(out/'fr.srt'),'-map','0:v','-map','1:a','-map','2:a','-map','3:s','-map','4:s','-map_metadata','-1','-c:v','copy','-c:a','copy','-c:s','mov_text','-metadata:s:a:0','language=eng','-metadata:s:a:0','title=English','-metadata:s:a:1','language=fra','-metadata:s:a:1','title=Français','-metadata:s:s:0','language=eng','-metadata:s:s:1','language=fra','-disposition:a:0','default','-disposition:a:1','0','-disposition:s:0','0','-disposition:s:1','0','-metadata','title=RELIC — The story of space exploration','-metadata','artist=RELIC','-metadata','comment=Music: Helios, The Climb and Aurora by Scott Buckley, CC BY 4.0. Edited, crossfaded and normalized. https://www.scottbuckley.com.au/library/ | Archive credits: https://github.com/Jul1-art/RELIC','-movflags','+faststart',str(file)],check=True)
sha=hashlib.sha256(file.read_bytes()).hexdigest();(out/'SHA256SUMS.txt').write_text(sha+'  '+file.name+'\n',encoding='utf-8');(out/'download.json').write_text(json.dumps({'filename':file.name,'bytes':file.stat().st_size,'sha256':sha,'url':'https://github.com/Jul1-art/RELIC/releases/download/film-v12-0-hd50/'+file.name,'audioLanguages':['en','fr'],'subtitleLanguages':['en','fr']},indent=2)+'\n',encoding='utf-8');print('Ready',file.stat().st_size,sha,flush=True)
