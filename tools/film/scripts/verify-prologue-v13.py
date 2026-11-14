import argparse,hashlib,json
from pathlib import Path
import av
ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--work',type=Path,required=True);a=p.parse_args();work=a.work.resolve();source=a.source.resolve()
def signature(file,index,skipPriming=False):
 h=hashlib.sha256();count=0;first=None;last=None
 with av.open(str(file)) as c:
  s=c.streams[index]
  for packet in c.demux(s):
   if packet.dts is None or not packet.size or (skipPriming and packet.pts<0):continue
   if first is None:first=float(packet.pts*s.time_base)
   last=float(packet.pts*s.time_base);h.update(bytes(packet));count+=1
 return {'sha256':h.hexdigest(),'packets':count,'firstPts':first,'lastPts':last}
report={'revision':'13.0-hd50','passed':True,'cutIntervals':[],'downloadStreams':[],'deliveryStreams':[]}
for i in range(5):
 before=signature(source,i);after=signature(work/'RELIC-film-1080p50-EN-FR.mp4',i);assert before==after
 report['downloadStreams'].append({'index':i,'encodedPacketsIdentical':True,**after})
for name,i in [('video',0),('audio-en',1),('audio-fr',2)]:
 before=signature(source,i,i>0);after=signature(work/f'v13-0-hd50/{name}/index.m3u8',0);assert before['sha256']==after['sha256'];assert before['packets']==after['packets'];assert abs((after['lastPts']-after['firstPts'])-(before['lastPts']-before['firstPts']))<1e-5
 report['deliveryStreams'].append({'id':name,'encodedPacketsIdentical':True,'firstPts':after['firstPts'],'sourceFirstPts':before['firstPts'],'packets':after['packets'],'sha256':after['sha256']})
frames=0;last=None
with av.open(str(work/'v13-0-hd50/video/index.m3u8')) as c:
 s=c.streams.video[0];s.codec_context.thread_count=4;assert float(s.average_rate)==50
 for frame in c.decode(s):
  assert (frame.width,frame.height)==(1920,1080);t=float(frame.pts*frame.time_base)
  if last is not None:assert abs(t-last-.02)<1e-6
  frames+=1;last=t
assert frames==36550;report['fullDecodePassed']=True;report['pictureFrames']=frames;report['duration']=731
for i in [1,2]:
 with av.open(str(source)) as c:
  count=sum(frame.samples for frame in c.decode(c.streams[i]));assert count==731*48000
report['sourceDecodedSamplesPerLanguage']=731*48000
(work/'validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('Validated all five downloaded streams and all three HLS streams against the supplied master:',frames,'frames',flush=True)
