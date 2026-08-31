/* ══════════════════════════════════════════════════════════════════════════
   CATALOGUE DES PASSIONS ET SPÉCIALITÉS — référentiel versionné (lot TAXO-1)
   ──────────────────────────────────────────────────────────────────────────
   Trois niveaux, une seule règle de lecture :

     UNIVERS      — n'existe QUE pour naviguer dans ce fichier et dans le
                    catalogue à l'écran. Il n'apparaît JAMAIS dans une identité,
                    sur une carte, ni sur une publication. Il n'est écrit dans
                    aucune colonne de contenu.
     PASSION      — le seul niveau sélectionnable comme centre d'intérêt et le
                    seul écrit dans `posts.passion_id` / `events.passion_id`.
     SPÉCIALITÉ   — facultative, appartient à UNE passion et une seule, écrite
                    dans la colonne facultative `specialty_id`.

   ⚠️ LES 19 IDENTIFIANTS CANONIQUES SONT INTOUCHABLES. `musique`, `photo`,
   `voyage`, `cuisine`, `sport`, `litterature`, `cinema`, `tech`, `art`,
   `jardinage`, `metier`, `jeuxvideo`, `yoga`, `mode`, `danse`, `podcast`,
   `moto`, `animaux`, `actu` sont référencés par des clés étrangères en
   production (posts, stories, events, conversations, profiles). En renommer un
   casse toutes les publications qui le portent. `npm run valider:catalogue`
   refuse tout catalogue où l'un des 19 manque.

   ⚠️ L'IDENTIFIANT D'UNE SPÉCIALITÉ EST PRÉFIXÉ PAR SA PASSION :
   `moto` + `enduro` → `moto-enduro`. Aucun identifiant de passion ne contient
   de tiret (le validateur l'impose), donc le préfixe est sans ambiguïté et
   l'appartenance se relit à l'œil dans la base.

   ⚠️ CE FICHIER EST LA SOURCE. La migration SQL
   (`migrations/migration_passion_taxonomy.sql`) en est un MIROIR, régénéré par
   `node scripts/generer-migration-catalogue.js`. Ne jamais éditer l'un sans
   l'autre : `npm run valider:catalogue` compare les deux et échoue sinon.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ── Univers : [id, emoji, libellé] ────────────────────────────────────────
  var UNIVERS = [
    ["sports",   "🏃", "Sports et mouvement"],
    ["scene",    "🎵", "Musique et scène"],
    ["arts",     "🎨", "Arts et création"],
    ["mobilite", "🌍", "Voyages et mobilité"],
    ["techno",   "💻", "Technologie et sciences"],
    ["maison",   "🍳", "Cuisine et art de vivre"],
    ["vivant",   "🌿", "Nature et animaux"],
    ["culture",  "📚", "Culture et savoirs"],
    ["bienetre", "🧘", "Bien-être et santé"],
    ["social",   "🤝", "Vie sociale et projets"]
  ];

  // ── Passion : [id, univers, emoji, libellé, couleur, populaire, synonymes, spécialités]
  //    Spécialité : ["suffixe", "Libellé"]  ou  ["suffixe", "Libellé", "syn1,syn2"]
  var SRC = [

    // ═══ SPORTS ET MOUVEMENT ═══════════════════════════════════════════════
    ["sport", "sports", "🏋️", "Sport", "#8b5cf6", 1, "sports,activité physique,athlétisme", [
      ["athletisme", "Athlétisme", "athlé"],
      ["gymnastique", "Gymnastique", "gym artistique"],
      ["escalade", "Escalade", "grimpe"],
      ["equitation", "Équitation", "cheval,poney"],
      ["tir-a-l-arc", "Tir à l'arc"],
      ["escrime", "Escrime"],
      ["tennis", "Tennis"],
      ["padel", "Padel"],
      ["badminton", "Badminton", "badm"],
      ["tennis-de-table", "Tennis de table", "ping-pong,pingpong"],
      ["squash", "Squash"],
      ["triathlon", "Triathlon", "ironman"],
      ["marche-sportive", "Marche sportive", "marche rapide"],
      ["handisport", "Handisport", "sport adapté"],
      ["coaching-sportif", "Coaching sportif", "coach"],
      ["preparation-physique", "Préparation physique", "prépa physique"],
      ["arbitrage", "Arbitrage"],
      ["patinage", "Patinage", "patin à glace"],
      ["roller", "Roller", "rollers,patin à roulettes"],
      ["parkour", "Parkour", "freerun"],
      ["sport-en-salle", "Sport en salle"],
      ["competition", "Compétition"]
    ]],

    ["combat", "sports", "🥊", "Sports de combat", "#8b5cf6", 1, "arts martiaux,combat,ring", [
      ["boxe", "Boxe anglaise", "boxe"],
      ["boxe-thai", "Boxe thaï", "muay thai,muay-thaï"],
      ["kickboxing", "Kickboxing", "kick boxing"],
      ["mma", "MMA", "arts martiaux mixtes,free fight"],
      ["judo", "Judo"],
      ["jujitsu", "Ju-jitsu"],
      ["jjb", "Jiu-jitsu brésilien", "jjb,bjj"],
      ["karate", "Karaté"],
      ["taekwondo", "Taekwondo"],
      ["aikido", "Aïkido"],
      ["lutte", "Lutte"],
      ["krav-maga", "Krav-maga"],
      ["kung-fu", "Kung-fu", "wushu"],
      ["capoeira", "Capoeira"],
      ["sambo", "Sambo"],
      ["self-defense", "Self-défense", "défense personnelle"],
      ["savate", "Savate", "boxe française"]
    ]],

    ["collectif", "sports", "⚽", "Sports collectifs", "#7c3aed", 1, "sport co,équipe,club", [
      ["football", "Football", "foot,soccer"],
      ["futsal", "Futsal", "foot en salle"],
      ["rugby", "Rugby", "rugby à XV"],
      ["rugby-a-7", "Rugby à 7", "seven"],
      ["basketball", "Basketball", "basket"],
      ["handball", "Handball", "hand"],
      ["volleyball", "Volleyball", "volley"],
      ["beach-volley", "Beach-volley", "volley de plage"],
      ["hockey-sur-gazon", "Hockey sur gazon"],
      ["hockey-sur-glace", "Hockey sur glace"],
      ["water-polo", "Water-polo"],
      ["baseball", "Baseball"],
      ["football-americain", "Football américain", "foot us"],
      ["ultimate", "Ultimate frisbee", "frisbee"]
    ]],

    ["glisse", "sports", "🏄", "Glisse et board", "#8b5cf6", 0, "board,ride,glisse", [
      ["skateboard", "Skateboard", "skate"],
      ["longboard", "Longboard"],
      ["surf", "Surf"],
      ["bodyboard", "Bodyboard"],
      ["paddle", "Paddle", "stand up paddle,sup"],
      ["snowboard", "Snowboard", "snow"],
      ["ski-alpin", "Ski alpin", "ski"],
      ["ski-de-fond", "Ski de fond"],
      ["ski-de-randonnee", "Ski de randonnée", "ski de rando"],
      ["freeride", "Freeride", "hors-piste"],
      ["kitesurf", "Kitesurf", "kite"],
      ["windsurf", "Windsurf", "planche à voile"],
      ["wingfoil", "Wingfoil", "wing"],
      ["wakeboard", "Wakeboard"],
      ["ski-nautique", "Ski nautique"],
      ["trottinette-freestyle", "Trottinette freestyle", "trott"]
    ]],

    ["outdoor", "sports", "🥾", "Montagne et outdoor", "#7c3aed", 0, "plein air,nature,montagne,rando", [
      ["randonnee", "Randonnée", "rando,marche"],
      ["trekking", "Trekking", "trek"],
      ["alpinisme", "Alpinisme", "haute montagne"],
      ["via-ferrata", "Via ferrata"],
      ["canyoning", "Canyoning", "canyon"],
      ["speleologie", "Spéléologie", "spéléo,grotte"],
      ["bivouac", "Bivouac"],
      ["camping", "Camping"],
      ["bushcraft", "Bushcraft"],
      ["survie", "Survie", "survivalisme"],
      ["course-orientation", "Course d'orientation", "orientation"],
      ["raquettes-a-neige", "Raquettes à neige"],
      ["cascade-de-glace", "Cascade de glace"],
      ["slackline", "Slackline"],
      ["geocaching", "Géocaching"],
      ["cueillette", "Cueillette", "champignons"],
      ["escalade-bloc", "Escalade de bloc", "bloc,bouldering"],
      ["parapente", "Parapente", "vol libre"]
    ]],

    ["running", "sports", "🏃", "Course à pied", "#8b5cf6", 1, "running,jogging,course,run,footing", [
      ["jogging", "Jogging", "footing"],
      ["trail", "Trail", "trail running"],
      ["marathon", "Marathon"],
      ["semi-marathon", "Semi-marathon", "semi"],
      ["dix-km", "10 km"],
      ["ultra-trail", "Ultra-trail", "ultra"],
      ["cross", "Cross", "cross-country"],
      ["piste", "Course sur piste"],
      ["course-obstacles", "Course à obstacles", "spartan,ocr"],
      ["running-urbain", "Running urbain"],
      ["fractionne", "Fractionné", "interval"],
      ["preparation-course", "Préparation de course", "plan d'entraînement"],
      ["course-nature", "Course nature"],
      ["relais", "Relais", "ekiden"]
    ]],

    ["fitness", "sports", "💪", "Musculation et fitness", "#7c3aed", 1, "muscu,musculation,gym,fitness,salle", [
      ["musculation", "Musculation", "muscu"],
      ["crossfit", "CrossFit", "cross training"],
      ["halterophilie", "Haltérophilie", "haltéro"],
      ["street-workout", "Street workout"],
      ["calisthenics", "Callisthénie", "calisthenics,poids du corps"],
      ["hiit", "HIIT"],
      ["cardio", "Cardio"],
      ["renforcement-musculaire", "Renforcement musculaire", "renfo"],
      ["powerlifting", "Powerlifting", "force athlétique"],
      ["bodybuilding", "Bodybuilding", "culturisme"],
      ["kettlebell", "Kettlebell"],
      ["trx", "TRX", "sangles"],
      ["spinning", "Spinning", "biking,rpm"],
      ["aquagym", "Aquagym"],
      ["stretching", "Stretching", "étirements,souplesse"],
      ["fitness-maison", "Fitness à la maison", "home gym"],
      ["prise-de-masse", "Prise de masse"],
      ["seche", "Sèche"]
    ]],

    ["cyclisme", "sports", "🚴", "Vélo et cyclisme", "#8b5cf6", 0, "vélo,velo,bike,cyclisme,bicyclette", [
      ["route", "Vélo de route", "route"],
      ["vtt", "VTT", "vtt,mountain bike"],
      ["gravel", "Gravel"],
      ["bmx", "BMX"],
      ["piste-velo", "Piste"],
      ["cyclocross", "Cyclo-cross"],
      ["descente", "Descente", "dh,downhill"],
      ["velo-electrique", "Vélo électrique", "vae,vélo élec"],
      ["cyclotourisme", "Cyclotourisme", "cyclo"],
      ["bikepacking", "Bikepacking"],
      ["velotaf", "Vélotaf", "vélo au travail"],
      ["fixie", "Fixie", "pignon fixe"],
      ["mecanique-velo", "Mécanique vélo"],
      ["course-sur-route", "Course sur route"],
      ["enduro-vtt", "Enduro VTT"],
      ["trial-velo", "Trial vélo"]
    ]],

    // ═══ MUSIQUE ET SCÈNE ═══════════════════════════════════════════════════
    ["musique", "scene", "🎸", "Musique", "#8b5cf6", 1, "music,zik,son,instrument", [
      ["guitare", "Guitare", "gratte"],
      ["guitare-electrique", "Guitare électrique"],
      ["basse", "Basse", "guitare basse"],
      ["piano", "Piano", "clavier"],
      ["batterie", "Batterie", "drums"],
      ["chant", "Chant", "voix,chanter"],
      ["violon", "Violon"],
      ["violoncelle", "Violoncelle"],
      ["saxophone", "Saxophone", "sax"],
      ["trompette", "Trompette"],
      ["flute", "Flûte"],
      ["ukulele", "Ukulélé", "ukulele"],
      ["harmonica", "Harmonica"],
      ["accordeon", "Accordéon"],
      ["dj", "DJ", "mix,platines,deejay"],
      ["mao", "MAO", "musique assistée par ordinateur,production"],
      ["beatmaking", "Beatmaking", "prod,instru"],
      ["mixage", "Mixage", "mix audio"],
      ["mastering", "Mastering"],
      ["composition", "Composition", "compo"],
      ["solfege", "Solfège", "théorie musicale"],
      ["groupe", "Groupe et répétitions", "band,répète"],
      ["home-studio", "Home studio", "studio maison"],
      ["rap", "Rap", "hip-hop,hiphop"],
      ["rock", "Rock"],
      ["jazz", "Jazz"],
      ["musique-classique", "Musique classique", "classique"],
      ["electro", "Électro", "electro,edm,techno"],
      ["metal", "Metal", "métal"],
      ["reggae", "Reggae"],
      ["chanson-francaise", "Chanson française", "variété"],
      ["blues", "Blues"]
    ]],

    ["danse", "scene", "💃", "Danse", "#8b5cf6", 1, "dance,danser,chorégraphie", [
      ["hip-hop", "Hip-hop", "hiphop"],
      ["classique-danse", "Danse classique", "ballet"],
      ["contemporaine", "Danse contemporaine", "contemporain"],
      ["salsa", "Salsa"],
      ["bachata", "Bachata"],
      ["kizomba", "Kizomba"],
      ["rock-swing", "Rock et swing", "lindy hop"],
      ["tango", "Tango"],
      ["valse", "Valse"],
      ["breakdance", "Breakdance", "break,bboying"],
      ["house-dance", "House dance"],
      ["danse-orientale", "Danse orientale"],
      ["danse-africaine", "Danse africaine"],
      ["zumba", "Zumba"],
      ["modern-jazz", "Modern jazz"],
      ["claquettes", "Claquettes"],
      ["pole-dance", "Pole dance"],
      ["danse-country", "Danse country"],
      ["kpop-dance", "K-pop dance", "kpop"]
    ]],

    ["theatre", "scene", "🎭", "Théâtre et scène", "#7c3aed", 0, "scène,spectacle,planches", [
      ["improvisation", "Improvisation", "impro"],
      ["theatre-classique", "Théâtre classique"],
      ["comedie", "Comédie"],
      ["stand-up", "Stand-up", "standup"],
      ["one-man-show", "One-man-show"],
      ["mise-en-scene", "Mise en scène"],
      ["cirque", "Cirque"],
      ["jonglage", "Jonglage"],
      ["magie", "Magie", "prestidigitation"],
      ["marionnettes", "Marionnettes"],
      ["cabaret", "Cabaret"],
      ["comedie-musicale", "Comédie musicale"],
      ["slam", "Slam"],
      ["conte", "Conte"]
    ]],

    // ═══ ARTS ET CRÉATION ═══════════════════════════════════════════════════
    ["photo", "arts", "📷", "Photo", "#8b5cf6", 1, "photo,photographie,photographe,appareil photo", [
      ["portrait", "Portrait"],
      ["paysage", "Paysage"],
      ["argentique", "Argentique", "pellicule,film"],
      ["studio", "Studio"],
      ["street-photo", "Street photo", "photo de rue"],
      ["animalier", "Animalier", "photo animalière"],
      ["macro", "Macro", "macrophotographie"],
      ["astrophoto", "Astrophotographie", "astrophoto"],
      ["mariage", "Mariage"],
      ["mode-photo", "Photo de mode"],
      ["reportage", "Reportage", "photojournalisme"],
      ["noir-et-blanc", "Noir et blanc", "nb,n&b"],
      ["developpement", "Développement", "labo,tirage"],
      ["retouche", "Retouche", "photoshop"],
      ["lightroom", "Lightroom", "catalogage"],
      ["drone", "Photo par drone", "drone"],
      ["sport-photo", "Photo de sport"],
      ["culinaire-photo", "Photo culinaire", "food photo"],
      ["urbex", "Urbex", "exploration urbaine"],
      ["longue-exposition", "Longue exposition", "pose longue"],
      ["photo-mobile", "Photo au smartphone", "photo mobile"],
      ["nature-morte", "Nature morte"]
    ]],

    ["art", "arts", "🎨", "Art", "#8b5cf6", 1, "arts visuels,art,créer,artiste", [
      ["peinture", "Peinture", "peindre"],
      ["aquarelle", "Aquarelle"],
      ["huile", "Peinture à l'huile"],
      ["acrylique", "Acrylique"],
      ["dessin", "Dessin", "dessiner"],
      ["croquis", "Croquis", "sketch"],
      ["illustration", "Illustration"],
      ["bd", "Bande dessinée", "bd,comics"],
      ["manga-dessin", "Dessin manga", "manga"],
      ["sculpture", "Sculpture"],
      ["ceramique", "Céramique"],
      ["gravure", "Gravure"],
      ["street-art", "Street art"],
      ["graffiti", "Graffiti", "graff,tag"],
      ["calligraphie", "Calligraphie", "lettering"],
      ["collage", "Collage"],
      ["pastel", "Pastel"],
      ["encre", "Encre"],
      ["art-numerique", "Art numérique", "digital art"],
      ["land-art", "Land art"],
      ["mosaique", "Mosaïque"],
      ["portrait-dessin", "Portrait au crayon"]
    ]],

    ["mode", "arts", "👗", "Mode", "#7c3aed", 1, "fashion,style,vêtements,look", [
      ["couture", "Couture", "coudre,machine à coudre"],
      ["stylisme", "Stylisme"],
      ["upcycling", "Upcycling", "surcyclage"],
      ["tricot", "Tricot", "tricoter"],
      ["crochet", "Crochet"],
      ["broderie", "Broderie"],
      ["vintage", "Vintage", "friperie,seconde main"],
      ["sneakers", "Sneakers", "baskets"],
      ["streetwear", "Streetwear"],
      ["maquillage", "Maquillage", "makeup"],
      ["coiffure", "Coiffure"],
      ["nail-art", "Nail art", "ongles"],
      ["accessoires", "Accessoires"],
      ["mode-durable", "Mode durable", "éthique"],
      ["shopping", "Shopping"],
      ["lookbook", "Lookbook"],
      ["patronage", "Patronage"],
      ["teinture", "Teinture", "tie and dye"]
    ]],

    ["metier", "arts", "🛠", "Artisanat", "#6d28d9", 0, "artisanat,fait main,craft,métier d'art", [
      ["menuiserie", "Menuiserie", "bois"],
      ["ebenisterie", "Ébénisterie"],
      ["poterie", "Poterie", "tour"],
      ["ceramique-artisanat", "Céramique d'art"],
      ["forge", "Forge", "forgeron"],
      ["coutellerie", "Coutellerie", "couteau"],
      ["maroquinerie", "Maroquinerie", "cuir"],
      ["vitrail", "Vitrail"],
      ["verrerie", "Verrerie", "soufflage de verre"],
      ["bijouterie", "Bijouterie", "bijoux"],
      ["tapisserie", "Tapisserie"],
      ["restauration-meubles", "Restauration de meubles"],
      ["tournage-bois", "Tournage sur bois"],
      ["sculpture-bois", "Sculpture sur bois"],
      ["savonnerie", "Savonnerie", "savon"],
      ["bougies", "Bougies"],
      ["vannerie", "Vannerie", "osier"],
      ["reliure", "Reliure"],
      ["cordonnerie", "Cordonnerie"],
      ["ferronnerie", "Ferronnerie"]
    ]],

    ["video", "arts", "🎥", "Vidéo et montage", "#7c3aed", 0, "video,vidéo,montage,filmer", [
      ["montage", "Montage", "editing,premiere,davinci"],
      ["tournage", "Tournage"],
      ["court-metrage", "Court-métrage", "court métrage"],
      ["documentaire", "Documentaire", "docu"],
      ["motion-design", "Motion design"],
      ["vlog", "Vlog"],
      ["youtube", "YouTube"],
      ["drone-video", "Vidéo par drone"],
      ["colorimetrie", "Colorimétrie", "étalonnage"],
      ["sound-design", "Sound design"],
      ["storyboard", "Storyboard"],
      ["streaming", "Streaming", "live"],
      ["twitch", "Twitch"],
      ["podcast-video", "Podcast vidéo"],
      ["effets-speciaux", "Effets spéciaux", "vfx"],
      ["cadrage", "Cadrage et lumière"]
    ]],

    ["design", "arts", "🖌️", "Design et graphisme", "#8b5cf6", 0, "design,graphisme,graphiste,ui,ux", [
      ["graphisme", "Graphisme"],
      ["ui-design", "UI design", "interface"],
      ["ux-design", "UX design", "expérience utilisateur"],
      ["typographie", "Typographie", "typo,police"],
      ["identite-visuelle", "Identité visuelle", "branding"],
      ["logo", "Logo"],
      ["affiche", "Affiche", "poster"],
      ["illustration-vectorielle", "Illustration vectorielle", "vectoriel"],
      ["design-produit", "Design produit"],
      ["design-3d", "Design 3D", "3d,blender"],
      ["packaging", "Packaging"],
      ["print", "Print", "impression"],
      ["web-design", "Web design"],
      ["direction-artistique", "Direction artistique", "da"],
      ["figma", "Figma"],
      ["illustrator", "Illustrator et Photoshop", "adobe"]
    ]],

    // ═══ VOYAGES ET MOBILITÉ ════════════════════════════════════════════════
    ["voyage", "mobilite", "🌍", "Voyage", "#8b5cf6", 1, "voyage,travel,partir,découverte", [
      ["road-trip", "Road trip", "roadtrip"],
      ["backpacking", "Backpacking", "sac à dos,routard"],
      ["city-break", "City break", "week-end en ville"],
      ["randonnee-voyage", "Voyage en randonnée"],
      ["voyage-solo", "Voyage en solo", "solo"],
      ["expatriation", "Expatriation", "expat"],
      ["aviation", "Aviation", "avion,vol"],
      ["croisiere", "Croisière"],
      ["train", "Voyage en train", "interrail"],
      ["camping-car", "Camping-car"],
      ["vanlife", "Vanlife", "van,fourgon aménagé"],
      ["tour-du-monde", "Tour du monde"],
      ["voyage-famille", "Voyage en famille"],
      ["voyage-budget", "Voyage petit budget", "pas cher"],
      ["plongee-voyage", "Plongée", "plongée sous-marine,scuba"],
      ["culture-locale", "Culture locale"],
      ["gastronomie-voyage", "Gastronomie du monde"],
      ["photographie-voyage", "Photo de voyage"],
      ["europe", "Europe"],
      ["asie", "Asie"],
      ["amerique-latine", "Amérique latine"],
      ["afrique", "Afrique"],
      ["france", "France"]
    ]],

    ["moto", "mobilite", "🏍", "Moto", "#64748b", 1, "moto,motard,deux-roues,2 roues", [
      ["route-moto", "Route", "balade route"],
      ["balade", "Balade", "ride"],
      ["circuit", "Circuit", "piste"],
      ["motocross", "Motocross", "moto cross,mx,cross"],
      ["enduro", "Enduro", "tout-terrain"],
      ["trial", "Trial"],
      ["mecanique", "Mécanique", "entretien,garage"],
      ["roadster", "Roadster"],
      ["sportive", "Sportive"],
      ["trail-moto", "Trail"],
      ["custom", "Custom"],
      ["cafe-racer", "Café racer"],
      ["voyage-moto", "Voyage à moto", "moto voyage"],
      ["supermotard", "Supermotard", "supermot"],
      ["permis", "Permis moto"],
      ["equipement", "Équipement", "casque,protections"],
      ["scooter", "Scooter"],
      ["restauration-moto", "Restauration de moto"]
    ]],

    ["auto", "mobilite", "🚗", "Auto et mécanique", "#7c3aed", 0, "auto,voiture,bagnole,mécanique", [
      ["mecanique-auto", "Mécanique auto"],
      ["restauration-auto", "Restauration"],
      ["youngtimer", "Youngtimer"],
      ["voiture-ancienne", "Voiture ancienne", "collection,ancêtre"],
      ["tuning", "Tuning"],
      ["circuit-auto", "Circuit"],
      ["rallye", "Rallye"],
      ["karting", "Karting", "kart"],
      ["drift", "Drift"],
      ["electrique", "Voiture électrique", "ev"],
      ["quatre-quatre", "4x4 et off-road", "4x4,tout-terrain"],
      ["detailing", "Detailing", "esthétique auto"],
      ["preparation-auto", "Préparation"],
      ["sport-auto", "Sport automobile"],
      ["formule-1", "Formule 1", "f1"],
      ["road-trip-auto", "Road trip en voiture"],
      ["entretien-auto", "Entretien"],
      ["utilitaire", "Utilitaire et aménagement"]
    ]],

    // ═══ TECHNOLOGIE ET SCIENCES ════════════════════════════════════════════
    ["tech", "techno", "💻", "Tech / IA", "#7c3aed", 1, "tech,technologie,informatique,geek", [
      ["gadgets", "Gadgets"],
      ["smartphones", "Smartphones", "téléphone,mobile"],
      ["domotique", "Domotique", "maison connectée"],
      ["hardware", "Hardware", "matériel,montage pc"],
      ["pc-gaming", "PC gaming", "config"],
      ["impression-3d", "Impression 3D", "imprimante 3d"],
      ["raspberry-pi", "Raspberry Pi"],
      ["arduino", "Arduino"],
      ["electronique", "Électronique"],
      ["reseaux", "Réseaux", "network"],
      ["cybersecurite", "Cybersécurité", "sécurité,hacking"],
      ["linux", "Linux"],
      ["open-source", "Open source", "logiciel libre"],
      ["self-hosting", "Auto-hébergement", "self hosting,homelab"],
      ["retro-informatique", "Rétro-informatique", "retro"],
      ["drones", "Drones"],
      ["realite-virtuelle", "Réalité virtuelle", "vr,casque vr"],
      ["objets-connectes", "Objets connectés", "iot"],
      ["veille-tech", "Veille techno"],
      ["reparation", "Réparation", "réparer"]
    ]],

    ["jeuxvideo", "techno", "🎮", "Jeux vidéo", "#8b5cf6", 1, "gaming,jeux video,jeu vidéo,gamer", [
      ["fps", "FPS", "shooter"],
      ["rpg", "RPG", "jeu de rôle"],
      ["mmorpg", "MMORPG", "mmo"],
      ["moba", "MOBA"],
      ["strategie", "Stratégie", "rts,4x"],
      ["plateforme", "Plateforme", "platformer"],
      ["simulation", "Simulation", "simu"],
      ["course-jeu", "Course", "racing"],
      ["sport-jeu", "Sport", "fifa,nba"],
      ["aventure", "Aventure"],
      ["indie", "Jeux indés", "indé"],
      ["retrogaming", "Rétrogaming", "retro gaming"],
      ["speedrun", "Speedrun"],
      ["esport", "Esport", "e-sport,compétitif"],
      ["streaming-jeu", "Streaming de jeu"],
      ["nintendo", "Nintendo", "switch"],
      ["playstation", "PlayStation", "ps5"],
      ["xbox", "Xbox"],
      ["pc-gaming-jeu", "Jeu sur PC"],
      ["mobile-gaming", "Jeu mobile"],
      ["vr-gaming", "Jeu en VR"],
      ["modding", "Modding", "mods"],
      ["game-design", "Game design", "création de jeu"]
    ]],

    ["ia", "techno", "🤖", "Intelligence artificielle", "#7c3aed", 0, "ia,ai,intelligence artificielle", [
      ["ia-generative", "IA générative", "gen ai"],
      ["llm", "Modèles de langage", "llm,gpt,claude"],
      ["prompt-engineering", "Prompt engineering", "prompt"],
      ["machine-learning", "Machine learning", "ml,apprentissage automatique"],
      ["deep-learning", "Deep learning", "réseaux de neurones"],
      ["vision-par-ordinateur", "Vision par ordinateur", "computer vision"],
      ["nlp", "Traitement du langage", "nlp"],
      ["robotique", "Robotique", "robot"],
      ["automatisation", "Automatisation", "automation,n8n"],
      ["agents", "Agents autonomes", "agents ia"],
      ["image-generative", "Génération d'images", "midjourney,stable diffusion"],
      ["voix-synthese", "Synthèse vocale", "tts,voix"],
      ["data-science", "Data science", "données"],
      ["mlops", "MLOps"],
      ["ethique-ia", "Éthique de l'IA"],
      ["ia-locale", "IA locale", "on device"],
      ["no-code-ia", "IA sans code", "no code"],
      ["chatbots", "Chatbots", "assistants"]
    ]],

    ["dev", "techno", "👨‍💻", "Développement et code", "#8b5cf6", 0, "dev,code,coder,programmation,développeur", [
      ["javascript", "JavaScript", "js"],
      ["python", "Python"],
      ["web", "Développement web"],
      ["front-end", "Front-end", "frontend"],
      ["back-end", "Back-end", "backend"],
      ["mobile-dev", "Développement mobile", "ios,android"],
      ["jeux-dev", "Développement de jeux", "gamedev,unity,godot"],
      ["devops", "DevOps"],
      ["bases-de-donnees", "Bases de données", "sql,postgres"],
      ["api", "API"],
      ["rust", "Rust"],
      ["go", "Go"],
      ["java", "Java"],
      ["php", "PHP"],
      ["typescript", "TypeScript", "ts"],
      ["cloud", "Cloud", "aws,azure"],
      ["tests", "Tests automatisés", "tests"],
      ["architecture", "Architecture logicielle"],
      ["open-source-dev", "Contribution open source"],
      ["freelance-dev", "Freelance tech"],
      ["algorithmes", "Algorithmes", "algo"],
      ["securite-dev", "Sécurité applicative"]
    ]],

    ["sciences", "techno", "🔬", "Sciences", "#7c3aed", 0, "science,sciences,savoir scientifique", [
      ["astronomie", "Astronomie", "astro,étoiles,télescope"],
      ["astrophysique", "Astrophysique"],
      ["physique", "Physique"],
      ["chimie", "Chimie"],
      ["biologie", "Biologie", "bio"],
      ["geologie", "Géologie", "minéraux"],
      ["mathematiques", "Mathématiques", "maths"],
      ["neurosciences", "Neurosciences", "cerveau"],
      ["medecine", "Médecine"],
      ["genetique", "Génétique"],
      ["ecologie-science", "Écologie scientifique"],
      ["meteorologie", "Météorologie", "météo"],
      ["paleontologie", "Paléontologie", "dinosaures,fossiles"],
      ["vulgarisation", "Vulgarisation"],
      ["espace", "Espace", "spatial,fusée,nasa"],
      ["oceanographie", "Océanographie"],
      ["botanique", "Botanique"],
      ["microscopie", "Microscopie"],
      ["statistiques", "Statistiques", "stats"],
      ["philosophie-sciences", "Philosophie des sciences"]
    ]],

    // ═══ CUISINE ET ART DE VIVRE ════════════════════════════════════════════
    ["cuisine", "maison", "🍳", "Cuisine", "#7c3aed", 1, "cuisine,cuisiner,recette,food,manger", [
      ["patisserie", "Pâtisserie", "pâtisser,gâteau"],
      ["boulangerie", "Boulangerie", "pain"],
      ["viennoiserie", "Viennoiserie", "croissant"],
      ["chocolat", "Chocolat", "chocolaterie"],
      ["cuisine-italienne", "Cuisine italienne", "pasta,pizza"],
      ["cuisine-asiatique", "Cuisine asiatique", "asiatique,wok"],
      ["cuisine-japonaise", "Cuisine japonaise", "sushi,ramen"],
      ["cuisine-francaise", "Cuisine française", "terroir"],
      ["cuisine-indienne", "Cuisine indienne", "curry"],
      ["cuisine-orientale", "Cuisine orientale", "couscous,tajine"],
      ["street-food", "Street food"],
      ["barbecue", "Barbecue", "bbq,plancha,grillade"],
      ["vegetarien", "Végétarien", "végé"],
      ["vegan", "Vegan", "végétalien"],
      ["sans-gluten", "Sans gluten"],
      ["meal-prep", "Batch cooking", "meal prep"],
      ["fermentation", "Fermentation", "kombucha,kimchi"],
      ["conserves", "Conserves et bocaux"],
      ["pain-au-levain", "Pain au levain", "levain"],
      ["glaces", "Glaces et sorbets"],
      ["cocktails", "Cocktails", "mixologie"],
      ["cafe", "Café", "coffee,espresso"],
      ["the", "Thé", "thé,infusion"],
      ["epices", "Épices"],
      ["poissons", "Poissons et fruits de mer"],
      ["viandes", "Viandes"],
      ["desserts", "Desserts"],
      ["brunch", "Brunch"]
    ]],

    ["oenologie", "maison", "🍷", "Vin et spiritueux", "#6d28d9", 0, "vin,oenologie,œnologie,dégustation", [
      ["degustation", "Dégustation"],
      ["vins-rouges", "Vins rouges"],
      ["vins-blancs", "Vins blancs"],
      ["champagne", "Champagne et bulles"],
      ["biere-artisanale", "Bière artisanale", "craft,bière"],
      ["brassage", "Brassage amateur", "brasser"],
      ["whisky", "Whisky"],
      ["rhum", "Rhum"],
      ["cocktails-spiritueux", "Cocktails et spiritueux"],
      ["accords-mets-vins", "Accords mets et vins"],
      ["viticulture", "Viticulture", "vigne,vendanges"],
      ["cave", "Cave et conservation"],
      ["sommellerie", "Sommellerie", "sommelier"],
      ["spiritueux-francais", "Spiritueux français", "cognac,armagnac"]
    ]],

    ["bricolage", "maison", "🔧", "Bricolage, déco et maison", "#8b5cf6", 0, "bricolage,bricoler,diy,travaux,déco", [
      ["renovation", "Rénovation", "rénover,travaux"],
      ["peinture-murale", "Peinture murale"],
      ["plomberie", "Plomberie"],
      ["electricite", "Électricité"],
      ["carrelage", "Carrelage"],
      ["parquet", "Parquet et sols"],
      ["isolation", "Isolation"],
      ["meubles-diy", "Meubles faits maison", "diy meuble"],
      ["decoration", "Décoration", "déco"],
      ["home-staging", "Home staging"],
      ["amenagement", "Aménagement"],
      ["rangement", "Rangement et organisation"],
      ["jardin-terrasse", "Terrasse et extérieur"],
      ["outillage", "Outillage", "outils"],
      ["recuperation", "Récup et upcycling"],
      ["palettes", "Palettes"],
      ["luminaires", "Luminaires"],
      ["papier-peint", "Papier peint"],
      ["salle-de-bain", "Salle de bain"],
      ["cuisine-amenagement", "Cuisine aménagée"],
      ["tiny-house", "Tiny house"],
      ["autoconstruction", "Auto-construction"]
    ]],

    // ═══ NATURE ET ANIMAUX ══════════════════════════════════════════════════
    ["jardinage", "vivant", "🌱", "Jardinage", "#8b5cf6", 1, "jardin,jardiner,plantes,potager", [
      ["potager", "Potager", "légumes"],
      ["permaculture", "Permaculture"],
      ["plantes-interieur", "Plantes d'intérieur", "plantes vertes"],
      ["succulentes", "Succulentes et cactus", "cactus"],
      ["bonsai", "Bonsaï"],
      ["verger", "Verger et fruitiers"],
      ["compost", "Compost", "composter"],
      ["semis", "Semis et bouturage", "bouture"],
      ["jardin-japonais", "Jardin japonais"],
      ["aromatiques", "Plantes aromatiques", "herbes"],
      ["orchidees", "Orchidées"],
      ["hydroponie", "Hydroponie"],
      ["rosiers", "Rosiers", "roses"],
      ["arbustes", "Arbres et arbustes"],
      ["gazon", "Pelouse et gazon"],
      ["jardin-sec", "Jardin sec"],
      ["balcon", "Balcon et petits espaces"],
      ["serre", "Serre"],
      ["greffage", "Greffage et taille"],
      ["ecologie-jardin", "Jardin écologique", "biodiversité"]
    ]],

    ["animaux", "vivant", "🐾", "Animaux", "#a78bfa", 1, "animaux,animal,pets,compagnon", [
      ["chiens", "Chiens", "chien,toutou"],
      ["chats", "Chats", "chat"],
      ["education-canine", "Éducation canine", "dressage"],
      ["chevaux", "Chevaux", "cheval"],
      ["aquariophilie", "Aquariophilie", "aquarium,poissons"],
      ["terrariophilie", "Terrariophilie", "reptiles,terrarium"],
      ["oiseaux", "Oiseaux"],
      ["rongeurs", "Rongeurs", "lapin,hamster"],
      ["apiculture", "Apiculture", "abeilles,ruche"],
      ["poules", "Poules"],
      ["refuge", "Refuges et adoption", "adoption"],
      ["comportement-animal", "Comportement animal", "éthologie"],
      ["toilettage", "Toilettage"],
      ["agility", "Agility"],
      ["protection-animale", "Protection animale"],
      ["faune-sauvage", "Faune sauvage"],
      ["ornithologie", "Ornithologie", "observation des oiseaux"],
      ["elevage", "Élevage"],
      ["veterinaire", "Santé animale", "véto"],
      ["nac", "NAC", "nouveaux animaux de compagnie"]
    ]],

    ["peche", "vivant", "🎣", "Pêche", "#64748b", 0, "pêche,peche,pêcher,pecheur", [
      ["peche-en-mer", "Pêche en mer"],
      ["peche-en-riviere", "Pêche en rivière"],
      ["carpe", "Carpe"],
      ["truite", "Truite"],
      ["silure", "Silure"],
      ["brochet", "Brochet et carnassiers", "carnassier"],
      ["mouche", "Pêche à la mouche", "mouche"],
      ["leurre", "Pêche aux leurres", "leurre"],
      ["surfcasting", "Surfcasting"],
      ["peche-a-pied", "Pêche à pied"],
      ["peche-sportive", "Pêche sportive"],
      ["montage", "Montages et bas de ligne"],
      ["materiel-peche", "Matériel", "cannes,moulinet"],
      ["no-kill", "No-kill"]
    ]],

    // ═══ CULTURE ET SAVOIRS ═════════════════════════════════════════════════
    ["litterature", "culture", "📚", "Littérature", "#8b5cf6", 1, "livre,livres,lecture,lire,bouquin,écriture", [
      ["romans", "Romans"],
      ["polar", "Polar et thriller", "policier"],
      ["science-fiction", "Science-fiction", "sf"],
      ["fantasy", "Fantasy", "fantastique"],
      ["poesie", "Poésie"],
      ["essais", "Essais"],
      ["biographie", "Biographies"],
      ["bd-litterature", "Bande dessinée"],
      ["manga", "Manga"],
      ["classiques", "Classiques"],
      ["club-lecture", "Club de lecture"],
      ["ecriture", "Écriture", "écrire,écrivain"],
      ["ecriture-creative", "Écriture créative"],
      ["nouvelle", "Nouvelles"],
      ["roman-en-cours", "Mon roman en cours"],
      ["edition", "Édition"],
      ["auto-edition", "Auto-édition"],
      ["librairie", "Librairies"],
      ["bibliotheque", "Bibliothèques"],
      ["litterature-jeunesse", "Littérature jeunesse"],
      ["theatre-texte", "Textes de théâtre"],
      ["philosophie", "Philosophie", "philo"]
    ]],

    ["cinema", "culture", "🎬", "Cinéma", "#7c3aed", 1, "cinéma,cinema,film,films,séries", [
      ["series", "Séries", "série,serie"],
      ["films-cultes", "Films cultes"],
      ["cinema-francais", "Cinéma français"],
      ["cinema-asiatique", "Cinéma asiatique"],
      ["documentaires", "Documentaires", "docu"],
      ["animation", "Animation"],
      ["horreur", "Horreur", "épouvante"],
      ["thriller", "Thriller"],
      ["comedie-film", "Comédie"],
      ["sf-film", "Science-fiction"],
      ["festival", "Festivals"],
      ["critique", "Critique de films"],
      ["realisation", "Réalisation"],
      ["courts-metrages", "Courts-métrages"],
      ["streaming-series", "Plateformes et streaming", "netflix"],
      ["super-heros", "Super-héros", "marvel,dc"],
      ["studio-ghibli", "Studio Ghibli", "ghibli"],
      ["western", "Western"],
      ["film-noir", "Film noir"],
      ["cinema-independant", "Cinéma indépendant"]
    ]],

    ["podcast", "culture", "🎙", "Podcast", "#7c3aed", 0, "podcast,podcasts,radio,audio", [
      ["true-crime", "True crime", "faits divers"],
      ["interviews", "Interviews"],
      ["culture-podcast", "Culture"],
      ["actualite-podcast", "Actualité"],
      ["humour-podcast", "Humour"],
      ["histoire-podcast", "Histoire"],
      ["science-podcast", "Science"],
      ["business-podcast", "Business"],
      ["fiction-audio", "Fiction audio"],
      ["radio", "Radio"],
      ["creation-podcast", "Créer son podcast"],
      ["montage-audio", "Montage audio"],
      ["micro", "Micro et matériel"],
      ["diffusion", "Diffusion et audience"]
    ]],

    ["actu", "culture", "🌍", "Actualité", "#7c3aed", 0, "actu,actualité,news,info,société", [
      ["politique", "Politique"],
      ["geopolitique", "Géopolitique"],
      ["economie", "Économie"],
      ["societe", "Société"],
      ["medias", "Médias"],
      ["journalisme", "Journalisme"],
      ["environnement-actu", "Environnement"],
      ["europe-actu", "Europe"],
      ["international", "International"],
      ["local", "Actualité locale"],
      ["debat", "Débats"],
      ["decryptage", "Décryptage"],
      ["fact-checking", "Fact-checking", "vérification"],
      ["presse", "Presse écrite"],
      ["opinion", "Tribunes et opinions"],
      ["elections", "Élections"]
    ]],

    ["histoire", "culture", "🏛️", "Histoire et patrimoine", "#6d28d9", 0, "histoire,patrimoine,passé", [
      ["antiquite", "Antiquité", "rome,grèce"],
      ["moyen-age", "Moyen Âge", "médiéval"],
      ["renaissance", "Renaissance"],
      ["revolution", "Révolution française"],
      ["premiere-guerre", "Première Guerre mondiale", "14-18"],
      ["seconde-guerre", "Seconde Guerre mondiale", "39-45"],
      ["histoire-locale", "Histoire locale"],
      ["genealogie", "Généalogie", "arbre généalogique"],
      ["archeologie", "Archéologie"],
      ["patrimoine", "Patrimoine"],
      ["chateaux", "Châteaux"],
      ["musees", "Musées"],
      ["histoire-de-l-art", "Histoire de l'art"],
      ["histoire-militaire", "Histoire militaire"],
      ["egyptologie", "Égyptologie", "égypte"],
      ["prehistoire", "Préhistoire"],
      ["histoire-contemporaine", "Histoire contemporaine"],
      ["reconstitution", "Reconstitution historique"]
    ]],

    ["jeux", "culture", "🎲", "Jeux de société", "#8b5cf6", 0, "jeux,jeu de société,plateau,société", [
      ["jeux-de-plateau", "Jeux de plateau", "board game"],
      ["jeux-de-cartes", "Jeux de cartes"],
      ["jeux-de-role", "Jeux de rôle", "jdr,donjons et dragons"],
      ["echecs", "Échecs", "echecs,chess"],
      ["dames", "Dames"],
      ["go", "Go"],
      ["poker", "Poker"],
      ["tarot", "Tarot"],
      ["belote", "Belote"],
      ["escape-game", "Escape game"],
      ["enigmes", "Énigmes"],
      ["jeux-cooperatifs", "Jeux coopératifs", "coop"],
      ["wargames", "Wargames"],
      ["figurines", "Figurines et peinture", "warhammer"],
      ["puzzles", "Puzzles"],
      ["quiz", "Quiz et culture générale", "blind test"],
      ["jeux-de-des", "Jeux de dés"],
      ["murder-party", "Murder party"]
    ]],

    // ═══ BIEN-ÊTRE ET SANTÉ ═════════════════════════════════════════════════
    ["yoga", "bienetre", "🧘", "Yoga / Bien-être", "#8b5cf6", 1, "yoga,bien-être,bien etre,zen,méditation", [
      ["hatha", "Hatha yoga"],
      ["vinyasa", "Vinyasa"],
      ["ashtanga", "Ashtanga"],
      ["yin", "Yin yoga"],
      ["yoga-nidra", "Yoga nidra"],
      ["meditation", "Méditation", "méditer"],
      ["pleine-conscience", "Pleine conscience", "mindfulness"],
      ["respiration", "Respiration", "cohérence cardiaque"],
      ["pilates", "Pilates"],
      ["sophrologie", "Sophrologie"],
      ["relaxation", "Relaxation"],
      ["massage", "Massage"],
      ["spa", "Spa et thermalisme"],
      ["aromatherapie", "Aromathérapie", "huiles essentielles"],
      ["sommeil", "Sommeil"],
      ["gestion-stress", "Gestion du stress"],
      ["qi-gong", "Qi gong"],
      ["tai-chi", "Tai-chi"],
      ["etirements", "Étirements"],
      ["retraite", "Retraites et stages"]
    ]],

    ["sante", "bienetre", "🥗", "Santé et nutrition", "#7c3aed", 0, "santé,sante,nutrition,forme", [
      ["nutrition", "Nutrition"],
      ["alimentation-equilibree", "Alimentation équilibrée"],
      ["jeune-intermittent", "Jeûne intermittent", "jeûne"],
      ["sport-sante", "Sport santé"],
      ["prevention", "Prévention"],
      ["sante-mentale", "Santé mentale"],
      ["therapie", "Thérapies", "psy"],
      ["addictions", "Addictions et sevrage", "arrêter de fumer"],
      ["sommeil-sante", "Sommeil et récupération"],
      ["hydratation", "Hydratation"],
      ["complements", "Compléments alimentaires"],
      ["medecine-douce", "Médecines douces"],
      ["phytotherapie", "Phytothérapie", "plantes médicinales"],
      ["dietetique", "Diététique"],
      ["perte-de-poids", "Perte de poids", "maigrir,régime"],
      ["sante-femme", "Santé de la femme"],
      ["premiers-secours", "Premiers secours", "psc1"],
      ["don-du-sang", "Don du sang"]
    ]],

    // ═══ VIE SOCIALE ET PROJETS ═════════════════════════════════════════════
    ["entrepreneuriat", "social", "🚀", "Entrepreneuriat", "#7c3aed", 0, "entrepreneur,business,boîte,startup,projet", [
      ["creation-entreprise", "Création d'entreprise"],
      ["freelance", "Freelance", "indépendant"],
      ["startup", "Startup"],
      ["e-commerce", "E-commerce", "boutique en ligne"],
      ["marketing", "Marketing"],
      ["reseaux-sociaux", "Réseaux sociaux", "social media"],
      ["personal-branding", "Personal branding"],
      ["vente", "Vente"],
      ["levee-de-fonds", "Levée de fonds"],
      ["gestion", "Gestion et compta", "comptabilité"],
      ["no-code", "No-code"],
      ["side-project", "Side project"],
      ["productivite", "Productivité"],
      ["negociation", "Négociation"],
      ["strategie", "Stratégie"],
      ["artisanat-business", "Vivre de son artisanat"],
      ["association", "Association", "asso"],
      ["franchise", "Franchise"]
    ]],

    ["finance", "social", "💰", "Finance et investissement", "#6d28d9", 0, "finance,argent,investir,épargne,bourse", [
      ["bourse", "Bourse", "actions"],
      ["epargne", "Épargne"],
      ["immobilier", "Immobilier"],
      ["budget", "Budget"],
      ["retraite-finance", "Retraite"],
      ["fiscalite", "Fiscalité", "impôts"],
      ["independance-financiere", "Indépendance financière", "fire"],
      ["etf", "ETF"],
      ["assurance-vie", "Assurance-vie"],
      ["credit", "Crédit"],
      ["immobilier-locatif", "Immobilier locatif", "locatif"],
      ["education-financiere", "Éducation financière"],
      ["frugalite", "Frugalité", "minimalisme"],
      ["revenus-passifs", "Revenus passifs"],
      ["analyse-financiere", "Analyse financière"],
      ["patrimoine", "Patrimoine"]
    ]],

    ["parentalite", "social", "👶", "Parentalité et famille", "#a78bfa", 0, "parent,parents,famille,enfant,enfants,bébé", [
      ["grossesse", "Grossesse"],
      ["bebe", "Bébé", "nourrisson"],
      ["education", "Éducation"],
      ["adolescence", "Adolescence", "ado"],
      ["activites-enfants", "Activités enfants"],
      ["ecole", "École et scolarité"],
      ["sorties-famille", "Sorties en famille"],
      ["allaitement", "Allaitement"],
      ["sommeil-enfant", "Sommeil de l'enfant"],
      ["jeux-enfants", "Jeux et jouets"],
      ["parent-solo", "Parent solo"],
      ["famille-recomposee", "Famille recomposée"],
      ["garde", "Modes de garde"],
      ["alimentation-enfant", "Alimentation de l'enfant", "diversification"],
      ["developpement-enfant", "Développement de l'enfant"],
      ["lecture-enfant", "Lecture aux enfants"]
    ]]
  ];

  // ── Assemblage ────────────────────────────────────────────────────────────
  function syn(s) {
    if (!s) return [];
    return String(s).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  }

  var universes = UNIVERS.map(function (u, i) {
    return { id: u[0], emoji: u[1], label: u[2], sort_order: i + 1, is_active: true };
  });

  var passions = [];
  var specialties = [];

  SRC.forEach(function (p, i) {
    passions.push({
      id: p[0], universe_id: p[1], emoji: p[2], label: p[3], color: p[4],
      popular: !!p[5], synonyms: syn(p[6]), sort_order: i + 1, is_active: true
    });
    (p[7] || []).forEach(function (s, j) {
      specialties.push({
        id: p[0] + "-" + s[0], passion_id: p[0], label: s[1],
        synonyms: syn(s[2]), sort_order: j + 1, is_active: true
      });
    });
  });

  // ── Index de recherche ────────────────────────────────────────────────────
  // ⚠️ CONSTRUIT UNE SEULE FOIS, au chargement. Une recherche sur ~850 entrées
  // qui normaliserait les accents à CHAQUE frappe repasserait 850 fois par
  // `normalize("NFD")` — mesurable sur un mobile bas de gamme. Ici, chaque
  // entrée porte déjà sa forme comparable ; la frappe n'est normalisée qu'une
  // fois, puis comparée par `indexOf`.
  //
  // `norme()` est aussi exportée : le même pliage doit servir des deux côtés,
  // sinon « moto cross » ne trouverait pas « motocross ».
  function norme(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }

  var INDEX = [];
  passions.forEach(function (p) {
    INDEX.push({
      kind: "passion", id: p.id, passion_id: p.id, label: p.label,
      emoji: p.emoji, universe_id: p.universe_id,
      hay: norme(p.label + " " + p.id + " " + p.synonyms.join(" "))
    });
  });
  specialties.forEach(function (s) {
    var p = null;
    for (var i = 0; i < passions.length; i++) if (passions[i].id === s.passion_id) { p = passions[i]; break; }
    INDEX.push({
      kind: "specialty", id: s.id, passion_id: s.passion_id, label: s.label,
      emoji: (p && p.emoji) || "✨", universe_id: (p && p.universe_id) || "",
      passionLabel: (p && p.label) || "",
      hay: norme(s.label + " " + s.id + " " + s.synonyms.join(" "))
    });
  });

  // Recherche unique : passions, spécialités, synonymes, accents et variantes.
  // Les passions remontent avant les spécialités à pertinence égale, et un
  // début de mot avant une occurrence en milieu de chaîne.
  function chercher(q, limite) {
    var n = norme(q);
    if (!n) return [];
    var max = limite || 40;
    var out = [];
    for (var i = 0; i < INDEX.length && out.length < max * 4; i++) {
      var e = INDEX[i];
      var pos = e.hay.indexOf(n);
      if (pos < 0) continue;
      // ⚠️ LE NIVEAU PRIME SUR LA POSITION. Une passion qui correspond passe
      // TOUJOURS devant une spécialité : sans ça, taper « running » remontait
      // « Running urbain » (occurrence en tête de chaîne) avant la passion
      // « Course à pied » elle-même, et le geste attendu — cocher la passion —
      // se retrouvait en deuxième ligne.
      var place = (pos === 0 ? 0 : (e.hay.charAt(pos - 1) === " " ? 1 : 2));
      out.push({ e: e, s: (e.kind === "passion" ? 0 : 10) + place });
    }
    out.sort(function (a, b) { return a.s - b.s; });
    return out.slice(0, max).map(function (x) { return x.e; });
  }

  var CATALOG = {
    version: 1,
    universes: universes,
    passions: passions,
    specialties: specialties,
    index: INDEX,
    norme: norme,
    chercher: chercher,
    // Les 19 identifiants qui existent en production et ne peuvent pas bouger.
    canoniques: ["musique", "photo", "voyage", "cuisine", "sport", "litterature",
                 "cinema", "tech", "art", "jardinage", "metier", "jeuxvideo",
                 "yoga", "mode", "danse", "podcast", "moto", "animaux", "actu"],
    passionById: function (id) {
      for (var i = 0; i < passions.length; i++) if (passions[i].id === id) return passions[i];
      return null;
    },
    specialtyById: function (id) {
      for (var i = 0; i < specialties.length; i++) if (specialties[i].id === id) return specialties[i];
      return null;
    },
    specialtiesOf: function (passionId) {
      return specialties.filter(function (s) { return s.passion_id === passionId && s.is_active; });
    },
    passionsOf: function (universeId) {
      return passions.filter(function (p) { return p.universe_id === universeId && p.is_active; });
    },
    populaires: function () {
      return passions.filter(function (p) { return p.popular && p.is_active; });
    }
  };

  try { if (typeof window !== "undefined") window.PASSIO_CATALOG = CATALOG; } catch (e) {}
  try { if (typeof module === "object" && module && module.exports) module.exports = CATALOG; } catch (e) {}
})();
