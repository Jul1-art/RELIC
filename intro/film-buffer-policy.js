const finite=value=>Number.isFinite(Number(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** Only playable, contiguous media counts; a later seek is not a head start. */
export function bufferedFilmSeconds(ranges,position=0){
  if(!ranges||!finite(position))return 0;
  const time=Math.max(0,Number(position));let end=time,found=false;
  try{
    for(let index=0;index<ranges.length;index++){
      const start=ranges.start(index),next=ranges.end(index);
      if(!Number.isFinite(start)||!Number.isFinite(next)||next<start)continue;
      if(!found&&start<=time+.12&&next>=time){end=next;found=true;}
      else if(found&&start<=end+.12)end=Math.max(end,next);
      else if(found)break;
    }
  }catch{/* TimeRanges can change when the browser evicts old media. */}
  return found?Math.max(0,end-time):0;
}

/** One HD rendition: slower links need a bounded reserve, not a fictitious
 * lower-quality level. The underlying browser may impose a smaller buffer. */
export function filmBufferPolicy({connection={},bandwidth=NaN,bitrate=2580474,duration=746,position=0,playbackRate=1,playing=false,rebuffer=false,deviceMemory=4}={}){
  const rate=finite(playbackRate)?clamp(Number(playbackRate),.25,2):1;
  const encodedRate=(finite(bitrate)&&Number(bitrate)>0?Number(bitrate):2580474)*rate;
  const measured=finite(bandwidth)&&Number(bandwidth)>0?Number(bandwidth):NaN;
  const hinted=finite(connection.downlink)&&Number(connection.downlink)>0?Number(connection.downlink)*1e6:NaN;
  const estimate=Number.isFinite(measured)?measured:hinted;
  const ratio=Number.isFinite(estimate)?estimate/encodedRate:NaN;
  const slow=/^(?:slow-2g|2g|3g)$/.test(connection.effectiveType||'')||Boolean(connection.saveData)||(Number.isFinite(ratio)&&ratio<1.25);
  const lowMemory=Number(deviceMemory)>0&&Number(deviceMemory)<=2;
  const maxForward=lowMemory?64:slow?144:96;
  const remaining=Math.max(0,(finite(duration)&&Number(duration)>0?Number(duration):746)-Math.max(0,Number(position)||0));
  let required=rebuffer?(slow?40:18):(slow?24:8);
  if(Number.isFinite(ratio)&&ratio<1.15)required=Math.max(required,remaining*(1-clamp(ratio*.82,0,1)));
  required=Math.min(remaining,lowMemory?56:rebuffer?112:88,required);
  const preloadTarget=Math.min(remaining,Math.max(slow?48:32,required+8),maxForward);
  const forwardTarget=Math.min(remaining,maxForward,playing?Math.max(slow?128:88,required+8):preloadTarget);
  return {slow,required,preloadTarget,forwardTarget,remaining,bandwidth:estimate,bitrate:encodedRate,maxBufferBytes:(lowMemory?48:96)*1024*1024};
}
