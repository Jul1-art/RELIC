"""Record the final cut's editorial argument, footage identity and narration."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'intro/assets/prologue'
def read(p):return json.loads((ROOT/p).read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
prior=read('intro/assets/prologue/sources-v7.json')
plan=read('tools/film/scripts/prologue-edit-v8.json')
voice=read('media-work/v8-narration/manifest.json')
script=read('tools/film/scripts/prologue-narration-v8.json')
encoding=read('intro/assets/prologue/encoding-v8.json') if (OUT/'encoding-v8.json').exists() else None
used={s['file'] for s in plan['shots'] if s.get('file')}
sources=[a for a in prior['newArchivesAndVisualizations'] if a['file'] in used]
clock=0;timeline=[]
for s in plan['shots']:
 timeline.append({**s,'start':clock,'end':clock+s['duration']});clock+=s['duration']
assert not any(s['id'] in ('early-humans','fire','new-horizons') for s in plan['shots'])
assert voice['scriptSha256']==sha(ROOT/'tools/film/scripts/prologue-narration-v8.json')
result={
 'schema':'relic.prologue.sources.v8','version':8,'revision':'8.4','checkedOn':'2026-10-24',
 'preview':False,'sourcesPending':False,'narrativeAudioPending':False,
 'durationSeconds':clock,'languages':['en','fr'],
 'movie':{l:f'relic-prologue-v8-4-{l}.mp4' for l in ['en','fr']},
 'fallbacks':encoding['fallbacks'] if encoding else None,
 'hls':encoding['hls'] if encoding else None,
 'archiveSubtitleManifestSha256':sha(ROOT/'tools/film/scripts/prologue-archives-v9.json'),
 'archiveSubtitles':read('tools/film/scripts/prologue-archives-v9.json'),
 'archiveSubtitlePolicy':{'primary':'Every intelligible word in the six selected historical speech excerpts is captioned, in English and French, using complete successive clauses.','sts1':'Only the verified non-spoken engine interval from source5.5 to9.2 seconds is retained under narration; announcer intervals are omitted.','falconHeavy':'Only source4 to12 seconds is retained; the unclear distant PA at the beginning is omitted.','falcon9':'Engine and landing ambience; no intelligible speech verified.'},
 'landscapeSubtitlePolicy':'On coarse-pointer landscape screens up to600pxhigh, captions sit at the safe bottom edge during clean playback and move above the transport only while controls are visible. Typing and the final logo stay centered.',
 'mobileFraming':'Complete source frame on portrait phones/tablets and short coarse-pointer landscape screens. A small canvas samples the same decoded video at at most4fps as a soft backdrop; no extra stream.',
 'spaceXFounder':{'name':'Elon Musk','founded':2002,'narratedIn':['en','fr'],'reference':'https://www.britannica.com/money/SpaceX'},
 'narration':voice,'syntheticNarrationApproved':True,'historicalVoicesSynthesized':False,
 'narrationScriptSha256':sha(ROOT/'tools/film/scripts/prologue-narration-v8.json'),
 'editPlanSha256':sha(ROOT/'tools/film/scripts/prologue-edit-v8.json'),
 'narrativeStructure':[
  'A world forms; much later, people ask what lies beyond its sky.',
  'Wartime V2 technology feeds the Cold War rivalry, then orbital flight and a lunar goal.',
  'Apollo leaves scientific instruments; robotic and crewed exploration follow parallel paths.',
  'Shuttle science and its human cost lead into Hubble, then international cooperation in orbit.',
  'Voyager’s long journey, Philae, Perseverance and Webb carry instruments where crews cannot go.',
  'Returning launchers introduce the contrast with machines designed to remain at their destinations.',
  'Lunar traces, an explicitly identified active Curiosity and distant equipment lead to RELIC’s purpose.'
 ],
 'editorialChanges':plan['editorialChanges'],
 'removedFootage':[
  {'id':'early-humans','reason':'The fictional prehistoric tool-making scene interrupted the film’s tone.'},
  {'id':'fire','reason':'The user explicitly requested removal of the fire-making demonstration.'},
  {'id':'dinosaur-storm','reason':'Replaced by a restrained narrated time bridge to connect prehistoric life and modern human activity.'},
  {'id':'new-horizons','reason':'The available footage showed the 2006 launch, not a 2015 Pluto reveal; this cut omits that digression.'}
 ],
 'openingContext':prior['openingContext'],
 'warTransition':{'from':'v2','to':'von-braun','type':'fade','seconds':1,'context':'The postwar biographical narration bridges a one-second dissolve from V2 footage to the moving NASA1962 portrait beside a rocket model. V1 and V2 labels distinguish cruise missile and ballistic rocket.'},
 'openingTreatment':'Centered black-screen typewriter reveal, 4.5 and 5 seconds, recorded keystrokes. Explicit playback retains per-character reveal with reduced motion and with subtitles disabled; the reduced-motion caret is steady. There is no spoken narration during the first16 seconds. The cosmic sequence remains without narration or narrative text.',
 'endingTreatment':'The foreground RELIC symbol and name stay sharp and centered over the existing solar-system footage. Both the main picture and mobile backdrop blur for the ending. The brand card remains visible with subtitles disabled through the final frame.',
 'captionTiming':voice.get('subtitleTimingMethod',voice.get('captionTimingMethod','Approximate phoneme-weighted clause timing refined against measured quiet regions; not word-exact alignment.')),
 'pictureClock':'Picture scenes drive framing independently from language-specific spoken clause captions. Text does not restart because the shot changes.',
 'earthIdentification':{'scene':'origins','start':51,'end':59,'label':{'en':'Earth · 4.5 billion years ago','fr':'Terre · Il y a 4,5 milliards d’années'},'context':'Approximate age of Earth. The label appears only on the existing NASA molten-Earth visualization, after the Big Bang and protoplanetary-disk scenes.','reference':'https://science.nasa.gov/earth/facts/'},
 'deepTimeBridge':{'start':88,'end':91,'replaces':'dinosaur-storm','picture':'Black editorial interval between the forest dinosaur and present-day NASA night lights.','dinosaurFadeSeconds':.75,'humanityFadeSeconds':1,'audio':'The existing score continues; one connected narration begins with Millions of years later and carries into the modern human-activity image. No added whoosh or impact.','context':'An ellipse across millions of years. Modern city lights symbolize humanity today; they are not presented as footage of the first humans.'},
 'historicalAudioWindows':[a for a in plan['audio'] if a['role']=='archival'],
 'paragraphTranscript':script['lines'],
 'currentAdditionalSources':sources,
 'inheritedLicensedSourceCatalog':prior['previousSourceProvenance'],
 'catalogContext':'The inherited catalog documents research and previous edits. Only editTimeline entries and their source files identify pictures used in this V8 cut.',
 'verifiedPictureIdentity':[
  {'shots':['moon-goal'],'source':'NASA Apollo11 B-roll','in':1183,'context':'Moving lunar view illustrates the destination before Kennedy’s 1962 speech. It is Apollo-era imagery, not footage filmed in 1962.'},
  {'shots':['eagle-orbit'],'source':'NASA Apollo11 B-roll','in':1195,'context':'Columbia is visible through Eagle’s window; narration describes their separation.'},
  {'shots':['eagle-descent'],'source':'NASA Apollo11 B-roll','in':1254,'context':'Verified LM-window view approaching the surface; replaces a less relevant orbital horizon.'},
  {'shots':['eagle-landed'],'source':'NASA Apollo11 B-roll','in':1518,'context':'Surface EVA with astronauts and flag, placed after Armstrong’s first step.'},
  {'shots':['lunar-orbiter'],'source':'NASA SVS4717, The Taurus-Littrow Valley through LRO’s Eyes','sourcePage':'https://svs.gsfc.nasa.gov/4717/','published':'2018-03-23','context':'LRO image and LOLA terrain visualization of Apollo17’s landing area, used in the final legacy passage. The local filename apollo17-flyover-original.mp4 does not identify Apollo-era camera footage.'},
  {'shots':['mars-approach'],'source':'NASA/JPL-Caltech Perseverance onboard descent camera','sourcePage':'https://images.nasa.gov/details/JPL-20210222-M2020f-0001-Perseverance%20Rover%E2%80%99s%20Descent%20and%20Touchdown%20on%20Mars','in':85,'crop':'crop=752:600:282:0','context':'A single terrain camera pane establishes Mars before the touchdown transmission. Embedded multi-camera diagrams and black graphic space are excluded; the NASA source itself includes altered playback rates.'},
  {'shots':['mars','hardware','mars-pullout'],'source':'NASA/JPL-Caltech Curiosity panorama, mission animation and orbital-site visualization','context':'Curiosity is named as a different, active rover. Its panorama, close-up animation and site pullout are grouped in the conclusion; none is claimed to be Perseverance.'}
 ],
 'musicCredit':prior['musicCredit'],'musicSource':prior['musicSource'],'musicLicense':prior['musicLicense'],
 'musicContext':'Helios by Scott Buckley, the retained score. Two long passages are crossfaded; music is ducked under speech and silenced for the Challenger remembrance. It is not a Transformers soundtrack.',
 'musicOnlyScenes':plan.get('musicOnlyScenes',[]),
 'musicTimeline':plan['music'],'audioTimeline':plan['audio']+plan['effects'],'editTimeline':timeline,
 'spaceXContext':prior['spaceXContext'],
 'historicalContext':[
  'Civilian rocketry predates the Second World War. The V1 footage depicts a cruise missile; the V2 passage concerns wartime rockets, followed by captured German hardware tested at White Sands in 1946.',
  'Wernher von Braun was a Nazi Party and SS member. V2 production used forced labour; later he worked in the United States. Soviet engineering followed a distinct programme also informed by captured technology.',
  'Sputnik was the first artificial satellite; the photographed flight spare was filmed in 2017. The archived radio signal is genuine.',
  'Laika was the first dog in orbit, not the first dog ever sent above the atmosphere. She did not survive her mission; the source illustrates her with a historical portrait.',
  'Voyager probes launched in 1977. Voyager1 crossed the heliopause in 2012; this is not a departure from all solar gravity or the Oort cloud.',
  'Crewed space stations existed before the ISS. The 1998 passage introduces the ISS cooperation, not the beginning of habitation in space.',
  'Soyuz MS24 footage from 2023 illustrates continuing ISS transport inside the station chapter. The narration then explicitly returns to the parallel robotic exploration thread.',
  'Philae touched comet67P in 2014 as part of ESA’s Rosetta mission. The film does not claim this was the first robotic planetary landing.',
  'The 2019/2020 Falcon images illustrate the parallel development of reuse; no claim says these were the first recoveries or happened after Webb’s 2021 launch.',
  'The ending joins existing videos. It does not claim a physically continuous camera recording from a rover to the whole Solar System.'
 ],
 'offlineContext':'Voluntary full download, size/SHA-256 verification, shared video and localized mixed audio. A new edition is not marked available until its own complete files have been verified.',
 'iconProvenance':prior['iconProvenance']
}
OUT.mkdir(exist_ok=True)
(OUT/'sources-v8.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'V8 provenance: {clock}s, {len(script["lines"])} connected paragraphs ×2 languages; no prehistoric-human/fire footage.')
