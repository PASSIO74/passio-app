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

  // Mon PROPRE profil ne passe PAS par `avatarBg` : il pose `backgroundImage` en
  // direct. C'est exactement le genre de chemin qu'un correctif posé « au seul
  // point d'entrée » laisse derrière lui.
  const app06 = lire("app-06-reels-partage.js");
  expect(app06).toContain("passioThumb(g.avatarPhoto, 352)");
  expect(app06).toContain("passioThumb(g.coverPhoto, 880)");
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
  expect(html.toLowerCase(), "le repli cite encore le Carnet de voyage (retiré par ADR-011 §6)")
    .not.toContain("carnet");
  sansErreurJs(err);
});
