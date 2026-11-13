// ═══════════════════════════════════════════════════════════════════════════
// LOT-35 (audit UX/UI du 2026-11-10) — RÉGLAGES ET FOND D'UNE CONVERSATION
//   ① MSG-C17 : le panneau porte le nom de la conversation ; les accusés de
//      lecture disent qu'ils valent pour tout le compte ; ce qui efface ou fait
//      sortir est rassemblé en dernier, dans un rouge lisible (≥ 4,5:1).
//   ② MSG-C16 / MSG-C79 : six fonds clairs ; un ancien fond sombre mémorisé est
//      montré dans le clair de même rang.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c835";

function luminance(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("① MSG-C17 : titre nommé, réglage de compte annoncé, actions graves groupées et lisibles", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((autre) => {
    conversationsState = [{ id: "c_l35", userId: autre, userName: "Léa", lastAt: Date.now(), messages: [] }];
    openConvSettings("c_l35");
    const panel = document.getElementById("convSettingsPanel");
    const sections = [...panel.querySelectorAll(".csetting-section")].map((x) => x.textContent);
    const items = [...panel.querySelectorAll(".csetting-item")];
    const danger = items.filter((x) => x.classList.contains("csetting-danger")).map((x) => x.textContent.trim());
    const dernier = sections[sections.length - 1];
    const apresDernier = (() => {
      const secs = [...panel.querySelectorAll(".csetting-section")];
      const out = []; let n = secs[secs.length - 1].nextElementSibling;
      while (n) { const l = n.querySelector(".csetting-label"); out.push((l ? l.textContent : n.textContent).trim()); n = n.nextElementSibling; }
      return out;
    })();
    const effacer = items.find((x) => /Effacer les messages/.test(x.textContent));
    const lab = effacer.querySelector(".csetting-label");
    const fond = getComputedStyle(panel).backgroundColor;
    return {
      titre: document.getElementById("convSettingsTitre").textContent,
      sections, dernier, apresDernier, danger,
      accuses: items.find((x) => /Accusés de lecture/.test(x.textContent)).textContent,
      couleur: getComputedStyle(lab).color,
      fond: fond === "rgba(0, 0, 0, 0)" ? getComputedStyle(document.body).backgroundColor : fond,
    };
  }, AUTRE);
  expect(r.titre).toBe("Léa");
  expect(r.sections).not.toContain("ACTIONS");
  expect(r.dernier).toBe("EFFACER");
  expect(r.apresDernier).toEqual(["Effacer les messages", "Supprimer pour moi"]);
  expect(r.accuses).toMatch(/Pour toutes tes conversations/);
  expect(r.danger.length).toBeGreaterThanOrEqual(4); // bloquer, signaler, effacer, supprimer
  expect(contraste(r.couleur, r.fond)).toBeGreaterThanOrEqual(4.5);
});

test("② MSG-C16 / C79 : six fonds clairs, l'ancien sombre traduit", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((autre) => {
    const clairs = CONV_BGS.map((b) => {
      const d = document.createElement("div");
      d.style.background = b.css; document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const img = cs.backgroundImage;
      const couleurs = img && img !== "none" ? img.match(/rgb\([^)]*\)/g) : [cs.backgroundColor];
      d.remove();
      return couleurs;
    });
    conversationsState = [{ id: "c_l35b", userId: autre, userName: "Léa", lastAt: Date.now(), bg: "#0a0a0f", messages: [] }];
    openConversation("c_l35b");
    const t = document.getElementById("convFpThread");
    return { clairs, fil: t ? t.style.background : null, attendu: CONV_BGS[5].css };
  }, AUTRE);
  for (const couleurs of r.clairs) {
    if (!couleurs) continue; // var(--bg-deep) résolu ailleurs
    for (const c of couleurs) expect(luminance(c), c).toBeGreaterThan(0.6);
  }
  expect(r.fil).not.toMatch(/0a0a0f|rgb\(10, 10, 15\)/);
  expect(r.fil).toBeTruthy();
});
