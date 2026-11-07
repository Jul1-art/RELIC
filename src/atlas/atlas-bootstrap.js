/** Keep large 3D libraries, mosaics and catalogues off the film's connection. */
export function createAtlasBootstrap({root=document.documentElement,events=window,
  filmScript=document.querySelector('script[src*="film-bridge.js"]'),
  load=()=>import('./app.js?v=solar-29'),onError=()=>{
    document.querySelector('#loading').hidden=true;document.querySelector('#error-screen').hidden=false;
  }}={}){
  let pending=null,disposed=false;
  root.dataset.atlasBootstrap='deferred';
  function dispose(){disposed=true;events.removeEventListener('relic-film-state',changed);filmScript?.removeEventListener('error',start);}
  function start(){
    if(disposed||pending)return pending;
    root.dataset.atlasBootstrap='loading';
    pending=Promise.resolve().then(load).then(()=>{root.dataset.atlasBootstrap='ready';},()=>{root.dataset.atlasBootstrap='failed';onError();});
    events.removeEventListener('relic-film-state',changed);filmScript?.removeEventListener('error',start);
    return pending;
  }
  function changed(event){if(event.detail?.active===false)start();}
  events.addEventListener('relic-film-state',changed);
  filmScript?.addEventListener('error',start,{once:true});
  if(events.__relicFilmActive===false||root.dataset.relicFilm==='closed')start();
  return {start,dispose,get pending(){return pending;}};
}
