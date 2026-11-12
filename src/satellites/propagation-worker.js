/** SGP4 runs off the render thread. One transferable full-catalogue snapshot is
 * in flight at a time; the renderer consumes it in bounded slices. */
import {propagatePosition,COVERAGE_MS} from './orbits.js';
let rows=[],revision=0;
export function propagateSnapshot(records,at){
 const date=new Date(at),data=new Float64Array(records.length*8);data.fill(NaN);
 for(let i=0;i<records.length;i++){
  const row=records[i];if(Math.abs(at-row.epoch)>COVERAGE_MS)continue;
  const p=propagatePosition(row.satrec,date);if(!p)continue;
  data.set([p.x,p.y,p.z,p.latitude,p.longitude,p.altitude,p.speedMps??NaN,at],i*8);
 }
 return data;
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'&&typeof document==='undefined')self.onmessage=({data})=>{
 if(data.type==='catalog'){rows=data.rows;revision=data.revision;return;}
 if(data.type!=='sample'||data.revision!==revision)return;
 const result=propagateSnapshot(rows,data.at);self.postMessage({revision,data:result},[result.buffer]);
};
