/* ============================================================
   PASSIO · TEXTES LÉGAUX — mentions légales, CGU, politique de confidentialité
   ------------------------------------------------------------
   ⚠️ POURQUOI CE FICHIER VIT EN <head>, AVANT L'APPLICATION (2026-09-11).
   La LCEN (art. 1-1) impose de tenir les mentions légales à la disposition du
   PUBLIC. Or le rideau du code d'accès (js/access-gate.js) masque tout, et en
   production le bloc applicatif (dist/app.js, où vivaient ces textes) n'est
   injecté QU'APRÈS le déverrouillage : un visiteur sans code ne pouvait lire
   ni qui édite le service, ni qui l'héberge, ni comment le joindre. Le jour
   de l'ouverture au public, c'était une mention légale INACCESSIBLE.

   Les textes sont donc ici, dans un script de tête inliné dans index.html par
   scripts/build.js, et ils n'ont QU'UNE SOURCE : l'écran du code d'accès et
   les modales de l'application (openLegalNotice, openTermsOfService,
   openPrivacyPolicy dans app-02) rendent EXACTEMENT le même HTML — le verrou
   « les textes du gate sont ceux de l'application » de
   tests/e2e/access-gate.spec.js le mesure à l'octet près.

   ⚠️ Ce fichier ne peut compter sur AUCUNE fonction de l'application
   (escapeHtml, openModal, $…) : elles n'existent pas encore quand le gate est
   affiché en production. D'où `_legalEscapeHtml`, même table que `escapeHtml`
   (app-02), inscrite comme désinfectant dans scripts/audit-echappement.js.
   ============================================================ */

// ⚠️ L'IDENTITÉ DE L'ÉDITEUR NE S'INVENTE PAS, ET ELLE N'A QU'UNE SEULE SOURCE.
// `openAbout()` affichait « PASSIO SAS · France · contact@passio.app », trois
// informations qu'aucun document du dépôt n'établit — et dont la dernière
// contredit l'adresse réelle donnée par la politique de confidentialité. Une
// mention légale FAUSSE est plus grave qu'une mention légale visiblement
// inachevée : la première trompe, la seconde se complète.
//
// ⚠️ MAIS UN TROU N'EST PAS TOUJOURS UN TROU : LE RÉGIME DÉCIDE DE CE QUI DOIT
// ÊTRE PUBLIÉ. La première version affichait huit « [à compléter] » parce
// qu'elle supposait un éditeur professionnel. Il n'y a pas de société : PASSIO
// est aujourd'hui édité par une personne physique, à titre non professionnel.
// Ce régime-là ne demande PAS ces huit champs — annoncer huit manques là où la
// loi n'en voit aucun est une deuxième façon de dire faux.
const PASSIO_EDITEUR = {
  service: "PASSIO",
  site: "passio-app.netlify.app",
  email: "passioadmin@gmail.com",

  // ── LE RÉGIME, SEUL INTERRUPTEUR ────────────────────────────────────────
  // "particulier" — personne physique éditant à titre NON PROFESSIONNEL.
  //   LCEN art. 1-1, II. ⚠️ L'ancien art. 6-III a été ABROGÉ par la loi
  //   n° 2024-449 du 21 mai 2024 (SREN) : ne plus le citer. L'éditeur peut
  //   rester anonyme VIS-À-VIS DU PUBLIC à DEUX conditions cumulatives :
  //     ① publier le nom et l'adresse de son HÉBERGEUR (d'où l'adresse
  //        postale complète de Netlify ci-dessous : dans ce régime elle n'est
  //        pas un détail, c'est la SEULE identité publiée) ;
  //     ② avoir communiqué à cet hébergeur ses éléments d'identification
  //        personnelle — ce que fait un compte Netlify nominatif.
  //   ⚠️ CE RÉGIME TOMBE AU PREMIER EURO. Dès que le service est exploité à
  //   titre professionnel — les passions payantes d'`openPassionPaywall` en
  //   sont le déclencheur direct — il faut basculer sur "societe", et les huit
  //   champs redeviennent obligatoires. Ce n'est pas une destination, c'est un
  //   abri temporaire.
  // "societe" — éditeur professionnel : les huit champs sont EXIGÉS et tout
  //   champ vide s'affiche « [à compléter] » EN CLAIR, à l'écran.
  regime: "particulier",

  // Exigés par le régime "societe" UNIQUEMENT. Les laisser vides tant qu'il
  // n'y a pas de structure : sous "particulier" ils ne sont jamais lus.
  raisonSociale: "",
  formeJuridique: "",
  capital: "",
  siege: "",
  rcs: "",
  siret: "",
  tvaIntra: "",
  directeurPublication: "",

  // ── HÉBERGEUR DU SITE — l'identité que la LCEN rend obligatoire ─────────
  // Adresse relevée sur les conditions d'utilisation de Netlify elles-mêmes,
  // jamais devinée. C'est l'hébergeur du SITE, celui que vise l'art. 1-1, II.
  hebergeurSite: "Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, États-Unis — netlify.com",
  // Sous-traitant technique des DONNÉES (RGPD), distinct de l'hébergeur du
  // site : il relève de la politique de confidentialité, pas de l'art. 1-1.
  hebergeurDonnees: "Supabase (Supabase Pte. Ltd., Singapour) — supabase.com",
};

// Version du contrat acceptée à l'inscription. Toute réécriture de fond des CGU
// change cette valeur : c'est elle qui permet de savoir QUI a accepté QUOI.
// ⚠️ LA VERSION SUIT LE TEXTE. Passée au 2026-09-10 avec la passe « lancement
// gratuit » : le périmètre de diffusion (« un petit groupe » → ouvert à tous),
// le fondement de l'exonération (l'art. 10 ne s'appuie plus sur « phase de
// test », qui périme, mais sur la gratuité, qui ne périme pas), le retrait du
// médiateur de la consommation (sans objet, et il contredisait l'art. 1) et la
// phrase de l'art. 7 sur l'argent des rencontres. Un accord donné sur les CGU
// « petit groupe » ne vaut pas pour celles-ci.
const PASSIO_CGU_VERSION = "2026-09-10";

// Version de la politique de confidentialité, affichée en tête du texte. Elle
// SUIT le texte, comme celle des CGU : une politique qui annonce « juin 2026 »
// alors qu'elle a changé trois fois depuis ne dit plus quand elle a été écrite,
// et personne ne peut savoir ce qui lui a été communiqué. Celle de juin 2026
// décrivait encore les « carnets » (retirés par ADR-011) et ne déclarait AUCUNE
// des mesures d'usage que l'application enregistre depuis.
const PASSIO_CONFIDENTIALITE_VERSION = "2026-09-10";

// Même table que `escapeHtml` (app-02). Dupliquée ici parce que ce fichier
// s'exécute AVANT l'application ; ne jamais y ajouter un cas sans l'ajouter
// à `escapeHtml`, et inversement.
function _legalEscapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Vrai quand l'éditeur est une personne physique non professionnelle.
function _editeurParticulier() {
  try { return (PASSIO_EDITEUR && PASSIO_EDITEUR.regime) !== "societe"; } catch (e) { return true; }
}

// Rend un champ d'identité, ou un marqueur VISIBLE quand il n'est pas renseigné.
function _champEditeur(cle) {
  var v = "";
  try { v = (PASSIO_EDITEUR && PASSIO_EDITEUR[cle]) || ""; } catch (e) {}
  if (!v) return '<em style="color:#b45309;font-style:normal;font-weight:700;">[à compléter]</em>';
  return _legalEscapeHtml(String(v));
}

function _legalTitre(t) {
  return '<strong style="color:var(--text);">' + _legalEscapeHtml(t) + '</strong> ';
}

function _legalParagraphe(titre, corps) {
  return '<p style="margin:0 0 10px;">' + _legalTitre(titre) + corps + '</p>';
}

// ---------------------------------------------------------------------------
// Mentions légales — le CORPS du texte (sans titre ni boutons : chaque surface
// pose les siens). Rendu par openLegalNotice (app-02) et par l'écran du code.
// ---------------------------------------------------------------------------
function passioTexteMentionsLegales() {
  var p = _legalParagraphe;
  // ⚠️ DEUX RÉGIMES, DEUX TEXTES — et le mauvais texte est un texte FAUX.
  // Sous « particulier », réclamer un RCS ou un directeur de la publication
  // annoncerait huit manquements que la loi ne constate pas ; sous « societe »,
  // s'en passer masquerait de vraies obligations. `regime` tranche, une fois.
  var identite = _editeurParticulier()
    ? p("Éditeur du service.",
        'PASSIO est édité par une personne physique, à titre non professionnel. '
        + 'Conformément à l’article 1-1, II de la loi pour la confiance dans l’économie '
        + 'numérique, l’éditeur conserve l’anonymat vis-à-vis du public : il a communiqué '
        + 'ses éléments d’identification à son hébergeur, dont le nom et l’adresse figurent '
        + 'ci-dessous, et qui les tient à la disposition de l’autorité judiciaire.')
    : p("Éditeur du service.",
        _champEditeur("raisonSociale") + ' — ' + _champEditeur("formeJuridique")
        + ', capital social ' + _champEditeur("capital")
        + '.<br>Siège social : ' + _champEditeur("siege")
        + '.<br>RCS : ' + _champEditeur("rcs")
        + ' — SIRET : ' + _champEditeur("siret")
        + ' — TVA intracommunautaire : ' + _champEditeur("tvaIntra") + '.')
      + p("Directeur de la publication.", _champEditeur("directeurPublication") + '.');

  return identite +
    p("Contact.", _legalEscapeHtml(PASSIO_EDITEUR.email) + ' — le moyen le plus rapide de joindre l’éditeur, y compris pour signaler un contenu ou exercer tes droits.') +
    // ⚠️ C'EST LA MEILLEURE DÉFENSE DU RÉGIME « PARTICULIER », et elle est
    // vraie aujourd'hui. L'anonymat de la LCEN (art. 1-1, II) tient à
    // l'exploitation NON PROFESSIONNELLE — pas à la petite taille : une
    // audience large et un service gratuit y sont parfaitement compatibles.
    // Ce qui ferait basculer, c'est un encaissement, de la publicité, des
    // dons, du sponsoring ou une revente de données. Le dire explicitement
    // vaut mieux que de le laisser déduire.
    p("Un service sans contrepartie.", 'PASSIO est fourni <strong style="color:var(--text);">gratuitement</strong>, sans publicité, sans dons, sans sponsoring et sans aucune contrepartie financière. L’éditeur n’en tire aucun revenu.') +
    p("Hébergeur du site.", _legalEscapeHtml(PASSIO_EDITEUR.hebergeurSite) + '.') +
    p("Hébergement des données.", _legalEscapeHtml(PASSIO_EDITEUR.hebergeurDonnees) + ', sous-traitant technique au sens du RGPD.') +
    p("Signalement d’un contenu illicite.", 'Un contenu peut être signalé directement dans l’application (menu « ⋯ » d’une publication ou d’un profil) ou par e-mail à ' + _legalEscapeHtml(PASSIO_EDITEUR.email) + '. Conformément à l’article 16 du règlement européen sur les services numériques (DSA), un signalement gagne à préciser l’emplacement exact du contenu, une explication du motif invoqué, et de quoi recontacter son auteur.') +
    p("Propriété intellectuelle.", 'La marque, le logo, l’interface et le code du service sont protégés. Les contenus publiés par les membres restent la propriété de leurs auteurs.') +
    p("Données personnelles.", 'Voir la politique de confidentialité, accessible depuis Paramètres → Support. Réclamation possible auprès de la CNIL (cnil.fr).') +
    '<p style="margin:0;font-size:11.5px;">Conditions générales d’utilisation : accessibles depuis Paramètres → Support et depuis l’écran de création de compte.</p>';
}

// ---------------------------------------------------------------------------
// Conditions générales d'utilisation — le CORPS du texte.
// ---------------------------------------------------------------------------
function passioTexteCGU() {
  var p = _legalParagraphe;
  return '<p style="margin:0 0 10px;"><strong style="color:var(--text);">Version du ' + _legalEscapeHtml(PASSIO_CGU_VERSION) + ' — service ' + _legalEscapeHtml(PASSIO_EDITEUR.service) + '</strong></p>' +
    '<p style="margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#fff4e5;border:1px solid #f0b775;color:#7a4a00;line-height:1.5;">' +
      '<strong>⚠️ Version beta — lis ceci avant de créer un compte.</strong><br>' +
      'PASSIO est un service jeune, ouvert gratuitement à tous et encore en construction. Il est gratuit, fourni EN L’ÉTAT, sans garantie, et il peut à tout moment tomber en panne, perdre tes contenus ou s’arrêter. Les rencontres en vrai sont organisées par les membres, jamais par PASSIO, et <strong>aucun membre n’est vérifié</strong>. Tu utilises ce service sous ta seule responsabilité.' +
    '</p>' +
    p("1. Objet.", "Les présentes conditions régissent l’accès et l’utilisation de PASSIO, réseau social dédié aux passions, accessible à l’adresse " + _legalEscapeHtml(PASSIO_EDITEUR.site) + ". Créer un compte vaut acceptation pleine et entière de ce texte. L’éditeur du service est " + (_editeurParticulier() ? "une personne physique éditant à titre non professionnel" : _champEditeur("raisonSociale")) + " (voir les mentions légales).") +
    p("2. Accès au service — VERSION BETA.", "PASSIO est un service <strong style=\"color:var(--text);\">en cours de développement, ouvert gratuitement au public</strong> dans une version encore incomplète. Il est fourni <strong style=\"color:var(--text);\">gratuitement, EN L’ÉTAT, sans aucune garantie</strong> de fonctionnement, de disponibilité, de sécurité, d’exactitude ni d’adaptation à un usage particulier. Il comporte, par nature, des défauts et des interruptions. Il peut à tout moment, sans préavis ni indemnité, évoluer, perdre une fonctionnalité, être suspendu ou définitivement arrêté. <strong style=\"color:var(--text);\">Tes contenus peuvent être perdus, altérés ou effacés à tout moment</strong> : aucune sauvegarde n’est garantie. N’y dépose donc rien d’unique, d’irremplaçable, de confidentiel ou de sensible, et conserve toujours ta propre copie de ce qui compte pour toi. En utilisant cette beta, tu acceptes ces conditions en connaissance de cause.") +
    p("3. Inscription.", "L’inscription est réservée aux personnes <strong style=\"color:var(--text);\">majeures — 18 ans révolus</strong> et suppose une adresse e-mail valide, que tu confirmes en cliquant sur le lien reçu. Tu t’engages à fournir des informations exactes, à ne créer qu’un seul compte et à garder ton mot de passe confidentiel. Toute activité effectuée depuis ton compte est réputée être la tienne.") +
    p("4. Tes contenus.", "Tu restes propriétaire de tout ce que tu publies (textes, photos, vidéos, sons, messages). Tu accordes à PASSIO le droit, gratuit et non exclusif, d’héberger, d’afficher et de transmettre ces contenus <em>aux seules fins de faire fonctionner le service</em>, pour la durée de leur publication. Supprimer un contenu ou ton compte met fin à ce droit. Tu garantis détenir les droits sur ce que tu publies et disposer de l’accord des personnes reconnaissables.") +
    p("5. Règles de conduite.", "Sont interdits : la haine, le harcèlement, les menaces, la discrimination ; les contenus sexuels explicites ou violents ; la mise en danger d’un mineur ; l’atteinte à la vie privée d’autrui (publier ses coordonnées, ses images ou ses messages sans son accord) ; la contrefaçon ; l’usurpation d’identité ; le démarchage, le spam et l’automatisation ; toute tentative de contourner les mesures de sécurité ou d’accéder aux données d’autres membres.") +
    p("6. Signalement et modération.", "Chaque publication, commentaire et profil peut être signalé, et chaque compte bloqué, depuis l’application. Les signalements sont examinés dans les meilleurs délais. Selon la gravité, l’éditeur peut retirer un contenu, avertir, suspendre ou supprimer un compte. Un contenu manifestement illicite peut être retiré sans préavis. Tu peux contester une décision par e-mail à " + _legalEscapeHtml(PASSIO_EDITEUR.email) + ".") +
    p("7. Rencontres en vrai — à tes risques et périls.", "Les rencontres proposées dans l’onglet « Rencontrer » sont créées et organisées <strong style=\"color:var(--text);\">par leurs auteurs, jamais par PASSIO</strong>. L’éditeur n’est ni organisateur, ni co-organisateur, ni intermédiaire, ni assureur, ni partie à ces rendez-vous : il ne fait qu’héberger une annonce. Lorsqu’une rencontre est payante, <strong style=\"color:var(--text);\">le paiement se fait directement entre ses participants et son organisateur, en dehors de PASSIO</strong> : l’éditeur ne perçoit aucune somme, ne détient aucun fonds et n’intervient dans aucun remboursement. <strong style=\"color:var(--text);\">Aucune vérification n’est effectuée</strong> sur les participants — ni identité, ni âge réel, ni antécédents, ni intentions, ni compétence, ni assurance, ni autorisation, ni sécurité du lieu. Tu participes ou tu organises <strong style=\"color:var(--text);\">sous ta seule responsabilité, à tes risques et périls exclusifs</strong>, et il t’appartient de souscrire les assurances utiles. L’organisateur d’une rencontre est seul responsable de son déroulement, des autorisations, de la sécurité des lieux et des personnes. La participation est <strong style=\"color:var(--text);\">réservée aux personnes majeures</strong> sur simple déclaration d’âge, non vérifiée. Préviens un proche, choisis un lieu public et fréquenté, ne communique pas ton adresse, pars si tu ne le sens pas.") +
    p("8. Données personnelles.", "Le traitement de tes données est décrit dans la politique de confidentialité, qui fait partie intégrante des présentes.") +
    p("9. Propriété du service.", "La marque PASSIO, son interface, ses textes et son code restent la propriété de l’éditeur. Aucune reproduction n’est autorisée sans accord écrit.") +
    p("10. Responsabilité de l’éditeur.", "PASSIO fournit un service d’hébergement au sens du règlement européen sur les services numériques (DSA) et de la LCEN : l’éditeur <strong style=\"color:var(--text);\">n’est pas responsable des contenus publiés par ses membres</strong> et n’exerce aucune surveillance générale, mais retire promptement tout contenu dont le caractère illicite lui est signalé. L’éditeur n’est tenu que d’une <strong style=\"color:var(--text);\">obligation de moyens</strong>. Le service étant fourni <strong style=\"color:var(--text);\">gratuitement et sans aucune garantie</strong>, sa responsabilité ne peut être engagée, dans toute la mesure permise par la loi, à raison : d’une perte, d’une altération ou d’un effacement de données ; d’une indisponibilité, d’une interruption ou de l’arrêt du service ; d’un défaut, d’un bogue ou d’une faille ; des agissements, propos ou contenus d’un autre membre ; d’une rencontre organisée par un membre ; d’un dommage indirect ou immatériel, tel qu’une perte d’image, de chance, de temps ou d’exploitation ; ni d’un événement de force majeure ou du fait d’un tiers. <strong style=\"color:var(--text);\">Rien dans les présentes n’écarte ni ne limite la responsabilité qui ne peut légalement l’être</strong>, notamment en cas de dol, de faute lourde ou de dommage corporel : ces cas restent entièrement réservés.") +
    p("11. Ta responsabilité.", "En créant un compte, tu deviens <strong style=\"color:var(--text);\">seul responsable</strong> de l’usage que tu fais de PASSIO : de tout ce que tu publies, envoies ou partages, des rencontres que tu organises ou auxquelles tu participes, des personnes que tu y côtoies, des liens que tu ouvres, des informations que tu choisis de dévoiler, de l’exactitude de ce que tu déclares — ton âge compris — et du respect des lois qui te sont applicables. Tu reconnais avoir été informé du caractère expérimental du service et de l’absence totale de vérification des membres. Dans la mesure permise par la loi, <strong style=\"color:var(--text);\">tu garantis l’éditeur</strong> contre toute réclamation, plainte ou action d’un tiers, et contre les frais qui en découlent, lorsqu’elle trouve son origine dans tes contenus, tes agissements ou un manquement de ta part aux présentes.") +
    p("12. Fin du contrat.", "Tu peux supprimer ton compte à tout moment depuis les Paramètres, bouton « Supprimer mon compte » (tout en bas), sans motif et sans frais. L’éditeur peut résilier ton accès en cas de manquement grave aux présentes.") +
    p("13. Modification.", "Les présentes peuvent évoluer. Toute modification substantielle est portée à ta connaissance dans l’application ; la poursuite de l’utilisation vaut acceptation.") +
    p("14. Droit applicable.", "Droit français. En cas de litige, une solution amiable sera recherchée en priorité à l’adresse " + _legalEscapeHtml(PASSIO_EDITEUR.email) + ". À défaut, les tribunaux français sont compétents.");
}

// ---------------------------------------------------------------------------
// Politique de confidentialité — le CORPS du texte.
// ---------------------------------------------------------------------------
function passioTextePolitique() {
  return '\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">Dernière mise à jour : ' + _legalEscapeHtml(PASSIO_CONFIDENTIALITE_VERSION) + ' — PASSIO (beta privée)</strong></p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">1. Qui traite tes données.</strong> PASSIO est édité par une <strong style="color:var(--text);">personne physique, à titre non professionnel</strong>, qui est le responsable de ce traitement. Elle est joignable à <strong style="color:var(--text);">' + _legalEscapeHtml(PASSIO_EDITEUR.email) + '</strong>, et communique son identité complète à toute personne qui exerce ses droits, ainsi qu\'à la CNIL. Il n\'y a pas de délégué à la protection des données : le service n\'y est pas tenu.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">2. Ce que tu nous donnes.</strong> À l\'inscription : <strong style="color:var(--text);">adresse e-mail</strong> et <strong style="color:var(--text);">nom d\'utilisateur</strong>. En utilisant PASSIO : tes passions, tes publications (textes, photos, vidéos, sons), tes messages privés et leurs pièces jointes, commentaires, j\'aime, abonnements, participation aux rencontres, l\'<strong style="color:var(--text);">année de naissance</strong> que tu déclares, les signalements que tu envoies, et tes préférences (thème, filtres) gardées sur ton appareil.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">2 bis. Ta position, seulement quand tu la donnes.</strong> Deux gestes, deux usages, jamais d\'autre : ① « Partager ma position » dans une conversation envoie ta <strong style="color:var(--text);">position exacte</strong> aux membres de cette conversation — elle reste dans l\'historique des messages, comme le reste ; ② l\'écran Rencontrer peut demander à ton navigateur où tu es, pour trier les rencontres par distance et afficher le nom de ta ville — <strong style="color:var(--text);">PASSIO ne l\'enregistre pas</strong>, mais tes coordonnées sont envoyées au service de géocodage cité au point 6 pour retrouver ce nom de commune. PASSIO ne suit jamais tes déplacements et ne demande la position ni au démarrage, ni en arrière-plan.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">3. Ce que l\'application mesure toute seule.</strong> Pour voir si elle fonctionne, PASSIO enregistre des <strong style="color:var(--text);">événements techniques d\'usage</strong> : écran ouvert, action effectuée, durée, adresse technique appelée et code de réponse, message et trace d\'une erreur, ainsi qu\'un <strong style="color:var(--text);">identifiant d\'appareil</strong> et un identifiant de session, la plateforme, le navigateur, la taille d\'écran et le type de connexion. Le contenu de ce que tu écris n\'y entre jamais : un filtre écarte les champs sensibles avant l\'envoi. <strong style="color:var(--text);">Tu peux couper cette mesure</strong> à tout moment : Paramètres → Confidentialité → « Mesure d\'usage ».</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">4. Pourquoi nous avons le droit.</strong> Fournir le service que tu demandes (exécution du contrat, art. 6.1.b) pour ton compte et tes contenus ; notre <strong style="color:var(--text);">intérêt légitime</strong> (art. 6.1.f) à faire fonctionner, sécuriser et corriger l\'application pour la mesure d\'usage, que tu peux couper ; le respect d\'obligations légales pour la modération et les signalements.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">5. Qui les héberge, et où.</strong> Base de données et fichiers : <strong style="color:var(--text);">Supabase</strong> (Supabase Pte. Ltd., Singapour). Site : <strong style="color:var(--text);">Netlify, Inc.</strong> (États-Unis). E-mails de confirmation : <strong style="color:var(--text);">Brevo</strong> (France). Ces transferts hors Union européenne se font sur la base des clauses contractuelles types de la Commission européenne. Une partie des données reste sur ton appareil (localStorage, IndexedDB) pour le fonctionnement hors-ligne. En base, l\'accès est restreint par des règles par propriétaire (RLS).</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">6. Ce que ton navigateur appelle ailleurs.</strong> Afficher une carte, un GIF ou une image de démonstration fait appel à des services tiers qui reçoivent alors ton <strong style="color:var(--text);">adresse IP</strong> : fonds de carte (OpenFreeMap), recherche d\'adresse (Base Adresse Nationale, Photon), GIF (Giphy, Tenor), images et vidéos d\'illustration (Unsplash, Pexels). Nous ne leur transmettons ni ton compte, ni ton nom.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">7. Ce que nous ne faisons pas.</strong> Pas de revente de données, pas de publicité, pas de profilage publicitaire, aucun traqueur publicitaire tiers. C\'est l\'engagement fondateur de PASSIO.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">8. Combien de temps.</strong> Ton compte et tes contenus : tant que ton compte existe. Sa suppression efface tes contenus et ton adresse e-mail immédiatement ; en cas d’incident technique, au plus tard sous 30 jours. Les événements techniques du point 3 : <strong style="color:var(--text);">13 mois au maximum</strong>. Les signalements sont conservés le temps de traiter l\'affaire et d\'en garder la trace.</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">9. Tes droits (RGPD).</strong> Accès, rectification, effacement, portabilité, limitation, opposition — et le droit de retirer ton consentement quand il en sert de base. Exerce-les dans l\'app (Paramètres → Supprimer mon compte) ou par e-mail : <strong style="color:var(--text);">' + _legalEscapeHtml(PASSIO_EDITEUR.email) + '</strong>. Nous répondons sous un mois. Tu peux aussi réclamer auprès de la CNIL (cnil.fr).</p>\
      <p style="margin:0 0 10px;"><strong style="color:var(--text);">10. Mineurs.</strong> PASSIO est réservé aux personnes majeures : l\'inscription est refusée en dessous de 18 ans révolus. L\'âge est <strong style="color:var(--text);">déclaré</strong> par la personne ; nous ne demandons aucune pièce d\'identité et <strong style="color:var(--text);">ne vérifions pas cette déclaration</strong>. Un compte dont nous apprenons qu\'il appartient à un mineur est supprimé.</p>\
      <p style="margin:0;"><strong style="color:var(--text);">11. Beta privée.</strong> Pendant la phase de test, l\'accès est protégé par un code, les fonctionnalités évoluent et <strong style="color:var(--text);">tes contenus peuvent être perdus</strong> : n\'y dépose rien d\'irremplaçable. Tes retours peuvent être utilisés pour améliorer le produit.</p>\
  ';
}
