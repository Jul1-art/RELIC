/** Shared model time: orbits, surface orientation and daylight use this same date. */
export function createSimulationClock({startTime=Date.now(),rate=86400,minTime=Date.UTC(2025,0,1),maxTime=Date.UTC(2033,0,1)}={}) {
  const clamp=value=>Math.max(minTime,Math.min(maxTime,value));
  let time=clamp(Number(startTime)),speed=rate,running=true,inspection=false,atEnd=false;
  if(!Number.isFinite(time))throw new Error('Invalid simulation date');
  function advance(seconds){
    if(!running||inspection||!Number.isFinite(seconds)||seconds<=0)return 0;
    const before=time;time=clamp(time+seconds*speed*1000);
    if(time>=maxTime){running=false;atEnd=true;}
    return (time-before)/1000;
  }
  return {
    advance,
    get date(){return new Date(time);},
    get time(){return time;},
    get state(){return {time,rate:speed,running,inspection,atEnd,advancing:running&&!inspection&&!atEnd};},
    setRate(value){if(!Number.isFinite(value)||value<=0||value>2592000)throw new Error('Invalid simulation speed');speed=value;},
    setInspection(value){inspection=Boolean(value);},
    pause(){running=false;},
    play(){if(time<maxTime){running=true;atEnd=false;}},
    toggle(){if(running)running=false;else if(time<maxTime)running=true;},
    now(value=Date.now()){time=clamp(Number(value));speed=1;running=true;atEnd=false;}
  };
}
