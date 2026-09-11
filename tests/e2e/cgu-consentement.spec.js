// ═══════════════════════════════════════════════════════════════════════════
// CGU, MENTIONS LÉGALES ET CONSENTEMENT À L'INSCRIPTION  (2026-09-08)
//
// Pourquoi ce lot. L'application ouvre à de vrais utilisateurs. Il lui manquait
// les DEUX textes qu'un service en ligne doit produire — les conditions
// générales (le contrat) et les mentions légales (qui édite, qui héberge, à qui
// s'adresser) — et surtout le geste qui forme le contrat : un consentement
// EXPLICITE au moment de créer le compte. La politique de confidentialité, elle,
// existait déjà.
//
// Deux défauts précis que ces cas verrouillent :
//
//   ① L'identité de l'éditeur était INVENTÉE. `openAbout()` affichait
//      « PASSIO SAS · France · contact@passio.app » — une forme juridique, un
//      pays et une adresse qu'aucun document du dépôt n'établit, la dernière
//      contredisant l'adresse réelle donnée par la politique de
//      confidentialité. Une mention légale fausse trompe ; une mention légale
//      visiblement inachevée se complète. Tout champ non renseigné s'affiche
//      donc « [à compléter] » EN CLAIR (`PASSIO_EDITEUR`, source unique).
//
//   ② Le piège du `<label>`. Les liens vers les CGU et la politique vivent
//      DANS le label de la case à cocher : l'activation d'un label part du clic
//      sur un de ses descendants, donc ouvrir les CGU COCHERAIT le
//      consentement — un accord donné par le geste qui sert à le lire.
//      `stopPropagation` l'empêche ; le cas ④ le mesure.
//
// ⚠️ La garde est mesurée SUR SON CHEMIN RÉEL (le vrai bouton, la vraie case),
// jamais en appelant la fonction de validation à la main : c'est le câblage,
// pas la fonction, qui a manqué dans les défauts passés du projet.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { GATE_KEY, GATE_TOKEN, poserGateSansPremiereVisite } = require("./gate-helper");
const { sansDonneesDistantes, bootOnboarded } = require("./app-helper");

// Ouvre l'écran d'auth réel (landing → « Créer un compte ») et remplace
// `supa.auth` par des doubles qui ENREGISTRENT leurs appels sans rien envoyer.
// ⚠️ `supa` est un `let` de portée script : on mute l'objet, on ne le remplace
// pas — `window.supa = …` ne toucherait pas le binding que l'app utilise.
async function ouvrirAuth(page) {
  await sansDonneesDistantes(page);
  await poserGateSansPremiereVisite(page);
  await page.addInitScript(() => { sessionStorage.setItem("passio_pwa_dismissed", "1"); });
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(
    () => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 },
  );
  // `exitLandingAsAuth` présélectionne l'onglet dans un setTimeout de 50 ms :
  // agir avant qu'il ne parte ferait basculer le mode SOUS le test.
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate(() => {
    window.__auth = { signUp: [], signIn: [], oauth: [] };
    supa.auth.signUp = async (a) => {
      window.__auth.signUp.push(a);
      return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
    supa.auth.signInWithPassword = async (a) => {
      window.__auth.signIn.push(a);
      return { data: { session: null }, error: { message: "Invalid login" } };
    };
    supa.auth.signInWithOAuth = async (a) => { window.__auth.oauth.push(a); return { error: null }; };
  });
}

async function remplirInscription(page) {
  await page.locator("#authTabSignup").click();
  // Nom d'utilisateur : condition d'inscription depuis le 2026-09-09.
  await page.locator("#authName").fill("Camille");
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
}

// ──────────────────────────────────────────────────────────────────────────
// ① La case n'existe QUE là où un contrat se forme
// ──────────────────────────────────────────────────────────────────────────
test("① le consentement est demandé à la création, pas à la connexion", async ({ page }) => {
  await ouvrirAuth(page);

  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authConsentWrap")).toBeVisible();
  await expect(page.locator("#authConsent")).not.toBeChecked();

  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authConsentWrap")).toBeHidden();

  // ⚠️ `label.field` est `display:block` en CSS. Rendre la main au CSS
  // (`style.display = ""`) remettrait le texte SOUS la case, sur toute la
  // largeur : on exige la rangée, pas seulement la visibilité.
  await page.locator("#authTabSignup").click();
  const dir = await page.locator("#authConsentWrap").evaluate(
    (el) => getComputedStyle(el).flexDirection + "|" + getComputedStyle(el).display,
  );
  expect(dir).toBe("row|flex");
});

// ──────────────────────────────────────────────────────────────────────────
// ② Sans accord, AUCUN compte n'est créé — mesuré sur le vrai bouton
// ──────────────────────────────────────────────────────────────────────────
test("② inscription refusée sans consentement : signUp n'est jamais appelé", async ({ page }) => {
  await ouvrirAuth(page);
  await remplirInscription(page);
  await page.locator("#authSubmitBtn").click();

  await expect(page.locator("#authMsg")).toContainText("conditions générales");
  expect(await page.evaluate(() => window.__auth.signUp.length)).toBe(0);
});

test("③ inscription acceptée une fois la case cochée", async ({ page }) => {
  await ouvrirAuth(page);
  await remplirInscription(page);
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();

  const appels = await page.evaluate(() => window.__auth.signUp);
  expect(appels).toHaveLength(1);
  expect(appels[0].email).toBe("nouvelle@exemple.com");

  // La trace de l'accord : QUI a accepté QUOI. Sans la version, une réécriture
  // des CGU rendrait « a accepté » inexploitable.
  const cgu = await page.evaluate(() => (state && state.user && state.user.cgu) || null);
  expect(cgu).not.toBeNull();
  // ⚠️ LA VERSION SUIT LE TEXTE, ET LE CAS NE LA FIGE PLUS EN DUR. Elle a changé
  // deux fois en deux jours (18+ le 09, lancement gratuit le 10) : écrire la
  // date ici faisait rougir quatre cas à chaque réécriture des CGU, pour une
  // raison qui n'est JAMAIS un défaut. Ce qui doit être vrai, c'est que la trace
  // porte LA version en vigueur — pas telle date.
  const versionEnVigueur = await page.evaluate(() => PASSIO_CGU_VERSION);
  expect(versionEnVigueur).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(cgu.version).toBe(versionEnVigueur);
  expect(typeof cgu.acceptedAt).toBe("string");
  expect(cgu.acceptedAt.length).toBeGreaterThan(10);

  // ⚠️ ET SURTOUT : L'ACCORD PART AVEC LE COMPTE (2026-09-10). Il ne vivait que
  // dans `state.user.cgu`, EN MÉMOIRE — mesuré en production : ZÉRO trace sur
  // 85 lignes `user_state`, y compris pour le seul compte créé depuis la mise en
  // place du dispositif. Deux chemins l'effaçaient : le retour par « Se
  // connecter » (depuis « Confirm email », `signUp` ne rend pas de session, donc
  // aucun `saveState()` n'intervient) et `purgeAccountScopedData()`, dont
  // `STATE_KEY` est le premier élément. En cas de litige sur une rencontre, rien
  // ne prouvait que la personne avait accepté quoi que ce soit — c'est le
  // bouclier de responsabilité lui-même qui était en cause.
  //
  // `user_metadata` est la SEULE mémoire qui voyage sans migration : elle survit
  // à la confirmation d'e-mail, au changement d'appareil et à la purge locale.
  const meta = appels[0].options && appels[0].options.data;
  expect(meta).toBeTruthy();
  expect(meta.cgu_version).toBe(versionEnVigueur);
  expect(typeof meta.cgu_accepted_at).toBe("string");
  expect(meta.confidentialite_version).toBeTruthy();
  // Le MÊME instant des deux côtés : deux horodatages pour un seul geste
  // rendraient la trace inexploitable.
  expect(meta.cgu_accepted_at).toBe(cgu.acceptedAt);
});

// ──────────────────────────────────────────────────────────────────────────
// ④ LE PIÈGE DU LABEL — lire les CGU ne vaut pas les accepter
// ──────────────────────────────────────────────────────────────────────────
test("④ ouvrir les CGU depuis le lien ne coche PAS la case", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();

  await page.locator("#authCguLink").click();
  await expect(page.locator(".modal-backdrop.active")).toBeVisible();
  await expect(page.locator(".modal-title")).toContainText("Conditions générales");
  await expect(page.locator("#authConsent")).not.toBeChecked();

  await page.evaluate(() => closeModal());
  await page.locator("#authPrivacyLink").click();
  await expect(page.locator(".modal-title")).toContainText("Politique de confidentialité");
  await expect(page.locator("#authConsent")).not.toBeChecked();
});

// ──────────────────────────────────────────────────────────────────────────
// ⑤ Le bouton Google forme le même contrat que le formulaire
// ──────────────────────────────────────────────────────────────────────────
test("⑤ Google en création : bloqué sans accord, passant avec", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();

  await page.locator("#authGoogleBtn").click();
  await expect(page.locator("#authMsg")).toContainText("conditions générales");
  expect(await page.evaluate(() => window.__auth.oauth.length)).toBe(0);

  await page.locator("#authConsent").click();
  await page.locator("#authGoogleBtn").click();
  await expect.poll(() => page.evaluate(() => window.__auth.oauth.length)).toBe(1);
});

test("⑥ Google en connexion : l'accord n'est pas redemandé", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignin").click();
  await page.locator("#authGoogleBtn").click();
  await expect.poll(() => page.evaluate(() => window.__auth.oauth.length)).toBe(1);
});

// ──────────────────────────────────────────────────────────────────────────
// ⑦ Ce que les CGU doivent DIRE
// ──────────────────────────────────────────────────────────────────────────
test("⑦ les CGU couvrent les engagements que le produit prend vraiment", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openTermsOfService());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();

  // L'âge minimum, et la majorité pour les rencontres en vrai — les deux portes
  // que le code applique réellement (onbValidateAge, requireAdmission).
  // ⚠️ Depuis le 2026-09-09 PASSIO est réservé aux MAJEURS : le texte ne doit
  // plus jamais annoncer 13 ans, sous peine de contredire `onbValidateAge`.
  expect(texte).toContain("18 ans");
  expect(texte).not.toMatch(/13 ans/);
  expect(texte).toMatch(/majeur/i);

  // ── Les protections du lancement, verrouillées une par une ──
  // Sans ces assertions, n'importe quelle réécriture des CGU pourrait retirer
  // en silence ce qui protège l'éditeur au moment où il ouvre à de vrais
  // utilisateurs : une clause supprimée ne casse aucun autre test.
  expect(texte).toMatch(/beta/i);                         // le service est dit expérimental
  expect(texte).toMatch(/EN L’ÉTAT|EN L'ÉTAT/);           // fourni sans garantie
  expect(texte).toMatch(/sans garantie/i);
  expect(texte).toMatch(/perdus|perte/i);                 // les données peuvent disparaître
  expect(texte).toMatch(/aucune vérification|n’est vérifié|n'est vérifié/i);
  expect(texte).toMatch(/risques et périls/i);            // les rencontres
  expect(texte).toMatch(/seul responsable/i);             // §11 Ta responsabilité
  expect(texte).toMatch(/garantis l’éditeur|garantis l'éditeur/i);
  expect(texte).toMatch(/obligation de moyens/i);
  // ⚠️ La réserve d'ordre public est ce qui rend la limitation OPPOSABLE :
  // une clause qui exonère de TOUT est réputée non écrite et peut faire tomber
  // l'article entier. Elle ne doit jamais être « nettoyée » comme une redite.
  expect(texte).toMatch(/ne peut légalement l’être|ne peut légalement l'être/i);
  expect(texte).toMatch(/dommage corporel/i);
  // Ce qu'un membre doit pouvoir opposer au service, et l'inverse.
  expect(texte).toMatch(/signal/i);          // signalement / modération
  expect(texte).toMatch(/supprimer ton compte/i);
  expect(texte).toMatch(/propriétaire/i);    // les contenus restent à leur auteur
  expect(texte).toMatch(/droit français/i);
  expect(texte).toContain("passioadmin@gmail.com");
  // Une adresse de contact inventée ne doit revenir NULLE PART.
  expect(texte).not.toContain("contact@passio.app");
  // Ni l'ancienne adresse d'une autre activité, remplacée le 2026-09-11.
  expect(texte).not.toContain("ladamemetallerie");
  // §1 nomme l'éditeur selon le RÉGIME : sans société, il dit ce qu'il est.
  expect(texte).toMatch(/personne physique éditant à titre non professionnel/i);
  expect(texte).not.toContain("[à compléter]");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑧ L'identité de l'éditeur : inachevée et VISIBLE, jamais inventée
// ──────────────────────────────────────────────────────────────────────────
test("⑧ mentions légales, régime « particulier » : aucun trou, et l'hébergeur nommé", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openLegalNotice());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();

  expect(texte).toMatch(/Éditeur du service/i);
  expect(texte).toMatch(/à titre non professionnel/i);
  // ⚠️ L'ANCRE LÉGALE A CHANGÉ. L'art. 6-III de la LCEN, que la première
  // version citait, a été ABROGÉ par la loi n° 2024-449 du 21 mai 2024 : le
  // régime d'anonymat du non-professionnel vit à l'art. 1-1, II. Une mention
  // légale qui cite un article mort est une mention légale fausse.
  expect(texte).toContain("1-1, II");
  expect(texte).not.toMatch(/6-III/);
  // Même chose pour le signalement : l'art. 6-I-5 a été abrogé, c'est le DSA.
  expect(texte).toMatch(/article 16 du règlement/i);
  expect(texte).not.toMatch(/6-I-5/);

  // Dans ce régime, l'adresse de l'HÉBERGEUR est la seule identité publiée :
  // elle doit être COMPLÈTE, pas un nom de marque.
  expect(texte).toContain("Netlify, Inc.");
  expect(texte).toContain("101 2nd Street");
  expect(texte).toContain("San Francisco");
  expect(texte).toContain("passioadmin@gmail.com");

  // ⚠️ LE CŒUR DU CAS : pas de société, donc AUCUN champ manquant à annoncer.
  // Afficher huit « [à compléter] » là où la loi n'exige rien serait une
  // seconde façon de dire faux — l'inverse du défaut que ⑧ corrigeait.
  expect(texte).not.toContain("[à compléter]");
  // Et aucune identité fabriquée n'est revenue par la bande.
  expect(texte).not.toContain("PASSIO SAS");
  expect(texte).not.toContain("contact@passio.app");
});

test("⑧ bis régime « societe » : les huit champs redeviennent exigibles", async ({ page }) => {
  await ouvrirAuth(page);
  // Le jour où une structure existe, une seule ligne bascule — et l'écran doit
  // aussitôt réclamer ce que la loi réclame. Sans ce cas, `regime` pourrait
  // être figé sur "particulier" sans qu'aucun verrou ne s'en aperçoive.
  const texte = await page.evaluate(() => {
    PASSIO_EDITEUR.regime = "societe";
    openLegalNotice();
    return document.querySelector(".modal-backdrop.active .modal").innerText;
  });

  expect(texte).toMatch(/Directeur de la publication/i);
  expect(texte).toMatch(/RCS/);
  expect(texte).toMatch(/SIRET/);
  expect(texte).toMatch(/TVA intracommunautaire/i);
  expect(texte).not.toMatch(/à titre non professionnel/i);

  // Le marqueur suit exactement les champs vides : huit aujourd'hui, zéro le
  // jour où ils seront renseignés — ce cas dira encore la vérité.
  const vides = await page.evaluate(() => ["raisonSociale", "formeJuridique", "capital",
    "siege", "rcs", "siret", "tvaIntra", "directeurPublication"]
    .filter((k) => !PASSIO_EDITEUR[k]).length);
  expect((texte.match(/\[à compléter\]/g) || []).length).toBe(vides);
});

test("⑨ « À propos » lit la même source, il ne redit pas une identité à lui", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openAbout());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();
  expect(texte).not.toContain("PASSIO SAS");
  expect(texte).not.toContain("contact@passio.app");
  expect(texte).toContain("passioadmin@gmail.com");
  // Sans société, la ligne de raison sociale n'existe pas : elle DISPARAÎT au
  // lieu d'annoncer un manque. Un « [à compléter] » sur l'écran « À propos »
  // ferait passer une situation régulière pour un chantier inachevé.
  expect(texte).not.toContain("[à compléter]");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑩ LE CÂBLAGE, PAS LA FONCTION — les deux entrées des Paramètres
//
// ⚠️ Leçon de la fiche 18 : douze cas ouvraient un panneau par
// `page.evaluate(...)`, donc supprimer l'entrée du menu laissait la suite
// VERTE. Ici on ne fait que des GESTES.
// ──────────────────────────────────────────────────────────────────────────
test("⑩ Paramètres → Support ouvre les CGU et les mentions légales, au geste", async ({ page }) => {
  // ⚠️ `errors` est un OBJET à trois seaux (js / console / network), pas un
  // tableau : `bootOnboarded` y pousse directement.
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // ⚠️ DEUX BASCULES SE CROISENT ICI, ET LES ENCHAÎNER À L'AVEUGLE ÉCHOUE.
  // ① Le clic sur un bouton de modale sort de `.dev-panel` : le délégué de
  //    fermeture d'app-02 referme le panneau. ② Mais la section « Support »,
  //    elle, RESTE dépliée — recliquer son en-tête la REPLIE, et le bouton
  //    visé disparaît (mesuré : `locator.click` en timeout de 15 s).
  // On amène donc la section à l'état voulu au lieu de basculer.
  const ouvrirSupport = async (nom) => {
    if (!(await page.locator("#devPanel").evaluate((el) => el.classList.contains("active")))) {
      await page.locator(".hamburger").click();
      await expect(page.locator("#devPanel")).toHaveClass(/active/);
    }
    const bouton = page.getByRole("button", { name: nom });
    if (!(await bouton.isVisible())) {
      await page.locator(".settings-section-header", { hasText: "Support" }).click();
    }
    await expect(bouton).toBeVisible();
    return bouton;
  };

  await (await ouvrirSupport("Conditions générales d'utilisation")).click();
  await expect(page.locator(".modal-backdrop.active .modal-title")).toContainText("Conditions générales");
  await page.evaluate(() => closeModal());

  await (await ouvrirSupport("Mentions légales")).click();
  await expect(page.locator(".modal-backdrop.active .modal-title")).toContainText("Mentions légales");

  expect(errors.js).toEqual([]);
  expect(errors.console).toEqual([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// POLITIQUE DE CONFIDENTIALITÉ ET MESURE D'USAGE  (2026-09-10)
//
// La politique existait « déjà » (en-tête de ce fichier) — mais elle datait de
// juin 2026 et elle était devenue FAUSSE sur deux points qu'un texte RGPD ne
// peut pas se permettre :
//
//   ⑫ Elle décrivait des données que l'app ne collecte plus (« carnets »,
//      retirés par ADR-011) et TAISAIT celles qu'elle collecte : les événements
//      techniques d'usage (`telemetry_events`) et les rapports d'erreur
//      (`client_errors`), qui portent un identifiant d'appareil PERSISTANT
//      (`passio_device_id`), un identifiant de session, la plateforme, le
//      navigateur et la taille d'écran. Elle ne donnait ni base légale, ni
//      responsable de traitement, ni durée pour ces données.
//
//   ⑬ Le refus de cette mesure n'était exerçable QUE par `?telemetry=0` dans
//      l'URL — donc par personne. Une opposition qu'on ne peut pas exercer
//      n'est pas une opposition. Le refus vit maintenant dans
//      Paramètres → Confidentialité, et il porte sur l'APPAREIL (clé
//      `passio_telemetry`, hors `ACCOUNT_SCOPED_KEYS`), jamais sur le compte.
// ═══════════════════════════════════════════════════════════════════════════

test("⑫ la politique de confidentialité dit ce qui est vraiment collecté", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);
  await page.evaluate(() => openPrivacyPolicy());
  await expect(page.locator(".modal-backdrop.active .modal-title")).toContainText("Politique de confidentialité");

  const txt = await page.locator("#modalContent").innerText();

  // La mesure d'usage est DÉCLARÉE, avec ce qui la rend identifiante.
  expect(txt).toMatch(/identifiant d.appareil/i);
  expect(txt).toMatch(/erreur/i);
  // Une base légale est donnée — sans elle, « on collecte » ne dit pas « on a le droit ».
  expect(txt).toMatch(/intérêt légitime/i);
  expect(txt).toMatch(/6\.1\.b|exécution du contrat/i);
  // Un responsable de traitement joignable.
  expect(txt).toContain("passioadmin@gmail.com");
  expect(txt).toMatch(/responsable de ce traitement/i);
  // Les sous-traitants et les transferts hors UE sont nommés.
  expect(txt).toMatch(/Supabase/);
  expect(txt).toMatch(/Netlify/);
  expect(txt).toMatch(/Brevo/);
  expect(txt).toMatch(/clauses contractuelles types/i);
  // Une durée pour les données techniques, et la voie de recours.
  expect(txt).toMatch(/13 mois/);
  expect(txt).toMatch(/CNIL/);
  // Et la porte pour couper la mesure est NOMMÉE dans le texte.
  expect(txt).toMatch(/Param[èe]tres\s*→\s*Confidentialité/i);

  // ⚠️ CIBLE SUPPRIMÉE = TOUT CE QUI LA VISE PART AVEC. Les « carnets » ont été
  // retirés par ADR-011 ; les annoncer comme collectés décrivait un traitement
  // qui n'existe plus. Un texte légal périmé est un texte légal faux.
  expect(txt).not.toMatch(/carnets/i);
  // Et il ne prétend plus dater de juin : la version SUIT le texte.
  expect(txt).not.toMatch(/juin 2026/i);
  const version = await page.evaluate(() => PASSIO_CONFIDENTIALITE_VERSION);
  expect(txt).toContain(version);

  expect(errors.js).toEqual([]);
});

test("⑬ la mesure d'usage se coupe depuis les Paramètres, et ne suit pas le compte", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // Au départ, elle est active (défaut du produit : seul « 0 » coupe).
  expect(await page.evaluate(() => localStorage.getItem("passio_telemetry"))).not.toBe("0");

  await page.evaluate(() => openPrivacySettings());
  const bascule = page.locator("#privTelemetry");
  await expect(bascule).toBeVisible();
  await expect(bascule).toBeChecked();

  // ⚠️ PAR DES GESTES : c'est le CÂBLAGE (l'identifiant lu par
  // `savePrivacySettings`) qui a manqué dans les défauts passés, pas la
  // fonction. Appeler `setEnabled` à la main laisserait la case débranchée.
  await bascule.uncheck();
  await page.getByRole("button", { name: "Sauvegarder" }).click();

  const apres = await page.evaluate(() => ({
    cle: localStorage.getItem("passio_telemetry"),
    // La capture est coupée TOUT DE SUITE : `track()` teste le drapeau à chaque
    // événement, il n'y a rien à recharger.
    capture: (function () { try { return !!(window.PassioTelemetry && PassioTelemetry.setEnabled) ; } catch (e) { return false; } })(),
    // Et le refus n'est PAS parti dans le blob de configuration : ce blob suit
    // le compte d'un appareil à l'autre, alors que le refus est celui de CET
    // appareil.
    dansConfig: JSON.stringify((getCurrentConfig() || {}).privacy || {}),
  }));
  expect(apres.cle).toBe("0");
  expect(apres.capture).toBe(true);
  expect(apres.dansConfig).not.toMatch(/telemetry|telemetrie|mesure/i);

  // Le choix se relit à la réouverture du panneau — sinon il serait perdu au
  // premier retour et la personne le referait sans fin.
  await page.evaluate(() => openPrivacySettings());
  await expect(page.locator("#privTelemetry")).not.toBeChecked();

  expect(errors.js).toEqual([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑭ LE CHEMIN GOOGLE — l'accord donné avant de partir doit revenir
//
// `signInWithOAuth` QUITTE LA PAGE : il n'y a pas d'`options.data` sur ce
// chemin, et tout ce qui vit en mémoire est perdu. L'accord est donc mis de côté
// avant le départ et posé au RETOUR, quand une session existe enfin.
// ═══════════════════════════════════════════════════════════════════════════
test("⑭ Google : l'accord est mis de côté avant le départ, et posé au retour", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();
  await page.locator("#authConsent").click();

  const avant = await page.evaluate(async () => {
    // On empêche la vraie redirection : on veut mesurer ce qui est mémorisé.
    Object.defineProperty(window.supa.auth, "signInWithOAuth", {
      value: async () => ({ error: null }), configurable: true, writable: true,
    });
    await onbGoogleAuth();
    const brut = localStorage.getItem("passio_oauth_cgu");
    return { attente: !!localStorage.getItem("passio_oauth_pending"), accord: brut ? JSON.parse(brut) : null };
  });
  expect(avant.attente).toBe(true);
  expect(avant.accord).not.toBeNull();
  const versionOAuth = await page.evaluate(() => PASSIO_CGU_VERSION);
  expect(avant.accord.cgu_version).toBe(versionOAuth);
  expect(typeof avant.accord.cgu_accepted_at).toBe("string");

  // Au retour, la pose : on lit `{ error }` (le SDK ne lève pas), et on n'écrase
  // JAMAIS un accord déjà présent — une reconnexion ne doit pas réécrire la date
  // du premier consentement, qui est justement ce qui a de la valeur.
  const apres = await page.evaluate(async () => {
    const journal = [];
    Object.defineProperty(window.supa.auth, "getUser", {
      value: async () => ({ data: { user: { user_metadata: {} } } }), configurable: true, writable: true,
    });
    Object.defineProperty(window.supa.auth, "updateUser", {
      value: async (arg) => { journal.push(arg); return { error: null }; }, configurable: true, writable: true,
    });
    const pose = await _poserConsentementOAuth();
    // Et la seconde fois : la clé a été consommée, rien ne repart.
    const seconde = await _poserConsentementOAuth();
    return { pose, seconde, journal, reste: localStorage.getItem("passio_oauth_cgu") };
  });
  expect(apres.pose).toBe(true);
  expect(apres.journal).toHaveLength(1);
  expect(apres.journal[0].data.cgu_version).toBe(versionOAuth);
  // La clé transitoire est consommée : elle ne doit pas traîner sur l'appareil.
  expect(apres.reste).toBeNull();
  expect(apres.seconde).toBe(false);
});

test("⑭ bis un accord DÉJÀ posé sur le compte n'est jamais réécrit", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async () => {
    const journal = [];
    localStorage.setItem("passio_oauth_cgu", JSON.stringify({
      cgu_version: "2026-09-09", cgu_accepted_at: "2026-09-10T10:00:00.000Z",
    }));
    Object.defineProperty(window.supa.auth, "getUser", {
      // Le compte porte déjà une date : c'est ELLE qui fait foi.
      value: async () => ({ data: { user: { user_metadata: { cgu_accepted_at: "2026-09-01T08:00:00.000Z" } } } }),
      configurable: true, writable: true,
    });
    Object.defineProperty(window.supa.auth, "updateUser", {
      value: async (arg) => { journal.push(arg); return { error: null }; }, configurable: true, writable: true,
    });
    const pose = await _poserConsentementOAuth();
    return { pose, journal };
  });
  expect(r.pose).toBe(false);
  expect(r.journal).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑮ LE CÂBLAGE DU RETOUR GOOGLE — et pourquoi ⑭ ne le prouvait PAS
//
// ⚠️ PIÈGE MAISON, ET J'Y SUIS TOMBÉ. ⑭ et ⑭ bis appellent
// `_poserConsentementOAuth()` EN DIRECT : ils mesurent la fonction, jamais son
// branchement. Or le branchement était FAUX. Au retour de Google, le SDK a déjà
// reconstruit la session depuis l'URL quand `boot()` regarde : on entre donc
// dans la branche « session retrouvée », qui se termine par un `return` AVANT
// que `onAuthStateChange` ne soit enregistré (il ne l'est que s'il n'y a AUCUNE
// session). Le seul appel vivait dans ce handler-là : l'accord restait dans
// `localStorage` et n'atteignait jamais le compte, sans qu'un seul cas rougisse.
//
// On mesure donc le câblage À LA SOURCE et sa POSITION — même idiome que
// `nom-utilisateur-inscription` ⑦, pour la même raison : ce chemin de `boot()`
// n'est pas parcouru par un banc local (`_supaReal` y est faux, le SDK vient
// d'un CDN).
// ═══════════════════════════════════════════════════════════════════════════
test("⑮ boot() pose le consentement sur LES DEUX chemins de retour OAuth", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");

  // ① La branche « session retrouvée » — celle que Google emprunte réellement.
  const iConsomme = src.indexOf('if (localStorage.getItem("passio_oauth_pending")) localStorage.removeItem("passio_oauth_pending");');
  expect(iConsomme).toBeGreaterThan(-1);
  const apres = src.slice(iConsomme, iConsomme + 1400);
  expect(apres).toContain("_poserConsentementOAuth");

  // ② Le handler onAuthStateChange — le chemin d'un retour arrivé APRÈS le boot.
  const iHandler = src.indexOf('if (event === "SIGNED_IN" && _oauthEnAttente)');
  expect(iHandler).toBeGreaterThan(-1);
  expect(src.slice(iHandler, iHandler + 1600)).toContain("_poserConsentementOAuth");

  // ⚠️ Et dans le handler, la pose vient AVANT l'adoption : l'adoption RECHARGE
  // la page, donc tout ce qui n'est pas fait avant ne sera jamais fait.
  const iPose = src.indexOf("_poserConsentementOAuth", iHandler);
  const iAdoption = src.indexOf("adopterCompteConnecte(_uidSession)", iHandler);
  expect(iAdoption).toBeGreaterThan(-1);
  expect(iPose).toBeLessThan(iAdoption);

  // Les DEUX appels existent : il y en a au moins deux dans le fichier.
  expect(src.split("_poserConsentementOAuth").length - 1).toBeGreaterThanOrEqual(2);
});

// ⑯ La modale de suppression de compte affichait l'adresse EN DUR, à côté de la
// source unique PASSIO_EDITEUR : le 2026-09-11, quand l'adresse de contact a
// changé, elle serait restée sur l'ancienne sans ce verrou. Elle lit désormais
// la même source que les CGU, les mentions légales et la politique.
test("⑯ la suppression de compte lit la même adresse que les textes légaux", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openDeleteAccountConfirm());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();
  const attendu = await page.evaluate(() => PASSIO_EDITEUR.email);
  expect(attendu).toBe("passioadmin@gmail.com");
  expect(texte).toContain(attendu);
  expect(texte).not.toContain("ladamemetallerie");
  expect(texte).not.toContain("contact@passio.app");
});
