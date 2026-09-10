/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — voyages et mobilité
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

  // ── Voyage ────────────────────────────────────────────
  ["voyage", "Voyage", "travel,partir,découverte", "", { emoji: "🌍", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["voyage-road-trip", "Road trip", "roadtrip", "voyage", { pop: 1 }],
  ["voyage-backpacking", "Backpacking", "routard", "voyage"],
  ["voyage-city-break", "City break", "week-end en ville", "voyage"],
  ["voyage-randonnee-voyage", "Voyage en randonnée", "trek à l'étranger,voyage à pied", "voyage"],
  ["voyage-voyage-solo", "Voyage en solo", "solo", "voyage"],
  ["voyage-expatriation", "Expatriation", "expat", "voyage"],
  ["voyage-croisiere", "Croisière", "partir en croisière,bateau de croisière", "voyage"],
  ["voyage-train", "Voyage en train", "interrail", "voyage"],
  ["voyage-camping-car", "Camping-car", "vacances en camping-car,motorhome", "voyage"],
  ["voyage-vanlife", "Vanlife", "van,fourgon aménagé", "voyage"],
  ["voyage-tour-du-monde", "Tour du monde", "faire le tour du monde,grand voyage", "voyage"],
  ["voyage-voyage-famille", "Voyage en famille", "partir en famille,vacances avec enfants", "voyage"],
  ["voyage-voyage-budget", "Voyage petit budget", "pas cher", "voyage"],
  ["voyage-plongee-voyage", "Plongée", "scuba", "voyage"],
  ["voyage-culture-locale", "Culture locale", "rencontrer les habitants,coutumes locales", "voyage"],
  ["voyage-gastronomie-voyage", "Gastronomie du monde", "manger en voyage,cuisines du monde", "voyage"],
  ["voyage-photographie-voyage", "Photo de voyage", "photographier en voyage,carnet photo de voyage", "voyage"],
  ["voyage-europe", "Europe", "voyager en europe,destinations européennes", "voyage"],
  ["voyage-asie", "Asie", "voyager en asie,destinations asiatiques", "voyage"],
  ["voyage-amerique-latine", "Amérique latine", "voyager en amérique du sud,destinations latines", "voyage"],
  ["voyage-afrique", "Afrique", "voyager en afrique,destinations africaines", "voyage"],
  ["voyage-france", "France", "voyager en france,découvrir l'hexagone", "voyage"],

  // ── Moto ────────────────────────────────────────────
  ["moto", "Moto", "motard,deux-roues,2 roues", "", { emoji: "🏍", color: "#64748b", pop: 1, broad: 1 }],
  ["moto-route-moto", "Route", "balade route", "moto"],
  ["moto-balade", "Balade", "ride", "moto"],
  ["moto-circuit", "Circuit moto", "rouler sur circuit,journée circuit", "moto"],
  ["moto-motocross", "Motocross", "moto cross,mx", "moto"],
  ["moto-enduro", "Enduro", "tout-terrain", "moto", { pop: 1 }],
  ["moto-trial", "Trial", "trial moto,franchissement en moto", "moto"],
  ["moto-mecanique", "Mécanique", "garage,mécanique moto,mecanique moto,entretien moto", "moto"],
  ["moto-roadster", "Roadster", "moto roadster,moto nue", "moto"],
  ["moto-sportive", "Sportive", "moto sportive,moto de piste", "moto"],
  ["moto-trail-moto", "Moto trail", "trail routier,moto polyvalente", "moto"],
  ["moto-custom", "Custom", "moto custom,chopper", "moto"],
  ["moto-cafe-racer", "Café racer", "caferacer,moto préparée vintage", "moto"],
  ["moto-voyage-moto", "Voyage à moto", "moto voyage", "moto"],
  ["moto-supermotard", "Supermotard", "supermot", "moto"],
  ["moto-permis", "Permis moto", "passer le permis moto,plateau et circulation", "moto"],
  ["moto-equipement", "Équipement", "casque,protections", "moto"],
  ["moto-scooter", "Scooter", "deux-roues urbain,maxi-scooter", "moto"],
  ["moto-restauration-moto", "Restauration de moto", "restaurer une moto,remise en état moto", "moto"],

  // ── Auto et mécanique ────────────────────────────────────────────
  ["auto", "Auto et mécanique", "auto,voiture,bagnole", "", { emoji: "🚗", color: "#7c3aed", broad: 1 }],
  ["auto-mecanique-auto", "Mécanique auto", "mécanique automobile,réparer sa voiture", "auto"],
  ["auto-restauration-auto", "Restauration", "restaurer une voiture,remise en état auto", "auto"],
  ["auto-youngtimer", "Youngtimer", "voiture des années 80,auto néo-rétro", "auto"],
  ["auto-voiture-ancienne", "Voiture ancienne", "collection,ancêtre", "auto"],
  ["auto-tuning", "Tuning", "personnaliser sa voiture,auto tunée", "auto"],
  ["auto-circuit-auto", "Circuit auto", "rouler en circuit auto,trackday", "auto"],
  ["auto-rallye", "Rallye", "rallye automobile,spéciales de rallye", "auto"],
  ["auto-karting", "Karting", "kart", "auto"],
  ["auto-drift", "Drift", "drifter,glisse en voiture", "auto"],
  ["auto-electrique", "Voiture électrique", "ev", "auto"],
  ["auto-quatre-quatre", "4x4 et off-road", "4x4", "auto"],
  ["auto-detailing", "Detailing", "esthétique auto", "auto"],
  ["auto-preparation-auto", "Préparation", "préparer une auto,voiture préparée", "auto"],
  ["auto-sport-auto", "Sport automobile", "compétition auto,course automobile", "auto"],
  ["auto-formule-1", "Formule 1", "f1", "auto"],
  ["auto-road-trip-auto", "Road trip en voiture", "road trip en auto,virée en voiture", "auto"],
  ["auto-entretien-auto", "Entretien", "entretenir sa voiture,révision auto", "auto"],
  ["auto-utilitaire", "Utilitaire et aménagement", "aménager un utilitaire,camionnette", "auto"],

  // ── Voyage — destinations ─────────────────────────────────────────────
  ["voyage-japon", "Japon", "voyage au japon", "voyage"],
  ["voyage-italie", "Italie", "voyager en italie,destination italie", "voyage"],
  ["voyage-espagne", "Espagne", "voyager en espagne,destination espagne", "voyage"],
  ["voyage-portugal", "Portugal", "voyager au portugal,destination portugal", "voyage"],
  ["voyage-grece", "Grèce", "voyager en grèce,îles grecques", "voyage"],
  ["voyage-islande", "Islande", "voyager en islande,destination islande", "voyage"],
  ["voyage-norvege", "Norvège et Scandinavie", "scandinavie,laponie", "voyage"],
  ["voyage-ecosse", "Écosse", "voyager en écosse,highlands", "voyage"],
  ["voyage-irlande", "Irlande", "voyager en irlande,destination irlande", "voyage"],
  ["voyage-croatie", "Croatie et Balkans", "balkans", "voyage"],
  ["voyage-canada", "Canada", "québec", "voyage"],
  ["voyage-etats-unis", "États-Unis", "usa,ouest américain", "voyage"],
  ["voyage-mexique", "Mexique", "voyager au mexique,destination mexique", "voyage"],
  ["voyage-perou", "Pérou", "machu picchu", "voyage"],
  ["voyage-bresil", "Brésil", "voyager au brésil,destination brésil", "voyage"],
  ["voyage-argentine", "Argentine et Patagonie", "patagonie", "voyage"],
  ["voyage-maroc", "Maroc", "voyager au maroc,destination maroc", "voyage"],
  ["voyage-egypte", "Égypte", "voyager en égypte,destination égypte", "voyage"],
  ["voyage-senegal", "Sénégal", "voyager au sénégal,destination sénégal", "voyage"],
  ["voyage-kenya", "Kenya et safari", "safari", "voyage"],
  ["voyage-afrique-du-sud", "Afrique du Sud", "voyager en afrique du sud,safari sud-africain", "voyage"],
  ["voyage-thailande", "Thaïlande", "voyager en thaïlande,destination thaïlande", "voyage"],
  ["voyage-vietnam", "Vietnam", "voyager au vietnam,destination vietnam", "voyage"],
  ["voyage-inde", "Inde", "voyager en inde,destination inde", "voyage"],
  ["voyage-indonesie", "Indonésie", "bali", "voyage"],
  ["voyage-coree", "Corée du Sud", "séoul", "voyage"],
  ["voyage-chine", "Chine", "voyager en chine,destination chine", "voyage"],
  ["voyage-australie", "Australie", "voyager en australie,destination australie", "voyage"],
  ["voyage-nouvelle-zelande", "Nouvelle-Zélande", "voyager en nouvelle-zélande,destination nz", "voyage"],
  ["voyage-turquie", "Turquie", "voyager en turquie,destination turquie", "voyage"],
  ["voyage-corse", "Corse", "voyager en corse,île de beauté", "voyage"],
  ["voyage-outre-mer", "Outre-mer", "antilles,réunion,polynésie", "voyage"],

  // ── Voyage — manières de partir ───────────────────────────────────────
  ["voyage-slow-travel", "Slow travel", "voyage lent", "voyage"],
  ["voyage-responsable", "Voyage responsable", "tourisme durable,écotourisme", "voyage"],
  ["voyage-woofing", "Woofing et volontariat", "wwoofing,helpx", "voyage"],
  ["voyage-nomade", "Nomadisme digital", "digital nomad,travailler en voyageant", "voyage"],
  ["voyage-auberges", "Auberges de jeunesse", "hostel", "voyage"],
  ["voyage-couchsurfing", "Couchsurfing", "hébergement chez l'habitant", "voyage"],
  ["voyage-echange-maison", "Échange de maison", "home exchange", "voyage"],
  ["voyage-stop", "Voyage en stop", "auto-stop,autostop", "voyage"],
  ["voyage-micro-aventure", "Micro-aventure", "aventure près de chez soi", "voyage"],
  ["voyage-week-end", "Week-ends et escapades", "escapade", "voyage"],
  ["voyage-parcs-nationaux", "Parcs nationaux", "réserves naturelles", "voyage"],
  ["voyage-iles", "Îles", "insulaire", "voyage"],
  ["voyage-desert", "Déserts", "sahara,bivouac désert", "voyage"],
  ["voyage-aurores", "Aurores boréales", "aurore polaire", "voyage"],
  ["voyage-langues-voyage", "Voyage linguistique", "partir apprendre une langue,immersion à l'étranger", "voyage"],
  ["voyage-organisation", "Organiser un voyage", "itinéraire,préparation de voyage", "voyage"],
  ["voyage-bons-plans", "Bons plans et vols", "billets d'avion,vols pas chers", "voyage"],
  ["voyage-recits", "Récits de voyage", "carnet de voyage,journal de bord", "voyage"],

  // ── Moto (compléments) ────────────────────────────────────────────────
  ["moto-vintage", "Moto vintage", "moto ancienne", "moto"],
  ["moto-electrique", "Moto électrique", "moto élec,deux-roues électrique", "moto"],
  ["moto-side-car", "Side-car", "sidecar,moto à panier", "moto"],
  ["moto-rassemblements", "Rassemblements moto", "concentration,run", "moto"],
  ["moto-roadbook", "Roadbook et itinéraires", "itinéraire moto", "moto"],
  ["moto-stunt", "Stunt", "wheeling", "moto"],
  ["moto-quotidien", "Moto au quotidien", "trajets domicile-travail", "moto"],
  ["moto-quad", "Quad", "atv", "moto"],
  ["moto-collection-moto", "Moto de collection", "moto d'époque,deux-roues de collection", "moto"],
  ["moto-piste-moto", "Journées circuit", "track day", "moto"],
  ["moto-securite-moto", "Sécurité et conduite", "conduite moto,stage de pilotage", "moto"],

  // ── Auto (compléments) ────────────────────────────────────────────────
  ["auto-simracing", "Simracing", "simulation automobile,sim racing", "auto"],
  ["auto-rallye-raid", "Rallye-raid", "dakar", "auto"],
  ["auto-carrosserie", "Carrosserie", "débosselage", "auto"],
  ["auto-peinture-auto", "Peinture automobile", "peindre une voiture,carrosserie peinte", "auto"],
  ["auto-sellerie-auto", "Sellerie automobile", "refaire les sièges,intérieur cuir auto", "auto"],
  ["auto-audio-embarque", "Audio embarqué", "car audio,sono voiture", "auto"],
  ["auto-diagnostic", "Diagnostic électronique", "valise diag,obd", "auto"],
  ["auto-endurance", "Endurance", "24 heures du mans,le mans", "auto"],
  ["auto-wrc", "Rallye WRC", "championnat du monde des rallyes", "auto"],
  ["auto-collection-auto", "Voiture de collection", "auto de collection,véhicule de collection", "auto"],
  ["auto-vans", "Vans et fourgons aménagés", "fourgon", "auto"],
  ["auto-camions", "Camions et poids lourds", "routier", "auto"],
  ["auto-permis", "Permis et conduite", "conduite,code de la route", "auto"],
  ["auto-ecoconduite", "Éco-conduite", "conduite économique", "auto"],
];
