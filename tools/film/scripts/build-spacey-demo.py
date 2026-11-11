"""Build the narrated preset demonstration and its media-clock cues."""
import argparse,hashlib,json,sys,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runtime',required=True);p.add_argument('--model',required=True);p.add_argument('--voices',required=True);p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
sys.path.insert(0,a.runtime)
import numpy as np
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro
root=Path(__file__).resolve().parents[3];folder=root/'assets/spacey/audio'
segments=[('location',None,'Location finds a place or coordinates on this world.',None),('presets',None,'Visual Presets changes the image style. Let me show you.',None),('style','normal','Normal keeps the natural colors.',None),('style','crt','CRT adds a retro screen effect.','C R T adds a retro screen effect.'),('style','nvg','NVG simulates night vision.','N V G simulates night vision.'),('style','flir','FLIR uses simulated thermal colors.','F L I R uses simulated thermal colors.'),('style','anime','Anime adds illustrated edges and colors.',None),('style','noir','Noir creates a black and white view.',None),('style','normal','And back to Normal. You can return to it at any time.',None)]
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf8'))
for file,key in [(a.model,'sha256'),(a.voices,'voicesSha256')]:
 assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==manifest['model'][key],'Model must match the intro narrator'
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
model=Kokoro.from_session(ort.InferenceSession(a.model,sess_options=options,providers=['CPUExecutionProvider']),a.voices)
chunks=[];cues=[];offset=0;rate=24000
for kind,style,text,spoken in segments:
 samples,sr=model.create(spoken or text,voice='af_heart',lang='en-us',speed=.98,trim=True)
 assert sr==rate and len(samples)>0
 cue={'time':round(offset/rate+.04,6),'kind':kind,'text':text}
 if style:cue['style']=style
 cues.append(cue);chunks.extend([samples,np.zeros(round(rate*(.7 if style else .2)),dtype=np.float32)]);offset+=len(samples)+len(chunks[-1])
combined=np.concatenate(chunks)
with tempfile.TemporaryDirectory() as tmp:
 raw=Path(tmp)/'demo.wav';sf.write(raw,combined,rate)
 subprocess.run([a.ffmpeg,'-y','-v','error','-i',str(raw),'-af','adelay=40:all=1,loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(folder/'destinations.mp3')],check=True)
mp3=folder/'destinations.mp3'
row=next(x for x in manifest['lines'] if x['id']=='destinations');row.update(text=' '.join(x[2] for x in segments),duration=round(len(combined)/rate+.04,6),bytes=mp3.stat().st_size,sha256=hashlib.sha256(mp3.read_bytes()).hexdigest())
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
(folder/'destinations-timeline.json').write_text(json.dumps({'duration':row['duration'],'cues':cues},indent=2)+'\n')
print(json.dumps({'duration':row['duration'],'cues':len(cues)}))
