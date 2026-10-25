/** Bilingual V7 narration and actual media-clock captions. */
export const PROLOGUE_MEDIA = Object.freeze({
  "duration": 516,
  "preview": false,
  "encoding": "./assets/prologue/encoding-v7.json",
  "sources": "./assets/prologue/sources-v7.json",
  "poster": "./assets/prologue/poster-v7.jpg",
  "src": "./assets/prologue/relic-prologue-v7-en.mp4",
  "hls": "./assets/prologue/v7/en.m3u8",
  "offline": {
    "id": "relic-documentary-v7-e898d652053d4785e073",
    "extra": [
      {
        "src": "./assets/prologue/iss-backdrop-v7.jpg",
        "bytes": 26396,
        "sha256": "c76a447548f38991e6ceed65e0df3b16df6a572811ebccc18d17929b6460748d"
      }
    ]
  },
  "languages": {
    "en": {
      "language": "en",
      "src": "./assets/prologue/relic-prologue-v7-en.mp4",
      "hls": "./assets/prologue/v7/en.m3u8"
    },
    "fr": {
      "language": "fr",
      "src": "./assets/prologue/relic-prologue-v7-fr.mp4",
      "hls": "./assets/prologue/v7/fr.m3u8"
    }
  }
});
export const PROLOGUE = Object.freeze([
  {
    "id": "beginning",
    "start": 0,
    "end": 6.3,
    "kind": "typing",
    "title": {
      "en": "In the beginning\nthere was nothing",
      "fr": "Au commencement,\nil n’y avait rien"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "typingStart": 0.35,
    "typingDuration": 2.6
  },
  {
    "id": "something",
    "start": 6.3,
    "end": 14,
    "kind": "typing",
    "title": {
      "en": "Then out of the nothingness\ncame something",
      "fr": "Puis, du néant,\nquelque chose a surgi"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "typingStart": 0.4,
    "typingDuration": 3.2
  },
  {
    "id": "origins",
    "start": 14,
    "end": 79,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "focusTimeline": [
      {
        "at": 0,
        "mobile": "50% 50%"
      },
      {
        "at": 31,
        "mobile": "30% 50%"
      },
      {
        "at": 37,
        "mobile": "50% 50%"
      },
      {
        "at": 39.1,
        "mobile": "30% 50%"
      },
      {
        "at": 46,
        "mobile": "50% 50%"
      }
    ]
  },
  {
    "id": "dinosaurs",
    "start": 79,
    "end": 93,
    "kind": "story",
    "title": {
      "en": "Long before us,\ndinosaurs roamed the Earth.",
      "fr": "Bien avant nous,\nles dinosaures peuplaient la Terre."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "early-humans",
    "start": 93,
    "end": 101,
    "kind": "story",
    "title": {
      "en": "Millions of years later,\nour ancestors made tools.",
      "fr": "Des millions d’années plus tard,\nnos ancêtres fabriquent des outils."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "fire",
    "start": 101,
    "end": 109,
    "kind": "story",
    "title": {
      "en": "They learned\nto harness fire.",
      "fr": "Ils apprennent\nà maîtriser le feu."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "humanity",
    "start": 109,
    "end": 117,
    "kind": "story",
    "title": {
      "en": "Then humans\nreshaped the world.",
      "fr": "Puis les humains\ntransforment le monde."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "v1",
    "start": 117,
    "end": 125,
    "kind": "story",
    "title": {
      "en": "Before exploration,\nthere were weapons.",
      "fr": "Avant l’exploration,\nil y eut des armes."
    },
    "kicker": {
      "en": "1944 · V1",
      "fr": "1944 · V1"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "v2",
    "start": 125,
    "end": 137,
    "kind": "quote",
    "title": {
      "en": "“Parts to make up one hundred V2s\nwere brought from Germany…”",
      "fr": "« Des pièces pour assembler cent V2\nfurent rapportées d’Allemagne… »"
    },
    "kicker": {
      "en": "White Sands · 1946",
      "fr": "White Sands · 1946"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "Universal Newsreel · original narration",
      "fr": "Universal Newsreel · narration originale"
    }
  },
  {
    "id": "von-braun",
    "start": 137,
    "end": 143,
    "kind": "story",
    "title": {
      "en": "A Nazi Party and SS member.\nV2s built with forced labor.",
      "fr": "Parti nazi et SS.\nDes V2 issues du travail forcé."
    },
    "kicker": {
      "en": "Wernher von Braun",
      "fr": "Wernher von Braun"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "von-braun-saturn",
    "start": 143,
    "end": 147,
    "kind": "story",
    "title": {
      "en": "Later, his NASA team\nwould develop Saturn V.",
      "fr": "Plus tard, son équipe à la NASA\ndéveloppera Saturn V."
    },
    "kicker": {
      "en": "Wernher von Braun",
      "fr": "Wernher von Braun"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "sputnik",
    "start": 147,
    "end": 161,
    "kind": "story",
    "title": {
      "en": "The Cold War\nreaches space.",
      "fr": "La guerre froide\ngagne l’espace."
    },
    "kicker": {
      "en": "USSR · Sputnik 1 · 1957",
      "fr": "URSS · Spoutnik 1 · 1957"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "laika",
    "start": 161,
    "end": 169,
    "kind": "story",
    "title": {
      "en": "Laika.\nThe first dog in orbit.",
      "fr": "Laïka.\nLa première chienne en orbite."
    },
    "kicker": {
      "en": "3 November 1957 · Sputnik 2",
      "fr": "3 novembre 1957 · Spoutnik 2"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "gagarin",
    "start": 169,
    "end": 175,
    "kind": "story",
    "title": {
      "en": "The first human\nin space.",
      "fr": "Le premier humain\ndans l’espace."
    },
    "kicker": {
      "en": "12 April 1961 · Yuri Gagarin",
      "fr": "12 avril 1961 · Youri Gagarine"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "poyekhali",
    "start": 175,
    "end": 179,
    "kind": "quote",
    "title": {
      "en": "“Let’s go!”",
      "fr": "« C’est parti ! »"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "Yuri Gagarin · original Russian",
      "fr": "Youri Gagarine · voix russe originale"
    }
  },
  {
    "id": "kennedy",
    "start": 179,
    "end": 194.2,
    "kind": "quote",
    "title": {
      "en": "“We choose to go\nto the Moon.”",
      "fr": "« Nous choisissons d’aller\nsur la Lune. »"
    },
    "kicker": {
      "en": "United States · 1962",
      "fr": "États-Unis · 1962"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "John F. Kennedy",
      "fr": "John F. Kennedy"
    }
  },
  {
    "id": "kennedy-hard",
    "start": 194.2,
    "end": 199,
    "kind": "quote",
    "title": {
      "en": "“Not because they are easy,\nbut because they are hard.”",
      "fr": "« Non parce que c’est facile,\nmais parce que c’est difficile. »"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "John F. Kennedy",
      "fr": "John F. Kennedy"
    }
  },
  {
    "id": "saturn-v",
    "start": 199,
    "end": 207,
    "kind": "story",
    "title": {
      "en": "Saturn V.\nA giant for the Moon.",
      "fr": "Saturne V.\nUn géant pour la Lune."
    },
    "kicker": {
      "en": "111 metres · Apollo era",
      "fr": "111 mètres · époque Apollo"
    },
    "spokenText": {
      "en": "Saturn Five. A giant for the Moon.",
      "fr": "Saturne cinq. Un géant pour la Lune."
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "countdown",
    "start": 207,
    "end": 213,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "launch",
    "start": 213,
    "end": 223,
    "kind": "quote",
    "title": {
      "en": "“Liftoff.\nWe have a liftoff.”",
      "fr": "« Décollage.\nNous avons décollé. »"
    },
    "kicker": {
      "en": "Apollo 11 · 16 July 1969",
      "fr": "Apollo 11 · 16 juillet 1969"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "Jack King · NASA",
      "fr": "Jack King · NASA"
    }
  },
  {
    "id": "eagle-orbit",
    "start": 223,
    "end": 231,
    "kind": "story",
    "title": {
      "en": "Eagle separated\nfrom Columbia.",
      "fr": "Eagle se sépare\nde Columbia."
    },
    "kicker": {
      "en": "Apollo 11 · lunar orbit",
      "fr": "Apollo 11 · orbite lunaire"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "eagle-descent",
    "start": 231,
    "end": 239,
    "kind": "story",
    "title": {
      "en": "A descent\ninto another world.",
      "fr": "Une descente\nvers un autre monde."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "moon",
    "start": 239,
    "end": 245.8,
    "kind": "quote",
    "title": {
      "en": "“That’s one small step\nfor man…”",
      "fr": "« C’est un petit pas\npour l’homme… »"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "Neil Armstrong",
      "fr": "Neil Armstrong"
    },
    "focus": {
      "desktop": "50% 50%",
      "mobile": "77% 50%"
    }
  },
  {
    "id": "moon-leap",
    "start": 245.8,
    "end": 253,
    "kind": "quote",
    "title": {
      "en": "“…one giant leap\nfor mankind.”",
      "fr": "« …un bond de géant\npour l’humanité. »"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "speaker": {
      "en": "Neil Armstrong",
      "fr": "Neil Armstrong"
    },
    "focus": {
      "desktop": "50% 50%",
      "mobile": "77% 50%"
    }
  },
  {
    "id": "eagle-landed",
    "start": 253,
    "end": 261,
    "kind": "story",
    "title": {
      "en": "Eagle had landed.\nHumanity had arrived.",
      "fr": "Eagle s’est posé.\nL’humanité est arrivée."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "lunar-orbiter",
    "start": 261,
    "end": 269,
    "kind": "story",
    "title": {
      "en": "Robotic eyes\nkept exploring the Moon.",
      "fr": "Des yeux robotisés\ncontinuent d’explorer la Lune."
    },
    "kicker": {
      "en": "Lunar Reconnaissance Orbiter",
      "fr": "Lunar Reconnaissance Orbiter"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "sts1",
    "start": 269,
    "end": 283,
    "kind": "story",
    "title": {
      "en": "Columbia.\nThe Shuttle era begins.",
      "fr": "Columbia.\nL’ère des navettes commence."
    },
    "kicker": {
      "en": "12 April 1981 · STS-1",
      "fr": "12 avril 1981 · STS-1"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "challenger",
    "start": 283,
    "end": 289,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "remembrance",
    "start": 289,
    "end": 294,
    "kind": "story",
    "title": {
      "en": "Challenger. Columbia.\nFourteen lives lost.",
      "fr": "Challenger. Columbia.\nQuatorze vies perdues."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "hubble",
    "start": 294,
    "end": 304,
    "kind": "story",
    "title": {
      "en": "New eyes\nabove Earth.",
      "fr": "De nouveaux yeux\nau-dessus de la Terre."
    },
    "kicker": {
      "en": "Hubble · 1990",
      "fr": "Hubble · 1990"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "focus": {
      "desktop": "50% 50%",
      "mobile": "50% 50%"
    }
  },
  {
    "id": "voyager",
    "start": 304,
    "end": 318,
    "kind": "story",
    "title": {
      "en": "Voyager 1.\nBeyond the Sun’s solar wind.",
      "fr": "Voyager 1.\nAu-delà du vent solaire."
    },
    "kicker": {
      "en": "2012 · heliopause crossing",
      "fr": "2012 · franchissement de l’héliopause"
    },
    "spokenText": {
      "en": "Voyager one. Beyond the Sun’s solar wind.",
      "fr": "Voyager un. Au-delà du vent solaire."
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "iss-capture",
    "start": 318,
    "end": 328,
    "kind": "story",
    "title": {
      "en": "Former rivals.\nA shared frontier.",
      "fr": "Anciens rivaux.\nUne frontière commune."
    },
    "kicker": {
      "en": "International Space Station · 1998",
      "fr": "Station spatiale internationale · 1998"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "iss-unity",
    "start": 328,
    "end": 338,
    "kind": "story",
    "title": {
      "en": "Zarya and Unity.\nJoined in orbit.",
      "fr": "Zarya et Unity.\nRéunis en orbite."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "europe",
    "start": 338,
    "end": 348,
    "kind": "story",
    "title": {
      "en": "Europe’s laboratory\njoins the station.",
      "fr": "Le laboratoire européen\nrejoint la station."
    },
    "kicker": {
      "en": "ESA · Columbus · 2008",
      "fr": "ESA · Columbus · 2008"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "iss-whole",
    "start": 348,
    "end": 360,
    "kind": "story",
    "title": {
      "en": "A laboratory\nabove one shared Earth.",
      "fr": "Un laboratoire\nau-dessus d’une Terre commune."
    },
    "kicker": {
      "en": "International Space Station",
      "fr": "Station spatiale internationale"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "iss-life",
    "start": 360,
    "end": 368,
    "kind": "story",
    "title": {
      "en": "Living here.\nLearning together.",
      "fr": "Vivre ici.\nApprendre ensemble."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "soyuz",
    "start": 368,
    "end": 378,
    "kind": "story",
    "title": {
      "en": "Soyuz.\nAnother path to orbit.",
      "fr": "Soyouz.\nUne autre route vers l’orbite."
    },
    "kicker": {
      "en": "Soyuz MS-24 · 2023",
      "fr": "Soyouz MS-24 · 2023"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "new-horizons",
    "start": 378,
    "end": 388,
    "kind": "story",
    "title": {
      "en": "Machines carried\nour questions farther.",
      "fr": "Des machines emportent\nnos questions plus loin."
    },
    "kicker": {
      "en": "New Horizons · 2006",
      "fr": "New Horizons · 2006"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "philae-approach",
    "start": 388,
    "end": 402,
    "kind": "story",
    "title": {
      "en": "Philae landed on a comet.\nCarried by ESA’s Rosetta.",
      "fr": "Philae se pose sur une comète.\nEmporté par Rosetta, mission de l’ESA."
    },
    "kicker": {
      "en": "12 November 2014 · comet 67P",
      "fr": "12 novembre 2014 · comète 67P"
    },
    "spokenText": {
      "en": "Philae landed on a comet. Carried by the European Space Agency’s Rosetta.",
      "fr": "Philae se pose sur une comète. Emporté par Rosetta, mission de l’Agence spatiale européenne."
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "webb",
    "start": 402,
    "end": 412,
    "kind": "story",
    "title": {
      "en": "Looking deeper.\nLooking back in time.",
      "fr": "Voir plus loin.\nRemonter le temps."
    },
    "kicker": {
      "en": "James Webb · 2021",
      "fr": "James Webb · 2021"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "perseverance",
    "start": 412,
    "end": 424,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "mars",
    "start": 424,
    "end": 432,
    "kind": "story",
    "title": {
      "en": "A planet of questions.\nExplorers on the ground.",
      "fr": "Une planète de questions.\nDes explorateurs au sol."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "falcon-launch",
    "start": 432,
    "end": 444,
    "kind": "story",
    "title": {
      "en": "SpaceX, founded by Elon Musk.\nLearning to return.",
      "fr": "SpaceX, fondée par Elon Musk.\nApprendre à revenir."
    },
    "kicker": {
      "en": "Falcon Heavy · 2019",
      "fr": "Falcon Heavy · 2019"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "falcon-dual-return",
    "start": 444,
    "end": 458,
    "kind": "story",
    "title": {
      "en": "Two boosters.\nTwo returns.",
      "fr": "Deux boosters.\nDeux retours."
    },
    "kicker": {
      "en": "Falcon Heavy · 2019",
      "fr": "Falcon Heavy · 2019"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "falcon-return",
    "start": 458,
    "end": 470,
    "kind": "story",
    "title": {
      "en": "Returning.\nTo fly again.",
      "fr": "Revenir.\nPour revoler."
    },
    "kicker": {
      "en": "Falcon 9 · 2020",
      "fr": "Falcon 9 · 2020"
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    },
    "focus": {
      "desktop": "50% 50%",
      "mobile": "48% 50%"
    }
  },
  {
    "id": "hardware",
    "start": 470,
    "end": 479,
    "kind": "story",
    "title": {
      "en": "Our machines remain on other worlds.\nTheir stories continue.",
      "fr": "Nos machines restent sur d’autres mondes.\nLeur histoire continue."
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "mars-pullout",
    "start": 479,
    "end": 491,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "solar-system",
    "start": 491,
    "end": 508,
    "kind": "visual",
    "title": {
      "en": "",
      "fr": ""
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  },
  {
    "id": "relic",
    "start": 508,
    "end": 516,
    "kind": "end",
    "title": {
      "en": "RELIC",
      "fr": "RELIC"
    },
    "kicker": {
      "en": "",
      "fr": ""
    },
    "sourceLabel": {
      "en": "See the film sources in RELIC.",
      "fr": "Voir les sources du film dans RELIC."
    }
  }
]);
