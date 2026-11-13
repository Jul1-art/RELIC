import json,subprocess
from pathlib import Path
import numpy as np
import argparse
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--work',type=Path,required=True);args=parser.parse_args()
work=args.work.resolve();manifest=json.loads((work/'narration/manifest.json').read_text(encoding='utf-8'));result={'revision':'12.0-hd50','paragraphs':[],'archivalSignals':[],'passed':True};silence=[]
def decoded(path,target):
 if not target.exists():subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*(['-allowed_extensions','ALL'] if str(path).endswith('.m3u8') else []),'-i',str(path),'-f','f32le','-ar','48000','-ac','2',str(target)],check=True)
 return np.memmap(target,dtype='<f4',mode='r').reshape(-1,2)
def alignment(reference,data,at):
 ref=reference[:min(len(reference),4*48000):4].mean(axis=1).astype(np.float64);ref-=ref.mean();norm=np.linalg.norm(ref);best=(-2,0)
 for lag in range(-240,241,4):
  start=round(at*48000)+lag
  if start<0:continue
  test=data[start:start+len(ref)*4:4].mean(axis=1).astype(np.float64);test-=test.mean();c=float(np.dot(ref,test)/(norm*np.linalg.norm(test)))
  if c>best[0]:best=(c,lag)
 return best
for language in ['en','fr']:
 data=decoded(work/f'v12-0-hd50/audio-{language}/index.m3u8',work/f'delivered-hls-{language}.f32')
 for row in manifest['lines']:
  if row['language']!=language:continue
  ref=decoded(work/row['file'],work/(row['id']+'-'+language+'.f32'));correlation,lag=alignment(ref,data,row['at']);passed=correlation>.8 and abs(lag)<=240;result['passed'] &= passed
  result['paragraphs'].append({'id':row['id'],'language':language,'at':row['at'],'waveformCorrelation':correlation,'lagSamples':lag,'lagSeconds':lag/48000,'passed':passed})
 old=np.memmap(work/f'original-{language}.f32',dtype='<f4',mode='r').reshape(-1,2);ref=old[round(131.7*48000):round(134.8*48000)];correlation,lag=alignment(ref,data,131.7);result['archivalSignals'].append({'id':'sputnik-original-signal','language':language,'at':131.7,'waveformCorrelation':correlation,'lagSamples':lag})
 maximum=float(np.max(np.abs(data[721*48000:731*48000])));silence.append({'language':language,'start':721,'end':731,'maximumAbsoluteSample':maximum});result['passed'] &= maximum<=1e-5
 print(language,'min correlation',min(r['waveformCorrelation'] for r in result['paragraphs'] if r['language']==language),'silent peak',maximum,flush=True)
result['silentFinalCard']=silence;(work/'alignment-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print('Passed',result['passed']);assert result['passed']

import av
frames=0;last=None;first=None
with av.open(str(work/'v12-0-hd50/video/index.m3u8')) as container:
 stream=container.streams.video[0];stream.codec_context.thread_count=4
 assert float(stream.average_rate)==50
 for frame in container.decode(stream):
  assert (frame.width,frame.height)==(1920,1080)
  at=float(frame.pts*frame.time_base)
  if first is None:first=at
  if last is not None:assert abs(at-last-.02)<1e-6
  frames+=1;last=at
 assert frames==36550
 assert float(frame.to_ndarray(format='gray').mean())<2
picture={'passed':True,'fullDecodePassed':True,'pictureFrames':frames,'width':1920,'height':1080,'fps':50,'firstVideoPtsSeconds':first,'lastVideoPtsSeconds':last,'finalFrameBlack':True}
(work/'picture-report.json').write_text(json.dumps(picture,indent=2)+'\n',encoding='utf-8')
print('Full HLS picture decode passed:',frames)
