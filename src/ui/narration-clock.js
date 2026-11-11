/** Follow the media clock, including buffering and seeks. Cue zero starts only
 * when playback really starts; a delayed frame applies only the current cue. */
export function createNarrationClock({audio,cues,onCue,onComplete=()=>{},onUnavailable=()=>{},requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}){
  const timeline=[...cues].sort((a,b)=>a.time-b.time);
  if(timeline.some(cue=>!Number.isFinite(cue.time)||cue.time<0))throw new TypeError('Narration cue times must be finite and nonnegative.');
  let disposed=false,started=false,finished=false,unavailable=false,frame=0,current=-1;
  const stopped=()=>disposed||finished||unavailable;
  function cancel(){if(frame)cancelFrame(frame);frame=0;}
  function sample(time=audio.currentTime){
    let index=-1;
    for(let i=0;i<timeline.length&&timeline[i].time<=time;i++)index=i;
    if(index===current)return;
    current=index;
    if(index>=0)onCue(timeline[index],index);
  }
  function schedule(){if(!stopped()&&!frame&&!audio.paused&&!audio.ended)frame=requestFrame(tick);}
  function tick(){
    frame=0;
    if(stopped()||audio.paused||audio.ended)return;
    sample();schedule();
  }
  function playing(){
    if(stopped())return;
    started=true;sample();schedule();
  }
  function timeupdate(){if(!stopped()&&started&&!audio.paused)sample();}
  function seeking(){if(!stopped()&&started)sample();}
  function ended(){
    if(stopped()||!started)return;
    cancel();
    sample(Number.isFinite(audio.duration)?Math.max(audio.currentTime,audio.duration):audio.currentTime);
    if(disposed)return;
    finished=true;onComplete();
  }
  function error(){
    if(stopped())return;
    unavailable=true;cancel();onUnavailable();
  }
  const listeners={playing,timeupdate,seeking,ended,error,pause:cancel};
  for(const [type,listener]of Object.entries(listeners))audio.addEventListener(type,listener);
  return {dispose(){
    if(disposed)return;
    disposed=true;cancel();
    for(const [type,listener]of Object.entries(listeners))audio.removeEventListener(type,listener);
  }};
}
