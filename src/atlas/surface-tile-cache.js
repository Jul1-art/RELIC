/** Bounded, coalesced requests. Superseded queued work never starts downloading. */
export class SurfaceTileCache {
  constructor({load,concurrency=4,maxEntries=96,retryMs=20000,now=()=>performance.now()}){
    Object.assign(this,{load,concurrency,maxEntries,retryMs,now});this.entries=new Map();this.queue=[];this.running=0;this.pinned=new Set();this.disposed=false;
  }
  request(key,url,priority=0){
    let entry=this.entries.get(key);
    if(entry){entry.used=this.now();if(entry.failed&&this.now()>=entry.retryAt){this.entries.delete(key);entry=null;}else return entry.promise;}
    entry={key,url,priority,used:this.now(),state:'queued',texture:null};
    entry.promise=new Promise((resolve,reject)=>Object.assign(entry,{resolve,reject}));this.entries.set(key,entry);this.queue.push(entry);this.queue.sort((a,b)=>a.priority-b.priority);this.pump();return entry.promise;
  }
  setWanted(keys,pinned=keys){
    const wanted=new Set(keys);this.pinned=new Set(pinned);
    this.queue=this.queue.filter(entry=>{if(wanted.has(entry.key))return true;this.entries.delete(entry.key);const error=new Error('Superseded surface request');error.name='AbortError';entry.reject(error);return false;});this.trim();
  }
  pump(){
    while(!this.disposed&&this.running<this.concurrency&&this.queue.length){
      const entry=this.queue.shift();entry.state='loading';this.running++;
      Promise.resolve().then(()=>this.load(entry.url)).then(texture=>{
        if(this.disposed){texture.dispose?.();entry.reject(Object.assign(new Error('Surface cache disposed'),{name:'AbortError'}));return;}
        entry.texture=texture;entry.state='ready';entry.used=this.now();entry.resolve(texture);
      },error=>{entry.failed=true;entry.state='failed';entry.retryAt=this.now()+this.retryMs;entry.reject(error);}).finally(()=>{this.running--;this.trim();this.pump();});
    }
  }
  trim(){
    if(this.entries.size<=this.maxEntries)return;
    for(const entry of [...this.entries.values()].sort((a,b)=>a.used-b.used)){
      if(this.entries.size<=this.maxEntries)break;
      if(this.pinned.has(entry.key)||entry.state==='loading'||entry.state==='queued')continue;
      entry.texture?.dispose?.();this.entries.delete(entry.key);
    }
  }
  dispose(){this.disposed=true;this.setWanted([]);for(const entry of this.entries.values())entry.texture?.dispose?.();this.entries.clear();}
}
