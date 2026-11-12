import {STARLINK_COLOR} from './constellation-view.js';
import {SATELLITE_CLASS_IDS,SATELLITE_CLASS_DISPLAY} from '../../vendor/gods-eye-view/satellites/classes.js';
const COPY={
 fr:{starlink:'Vue Starlink',title:'Satellites',loading:'Chargement du catalogue…',ready:'Catalogue public',partial:'Catalogue partiel · certaines sources indisponibles',stale:'Derniers éléments disponibles',unavailable:'Catalogue indisponible',refreshing:'Actualisation…',search:'Rechercher un satellite ou un NORAD',iss:'Localiser l’ISS',follow:'Suivre',stop:'Arrêter le suivi',none:'Aucun satellite trouvé',alt:'Altitude',speed:'Vitesse',period:'Période',epoch:'Éléments du',position:'Position calculée à',foot:'Positions SGP4 calculées à l’heure actuelle. Catalogue public CelesTrak : satellites actifs et groupes de God’s Eye View. Les objets sans éléments publics récents ne sont pas affichés.',all:'Afficher tous les satellites',hide:'Masquer les satellites',classes:['Stations','Observation','Télécoms','Starlink','Sondes','Débris'],retry:'Réessayer'},
 en:{starlink:'Starlink view',title:'Satellites',loading:'Loading catalogue…',ready:'Public catalogue',partial:'Partial catalogue · some feeds unavailable',stale:'Latest available elements',unavailable:'Catalogue unavailable',refreshing:'Refreshing…',search:'Search satellite or NORAD',iss:'Locate ISS',follow:'Follow',stop:'Stop following',none:'No satellites found',alt:'Altitude',speed:'Speed',period:'Period',epoch:'Elements dated',position:'Position calculated at',foot:'SGP4 positions calculated at the current time. Public CelesTrak catalogue: active satellites and God’s Eye View groups. Objects without recent public elements are not shown.',all:'Show all satellites',hide:'Hide satellites',classes:['Stations','Imaging','Telecom','Starlink','Probes','Debris'],retry:'Retry'},
};
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
export function createSatellitePanel({host=document.body,getLanguage=()=>document.documentElement.lang,onLanguageChange,onSelect,onFollow,onVisibility,onClassChange,onRefresh,onStarlink}){
 const fr=()=>getLanguage()==='fr',copy=()=>COPY[fr()?'fr':'en'];
 if(!document.querySelector('link[data-satellite-style]')){const link=document.createElement('link');link.rel='stylesheet';link.dataset.satelliteStyle='';link.href=new URL('./satellites.css',import.meta.url).href;document.head.append(link);}
 const root=element('details','relic-satellites'),summary=element('summary','satellite-chip'),title=element('span','satellite-title'),count=element('span','satellite-count','0');const starlinkBadge=element('span','satellite-starlink-count');starlinkBadge.hidden=true;summary.append(title,count,starlinkBadge);root.append(summary);
 const body=element('div','satellite-body'),status=element('p','satellite-status'),toolbar=element('div','satellite-toolbar');
 const iss=element('button','satellite-iss'),visibility=element('button','satellite-visibility');iss.type=visibility.type='button';iss.addEventListener('click',()=>{onSelect(25544,true);root.open=true;});visibility.addEventListener('click',()=>{shown=!shown;onVisibility(shown);render();});toolbar.append(iss,visibility);
 const starlink=element('button','satellite-starlink');starlink.type='button';starlink.addEventListener('click',()=>onStarlink?.());
 const filters=element('div','satellite-filters'),inputs=new Map();
 for(const [index,id]of SATELLITE_CLASS_IDS.entries()){
   const label=element('label','satellite-class'),input=document.createElement('input'),name=element('span','satellite-class-name'),number=element('span','satellite-class-count');
   input.type='checkbox';input.checked=true;label.style.setProperty('--satellite-color',id==='starlink'?STARLINK_COLOR:SATELLITE_CLASS_DISPLAY[id].color);label.append(input,name,number);inputs.set(id,{input,name,number,index});
   input.addEventListener('change',()=>onClassChange(id,input.checked));filters.append(label);
 }
 const search=element('input','satellite-search');search.type='search';search.maxLength=100;
 const results=element('div','satellite-results'),card=element('section','satellite-card'),name=element('h3','satellite-name'),metrics=element('dl','satellite-metrics'),follow=element('button','satellite-follow');follow.type='button';card.append(name,metrics,follow);card.hidden=true;follow.addEventListener('click',()=>onFollow(!following));
 const refresh=element('button','satellite-refresh');refresh.type='button';refresh.addEventListener('click',onRefresh);
 const foot=element('p','satellite-foot'),credits=element('p','satellite-source');
 for(const [label,url]of [['CelesTrak','https://celestrak.org/'],['God’s Eye View · Bilawal Sidhu','https://github.com/bilawalsidhu/gods-eye-view']]){const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';credits.append(a);}
 body.append(status,starlink,toolbar,filters,search,results,card,refresh,foot,credits);root.append(body);host.append(root);
 let records=new Map(),state='loading',selected=null,following=false,shown=true,position=null;
 function renderResults(){
   const query=search.value.trim().toLowerCase();results.replaceChildren();if(!query){results.hidden=true;return;}results.hidden=false;
   const found=[...records.values()].filter(row=>row.name.toLowerCase().includes(query)||String(row.id).includes(query));
   for(const row of found.slice(0,25)){const button=element('button','satellite-result',`${row.name} · ${row.id}`);button.type='button';button.addEventListener('click',()=>onSelect(row.id,true));results.append(button);}
   if(!found.length)results.append(element('p','',copy().none));
 }
 function render(){
   const t=copy();title.textContent=t.title;count.textContent=records.size.toLocaleString(fr()?'fr-FR':'en-GB');status.textContent=t[state]||t.unavailable;status.dataset.state=state;
   iss.textContent=t.iss;iss.disabled=!records.has(25544);visibility.textContent=shown?t.hide:t.all;visibility.setAttribute('aria-pressed',String(shown));search.placeholder=t.search;search.setAttribute('aria-label',t.search);foot.textContent=t.foot;refresh.textContent=t.retry;refresh.hidden=!['unavailable','partial','stale'].includes(state);
   const counts=new Map();for(const row of records.values())counts.set(row.satelliteClass,(counts.get(row.satelliteClass)||0)+1);
   const starlinkCount=counts.get('starlink')||0;starlinkBadge.hidden=!starlinkCount;starlinkBadge.textContent=`Starlink ${starlinkCount.toLocaleString(fr()?'fr-FR':'en-GB')}`;starlink.textContent=t.starlink;starlink.disabled=!starlinkCount;
   for(const [id,item]of inputs){item.name.textContent=t.classes[item.index];item.number.textContent=(counts.get(id)||0).toLocaleString();}
   renderResults();renderCard();
 }
 function renderCard(){
   card.hidden=!selected;metrics.replaceChildren();if(!selected)return;
   const t=copy(),row=records.get(selected.id)||selected;name.textContent=row.name;
   const metric=(label,value)=>{metrics.append(element('dt','',label),element('dd','',value));};
   metric('NORAD',String(row.id));
   if(position){metric('Lat / Lon',`${position.latitude.toFixed(3)}° / ${position.longitude.toFixed(3)}°`);metric(t.alt,`${(position.altitude/1000).toFixed(1)} km`);if(Number.isFinite(position.speedMps))metric(t.speed,`${(position.speedMps/1000).toFixed(2)} km/s`);metric(t.position,new Date(position.at).toISOString().slice(11,19)+' UTC');}
   metric(t.period,`${(2*Math.PI/row.satrec.no).toFixed(1)} min`);metric(t.epoch,new Date(row.epoch).toISOString().replace('T',' ').slice(0,19)+' UTC');
   follow.textContent=following?t.stop:t.follow;follow.setAttribute('aria-pressed',String(following));
 }
 search.addEventListener('input',renderResults);
 const unsubscribe=onLanguageChange?.(render);render();
 return {collapse(){root.open=false;},setVisibility(value){shown=value;render();},setClasses(values){for(const [id,item]of inputs)item.input.checked=values[id]===true;},update(value){records=value.records;state=value.status;render();},select(row){selected=row;position=null;renderCard();},position(value,isFollowing){position=value;following=isFollowing;if(root.open)renderCard();},setFollowing(value){following=value;renderCard();},
   dispose(){unsubscribe?.();root.remove();}};
}
