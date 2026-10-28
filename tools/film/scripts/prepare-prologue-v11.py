"""Prepare the corrected V11 story against explicitly identified source clocks.

Downloads and intermediate renders stay in the local application cache. Retained
V10 shots are checked derivatives of the credited originals, never new sources.
"""
from pathlib import Path
import copy
import json

ROOT = Path(__file__).resolve().parents[3]


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def main():
    prior = read(ROOT/'tools/film/scripts/prologue-edit-v10.json')
    original = {s['id']: s for s in read(ROOT/'tools/film/reference/prologue-edit-v9-source.json')['shots']}
    old = {s['id']: s for s in prior['shots']}
    shots = []

    def keep(identity):
        shot = copy.deepcopy(old[identity])
        if shot['source'] == 'asset':
            shot['creditedOriginal'] = shot['file']
            shot['source'] = 'rendered-v10'
            shot['file'] = '../v10/picture/'+identity+'.mp4'
        shots.append(shot)

    def base(identity, duration=None, source_id=None):
        source = original[source_id or identity]
        shots.append({'id':identity,'source':'v9-0','duration':duration or source['duration'],
                      'sourceStart':source['start'],'sourceDuration':duration or source['duration']})

    def asset(identity, duration, filename, start, length, **extra):
        shots.append({'id':identity,'source':'asset','file':'assets/'+filename,'duration':duration,
                      'in':start,'sourceDuration':length,**extra})

    for identity in old:
        if identity == 'challenger': break
        keep(identity)
    asset('challenger-ascent',10,'challenger-ascent.ogv',73,10,eventDate='1986-01-28')
    for identity in ['challenger','remembrance','hubble','iss-capture','iss-unity']: keep(identity)
    asset('cassini-saturn',12,'cassini-success-original.mp4',10.2,12,eventDate='2004-07-01')
    asset('huygens-separation',10,'cassini-success-original.mp4',34,10,eventDate='2004-12-25')
    asset('huygens-descent',16,'huygens-experience.mp4',6,24,eventDate='2005-01-14')
    for identity in ['europe','iss-whole','iss-life','shuttle-retirement','soyuz','heliopause']: keep(identity)
    asset('rosetta-comet',8,'rosetta-descent-original.mov',9,13,eventDate='2014-08-06')
    asset('rosetta-observation',8,'rosetta-orbit.mp4',14,20,eventDate='2014-11-12')
    asset('philae-separation',12,'philae-science-original.mov',10,17,eventDate='2014-11-12')
    asset('philae-bounces',14,'philae-bounce-esa-original.mp4',4,20,eventDate='2014-11-12')
    asset('rosetta-descent',24,'rosetta-descent-original.mov',22,44,eventDate='2016-09-30')
    for identity in ['change4-wide','change4-site','falcon-launch','falcon-dual-return','falcon-return',
                     'mars-approach','perseverance-up','perseverance-down','webb']: keep(identity)
    asset('webb-deployment',18,'webb-deployment.webm',0,78,eventDate='2022-01-08')
    asset('webb-observatory',12,'webb-deployment.webm',78,12,eventDate='2022-01-24',fadeIn=0)
    base('solar-system')
    shots[-1].update(sourceStart=548,sourceDuration=12.5)
    shots.append({'id':'relic','source':'black','duration':16})
    position = 0
    for shot in shots:
        shot['start'],shot['end'] = position,position+shot['duration']; position = shot['end']
    index = {s['id']:s for s in shots}
    script = read(ROOT/'tools/film/scripts/prologue-narration-v10.json')
    removed = {'huygens-titan','rosetta-and-philae','rosetta-final-descent','rosetta-remains-on-surface',
               'journeys-leave-traces','traces-on-the-moon','traces-on-mars','traces-beyond-moon-and-mars','why-relic'}
    lines = []
    for line in script['lines']:
        if line['id'] in removed: continue
        row = copy.deepcopy(line); prior_shot=old[row['shot']]; target=index[row['shot']]
        row['start'] += target['start']-prior_shot['start']; row['end'] += target['start']-prior_shot['start']
        lines.append(row)

    def say(identity, shot, offset, end, en, fr):
        row = next((r for r in lines if r['id']==identity),None)
        value={'id':identity,'shot':shot,'start':index[shot]['start']+offset,'end':index[shot]['start']+end,
               'text':{'en':en,'fr':fr}}
        if row is not None: lines[lines.index(row)]=value
        else: lines.append(value)

    say('von-braun-postwar','von-braun',0,9.8,
        'A Nazi engineer, Wernher von Braun led development of the V2. After the war, he joined the American programme.',
        'Ingénieur nazi, Wernher von Braun dirige le développement de la V2. Après la guerre, il rejoint le programme américain.')
    say('shuttle-first-orbit','sts1',.4,15.5,
        'On 12 April 1981, Columbia launched the first orbital Shuttle flight. The mission succeeded, landing two days later. The programme could begin.',
        'Le 12 avril 1981, Columbia effectue le premier vol orbital d’une navette. La mission réussit et atterrit deux jours plus tard. Le programme peut commencer.')
    say('challenger-date','challenger-ascent',.3,9.7,
        'Nearly five years later, on 28 January 1986, Challenger launched with seven people aboard.',
        'Près de cinq ans plus tard, le 28 janvier 1986, Challenger décolle avec sept personnes à bord.')
    say('the-cost-of-flight','remembrance',.4,7.7,
        'Challenger broke apart seventy-three seconds after launch. All seven crew members died.',
        'Challenger se disloque soixante-treize secondes après le décollage. Les sept membres d’équipage meurent.')
    say('rivals-build-together','iss-capture',.3,19.7,
        'In 1998, Russia and the United States joined the first Station modules. Fifteen partner countries cooperate: the United States, Russia, Canada, Japan, and eleven European nations, including France, Germany and Italy.',
        'En 1998, la Russie et les États-Unis assemblent les premiers modules de l’ISS. Quinze pays partenaires coopèrent : États-Unis, Russie, Canada, Japon et onze pays européens, dont la France, l’Allemagne et l’Italie.')
    say('cassini-arrives-saturn','cassini-saturn',.4,11.6,
        'Beyond Earth orbit, Cassini reached Saturn in 2004. This American, European and Italian mission carried a small European probe: Huygens.',
        'Au-delà de l’orbite terrestre, Cassini atteint Saturne en 2004. Cette mission américaine, européenne et italienne transporte une petite sonde européenne : Huygens.')
    say('huygens-released','huygens-separation',.3,9.7,
        'Cassini released Huygens towards Titan, Saturn’s largest moon. The probe would descend through its thick atmosphere.',
        'Cassini libère Huygens vers Titan, la plus grande lune de Saturne. La sonde va traverser son atmosphère épaisse.')
    say('huygens-titan','huygens-descent',.3,15.6,
        'On 14 January 2005, Huygens descended under parachute and landed on Titan. This reconstruction follows that descent. Its real measurements revealed channels and rounded pebbles, shaped by flowing methane.',
        'Le 14 janvier 2005, Huygens descend sous parachute et se pose sur Titan. Cette reconstitution suit sa descente. Ses mesures révèlent des chenaux et des galets arrondis, façonnés par du méthane liquide.')
    say('a-shared-laboratory','europe',.3,9.7,
        'Back in Earth orbit, cooperation continued. In 2008, Europe added Columbus, the Station’s science laboratory.',
        'En orbite terrestre, la coopération continue. En 2008, l’Europe ajoute Columbus, laboratoire scientifique de l’ISS.')
    say('retiring-the-shuttle','shuttle-retirement',.3,15.6,
        'After Challenger in 1986, Columbia was lost during re-entry in 2003. Safety concerns and costs helped end the Shuttle programme. Its final flight landed in 2011.',
        'Après Challenger en 1986, Columbia est perdue au retour sur Terre en 2003. La sécurité et les coûts contribuent à l’arrêt du programme. Le dernier vol s’achève en 2011.')
    say('the-long-journey-continues','heliopause',.4,13.6,
        'In 2012, Voyager 1 crossed the heliopause, beyond the solar wind. It entered interstellar space, while still travelling within the Sun’s vast gravitational domain.',
        'En 2012, Voyager 1 franchit l’héliopause, au-delà du vent solaire. Il entre dans l’espace interstellaire, tout en restant dans le vaste domaine gravitationnel du Soleil.')
    say('rosetta-arrival','rosetta-comet',.2,7.8,
        'On 6 August 2014, Europe’s Rosetta reached comet 67P and began studying it up close.',
        'Le 6 août 2014, la sonde européenne Rosetta rejoint la comète 67P et commence à l’étudier de près.')
    say('rosetta-observes','rosetta-observation',.2,7.8,
        'For just over three months, Rosetta observed the comet before releasing its lander, Philae.',
        'Pendant un peu plus de trois mois, Rosetta observe la comète avant de libérer son module Philae.')
    say('philae-release','philae-separation',.3,11.7,
        'On 12 November, Philae separated from Rosetta. It fell slowly towards the surface, without an engine to control its descent.',
        'Le 12 novembre, Philae se détache de Rosetta. Il descend lentement vers la surface, sans moteur pour contrôler sa chute.')
    say('philae-real-landing','philae-bounces',.3,13.7,
        'Its anchoring harpoons failed to fire. Philae bounced twice before stopping in shadow. It sent measurements, but too little sunlight soon exhausted its battery.',
        'Ses harpons d’ancrage ne se déclenchent pas. Philae rebondit deux fois avant de s’immobiliser dans l’ombre. Il transmet des mesures, mais le manque de soleil épuise bientôt sa batterie.')
    say('rosetta-final-descent','rosetta-descent',.4,19.5,
        'Rosetta kept studying the comet for two more years. On 30 September 2016, it made a controlled descent to the surface, sending increasingly close images. Contact ended the mission. Rosetta and Philae remain there.',
        'Rosetta poursuit l’étude de la comète pendant deux ans. Le 30 septembre 2016, elle descend de façon contrôlée vers la surface et transmet des images toujours plus proches. Le contact met fin à la mission. Rosetta et Philae restent sur la comète.')
    say('change4-farside','change4-wide',.3,13.7,
        'After a comet, another robotic first took place on the Moon. On 3 January 2019, China’s Chang’e 4 made the first soft landing on its far side.',
        'Après une comète, une autre première robotique se joue sur la Lune. Le 3 janvier 2019, la sonde chinoise Chang’e 4 réalise le premier atterrissage en douceur sur sa face cachée.')
    say('returning-launchers','falcon-launch',.4,11.6,
        'On Earth, another transformation gathered pace. SpaceX, founded by Elon Musk, developed reusable launchers to carry satellites and spacecraft into orbit.',
        'Sur Terre, une autre transformation s’accélère. SpaceX, fondée par Elon Musk, développe des lanceurs réutilisables pour envoyer satellites et vaisseaux en orbite.')
    say('falcon-reuse','falcon-dual-return',.4,13.6,
        'After separating, the boosters guide themselves back and land vertically. Recovering these stages allows them to fly again, reducing the hardware needed for each mission.',
        'Après séparation, les boosters se dirigent vers leur zone de retour et se posent verticalement. Les récupérer permet de les faire revoler et de réutiliser une partie du matériel.')
    say('falcon-ongoing','falcon-return',.4,11.6,
        'These flights from 2019 and 2020 are examples. Falcon launches and booster recoveries continue today, serving scientific, commercial and crewed missions.',
        'Ces vols de 2019 et 2020 sont des exemples. Les lancements Falcon et les récupérations continuent aujourd’hui, pour des missions scientifiques, commerciales ou habitées.')
    say('looking-back-through-time','webb',.5,11.6,
        'In December 2021, NASA, ESA and Canada launched the James Webb Space Telescope, an infrared observatory designed to study the distant universe.',
        'En décembre 2021, la NASA, l’ESA et le Canada lancent le télescope spatial James Webb, un observatoire infrarouge conçu pour étudier l’univers lointain.')
    say('webb-deployment','webb-deployment',.4,17.6,
        'Its six-and-a-half-metre mirror unfolded in space, behind a five-layer sunshield. Keeping its instruments cold lets Webb detect faint infrared light from early galaxies and study the atmospheres of planets around other stars.',
        'Son miroir de six mètres cinquante se déploie dans l’espace, derrière un pare-soleil à cinq couches. Ses instruments refroidis captent la faible lumière infrarouge des premières galaxies et étudient les atmosphères de planètes autour d’autres étoiles.')
    say('webb-location','webb-observatory',.3,11.7,
        'Webb observes from around the Sun–Earth L2 point, one and a half million kilometres from Earth. It joins generations of machines sent beyond our world.',
        'Webb observe autour du point L2 du système Soleil-Terre, à un million et demi de kilomètres de la Terre. Il rejoint des générations de machines envoyées au-delà de notre monde.')
    say('journeys-leave-traces','solar-system',.3,16.7,
        'Across the Solar System and into interstellar space, our spacecraft keep exploring or remain where their missions ended: on the Moon, Mars, Titan, a comet, and in orbit. Each carries part of our history.',
        'À travers le Système solaire et jusque dans l’espace interstellaire, nos engins explorent encore ou demeurent là où leur mission s’est achevée : sur la Lune, Mars, Titan, une comète ou en orbite. Chacun porte une part de notre histoire.')
    say('why-relic','relic',1,11.5,
        'RELIC follows these machines and their stories. Explore the Solar System, and discover what we have left behind.',
        'RELIC retrace l’histoire de ces machines. Explorez le Système solaire et découvrez ce que nous avons laissé derrière nous.')
    archives=copy.deepcopy(prior['archivalAudio'])
    for archive in archives:
        archive['at'] += index[archive['shot']]['start']-old[archive['shot']]['start']
        if archive['id']=='perseverance-2021-edl': archive['gain']=.58
    plan={'version':11,'revision':'11.0-hd50','duration':position,'fps':50,'release':'v11-0-hd50',
          'sourceRevision':'9.0-hd50','sourceReceipt':prior['sourceReceipt'],'shots':shots,
          'archivalAudio':archives,'musicOnlyScenes':prior['musicOnlyScenes']+['iss-whole','iss-life'],
          'silenceMusic':[{'start':index['challenger']['start']-.35,'end':index['remembrance']['end']+.3}],
          'displayCaptions':[{'id':'iss-name','start':index['iss-whole']['start']+1.1,
                              'end':index['iss-whole']['start']+6.5,'kind':'subtitle',
                              'title':{'en':'International Space Station','fr':'International Space Station'}}],
          'editorialPolicy':[
              'All source timecodes refer explicitly to the frozen V9.0 master or to a named credited asset. No mixed revision clocks.',
              'Voyager precedes Enterprise by the owner’s explicit thematic ordering within 1977.',
              'Columbia STS-1 succeeds in April 1981; Challenger is lost on 28 January 1986; Columbia is lost on 1 February 2003.',
              'ISS partners means fifteen partner countries and five agencies, not visitor nationalities.',
              'Titan is introduced through Cassini at Saturn; one continuous reconstructed Huygens descent is shown once.',
              'Rosetta footage contains only the comet and spacecraft. Postmission reconstructed Philae bounces illustrate the actual failed anchoring, not the earlier predicted successful harpoon landing.',
              'No small scene labels or speaker captions. ISS is named in the main subtitle position.',
              'The final shot starts with a wide view of solar orbits after Webb, after the old Mars close-up has ended. No Mars pullout or repeated Titan, Rosetta, Voyager or Falcon pictures after Webb.',
              'The final black picture supports the player’s accessible RELIC logo, name and exploration button. It stays until the viewer acts.',
              'Stock bilingual paragraphs fit their scenes without truncation or post-synthesis time compression.'
          ]}
    script.update(version=11,duration=position,lines=sorted(lines,key=lambda r:r['start']))
    write(ROOT/'tools/film/scripts/prologue-edit-v11.json',plan)
    write(ROOT/'tools/film/scripts/prologue-narration-v11.json',script)
    print(json.dumps({'duration':position,'shots':len(shots),'paragraphs':len(lines)}))


if __name__=='__main__': main()
