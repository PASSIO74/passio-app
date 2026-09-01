/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — nature et animaux
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

  // ── Jardinage ────────────────────────────────────────────
  ["jardinage", "Jardinage", "jardin,jardiner,plantes", "", { emoji: "🌱", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["jardinage-potager", "Potager", "légumes", "jardinage"],
  ["jardinage-permaculture", "Permaculture", "", "jardinage"],
  ["jardinage-plantes-interieur", "Plantes d'intérieur", "plantes vertes", "jardinage"],
  ["jardinage-succulentes", "Succulentes et cactus", "cactus", "jardinage"],
  ["jardinage-bonsai", "Bonsaï", "", "jardinage"],
  ["jardinage-verger", "Verger et fruitiers", "", "jardinage"],
  ["jardinage-compost", "Compost", "composter", "jardinage"],
  ["jardinage-semis", "Semis et bouturage", "bouture", "jardinage"],
  ["jardinage-jardin-japonais", "Jardin japonais", "", "jardinage"],
  ["jardinage-aromatiques", "Plantes aromatiques", "herbes", "jardinage"],
  ["jardinage-orchidees", "Orchidées", "", "jardinage"],
  ["jardinage-hydroponie", "Hydroponie", "", "jardinage"],
  ["jardinage-rosiers", "Rosiers", "", "jardinage"],
  ["jardinage-arbustes", "Arbres et arbustes", "", "jardinage"],
  ["jardinage-gazon", "Pelouse et gazon", "", "jardinage"],
  ["jardinage-jardin-sec", "Jardin sec", "", "jardinage"],
  ["jardinage-balcon", "Balcon et petits espaces", "", "jardinage"],
  ["jardinage-serre", "Serre", "", "jardinage"],
  ["jardinage-greffage", "Greffage et taille", "", "jardinage"],
  ["jardinage-ecologie-jardin", "Jardin écologique", "", "jardinage"],

  // ── Animaux ────────────────────────────────────────────
  ["animaux", "Animaux", "animal,pets,compagnon", "", { emoji: "🐾", color: "#a78bfa", pop: 1, broad: 1 }],
  ["animaux-chiens", "Chiens", "chien,toutou", "animaux", { pop: 1 }],
  ["animaux-chats", "Chats", "chat", "animaux"],
  ["animaux-education-canine", "Éducation canine", "dressage", "animaux"],
  ["animaux-chevaux", "Chevaux", "", "animaux"],
  ["animaux-aquariophilie", "Aquariophilie", "aquarium,poissons", "animaux"],
  ["animaux-terrariophilie", "Terrariophilie", "reptiles,terrarium", "animaux"],
  ["animaux-oiseaux", "Oiseaux", "", "animaux"],
  ["animaux-rongeurs", "Rongeurs", "lapin,hamster", "animaux"],
  ["animaux-apiculture", "Apiculture", "abeilles,ruche", "animaux"],
  ["animaux-poules", "Poules", "", "animaux"],
  ["animaux-refuge", "Refuges et adoption", "", "animaux"],
  ["animaux-comportement-animal", "Comportement animal", "éthologie", "animaux"],
  ["animaux-toilettage", "Toilettage", "", "animaux"],
  ["animaux-agility", "Agility", "", "animaux"],
  ["animaux-protection-animale", "Protection animale", "", "animaux"],
  ["animaux-faune-sauvage", "Faune sauvage", "", "animaux"],
  ["animaux-ornithologie", "Ornithologie", "observation des oiseaux", "animaux"],
  ["animaux-elevage", "Élevage", "", "animaux"],
  ["animaux-veterinaire", "Santé animale", "véto", "animaux"],
  ["animaux-nac", "NAC", "nouveaux animaux de compagnie", "animaux"],

  // ── Pêche ────────────────────────────────────────────
  ["peche", "Pêche", "pêcher,pecheur", "", { emoji: "🎣", color: "#64748b", broad: 1 }],
  ["peche-peche-en-mer", "Pêche en mer", "", "peche"],
  ["peche-peche-en-riviere", "Pêche en rivière", "", "peche"],
  ["peche-carpe", "Carpe", "", "peche"],
  ["peche-truite", "Truite", "", "peche"],
  ["peche-silure", "Silure", "", "peche"],
  ["peche-brochet", "Brochet et carnassiers", "carnassier", "peche"],
  ["peche-mouche", "Pêche à la mouche", "mouche", "peche"],
  ["peche-leurre", "Pêche aux leurres", "leurre", "peche"],
  ["peche-surfcasting", "Surfcasting", "", "peche"],
  ["peche-peche-a-pied", "Pêche à pied", "", "peche"],
  ["peche-peche-sportive", "Pêche sportive", "", "peche"],
  ["peche-montage", "Montages et bas de ligne", "", "peche"],
  ["peche-materiel-peche", "Matériel", "cannes,moulinet", "peche"],
  ["peche-no-kill", "No-kill", "", "peche"],

  // ── Jardinage (compléments) ───────────────────────────────────────────
  ["jardinage-urbain", "Jardinage urbain", "jardin en ville,potager urbain", "jardinage", { pop: 1 }],
  ["jardinage-carres", "Jardin en carrés", "potager en carrés", "jardinage"],
  ["jardinage-pot", "Culture en pot", "jardinage en pot", "jardinage"],
  ["jardinage-lombricompost", "Lombricompost", "vermicompost,lombricomposteur", "jardinage"],
  ["jardinage-paillage", "Paillage", "mulch", "jardinage"],
  ["jardinage-rotation", "Rotation des cultures", "assolement", "jardinage"],
  ["jardinage-associations", "Associations de plantes", "compagnonnage", "jardinage"],
  ["jardinage-graines", "Graines et semences", "semences paysannes,variétés anciennes", "jardinage"],
  ["jardinage-grimpantes", "Plantes grimpantes", "", "jardinage"],
  ["jardinage-haies", "Haies et clôtures végétales", "", "jardinage"],
  ["jardinage-topiaire", "Taille ornementale", "topiaire", "jardinage"],
  ["jardinage-mediterraneen", "Jardin méditerranéen", "jardin sec méditerranéen", "jardinage"],
  ["jardinage-anglais", "Jardin anglais", "massif fleuri", "jardinage"],
  ["jardinage-prairie", "Prairie fleurie", "jachère fleurie", "jardinage"],
  ["jardinage-fleurs-coupees", "Fleurs coupées", "bouquets,fleuriste", "jardinage"],
  ["jardinage-bulbes", "Bulbes", "tulipes,narcisses", "jardinage"],
  ["jardinage-vivaces", "Vivaces", "", "jardinage"],
  ["jardinage-fougeres", "Fougères et mousses", "", "jardinage"],
  ["jardinage-carnivores", "Plantes carnivores", "", "jardinage"],
  ["jardinage-terrarium", "Terrarium végétal", "", "jardinage"],
  ["jardinage-kokedama", "Kokedama", "", "jardinage"],
  ["jardinage-interieur", "Jardinage d'intérieur", "", "jardinage"],
  ["jardinage-eclairage-horticole", "Éclairage horticole", "lampe de croissance", "jardinage"],
  ["jardinage-arrosage", "Arrosage", "goutte à goutte,arrosage automatique", "jardinage"],
  ["jardinage-champignonniere", "Culture de champignons", "champignonnière,pleurotes", "jardinage"],
  ["jardinage-outils-jardin", "Outils de jardin", "", "jardinage"],

  // ── Animaux (compléments) ─────────────────────────────────────────────
  ["animaux-chien-berger", "Chiens de berger", "border collie,troupeau", "animaux"],
  ["animaux-education-positive", "Éducation positive", "renforcement positif", "animaux"],
  ["animaux-canicross", "Canicross et cani-VTT", "canicross,cani-rando", "animaux"],
  ["animaux-mantrailing", "Pistage et mantrailing", "recherche olfactive", "animaux"],
  ["animaux-chien-sauvetage", "Chiens de sauvetage", "", "animaux"],
  ["animaux-chats-race", "Chats de race", "", "animaux"],
  ["animaux-comportement-felin", "Comportement félin", "", "animaux"],
  ["animaux-furets", "Furets", "", "animaux"],
  ["animaux-lapins", "Lapins", "", "animaux"],
  ["animaux-cochons-inde", "Cochons d'Inde", "cobayes", "animaux"],
  ["animaux-amphibiens", "Amphibiens", "grenouilles,tritons", "animaux"],
  ["animaux-arachnides", "Arachnides", "mygales,araignées", "animaux"],
  ["animaux-eau-douce", "Aquarium d'eau douce", "", "animaux"],
  ["animaux-recifal", "Aquarium récifal", "récifal,eau de mer", "animaux"],
  ["animaux-crevettes", "Crevettes d'aquarium", "", "animaux"],
  ["animaux-poney-club", "Poney club", "", "animaux"],
  ["animaux-attelage", "Attelage", "", "animaux"],
  ["animaux-dressage-equestre", "Dressage équestre", "", "animaux"],
  ["animaux-saut-obstacles", "Saut d'obstacles", "cso,jumping", "animaux"],
  ["animaux-endurance-equestre", "Endurance équestre", "", "animaux"],
  ["animaux-western", "Équitation western", "", "animaux"],
  ["animaux-soins-chevaux", "Soins aux chevaux", "pansage,maréchalerie", "animaux"],
  ["animaux-chevres", "Chèvres et moutons", "moutons", "animaux"],
  ["animaux-anes", "Ânes", "", "animaux"],
  ["animaux-vaches", "Bovins", "vaches", "animaux"],
  ["animaux-alimentation-animale", "Alimentation animale", "barf,ration ménagère", "animaux"],
  ["animaux-photo-animaliere", "Observer les animaux", "affût photo,observation", "animaux"],

  // ── Pêche (compléments) ───────────────────────────────────────────────
  ["peche-au-coup", "Pêche au coup", "", "peche"],
  ["peche-feeder", "Feeder", "", "peche"],
  ["peche-street-fishing", "Street fishing", "pêche urbaine", "peche"],
  ["peche-float-tube", "Float tube", "", "peche"],
  ["peche-traine", "Pêche à la traîne", "", "peche"],
  ["peche-bar", "Pêche du bar", "", "peche"],
  ["peche-dorade", "Pêche de la dorade", "", "peche"],
  ["peche-kayak-peche", "Pêche en kayak", "", "peche"],
  ["peche-bouillettes", "Bouillettes et amorces", "amorçage", "peche"],
  ["peche-leurres-fabrication", "Fabrication de leurres", "", "peche"],
  ["peche-mouche-montage", "Montage de mouches", "", "peche"],
  ["peche-reglementation", "Réglementation et cartes", "carte de pêche", "peche"],
  ["peche-glace", "Pêche sous la glace", "", "peche"],

  // ── Chasse et vénerie ─────────────────────────────────────────────────
  ["chasse", "Chasse", "chasseur,gibier,battue", "", { emoji: "🦌", color: "#6d28d9", pop: 0, broad: 1 }],
  ["chasse-permis", "Permis de chasser", "", "chasse"],
  ["chasse-battue", "Chasse en battue", "grand gibier", "chasse"],
  ["chasse-approche", "Chasse à l'approche", "affût", "chasse"],
  ["chasse-petit-gibier", "Petit gibier", "", "chasse"],
  ["chasse-gibier-eau", "Chasse au gibier d'eau", "hutte", "chasse"],
  ["chasse-chien-chasse", "Chiens de chasse", "", "chasse"],
  ["chasse-arc", "Chasse à l'arc", "", "chasse"],
  ["chasse-gestion", "Gestion cynégétique", "régulation,comptage", "chasse"],
  ["chasse-cuisine-gibier", "Cuisine du gibier", "", "chasse"],
  ["chasse-securite-chasse", "Sécurité à la chasse", "", "chasse"],
];
