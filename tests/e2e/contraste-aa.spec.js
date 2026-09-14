// DEV-03 (contre-revue Astra, 2026-09-14) — deux textes sous le seuil AA de
// 4,5:1, mesurés par la matrice d'accessibilité de l'audit :
//   · la porte « Ajouter une passion » (titre en état plein, et son mot à
//     12 px) : --muted (#6e6987) sur le lavis --bg-tint (rgb 239,233,253) = 4,40:1 ;
//   · le bouton « Compris » des aides : blanc sur un voile blanc à 22 % par-dessus
//     le violet = 3,8–4,1:1.
// Ce verrou MESURE le contraste rendu (couleur calculée du texte contre le
// premier fond opaque composé), il ne lit pas une constante : la règle de la
// maison est que le contrôle remonte au premier fond opaque et ignore l'alpha
// — ici on compose l'alpha exprès, parce que c'est le voile qui fait le fond.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=flat-passions-v1";
const DISPO = ["voyage", "cuisine", "photo"];

// Contraste WCAG entre la couleur de texte d'un élément et son fond composé
// (on remonte les ancêtres en composant chaque fond semi-transparent sur le
// suivant, jusqu'au premier opaque).
const CONTRASTE = `(el) => {
  const rgba = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s); if (!m) return null; const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const couches = []; let n = el;
  while (n && n !== document.documentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { couches.unshift(c); if (c.a >= 1) break; } n = n.parentElement; }
  let fond = { r: 255, g: 255, b: 255 };
  for (const c of couches) fond = { r: c.r * c.a + fond.r * (1 - c.a), g: c.g * c.a + fond.g * (1 - c.a), b: c.b * c.a + fond.b * (1 - c.a) };
  const texte = rgba(getComputedStyle(el).color);
  const a = lum(texte), b = lum(fond);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}`;

test.describe("contraste AA — les deux textes que l'audit a mesurés sous 4,5:1", () => {
  test("① la porte « Ajouter une passion » : mot et titre en état plein ≥ 4,5:1 sur le lavis", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: APERCU });
    await page.evaluate((dispo) => {
      window.supaSaveUserState = async () => {}; window.supaSavePassionState = async () => {}; window.supaUpsertProfile = async () => {};
      state.user.profiles = dispo.map((p, i) => ({ id: "mp_" + i, name: "QA", passion: p, emoji: "✨", bio: "", color: "#8b5cf6", createdAt: i + 1 }));
      state.user.currentProfileId = "mp_0";
      state.userPosts = []; saveState(); goTo("profiles");
    }, DISPO);
    await page.waitForTimeout(400);
    await page.evaluate(() => openPassionManager());
    await page.waitForTimeout(450);
    const r = await page.evaluate(`(() => {
      const f = ${CONTRASTE};
      const porte = document.querySelector(".passion-manager-porte");
      return { plein: porte && porte.classList.contains("is-plein"),
        titre: f(document.getElementById("nouveauProfilTitre")), mot: f(document.getElementById("nouveauProfilSous")) };
    })()`);
    expect(r.plein).toBe(true);   // prémisse : trois passions = porte pleine, c'est l'état mesuré par l'audit
    expect(r.titre).toBeGreaterThanOrEqual(4.5);
    expect(r.mot).toBeGreaterThanOrEqual(4.5);
  });

  test("② le bouton « Compris » d'une aide ≥ 4,5:1 sur son voile", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(`(() => {
      const f = ${CONTRASTE};
      // Une aide rendue directement, ancrée sur un nœud visible : c'est le rendu
      // qu'on mesure, pas la décision de la montrer.
      const ancre = document.querySelector("#feedList .post .post-author") || document.body;
      montrerHint("feed_auteur", ancre);
      const b = document.querySelector(".passio-hint-ok");
      return b ? f(b) : null;
    })()`);
    expect(r).not.toBeNull();
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
});
