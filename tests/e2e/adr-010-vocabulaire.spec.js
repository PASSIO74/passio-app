// ADR-010 — garde-fou de VOCABULAIRE.
//
// Ce test empêche le retour des formulations qui décrivent une passion comme une
// identité sociale séparée. Il ne lit pas l'écran : il lit les SOURCES servies au
// navigateur, parce qu'une formulation peut revenir dans une surface qu'aucun
// test de rendu n'ouvre (le tour d'accueil, la landing, un état vide rare) —
// c'est précisément ce qui s'était produit avant ce lot.
//
// ⚠️ Il vise le texte VISIBLE, pas les commentaires : ceux-ci racontent
// légitimement l'histoire du défaut corrigé. Les lignes commençant par `//` ou
// `*`, et les blocs `/* … */`, sont donc retirés avant l'analyse.
const { test, expect } = require("@playwright/test");

const FICHIERS = [
  "/index.html",
  "/js/app-01-diag-seed.js", "/js/app-02-state-utils.js", "/js/app-03-posts-vlogs.js",
  "/js/app-04-comments-shop.js", "/js/app-05-config-profil.js", "/js/app-06-reels-partage.js",
  "/js/app-07-ia-explore-irl.js", "/js/app-08-ui-modals-tour.js", "/js/app-09-boot-pwa.js",
  "/js/ui-v6-composer.js", "/js/ui-v6b-profil.js", "/js/ui-v7-lot.js",
];

// Formulations interdites. Chacune a été RETIRÉE par ADR-010 ; leur retour
// signifierait que le modèle « une identité, des passions » n'est plus tenu.
const INTERDITS = [
  { motif: "profils passion",       pourquoi: "une passion n'est pas un profil" },
  { motif: "profil passion",        pourquoi: "une passion n'est pas un profil" },
  { motif: "Multi-profils",         pourquoi: "il n'y a qu'un profil par compte" },
  { motif: "fil passion",           pourquoi: "troisième vocabulaire pour le même objet" },
  { motif: "univers de contenu",    pourquoi: "quatrième vocabulaire pour le même objet" },
  { motif: "Plusieurs profils",     pourquoi: "il n'y a qu'un profil par compte" },
  { motif: "chaque passion son profil", pourquoi: "formulation du tour d'accueil, contraire à ADR-010" },
  { motif: "plusieurs profils par passion", pourquoi: "formulation de l'onboarding" },
  { motif: "Passion active",        pourquoi: "vocabulaire d'identité ; l'écriture se dit « Publier dans »" },
  { motif: "Utiliser pour créer",   pourquoi: "vocabulaire d'identité" },
];

// Retire les commentaires de ligne et les commentaires HTML.
//
// ⚠️ AUCUN RETRAIT DES BLOCS `/* … */` PAR EXPRESSION RÉGULIÈRE. Ce fichier en
// faisait un, et c'était un TROU : mesuré le 2026-08-31, il avalait 5 440 des
// 41 293 lignes analysées — 13 %, dont 2 448 des 3 671 lignes d'app-06, soit
// les deux tiers du fichier. Cause : `accept="image/*"`, le joker MIME d'un
// `<input type="file">`, ouvre un faux bloc de commentaire, et le `*/` suivant
// se trouve plus de mille lignes plus loin. Le garde-fou de vocabulaire ne
// voyait donc PAS la majorité du code qu'il prétend surveiller, sans rien dire.
// Trouvé en écrivant un autre verrou avec le même helper : il restait vert sur
// la mutation qu'il devait attraper.
//
// Conséquence assumée : une formulation interdite écrite DANS un vrai bloc
// `/* … */` multiligne serait signalée. C'est un faux positif bruyant et
// trivial à lever — infiniment préférable à un angle mort silencieux. Les
// blocs tenant sur UNE ligne (`/* … */`) restent retirés, sans risque.
function sansCommentaires(src, html) {
  let s = src;
  if (html) s = s.replace(/<!--[\s\S]*?-->/g, " ");
  return s.split("\n").filter(l => {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*")) return false;
    if (t.startsWith("/*") && t.endsWith("*/")) return false;
    return true;
  }).join("\n");
}

test("aucune formulation contraire à ADR-010 n'est servie au navigateur", async ({ page }) => {
  const trouves = [];
  for (const f of FICHIERS) {
    const r = await page.request.get(f);
    expect(r.ok(), `${f} doit être servi`).toBeTruthy();
    const propre = sansCommentaires(await r.text(), f.endsWith(".html"));
    for (const { motif, pourquoi } of INTERDITS) {
      if (propre.includes(motif)) trouves.push(`${f} — « ${motif} » (${pourquoi})`);
    }
  }
  expect(trouves, "formulations interdites par ADR-010 :\n" + trouves.join("\n")).toEqual([]);
});

test("le tour d'accueil enseigne le bon modèle", async ({ page }) => {
  const src = await (await page.request.get("/js/app-08-ui-modals-tour.js")).text();
  const propre = sansCommentaires(src, false);
  // La diapositive qui présente le concept. Elle disait « Plusieurs profils,
  // plusieurs passions » / « chaque passion son profil » / « Pas besoin de tout
  // mélanger sur un seul compte » — soit le modèle inverse, au premier contact.
  expect(propre).toContain("Un seul profil, plusieurs passions");
  expect(propre).not.toContain("Pas besoin de tout mélanger sur un seul compte");
});

test("la promesse produit est affichée, et de façon permanente", async ({ page }) => {
  const html = await (await page.request.get("/index.html")).text();
  // La phrase de référence d'ADR-010, dans un nœud qui lui est PROPRE : elle
  // vivait avant dans `#profilesQuotaSub`, que le rendu vide et masque dès
  // qu'aucune passion n'est archivée — donc invisible pour tout le monde.
  expect(html).toContain('id="profilesModeleSub"');
  expect(html).toContain("Un seul profil, plusieurs passions");
  expect(html).toContain("ton fil réunit les passions que tu choisis et les personnes que tu suis");
});
