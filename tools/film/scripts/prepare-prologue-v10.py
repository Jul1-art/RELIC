"""Build the V10 picture and bilingual narration plans from the checked V9 source.

Run before rendering. This updates production plans only, never delivered media.
The source HLS clock is V9.0, retained with its original checksum receipt.
"""
from pathlib import Path
import copy
import json

ROOT = Path(__file__).resolve().parents[3]


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def main():
    original = json.loads((ROOT / 'tools/film/reference/prologue-edit-v9-source.json').read_text(encoding='utf-8'))
    old = {x['id']: x for x in original['shots']}
    shots = []

    def base(identity, duration=None, source_id=None, **extra):
        source = old[source_id or identity]
        shot = {'id': identity, 'duration': duration or source['duration'], 'source': 'v9-0',
                'sourceStart': source['start'], 'sourceDuration': duration or source['duration']}
        shot.update(extra)
        shots.append(shot)

    def asset(identity, duration, filename, source_in=0, source_duration=None, **extra):
        shot = {'id': identity, 'duration': duration, 'source': 'asset', 'file': 'assets/' + filename,
                'in': source_in, 'sourceDuration': source_duration or duration}
        shot.update(extra)
        shots.append(shot)

    for identity in list(old)[:list(old).index('saturn-v')]:
        base(identity)
    asset('tereshkova', 14, 'tereshkova-1963.jpg', still=True, eventDate='1963-06-16')
    asset('leonov', 14, 'leonov.mp4', 3, eventDate='1965-03-18')
    asset('apollo8-orbit', 10, 'earthrise.mp4', 0, eventDate='1968-12-24')
    asset('apollo8-earthrise', 10, 'earthrise-colour.jpg', still=True, eventDate='1968-12-24')
    for identity in ['saturn-v', 'apollo-engines', 'apollo-liftoff', 'eagle-orbit', 'eagle-descent', 'moon']:
        base(identity)
    asset('moon-flag', 8, 'apollo11-broll.mp4', 1490, musicOnly=True, eventDate='1969-07-21')
    asset('eagle-landed', 14, 'apollo11-broll.mp4', 1538)
    asset('voyager2-launch', 8, 'voyager2-launch.mp4', 5, eventDate='1977-08-20')
    asset('voyager1-launch', 8, 'voyager1-launch.mp4', 5, eventDate='1977-09-05')
    asset('voyager-instruments', 8, 'voyager1-launch.mp4', 50)
    base('voyager', 8)
    base('shuttle-carrier')
    for identity in ['sts1', 'challenger', 'remembrance', 'hubble', 'iss-capture', 'iss-unity']:
        base(identity)
    asset('huygens-descent', 8, 'huygens-descent.mp4', 80, 120, eventDate='2005-01-14')
    asset('huygens-surface', 8, 'huygens-descent.mp4', 229, eventDate='2005-01-14')
    for identity in ['europe', 'iss-whole', 'iss-life', 'shuttle-retirement', 'soyuz', 'heliopause']:
        base(identity)
    asset('rosetta-comet', 4, 'rosetta-descent.mov', 3, eventDate='2014-08-06')
    base('philae-approach', 6, sourceStart=413.8)
    base('philae-landing', 6, sourceStart=421.8)
    asset('rosetta-descent', 20, 'rosetta-descent.mov', 8, 61, eventDate='2016-09-30')
    asset('change4-wide', 8, 'change4-lro.jpg', still=True, eventDate='2019-01-03')
    asset('change4-site', 6, 'change4-lro-detail.png', still=True, eventDate='2019-01-03')
    for identity in ['falcon-launch', 'falcon-dual-return', 'falcon-return', 'mars-approach', 'perseverance-up', 'perseverance-down', 'webb']:
        base(identity)
    shots.append({'id': 'webb-legacy-transition', 'duration': 6, 'source': 'bridge', 'musicOnlyLead': 1.2})
    for identity in ['lunar-orbiter', 'mars', 'hardware']:
        base(identity)
    asset('legacy-titan', 4, 'huygens-descent.mp4', 229)
    asset('legacy-comet', 4, 'rosetta-descent.mov', 63)
    base('legacy-interstellar', 6, source_id='voyager', sourceStart=260, sourceDuration=6)
    for identity in ['mars-pullout', 'solar-system', 'relic']:
        base(identity)
    position = 0
    for shot in shots:
        shot['start'], shot['end'] = position, position + shot['duration']
        position = shot['end']
    index = {x['id']: x for x in shots}
    plan = {'version': 10, 'revision': '10.0-hd50', 'duration': position, 'fps': 50,
            'sourceRevision': '9.0-hd50', 'sourceReceipt': 'intro/assets/prologue/encoding-v9-0-source.json',
            'shots': shots, 'editorialPolicy': [
                'Voyager precedes Enterprise by explicit editorial request. Both are dated 1977; this is a thematic handover within the year, not a claim that Enterprise tests began after the Voyager launches.',
                'The flag passage contains music only before the astronauts-returned paragraph.',
                'Philae landed in 2014. Rosetta ended with a controlled surface impact in 2016; an official visualization illustrates that descent.',
                'The concluding reflection is introduced by picture, narration and a continuous score. It has no epilogue title.',
                'Finished narration is never truncated or time-stretched to fit a picture slot.'
            ]}
    lines = []

    def say(identity, shot, offset, end_offset, en, fr, subtitles=None):
        target = index[shot]
        row = {'id': identity, 'shot': shot, 'start': round(target['start'] + offset, 6),
               'end': round(target['start'] + end_offset, 6), 'text': {'en': en, 'fr': fr}}
        if subtitles:
            row['subtitles'] = {'en': subtitles[0], 'fr': subtitles[1]}
        lines.append(row)

    say('a-world-and-a-question', 'deep-time', .9, 10.5,
        'Millions of years later, humanity transformed this same world, and learned to reach beyond it.',
        'Des millions d’années plus tard, l’humanité transformait cette même planète, puis apprenait à explorer au-delà.')
    say('war-rockets', 'v1', .5, 12.5,
        'In 1944, Nazi Germany deployed the V1 cruise missile and the V2 ballistic rocket.',
        'En 1944, l’Allemagne nazie déploie le missile de croisière V1 et la fusée balistique V2.')
    say('von-braun-postwar', 'von-braun', 0, 9.8,
        'After the war, Wernher von Braun joined the American programme. Soviet engineers developed their own rockets. The Space Race began.',
        'Après la guerre, Wernher von Braun rejoint le programme américain. L’URSS développe ses fusées. La course à l’espace commence.',
        (['After the war, Wernher von Braun joined the American programme.', 'Soviet engineers developed their own rockets. The Space Race began.'],
         ['Après la guerre, Wernher von Braun rejoint le programme américain.', 'L’URSS développe ses fusées. La course à l’espace commence.']))
    say('a-signal-around-earth', 'sputnik-wide', 2, 11.3,
        'In 1957, Sputnik became the first artificial satellite. Its signal carried the rivalry around the world.',
        'En 1957, Spoutnik devient le premier satellite artificiel. Son signal fait le tour du monde.')
    say('laika', 'laika', .5, 11.4,
        'Could a living passenger survive in orbit? Laika became the first dog to circle Earth, but did not survive the journey.',
        'Un être vivant pouvait-il survivre en orbite ? Laïka devient la première chienne à tourner autour de la Terre, sans survivre au voyage.')
    say('gagarin', 'gagarin', .1, 3.7,
        'Yuri Gagarin, the first human in space.',
        'Youri Gagarine, premier humain dans l’espace.')
    say('a-destination', 'moon-goal', .5, 7.5,
        'In 1961, the United States set a new destination beyond Earth orbit: the Moon.',
        'En 1961, les États-Unis fixent un objectif au-delà de l’orbite terrestre : la Lune.')
    say('tereshkova-first-woman', 'tereshkova', .5, 13.4,
        'On 16 June 1963, Valentina Tereshkova became the first woman in space. Aboard Vostok 6, she orbited Earth forty-eight times.',
        'Le 16 juin 1963, Valentina Terechkova devient la première femme dans l’espace. À bord de Vostok 6, elle accomplit quarante-huit orbites autour de la Terre.')
    say('leonov-first-spacewalk', 'leonov', .5, 13.4,
        'On 18 March 1965, Alexei Leonov left his Voskhod 2 spacecraft. For the first time, a human floated outside a spacecraft in orbit.',
        'Le 18 mars 1965, Alexeï Leonov sort du vaisseau Voskhod 2. Pour la première fois, un être humain évolue à l’extérieur d’un vaisseau en orbite.')
    say('apollo8-first-orbit', 'apollo8-orbit', .4, 9.5,
        'On 24 December 1968, Apollo 8 became the first crewed mission to orbit the Moon.',
        'Le 24 décembre 1968, Apollo 8 devient la première mission habitée en orbite autour de la Lune.')
    say('apollo8-earthrise', 'apollo8-earthrise', .4, 9.5,
        'Bill Anders photographed Earth rising above the lunar horizon. Earthrise offered a new view of our home.',
        'Bill Anders photographie la Terre au-dessus de l’horizon lunaire. Earthrise offre un nouveau regard sur notre planète.')
    say('a-promise-becomes-a-journey', 'saturn-v', .5, 11.5,
        'By 1969, NASA’s Apollo programme had turned that promise into a journey. Saturn V would carry three astronauts to the Moon.',
        'En 1969, le programme Apollo transforme cette promesse en voyage. Saturne V va emporter trois astronautes vers la Lune.')
    say('two-go-down-one-stays', 'eagle-orbit', .5, 13.5,
        'On 20 July 1969, Eagle separated from Columbia. Michael Collins stayed in lunar orbit while Neil Armstrong and Buzz Aldrin descended to the surface.',
        'Le 20 juillet 1969, Eagle se sépare de Columbia. Michael Collins reste en orbite lunaire pendant que Neil Armstrong et Buzz Aldrin descendent vers la surface.')
    say('the-first-machines-left-behind', 'eagle-landed', .5, 13.5,
        'The astronauts returned to Earth. But much of their equipment stayed on the Moon, where instruments continued their measurements after the crews had gone.',
        'Les astronautes sont revenus sur Terre. Mais une grande partie du matériel est restée sur la Lune, où les instruments ont poursuivi leurs mesures après leur départ.')
    say('voyager2-departure', 'voyager2-launch', .3, 7.7,
        'In August 1977, Voyager 2 launched towards the giant planets.',
        'En août 1977, Voyager 2 décolle vers les planètes géantes.')
    say('voyager1-departure', 'voyager1-launch', .3, 7.7,
        'Voyager 1 followed in September, on a faster route through the Solar System.',
        'Voyager 1 la suit en septembre, sur une trajectoire plus rapide à travers le Système solaire.')
    say('voyager-instruments', 'voyager-instruments', .3, 7.7,
        'Cameras and scientific instruments send their measurements to Earth through a large radio antenna.',
        'Caméras et instruments scientifiques transmettent leurs mesures à la Terre grâce à une grande antenne radio.')
    say('voyager-power', 'voyager', .3, 7.7,
        'Nuclear generators provide electricity, far from the Sun.',
        'Des générateurs nucléaires leur fournissent de l’électricité, loin du Soleil.')
    say('carrier-tests', 'shuttle-carrier', .1, 7.8,
        'On Earth, NASA tested another path: Enterprise, carried aboard a modified Boeing 747.',
        'Sur Terre, la NASA teste une autre voie : Enterprise, transportée sur un Boeing 747 modifié.')
    say('shuttle-first-orbit', 'sts1', .4, 15.5,
        'These tests prepared the Space Shuttle. In 1981, Columbia made the programme’s first orbital flight, carrying crews and scientific equipment into space.',
        'Ces essais préparent la navette spatiale. En 1981, Columbia accomplit le premier vol orbital du programme, pour transporter des équipages et du matériel scientifique dans l’espace.')
    say('the-cost-of-flight', 'remembrance', .5, 7.5,
        'Seven crew members died. NASA grounded the Shuttle to investigate.',
        'Challenger a emporté sept vies. La NASA a suspendu les vols pour enquêter.')
    say('a-new-view', 'hubble', .5, 13.5,
        'After flights resumed, a Shuttle crew deployed Hubble in 1990. Above the atmosphere, it could observe the universe more clearly.',
        'Après la reprise des vols, une navette déploie Hubble en 1990. Au-dessus de l’atmosphère, il peut mieux observer l’univers.')
    say('rivals-build-together', 'iss-capture', .5, 19.5,
        'In 1998, former rivals began building the International Space Station. Russian Zarya and American Unity became its first modules, beginning a shared home in Earth orbit.',
        'En 1998, d’anciens rivaux commencent à bâtir la Station spatiale internationale. Le module russe Zarya et le module américain Unity en deviennent les premières pièces : un habitat commun en orbite.')
    say('huygens-titan', 'huygens-descent', .4, 15.5,
        'On 14 January 2005, Europe’s Huygens probe landed on Titan, Saturn’s largest moon. Its images revealed a distant world of channels and rounded pebbles.',
        'Le 14 janvier 2005, la sonde européenne Huygens se pose sur Titan, la plus grande lune de Saturne. Ses images révèlent un monde lointain de chenaux et de galets arrondis.')
    say('a-shared-laboratory', 'europe', .5, 9.5,
        'Europe added its Columbus laboratory in 2008. With Japan and Canada, a shared laboratory grew above Earth.',
        'L’Europe ajoute son laboratoire Columbus en 2008. Avec le Japon et le Canada, un laboratoire commun grandit au-dessus de la Terre.')
    say('retiring-the-shuttle', 'shuttle-retirement', .3, 15.6,
        'Ageing spacecraft, high costs and safety concerns led NASA to retire the Shuttle fleet after assembling the Station. The final flight landed in 2011.',
        'Le vieillissement des navettes, les coûts et la sécurité conduisent la NASA à retirer sa flotte après l’assemblage de la Station. Le dernier vol s’achève en 2011.')
    say('keeping-the-outpost-alive', 'soyuz', .3, 7.7,
        'After the Shuttle retired, Russia’s Soyuz carried all arriving Station crews until 2020.',
        'Après les navettes, le Soyouz russe transporte seul les équipages de la Station jusqu’en 2020.')
    say('the-long-journey-continues', 'heliopause', .5, 13.5,
        'Meanwhile, Voyager 1 was still travelling. In 2012, it crossed the heliopause, beyond the solar wind.',
        'Pendant ce temps, Voyager 1 poursuit sa route. En 2012, il franchit l’héliopause, au-delà du vent solaire.')
    say('rosetta-and-philae', 'rosetta-comet', .2, 15.5,
        'In 2014, ESA’s Rosetta reached comet 67P. It released Philae, which descended and touched down on the surface.',
        'En 2014, la sonde européenne Rosetta rejoint la comète 67P. Elle largue Philae, qui descend et se pose à sa surface.')
    say('rosetta-final-descent', 'rosetta-descent', .3, 15.4,
        'Two years later, on 30 September 2016, Rosetta descended in turn. Its final images drew closer to the ground, until contact with the surface ended the mission.',
        'Deux ans plus tard, le 30 septembre 2016, Rosetta descend à son tour. Ses dernières images se rapprochent du sol, jusqu’au contact qui met fin à la mission.')
    say('rosetta-remains-on-surface', 'rosetta-descent', 16.1, 19.8,
        'Rosetta and Philae remain on the comet.',
        'Rosetta et Philae restent sur la comète.')
    say('change4-farside', 'change4-wide', .4, 13.5,
        'On 3 January 2019, China’s Chang’e 4 achieved the first soft landing on the far side of the Moon. The Yutu 2 rover then explored the surface.',
        'Le 3 janvier 2019, la sonde chinoise Chang’e 4 réalise le premier atterrissage en douceur sur la face cachée de la Lune. Le rover Yutu 2 explore ensuite la surface.')
    say('returning-launchers', 'falcon-launch', .5, 11.5,
        'SpaceX, founded by Elon Musk, developed boosters that could land and fly again. These Falcon missions flew in 2019 and 2020.',
        'SpaceX, fondée par Elon Musk, développe des boosters capables de se poser et de revoler. Ces missions Falcon ont lieu en 2019 et en 2020.')
    say('a-question-on-mars', 'mars-approach', .4, 7.5,
        'In 2021, Perseverance approached Mars to search for signs of ancient life.',
        'En 2021, Perseverance approche de Mars pour chercher les traces d’une vie ancienne.')
    say('looking-back-through-time', 'webb', .4, 11.4,
        'That December, Webb set out to observe the earliest galaxies. Exploration now reached across time as well as space.',
        'En décembre, Webb part observer les premières galaxies. Explorer l’espace permet aussi de remonter le temps.')
    say('journeys-leave-traces', 'webb-legacy-transition', 1.2, 5.6,
        'These journeys have also left traces behind.',
        'Ces voyages ont aussi laissé des traces.')
    say('traces-on-the-moon', 'lunar-orbiter', .4, 7.6,
        'On the Moon, Apollo’s landing stages and scientific instruments remain in place.',
        'Sur la Lune, les étages de descente d’Apollo et leurs instruments restent sur place.')
    say('traces-on-mars', 'mars', .4, 16.5,
        'On Mars, some robots still work. Other missions have ended, but their machines remain on the surface.',
        'Sur Mars, certains robots travaillent encore. D’autres missions sont terminées, mais leurs machines demeurent à la surface.')
    say('traces-beyond-moon-and-mars', 'legacy-titan', .2, 13.6,
        'On Titan, on a comet, in orbit or in interstellar space, other spacecraft continue their journey or preserve the traces of a completed mission.',
        'Sur Titan, sur une comète, en orbite ou dans l’espace interstellaire, d’autres engins poursuivent leur route ou gardent les traces d’une mission achevée.')
    say('why-relic', 'mars-pullout', .5, 28.5,
        'Each spacecraft records a step in what we learned to build, to reach and to understand. Some are still active. Others have become the remnants of our exploration. RELIC follows their stories across the Solar System.',
        'Chaque engin raconte une étape dans ce que nous avons appris à construire, à atteindre et à comprendre. Certains sont encore actifs. D’autres sont devenus les vestiges de notre exploration. RELIC retrace leur histoire à travers le Système solaire.')
    script = {'version': 10, 'synthetic': True, 'duration': position,
              'authorization': 'The project owner requested bilingual narration corrections and five additional milestones. Stock Kokoro voices only; historical voices remain archival.',
              'synchronization': 'Each scene-bound paragraph is rendered independently. In particular the postwar von Braun paragraph begins at his first picture, after the V2 music-only reading pause.',
              'lines': sorted(lines, key=lambda x: x['start'])}
    plan['musicOnlyScenes'] = [x['id'] for x in shots if x.get('musicOnly') or x['id'] == 'gagarin-silent']
    plan['silenceMusic'] = [{'start': index['challenger']['start']-.35, 'end': index['remembrance']['end']+.3}]
    plan['archivalAudio'] = [
        {'id': identity, 'shot': shot, 'at': index[shot]['start']+offset, 'sourceStart': source_in, 'length': length,
         'source': 'checked V9.0 bilingual mixed AAC', 'historicalVoiceSynthesized': False}
        for identity, shot, offset, source_in, length in [
            ('sputnik-original-signal', 'sputnik-wide', .1, 123.1, 1.7),
            ('gagarin-poyekhali-1961', 'gagarin', 3.8, 150.8, 1.486),
            ('jfk-rice-1962', 'kennedy', 0, 169, 18.95),
            ('apollo11-countdown-liftoff', 'apollo-engines', 0, 201, 16),
            ('armstrong-first-step-1969', 'moon', 1, 232, 9.412646),
            ('challenger-original-broadcast', 'challenger', 0, 299, 5.36),
            ('perseverance-2021-edl', 'perseverance-up', 0, 445, 10.2)
        ]
    ]
    write(ROOT/'tools/film/scripts/prologue-edit-v10.json', plan)
    write(ROOT/'tools/film/scripts/prologue-narration-v10.json', script)
    print(json.dumps({'duration': position, 'shots': len(shots), 'paragraphs': len(lines), 'vonBraun': index['von-braun']['start']}))


if __name__ == '__main__':
    main()
