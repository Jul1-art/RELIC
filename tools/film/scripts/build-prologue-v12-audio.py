import json,subprocess,hashlib
from pathlib import Path
import numpy as np
import argparse
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
RATE=48000;work=args.work.resolve();total=731*RATE;release=work/'v12-0-hd50';report={'revision':'12.0-hd50','duration':731,'music':[],'languages':{}}
def ff(*args,cwd=None):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],cwd=cwd,check=True)
def decode(source,name,normalize=None):
 target=work/(name+'.f32')
 if not target.exists():ff('-i',source,*(['-af',normalize] if normalize else []),'-f','f32le','-ar',RATE,'-ac',2,target)
 return np.memmap(target,mode='r',dtype='<f4').reshape(-1,2)
def fade(data,fi,fo):
 result=np.array(data,copy=True);a=min(len(result),round(fi*RATE));b=min(len(result),round(fo*RATE))
 if a:result[:a]*=np.sin(np.linspace(0,np.pi/2,a,dtype=np.float32))[:,None]
 if b:result[-b:]*=np.cos(np.linspace(0,np.pi/2,b,dtype=np.float32))[:,None]
 return result
music=np.zeros((total,2),dtype=np.float32)
playlist=[('helios.oga',0,0,243,3,6),('theclimb.oga',237,35,143.65,6,4),('aurora.mp3',395.3,40,145,4,8),('helios.oga',533,120,86,8,8),('theclimb.oga',607,90,67,8,8),('aurora.mp3',665,200,55.8,8,5)]
for name,at,source_in,length,fi,fo in playlist:
 data=decode(work/'assets'/name,name,'loudnorm=I=-25:TP=-6:LRA=8');first=round(source_in*RATE);count=round(length*RATE);assert first+count<=len(data)
 music[round(at*RATE):round(at*RATE)+count]+=fade(data[first:first+count],fi,fo)
 report['music'].append(dict(file=name,at=at,sourceIn=source_in,length=length,fadeIn=fi,fadeOut=fo,license='CC BY 4.0',author='Scott Buckley'))
# Genuine Sputnik beeps: let the music recede before them rather than cutting.
a,b=round(131.6*RATE),round(134.9*RATE);n=round(2.5*RATE);music[a-n:a]*=np.cos(np.linspace(0,np.pi/2,n,dtype=np.float32))[:,None];music[a:b]=0;music[b:b+n]*=np.sin(np.linspace(0,np.pi/2,n,dtype=np.float32))[:,None]
manifest=json.loads((work/'narration/manifest.json').read_text(encoding='utf-8'));plan=json.loads((ROOT/'tools/film/scripts/prologue-edit-v11.json').read_text(encoding='utf-8'))
for lang in ['en','fr']:
 mix=np.array(music,copy=True);duck=np.ones(total,dtype=np.float32);spoken=[r for r in manifest['lines'] if r['language']==lang]
 def envelope(start,end,level=.42,attack=.8,release=3):
  a,b=round(start*RATE),round(end*RATE);left=max(0,a-round(attack*RATE));right=min(total,b+round(release*RATE));duck[a:b]=np.minimum(duck[a:b],level)
  if a>left:duck[left:a]=np.minimum(duck[left:a],1-(1-level)*np.sin(np.linspace(0,np.pi/2,a-left,dtype=np.float32))**2)
  if right>b:duck[b:right]=np.minimum(duck[b:right],level+(1-level)*np.sin(np.linspace(0,np.pi/2,right-b,dtype=np.float32))**2)
 for row in spoken:envelope(row['at'],row['end'])
 for archive in plan['archivalAudio']:
  at=archive['at']-(6 if archive['at']>=495 else 0);envelope(at,at+archive['length'],.03,.8,2)
 mix*=duck[:,None];del duck
 for row in spoken:
  samples=decode(work/Path(row['file'].replace('\\','/')),row['id']+'-'+lang);peak=float(np.max(np.abs(samples)));active=samples[np.abs(samples)>.01];rms=float(np.sqrt(np.mean(active*active))) if len(active) else .1;gain=min(.65/max(peak,.001),.13/max(rms,.001));a=round(row['at']*RATE);mix[a:a+len(samples)]+=samples*gain
 original=decode(work/f'source-{lang}.m4a','original-'+lang)
 for archive in plan['archivalAudio']:
  old=archive['at'];at=old-(6 if old>=495 else 0);a=round(at*RATE);first=round(old*RATE);count=round(archive['length']*RATE)
  mix[a:a+count]+=fade(original[first:first+count],.04,.18)
 assert not np.any(mix[721*RATE:]);assert np.isfinite(mix).all()
 raw=work/f'mix-{lang}.f32';mix.tofile(raw);del mix
 target=work/f'master-{lang}.m4a'
 # Master limiter/normalization preserves the continuous sample clock.
 ff('-f','f32le','-ar',RATE,'-ac',2,'-i',raw,'-af','loudnorm=I=-18:TP=-2:LRA=9','-ar',RATE,'-c:a','aac','-b:a','192k',target)
 folder=release/f'audio-{lang}';folder.mkdir(parents=True,exist_ok=True)
 ff('-i',target,'-ss',0,'-map','0:a','-c','copy','-f','hls','-hls_time',8,'-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_flags','independent_segments','-hls_fmp4_init_filename','init.mp4','-hls_segment_filename','segment-%03d.m4s','index.m3u8',cwd=folder)
 report['languages'][lang]={'paragraphs':len(spoken),'duration':731,'silentBrandStart':721}
 print('Mixed',lang,flush=True)
(work/'audio-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
