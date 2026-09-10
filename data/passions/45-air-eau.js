/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — aviation et nautisme
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

  // ── Aviation ────────────────────────────────────────────
  ["aviation", "Aviation", "avion,avions,aéronautique,voler,pilote", "", { emoji: "✈️", color: "#7c3aed", pop: 0, broad: 1 }],
  ["aviation-pilotage", "Pilotage d'avion", "brevet de pilote,ppl", "aviation"],
  ["aviation-ulm", "ULM", "ultraléger motorisé", "aviation"],
  ["aviation-planeur", "Planeur", "vol à voile,vol a voile", "aviation"],
  ["aviation-parachutisme", "Parachutisme", "saut en parachute,chute libre", "aviation"],
  ["aviation-wingsuit", "Wingsuit", "combinaison ailée", "aviation"],
  ["aviation-montgolfiere", "Montgolfière", "ballon,vol en ballon", "aviation"],
  ["aviation-helicoptere", "Hélicoptère", "hélico", "aviation"],
  ["aviation-aeromodelisme", "Aéromodélisme", "modélisme avion,avion rc", "aviation"],
  ["aviation-drone-course", "Drone de course", "fpv,course de drones", "aviation"],
  ["aviation-simulateur", "Simulateur de vol", "flight simulator,simu de vol", "aviation"],
  ["aviation-spotting", "Spotting aérien", "planespotting,observation d'avions", "aviation"],
  ["aviation-voltige", "Voltige aérienne", "acrobatie aérienne", "aviation"],
  ["aviation-maintenance", "Mécanique aéronautique", "maintenance avion", "aviation"],
  ["aviation-histoire-air", "Histoire de l'aviation", "avions anciens,warbirds", "aviation"],
  ["aviation-meteo-vol", "Météo aéronautique", "météo du pilote,conditions de vol", "aviation"],
  ["aviation-navigation-aerienne", "Navigation aérienne", "radionavigation", "aviation"],
  ["aviation-aeroclub", "Aéroclub", "club de vol", "aviation"],
  ["aviation-paramoteur", "Paramoteur", "parapente motorisé", "aviation"],
  ["aviation-speed-riding", "Speed riding", "ski parapente,speedriding", "aviation"],
  ["aviation-saut-base", "Base jump", "basejump", "aviation"],

  // ── Nautisme ────────────────────────────────────────────
  ["nautisme", "Nautisme", "bateau,bateaux,mer,navigation,nautique", "", { emoji: "⛵", color: "#7c3aed", pop: 1, broad: 1 }],
  ["nautisme-voile", "Voile", "voilier,faire de la voile", "nautisme"],
  ["nautisme-regate", "Régate", "compétition à la voile", "nautisme"],
  ["nautisme-croisiere-voile", "Croisière à la voile", "navigation côtière", "nautisme"],
  ["nautisme-catamaran", "Catamaran", "cata", "nautisme"],
  ["nautisme-optimist", "Dériveur", "optimist,laser,420", "nautisme"],
  ["nautisme-kayak", "Kayak", "kayak de mer,kayak de rivière", "nautisme"],
  ["nautisme-canoe", "Canoë", "canoë-kayak", "nautisme"],
  ["nautisme-aviron", "Aviron", "rowing", "nautisme"],
  ["nautisme-rafting", "Rafting", "descente en raft", "nautisme"],
  ["nautisme-plongee", "Plongée sous-marine", "scaphandre,niveau 1", "nautisme", { pop: 1 }],
  ["nautisme-apnee", "Apnée", "freediving,plongée en apnée", "nautisme"],
  ["nautisme-chasse-sous-marine", "Chasse sous-marine", "chasse en apnée,fusil sous-marin", "nautisme"],
  ["nautisme-snorkeling", "Randonnée palmée", "snorkeling,palmes masque tuba,pmt", "nautisme"],
  ["nautisme-jet-ski", "Jet-ski", "scooter des mers", "nautisme"],
  ["nautisme-bateau-moteur", "Bateau à moteur", "vedette,semi-rigide", "nautisme"],
  ["nautisme-permis-bateau", "Permis bateau", "permis côtier,permis fluvial", "nautisme"],
  ["nautisme-fluvial", "Navigation fluviale", "péniche,canaux", "nautisme"],
  ["nautisme-matelotage", "Matelotage", "noeuds marins,noeuds de marin", "nautisme"],
  ["nautisme-entretien-bateau", "Entretien de bateau", "carénage,mécanique bateau", "nautisme"],
  ["nautisme-modelisme-naval", "Modélisme naval", "maquettes de bateaux", "nautisme"],
  ["nautisme-peche-embarquee", "Pêche embarquée", "pêche en bateau", "nautisme"],
  ["nautisme-vie-a-bord", "Vie à bord", "liveaboard,habiter sur un bateau", "nautisme"],
  ["nautisme-course-large", "Course au large", "vendée globe,transat", "nautisme"],
  ["nautisme-nage", "Natation", "nager,piscine,nage libre", "nautisme"],
  ["nautisme-eau-libre", "Nage en eau libre", "traversée à la nage", "nautisme"],
  ["nautisme-sauvetage", "Sauvetage aquatique", "nageur sauveteur,bnssa", "nautisme"],
  ["nautisme-natation-synchro", "Natation artistique", "synchro", "nautisme"],
  ["nautisme-plongeon", "Plongeon", "haut vol", "nautisme"],

  // ── Aviation (compléments) ────────────────────────────────────────────
  ["aviation-brevet-pilote", "Formation de pilote", "heures de vol,école de pilotage", "aviation-pilotage"],
  ["aviation-vol-vue", "Vol à vue", "VFR,navigation à vue", "aviation-navigation-aerienne"],
  ["aviation-vol-instruments", "Vol aux instruments", "IFR,pilotage sans visibilité", "aviation-navigation-aerienne"],
  ["aviation-radio-aero", "Phraséologie radio", "communication avec la tour,phraséologie aéronautique", "aviation-navigation-aerienne"],
  ["aviation-aerodromes", "Aérodromes", "terrain d'aviation,piste en herbe", "aviation-aeroclub"],
  ["aviation-avion-ancien", "Avions de collection", "warbird,appareil d’époque", "aviation-histoire-air"],
  ["aviation-meeting-aerien", "Meetings aériens", "démonstration aérienne,show aérien", "aviation-voltige"],
  ["aviation-patrouille", "Vol en patrouille", "formation serrée,vol groupé", "aviation-voltige"],
  ["aviation-vol-montagne", "Vol en montagne", "altisurface,se poser sur glacier", "aviation-pilotage"],
  ["aviation-hydravion", "Hydravion", "amerrissage,avion sur flotteurs", "aviation-pilotage"],
  ["aviation-avion-construction", "Construction amateur d'avion", "avion construit soi-même,kit avion", "aviation-maintenance"],
  ["aviation-planeur-vol-onde", "Vol d'onde et thermiques", "thermique,ascendance", "aviation-planeur"],
  ["aviation-vol-distance", "Vol de distance", "circuit en planeur,vol sur la campagne", "aviation-planeur"],
  ["aviation-parapente-cross", "Cross en parapente", "vol de distance en parapente,marche et vol", "aviation-paramoteur"],
  ["aviation-parachutisme-precision", "Précision d'atterrissage", "poser sur la cible,atterrissage de précision", "aviation-parachutisme"],
  ["aviation-chute-libre", "Chute libre relative", "vol relatif,figures en chute", "aviation-parachutisme"],
  ["aviation-soufflerie", "Soufflerie", "simulateur de chute libre,vol en soufflerie", "aviation-parachutisme"],
  ["aviation-cerf-volant", "Cerf-volant", "kite de plage,vol de cerf-volant", "aviation"],
  ["aviation-planeurs-papier", "Planeurs et modèles légers", "avion en papier,planeur de vol libre", "aviation-aeromodelisme"],
  ["aviation-avion-rc", "Avions radiocommandés", "modèle radiocommandé,vol RC", "aviation-aeromodelisme"],
  ["aviation-fusees", "Fusées amateurs", "modélisme fusée,micro-fusée", "aviation-aeromodelisme"],
  ["aviation-ballon-sonde", "Ballons-sondes", "ballon stratosphérique,sonde atmosphérique", "aviation-montgolfiere"],
  ["aviation-controle-aerien", "Contrôle aérien", "contrôleur aérien,gestion du trafic", "aviation-navigation-aerienne"],
  ["aviation-metiers-aero", "Métiers de l'aéronautique", "mécanicien aéronautique,personnel navigant", "aviation-maintenance"],
  ["aviation-aeroports", "Aéroports", "terminal,exploitation aéroportuaire", "aviation-spotting"],
  ["aviation-compagnies", "Compagnies aériennes", "flotte,livrée d'avion", "aviation-spotting"],
  ["aviation-securite-aerienne", "Sécurité aérienne", "retour d'expérience,facteurs humains en vol", "aviation"],
  ["aviation-espace-aerien", "Espaces aériens", "classes d'espace,zones réglementées", "aviation-navigation-aerienne"],

  // ── Nautisme et natation (compléments) ────────────────────────────────
  ["nautisme-natation-crawl", "Crawl", "technique de crawl,respiration en crawl", "nautisme-nage"],
  ["nautisme-natation-brasse", "Brasse", "nage brasse,coulée en brasse", "nautisme-nage"],
  ["nautisme-natation-dos", "Dos crawlé", "nage sur le dos,virage en dos", "nautisme-nage"],
  ["nautisme-natation-papillon", "Papillon", "nage papillon,ondulation", "nautisme-nage"],
  ["nautisme-natation-technique", "Technique de nage", "éducatifs de natation,glisse dans l'eau", "nautisme-nage"],
  ["nautisme-apprendre-nager", "Apprendre à nager", "cours de natation,perdre la peur de l'eau", "nautisme-nage"],
  ["nautisme-bebe-nageur", "Bébés nageurs", "éveil aquatique,premiers bains en piscine", "nautisme-nage"],
  ["nautisme-aquabike", "Aquabike et aquafitness", "vélo aquatique,fitness en piscine", "nautisme-nage"],
  ["nautisme-triathlon-nage", "Natation de triathlon", "départ en masse,nage en combinaison", "nautisme-eau-libre"],
  ["nautisme-nage-hivernale", "Baignade en eau froide", "bain glacé,nage hivernale", "nautisme-eau-libre"],
  ["nautisme-traversee", "Traversées à la nage", "traverser un lac à la nage,longue distance en eau libre", "nautisme-eau-libre"],
  ["nautisme-plongeon-haut-vol", "Plongeon de haut vol", "plongeon extrême,plongeoir de dix mètres", "nautisme-plongeon"],
  ["nautisme-plongee-epave", "Plongée sur épave", "épave sous-marine,exploration d'épave", "nautisme-plongee"],
  ["nautisme-plongee-grotte", "Plongée souterraine", "plongée en grotte,spéléoplongée", "nautisme-plongee"],
  ["nautisme-plongee-nuit", "Plongée de nuit", "plongée nocturne,lampe de plongée", "nautisme-plongee"],
  ["nautisme-plongee-niveaux", "Niveaux et brevets de plongée", "brevet de plongeur,formation de plongée", "nautisme-plongee"],
  ["nautisme-biologie-marine", "Biologie sous-marine", "reconnaître la faune marine,observation sous l'eau", "nautisme-plongee"],
  ["nautisme-photo-sous-marine", "Image subaquatique en plongée", "caisson étanche,photographier sous l’eau", "nautisme-plongee"],
  ["nautisme-apnee-statique", "Apnée statique", "retenir son souffle,statique en apnée", "nautisme-apnee"],
  ["nautisme-apnee-profondeur", "Apnée en profondeur", "poids constant,descendre en apnée", "nautisme-apnee"],
  ["nautisme-voile-legere", "Voile légère", "petit voilier de régate,voile sur dériveur", "nautisme-voile"],
  ["nautisme-habitable", "Voilier habitable", "croisière côtière,bateau habitable", "nautisme-croisiere-voile"],
  ["nautisme-transat", "Transatlantique", "traversée de l'Atlantique,grande traversée océanique", "nautisme-course-large"],
  ["nautisme-solitaire", "Navigation en solitaire", "naviguer seul,course en solitaire", "nautisme-course-large"],
  ["nautisme-meteo-marine", "Météo marine", "bulletin météo marine,grain", "nautisme-permis-bateau"],
  ["nautisme-navigation-astro", "Navigation astronomique", "sextant,point astronomique", "nautisme-matelotage"],
  ["nautisme-cartes-marines", "Cartes marines", "relever un cap,carte SHOM", "nautisme-permis-bateau"],
  ["nautisme-mouillage", "Mouillage et ancrage", "jeter l'ancre,corps-mort", "nautisme-vie-a-bord"],
  ["nautisme-manoeuvres-port", "Manœuvres de port", "accoster,amarrage", "nautisme-vie-a-bord"],
  ["nautisme-voiles-reglage", "Réglage de voiles", "border,régler une grand-voile", "nautisme-voile"],
  ["nautisme-greement", "Gréement", "mât et haubans,gréer un bateau", "nautisme-entretien-bateau"],
  ["nautisme-carenage", "Carène et antifouling", "antifouling,sortie d'eau", "nautisme-entretien-bateau"],
  ["nautisme-moteur-bateau", "Moteur de bateau", "hors-bord,entretien moteur marin", "nautisme-entretien-bateau"],
  ["nautisme-construction-bateau", "Construction de bateau", "bateau en bois,chantier amateur naval", "nautisme-entretien-bateau"],
  ["nautisme-kayak-mer", "Randonnée en kayak de mer", "esquimautage,kayak côtier", "nautisme-kayak"],
  ["nautisme-kayak-eau-vive", "Kayak en eau vive", "rivière sportive,slalom en kayak", "nautisme-kayak"],
  ["nautisme-packraft", "Packraft", "raft gonflable léger,rando-packraft", "nautisme-canoe"],
  ["nautisme-descente-riviere", "Descente de rivière", "descendre une rivière,bivouac au fil de l'eau", "nautisme-canoe"],
  ["nautisme-aviron-mer", "Aviron de mer", "yole,rame en mer", "nautisme-aviron"],
  ["nautisme-aviron-indoor", "Rameur d'aviron", "aviron en salle,machine à ramer", "nautisme-aviron"],
  ["nautisme-securite-mer", "Sécurité en mer", "gilet de sauvetage,homme à la mer", "nautisme-sauvetage"],
  ["nautisme-sauvetage-cotier", "Sauvetage côtier", "surveillance de plage,poste de secours de plage", "nautisme-sauvetage"],
  ["nautisme-nage-avec-palmes", "Nage avec palmes", "palmes,monopalme", "nautisme-nage"],
];
