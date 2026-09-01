/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — musique et scène
   ───────────────────────────────────────────────────────────────────────────
   ⚠️ IL N'Y A QU'UN SEUL NIVEAU. Chaque ligne de ce fichier est une PASSION
   directement sélectionnable, au même rang que toutes les autres. « Enduro »
   n'est pas « sous » Moto : on la choisit sans jamais passer par Moto.

   Le découpage en fichiers et le champ `broader` sont deux commodités qui ne
   sortent JAMAIS à l'écran :
     · le fichier sert à relire et à réviser le référentiel par domaine ;
     · `broader` alimente la table technique `passion_relations`, invisible,
       qui ne sert qu'à mieux suggérer (et jamais à filtrer, ni à imposer un
       passage par un terme plus général).

   FORMAT D'UNE LIGNE
     [ id, libellé, "alias1,alias2", broader, { emoji, color, pop, broad } ]

     id       identifiant TEXTE STABLE. Il est écrit dans `posts.passion_id`,
              `events.passion_id`… : ne JAMAIS le renommer, jamais le réutiliser.
     libellé  ce que la personne lit. Unique après normalisation.
     alias    synonymes et variantes de recherche, séparés par des virgules.
              Un synonyme simple reste un ALIAS — il ne devient pas une passion.
     broader  identifiant d'un terme plus général, ou "" — relation invisible.
     emoji    obligatoire quand `broader` est vide, hérité sinon.
     color    idem.
     pop:1    proposée au repos, avant toute frappe.
     broad:1  terme très général (« Sport », « Musique ») : la recherche le
              rétrograde derrière un terme précis de même pertinence.
   ═══════════════════════════════════════════════════════════════════════════ */
module.exports = [

  // ── Musique ────────────────────────────────────────────
  ["musique", "Musique", "music,zik,son,instrument", "", { emoji: "🎸", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["musique-guitare", "Guitare", "gratte", "musique"],
  ["musique-guitare-electrique", "Guitare électrique", "guitare elec,électrique", "musique", { pop: 1 }],
  ["musique-basse", "Basse", "guitare basse", "musique"],
  ["musique-piano", "Piano", "clavier", "musique", { pop: 1 }],
  ["musique-batterie", "Batterie", "drums", "musique"],
  ["musique-chant", "Chant", "voix,chanter", "musique"],
  ["musique-violon", "Violon", "", "musique"],
  ["musique-violoncelle", "Violoncelle", "", "musique"],
  ["musique-saxophone", "Saxophone", "sax", "musique"],
  ["musique-trompette", "Trompette", "", "musique"],
  ["musique-flute", "Flûte", "", "musique"],
  ["musique-ukulele", "Ukulélé", "", "musique"],
  ["musique-harmonica", "Harmonica", "", "musique"],
  ["musique-accordeon", "Accordéon", "", "musique"],
  ["musique-dj", "DJ", "mix,platines,deejay", "musique"],
  ["musique-mao", "MAO", "musique assistée par ordinateur,production", "musique"],
  ["musique-beatmaking", "Beatmaking", "prod,instru", "musique"],
  ["musique-mixage", "Mixage", "mix audio", "musique"],
  ["musique-mastering", "Mastering", "", "musique"],
  ["musique-composition", "Composition", "compo", "musique"],
  ["musique-solfege", "Solfège", "", "musique"],
  ["musique-groupe", "Groupe et répétitions", "band,répète", "musique"],
  ["musique-home-studio", "Home studio", "studio maison", "musique"],
  ["musique-rap", "Rap", "hiphop", "musique"],
  ["musique-rock", "Rock", "", "musique"],
  ["musique-jazz", "Jazz", "", "musique"],
  ["musique-musique-classique", "Musique classique", "classique", "musique"],
  ["musique-electro", "Électro", "edm", "musique"],
  ["musique-metal", "Metal", "", "musique"],
  ["musique-reggae", "Reggae", "", "musique"],
  ["musique-chanson-francaise", "Chanson française", "variété", "musique"],
  ["musique-blues", "Blues", "", "musique"],

  // ── Danse ────────────────────────────────────────────
  ["danse", "Danse", "dance,danser", "", { emoji: "💃", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["danse-hip-hop", "Hip-hop", "", "danse", { pop: 1 }],
  ["danse-classique-danse", "Danse classique", "ballet", "danse"],
  ["danse-contemporaine", "Danse contemporaine", "contemporain", "danse"],
  ["danse-salsa", "Salsa", "", "danse"],
  ["danse-bachata", "Bachata", "", "danse"],
  ["danse-kizomba", "Kizomba", "", "danse"],
  ["danse-rock-swing", "Rock et swing", "", "danse"],
  ["danse-tango", "Tango", "", "danse"],
  ["danse-valse", "Valse", "", "danse"],
  ["danse-breakdance", "Breakdance", "break,bboying", "danse"],
  ["danse-house-dance", "House dance", "", "danse"],
  ["danse-danse-orientale", "Danse orientale", "", "danse"],
  ["danse-danse-africaine", "Danse africaine", "", "danse"],
  ["danse-zumba", "Zumba", "", "danse"],
  ["danse-modern-jazz", "Modern jazz", "", "danse"],
  ["danse-claquettes", "Claquettes", "", "danse"],
  ["danse-pole-dance", "Pole dance", "", "danse"],
  ["danse-danse-country", "Danse country", "", "danse"],
  ["danse-kpop-dance", "K-pop dance", "kpop", "danse"],

  // ── Théâtre et scène ────────────────────────────────────────────
  ["theatre", "Théâtre et scène", "scène,spectacle,planches", "", { emoji: "🎭", color: "#7c3aed", broad: 1 }],
  ["theatre-improvisation", "Improvisation", "impro", "theatre"],
  ["theatre-theatre-classique", "Théâtre classique", "", "theatre"],
  ["theatre-comedie", "Jouer la comédie", "", "theatre"],
  ["theatre-stand-up", "Stand-up", "standup", "theatre"],
  ["theatre-one-man-show", "One-man-show", "", "theatre"],
  ["theatre-mise-en-scene", "Mise en scène", "", "theatre"],
  ["theatre-cirque", "Cirque", "", "theatre"],
  ["theatre-jonglage", "Jonglage", "", "theatre"],
  ["theatre-magie", "Magie", "prestidigitation", "theatre"],
  ["theatre-marionnettes", "Marionnettes", "", "theatre"],
  ["theatre-cabaret", "Cabaret", "", "theatre"],
  ["theatre-comedie-musicale", "Comédie musicale", "", "theatre"],
  ["theatre-slam", "Slam", "", "theatre"],
  ["theatre-conte", "Conte", "", "theatre"],

  // ── Musique (compléments) ─────────────────────────────────────────────
  ["musique-guitare-acoustique", "Guitare acoustique", "guitare folk", "musique"],
  ["musique-guitare-classique", "Guitare classique", "", "musique"],
  ["musique-banjo", "Banjo", "", "musique"],
  ["musique-mandoline", "Mandoline", "", "musique"],
  ["musique-harpe", "Harpe", "", "musique"],
  ["musique-orgue", "Orgue", "", "musique"],
  ["musique-clarinette", "Clarinette", "", "musique"],
  ["musique-hautbois", "Hautbois", "", "musique"],
  ["musique-trombone", "Trombone", "", "musique"],
  ["musique-tuba", "Tuba", "", "musique"],
  ["musique-contrebasse", "Contrebasse", "", "musique"],
  ["musique-alto", "Alto", "", "musique"],
  ["musique-percussions", "Percussions", "", "musique"],
  ["musique-djembe", "Djembé", "percussions africaines", "musique"],
  ["musique-cajon", "Cajón", "", "musique"],
  ["musique-handpan", "Handpan", "hang", "musique"],
  ["musique-steel-drum", "Steel drum", "steelpan", "musique"],
  ["musique-synthetiseur", "Synthétiseur", "synthé,synthés modulaires", "musique"],
  ["musique-chorale", "Chorale", "chœur,chanter en groupe", "musique"],
  ["musique-orchestre", "Orchestre", "", "musique"],
  ["musique-fanfare", "Fanfare", "harmonie municipale", "musique"],
  ["musique-lutherie", "Lutherie", "fabriquer un instrument,luthier", "musique"],
  ["musique-reprises", "Reprises", "covers,reprendre un morceau", "musique"],
  ["musique-improvisation", "Improvisation musicale", "", "musique"],
  ["musique-musique-de-film", "Musique de film", "bande originale,bo", "musique"],
  ["musique-opera", "Opéra", "art lyrique", "musique"],
  ["musique-chant-lyrique", "Chant lyrique", "", "musique"],
  ["musique-baroque", "Musique baroque", "", "musique"],
  ["musique-contemporaine", "Musique contemporaine", "", "musique"],
  ["musique-folk", "Folk", "", "musique"],
  ["musique-country", "Country", "", "musique"],
  ["musique-punk", "Punk", "", "musique"],
  ["musique-hardcore", "Hardcore", "", "musique"],
  ["musique-techno", "Techno", "", "musique"],
  ["musique-house", "House", "", "musique"],
  ["musique-drum-and-bass", "Drum and bass", "dnb,jungle", "musique"],
  ["musique-trap", "Trap", "", "musique"],
  ["musique-lofi", "Lo-fi", "lofi", "musique"],
  ["musique-funk", "Funk", "", "musique"],
  ["musique-soul", "Soul", "rnb,r&b", "musique"],
  ["musique-afrobeat", "Afrobeat", "afro", "musique"],
  ["musique-kpop", "K-pop", "", "musique"],
  ["musique-monde", "Musiques du monde", "world music,musique traditionnelle", "musique"],
  ["musique-bretonne", "Musique bretonne", "fest-noz", "musique"],
  ["musique-beatbox", "Beatbox", "human beatbox", "musique"],
  ["musique-karaoke", "Karaoké", "", "musique"],
  ["musique-concerts", "Concerts", "aller en concert,live", "musique"],
  ["musique-festivals", "Festivals de musique", "festival", "musique"],
  ["musique-sound-system", "Sound system", "", "musique"],
  ["musique-collection-disques", "Digger et vinyles", "digger,crate digging", "musique"],
  ["musique-theorie", "Théorie musicale", "harmonie,accords", "musique"],
  ["musique-oreille", "Oreille et relevé", "relever un morceau", "musique"],
  ["musique-scene", "Jouer sur scène", "concert amateur,premiere partie", "musique"],
  ["musique-enregistrement", "Enregistrement", "prise de son", "musique"],

  // ── Danse (compléments) ───────────────────────────────────────────────
  ["danse-lindy-hop", "Lindy hop", "swing danse", "danse"],
  ["danse-charleston", "Charleston", "", "danse"],
  ["danse-dancehall", "Dancehall", "", "danse"],
  ["danse-afro", "Danse afro", "afro dance", "danse"],
  ["danse-voguing", "Voguing", "vogue", "danse"],
  ["danse-waacking", "Waacking", "", "danse"],
  ["danse-krump", "Krump", "", "danse"],
  ["danse-popping", "Popping", "", "danse"],
  ["danse-locking", "Locking", "", "danse"],
  ["danse-contact", "Danse contact", "contact improvisation", "danse"],
  ["danse-folklorique", "Danse folklorique", "danse traditionnelle", "danse"],
  ["danse-bretonne", "Danse bretonne", "gavotte,an dro", "danse"],
  ["danse-flamenco", "Flamenco", "", "danse"],
  ["danse-indienne", "Danse indienne", "bharatanatyam", "danse"],
  ["danse-irlandaise", "Danse irlandaise", "", "danse"],
  ["danse-heels", "Heels", "talons", "danse"],
  ["danse-twerk", "Twerk", "", "danse"],
  ["danse-aerienne", "Danse aérienne", "tissu,cerceau aérien", "danse"],
  ["danse-chore", "Chorégraphie", "chorégraphier", "danse"],
  ["danse-bal", "Bals et guinguettes", "bal populaire", "danse"],

  // ── Théâtre et scène (compléments) ────────────────────────────────────
  ["theatre-amateur", "Théâtre amateur", "troupe amateur", "theatre"],
  ["theatre-ecriture", "Écriture théâtrale", "dramaturgie", "theatre"],
  ["theatre-doublage", "Doublage", "voix off,comédien de doublage", "theatre"],
  ["theatre-clown", "Clown", "", "theatre"],
  ["theatre-mime", "Mime", "", "theatre"],
  ["theatre-trapeze", "Trapèze", "", "theatre"],
  ["theatre-tissu-aerien", "Tissu aérien", "", "theatre"],
  ["theatre-echasses", "Échasses", "", "theatre"],
  ["theatre-feu", "Arts du feu", "jonglage de feu,fire show", "theatre"],
  ["theatre-regie", "Régie et technique du spectacle", "son et lumière,régisseur", "theatre"],
  ["theatre-costumes", "Costumes de scène", "", "theatre"],
  ["theatre-maquillage-scene", "Maquillage de scène", "fx makeup", "theatre"],
  ["theatre-decors", "Décors", "scénographie", "theatre"],
  ["theatre-spectateur", "Aller au spectacle", "sorties théâtre", "theatre"],
];
