/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — cuisine et art de vivre
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

  // ── Cuisine ────────────────────────────────────────────
  ["cuisine", "Cuisine", "cuisiner,recette,food,manger", "", { emoji: "🍳", color: "#7c3aed", pop: 1, broad: 1 }],
  ["cuisine-patisserie", "Pâtisserie", "pâtisser,gâteau", "cuisine", { pop: 1 }],
  ["cuisine-boulangerie", "Boulangerie", "pain", "cuisine"],
  ["cuisine-viennoiserie", "Viennoiserie", "croissant", "cuisine"],
  ["cuisine-chocolat", "Chocolat", "chocolaterie", "cuisine"],
  ["cuisine-cuisine-italienne", "Cuisine italienne", "pasta", "cuisine"],
  ["cuisine-cuisine-asiatique", "Cuisine asiatique", "asiatique", "cuisine"],
  ["cuisine-cuisine-japonaise", "Cuisine japonaise", "japonaise,izakaya,washoku", "cuisine"],
  ["cuisine-cuisine-francaise", "Cuisine française", "gastronomie française,plats français", "cuisine"],
  ["cuisine-cuisine-indienne", "Cuisine indienne", "curry", "cuisine"],
  ["cuisine-cuisine-orientale", "Cuisine orientale", "couscous,tajine", "cuisine"],
  ["cuisine-street-food", "Street food", "cuisine de rue,food truck", "cuisine"],
  ["cuisine-barbecue", "Barbecue", "bbq,grillade", "cuisine"],
  ["cuisine-vegetarien", "Végétarien", "végé", "cuisine"],
  ["cuisine-vegan", "Vegan", "végétalien", "cuisine"],
  ["cuisine-sans-gluten", "Sans gluten", "sans blé,régime sans gluten", "cuisine"],
  ["cuisine-meal-prep", "Batch cooking", "meal prep", "cuisine"],
  ["cuisine-fermentation", "Fermentation", "kombucha,kimchi", "cuisine"],
  ["cuisine-conserves", "Conserves et bocaux", "mettre en bocaux,stériliser", "cuisine"],
  ["cuisine-pain-au-levain", "Pain au levain", "levain", "cuisine"],
  ["cuisine-glaces", "Glaces et sorbets", "sorbets,crème glacée", "cuisine"],
  ["cuisine-cocktails", "Cocktails", "mixologie", "cuisine"],
  ["cuisine-cafe", "Café", "coffee,espresso", "cuisine"],
  ["cuisine-the", "Thé", "infusion", "cuisine"],
  ["cuisine-epices", "Épices", "épicer,mélanges d'épices", "cuisine"],
  ["cuisine-poissons", "Poissons et fruits de mer", "cuisiner le poisson,produits de la mer", "cuisine"],
  ["cuisine-viandes", "Viandes", "cuisiner la viande,pièces de boucherie", "cuisine"],
  ["cuisine-desserts", "Desserts", "faire un dessert,douceurs sucrées", "cuisine"],
  ["cuisine-brunch", "Brunch", "faire un brunch,repas du dimanche", "cuisine"],

  // ── Vin et spiritueux ────────────────────────────────────────────
  ["oenologie", "Vin et spiritueux", "vin,oenologie,œnologie", "", { emoji: "🍷", color: "#6d28d9", broad: 1 }],
  ["oenologie-degustation", "Dégustation", "déguster,goûter un vin", "oenologie"],
  ["oenologie-vins-rouges", "Vins rouges", "vin rouge,rouges de garde", "oenologie"],
  ["oenologie-vins-blancs", "Vins blancs", "vin blanc,blancs secs", "oenologie"],
  ["oenologie-champagne", "Champagne et bulles", "bulles,crémant", "oenologie"],
  ["oenologie-biere-artisanale", "Bière artisanale", "craft,bière", "oenologie"],
  ["oenologie-brassage", "Brassage amateur", "brasser", "oenologie"],
  ["oenologie-whisky", "Whisky", "single malt,bourbon", "oenologie"],
  ["oenologie-rhum", "Rhum", "rhum arrangé,rhum vieux", "oenologie"],
  ["oenologie-cocktails-spiritueux", "Cocktails et spiritueux", "préparer des cocktails,alcools forts", "oenologie"],
  ["oenologie-accords-mets-vins", "Accords mets et vins", "marier plat et vin,quel vin avec quoi", "oenologie"],
  ["oenologie-viticulture", "Viticulture", "vigne,vendanges", "oenologie"],
  ["oenologie-cave", "Cave et conservation", "cave à vin,garder ses bouteilles", "oenologie"],
  ["oenologie-sommellerie", "Sommellerie", "sommelier", "oenologie"],
  ["oenologie-spiritueux-francais", "Spiritueux français", "cognac", "oenologie"],

  // ── Bricolage, déco et maison ────────────────────────────────────────────
  ["bricolage", "Bricolage, déco et maison", "bricolage,bricoler", "", { emoji: "🔧", color: "#8b5cf6", broad: 1 }],
  ["bricolage-renovation", "Rénovation", "rénover,travaux", "bricolage"],
  ["bricolage-peinture-murale", "Peinture murale", "peindre un mur,rouleau et pinceau", "bricolage"],
  ["bricolage-plomberie", "Plomberie", "plomberie maison,fuite et robinet", "bricolage"],
  ["bricolage-electricite", "Électricité", "électricité domestique,tableau électrique", "bricolage"],
  ["bricolage-carrelage", "Carrelage", "carreler,poser du carrelage", "bricolage"],
  ["bricolage-parquet", "Parquet et sols", "poser un parquet,revêtement de sol", "bricolage"],
  ["bricolage-isolation", "Isolation", "isoler,isolation thermique", "bricolage"],
  ["bricolage-meubles-diy", "Meubles faits maison", "diy meuble", "bricolage"],
  ["bricolage-decoration", "Décoration", "déco", "bricolage"],
  ["bricolage-home-staging", "Home staging", "valoriser un logement,mise en scène immobilière", "bricolage"],
  ["bricolage-amenagement", "Aménagement", "aménager une pièce,agencement intérieur", "bricolage"],
  ["bricolage-rangement", "Rangement et organisation", "ranger,organiser sa maison", "bricolage"],
  ["bricolage-jardin-terrasse", "Terrasse et extérieur", "terrasse,aménagement extérieur", "bricolage"],
  ["bricolage-outillage", "Outillage", "outils", "bricolage"],
  ["bricolage-recuperation", "Récup et upcycling", "récupération,détourner un objet", "bricolage"],
  ["bricolage-palettes", "Palettes", "meubles en palettes,bois de palette", "bricolage"],
  ["bricolage-luminaires", "Luminaires", "lampe,fabriquer une lampe", "bricolage"],
  ["bricolage-papier-peint", "Papier peint", "poser du papier peint,tapisser un mur", "bricolage"],
  ["bricolage-salle-de-bain", "Salle de bain", "refaire sa salle de bain,sanitaires", "bricolage"],
  ["bricolage-cuisine-amenagement", "Cuisine aménagée", "poser une cuisine,agencement de cuisine", "bricolage"],
  ["bricolage-tiny-house", "Tiny house", "mini maison,habitat compact", "bricolage"],
  ["bricolage-autoconstruction", "Auto-construction", "construire sa maison,bâtir soi-même", "bricolage"],

  // ── Cuisines du monde ─────────────────────────────────────────────────
  ["cuisine-coreenne", "Cuisine coréenne", "corée,bibimbap", "cuisine", { pop: 1 }],
  ["cuisine-chinoise", "Cuisine chinoise", "plats chinois,cuisine de chine", "cuisine"],
  ["cuisine-thailandaise", "Cuisine thaïlandaise", "thaï,pad thai", "cuisine"],
  ["cuisine-vietnamienne", "Cuisine vietnamienne", "pho,bo bun", "cuisine"],
  ["cuisine-libanaise", "Cuisine libanaise", "mezzé", "cuisine"],
  ["cuisine-marocaine", "Cuisine marocaine", "cuisine du maroc,pastilla", "cuisine"],
  ["cuisine-grecque", "Cuisine grecque", "cuisine de grèce,mezze grecs", "cuisine"],
  ["cuisine-espagnole", "Cuisine espagnole", "tapas,paella", "cuisine"],
  ["cuisine-portugaise", "Cuisine portugaise", "cuisine du portugal,plats portugais", "cuisine"],
  ["cuisine-mexicaine", "Cuisine mexicaine", "tacos,guacamole", "cuisine"],
  ["cuisine-peruvienne", "Cuisine péruvienne", "ceviche", "cuisine"],
  ["cuisine-africaine", "Cuisine africaine", "mafé,yassa", "cuisine"],
  ["cuisine-creole", "Cuisine créole", "antillaise,réunionnaise", "cuisine"],
  ["cuisine-americaine", "Cuisine américaine", "comfort food", "cuisine"],
  ["cuisine-turque", "Cuisine turque", "cuisine de turquie,plats turcs", "cuisine"],
  ["cuisine-scandinave", "Cuisine scandinave", "nordique", "cuisine"],

  // ── Cuisines de France ────────────────────────────────────────────────
  ["cuisine-sud-ouest", "Cuisine du Sud-Ouest", "cuisine gasconne,plats du sud-ouest", "cuisine"],
  ["cuisine-provencale", "Cuisine provençale", "cuisine du sud,saveurs de provence", "cuisine"],
  ["cuisine-bretonne", "Cuisine bretonne", "galettes", "cuisine"],
  ["cuisine-alsacienne", "Cuisine alsacienne", "choucroute,flammekueche", "cuisine"],
  ["cuisine-lyonnaise", "Cuisine lyonnaise", "bouchon", "cuisine"],
  ["cuisine-savoyarde", "Cuisine savoyarde", "raclette,fondue", "cuisine"],
  ["cuisine-bistrot", "Cuisine de bistrot", "plats de bistrot,cuisine canaille", "cuisine"],
  ["cuisine-gastronomique", "Cuisine gastronomique", "gastronomie,haute cuisine", "cuisine"],
  ["cuisine-terroir", "Produits du terroir", "terroir,producteurs", "cuisine"],

  // ── Techniques et plats ───────────────────────────────────────────────
  ["cuisine-sushi", "Sushi et makis", "makis,faire des sushis", "cuisine"],
  ["cuisine-ramen", "Ramen", "bouillon japonais,nouilles ramen", "cuisine"],
  ["cuisine-pates-fraiches", "Pâtes fraîches", "raviolis maison", "cuisine"],
  ["cuisine-pizza", "Pizza", "pâte à pizza", "cuisine"],
  ["cuisine-burger", "Burgers", "faire des burgers,hamburger maison", "cuisine"],
  ["cuisine-wok", "Wok", "sauté asiatique", "cuisine"],
  ["cuisine-plancha", "Plancha", "cuisson à la plancha,griller à la plancha", "cuisine"],
  ["cuisine-fumoir", "Fumage", "fumoir,viande fumée", "cuisine"],
  ["cuisine-rotisserie", "Rôtisserie", "rôtir,cuisson à la broche", "cuisine"],
  ["cuisine-sauces", "Sauces", "fonds et sauces", "cuisine"],
  ["cuisine-soupes", "Soupes et veloutés", "velouté,faire une soupe", "cuisine"],
  ["cuisine-salades", "Salades", "faire une salade,salades composées", "cuisine"],
  ["cuisine-petit-dejeuner", "Petit-déjeuner", "brunch maison", "cuisine"],
  ["cuisine-gouter", "Goûter", "quatre-heures,collation sucrée", "cuisine"],
  ["cuisine-aperitif", "Apéritif", "apéro,dînatoire", "cuisine"],
  ["cuisine-fromages", "Fromages", "plateau de fromages", "cuisine"],
  ["cuisine-charcuterie", "Charcuterie maison", "terrines,pâtés", "cuisine"],
  ["cuisine-saison", "Cuisine de saison", "produits de saison", "cuisine"],
  ["cuisine-anti-gaspi", "Cuisine anti-gaspi", "anti gaspillage,restes", "cuisine"],
  ["cuisine-rapide", "Cuisine rapide", "recettes express", "cuisine"],
  ["cuisine-petit-budget", "Cuisine petit budget", "manger pas cher", "cuisine"],
  ["cuisine-etudiante", "Cuisine étudiante", "cuisiner pas cher,repas d'étudiant", "cuisine"],
  ["cuisine-enfants-cuisine", "Cuisiner avec les enfants", "cuisine en famille,recettes avec les enfants", "cuisine"],
  ["cuisine-dressage", "Dressage d'assiette", "présentation des plats", "cuisine"],
  ["cuisine-couteaux", "Couteaux et découpe", "aiguisage,technique de coupe", "cuisine"],
  ["cuisine-materiel-cuisine", "Matériel de cuisine", "ustensiles,robot cuiseur", "cuisine"],

  // ── Pâtisserie et boulangerie ─────────────────────────────────────────
  ["cuisine-cake-design", "Cake design", "gâteaux décorés", "cuisine"],
  ["cuisine-macarons", "Macarons", "faire des macarons,coques et ganache", "cuisine"],
  ["cuisine-tartes", "Tartes", "faire une tarte,pâte à tarte", "cuisine"],
  ["cuisine-cookies", "Cookies et biscuits", "biscuits", "cuisine"],
  ["cuisine-crepes", "Crêpes et gaufres", "gaufres", "cuisine"],
  ["cuisine-brioche", "Brioche et pains sucrés", "faire une brioche,pain sucré", "cuisine"],
  ["cuisine-patisserie-orientale", "Pâtisserie orientale", "baklava,cornes de gazelle", "cuisine"],
  ["cuisine-patisserie-japonaise", "Pâtisserie japonaise", "mochi,dorayaki", "cuisine"],
  ["cuisine-bagels", "Bagels et pains du monde", "bagel,pains du monde", "cuisine"],
  ["cuisine-sans-lactose", "Sans lactose", "sans produits laitiers,intolérance au lactose", "cuisine"],
  ["cuisine-confitures", "Confitures et sirops", "faire des confitures,sirop maison", "cuisine"],
  ["cuisine-kombucha", "Kombucha et kéfir", "kéfir,boissons fermentées", "cuisine"],
  ["cuisine-miso", "Miso et kimchi", "ferments asiatiques,pâte de soja fermentée", "cuisine"],
  ["cuisine-yaourts", "Yaourts et fromages maison", "yaourt maison,fromage frais maison", "cuisine"],
  ["cuisine-smoothies", "Smoothies et jus", "jus de fruits", "cuisine"],
  ["cuisine-mocktails", "Boissons sans alcool", "mocktails", "cuisine"],
  ["cuisine-chocolat-chaud", "Boissons chaudes", "chocolat chaud,infusions", "cuisine"],

  // ── Vin et spiritueux (compléments) ───────────────────────────────────
  ["oenologie-nature", "Vins natures", "vin nature,vin bio", "oenologie"],
  ["oenologie-bordeaux", "Bordeaux", "vins de bordeaux,médoc et saint-émilion", "oenologie"],
  ["oenologie-bourgogne", "Bourgogne", "vins de bourgogne,pinot et chardonnay", "oenologie"],
  ["oenologie-rhone", "Vallée du Rhône", "côtes du rhône,syrah du rhône", "oenologie"],
  ["oenologie-loire", "Val de Loire", "vins de loire,sancerre et chinon", "oenologie"],
  ["oenologie-alsace-vin", "Vins d'Alsace", "riesling,gewurztraminer", "oenologie"],
  ["oenologie-languedoc", "Languedoc et Sud", "vins du languedoc,vins du midi", "oenologie"],
  ["oenologie-rose", "Rosés", "vin rosé,rosé de provence", "oenologie"],
  ["oenologie-vins-etrangers", "Vins étrangers", "vins du monde", "oenologie"],
  ["oenologie-gin", "Gin", "gin tonic,distillat de genièvre", "oenologie"],
  ["oenologie-cognac", "Cognac et armagnac", "armagnac", "oenologie"],
  ["oenologie-calvados", "Calvados et eaux-de-vie", "eau de vie", "oenologie"],
  ["oenologie-vodka", "Vodka", "vodka pure,spiritueux de grain", "oenologie"],
  ["oenologie-tequila", "Tequila et mezcal", "mezcal", "oenologie"],
  ["oenologie-sake", "Saké", "alcool de riz,saké japonais", "oenologie"],
  ["oenologie-ipa", "IPA et bières houblonnées", "ipa", "oenologie"],
  ["oenologie-stout", "Stout et bières brunes", "bière brune,porter", "oenologie"],
  ["oenologie-lambic", "Bières acides", "lambic,gueuze", "oenologie"],
  ["oenologie-cidre", "Cidre et poiré", "poiré", "oenologie"],
  ["oenologie-hydromel", "Hydromel", "boisson au miel,chouchen", "oenologie"],
  ["oenologie-aveugle", "Dégustation à l'aveugle", "déguster à l'aveugle,reconnaître un vin", "oenologie"],
  ["oenologie-bar-maison", "Bar à la maison", "home bar", "oenologie"],
  ["oenologie-vignoble-visite", "Visites de domaines", "route des vins", "oenologie"],

  // ── Bricolage, déco et maison (compléments) ───────────────────────────
  ["bricolage-beton-cire", "Béton ciré et enduits", "enduit,tadelakt", "bricolage"],
  ["bricolage-placo", "Placo et cloisons", "plaque de plâtre", "bricolage"],
  ["bricolage-fenetres", "Fenêtres et menuiseries", "changer une fenêtre,double vitrage", "bricolage"],
  ["bricolage-toiture", "Toiture", "couverture,zinguerie", "bricolage"],
  ["bricolage-escaliers", "Escaliers", "construire un escalier,marches et rampe", "bricolage"],
  ["bricolage-poele", "Poêle et cheminée", "chauffage au bois", "bricolage"],
  ["bricolage-chauffage", "Chauffage", "pompe à chaleur,radiateurs", "bricolage"],
  ["bricolage-vmc", "Ventilation", "vmc,aération", "bricolage"],
  ["bricolage-eclairage", "Éclairage", "luminaires diy", "bricolage"],
  ["bricolage-dressing", "Dressing et placards", "placard sur mesure,penderie", "bricolage"],
  ["bricolage-credence", "Crédence et faïence", "faïence de cuisine,poser une crédence", "bricolage"],
  ["bricolage-pergola", "Pergola et abri", "abri de jardin,carport", "bricolage"],
  ["bricolage-cloture", "Clôture et portail", "portail,poser une clôture", "bricolage"],
  ["bricolage-allee", "Allées et terrasses", "dallage", "bricolage"],
  ["bricolage-piscine", "Piscine et spa", "spa,jacuzzi", "bricolage"],
  ["bricolage-garage", "Garage et atelier", "atelier maison,établi", "bricolage"],
  ["bricolage-cave-grenier", "Cave et combles", "aménagement de combles", "bricolage"],
  ["bricolage-isolation-phonique", "Isolation phonique", "acoustique", "bricolage"],
  ["bricolage-renovation-energetique", "Rénovation énergétique", "dpe,performance énergétique", "bricolage"],
  ["bricolage-deco-scandinave", "Styles de décoration", "scandinave,industriel,bohème", "bricolage"],
  ["bricolage-feng-shui", "Harmonie intérieure", "feng shui", "bricolage"],
  ["bricolage-menage", "Entretien de la maison", "ménage,produits ménagers maison", "bricolage"],
  ["bricolage-plantes-deco", "Plantes et déco", "déco végétale", "bricolage"],
  ["bricolage-diy", "DIY et fait maison", "diy,do it yourself", "bricolage"],
];
