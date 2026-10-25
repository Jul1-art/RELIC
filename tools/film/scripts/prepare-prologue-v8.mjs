/** One connected documentary: paragraph narration crosses picture cuts. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PROLOGUE as priorCues} from '../reference/prologue-data-v7.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const write=(f,v)=>fs.writeFileSync(path.join(root,f),JSON.stringify(v,null,2)+'\n');
const old=read('tools/film/scripts/prologue-edit-v7.json');
const previous=new Map(old.shots.map(s=>[s.id,s]));
const reuse=(id,changes={})=>({...previous.get(id),transitionOut:.75,...changes});
const shot=(id,file,duration,extra={})=>({id,file,duration,transitionOut:.75,...extra});
const apollo='v7-race-apollo/apollo11-broll-original.mp4';
const shots=[
 reuse('prologue',{duration:16,transitionOut:0}),reuse('origins',{transitionOut:1.25}),
 reuse('dinosaurs',{duration:7,transitionOut:.75}),shot('deep-time',null,3,{transitionOut:1}),
 reuse('humanity',{duration:8,preserveSpeed:false,sourceLength:9,transitionOut:1,transitionType:'fadeblack'}),
 reuse('v1',{duration:6,transitionOut:0}),reuse('v2',{duration:8,transitionOut:1,transitionType:'fade'}),
 reuse('von-braun',{duration:10,sourceLength:10,preserveSpeed:false,transitionOut:.5}),
 reuse('sputnik-wide',{duration:4,transitionOut:0}),reuse('sputnik',{duration:8,transitionOut:.5}),
 reuse('laika',{duration:12,preserveSpeed:false,sourceLength:8,transitionOut:.5}),
 reuse('gagarin',{duration:6,preserveSpeed:false,sourceLength:5,transitionOut:.75}),
 shot('moon-goal',apollo,8,{in:1183,preserveSpeed:true,transitionOut:.75}),
 reuse('kennedy',{transitionOut:.5}),reuse('saturn-v',{duration:12,preserveSpeed:false,sourceLength:8,transitionOut:0}),
 reuse('apollo-engines',{transitionOut:0}),reuse('apollo-liftoff',{transitionOut:.5}),
 reuse('eagle-orbit',{duration:6,transitionOut:0}),
 shot('eagle-descent',apollo,8,{in:1254,preserveSpeed:true,transitionOut:.5}),
 reuse('moon',{transitionOut:.5}),
 reuse('eagle-landed',{duration:14,sourceLength:14,preserveSpeed:true,transitionOut:1}),
 reuse('voyager',{duration:16,in:1,sourceLength:16,preserveSpeed:false,transitionOut:.75}),
 reuse('sts1',{duration:16,preserveSpeed:false,sourceLength:14,transitionOut:0}),
 reuse('challenger',{transitionOut:0}),reuse('remembrance',{duration:8,transitionOut:1.5}),
 reuse('hubble',{duration:14,sourceLength:10,preserveSpeed:false,transitionOut:1}),
 reuse('iss-capture',{duration:10,transitionOut:0}),reuse('iss-unity',{duration:10,transitionOut:.75}),
 reuse('europe',{duration:10,transitionOut:.75}),reuse('iss-whole',{duration:12,transitionOut:.75}),
 reuse('iss-life',{duration:6,transitionOut:.75}),
 reuse('soyuz',{duration:8,in:410,preserveSpeed:true,transitionOut:1}),
 reuse('heliopause',{duration:14,in:0,sourceLength:13.38,preserveSpeed:false,transitionOut:1}),
 reuse('philae-approach',{duration:8,transitionOut:0}),reuse('philae-landing',{duration:8,transitionOut:1}),
 shot('mars-approach','v6-international/perseverance-descent-original.mp4',8,{in:85,preserveSpeed:true,crop:'crop=752:600:282:0',transitionOut:.5}),
 reuse('perseverance-up',{transitionOut:0}),reuse('perseverance-down',{transitionOut:1}),
 reuse('webb',{duration:12,sourceLength:10,preserveSpeed:false,transitionOut:1}),
 reuse('falcon-launch',{transitionOut:.5}),reuse('falcon-dual-return',{transitionOut:.75}),reuse('falcon-return',{transitionOut:1}),
 reuse('lunar-orbiter',{transitionOut:1}),reuse('mars',{duration:8,transitionOut:.75}),
 reuse('hardware',{transitionOut:.75}),reuse('mars-pullout',{transitionOut:.75}),reuse('solar-system',{transitionOut:0}),reuse('relic',{transitionOut:0})
];
let duration=0;const times={};
for(const s of shots){times[s.id]={start:duration,end:duration+s.duration};duration+=s.duration;}
const lines=[];
function paragraph(id,first,last,en,fr,options={}){
 const start=typeof first==='number'?first:times[first].start+.5;
 const end=typeof last==='number'?last:times[last].end-.5;
 lines.push({id,start,end,text:{en:en.join(' '),fr:fr.join(' ')},subtitles:{en,fr},...options});
}
paragraph('a-world-and-a-question',times['deep-time'].start+.9,times.humanity.end-.5,[
 'Millions of years later,',
 'humanity transformed this same world,',
 'and learned to reach beyond it.'
],[
 'Des millions d’années plus tard,',
 'l’humanité transformait cette même planète,',
 'puis apprenait à explorer au-delà.'
],{captionKinds:['bridge','narration','narration']});
paragraph('from-war-to-a-race','v1','von-braun',[
 'During the Second World War, Nazi Germany deployed the V1 cruise missile,',
 'then the V2 ballistic rocket.',
 'V2 production exploited forced labour.',
 'After the war, V2 engineer Wernher von Braun joined the American programme.',
 'Soviet engineers built their own rockets.',
 'This technology became part of the Cold War race to space.'
],[
 'Pendant la Seconde Guerre mondiale, l’Allemagne nazie a déployé le missile de croisière V1,',
 'puis la fusée balistique V2, produite par le travail forcé.',
 'Après la guerre, Wernher von Braun, ingénieur des V2, a rejoint le programme américain.',
 'Les Soviétiques ont développé leurs propres fusées.',
 'La guerre froide a poussé cette technologie vers l’espace.'
]);
paragraph('a-signal-around-earth',times['sputnik-wide'].start+2,times.sputnik.end-.7,[
 'In 1957, Sputnik became the first artificial satellite. Its signal carried the rivalry around the world.'
],[
 'En 1957, Spoutnik est devenu le premier satellite artificiel. Son signal a fait le tour du monde.'
]);
paragraph('from-machines-to-people','laika',times.gagarin.end-2.4,[
 'If a machine could circle Earth, could a living passenger survive?',
 'Laika became the first dog in orbit, but did not survive.',
 'In 1961, Yuri Gagarin became the first human in space.'
],[
 'Si une machine pouvait tourner autour de la Terre, un être vivant pouvait-il y survivre ? ',
 'Laïka fut la première chienne en orbite, sans survivre au voyage.',
 'En 1961, Youri Gagarine devint le premier humain dans l’espace.'
].map(s=>s.trim()));
paragraph('a-destination','moon-goal','moon-goal',[
 'The United States answered with a destination beyond Earth orbit: the Moon.'
],[
 'Les États-Unis ont répondu en fixant un objectif au-delà de l’orbite terrestre : la Lune.'
]);
paragraph('a-promise-becomes-a-journey','saturn-v','saturn-v',[
 'By 1969, Apollo had turned that promise into a journey.',
 'Saturn V would carry three astronauts to the Moon.'
],[
 'En 1969, Apollo avait transformé cette promesse en voyage.',
 'Saturne V allait emporter trois astronautes vers la Lune.'
],{spokenText:{en:'By 1969, Apollo had turned that promise into a journey. Saturn Five would carry three astronauts to the Moon.',fr:'En 1969, Apollo avait transformé cette promesse en voyage. Saturne cinq allait emporter trois astronautes vers la Lune.'}});
paragraph('two-go-down-one-stays','eagle-orbit','eagle-descent',[
 'Four days later, Eagle separated from Columbia.',
 'Michael Collins stayed in lunar orbit',
 'while Armstrong and Aldrin began their descent.'
],[
 'Quatre jours plus tard, Eagle s’est séparé de Columbia.',
 'Michael Collins est resté en orbite lunaire',
 'pendant qu’Armstrong et Aldrin entamaient leur descente.'
]);
paragraph('the-first-machines-left-behind','eagle-landed','eagle-landed',[
 'The astronauts returned to Earth.',
 'But much of their equipment stayed on the Moon,',
 'where instruments kept doing science after the crews had gone.'
],[
 'Les astronautes sont revenus.',
 'Mais une grande partie du matériel est restée sur la Lune,',
 'où les instruments ont poursuivi leurs mesures après leur départ.'
]);
paragraph('two-paths-after-apollo','voyager','voyager',[
 'After Apollo, exploration followed two paths.',
 'In 1977, the Voyager probes launched towards the outer planets,',
 'carrying instruments far beyond the reach of human crews.'
],[
 'Après Apollo, l’exploration a suivi deux chemins.',
 'En 1977, les sondes Voyager sont parties vers les planètes lointaines,',
 'emportant des instruments hors de portée des équipages humains.'
]);
paragraph('working-closer-to-home','sts1','sts1',[
 'Closer to home, the Space Shuttle began flying in 1981.',
 'It carried crews and scientific equipment into orbit,',
 'making space a place to work as well as explore.'
],[
 'Plus près de nous, la navette spatiale a commencé à voler en 1981.',
 'Elle transportait des équipages et du matériel scientifique en orbite,',
 'pour faire de l’espace un lieu de travail et de recherche.'
]);
paragraph('the-cost-of-flight','remembrance','remembrance',[
 'Seven crew members died.',
 'NASA grounded the Shuttle to investigate.'
],[
 'Challenger a emporté sept vies.',
 'La NASA a suspendu les vols pour enquêter.'
]);
paragraph('a-new-view','hubble','hubble',[
 'After flights resumed, a Shuttle crew deployed Hubble in 1990.',
 'Above the atmosphere, it could observe the universe more clearly.'
],[
 'Après la reprise des vols, une navette a déployé Hubble en 1990.',
 'Au-dessus de l’atmosphère, il pouvait mieux observer l’univers.'
]);
paragraph('rivals-build-together','iss-capture','iss-unity',[
 'In 1998, former rivals began building the International Space Station.',
 'Russian Zarya and American Unity became its first modules,',
 'beginning a shared home in Earth orbit.'
],[
 'En 1998, d’anciens rivaux ont commencé à bâtir la Station spatiale internationale.',
 'Le module russe Zarya et le module américain Unity sont devenus ses premiers modules,',
 'les premières pièces d’un habitat commun en orbite.'
]);
paragraph('a-shared-laboratory','europe','europe',[
 'Europe added its Columbus laboratory in 2008.',
 'With Japan and Canada, a shared laboratory grew above Earth.'
],[
 'L’Europe a ajouté son laboratoire Columbus en 2008.',
 'Avec le Japon et le Canada, un laboratoire commun a grandi au-dessus de la Terre.'
]);
paragraph('keeping-the-outpost-alive','soyuz','soyuz',[
 'Soyuz kept carrying crews, sustaining that outpost as generations changed.'
],[
 'Soyouz a continué à transporter les équipages, faisant vivre la station au fil des générations.'
]);
paragraph('the-long-journey-continues','heliopause','heliopause',[
 'Meanwhile, Voyager 1 was still travelling.',
 'In 2012, it crossed the heliopause, beyond the solar wind.'
],[
 'Pendant ce temps, Voyager 1 poursuivait sa route.',
 'En 2012, il a franchi l’héliopause, au-delà du vent solaire.'
],{spokenText:{en:'Meanwhile, Voyager one was still travelling. In 2012, it crossed the heliopause, beyond the solar wind.',fr:'Pendant ce temps, Voyager un poursuivait sa route. En 2012, il a franchi l’héliopause, au-delà du vent solaire.'}});
paragraph('touching-a-comet','philae-approach','philae-approach',[
 'In 2014, ESA’s Rosetta delivered Philae to comet 67P.'
],[
 'En 2014, la sonde européenne Rosetta a déposé Philae sur la comète 67P.'
],{spokenText:{en:'In 2014, the European Space Agency’s Rosetta delivered Philae to comet sixty seven P.',fr:'En 2014, la sonde européenne Rosetta a déposé Philae sur la comète soixante-sept P.'}});
paragraph('a-question-on-mars','mars-approach','mars-approach',[
 'In 2021, Perseverance approached Mars to search for signs of ancient life.'
],[
 'En 2021, Perseverance allait chercher sur Mars les traces d’une vie ancienne.'
]);
paragraph('looking-back-through-time','webb','webb',[
 'That December, Webb set out to observe the earliest galaxies.',
 'Exploration now reached across time as well as space.'
],[
 'En décembre, Webb est parti observer les premières galaxies.',
 'Explorer l’espace permettait aussi de remonter le temps.'
]);
paragraph('returning-launchers',times['falcon-launch'].start+1,times['falcon-launch'].end-.5,[
 'Closer to Earth,',
 'SpaceX, founded by Elon Musk in 2002,',
 'developed boosters that could land and fly again.'
],[
 'Plus près de nous,',
 'SpaceX, fondée par Elon Musk en 2002,',
 'développait des boosters capables de se poser et de revoler.'
]);
paragraph('the-machines-that-stay','lunar-orbiter','hardware',[
 'But many spacecraft were never designed to return.',
 'On the Moon, Apollo’s landing sites still preserve traces of those journeys.',
 'On Mars, Curiosity is one of the robots that continues to work.'
],[
 'Mais de nombreuses machines n’ont jamais été conçues pour revenir.',
 'Sur la Lune, les sites d’alunissage d’Apollo conservent les traces de ces voyages.',
 'Sur Mars, Curiosity fait partie des robots qui travaillent encore.'
]);
paragraph('why-relic','mars-pullout','solar-system',[
 'Other missions have ended, but their machines remain.',
 'Each one records a step in what we learned to build, to reach and to understand.',
 'RELIC follows the stories of what we left behind.'
],[
 'D’autres missions sont terminées, mais leurs machines demeurent.',
 'Chacune raconte une étape dans ce que nous avons appris à construire, à atteindre et à comprendre.',
 'RELIC retrace l’histoire de ce que nous avons laissé derrière nous.'
]);

const audio=[];
function archive(id,file,shot,length,offset=0,extra={}){audio.push({id,file,at:times[shot].start+offset,length,role:'archival',...extra});}
archive('sputnik-original-signal','v6-early-history/sputnik-signal-10s.wav','sputnik-wide',10,.1,{gain:.5,role:'field'});
archive('gagarin-poyekhali-1961','v6-early-history/gagarin-poyekhali-normalized.wav','gagarin',1.486,times.gagarin.end-times.gagarin.start-2.2);
archive('jfk-rice-1962','v5-audio/jfk-rice-complete-20_75-normalized.wav','kennedy',18.95);
archive('apollo11-countdown-liftoff','v5-audio/apollo11-countdown-liftoff-16s.wav','apollo-engines',16);
archive('armstrong-first-step-1969','v5-audio/armstrong-small-step-normalized.wav','moon',9.412646,1);
archive('sts1-original-launch-1981','v6-international/sts1-first-shuttle-launch-original-audio-14s.wav','sts1',3.7,5.5,{role:'field',in:5.5});
archive('challenger-original-broadcast','v6-international/challenger-loss-original-audio-6s.wav','challenger',5.36,0,{gain:.8});
archive('perseverance-2021-edl','v6-international/perseverance-descent-original-audio-12s.wav','perseverance-up',12);
archive('falcon-heavy-ground-audio-2019','v6-falcon/falcon-heavy-launch-stp2-normalized-12s.wav','falcon-launch',8,4,{role:'field',in:4});
archive('falcon9-landing-ground-audio-2020','v6-falcon/falcon9-sentinel6-normalized-12s.wav','falcon-return',12,0,{role:'field'});

const oldCue=id=>structuredClone(priorCues.find(c=>c.id===id));
const base=[];
let c=oldCue('beginning');Object.assign(c,{start:0,end:7,typingStart:.35,typingDuration:4.5});base.push(c);
c=oldCue('something');Object.assign(c,{start:7,end:16,typingStart:.4,typingDuration:5});base.push(c);
function archiveCue(id,shotId,startOffset=0,endOffset=0){const c=oldCue(id);Object.assign(c,{start:times[shotId].start+startOffset,end:times[shotId].end+endOffset});base.push(c);return c;}
const archiveSubtitles=read('tools/film/scripts/prologue-archives-v9.json');
for(const track of archiveSubtitles.tracks.filter(t=>t.classification==='speech')){
 const selected=audio.find(t=>t.id===track.audioId);
 if(!selected)throw Error('Missing selected archive '+track.audioId);
 const sourceIn=Number(selected.in||0),sourceEnd=sourceIn+selected.length;
 for(const [index,clause] of track.clauses.entries()){
  if(clause.start<sourceIn-.001 || clause.end>sourceEnd+.001)throw Error('Archive subtitle outside selected recording '+track.audioId);
  base.push({id:`archive-${track.audioId}-${index+1}`,archiveId:track.audioId,archiveClause:index,
   start:selected.at+clause.start-sourceIn,end:selected.at+clause.end-sourceIn,
   kind:'quote',title:clause.text,speaker:track.speaker,kicker:{en:'',fr:''},sourceLabel:{en:'',fr:''}});
 }
}
archiveCue('relic','relic');
const sceneLabels={
 'v1':{en:'V1 · Cruise missile',fr:'V1 · Missile de croisière'},
 'v2':{en:'V2 · Ballistic rocket',fr:'V2 · Fusée balistique'},
 'von-braun':{en:'Wernher von Braun · NASA, 1962',fr:'Wernher von Braun · NASA, 1962'},
 'iss-whole':{en:'International Space Station',fr:'Station spatiale internationale'}
};
const earthLabelTimeline=[{at:35,end:43,label:{en:'Earth · 4.5 billion years ago',fr:'Terre · Il y a 4,5 milliards d’années'}}];
const scenes=shots.map(s=>({id:s.id,...times[s.id],...(sceneLabels[s.id]?{label:sceneLabels[s.id]}:{}),...(s.id==='origins'?{focusTimeline:oldCue('origins').focusTimeline,labelTimeline:earthLabelTimeline}:{}),...(s.id==='falcon-return'?{focus:{mobile:'48% 50%',desktop:'50% 50%'}}:{})}));
const narrationFile=path.join(root,'media-work/v8-narration/manifest.json');
const narrationScript={version:8,synthetic:true,authorization:'English and French stock synthetic narration approved by the user; continuous connected rewrite requested 2026-10-23.',lines};
write('tools/film/scripts/prologue-narration-v8.json',narrationScript);
const scriptSha=createHash('sha256').update(fs.readFileSync(path.join(root,'tools/film/scripts/prologue-narration-v8.json'))).digest('hex');
let recorded=fs.existsSync(narrationFile)?read('media-work/v8-narration/manifest.json'):null;
if(recorded?.scriptSha256!==scriptSha)recorded=null;
const captions={};
for(const lang of ['en','fr']){
 const list=structuredClone(base);
 for(const line of lines){
  const recording=recorded?.lines.find(r=>r.id===line.id&&r.language===lang);
  const parts=recording?.captions ?? line.subtitles[lang].map((text,i,all)=>({text,start:line.start+(line.end-line.start)*i/all.length,end:line.start+(line.end-line.start)*(i+1)/all.length}));
  for(const [index,part]of parts.entries())list.push({id:`${line.id}-${index+1}`,start:part.start,end:part.end,kind:line.captionKinds?.[index] || 'narration',paragraph:line.id,title:{[lang]:part.text},kicker:{en:'',fr:''},sourceLabel:{en:'',fr:''}});
 }
 list.sort((a,b)=>a.start-b.start);
 const full=[];let clock=0;
 for(const cue of list){
  if(cue.start<clock-.025)throw Error(`Overlapping ${lang} captions: ${cue.id}`);
  if(cue.start>clock+.001)full.push({id:`quiet-${full.length}`,start:clock,end:cue.start,kind:'visual',title:{en:'',fr:''},kicker:{en:'',fr:''}});
  full.push(cue);clock=cue.end;
 }
 if(clock<duration)full.push({id:'quiet-end',start:clock,end:duration,kind:'visual',title:{en:'',fr:''}});
 for(const cue of full){delete cue.screenCredit;cue.sourceLabel={en:'',fr:''};}
 captions[lang]=full;
}
const effects=[
 {id:'typing-one',file:'v6-sound/typing-7s-48k.wav',at:.35,length:4.5,role:'effect',gain:.16},
 {id:'typing-two',file:'v6-sound/typing-7s-48k.wav',at:7.4,length:5,role:'effect',gain:.16},
 {id:'big-bang-impact',file:'v6-sound/impact-48k.wav',at:16,length:3,role:'effect',gain:.55},
 {id:'war-transition',file:'v6-sound/transition-whoosh-1_3s.wav',at:times.v1.start-.4,length:1.3,gain:.1},
 {id:'legacy-transition',file:'v6-sound/transition-whoosh-1_3s.wav',at:times['lunar-orbiter'].start-.4,length:1.3,gain:.1}
];
const credit="'Helios' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au";
const music=[{at:16,in:0,length:358},{at:372,in:358-(duration-372),length:duration-372}].map((m,i)=>({...m,id:`helios-part-${i+1}`,file:'v6-sound/helios-48k-normalized.wav',fadeIn:i?2:1.5,fadeOut:i?7:2,credit,license:'CC-BY-4.0',sourcePage:'https://www.scottbuckley.com.au/library/helios/'}));
// Complete picture passages where the licensed score carries the film alone.
// Keep these explicit so voice, archive, field sound and effects can be checked
// against the actual rendered mix in both languages.
const musicOnlyScenes=['dinosaurs','iss-whole','iss-life','philae-landing','falcon-dual-return'].map(id=>({id,...times[id]}));
const plan={version:8,revision:'8.4',masteringByLanguage:{fr:{integrated:-16,truePeak:-3.2,lra:11}},duration,crossfadeSeconds:.75,posterAt:76,shots,audio,effects,music,musicOnlyScenes,musicDuckDb:14,silenceMusic:[{start:times.challenger.start-.35,end:times.remembrance.end+.3}],narration:'Connected continuous bilingual paragraphs with longer complete music-only scenes; historical voices preserved.',editorialChanges:['Centered 4.5/5-second typing restored.','Both prehistoric-human/fire shots removed.','Narration rewritten around causes, questions and consequences.','Voyager launch-era visual separated from 2012 heliopause.','International Space Station explicitly named in the assembly narration and the wide orbital view.','The forest dinosaur, full-station orbital view, station life, Philae landing and simultaneous Falcon recovery carry music alone.','The storm dinosaur is replaced by a calm black deep-time bridge, narrated across a one-second fade into present-day night lights.','A timed identification names early Earth approximately4.5billion years ago, only on its molten-globe shot.','Apollo descent camera changed to verified source1254; surface EVA follows first step.','Curiosity imagery grouped in final legacy passage; Perseverance introduced separately.','The LRO-data Apollo17 flyover moved to the equipment-legacy conclusion.','NewHorizons launch2006 omitted instead of mislabelling it as Pluto2015.','Fewer transition sound effects; connected paragraph audio crosses cuts.']};
write('tools/film/scripts/prologue-edit-v8.json',plan);
fs.mkdirSync(path.join(root,'media-work/v8-edit'),{recursive:true});write('media-work/v8-edit/times.json',times);
const encodingPath=path.join(root,'intro/assets/prologue/encoding-v8.json');
const identity=createHash('sha256');identity.update(fs.existsSync(encodingPath)?fs.readFileSync(encodingPath):JSON.stringify(plan));
const backdrop=fs.readFileSync(path.join(root,'intro/assets/prologue/iss-backdrop-v7.jpg'));
const sha256=createHash('sha256').update(backdrop).digest('hex');identity.update(sha256);
const languages=Object.fromEntries(['en','fr'].map(lang=>[lang,{language:lang,src:`./assets/prologue/relic-prologue-v8-4-${lang}.mp4`,hls:`./assets/prologue/v8-4/${lang}.m3u8`}]));
const media={revision:'8.4',duration,preview:false,encoding:'./assets/prologue/encoding-v8.json',sources:'./assets/prologue/sources-v8.json',poster:'./assets/prologue/poster-v8.jpg',...languages.en,languages,scenes,captions,offline:{id:'relic-documentary-v8-4-'+identity.digest('hex').slice(0,20),extra:[{src:'./assets/prologue/iss-backdrop-v7.jpg',bytes:backdrop.length,sha256}]}};
fs.writeFileSync(path.join(root,'intro/prologue-data-v8.js'),'/** Continuous V8 narrative, language-specific clause captions and picture-clock framing. */\nexport const PROLOGUE_MEDIA=Object.freeze('+JSON.stringify(media,null,2)+');\nexport const PROLOGUE=Object.freeze('+JSON.stringify(captions.en,null,2)+');\n');
console.log(JSON.stringify({duration,shots:shots.length,paragraphs:lines.length,recorded:!!recorded,words:Object.fromEntries(['en','fr'].map(l=>[l,lines.reduce((n,x)=>n+x.text[l].split(/\s+/).length,0)])),times},null,2));
