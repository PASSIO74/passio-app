// ═══════════════════════════════════════════════════════════════════════════
// SOCLE — balayage uniforme des six écrans principaux
//
// Les mêmes six écrans, au même état (compte connecté fictif + socle de données),
// sur six gabarits Chromium (320 → 1440) puis sous WebKit (gabarit iPhone 13).
// But : une base de mesure COMPARABLE d'un écran à l'autre (cibles 44 px, champs
// 16 px, contrastes AA, débordements) et un regard sur le cadrage tablette /
// ordinateur. Les constats sont portés par les domaines ; ce balayage les étaie.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("../jeu/base");

const ECRANS = [
  ["feed", "Fil (Découvrir)"],
  ["irl", "Rencontrer"],
  ["explore", "Rechercher"],
  ["messages", "Messages"],
  ["profiles", "Profil"],
  ["studio", "Créer (Studio)"],
];

async function balayer({ page, prendre }, decalage) {
  let i = 0;
  for (const [ecran, nom] of ECRANS) {
    i++;
    await page.evaluate((e) => goTo(e), ecran);
    await page.waitForTimeout(1400);
    const spec = { id: "SOC-" + String(decalage + i).padStart(3, "0"), titre: nom + " — écran principal, haut de page" };
    if (ecran === "feed" && decalage === 0) Object.assign(spec, {
      zooms: [{ nom: "barre", titre: "Barre supérieure", sel: ".app-topbar", marge: 0 }],
      annotationsAvant: [
        { n: 1, sel: ".topbar-right .topbar-bell", texte: "Explorer : 40 × 44 px, collé à Notifications (41 × 44 px)." },
        { n: 2, sel: ".topbar-left", texte: "Zone « Mon profil » : 36 px de haut." },
      ],
      apres: {
        css: "@media (max-width:340px){.app-topbar .beta-chip{display:none !important}}.topbar-right{gap:4px !important}.topbar-right .topbar-bell,.topbar-right .hamburger{min-width:44px !important;min-height:44px !important;width:44px !important;height:44px !important}.topbar-left{min-height:44px !important}",
        zooms: [{ nom: "barre", titre: "Barre supérieure", sel: ".app-topbar", marge: 0 }],
      },
      annotations: [
        { n: 1, sel: ".topbar-right .topbar-bell", texte: "Chaque icône a une zone de 44 × 44 px, séparée de sa voisine." },
        { n: 2, sel: ".topbar-left", texte: "Zone « Mon profil » portée à 44 px de haut ; sous 340 px, le badge « Beta » s’efface pour laisser la place." },
      ],
    });
    await prendre(spec);
  }
}

module.exports = {
  domaine: "socle",
  scenarios: [
    {
      nom: "ecrans-principaux",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390", "m360", "m320", "m430", "t768", "d1440"],
      derouler: (ctx) => balayer(ctx, 0),
    },
    {
      nom: "ecrans-principaux-webkit",
      demarrage: { mode: "compte", moteur: "webkit", peupler: (srv, ctx) => base.peupler(srv, ctx) },
      vues: ["m390"],
      derouler: (ctx) => balayer(ctx, 10),
    },
    {
      // Mouvement réduit demandé par le système : que reste-t-il d'animé ?
      nom: "mouvement-reduit",
      demarrage: { mode: "compte", peupler: (srv, ctx) => base.peupler(srv, ctx), contexte: { reducedMotion: "reduce" } },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(800);
        await prendre({ id: "SOC-021", titre: "Fil — préférence système « mouvement réduit » active" });
      },
    },
  ],
};
