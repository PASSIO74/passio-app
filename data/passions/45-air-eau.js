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
  ["aviation-meteo-vol", "Météo aéronautique", "", "aviation"],
  ["aviation-navigation-aerienne", "Navigation aérienne", "radionavigation", "aviation"],
  ["aviation-aeroclub", "Aéroclub", "club de vol", "aviation"],
  ["aviation-paramoteur", "Paramoteur", "parapente motorisé", "aviation"],
  ["aviation-speed-riding", "Speed riding", "", "aviation"],
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
  ["nautisme-chasse-sous-marine", "Chasse sous-marine", "", "nautisme"],
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
];
