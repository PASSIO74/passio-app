/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — langues, apprentissage et collections
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

  // ── Langues ────────────────────────────────────────────
  ["langues", "Langues", "langue,langues étrangères,polyglotte,apprendre une langue", "", { emoji: "🗣️", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["langues-anglais", "Anglais", "english,parler anglais", "langues"],
  ["langues-espagnol", "Espagnol", "castillan,parler espagnol", "langues"],
  ["langues-italien", "Italien", "", "langues"],
  ["langues-allemand", "Allemand", "deutsch", "langues"],
  ["langues-portugais", "Portugais", "brésilien,portugais du brésil", "langues"],
  ["langues-japonais", "Japonais", "kanji,hiragana", "langues", { pop: 1 }],
  ["langues-coreen", "Coréen", "hangeul", "langues"],
  ["langues-chinois", "Chinois", "mandarin", "langues"],
  ["langues-arabe", "Arabe", "arabe littéraire,darija", "langues"],
  ["langues-russe", "Russe", "cyrillique", "langues"],
  ["langues-neerlandais", "Néerlandais", "hollandais", "langues"],
  ["langues-suedois", "Suédois", "", "langues"],
  ["langues-grec", "Grec", "grec moderne", "langues"],
  ["langues-turc", "Turc", "", "langues"],
  ["langues-hindi", "Hindi", "", "langues"],
  ["langues-lsf", "Langue des signes", "lsf,signes", "langues"],
  ["langues-latin", "Latin", "", "langues"],
  ["langues-grec-ancien", "Grec ancien", "", "langues"],
  ["langues-breton", "Breton", "brezhoneg", "langues"],
  ["langues-occitan", "Occitan", "provençal", "langues"],
  ["langues-corse", "Langue corse", "", "langues"],
  ["langues-basque", "Basque", "euskara", "langues"],
  ["langues-alsacien", "Alsacien", "", "langues"],
  ["langues-creole", "Créole", "", "langues"],
  ["langues-esperanto", "Espéranto", "", "langues"],
  ["langues-tandem", "Tandem linguistique", "échange linguistique,conversation", "langues"],
  ["langues-traduction", "Traduction", "traduire", "langues"],
  ["langues-interpretariat", "Interprétariat", "interprète", "langues"],
  ["langues-phonetique", "Prononciation", "phonétique,accent", "langues"],
  ["langues-sejour", "Séjour linguistique", "immersion", "langues"],
  ["langues-linguistique", "Linguistique", "étymologie,origine des mots", "langues"],
  ["langues-francais", "Français", "orthographe,grammaire,fle", "langues"],

  // ── Apprentissage ────────────────────────────────────────────
  ["apprentissage", "Apprentissage", "apprendre,se former,étudier,formation", "", { emoji: "🎓", color: "#7c3aed", pop: 1, broad: 1 }],
  ["apprentissage-autodidaxie", "Autodidaxie", "autodidacte,apprendre seul", "apprentissage"],
  ["apprentissage-mooc", "Cours en ligne", "mooc,e-learning", "apprentissage"],
  ["apprentissage-memorisation", "Mémorisation", "mémoire,répétition espacée,anki", "apprentissage"],
  ["apprentissage-prise-de-notes", "Prise de notes", "zettelkasten,fiches", "apprentissage"],
  ["apprentissage-methode", "Méthode de travail", "organisation des études", "apprentissage"],
  ["apprentissage-reconversion", "Reconversion", "changer de métier", "apprentissage"],
  ["apprentissage-concours", "Concours et examens", "préparation aux concours", "apprentissage"],
  ["apprentissage-revisions", "Révisions", "réviser,bac,partiels", "apprentissage"],
  ["apprentissage-mentorat", "Mentorat", "mentor,accompagnement", "apprentissage"],
  ["apprentissage-conferences", "Conférences", "talks,ted", "apprentissage"],
  ["apprentissage-lecture-rapide", "Lecture rapide", "", "apprentissage"],
  ["apprentissage-soutien", "Soutien scolaire", "aide aux devoirs,cours particuliers", "apprentissage"],
  ["apprentissage-formation-continue", "Formation continue", "cpf", "apprentissage"],
  ["apprentissage-certification", "Certifications", "diplômes", "apprentissage"],
  ["apprentissage-enseignement", "Enseignement", "enseigner,pédagogie,prof", "apprentissage"],
  ["apprentissage-instruction-en-famille", "Instruction en famille", "ief,école à la maison", "apprentissage"],
  ["apprentissage-culture-generale", "Culture générale", "", "apprentissage"],

  // ── Collections ────────────────────────────────────────────
  ["collections", "Collections", "collectionner,collectionneur", "", { emoji: "🗃️", color: "#a78bfa", pop: 0, broad: 1 }],
  ["collections-philatelie", "Philatélie", "timbres,collection de timbres", "collections"],
  ["collections-numismatique", "Numismatique", "pièces de monnaie,monnaies anciennes", "collections"],
  ["collections-vinyles", "Vinyles", "disques,33 tours,collection de disques", "collections"],
  ["collections-cassettes", "Cassettes et K7", "audio vintage", "collections"],
  ["collections-cartes-postales", "Cartes postales", "cartophilie", "collections"],
  ["collections-figurines", "Figurines", "figurines de collection,funko", "collections"],
  ["collections-lego", "LEGO", "briques,lego adulte", "collections"],
  ["collections-cartes-a-collectionner", "Cartes à collectionner", "tcg,pokémon,magic,panini", "collections"],
  ["collections-montres", "Montres", "montres anciennes", "collections"],
  ["collections-mineraux", "Minéraux et fossiles", "pierres,collection de roches", "collections"],
  ["collections-autographes", "Autographes", "dédicaces", "collections"],
  ["collections-affiches", "Affiches", "posters de collection", "collections"],
  ["collections-jouets-anciens", "Jouets anciens", "jouets vintage", "collections"],
  ["collections-maquettes", "Maquettes", "modélisme,maquettisme,plastique", "collections"],
  ["collections-trains-miniatures", "Trains miniatures", "modélisme ferroviaire,réseau ho", "collections"],
  ["collections-voitures-miniatures", "Voitures miniatures", "miniatures,1/18,hot wheels", "collections"],
  ["collections-livres-anciens", "Livres anciens", "bibliophilie,éditions rares", "collections"],
  ["collections-bd-collection", "BD de collection", "editions originales bd", "collections"],
  ["collections-capsules", "Capsules et étiquettes", "placomusophilie,étiquettes de vin", "collections"],
  ["collections-armes-anciennes", "Armes anciennes", "collection militaria", "collections"],
  ["collections-militaria", "Militaria", "objets militaires,uniformes", "collections"],
  ["collections-appareils-photo", "Appareils photo anciens", "collection d'appareils", "collections"],
  ["collections-consoles-retro", "Consoles rétro", "collection de consoles", "collections"],
  ["collections-parfums", "Flacons et parfums", "", "collections"],
  ["collections-porcelaine", "Porcelaine et faïence", "vaisselle ancienne", "collections"],
  ["collections-brocante", "Brocante et chine", "vide-grenier,chiner,puces", "collections"],
  ["collections-antiquites", "Antiquités", "antiquaire,objets anciens", "collections"],
];
