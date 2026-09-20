// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE RÉFÉRENTIEL DES PASSIONS N'EST PLUS CHARGÉ DEPUIS LA PRODUCTION
//
// CE QUE ÇA COÛTAIT. Mesuré le 2026-09-20 (canal ① d'ADR-012,
// `extensions.pg_stat_statements`, cumul sur 129 jours) :
// `select id from passions where status = 'active'` est la TROISIÈME requête de
// toute la base — 2 900 511 appels, 4 368 s de CPU, 5,92 % du total. Pour DIX
// comptes réels. Le demandeur n'était pas un utilisateur : c'était cette suite.
//
// ⚠️ LE CALCUL EST LE CONSTAT, PAS UNE IMPRESSION. `chargerReferentielPassions`
// (app-02) pagine par 1 000 : 5 001 passions actives = SIX requêtes par
// démarrage de page. La suite compte 716 démarrages, donc ~4 300 appels par run
// complet, et 2 900 511 / 4 296 ≈ 675 runs. Le contre-témoin ferme le doute :
// la variante SANS le filtre `status` — le client d'avant le 2026-09-09 — porte
// 141 520 appels, soit ~33 runs, exactement la fenêtre où ce client a vécu.
//
// ⚠️ ON NE RÉPOND PAS `[]`. Une réponse vide laisserait `_referentielPassions` à
// `null`, donc `estPassionCanonique` au plancher des 19 passions du socle : une
// suite qui publie sous une passion du référentiel rougirait pour une raison
// étrangère à son sujet, et une suite qui passerait quand même cesserait
// d'exercer la liste blanche SANS que rien ne le dise. On sert
// `data/passions-v1.json`, le MIROIR GÉNÉRÉ de cette table (même source que
// `migration_passions_plat.sql`, égalité tenue par `npm run passions:verifier`).
//
// ⚠️ L'HÔTE FICTIF `.invalid` (RFC 2606, ne résout jamais) NE COUVRE QUE ④ ET
// ⑥ — et le dire est plus utile que de laisser croire qu'il couvre tout. Les
// autres cas passent par `window.supa`, donc par la VRAIE URL Supabase : en CI,
// avec du réseau, retirer la route les ferait aboutir au lieu d'échouer, et une
// assertion bâtie sur `ERR_…` y serait verte dans les deux états. La réinjection
// « route retirée » a d'ailleurs été faite en local SANS réseau, où tout échoue
// de toute façon.
// ⚠️ LE SEUL DISCRIMINANT ROBUSTE EN CI EST CELUI DU CAS ③ bis :
// `etat.taille === miroirPassions().length` — 5 001 (miroir) contre ~5 003
// (production, qui porte en plus les passions créées depuis l'app). Il tient
// parce que les deux divergent ; le jour où un delta les fait converger, ce
// discriminant disparaîtra SANS BRUIT. À relire si ce fichier redevient vert
// trop facilement.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded, sansDonneesDistantes, miroirPassions } = require("./app-helper");

const HOTE = "https://passio-essai.invalid";

// ⚠️ ON DEMANDE PAR LE CLIENT RÉEL, PAS PAR UN `fetch` MAISON — et c'est la
// leçon du lot. `postgrest-js` 2.116 traduit `.range(a, b)` en PARAMÈTRES
// `offset`/`limit`, jamais en en-tête `Range` : une première version de ces cas
// interrogeait la route avec ses propres en-têtes, obtenait la bonne page, et
// restait VERTE alors que le vrai chargeur recevait les 5 001 lignes à chaque
// appel et partait pour quarante pages. Un banc qui mesure le faux serveur ne
// mesure pas le produit.
async function demanderPage(page, debut, fin) {
  return page.evaluate(
    async ([d, f]) => {
      try {
        const r = await window.supa
          .from("passions").select("id").eq("status", "active").range(d, f);
        if (r.error) return { erreur: r.error.message };
        return { statut: r.status, corps: r.data };
      } catch (e) {
        return { erreur: String((e && e.message) || e) };
      }
    },
    [debut, fin],
  );
}

test.describe("Isolation — le référentiel des passions vient du miroir local", () => {
  test("① la page 0 est servie localement : elle ne part jamais sur le réseau", async ({ page }) => {
    const transport = [];
    page.on("requestfailed", (r) => {
      if (/\/rest\/v1\/passions\?/.test(r.url())) transport.push((r.failure() || {}).errorText || "");
    });
    await bootOnboarded(page);

    const r = await demanderPage(page, 0, 999);
    expect(r.erreur, "la requête a échoué au lieu d'être servie").toBeUndefined();
    expect(r.corps).toHaveLength(1000);
    // L'ORDRE vient du miroir. En production la requête n'a pas d'`order by` :
    // quelles lignes reviennent dépend du plan — c'est ce qui a fait tomber
    // `user-passions-miroir` le 2026-09-09. Ici l'ordre est celui du fichier.
    expect(r.corps[0].id).toBe(miroirPassions()[0].id);
    expect(r.corps[999].id).toBe(miroirPassions()[999].id);
    // Aucune requête n'est RÉELLEMENT partie. ⚠️ DEUX libellés disent « partie »,
    // et n'en connaître qu'un rendrait ce cas vert dans les deux états :
    // `ERR_NAME_NOT_RESOLVED` hors proxy, `ERR_TUNNEL_CONNECTION_FAILED`
    // derrière le proxy d'un conteneur (où le DNS n'a jamais lieu). C'est la
    // distinction déjà écrite dans `isolation-medias.spec.js` ④/⑤.
    expect(transport.join("|")).not.toMatch(/ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED/);
  });

  test("② le câblage : bootOnboarded pose la route, pas seulement sansDonneesDistantes", async ({
    page,
  }) => {
    // ⚠️ C'est `bootOnboarded` qu'appellent les ~113 suites concernées. Un cas
    // qui n'appellerait que `sansDonneesDistantes` resterait VERT si quelqu'un
    // retirait l'appel du helper — le défaut `_notifierMessage`, rejoué.
    await bootOnboarded(page);
    const r = await demanderPage(page, 0, 9);
    expect(r.erreur).toBeUndefined();
    expect(r.corps).toHaveLength(10);
  });

  test("③ la pagination est HONORÉE — la dernière page est incomplète, et c'est elle qui clôt", async ({
    page,
  }) => {
    // ⚠️ Rendre les 5 001 lignes d'un coup ferait BOUCLER `chargerReferentielPassions`,
    // qui redemande tant qu'une page revient PLEINE. Le contrat de PostgREST
    // (`max-rows`) doit être reproduit, pas contourné : c'est ce défaut-là que
    // le dépôt a déjà payé une fois (2026-09-09, moitié du référentiel perdue).
    await bootOnboarded(page);
    const total = miroirPassions().length;
    const derniereDebut = Math.floor((total - 1) / 1000) * 1000;

    const pleine = await demanderPage(page, 0, 999);
    expect(pleine.corps).toHaveLength(1000);

    const derniere = await demanderPage(page, derniereDebut, derniereDebut + 999);
    expect(derniere.corps.length).toBeLessThan(1000);
    expect(derniere.corps.length).toBe(total - derniereDebut);
    expect(derniere.corps[derniere.corps.length - 1].id).toBe(miroirPassions()[total - 1].id);
  });

  test("③ bis — LE VRAI CHARGEUR : six pages, liste blanche COMPLÈTE, aucun « TRONQUÉ »", async ({
    page,
  }) => {
    // ⚠️ LE CAS QUI A TROUVÉ LE DÉFAUT, ET LE SEUL QUI POUVAIT. Les huit autres
    // interrogeaient la route ; celui-ci laisse `chargerReferentielPassions`
    // (app-02) faire sa pagination réelle et compte ce qui part. Quand la route
    // ignorait `offset`/`limit`, chaque page revenait PLEINE (5 001 lignes) :
    // le chargeur enchaînait ses QUARANTE pages (`PAGES_MAX`), journalisait
    // « référentiel TRONQUÉ » et ne posait jamais `complet` — donc rechargeait
    // à chaque appel. Un correctif de charge qui MULTIPLIAIT la charge par sept.
    const tronque = [];
    page.on("console", (m) => {
      if (/TRONQU/i.test(m.text())) tronque.push(m.text());
    });
    let requetes = 0;
    page.on("request", (r) => {
      if (/\/rest\/v1\/passions\?/.test(r.url())) requetes++;
    });

    await bootOnboarded(page);
    await page.waitForFunction(
      () => typeof window._referentielEtat === "function" && window._referentielEtat().complet,
      null,
      { timeout: 15000 },
    );

    const etat = await page.evaluate(() => window._referentielEtat());
    expect(etat.complet, "la liste blanche n'est pas COMPLÈTE").toBe(true);
    expect(etat.taille).toBe(miroirPassions().length);

    // Exactement le nombre de pages que la production ferait : ⌈5001/1000⌉ = 6.
    // Plus, c'est la boucle du défaut ; moins, c'est une page avalée.
    expect(requetes).toBe(Math.ceil(miroirPassions().length / 1000));
    expect(tronque, "le chargeur a atteint son plafond de pages").toEqual([]);
  });

  test("④ la seconde forme est servie : `id=in.(…)`, celle de passions-flat.js", async ({ page }) => {
    // ⚠️ N'en servir qu'une laisserait l'autre partir en production — un
    // correctif qui ne corrige qu'une surface.
    // ⚠️ CE CAS MESURE LA ROUTE, PAS LE GESTE DU PRODUIT, et il faut le dire :
    // `resoudreNomsManquants` (passions-flat.js:1120) ne demande QUE les ids que
    // `parId()` ne résout pas — c'est-à-dire précisément ceux ABSENTS du miroir,
    // pour lesquels la route rendra toujours `[]`. Aucune suite du dépôt
    // n'exerce cette surface (grep `resoudreNomsManquants` dans `tests/` : zéro),
    // donc rien ne régresse ; mais ce cas ne prouve pas ce chemin-là.
    await bootOnboarded(page);
    const m = miroirPassions();
    const cibles = [m[3].id, m[7].id];
    const r = await page.evaluate(
      async ([url]) => {
        const rep = await fetch(url);
        return { statut: rep.status, corps: await rep.json() };
      },
      [`${HOTE}/rest/v1/passions?select=id,label,emoji,color&id=in.(${cibles.join(",")})`],
    );
    expect(r.statut).toBe(200);
    expect(r.corps.map((x) => x.id).sort()).toEqual([...cibles].sort());
    // Les colonnes demandées sont servies — un nom vide donnerait « ✨ Passion ».
    expect(r.corps[0].label).toBeTruthy();
    expect(Object.keys(r.corps[0]).sort()).toEqual(["color", "emoji", "id", "label"]);
  });

  test("⑤ `select=id` ne rend QUE l'id — on ne renvoie pas 568 ko là où 140 suffisent", async ({
    page,
  }) => {
    await bootOnboarded(page);
    const r = await demanderPage(page, 0, 4);
    expect(Object.keys(r.corps[0])).toEqual(["id"]);
  });

  test("⑥ les ÉCRITURES continuent de passer — on n'a pas coupé `creer_passion`", async ({
    page,
  }) => {
    const partis = [];
    page.on("requestfailed", (r) => {
      if (/\/rest\/v1\/passions\?/.test(r.url())) partis.push((r.failure() || {}).errorText || "");
    });
    await bootOnboarded(page);
    await page.evaluate(
      async ([url]) => {
        try {
          await fetch(url, { method: "PATCH", body: "{}" });
        } catch (e) {}
      },
      [`${HOTE}/rest/v1/passions?id=eq.musique`],
    );
    // Une écriture n'est pas interceptée : elle PART, donc elle bute sur le
    // réseau. C'est la preuve que `route.continue()` a été pris — l'inverse du
    // cas ①. ⚠️ Le libellé dépend de l'environnement (proxy ou non) ; ce qui
    // NE doit jamais paraître, c'est `ERR_FAILED`, qui dirait que la route a
    // abandonné la requête — donc qu'on a coupé les écritures.
    expect(partis.join("|")).toMatch(/ERR_NAME_NOT_RESOLVED|ERR_TUNNEL_CONNECTION_FAILED/);
    expect(partis.join("|")).not.toContain("ERR_FAILED");
  });

  test("⑦ à la SOURCE : le helper enregistre bien une route sur la table passions", async () => {
    const src = fs.readFileSync(path.join(__dirname, "app-helper.js"), "utf8");
    // ⚠️ L'ANCRE NE PORTE PAS LA LISTE D'ARGUMENTS, ET CE LOT A PAYÉ POURQUOI.
    // Écrite `…(page)`, elle a cessé de correspondre à l'instant où la même PR a
    // ajouté `opts = {}` à la signature : `indexOf` rendait -1, `slice(-1)` le
    // DERNIER caractère du fichier, et le cas rougissait sur son outillage.
    // Un verrou de source s'ancre sur le NOM, jamais sur une signature.
    const debut = src.indexOf("function sansDonneesDistantes(");
    expect(debut, "la fonction a été renommée : ce verrou ne mesure plus rien").toBeGreaterThan(-1);
    const corps = src.slice(debut);
    expect(corps).toContain("MOTIF_PASSIONS_DISTANTES");
    // Et le motif ne doit pas déborder sur une table voisine (`passion_quotas`,
    // `passion_requests`) ni sur les RPC (`rpc/rechercher_passions`).
    const motif = /\/rest\/v1\/passions\?/;
    expect(motif.test("/rest/v1/passions?select=id")).toBe(true);
    expect(motif.test("/rest/v1/passion_quotas?select=*")).toBe(false);
    expect(motif.test("/rest/v1/passion_requests?select=*")).toBe(false);
    expect(motif.test("/rest/v1/rpc/rechercher_passions?")).toBe(false);
  });

  test("⑧ le miroir n'est pas vide, et il porte le référentiel COMPLET", async () => {
    // ⚠️ Le cas qui empêche la régression la plus coûteuse : servir `[]`. Ce
    // serait vert partout ailleurs et ferait taire la liste blanche.
    const m = miroirPassions();
    expect(m.length).toBeGreaterThan(4000);
    const brut = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "data", "passions-v1.json"), "utf8"),
    );
    expect(m.length).toBe(brut.passions.length);
    expect(m.every((p) => p.id && p.label)).toBe(true);
  });
});
