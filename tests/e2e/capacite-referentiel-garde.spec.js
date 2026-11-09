// ═══════════════════════════════════════════════════════════════════════════
// LISTE BLANCHE DES PASSIONS : GARDÉE SUR L'APPAREIL, PLUS RELUE À CHAQUE DÉMARRAGE (2026-11-09)
//
// Mesuré le 2026-11-09 : `chargerReferentielPassions` relisait à CHAQUE démarrage,
// visiteurs compris, les 5 006 identifiants actifs — six requêtes, 36 Ko sur le
// fil, 3 M d'appels cumulés (troisième requête de la base), pour une liste qui
// gagne une passion par mois. Fiche : docs/journal/capacite-perf-realtime.md.
//
// Le VRAI chargeur, un faux client à la chaîne exacte (`from/select/eq/range`
// pour les pages, `gt/limit` pour le complément) qui COMPTE les requêtes : c'est
// le compte, pas l'état final, qui prouve qu'une page n'est pas repartie.
// Le chargement du boot est mis au repos puis la liste gardée effacée avant
// chaque cas : en CI le vrai SDK l'a lancé, en local il sort sur sa garde —
// les deux environnements partent ainsi du même état.
//
// ① première session : tout est relu, puis gardé ;
// ② session suivante : aucune page, UNE requête pour les passions créées depuis ;
// ③ liste de plus de 24 h : tout est relu ;
// ④ une relecture interrompue n'est JAMAIS gardée (la faute du 2026-09-10) ;
// ⑤ une liste gardée trop courte n'est pas crue complète ;
// ⑥ hors artefact (sans release) : ni lecture ni écriture — le comportement d'avant.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const HEURE = 3600 * 1000;

async function preparer(page, { release = true } = {}) {
  if (release) await page.addInitScript(() => { window.PASSIO_RELEASE = { commit: "0123456789abcdef" }; });
  await bootOnboarded(page);
  await page.waitForFunction(() => !window._referentielEtat().enVol, null, { timeout: 20000 });
  await page.evaluate(async () => {
    if (typeof window.idbReferentielClear === "function") await window.idbReferentielClear();
    window.__requetes = [];
    window.__ids = Array.from({ length: 2500 }, (_, i) => "passion_banc_" + i);
    window.__nouvelles = ["passion_neuve_1", "passion_neuve_2"];
    // Passions archivées que le complément rend avec leur statut (vide par défaut).
    window.__archivees = [];
    window.__panneAPage = -1;
    // Panne du complément : null (il répond), "reseau" (coupure : `{ error }` SANS
    // rejet, comme supabase-js), "refus" (le serveur refuse : code PostgREST).
    window.__panneComplement = null;
    const client = {
      from(table) {
        const q = { table, filtres: [], debut: null, fin: null, limite: null };
        const chaine = {
          select() { return chaine; },
          eq(c, v) { q.filtres.push(["eq", c, v]); return chaine; },
          gt(c, v) { q.filtres.push(["gt", c, v]); return chaine; },
          or(expr) { q.filtres.push(["or", expr]); return chaine; },
          range(a, b) { q.debut = a; q.fin = b; return chaine; },
          limit(n) { q.limite = n; return chaine; },
          then(ok, ko) {
            window.__requetes.push(JSON.parse(JSON.stringify(q)));
            let rep;
            if (q.filtres.some((f) => f[0] === "or")) {
              if (window.__panneComplement === "reseau") rep = { data: null, error: { message: "TypeError: Failed to fetch" } };
              else if (window.__panneComplement === "refus") rep = { data: null, error: { code: "42501", message: "permission denied" } };
              else rep = {
                data: window.__nouvelles.map((id) => ({ id, status: "active" }))
                  .concat(window.__archivees.map((id) => ({ id, status: "archived" }))),
                error: null,
              };
            }
            else if (q.debut !== null && q.debut / 1000 === window.__panneAPage) rep = { data: null, error: { message: "panne de banc" } };
            else rep = { data: window.__ids.slice(q.debut, q.fin + 1).map((id) => ({ id })), error: null };
            return Promise.resolve(rep).then(ok, ko);
          },
        };
        return chaine;
      },
    };
    supa = client; window.supa = client; window._supaReal = true;
    // Une « nouvelle session » : l'état du chargeur revient à celui d'un démarrage.
    window.__nouvelleSession = () => {
      _referentielPassions = null; _referentielComplet = false;
      _referentielEnCours = false; _referentielCacheConsulte = false;
      window.__requetes.length = 0;
      try { acquitterLecture("passions"); } catch (e) {}
    };
    window.__pages = () => window.__requetes.filter((r) => r.debut !== null).length;
    window.__complements = () => window.__requetes.filter((r) => r.filtres.some((f) => f[0] === "or"));
  });
}

async function session(page) {
  return page.evaluate(async () => {
    window.__nouvelleSession();
    await chargerReferentielPassions();
    return { etat: window._referentielEtat(), pages: window.__pages() };
  });
}

async function gardee(page) {
  // L'écriture IndexedDB n'est pas attendue par le chargeur : on la laisse aboutir.
  await page.waitForTimeout(150);
  return page.evaluate(async () => {
    const rec = await window.idbReferentielLoad();
    return rec ? { taille: rec.ids.length, at: rec.at } : null;
  });
}

test("① première session : les pages sont relues, la liste complète est gardée", async ({ page }) => {
  await preparer(page);
  const s = await session(page);
  expect(s.pages, "2 500 passions = trois pages de 1 000").toBe(3);
  expect(s.etat.complet).toBe(true);
  expect(s.etat.taille).toBe(2500);
  const g = await gardee(page);
  expect(g && g.taille).toBe(2500);
});

test("② session suivante : AUCUNE page, une seule requête pour les passions créées depuis", async ({ page }) => {
  await preparer(page);
  await session(page);
  await gardee(page);

  const s = await session(page);
  expect(s.pages, "la liste gardée remplace les six requêtes du démarrage").toBe(0);
  expect(s.etat.complet).toBe(true);
  await page.waitForFunction(() => window.__complements().length === 1, null, { timeout: 5000 });
  const r = await page.evaluate(() => ({
    complement: window.__complements()[0],
    neuve: estPassionCanonique("passion_neuve_2"),
    ancienne: estPassionCanonique("passion_banc_1234"),
    inconnue: estPassionCanonique("passion_jamais_vue"),
    taille: window._referentielEtat().taille,
  }));
  // Le complément demande les passions créées depuis la liste gardée, 36 h de
  // marge comprises (horloge du téléphone ≠ horloge du serveur), ET toutes celles
  // qui ne sont plus actives — en UNE requête.
  const ou = r.complement.filtres.find((f) => f[0] === "or")[1];
  const m = /^created_at\.gt\."([^"]+)",status\.neq\.active$/.exec(ou);
  expect(m, "forme du filtre : " + ou).not.toBeNull();
  const ecart = Date.now() - Date.parse(m[1]);
  expect(ecart).toBeGreaterThan(35 * HEURE);
  expect(ecart).toBeLessThan(37 * HEURE);
  expect(r.complement.limite).toBe(1000);
  expect(r.neuve).toBe(true);
  expect(r.ancienne).toBe(true);
  expect(r.inconnue).toBe(false);
  expect(r.taille).toBe(2502);
});

test("② bis une passion ARCHIVÉE depuis la liste gardée cesse d'être publiable dès la session suivante", async ({ page }) => {
  // Relevé par `passio-red-team` : le serveur ne refuse pas une passion archivée
  // (clé étrangère seule) — sans ce retrait, archiver n'agissait plus avant 24 h.
  await preparer(page);
  await session(page);
  await gardee(page);
  await page.evaluate(() => { window.__archivees = ["passion_banc_7"]; });
  await session(page);
  await page.waitForFunction(() => window.__complements().length === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => !estPassionCanonique("passion_banc_7"), null, { timeout: 5000 });
  const r = await page.evaluate(() => ({
    archivee: estPassionCanonique("passion_banc_7"),
    voisine: estPassionCanonique("passion_banc_8"),
    neuve: estPassionCanonique("passion_neuve_1"),
    publication: requiredCanonicalPassion("passion_banc_7"),
  }));
  expect(r.archivee).toBe(false);
  expect(r.voisine, "une ligne qui DIT son statut ne retire qu'elle-même").toBe(true);
  expect(r.neuve).toBe(true);
  expect(r.publication).toEqual({ ok: false, motif: "non_canonique" });
});

test("③ une liste gardée de plus de 24 h ne sert plus : tout est relu", async ({ page }) => {
  await preparer(page);
  await page.evaluate(async () => {
    const vrai = Date.now;
    Date.now = () => vrai() - 25 * 3600 * 1000;
    try { await window.idbReferentielSave(window.__ids); } finally { Date.now = vrai; }
  });
  const s = await session(page);
  expect(s.pages).toBe(3);
  expect(s.etat.complet).toBe(true);
  const g = await gardee(page);
  expect(Math.abs(Date.now() - g.at), "la relecture complète remplace la liste périmée").toBeLessThan(HEURE);
});

test("④ une relecture interrompue n'est JAMAIS gardée", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => { window.__panneAPage = 1; });
  const s = await session(page);
  expect(s.etat.complet, "prémisse : la panne à la deuxième page laisse la liste incomplète").toBe(false);
  expect(await gardee(page), "une liste tronquée gardée serait installée à TOUS les démarrages suivants").toBeNull();
});

test("⑤ une liste gardée trop courte n'est pas crue complète", async ({ page }) => {
  await preparer(page);
  await page.evaluate(async () => { await window.idbReferentielSave(["passion_banc_1", "passion_banc_2"]); });
  const s = await session(page);
  expect(s.pages).toBe(3);
  expect(s.etat.taille).toBe(2500);
});

test("⑥ hors artefact (sans release) : rien n'est lu ni écrit, chaque session relit tout", async ({ page }) => {
  await preparer(page, { release: false });
  const premiere = await session(page);
  expect(premiere.pages).toBe(3);
  expect(await gardee(page)).toBeNull();
  const seconde = await session(page);
  expect(seconde.pages, "sans release, le comportement d'avant tient à l'octet près").toBe(3);
});

test("⑦ complément coupé : il s'inscrit à la reprise et rattrape la passion du jour ; un refus ne se rejoue pas", async ({ page }) => {
  // Relevé par `audit-passio` : supabase-js rend `{ error }` SANS rejeter sur une
  // coupure ; un `return` muet laissait toute la session sans les passions du jour.
  await preparer(page);
  await session(page);
  await gardee(page);

  await page.evaluate(() => { window.__panneComplement = "reseau"; });
  await session(page);
  await page.waitForFunction(() => window.__complements().length === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => window._repriseEtat().enAttente.indexOf("passions_complement") !== -1, null, { timeout: 5000 });
  expect(await page.evaluate(() => estPassionCanonique("passion_neuve_1")), "prémisse : la passion du jour manque").toBe(false);

  // Le réseau revient : la reprise rejoue le complément, qui s'acquitte.
  await page.evaluate(() => { window.__panneComplement = null; });
  const relancees = await page.evaluate(() => window.repriseLecturesBoot("banc"));
  expect(relancees).toBeGreaterThanOrEqual(1);
  const apres = await page.evaluate(() => ({
    neuve: estPassionCanonique("passion_neuve_1"),
    enAttente: window._repriseEtat().enAttente,
  }));
  expect(apres.neuve).toBe(true);
  expect(apres.enAttente).not.toContain("passions_complement");

  // Un REFUS du serveur n'est pas une coupure : rien à rejouer.
  await page.evaluate(() => { window.__panneComplement = "refus"; });
  await session(page);
  await page.waitForFunction(() => window.__complements().length === 1, null, { timeout: 5000 });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window._repriseEtat().enAttente)).not.toContain("passions_complement");
});

test("⑧ IndexedDB qui ne répond jamais : la relecture part au bout de 3 s, la promesse se règle", async ({ page }) => {
  // Relevé par `audit-passio` : idb-store borne l'OUVERTURE de la base, pas le `get`.
  await preparer(page);
  const r = await page.evaluate(async () => {
    window.idbReferentielLoad = () => new Promise(() => {});
    const debut = Date.now();
    window.__nouvelleSession();
    await chargerReferentielPassions();
    return { ms: Date.now() - debut, etat: window._referentielEtat(), pages: window.__pages() };
  });
  expect(r.pages, "sans liste gardée lisible, tout est relu").toBe(3);
  expect(r.etat.complet).toBe(true);
  expect(r.etat.enVol).toBe(false);
  expect(r.ms).toBeGreaterThanOrEqual(2900);
  expect(r.ms, "borné à 3 s, pas aux 60 s de la péremption « en vol »").toBeLessThan(15000);
});
