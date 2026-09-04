// LA BIOGRAPHIE EST MULTILIGNE — ce qui est écrit sur trois lignes s'affiche sur
// trois lignes (2026-09-03).
//
// Benjamin, capture à l'appui, après essai réel sur son appareil : « dans
// l'édition de la biographie fais attention à bien respecter les textes et
// lignes que j'écris, j'ai écrit sur 3 lignes et tu as fait apparaître mes
// textes sur une ligne, je dois pouvoir éditer comme j'ai envie. »
//
// ⚠️ LE DÉFAUT N'ÉTAIT PAS DANS LA DONNÉE, IL ÉTAIT DANS L'AFFICHAGE — et c'est
// ce qui le rendait invisible à toute vérification portant sur l'état. Le champ
// d'édition est un <textarea> : les `\n` étaient bel et bien saisis, enregistrés,
// synchronisés, et RELUS intacts à la réouverture de la modale (la seconde
// capture le montre : trois lignes dans le champ). Seule la restitution les
// perdait — `#mainProfileBio` n'a jamais porté de `white-space`, donc le moteur
// repliait chaque saut de ligne en un simple espace. Un test qui ne mesure que
// `state.user.general.bio` reste VERT sur le défaut : c'est pourquoi les cas ①
// et ② ci-dessous mesurent des PIXELS et le style calculé, pas la chaîne.
//
// ⚠️ ET IL FRAPPAIT LES DEUX SURFACES QUI PORTENT LA CLASSE : son propre profil
// (`#mainProfileBio`, écrit en `textContent` par `renderMainProfile`) et le
// profil VISITÉ (`openUserProfile`, app-04, injecté en HTML échappé). Le
// correctif est un seul bloc CSS, donc le cas ③ vérifie qu'une bio d'autrui en
// bénéficie AUSSI — et qu'elle reste échappée en passant.
//
// ⚠️ `pre-line` ET PAS `pre` : les sauts de ligne écrits sont préservés, mais une
// ligne longue continue de se replier dans la largeur de la carte. `pre`
// laisserait une bio d'un seul tenant déborder hors de l'écran, sans coupure.
// Cas ⑤.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const BIO_3_LIGNES = "Ndbfbjf\nBdbdbd\nBdbdbbd";

async function poser(page, bio = BIO_3_LIGNES) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((b) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaSavePublicProfile = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaUsernameTaken = async () => null;

    state.user.general = { username: "Ben sur portable test", bio: b };
    state.user.name = "Ben sur portable test";
    state.userPosts = [];
    saveState();
    goTo("profiles");
    renderMainProfile();
  }, bio);
  await page.waitForTimeout(500);
}

// Hauteur rendue de la bio + son style calculé. On mesure la BOÎTE, jamais la
// chaîne : c'est la seule chose que le défaut changeait.
function mesurerBio(page) {
  return page.evaluate(() => {
    const el = document.getElementById("mainProfileBio");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      texte: el.textContent,
      hauteur: el.getBoundingClientRect().height,
      largeur: el.getBoundingClientRect().width,
      whiteSpace: cs.whiteSpace,
      lineHeight: parseFloat(cs.lineHeight),
      visible: !!el.offsetParent,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ① TROIS LIGNES ÉCRITES = TROIS LIGNES AFFICHÉES
// ══════════════════════════════════════════════════════════════════════════

test("① une bio de trois lignes occupe bien trois lignes à l'écran", async ({ page }) => {
  await poser(page);
  const m = await mesurerBio(page);
  expect(m, "la bio est rendue").not.toBeNull();
  expect(m.visible, "et visible").toBe(true);
  // Trois mots courts : sans le correctif ils tiennent LARGEMENT sur une ligne
  // (c'est exactement la capture de Benjamin). La hauteur est donc le
  // discriminant : ~3 interlignes au lieu d'un seul.
  expect(m.hauteur, "hauteur d'au moins trois interlignes")
    .toBeGreaterThanOrEqual(m.lineHeight * 2.5);
  expect(m.hauteur, "et pas davantage — aucune ligne fantôme")
    .toBeLessThan(m.lineHeight * 4);
});

test("① bis — la même bio écrite d'un trait tient sur UNE ligne", async ({ page }) => {
  // Le contre-exemple, sans lequel ① mesurerait n'importe quoi : mêmes mots,
  // mêmes caractères, séparés par des espaces au lieu de sauts de ligne. Si la
  // hauteur ne changeait pas entre les deux, c'est que ce n'est pas le saut de
  // ligne qui est honoré, mais le hasard de la largeur.
  await poser(page, "Ndbfbjf Bdbdbd Bdbdbbd");
  const m = await mesurerBio(page);
  expect(m.hauteur, "une seule ligne").toBeLessThan(m.lineHeight * 1.8);
});

test("② le style calculé préserve les sauts de ligne", async ({ page }) => {
  await poser(page);
  const m = await mesurerBio(page);
  // La cause racine, nommée. `normal` (le défaut du moteur) EST le défaut.
  expect(["pre-line", "pre-wrap"], "white-space qui garde les \\n")
    .toContain(m.whiteSpace);
  expect(m.texte, "et le texte porte toujours ses sauts de ligne").toContain("\n");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LE PROFIL VISITÉ PORTE LA MÊME CLASSE, DONC LE MÊME CORRECTIF
// ══════════════════════════════════════════════════════════════════════════

test("③ la bio d'un profil visité respecte aussi les lignes, et reste échappée", async ({ page }) => {
  await poser(page);
  const vu = await page.evaluate(() => {
    // Reproduction fidèle de ce qu'injecte `openUserProfile` (app-04) : la
    // classe .main-profile-bio, remplie en HTML ÉCHAPPÉ.
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:0;top:0;width:320px;";
    box.innerHTML = '<div class="main-profile-bio">' +
      escapeHtml("Une\n<img src=x onerror=alert(1)>\nTrois") + "</div>";
    document.body.appendChild(box);
    const el = box.querySelector(".main-profile-bio");
    const cs = getComputedStyle(el);
    const r = {
      whiteSpace: cs.whiteSpace,
      hauteur: el.getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight),
      balisesInjectees: el.querySelectorAll("img").length,
      texte: el.textContent,
    };
    box.remove();
    return r;
  });
  expect(["pre-line", "pre-wrap"]).toContain(vu.whiteSpace);
  expect(vu.hauteur, "trois lignes chez l'autre aussi")
    .toBeGreaterThanOrEqual(vu.lineHeight * 2.5);
  // Le correctif est purement visuel : il ne relâche RIEN sur le contenu d'autrui.
  expect(vu.balisesInjectees, "aucune balise injectée par une bio d'autrui").toBe(0);
  expect(vu.texte, "le balisage reste du texte inerte").toContain("<img");
});

// ══════════════════════════════════════════════════════════════════════════
// ④ L'ALLER-RETOUR PAR L'ÉDITEUR NE MANGE PAS LES LIGNES
// ══════════════════════════════════════════════════════════════════════════

test("④ enregistrer depuis la modale conserve les trois lignes", async ({ page }) => {
  await poser(page, "");
  const apres = await page.evaluate(async () => {
    openEditMainProfile();
    const ta = document.getElementById("editBio");
    ta.value = "Ligne un\nLigne deux\nLigne trois";
    await saveMainProfile();
    return {
      enregistre: state.user.general.bio,
      affiche: document.getElementById("mainProfileBio").textContent,
    };
  });
  expect(apres.enregistre, "les sauts de ligne survivent à l'enregistrement")
    .toBe("Ligne un\nLigne deux\nLigne trois");
  expect(apres.affiche).toBe("Ligne un\nLigne deux\nLigne trois");
});

test("④ bis — rouvrir l'éditeur rend le champ tel qu'il a été écrit", async ({ page }) => {
  // Un `\n` en TÊTE serait avalé par l'analyseur HTML (`<textarea>` mange son
  // premier saut de ligne) : la normalisation à l'enregistrement le retire donc
  // AVANT, pour que le champ relu soit exactement le champ écrit.
  await poser(page, "");
  const relu = await page.evaluate(async () => {
    openEditMainProfile();
    document.getElementById("editBio").value = "\n\nAlpha\nBravo\n";
    await saveMainProfile();
    openEditMainProfile();
    return {
      champ: document.getElementById("editBio").value,
      compteur: document.getElementById("bioCount").textContent,
    };
  });
  expect(relu.champ, "ni ligne vide en tête, ni saut en queue").toBe("Alpha\nBravo");
  expect(relu.compteur, "le compteur suit la valeur normalisée").toBe("11/200");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ CE QUE LA NORMALISATION FAIT — ET CE QU'ELLE NE FAIT PAS
// ══════════════════════════════════════════════════════════════════════════

test("⑤ le normaliseur garde la mise en forme et borne les abus", async ({ page }) => {
  await poser(page);
  const r = await page.evaluate(() => ({
    crlf: normaliserTexteMultiligne("Un\r\nDeux\rTrois"),
    ligneVideGardee: normaliserTexteMultiligne("Un\n\nDeux"),
    videsBornees: normaliserTexteMultiligne("Un\n\n\n\n\n\nDeux"),
    espacesEnFin: normaliserTexteMultiligne("Un   \nDeux\t\nTrois"),
    bouts: normaliserTexteMultiligne("   \n Un \n  "),
    vide: normaliserTexteMultiligne(null),
  }));
  expect(r.crlf, "CRLF et CR ramenés à LF").toBe("Un\nDeux\nTrois");
  expect(r.ligneVideGardee, "une ligne vide est de la mise en forme, on la garde")
    .toBe("Un\n\nDeux");
  expect(r.videsBornees, "au-delà, on borne à une ligne vide").toBe("Un\n\nDeux");
  expect(r.espacesEnFin, "espaces invisibles en fin de ligne retirés")
    .toBe("Un\nDeux\nTrois");
  expect(r.bouts, "et les bouts sont taillés comme avant").toBe("Un");
  expect(r.vide, "null ne casse rien").toBe("");
});

test("⑤ bis — une ligne longue se replie encore (pre-line, pas pre)", async ({ page }) => {
  // `pre` aurait aussi « respecté les lignes »… en laissant une bio d'un seul
  // tenant déborder hors de la carte, sans coupure ni retour.
  await poser(page, "a".repeat(60) + " " + "b".repeat(60) + " " + "c".repeat(60));
  const m = await mesurerBio(page);
  const parent = await page.evaluate(() =>
    document.getElementById("mainProfileBio").parentElement.getBoundingClientRect().width);
  expect(m.hauteur, "la ligne longue est repliée sur plusieurs lignes")
    .toBeGreaterThan(m.lineHeight * 1.8);
  expect(m.largeur, "et rien ne déborde de la carte")
    .toBeLessThanOrEqual(parent + 1);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LA BIO VIDE NE LAISSE PAS UNE BOÎTE FANTÔME
// ══════════════════════════════════════════════════════════════════════════

test("⑥ sans bio, rien ne s'affiche (le correctif n'ajoute pas de vide)", async ({ page }) => {
  await poser(page, "");
  const m = await mesurerBio(page);
  expect(m.visible, "aucune bio, aucune boîte").toBe(false);
});
