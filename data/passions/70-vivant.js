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
  ["jardinage-permaculture", "Permaculture", "culture permanente,design permacole", "jardinage"],
  ["jardinage-plantes-interieur", "Plantes d'intérieur", "plantes vertes", "jardinage"],
  ["jardinage-succulentes", "Succulentes et cactus", "cactus", "jardinage"],
  ["jardinage-bonsai", "Bonsaï", "arbre miniature,art du bonsaï", "jardinage"],
  ["jardinage-verger", "Verger et fruitiers", "arbres fruitiers,planter des fruitiers", "jardinage"],
  ["jardinage-compost", "Compost", "composter", "jardinage"],
  ["jardinage-semis", "Semis et bouturage", "bouture", "jardinage"],
  ["jardinage-jardin-japonais", "Jardin japonais", "jardin zen,jardin sec japonais", "jardinage"],
  ["jardinage-aromatiques", "Plantes aromatiques", "herbes", "jardinage"],
  ["jardinage-orchidees", "Orchidées", "cultiver des orchidées,phalaenopsis", "jardinage"],
  ["jardinage-hydroponie", "Hydroponie", "culture hors-sol,culture sur eau", "jardinage"],
  ["jardinage-rosiers", "Rosiers", "cultiver des roses,taille des rosiers", "jardinage"],
  ["jardinage-arbustes", "Arbres et arbustes", "planter un arbre,arbustes d'ornement", "jardinage"],
  ["jardinage-gazon", "Pelouse et gazon", "entretenir sa pelouse,semer du gazon", "jardinage"],
  ["jardinage-jardin-sec", "Jardin sec", "jardin sans arrosage,plantes résistantes à la sécheresse", "jardinage"],
  ["jardinage-balcon", "Balcon et petits espaces", "jardiner en ville,jardin de balcon", "jardinage"],
  ["jardinage-serre", "Serre", "sous serre,culture en serre", "jardinage"],
  ["jardinage-greffage", "Greffage et taille", "greffer,tailler un arbre", "jardinage"],
  ["jardinage-ecologie-jardin", "Jardin écologique", "jardin naturel,jardiner sans pesticide", "jardinage"],

  // ── Animaux ────────────────────────────────────────────
  ["animaux", "Animaux", "animal,pets,compagnon", "", { emoji: "🐾", color: "#a78bfa", pop: 1, broad: 1 }],
  ["animaux-chiens", "Chiens", "chien,toutou", "animaux", { pop: 1 }],
  ["animaux-chats", "Chats", "chat", "animaux"],
  ["animaux-education-canine", "Éducation canine", "dressage", "animaux"],
  ["animaux-chevaux", "Chevaux", "monde équin,vivre avec un cheval", "animaux"],
  ["animaux-aquariophilie", "Aquariophilie", "aquarium,poissons", "animaux"],
  ["animaux-terrariophilie", "Terrariophilie", "reptiles,terrarium", "animaux"],
  ["animaux-oiseaux", "Oiseaux", "oiseaux de compagnie,volière", "animaux"],
  ["animaux-rongeurs", "Rongeurs", "lapin,hamster", "animaux"],
  ["animaux-apiculture", "Apiculture", "abeilles,ruche", "animaux"],
  ["animaux-poules", "Poules", "poulailler,élever des poules", "animaux"],
  ["animaux-refuge", "Refuges et adoption", "adopter un animal,spa et refuge", "animaux"],
  ["animaux-comportement-animal", "Comportement animal", "éthologie", "animaux"],
  ["animaux-toilettage", "Toilettage", "toiletter,soins du pelage", "animaux"],
  ["animaux-agility", "Agility", "parcours d'agility,sport canin d'obstacles", "animaux"],
  ["animaux-protection-animale", "Protection animale", "cause animale,défense des animaux", "animaux"],
  ["animaux-faune-sauvage", "Faune sauvage", "animaux sauvages,observer la faune", "animaux"],
  ["animaux-ornithologie", "Ornithologie", "observation des oiseaux", "animaux"],
  ["animaux-elevage", "Élevage", "éleveur,élever des animaux", "animaux"],
  ["animaux-veterinaire", "Santé animale", "véto", "animaux"],
  ["animaux-nac", "NAC", "nouveaux animaux de compagnie", "animaux"],

  // ── Pêche ────────────────────────────────────────────
  ["peche", "Pêche", "pêcher,pecheur", "", { emoji: "🎣", color: "#64748b", broad: 1 }],
  ["peche-peche-en-mer", "Pêche en mer", "pêcher en mer,pêche maritime", "peche"],
  ["peche-peche-en-riviere", "Pêche en rivière", "pêcher en rivière,pêche en eau douce", "peche"],
  ["peche-carpe", "Carpe", "pêche de la carpe,carpiste", "peche"],
  ["peche-truite", "Truite", "pêche de la truite,truite de rivière", "peche"],
  ["peche-silure", "Silure", "pêche du silure,gros poisson-chat", "peche"],
  ["peche-brochet", "Brochet et carnassiers", "carnassier", "peche"],
  ["peche-mouche", "Pêche à la mouche", "mouche", "peche"],
  ["peche-leurre", "Pêche aux leurres", "leurre", "peche"],
  ["peche-surfcasting", "Surfcasting", "pêche depuis la plage,lancer en surf", "peche"],
  ["peche-peche-a-pied", "Pêche à pied", "ramassage à marée basse,coquillages à pied", "peche"],
  ["peche-peche-sportive", "Pêche sportive", "pêche de compétition,combat avec le poisson", "peche"],
  ["peche-montage", "Montages et bas de ligne", "monter un bas de ligne,nœuds de pêche", "peche"],
  ["peche-materiel-peche", "Matériel", "cannes,moulinet", "peche"],
  ["peche-no-kill", "No-kill", "remettre à l'eau,pêche sans prélèvement", "peche"],

  // ── Jardinage (compléments) ───────────────────────────────────────────
  ["jardinage-urbain", "Jardinage urbain", "jardin en ville,potager urbain", "jardinage", { pop: 1 }],
  ["jardinage-carres", "Jardin en carrés", "potager en carrés", "jardinage"],
  ["jardinage-pot", "Culture en pot", "jardinage en pot", "jardinage"],
  ["jardinage-lombricompost", "Lombricompost", "vermicompost,lombricomposteur", "jardinage"],
  ["jardinage-paillage", "Paillage", "mulch", "jardinage"],
  ["jardinage-rotation", "Rotation des cultures", "assolement", "jardinage"],
  ["jardinage-associations", "Associations de plantes", "compagnonnage", "jardinage"],
  ["jardinage-graines", "Graines et semences", "semences paysannes,variétés anciennes", "jardinage"],
  ["jardinage-grimpantes", "Plantes grimpantes", "lierre et clématite,plantes qui grimpent", "jardinage"],
  ["jardinage-haies", "Haies et clôtures végétales", "tailler une haie,haie végétale", "jardinage"],
  ["jardinage-topiaire", "Taille ornementale", "topiaire", "jardinage"],
  ["jardinage-mediterraneen", "Jardin méditerranéen", "jardin sec méditerranéen", "jardinage"],
  ["jardinage-anglais", "Jardin anglais", "massif fleuri", "jardinage"],
  ["jardinage-prairie", "Prairie fleurie", "jachère fleurie", "jardinage"],
  ["jardinage-fleurs-coupees", "Fleurs coupées", "bouquets,fleuriste", "jardinage"],
  ["jardinage-bulbes", "Bulbes", "tulipes,narcisses", "jardinage"],
  ["jardinage-vivaces", "Vivaces", "plantes vivaces,massif de vivaces", "jardinage"],
  ["jardinage-fougeres", "Fougères et mousses", "mousses,plantes d'ombre", "jardinage"],
  ["jardinage-carnivores", "Plantes carnivores", "dionée,plantes insectivores", "jardinage"],
  ["jardinage-terrarium", "Terrarium végétal", "terrarium de plantes,mini-serre en bocal", "jardinage"],
  ["jardinage-kokedama", "Kokedama", "boule de mousse,plante suspendue japonaise", "jardinage"],
  ["jardinage-interieur", "Jardinage d'intérieur", "plantes en pot,verdure d'intérieur", "jardinage"],
  ["jardinage-eclairage-horticole", "Éclairage horticole", "lampe de croissance", "jardinage"],
  ["jardinage-arrosage", "Arrosage", "goutte à goutte,arrosage automatique", "jardinage"],
  ["jardinage-champignonniere", "Culture de champignons", "champignonnière,pleurotes", "jardinage"],
  ["jardinage-outils-jardin", "Outils de jardin", "outillage de jardin,bêche et sécateur", "jardinage"],

  // ── Animaux (compléments) ─────────────────────────────────────────────
  ["animaux-chien-berger", "Chiens de berger", "border collie,troupeau", "animaux"],
  ["animaux-education-positive", "Éducation positive", "renforcement positif", "animaux"],
  ["animaux-canicross", "Canicross et cani-VTT", "canicross,cani-rando", "animaux"],
  ["animaux-mantrailing", "Pistage et mantrailing", "recherche olfactive", "animaux"],
  ["animaux-chien-sauvetage", "Chiens de sauvetage", "chien de recherche,équipe cynotechnique", "animaux"],
  ["animaux-chats-race", "Chats de race", "races de chats,chat de pedigree", "animaux"],
  ["animaux-comportement-felin", "Comportement félin", "comprendre son chat,éducation du chat", "animaux"],
  ["animaux-furets", "Furets", "furet,mustélidé de compagnie", "animaux"],
  ["animaux-lapins", "Lapins", "lapin de compagnie,élever un lapin", "animaux"],
  ["animaux-cochons-inde", "Cochons d'Inde", "cobayes", "animaux"],
  ["animaux-amphibiens", "Amphibiens", "grenouilles,tritons", "animaux"],
  ["animaux-arachnides", "Arachnides", "mygales,araignées", "animaux"],
  ["animaux-eau-douce", "Aquarium d'eau douce", "bac d'eau douce,poissons d'eau douce", "animaux"],
  ["animaux-recifal", "Aquarium récifal", "récifal,eau de mer", "animaux"],
  ["animaux-crevettes", "Crevettes d'aquarium", "crevettes naines,bac à crevettes", "animaux"],
  ["animaux-poney-club", "Poney club", "cours de poney,club équestre enfants", "animaux"],
  ["animaux-attelage", "Attelage", "cheval attelé,conduite en attelage", "animaux"],
  ["animaux-dressage-equestre", "Dressage équestre", "dressage à cheval,reprise de dressage", "animaux"],
  ["animaux-saut-obstacles", "Saut d'obstacles", "cso,jumping", "animaux"],
  ["animaux-endurance-equestre", "Endurance équestre", "raid équestre,longue distance à cheval", "animaux"],
  ["animaux-western", "Équitation western", "monte western,reining", "animaux"],
  ["animaux-soins-chevaux", "Soins aux chevaux", "pansage,maréchalerie", "animaux"],
  ["animaux-chevres", "Chèvres et moutons", "moutons", "animaux"],
  ["animaux-anes", "Ânes", "âne,randonnée avec un âne", "animaux"],
  ["animaux-vaches", "Bovins", "vaches", "animaux"],
  ["animaux-alimentation-animale", "Alimentation animale", "barf,ration ménagère", "animaux"],
  ["animaux-photo-animaliere", "Observer les animaux", "affût photo,observation", "animaux"],

  // ── Pêche (compléments) ───────────────────────────────────────────────
  ["peche-au-coup", "Pêche au coup", "pêche à la ligne fixe,canne au coup", "peche"],
  ["peche-feeder", "Feeder", "pêche au feeder,cage d'amorçage", "peche"],
  ["peche-street-fishing", "Street fishing", "pêche urbaine", "peche"],
  ["peche-float-tube", "Float tube", "pêche en float,embarcation de pêche gonflable", "peche"],
  ["peche-traine", "Pêche à la traîne", "traîner un leurre,pêche derrière le bateau", "peche"],
  ["peche-bar", "Pêche du bar", "pêcher le bar,loup de mer", "peche"],
  ["peche-dorade", "Pêche de la dorade", "pêcher la dorade,daurade", "peche"],
  ["peche-kayak-peche", "Pêche en kayak", "pêcher en kayak,kayak de pêche", "peche"],
  ["peche-bouillettes", "Bouillettes et amorces", "amorçage", "peche"],
  ["peche-leurres-fabrication", "Fabrication de leurres", "fabriquer un leurre,leurres faits maison", "peche"],
  ["peche-mouche-montage", "Montage de mouches", "monter une mouche,mouches artificielles", "peche"],
  ["peche-reglementation", "Réglementation et cartes", "carte de pêche", "peche"],
  ["peche-glace", "Pêche sous la glace", "pêche blanche,trou dans la glace", "peche"],

  // ── Chasse et vénerie ─────────────────────────────────────────────────
  ["chasse", "Chasse", "chasseur,gibier,battue", "", { emoji: "🦌", color: "#6d28d9", pop: 0, broad: 1 }],
  ["chasse-permis", "Permis de chasser", "passer le permis de chasse,examen de chasse", "chasse"],
  ["chasse-battue", "Chasse en battue", "grand gibier", "chasse"],
  ["chasse-approche", "Chasse à l'approche", "affût", "chasse"],
  ["chasse-petit-gibier", "Petit gibier", "chasse du petit gibier,lièvre et faisan", "chasse"],
  ["chasse-gibier-eau", "Chasse au gibier d'eau", "hutte", "chasse"],
  ["chasse-chien-chasse", "Chiens de chasse", "chien d'arrêt,chien courant", "chasse"],
  ["chasse-arc", "Chasse à l'arc", "chasser à l'arc,arc de chasse", "chasse"],
  ["chasse-gestion", "Gestion cynégétique", "régulation,comptage", "chasse"],
  ["chasse-cuisine-gibier", "Cuisine du gibier", "cuisiner le gibier,recettes de venaison", "chasse"],
  ["chasse-securite-chasse", "Sécurité à la chasse", "sécurité en battue,règles de tir", "chasse"],
];
