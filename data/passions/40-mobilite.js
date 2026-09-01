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
  ["voyage-randonnee-voyage", "Voyage en randonnée", "", "voyage"],
  ["voyage-voyage-solo", "Voyage en solo", "solo", "voyage"],
  ["voyage-expatriation", "Expatriation", "expat", "voyage"],
  ["voyage-croisiere", "Croisière", "", "voyage"],
  ["voyage-train", "Voyage en train", "interrail", "voyage"],
  ["voyage-camping-car", "Camping-car", "", "voyage"],
  ["voyage-vanlife", "Vanlife", "van,fourgon aménagé", "voyage"],
  ["voyage-tour-du-monde", "Tour du monde", "", "voyage"],
  ["voyage-voyage-famille", "Voyage en famille", "", "voyage"],
  ["voyage-voyage-budget", "Voyage petit budget", "pas cher", "voyage"],
  ["voyage-plongee-voyage", "Plongée", "scuba", "voyage"],
  ["voyage-culture-locale", "Culture locale", "", "voyage"],
  ["voyage-gastronomie-voyage", "Gastronomie du monde", "", "voyage"],
  ["voyage-photographie-voyage", "Photo de voyage", "", "voyage"],
  ["voyage-europe", "Europe", "", "voyage"],
  ["voyage-asie", "Asie", "", "voyage"],
  ["voyage-amerique-latine", "Amérique latine", "", "voyage"],
  ["voyage-afrique", "Afrique", "", "voyage"],
  ["voyage-france", "France", "", "voyage"],

  // ── Moto ────────────────────────────────────────────
  ["moto", "Moto", "motard,deux-roues,2 roues", "", { emoji: "🏍", color: "#64748b", pop: 1, broad: 1 }],
  ["moto-route-moto", "Route", "balade route", "moto"],
  ["moto-balade", "Balade", "ride", "moto"],
  ["moto-circuit", "Circuit moto", "", "moto"],
  ["moto-motocross", "Motocross", "moto cross,mx", "moto"],
  ["moto-enduro", "Enduro", "tout-terrain", "moto", { pop: 1 }],
  ["moto-trial", "Trial", "", "moto"],
  ["moto-mecanique", "Mécanique", "garage,mécanique moto,mecanique moto,entretien moto", "moto"],
  ["moto-roadster", "Roadster", "", "moto"],
  ["moto-sportive", "Sportive", "", "moto"],
  ["moto-trail-moto", "Moto trail", "", "moto"],
  ["moto-custom", "Custom", "", "moto"],
  ["moto-cafe-racer", "Café racer", "", "moto"],
  ["moto-voyage-moto", "Voyage à moto", "moto voyage", "moto"],
  ["moto-supermotard", "Supermotard", "supermot", "moto"],
  ["moto-permis", "Permis moto", "", "moto"],
  ["moto-equipement", "Équipement", "casque,protections", "moto"],
  ["moto-scooter", "Scooter", "", "moto"],
  ["moto-restauration-moto", "Restauration de moto", "", "moto"],

  // ── Auto et mécanique ────────────────────────────────────────────
  ["auto", "Auto et mécanique", "auto,voiture,bagnole", "", { emoji: "🚗", color: "#7c3aed", broad: 1 }],
  ["auto-mecanique-auto", "Mécanique auto", "", "auto"],
  ["auto-restauration-auto", "Restauration", "", "auto"],
  ["auto-youngtimer", "Youngtimer", "", "auto"],
  ["auto-voiture-ancienne", "Voiture ancienne", "collection,ancêtre", "auto"],
  ["auto-tuning", "Tuning", "", "auto"],
  ["auto-circuit-auto", "Circuit auto", "", "auto"],
  ["auto-rallye", "Rallye", "", "auto"],
  ["auto-karting", "Karting", "kart", "auto"],
  ["auto-drift", "Drift", "", "auto"],
  ["auto-electrique", "Voiture électrique", "ev", "auto"],
  ["auto-quatre-quatre", "4x4 et off-road", "4x4", "auto"],
  ["auto-detailing", "Detailing", "esthétique auto", "auto"],
  ["auto-preparation-auto", "Préparation", "", "auto"],
  ["auto-sport-auto", "Sport automobile", "", "auto"],
  ["auto-formule-1", "Formule 1", "f1", "auto"],
  ["auto-road-trip-auto", "Road trip en voiture", "", "auto"],
  ["auto-entretien-auto", "Entretien", "", "auto"],
  ["auto-utilitaire", "Utilitaire et aménagement", "", "auto"],

  // ── Voyage — destinations ─────────────────────────────────────────────
  ["voyage-japon", "Japon", "voyage au japon", "voyage"],
  ["voyage-italie", "Italie", "", "voyage"],
  ["voyage-espagne", "Espagne", "", "voyage"],
  ["voyage-portugal", "Portugal", "", "voyage"],
  ["voyage-grece", "Grèce", "", "voyage"],
  ["voyage-islande", "Islande", "", "voyage"],
  ["voyage-norvege", "Norvège et Scandinavie", "scandinavie,laponie", "voyage"],
  ["voyage-ecosse", "Écosse", "", "voyage"],
  ["voyage-irlande", "Irlande", "", "voyage"],
  ["voyage-croatie", "Croatie et Balkans", "balkans", "voyage"],
  ["voyage-canada", "Canada", "québec", "voyage"],
  ["voyage-etats-unis", "États-Unis", "usa,ouest américain", "voyage"],
  ["voyage-mexique", "Mexique", "", "voyage"],
  ["voyage-perou", "Pérou", "machu picchu", "voyage"],
  ["voyage-bresil", "Brésil", "", "voyage"],
  ["voyage-argentine", "Argentine et Patagonie", "patagonie", "voyage"],
  ["voyage-maroc", "Maroc", "", "voyage"],
  ["voyage-egypte", "Égypte", "", "voyage"],
  ["voyage-senegal", "Sénégal", "", "voyage"],
  ["voyage-kenya", "Kenya et safari", "safari", "voyage"],
  ["voyage-afrique-du-sud", "Afrique du Sud", "", "voyage"],
  ["voyage-thailande", "Thaïlande", "", "voyage"],
  ["voyage-vietnam", "Vietnam", "", "voyage"],
  ["voyage-inde", "Inde", "", "voyage"],
  ["voyage-indonesie", "Indonésie", "bali", "voyage"],
  ["voyage-coree", "Corée du Sud", "séoul", "voyage"],
  ["voyage-chine", "Chine", "", "voyage"],
  ["voyage-australie", "Australie", "", "voyage"],
  ["voyage-nouvelle-zelande", "Nouvelle-Zélande", "", "voyage"],
  ["voyage-turquie", "Turquie", "", "voyage"],
  ["voyage-corse", "Corse", "", "voyage"],
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
  ["voyage-langues-voyage", "Voyage linguistique", "", "voyage"],
  ["voyage-organisation", "Organiser un voyage", "itinéraire,préparation de voyage", "voyage"],
  ["voyage-bons-plans", "Bons plans et vols", "billets d'avion,vols pas chers", "voyage"],
  ["voyage-recits", "Récits de voyage", "carnet de voyage,journal de bord", "voyage"],

  // ── Moto (compléments) ────────────────────────────────────────────────
  ["moto-vintage", "Moto vintage", "moto ancienne", "moto"],
  ["moto-electrique", "Moto électrique", "", "moto"],
  ["moto-side-car", "Side-car", "", "moto"],
  ["moto-rassemblements", "Rassemblements moto", "concentration,run", "moto"],
  ["moto-roadbook", "Roadbook et itinéraires", "itinéraire moto", "moto"],
  ["moto-stunt", "Stunt", "wheeling", "moto"],
  ["moto-quotidien", "Moto au quotidien", "trajets domicile-travail", "moto"],
  ["moto-quad", "Quad", "atv", "moto"],
  ["moto-collection-moto", "Moto de collection", "", "moto"],
  ["moto-piste-moto", "Journées circuit", "track day", "moto"],
  ["moto-securite-moto", "Sécurité et conduite", "conduite moto,stage de pilotage", "moto"],

  // ── Auto (compléments) ────────────────────────────────────────────────
  ["auto-simracing", "Simracing", "simulation automobile,sim racing", "auto"],
  ["auto-rallye-raid", "Rallye-raid", "dakar", "auto"],
  ["auto-carrosserie", "Carrosserie", "débosselage", "auto"],
  ["auto-peinture-auto", "Peinture automobile", "", "auto"],
  ["auto-sellerie-auto", "Sellerie automobile", "", "auto"],
  ["auto-audio-embarque", "Audio embarqué", "car audio,sono voiture", "auto"],
  ["auto-diagnostic", "Diagnostic électronique", "valise diag,obd", "auto"],
  ["auto-endurance", "Endurance", "24 heures du mans,le mans", "auto"],
  ["auto-wrc", "Rallye WRC", "championnat du monde des rallyes", "auto"],
  ["auto-collection-auto", "Voiture de collection", "", "auto"],
  ["auto-vans", "Vans et fourgons aménagés", "fourgon", "auto"],
  ["auto-camions", "Camions et poids lourds", "routier", "auto"],
  ["auto-permis", "Permis et conduite", "conduite,code de la route", "auto"],
  ["auto-ecoconduite", "Éco-conduite", "conduite économique", "auto"],
];
