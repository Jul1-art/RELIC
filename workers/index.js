import {createAtlasRoutes} from './atlas.js';
import {createCelestrakProxy} from './celestrak.js';
let proxy;
const atlas=createAtlasRoutes();
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/celestrak/')){
    proxy ||= createCelestrakProxy({cache:caches.default});
    return proxy(request);
  }
  const response=await atlas(request,env);
  return response||env.ASSETS.fetch(request);
}};
