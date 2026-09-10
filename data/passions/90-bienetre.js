/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — bien-être et santé
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

  // ── Yoga / Bien-être ────────────────────────────────────────────
  ["yoga", "Yoga / Bien-être", "yoga,bien-être,bien etre", "", { emoji: "🧘", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["yoga-hatha", "Hatha yoga", "yoga hatha,postures classiques", "yoga"],
  ["yoga-vinyasa", "Vinyasa", "yoga vinyasa,flow enchaîné", "yoga"],
  ["yoga-ashtanga", "Ashtanga", "yoga ashtanga,séries ashtanga", "yoga"],
  ["yoga-yin", "Yin yoga", "yin,postures tenues longtemps", "yoga"],
  ["yoga-yoga-nidra", "Yoga nidra", "nidra,sommeil yogique", "yoga"],
  ["yoga-meditation", "Méditation", "méditer", "yoga"],
  ["yoga-pleine-conscience", "Pleine conscience", "mindfulness", "yoga"],
  ["yoga-respiration", "Respiration", "souffle,exercices respiratoires", "yoga"],
  ["yoga-pilates", "Pilates", "méthode pilates,cours de pilates", "yoga"],
  ["yoga-sophrologie", "Sophrologie", "séance de sophrologie,sophrologue", "yoga"],
  ["yoga-relaxation", "Relaxation", "se détendre,détente profonde", "yoga"],
  ["yoga-massage", "Massage", "se faire masser,massage bien-être", "yoga"],
  ["yoga-spa", "Spa et thermalisme", "thermes,cure thermale", "yoga"],
  ["yoga-aromatherapie", "Aromathérapie", "huiles essentielles", "yoga"],
  ["yoga-sommeil", "Sommeil", "mieux dormir,rituel du coucher", "yoga"],
  ["yoga-gestion-stress", "Gestion du stress", "gérer son stress,apaiser la tension", "yoga"],
  ["yoga-qi-gong", "Qi gong", "qigong,gymnastique énergétique chinoise", "yoga"],
  ["yoga-tai-chi", "Tai-chi", "taichi,tai chi chuan", "yoga"],
  ["yoga-etirements", "Étirements", "s'assouplir,séance d'étirement", "yoga"],
  ["yoga-retraite", "Retraites et stages", "stage de yoga,retraite bien-être", "yoga"],

  // ── Santé et nutrition ────────────────────────────────────────────
  ["sante", "Santé et nutrition", "santé,sante,forme", "", { emoji: "🥗", color: "#7c3aed", broad: 1 }],
  ["sante-nutrition", "Nutrition", "bien se nourrir,équilibre nutritionnel", "sante"],
  ["sante-alimentation-equilibree", "Alimentation équilibrée", "manger équilibré,assiette équilibrée", "sante"],
  ["sante-jeune-intermittent", "Jeûne intermittent", "jeûne", "sante"],
  ["sante-sport-sante", "Sport santé", "activité physique adaptée,bouger pour sa santé", "sante"],
  ["sante-prevention", "Prévention", "prévenir,dépistage", "sante"],
  ["sante-sante-mentale", "Santé mentale", "bien-être psychique,psychisme", "sante"],
  ["sante-therapie", "Thérapies", "psy", "sante"],
  ["sante-addictions", "Addictions et sevrage", "arrêter de fumer", "sante"],
  ["sante-sommeil-sante", "Sommeil et récupération", "qualité du sommeil,récupérer après l'effort", "sante"],
  ["sante-hydratation", "Hydratation", "boire de l'eau,s'hydrater", "sante"],
  ["sante-complements", "Compléments alimentaires", "compléments,vitamines et minéraux", "sante"],
  ["sante-medecine-douce", "Médecines douces", "médecines alternatives,thérapies naturelles", "sante"],
  ["sante-phytotherapie", "Phytothérapie", "soigner par les plantes,remèdes végétaux", "sante"],
  ["sante-dietetique", "Diététique", "diététicien,plan alimentaire", "sante"],
  ["sante-perte-de-poids", "Perte de poids", "maigrir,régime", "sante"],
  ["sante-sante-femme", "Santé de la femme", "gynécologie,santé féminine", "sante"],
  ["sante-premiers-secours", "Premiers secours", "psc1", "sante"],
  ["sante-don-du-sang", "Don du sang", "donner son sang,collecte de sang", "sante"],

  // ── Yoga et bien-être (compléments) ───────────────────────────────────
  ["yoga-aerien", "Yoga aérien", "aeroyoga,yoga sur hamac", "yoga", { pop: 1 }],
  ["yoga-kundalini", "Kundalini", "yoga kundalini,énergie de la colonne", "yoga"],
  ["yoga-chaud", "Yoga chaud", "bikram,hot yoga", "yoga"],
  ["yoga-prenatal", "Yoga prénatal", "yoga enceinte,yoga grossesse", "yoga"],
  ["yoga-enfants", "Yoga pour enfants", "yoga enfant,yoga à l'école", "yoga"],
  ["yoga-doux", "Yoga doux", "yoga restauratif", "yoga"],
  ["yoga-mantras", "Mantras et chants", "chants sacrés,réciter des mantras", "yoga"],
  ["yoga-ayurveda", "Ayurveda", "médecine ayurvédique,doshas", "yoga"],
  ["yoga-reiki", "Reiki", "soin énergétique,imposition des mains", "yoga"],
  ["yoga-shiatsu", "Shiatsu", "massage japonais par pression,points shiatsu", "yoga"],
  ["yoga-reflexologie", "Réflexologie", "réflexologie plantaire,zones réflexes", "yoga"],
  ["yoga-coherence-cardiaque", "Cohérence cardiaque", "respiration guidée", "yoga"],
  ["yoga-hypnose", "Hypnose", "auto-hypnose", "yoga"],
  ["yoga-meditation-guidee", "Méditation guidée", "méditation accompagnée,audio de méditation", "yoga"],
  ["yoga-bols", "Bols chantants", "bols tibétains,sonothérapie", "yoga"],
  ["yoga-bain-de-foret", "Bain de forêt", "sylvothérapie", "yoga"],
  ["yoga-cryotherapie", "Bains froids", "cryothérapie,eau froide,wim hof", "yoga"],
  ["yoga-sauna", "Sauna et hammam", "hammam,banya", "yoga"],
  ["yoga-massage-thai", "Massage thaï", "massage traditionnel thaïlandais,nuad", "yoga"],
  ["yoga-automassage", "Automassage", "rouleau de massage", "yoga"],
  ["yoga-digital-detox", "Déconnexion", "digital detox,détox numérique", "yoga"],

  // ── Santé et nutrition (compléments) ──────────────────────────────────
  ["sante-mediterraneen", "Régime méditerranéen", "régime crétois,alimentation méditerranéenne", "sante"],
  ["sante-microbiote", "Microbiote", "flore intestinale", "sante"],
  ["sante-allergies", "Allergies et intolérances", "intolérances,allergie alimentaire", "sante"],
  ["sante-diabete", "Diabète", "diabétique,glycémie", "sante"],
  ["sante-coeur", "Santé cardiovasculaire", "santé du cœur,cardiologie", "sante"],
  ["sante-dos", "Dos et posture", "mal de dos,posture", "sante"],
  ["sante-kine", "Kinésithérapie", "kiné", "sante"],
  ["sante-osteopathie", "Ostéopathie", "ostéopathe,manipulation ostéopathique", "sante"],
  ["sante-vue", "Vue", "yeux,ophtalmologie", "sante"],
  ["sante-audition", "Audition", "ouïe,protéger ses oreilles", "sante"],
  ["sante-dents", "Santé dentaire", "dents", "sante"],
  ["sante-peau", "Santé de la peau", "dermatologie", "sante"],
  ["sante-menopause", "Ménopause", "périménopause,bouffées de chaleur", "sante"],
  ["sante-fertilite", "Fertilité", "concevoir,parcours de fertilité", "sante"],
  ["sante-vaccination", "Vaccination", "vaccins,se faire vacciner", "sante"],
  ["sante-handicap", "Vivre avec un handicap", "vie avec un handicap,accessibilité au quotidien", "sante"],
  ["sante-douleur", "Douleur chronique", "douleurs persistantes,vivre avec la douleur", "sante"],
  ["sante-burnout", "Burn-out", "épuisement professionnel", "sante"],
  ["sante-anxiete", "Anxiété", "angoisse,crises d'angoisse", "sante"],
  ["sante-depression", "Dépression", "état dépressif,traverser une dépression", "sante"],
  ["sante-tcc", "Thérapies cognitives", "tcc", "sante"],
  ["sante-tabac", "Arrêt du tabac", "sevrage tabagique", "sante"],
  ["sante-alcool", "Rapport à l'alcool", "sobriété", "sante"],
  ["sante-ecrans", "Rapport aux écrans", "temps d'écran,sobriété numérique", "sante"],
  ["sante-neuroatypie", "Neuroatypie", "tdah,autisme,hpi", "sante"],
  ["sante-aidants", "Aidants", "proche aidant", "sante"],
];
