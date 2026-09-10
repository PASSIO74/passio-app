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
  ["musique-violon", "Violon", "jouer du violon,archet", "musique"],
  ["musique-violoncelle", "Violoncelle", "jouer du violoncelle,cello", "musique"],
  ["musique-saxophone", "Saxophone", "sax", "musique"],
  ["musique-trompette", "Trompette", "jouer de la trompette,cuivre aigu", "musique"],
  ["musique-flute", "Flûte", "flûte traversière,jouer de la flûte", "musique"],
  ["musique-ukulele", "Ukulélé", "jouer du ukulélé,petite guitare hawaïenne", "musique"],
  ["musique-harmonica", "Harmonica", "jouer de l'harmonica,ruine-babines", "musique"],
  ["musique-accordeon", "Accordéon", "jouer de l'accordéon,piano à bretelles", "musique"],
  ["musique-dj", "DJ", "mix,platines,deejay", "musique"],
  ["musique-mao", "MAO", "musique assistée par ordinateur,production", "musique"],
  ["musique-beatmaking", "Beatmaking", "prod,instru", "musique"],
  ["musique-mixage", "Mixage", "mix audio", "musique"],
  ["musique-mastering", "Mastering", "masteriser,finalisation audio", "musique"],
  ["musique-composition", "Composition", "compo", "musique"],
  ["musique-solfege", "Solfège", "lire la musique,théorie du solfège", "musique"],
  ["musique-groupe", "Groupe et répétitions", "band,répète", "musique"],
  ["musique-home-studio", "Home studio", "studio maison", "musique"],
  ["musique-rap", "Rap", "hiphop", "musique"],
  ["musique-rock", "Rock", "musique rock,groupe de rock", "musique"],
  ["musique-jazz", "Jazz", "musique jazz,standards de jazz", "musique"],
  ["musique-musique-classique", "Musique classique", "classique", "musique"],
  ["musique-electro", "Électro", "edm", "musique"],
  ["musique-metal", "Metal", "musique metal,métalleux", "musique"],
  ["musique-reggae", "Reggae", "musique reggae,roots et dub", "musique"],
  ["musique-chanson-francaise", "Chanson française", "variété", "musique"],
  ["musique-blues", "Blues", "musique blues,douze mesures", "musique"],

  // ── Danse ────────────────────────────────────────────
  ["danse", "Danse", "dance,danser", "", { emoji: "💃", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["danse-hip-hop", "Hip-hop", "danse hip hop,street dance", "danse", { pop: 1 }],
  ["danse-classique-danse", "Danse classique", "ballet", "danse"],
  ["danse-contemporaine", "Danse contemporaine", "contemporain", "danse"],
  ["danse-salsa", "Salsa", "danser la salsa,soirée salsa", "danse"],
  ["danse-bachata", "Bachata", "danser la bachata,bachata sensual", "danse"],
  ["danse-kizomba", "Kizomba", "danser la kizomba,semba", "danse"],
  ["danse-rock-swing", "Rock et swing", "danser le rock,boogie-woogie", "danse"],
  ["danse-tango", "Tango", "danser le tango,tango argentin", "danse"],
  ["danse-valse", "Valse", "danser la valse,valse viennoise", "danse"],
  ["danse-breakdance", "Breakdance", "break,bboying", "danse"],
  ["danse-house-dance", "House dance", "danse house,jacking", "danse"],
  ["danse-danse-orientale", "Danse orientale", "danse du ventre,raqs sharqi", "danse"],
  ["danse-danse-africaine", "Danse africaine", "danses d'afrique,percussions et danse", "danse"],
  ["danse-zumba", "Zumba", "cours de zumba,fitness dansé", "danse"],
  ["danse-modern-jazz", "Modern jazz", "jazz dansé,danse jazz", "danse"],
  ["danse-claquettes", "Claquettes", "tap dance,danser aux claquettes", "danse"],
  ["danse-pole-dance", "Pole dance", "danse à la barre verticale,pole", "danse"],
  ["danse-danse-country", "Danse country", "line dance,danse en ligne country", "danse"],
  ["danse-kpop-dance", "K-pop dance", "kpop", "danse"],

  // ── Théâtre et scène ────────────────────────────────────────────
  ["theatre", "Théâtre et scène", "scène,spectacle,planches", "", { emoji: "🎭", color: "#7c3aed", broad: 1 }],
  ["theatre-improvisation", "Improvisation", "impro", "theatre"],
  ["theatre-theatre-classique", "Théâtre classique", "molière,répertoire classique", "theatre"],
  ["theatre-comedie", "Jouer la comédie", "jeu d'acteur,monter sur les planches", "theatre"],
  ["theatre-stand-up", "Stand-up", "standup", "theatre"],
  ["theatre-one-man-show", "One-man-show", "seul en scène,spectacle solo", "theatre"],
  ["theatre-mise-en-scene", "Mise en scène", "mettre en scène,metteur en scène", "theatre"],
  ["theatre-cirque", "Cirque", "arts du cirque,piste de cirque", "theatre"],
  ["theatre-jonglage", "Jonglage", "jongler,massues et balles", "theatre"],
  ["theatre-magie", "Magie", "prestidigitation", "theatre"],
  ["theatre-marionnettes", "Marionnettes", "marionnettiste,théâtre de marionnettes", "theatre"],
  ["theatre-cabaret", "Cabaret", "revue,spectacle de cabaret", "theatre"],
  ["theatre-comedie-musicale", "Comédie musicale", "musical,spectacle chanté", "theatre"],
  ["theatre-slam", "Slam", "scène slam,poésie dite", "theatre"],
  ["theatre-conte", "Conte", "conter,raconter des histoires", "theatre"],

  // ── Musique (compléments) ─────────────────────────────────────────────
  ["musique-guitare-acoustique", "Guitare acoustique", "guitare folk", "musique"],
  ["musique-guitare-classique", "Guitare classique", "guitare nylon,guitare espagnole", "musique"],
  ["musique-banjo", "Banjo", "jouer du banjo,bluegrass banjo", "musique"],
  ["musique-mandoline", "Mandoline", "jouer de la mandoline,cordes pincées italiennes", "musique"],
  ["musique-harpe", "Harpe", "jouer de la harpe,harpiste", "musique"],
  ["musique-orgue", "Orgue", "jouer de l'orgue,grandes orgues", "musique"],
  ["musique-clarinette", "Clarinette", "jouer de la clarinette,bois à anche", "musique"],
  ["musique-hautbois", "Hautbois", "jouer du hautbois,anche double", "musique"],
  ["musique-trombone", "Trombone", "jouer du trombone,coulisse", "musique"],
  ["musique-tuba", "Tuba", "jouer du tuba,cuivre grave", "musique"],
  ["musique-contrebasse", "Contrebasse", "jouer de la contrebasse,grosse basse", "musique"],
  ["musique-alto", "Alto", "jouer de l'alto,alto à cordes", "musique"],
  ["musique-percussions", "Percussions", "percussionniste,instruments à frapper", "musique"],
  ["musique-djembe", "Djembé", "percussions africaines", "musique"],
  ["musique-cajon", "Cajón", "caisse péruvienne,jouer du cajon", "musique"],
  ["musique-handpan", "Handpan", "hang", "musique"],
  ["musique-steel-drum", "Steel drum", "steelpan", "musique"],
  ["musique-synthetiseur", "Synthétiseur", "synthé,synthés modulaires", "musique"],
  ["musique-chorale", "Chorale", "chœur,chanter en groupe", "musique"],
  ["musique-orchestre", "Orchestre", "jouer en orchestre,formation symphonique", "musique"],
  ["musique-fanfare", "Fanfare", "harmonie municipale", "musique"],
  ["musique-lutherie", "Lutherie", "fabriquer un instrument,luthier", "musique"],
  ["musique-reprises", "Reprises", "covers,reprendre un morceau", "musique"],
  ["musique-improvisation", "Improvisation musicale", "improviser,impro musicale", "musique"],
  ["musique-musique-de-film", "Musique de film", "bande originale,bo", "musique"],
  ["musique-opera", "Opéra", "art lyrique", "musique"],
  ["musique-chant-lyrique", "Chant lyrique", "chant classique,voix lyrique", "musique"],
  ["musique-baroque", "Musique baroque", "baroque,musique ancienne", "musique"],
  ["musique-contemporaine", "Musique contemporaine", "musique savante actuelle,création musicale", "musique"],
  ["musique-folk", "Folk", "musique folk,chanson folk", "musique"],
  ["musique-country", "Country", "musique country,nashville", "musique"],
  ["musique-punk", "Punk", "musique punk,punk rock", "musique"],
  ["musique-hardcore", "Hardcore", "hardcore punk,musique extrême", "musique"],
  ["musique-techno", "Techno", "musique techno,club techno", "musique"],
  ["musique-house", "House", "musique house,deep house", "musique"],
  ["musique-drum-and-bass", "Drum and bass", "dnb,jungle", "musique"],
  ["musique-trap", "Trap", "musique trap,beats trap", "musique"],
  ["musique-lofi", "Lo-fi", "lofi", "musique"],
  ["musique-funk", "Funk", "musique funk,groove funk", "musique"],
  ["musique-soul", "Soul", "rnb,r&b", "musique"],
  ["musique-afrobeat", "Afrobeat", "afro", "musique"],
  ["musique-kpop", "K-pop", "pop coréenne,musique k-pop", "musique"],
  ["musique-monde", "Musiques du monde", "world music,musique traditionnelle", "musique"],
  ["musique-bretonne", "Musique bretonne", "fest-noz", "musique"],
  ["musique-beatbox", "Beatbox", "human beatbox", "musique"],
  ["musique-karaoke", "Karaoké", "chanter en karaoké,soirée karaoké", "musique"],
  ["musique-concerts", "Concerts", "aller en concert,live", "musique"],
  ["musique-festivals", "Festivals de musique", "festival", "musique"],
  ["musique-sound-system", "Sound system", "système son,sono mobile", "musique"],
  ["musique-collection-disques", "Digger et vinyles", "digger,crate digging", "musique"],
  ["musique-theorie", "Théorie musicale", "harmonie,accords", "musique"],
  ["musique-oreille", "Oreille et relevé", "relever un morceau", "musique"],
  ["musique-scene", "Jouer sur scène", "concert amateur,premiere partie", "musique"],
  ["musique-enregistrement", "Enregistrement", "prise de son", "musique"],

  // ── Danse (compléments) ───────────────────────────────────────────────
  ["danse-lindy-hop", "Lindy hop", "swing danse", "danse"],
  ["danse-charleston", "Charleston", "danse années 20,charleston swing", "danse"],
  ["danse-dancehall", "Dancehall", "danse jamaïcaine,dancehall queen", "danse"],
  ["danse-afro", "Danse afro", "afro dance", "danse"],
  ["danse-voguing", "Voguing", "vogue", "danse"],
  ["danse-waacking", "Waacking", "danse des bras,whacking", "danse"],
  ["danse-krump", "Krump", "danse krump,krumping", "danse"],
  ["danse-popping", "Popping", "danse popping,popper", "danse"],
  ["danse-locking", "Locking", "danse locking,locker", "danse"],
  ["danse-contact", "Danse contact", "contact improvisation", "danse"],
  ["danse-folklorique", "Danse folklorique", "danse traditionnelle", "danse"],
  ["danse-bretonne", "Danse bretonne", "gavotte,an dro", "danse"],
  ["danse-flamenco", "Flamenco", "danser le flamenco,zapateado", "danse"],
  ["danse-indienne", "Danse indienne", "bharatanatyam", "danse"],
  ["danse-irlandaise", "Danse irlandaise", "danse celtique,step irlandais", "danse"],
  ["danse-heels", "Heels", "talons", "danse"],
  ["danse-twerk", "Twerk", "danser le twerk,twerking", "danse"],
  ["danse-aerienne", "Danse aérienne", "tissu,cerceau aérien", "danse"],
  ["danse-chore", "Chorégraphie", "chorégraphier", "danse"],
  ["danse-bal", "Bals et guinguettes", "bal populaire", "danse"],

  // ── Théâtre et scène (compléments) ────────────────────────────────────
  ["theatre-amateur", "Théâtre amateur", "troupe amateur", "theatre"],
  ["theatre-ecriture", "Écriture théâtrale", "dramaturgie", "theatre"],
  ["theatre-doublage", "Doublage", "voix off,comédien de doublage", "theatre"],
  ["theatre-clown", "Clown", "art clownesque,nez rouge", "theatre"],
  ["theatre-mime", "Mime", "art du mime,jeu muet", "theatre"],
  ["theatre-trapeze", "Trapèze", "trapéziste,acrobatie au trapèze", "theatre"],
  ["theatre-tissu-aerien", "Tissu aérien", "tissus aériens,acrobatie sur tissu", "theatre"],
  ["theatre-echasses", "Échasses", "marcher sur échasses,échassier", "theatre"],
  ["theatre-feu", "Arts du feu", "jonglage de feu,fire show", "theatre"],
  ["theatre-regie", "Régie et technique du spectacle", "son et lumière,régisseur", "theatre"],
  ["theatre-costumes", "Costumes de scène", "costumier,habiller un spectacle", "theatre"],
  ["theatre-maquillage-scene", "Maquillage de scène", "fx makeup", "theatre"],
  ["theatre-decors", "Décors", "scénographie", "theatre"],
  ["theatre-spectateur", "Aller au spectacle", "sorties théâtre", "theatre"],
];
