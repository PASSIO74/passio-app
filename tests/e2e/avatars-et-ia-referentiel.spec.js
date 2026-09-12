// ══════════════════════════════════════════════════════════════════════════
// DEUX POINTS OUVERTS REFERMÉS LE MÊME JOUR (2026-09-12)
// ──────────────────────────────────────────────────────────────────────────
// ① LES AVATARS ÉTAIENT SERVIS EN PLEINE RÉSOLUTION. `passioThumb` existe
//    depuis le lot CDN et n'avait que TROIS appelants, tous sur des images de
//    PUBLICATION : aucun avatar n'y passait. Un avatar de 2,59 Mo téléchargé
//    pour un rond de 40 px, à chaque utilisateur et à chaque chargement.
//    ⚠️ Le correctif vit dans `avatarBg` (app-02), qui a TRENTE-NEUF appelants :
//    les rattraper un par un aurait laissé le prochain l'oublier — faute déjà
//    commise par `passioThumb` lui-même, qui n'est jamais venu jusqu'ici.
//
// ② LE MOTEUR IA LOCAL NE CONNAISSAIT QUE 19 PASSIONS SUR 5 001. Dernier de la
//    famille corrigée le même jour sur trois autres surfaces (« taper Ski ne
//    rend rien »). Ses cartes sont CLIQUABLES : c'est une surface de découverte
//    qui menait à un cul-de-sac sur tout ce qui n'est pas dans le socle.
//
// ⚠️ LA PASSION D'ESSAI DOIT ÊTRE HORS SOCLE, et le cas ⓪ le VÉRIFIE au lieu de
// l'espérer : c'est ce qui a fait tomber six cas de `creation-passion` quand
// « sculpture sur glace » est entrée au référentiel à la vague 3.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

// ⚠️ Constantes côté NODE : chaque `page.evaluate` doit les recevoir en
// ARGUMENT, sinon `ReferenceError` dans la page.
const ID_HORS_SOCLE = "glisse-ski-alpin";
const MOT_HORS_SOCLE = "Ski alpin";
const PHOTO = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/a/avatar.jpg";

const lire = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "js", f), "utf8");

// ⚠️ `bootOnboarded` attend un OBJET à trois bacs, pas un tableau : lui passer
// `[]` fait lever « Cannot read properties of undefined (reading 'push') » DANS
// l'écouteur de console, et l'échec se lit alors comme un `page.goto` qui
// n'aboutit pas — on accuse le produit pour une faute du banc.
const bacs = () => ({ js: [], network: [], console: [] });
const sansErreurJs = (err) =>
  expect(err.js, "erreur JS au démarrage : " + err.js.join(" | ")).toEqual([]);

test("⓪ prémisse : la passion d'essai est bien ABSENTE du socle embarqué", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  const dansLeSocle = await page.evaluate((id) => {
    const socle = (typeof allPassions === "function" ? allPassions() : []) || [];
    return socle.some((p) => p && p.id === id);
  }, ID_HORS_SOCLE);
  expect(dansLeSocle,
    ID_HORS_SOCLE + " est entrée dans le socle : choisir un autre identifiant d'essai").toBe(false);
  sansErreurJs(err);
});

test("① un avatar photo est demandé en MINIATURE, pas en pleine résolution", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  const bg = await page.evaluate((url) => avatarBg({ photoUrl: url, color: "#7c3aed" }), PHOTO);
  expect(bg, "l'avatar part encore en pleine résolution").toContain("width=");
  expect(bg).toContain("render/image/public");
  sansErreurJs(err);
});

test("② la couleur reste SOUS la photo — un avatar cassé n'est pas un rond vide", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  const bg = await page.evaluate((url) => avatarBg({ photoUrl: url, color: "#7c3aed" }), PHOTO);
  // Un `background` n'a AUCUN `onerror` : sans cette couche, une image en échec
  // ne laissait rien — ni couleur, ni emoji (`avatarInner` rend "" dès qu'une
  // photo existe). Un rond vide, sans une erreur.
  expect(bg, "la couleur de repli a disparu de la déclaration").toContain("#7c3aed");
  expect(bg.indexOf("url("), "la couleur doit être la couche du DESSOUS")
    .toBeLessThan(bg.indexOf("#7c3aed"));
  sansErreurJs(err);
});

test("③ une URL que la transformation ne sait pas traiter passe INTACTE", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  // L'aperçu d'un recadrage tout juste terminé est une `data:` URL : la casser
  // ferait disparaître sa propre photo à la personne qui vient de la choisir.
  const intacte = await page.evaluate(() =>
    avatarBg({ photoUrl: "data:image/png;base64,iVBORw0KGgo=", color: "#7c3aed" }).indexOf("width=") === -1);
  expect(intacte, "une data: URL a été « transformée », donc cassée").toBe(true);
  sansErreurJs(err);
});

test("④ SOURCE : avatars et couvertures demandent tous une taille", () => {
  expect(lire("app-02-state-utils.js"), "avatarBg n'appelle plus passioThumb")
    .toMatch(/function avatarBg\(u, largeur\)[\s\S]{0,900}passioThumb\(ph, largeur \|\| 192\)/);

  // ⚠️ Le grand avatar (116 px) doit demander SA taille : le défaut de 192 px y
  // serait flou sur un écran à 3×. Mesuré à la source — le rendu ne le dit pas.
  expect(lire("app-04-comments-shop.js")).toContain("avatarBg(user, 352)");

  // ⚠️ NEUF SURFACES NE PASSENT PAS PAR `avatarBg` et auraient survécu à un
  // correctif posé « au seul point d'entrée ». Elles sont nommées ici une par
  // une : c'est la seule façon qu'une dixième, ajoutée demain, se remarque.
  const app06 = lire("app-06-reels-partage.js");
  expect(app06).toContain("passioThumb(g.avatarPhoto, 352)");   // mon avatar
  expect(app06).toContain("passioThumb(g.coverPhoto, 880)");    // ma couverture
  expect(app06).toContain("passioThumb(_pPhoto, 192)");         // photo de passion
  expect(app06).toContain("passioThumb(photo, 192)");           // passion, 56 px
  expect(app06).toContain("passioThumb(cover, 880)");           // couverture de passion

  const app04 = lire("app-04-comments-shop.js");
  expect(app04).toContain("passioThumb(c.groupPhoto, 192)");    // groupes : Messages
  expect(lire("app-05-config-profil.js")).toContain("passioThumb(c.groupPhoto, 192)");
  expect(lire("app-02-state-utils.js")).toContain("passioThumb(o.photoUrl, 192)");

  // ⚠️ `avatarBg` émet ses PROPRES apostrophes (`url('…')`) : un attribut style
  // délimité par des apostrophes se refermait dessus, balise cassée dès qu'un
  // compte de la liste « démarrer une conversation » portait une photo.
  expect(app04, "l'attribut style est redevenu apostrophé autour d'avatarBg")
    .not.toMatch(/style='[^']*background:" \+ avatarBg/);
});

test("⑤ SOURCE : le moteur IA est asynchrone ET son unique appelant l'attend", () => {
  expect(lire("app-06-reels-partage.js"), "aiGenerateResponse n'est plus asynchrone")
    .toContain("async function aiGenerateResponse(query)");
  // ⚠️ Sans le `.then`, `_aiRenderResult` recevrait la PROMESSE et peindrait
  // « [object Promise] » — un défaut qui s'affiche en toutes lettres et qu'aucune
  // gate statique ne voit. C'est le CÂBLAGE qu'on mesure, pas la fonction.
  expect(lire("app-07-ia-explore-irl.js"), "l'appelant ne l'attend pas")
    .toMatch(/aiGenerateResponse\(query\)\.then\(/);
});

test("⑥ le moteur IA trouve une passion HORS socle", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  const html = await page.evaluate(async (mot) => await aiGenerateResponse(mot), MOT_HORS_SOCLE);
  expect(html, "« " + MOT_HORS_SOCLE + " » reste introuvable pour le moteur local")
    .toContain("Passions trouvées");
  sansErreurJs(err);
});

test("⑦ le repli ne propose plus une fonctionnalité RETIRÉE", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  // Une chaîne que personne n'écrira jamais : on veut la branche de repli.
  const html = await page.evaluate(async () => await aiGenerateResponse("zzqxw plopfimbul"));
  // ⚠️ MARQUEUR POSITIF D'ABORD : sans lui, le jour où `chercherAsync` rendrait
  // le moindre résultat pour cette chaîne, la fonction peindrait « 🎯 Passions
  // trouvées » — qui ne contient pas « carnet » non plus — et ce cas resterait
  // VERT sans avoir jamais exercé le repli qu'il prétend mesurer.
  expect(html, "ce cas n'a pas atteint la branche de repli").toContain("pas de réponse précise");
  expect(html.toLowerCase(), "le repli cite encore le Carnet de voyage (retiré par ADR-011 §6)")
    .not.toContain("carnet");
  sansErreurJs(err);
});

// ⚠️ RETIRER LE TEXTE DE REPLI NE SUFFISAIT PAS : LA PORTE ÉTAIT AU-DESSUS.
// `aiDetectIntent` routait `voyage|carnet|live|cdv` vers une branche « 📔 Carnets
// de Voyage » renvoyant à un onglet retiré par ADR-011 §6 — et `index.html` livre
// un raccourci « ✈️ Voyage » qui pose très exactement cette question. Ces
// requêtes n'atteignaient donc JAMAIS le référentiel non plus.
test("⑧ le raccourci « Voyage » ne mène plus à une fonctionnalité retirée", async ({ page }) => {
  const err = bacs();
  await bootOnboarded(page, err);
  const html = await page.evaluate(async () => await aiGenerateResponse("Conseils voyage et aventure"));
  expect(html, "la branche « Carnets de Voyage » répond encore").not.toContain("Carnets de Voyage");
  expect(html.toLowerCase()).not.toContain("cdv live");
  sansErreurJs(err);
});

test("⑨ SOURCE : ni intention ni branche « cdv » ne subsistent", () => {
  const app06 = lire("app-06-reels-partage.js");
  expect(app06, "l'intention cdv est revenue").not.toMatch(/return "cdv";/);
  expect(app06, "la branche cdv est revenue").not.toMatch(/intent === "cdv"/);
  // ⚠️ Le geste manquant du lot précédent : on LOGUE avant de replier, sinon une
  // erreur avalée ici rend le symptôme du défaut qu'on vient de fermer.
  expect(app06, "le repli du référentiel ne laisse aucune trace pour la Sentinelle")
    .toMatch(/diagLog\("ia referentiel echec/);
  // Un drapeau qui ne sait qu'ENLEVER doit enlever ici aussi.
  expect(app06, "la coupure flat_passions_v1 ne coupe pas cette surface")
    .toMatch(/moteur\.actif !== "function" \|\| moteur\.actif\(\)/);
});
