/** Shared model time: orbits, surface orientation and daylight use this same date. */
export function createSimulationClock({startTime=Date.now(),rate=1,minTime=Date.UTC(2025,0,1),maxTime=Date.UTC(2033,0,1),getNow=()=>Date.now()}={}) {
  const clamp=value=>Math.max(minTime,Math.min(maxTime,value));
  let time=clamp(Number(startTime)),speed=rate,running=true,inspection=false,atEnd=false,live=rate===1;
  if(!Number.isFinite(time))throw new Error('Invalid simulation date');
  function synchronize(){const current=Number(getNow());if(Number.isFinite(current))time=clamp(current);}
  function advance(seconds){
    if(!running||inspection||!Number.isFinite(seconds)||seconds<=0)return 0;
    const before=time;
    // At 1× the UTC wall clock is authoritative, even after a hidden tab or a
    // suspended frame. Frame-rate clamping must never make real time run slow.
    if(live)synchronize();else time=clamp(time+seconds*speed*1000);
    if(time>=maxTime){running=false;atEnd=true;}
    return (time-before)/1000;
  }
  return {
    advance,
    get date(){return new Date(time);},
    get time(){return time;},
    get state(){return {time,rate:speed,running,inspection,atEnd,live,advancing:running&&!inspection&&!atEnd};},
    setRate(value){if(!Number.isFinite(value)||value<=0||value>2592000)throw new Error('Invalid simulation speed');speed=value;live=value===1;if(live&&!inspection&&running)synchronize();},
    setInspection(value){const wasInspection=inspection;inspection=Boolean(value);if(wasInspection&&!inspection&&live&&running)synchronize();},
    pause(){running=false;},
    play(){if(time<maxTime){running=true;atEnd=false;if(live&&!inspection)synchronize();}},
    toggle(){if(running)running=false;else if(time<maxTime){running=true;if(live&&!inspection)synchronize();}},
    now(value=getNow()){const next=Number(value);if(!Number.isFinite(next))throw new Error('Invalid simulation date');time=clamp(next);speed=1;live=true;running=true;atEnd=false;}
  };
}
