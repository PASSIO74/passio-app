/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — nature, engagement et intériorité
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

  // ── Nature et environnement ────────────────────────────────────────────
  ["nature", "Nature", "dehors,écologie", "", { emoji: "🌲", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["nature-mycologie", "Champignons", "mycologie,cueillette de champignons,cèpes", "nature"],
  ["nature-herboristerie", "Herboristerie", "plantes médicinales,simples", "nature"],
  ["nature-plantes-sauvages", "Plantes sauvages comestibles", "cueillette sauvage", "nature"],
  ["nature-foret", "Forêt", "sylviculture,futaie", "nature"],
  ["nature-littoral", "Littoral et estran", "bord de mer,plage", "nature"],
  ["nature-montagne", "Montagne", "massif,altitude", "nature"],
  ["nature-riviere", "Rivières et zones humides", "étangs,marais", "nature"],
  ["nature-entomologie", "Insectes", "entomologie,papillons,coléoptères", "nature"],
  ["nature-mineralogie", "Minéralogie", "roches,cristaux,géodes", "nature"],
  ["nature-ciel-nocturne", "Ciel nocturne", "observation du ciel,étoiles filantes", "nature"],
  ["nature-sciences-participatives", "Sciences participatives", "observatoire citoyen", "nature"],
  ["nature-zero-dechet", "Zéro déchet", "réduction des déchets,vrac", "nature"],
  ["nature-sobriete", "Sobriété et low-tech", "décroissance,low tech", "nature"],
  ["nature-climat", "Climat", "changement climatique,réchauffement", "nature"],
  ["nature-biodiversite", "Biodiversité", "espèces,protection de la nature", "nature"],
  ["nature-reforestation", "Reforestation", "planter des arbres", "nature"],
  ["nature-jardins-partages", "Jardins partagés", "jardin collectif", "nature"],
  ["nature-agriculture", "Agriculture", "ferme,paysan,maraîchage", "nature"],
  ["nature-elevage-nature", "Petit élevage", "basse-cour", "nature"],
  ["nature-autonomie", "Autonomie alimentaire", "autosuffisance", "nature"],
  ["nature-energies", "Énergies renouvelables", "solaire,éolien,photovoltaïque", "nature"],
  ["nature-eau", "Gestion de l'eau", "récupération d'eau,pluie", "nature"],
  ["nature-randonnee-nature", "Balades nature", "promenade", "nature"],

  // ── Engagement et bénévolat ────────────────────────────────────────────
  ["engagement", "Engagement et bénévolat", "bénévole,bénévolat,solidarité,militer,s'engager", "", { emoji: "🤲", color: "#7c3aed", pop: 0, broad: 1 }],
  ["engagement-association", "Vie associative", "asso,bénévolat associatif", "engagement"],
  ["engagement-maraude", "Maraudes et aide aux sans-abri", "maraude", "engagement"],
  ["engagement-banque-alimentaire", "Aide alimentaire", "banque alimentaire,collecte", "engagement"],
  ["engagement-ecologie", "Militantisme écologique", "activisme climat", "engagement"],
  ["engagement-nettoyage", "Ramassage de déchets", "clean walk,cleanwalk", "engagement"],
  ["engagement-secourisme", "Secourisme bénévole", "croix-rouge,protection civile,pompier volontaire", "engagement"],
  ["engagement-visite-aines", "Visite aux aînés", "ehpad,lien intergénérationnel", "engagement"],
  ["engagement-alphabetisation", "Alphabétisation", "apprendre à lire aux adultes", "engagement"],
  ["engagement-accueil", "Accueil et intégration", "aide aux réfugiés", "engagement"],
  ["engagement-handicap", "Accompagnement du handicap", "inclusion", "engagement"],
  ["engagement-mediation", "Médiation et écoute", "écoute bénévole", "engagement"],
  ["engagement-quartier", "Vie de quartier", "conseil de quartier,voisinage", "engagement"],
  ["engagement-politique", "Engagement citoyen", "citoyenneté,démocratie locale", "engagement"],
  ["engagement-humanitaire", "Humanitaire", "mission humanitaire,ong", "engagement"],
  ["engagement-jumelage", "Jumelage et échanges", "ville jumelée,échange entre communes", "engagement"],
  ["engagement-scoutisme", "Scoutisme", "scouts,animation jeunesse", "engagement"],
  ["engagement-animation", "Animation et colonies", "bafa,centre de loisirs", "engagement"],

  // ── Spiritualité, philosophie et introspection ─────────────────────────
  ["interiorite", "Spiritualité et philosophie", "spiritualité,sens de la vie,introspection", "", { emoji: "🕊️", color: "#a78bfa", pop: 0, broad: 1 }],
  ["interiorite-philosophie", "Philosophie", "philo,penseurs", "interiorite"],
  ["interiorite-stoicisme", "Stoïcisme", "stoïcien,marc aurèle", "interiorite"],
  ["interiorite-developpement-personnel", "Développement personnel", "dev perso,mieux se connaître", "interiorite"],
  ["interiorite-journaling", "Journal intime", "journaling,écrire chaque jour", "interiorite"],
  ["interiorite-gratitude", "Gratitude", "être reconnaissant,carnet de gratitude", "interiorite"],
  ["interiorite-religions", "Religions et croyances", "foi,religion", "interiorite"],
  ["interiorite-bouddhisme", "Bouddhisme", "zen", "interiorite"],
  ["interiorite-christianisme", "Christianisme", "foi chrétienne,évangiles", "interiorite"],
  ["interiorite-islam", "Islam", "foi musulmane,coran", "interiorite"],
  ["interiorite-judaisme", "Judaïsme", "foi juive,torah", "interiorite"],
  ["interiorite-mythologie", "Mythologie", "mythes,légendes,mythologie grecque", "interiorite"],
  ["interiorite-symboles", "Symboles et tarot", "cartomancie", "interiorite"],
  ["interiorite-astrologie", "Astrologie", "signes astrologiques,thème astral", "interiorite"],
  ["interiorite-esoterisme", "Ésotérisme", "occulte,mystères", "interiorite"],
  ["interiorite-pelerinage", "Pèlerinage", "compostelle,chemin", "interiorite"],
  ["interiorite-ethique", "Éthique", "morale", "interiorite"],
  ["interiorite-silence", "Retraite et silence", "retraite spirituelle,jeûne spirituel", "interiorite"],
  ["interiorite-rituels", "Rituels et traditions", "traditions,rites de passage", "interiorite"],

  // ── Nature (compléments) ──────────────────────────────────────────────
  ["nature-tisanes-nature", "Récolter et sécher les plantes", "séchoir à plantes,séchage des simples", "nature-herboristerie"],
  ["nature-teintures-meres", "Macérats et teintures", "macérat huileux,teinture mère", "nature-herboristerie"],
  ["nature-baumes", "Baumes et onguents", "baume maison,onguent végétal", "nature-herboristerie"],
  ["nature-arbres", "Reconnaître les arbres", "essences d'arbres,identifier un arbre", "nature-foret"],
  ["nature-vieilles-forets", "Forêts anciennes", "forêt primaire,îlot de sénescence", "nature-foret"],
  ["nature-bocage", "Bocage et haies", "haie bocagère,maillage de haies", "nature-biodiversite"],
  ["nature-zones-humides", "Zones humides", "tourbière,milieu humide", "nature-biodiversite"],
  ["nature-prairies", "Prairies naturelles", "fauche tardive,pelouse naturelle", "nature-biodiversite"],
  ["nature-corridors", "Continuités écologiques", "trame verte,corridor écologique", "nature-biodiversite"],
  ["nature-especes-menacees", "Espèces menacées", "liste rouge,protection d'espèce", "nature-biodiversite"],
  ["nature-especes-invasives", "Espèces invasives", "espèce exotique envahissante,renouée du Japon", "nature-biodiversite"],
  ["nature-rewilding", "Renaturation", "réensauvagement,libre évolution", "nature-reforestation"],
  ["nature-dunes", "Dunes et cordons littoraux", "dune,laisse de mer", "nature-littoral"],
  ["nature-marees", "Marées", "coefficient de marée,estran", "nature-littoral"],
  ["nature-falaises", "Falaises et côtes rocheuses", "côte rocheuse,sentier de falaise", "nature-littoral"],
  ["nature-torrents", "Torrents et cascades", "cascade,ruisseau de montagne", "nature-riviere"],
  ["nature-sources", "Sources et résurgences", "source,eau de source", "nature-eau"],
  ["nature-lacs", "Lacs", "lac de montagne,plan d'eau naturel", "nature-eau"],
  ["nature-neige", "Neige et manteau neigeux", "cristaux de neige,couche de neige", "nature-montagne"],
  ["nature-alpages", "Alpages et estives", "estive,pâturage d'altitude", "nature-montagne"],
  ["nature-flore-alpine", "Flore de montagne", "edelweiss,plantes d'altitude", "nature-montagne"],
  ["nature-geologie-paysage", "Lire un paysage", "formation du relief,géologie de terrain", "nature"],
  ["nature-meteo-observation", "Observer le temps qu'il fait", "nuages,prévoir le temps", "nature"],
  ["nature-saisons", "Rythme des saisons", "phénologie,changement de saison", "nature"],
  ["nature-photographie-nature", "Photographier la nature", "affût photo nature,paysage naturel photographié", "nature"],
  ["nature-dessin-naturaliste", "Carnet de naturaliste", "croquis de terrain,herbier dessiné", "nature"],
  ["nature-lichens", "Lichens et mousses", "mousse,bioindicateur", "nature-biodiversite"],
  ["nature-orpaillage", "Orpaillage", "chercher de l'or,batée", "nature-riviere"],
  ["nature-cristaux", "Recherche de cristaux", "cristallier,quartz de montagne", "nature-mineralogie"],
  ["nature-pollution", "Pollutions et santé environnementale", "polluants,qualité de l'air extérieur", "nature-climat"],
  ["nature-plastique", "Pollution plastique", "microplastiques,déchets plastiques", "nature-zero-dechet"],
  ["nature-consommation", "Consommer autrement", "sobriété heureuse,réduire ses achats", "nature-sobriete"],
  ["nature-empreinte-carbone", "Empreinte carbone", "bilan carbone,tonnes de CO2", "nature-climat"],
  ["nature-adaptation", "Adaptation au changement climatique", "s'adapter au climat qui change,résilience territoriale", "nature-climat"],
  ["nature-fresque-climat", "Ateliers de sensibilisation", "fresque du climat,atelier de sensibilisation écologique", "nature-climat"],
  ["nature-hydraulique", "Hydroélectricité", "barrage,petite hydraulique", "nature-energies"],
  ["nature-biomasse", "Biomasse et bois-énergie", "bois-énergie,méthanisation", "nature-energies"],
  ["nature-toilettes-seches-nature", "Toilettes sèches", "compost de toilettes,litière sèche", "nature-autonomie"],
  ["nature-phytoepuration", "Phytoépuration", "épuration par les plantes,filtre planté", "nature-eau"],
  ["nature-autoproduction", "Produire soi-même", "autoproduction alimentaire,vivre en partie de son jardin", "nature-autonomie"],
  ["nature-conserverie", "Conserver sa récolte", "stériliser des bocaux,garde-manger d'hiver", "nature-autonomie"],
  ["nature-paysannerie", "Installation paysanne", "devenir paysan,reprise de ferme", "nature-agriculture"],
  ["nature-agroforesterie", "Agroforesterie", "arbres dans les champs,haies agricoles", "nature-agriculture"],
  ["nature-agriculture-bio", "Agriculture biologique", "certification bio,cahier des charges bio", "nature-agriculture"],
  ["nature-amap", "AMAP et paniers", "panier de légumes,vente directe", "nature-agriculture"],
  ["nature-pastoralisme", "Pastoralisme", "berger,transhumance", "nature-elevage-nature"],
  ["nature-bien-etre-animal-elevage", "Bien-être en élevage", "élevage extensif,conditions d'élevage", "nature-elevage-nature"],
];
