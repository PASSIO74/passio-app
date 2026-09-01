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
  ["yoga-hatha", "Hatha yoga", "", "yoga"],
  ["yoga-vinyasa", "Vinyasa", "", "yoga"],
  ["yoga-ashtanga", "Ashtanga", "", "yoga"],
  ["yoga-yin", "Yin yoga", "", "yoga"],
  ["yoga-yoga-nidra", "Yoga nidra", "", "yoga"],
  ["yoga-meditation", "Méditation", "méditer", "yoga"],
  ["yoga-pleine-conscience", "Pleine conscience", "mindfulness", "yoga"],
  ["yoga-respiration", "Respiration", "", "yoga"],
  ["yoga-pilates", "Pilates", "", "yoga"],
  ["yoga-sophrologie", "Sophrologie", "", "yoga"],
  ["yoga-relaxation", "Relaxation", "", "yoga"],
  ["yoga-massage", "Massage", "", "yoga"],
  ["yoga-spa", "Spa et thermalisme", "", "yoga"],
  ["yoga-aromatherapie", "Aromathérapie", "huiles essentielles", "yoga"],
  ["yoga-sommeil", "Sommeil", "", "yoga"],
  ["yoga-gestion-stress", "Gestion du stress", "", "yoga"],
  ["yoga-qi-gong", "Qi gong", "", "yoga"],
  ["yoga-tai-chi", "Tai-chi", "", "yoga"],
  ["yoga-etirements", "Étirements", "", "yoga"],
  ["yoga-retraite", "Retraites et stages", "", "yoga"],

  // ── Santé et nutrition ────────────────────────────────────────────
  ["sante", "Santé et nutrition", "santé,sante,forme", "", { emoji: "🥗", color: "#7c3aed", broad: 1 }],
  ["sante-nutrition", "Nutrition", "", "sante"],
  ["sante-alimentation-equilibree", "Alimentation équilibrée", "", "sante"],
  ["sante-jeune-intermittent", "Jeûne intermittent", "jeûne", "sante"],
  ["sante-sport-sante", "Sport santé", "", "sante"],
  ["sante-prevention", "Prévention", "", "sante"],
  ["sante-sante-mentale", "Santé mentale", "", "sante"],
  ["sante-therapie", "Thérapies", "psy", "sante"],
  ["sante-addictions", "Addictions et sevrage", "arrêter de fumer", "sante"],
  ["sante-sommeil-sante", "Sommeil et récupération", "", "sante"],
  ["sante-hydratation", "Hydratation", "", "sante"],
  ["sante-complements", "Compléments alimentaires", "", "sante"],
  ["sante-medecine-douce", "Médecines douces", "", "sante"],
  ["sante-phytotherapie", "Phytothérapie", "", "sante"],
  ["sante-dietetique", "Diététique", "", "sante"],
  ["sante-perte-de-poids", "Perte de poids", "maigrir,régime", "sante"],
  ["sante-sante-femme", "Santé de la femme", "", "sante"],
  ["sante-premiers-secours", "Premiers secours", "psc1", "sante"],
  ["sante-don-du-sang", "Don du sang", "", "sante"],

  // ── Yoga et bien-être (compléments) ───────────────────────────────────
  ["yoga-aerien", "Yoga aérien", "aeroyoga,yoga sur hamac", "yoga", { pop: 1 }],
  ["yoga-kundalini", "Kundalini", "", "yoga"],
  ["yoga-chaud", "Yoga chaud", "bikram,hot yoga", "yoga"],
  ["yoga-prenatal", "Yoga prénatal", "", "yoga"],
  ["yoga-enfants", "Yoga pour enfants", "", "yoga"],
  ["yoga-doux", "Yoga doux", "yoga restauratif", "yoga"],
  ["yoga-mantras", "Mantras et chants", "", "yoga"],
  ["yoga-ayurveda", "Ayurveda", "", "yoga"],
  ["yoga-reiki", "Reiki", "", "yoga"],
  ["yoga-shiatsu", "Shiatsu", "", "yoga"],
  ["yoga-reflexologie", "Réflexologie", "", "yoga"],
  ["yoga-coherence-cardiaque", "Cohérence cardiaque", "respiration guidée", "yoga"],
  ["yoga-hypnose", "Hypnose", "auto-hypnose", "yoga"],
  ["yoga-meditation-guidee", "Méditation guidée", "", "yoga"],
  ["yoga-bols", "Bols chantants", "bols tibétains,sonothérapie", "yoga"],
  ["yoga-bain-de-foret", "Bain de forêt", "sylvothérapie", "yoga"],
  ["yoga-cryotherapie", "Bains froids", "cryothérapie,eau froide,wim hof", "yoga"],
  ["yoga-sauna", "Sauna et hammam", "hammam,banya", "yoga"],
  ["yoga-massage-thai", "Massage thaï", "", "yoga"],
  ["yoga-automassage", "Automassage", "rouleau de massage", "yoga"],
  ["yoga-digital-detox", "Déconnexion", "digital detox,détox numérique", "yoga"],

  // ── Santé et nutrition (compléments) ──────────────────────────────────
  ["sante-mediterraneen", "Régime méditerranéen", "", "sante"],
  ["sante-microbiote", "Microbiote", "flore intestinale", "sante"],
  ["sante-allergies", "Allergies et intolérances", "", "sante"],
  ["sante-diabete", "Diabète", "", "sante"],
  ["sante-coeur", "Santé cardiovasculaire", "", "sante"],
  ["sante-dos", "Dos et posture", "mal de dos,posture", "sante"],
  ["sante-kine", "Kinésithérapie", "kiné", "sante"],
  ["sante-osteopathie", "Ostéopathie", "", "sante"],
  ["sante-vue", "Vue", "yeux,ophtalmologie", "sante"],
  ["sante-audition", "Audition", "", "sante"],
  ["sante-dents", "Santé dentaire", "dents", "sante"],
  ["sante-peau", "Santé de la peau", "dermatologie", "sante"],
  ["sante-menopause", "Ménopause", "", "sante"],
  ["sante-fertilite", "Fertilité", "", "sante"],
  ["sante-vaccination", "Vaccination", "", "sante"],
  ["sante-handicap", "Vivre avec un handicap", "", "sante"],
  ["sante-douleur", "Douleur chronique", "", "sante"],
  ["sante-burnout", "Burn-out", "épuisement professionnel", "sante"],
  ["sante-anxiete", "Anxiété", "", "sante"],
  ["sante-depression", "Dépression", "", "sante"],
  ["sante-tcc", "Thérapies cognitives", "tcc", "sante"],
  ["sante-tabac", "Arrêt du tabac", "sevrage tabagique", "sante"],
  ["sante-alcool", "Rapport à l'alcool", "sobriété", "sante"],
  ["sante-ecrans", "Rapport aux écrans", "", "sante"],
  ["sante-neuroatypie", "Neuroatypie", "tdah,autisme,hpi", "sante"],
  ["sante-aidants", "Aidants", "proche aidant", "sante"],
];
