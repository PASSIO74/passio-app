// ═══════════════════════════════════════════════════════════════════════════
// UN ACCUSÉ DE LECTURE REFUSÉ PAR L'APPARTENANCE SE RÉPARE — IL NE SE TAIT PLUS
// (revue indépendante 10b, risque résiduel R6 de l'audit du 2026-11-02)
//
// `migration_audit_2026-11-02_oracles_et_privileges.sql` ajoute
// `is_conv_member(conv_id, auth.uid())` aux policies INSERT et UPDATE de
// `conv_reads`. Une conversation historique peut manquer de la ligne
// `conv_members` de l'un de ses participants (19 sur 20 le 2026-09-10) : sans
// ce correctif, son accusé ✓✓ aurait été refusé (42501 / 403) EN SILENCE —
// `supaMarkRead` faisait `await upsert(...)` dans un `try{}catch(e){}` sans
// jamais lire `{ error }`, et le SDK ne lève pas sur un refus RLS.
//
// Ce que ce banc exige de `supaMarkRead` (app-08) :
//   ① succès → UN upsert, aucune écriture d'appartenance ;
//   ② 42501 puis succès → réparation par le mécanisme EXISTANT de l'envoi
//      (`_reparerAppartenanceConv`, app-04) pour MON compte sur CETTE
//      conversation, PUIS un second upsert — dans cet ordre ;
//   ③ refusé deux fois → exactement 2 upserts, 1 réparation, une trace
//      `diagLog` sans donnée personnelle, aucune exception ;
//   ④ panne réseau (réponse ou exception) → aucune réparation, et la tentative
//      unique n'est PAS consommée ;
//   ⑤ réparation déjà échouée dans la session → second appel : pas de
//      nouvelle réparation (mémo `_convReparationTentee`, partagé avec l'envoi) ;
//   ⑥ conversation où je ne suis pas participant localement (inconnue, groupe
//      d'activité quitté, fil de démonstration) → aucune réparation ;
//   ⑦ 401 (jeton absent ou expiré) → aucune réparation : ajouter un membre ne
//      répare pas une identité.
//
// ⚠️ Réseau Supabase COUPÉ (`route.abort`) et `supa.from` MUTÉ par
// `defineProperty` : en CI le vrai SDK se charge et ses membres sont des
// getters de prototype qu'une simple affectation ne masque pas. Aucune
// écriture ne part en base — c'est un banc du projet `local`.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const PAIR = "88881111-2222-4333-8444-555566667777";

// Forme RÉELLE d'un refus RLS d'un compte authentifié (PostgREST : 403 + 42501).
const REFUS = { status: 403, error: { code: "42501", message: "new row violates row-level security policy for table \"conv_reads\"" } };
// Forme RÉELLE d'une panne réseau rendue par postgrest-js (il ne lève pas) :
// statut 0, code vide, message « TypeError: Failed to fetch ».
const PANNE = { status: 0, error: { code: "", message: "TypeError: Failed to fetch", details: "", hint: "" } };

/**
 * Démarre l'app sous un compte réel (uuid local, aucune session lisible :
 * `_identiteDivergeDeLaSession` ne conclut rien), coupe Supabase au réseau et
 * remplace `supa.from` par un faux client qui NOTE chaque écriture et sert des
 * réponses programmées par `table.op` (les lectures de fond rendent vide).
 */
async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((pair) => {
    window.__ops = [];
    window.__reponses = {};           // { "conv_reads.upsert": [r, …] } — consommées dans l'ordre
    const requete = (table) => {
      const q = { _op: "select" };
      ["select", "eq", "neq", "lte", "gte", "maybeSingle", "single", "order", "limit", "in", "range"]
        .forEach((m) => { q[m] = () => q; });
      ["upsert", "insert", "update", "delete"].forEach((op) => {
        q[op] = (payload) => { q._op = op; window.__ops.push({ table, op, payload }); return q; };
      });
      q.then = (ok, ko) => {
        const file = window.__reponses[table + "." + q._op];
        const r = (file && file.length) ? file.shift() : {};
        // Une panne qui LÈVE (fetch avorté) plutôt que de rendre une erreur.
        if (r.__lever) return Promise.reject(new TypeError(r.__lever)).then(ok, ko);
        return Promise.resolve(Object.assign({ data: null, error: null, status: 201 }, r)).then(ok, ko);
      };
      return q;
    };
    Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: requete });
    window._supaReal = true;
    window._convReparationTentee = {};
    // Deux conversations locales : une 1-à-1 avec un pair connu (le cas
    // historique mesuré), et un groupe d'activité que j'ai quitté — sa trace
    // locale reste, mais je n'en suis plus membre.
    const convs = getConversations();
    convs.push({ id: "conv_hist", userId: pair, userName: "Léane", messages: [] });
    convs.push({ id: "evgrp_ev1", isGroup: true, groupName: "Sortie", userId: pair, messages: [] });
    saveConversations();
  }, PAIR);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__ops = []; window._diagLogs = []; });
}

/** Écritures et traces observées depuis la remise à zéro du banc. */
const observer = (page) => page.evaluate(() => ({
  lectures: window.__ops.filter((o) => o.table === "conv_reads" && o.op === "upsert"),
  membres: window.__ops.filter((o) => o.table === "conv_members" && o.op === "insert"),
  ordre: window.__ops.filter((o) => o.table === "conv_reads" || o.table === "conv_members").map((o) => o.table),
  traces: (window._diagLogs || []).filter((l) => /conv_reads|conv_reparation/.test(l)),
  tentee: Object.assign({}, window._convReparationTentee),
}));

test.describe("Accusé de lecture : un refus d'appartenance se répare (revue 10b)", () => {
  test("① succès — un seul upsert, aucune écriture d'appartenance", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => supaMarkRead("conv_hist"));
    const o = await observer(page);
    expect(o.lectures, "un accusé de lecture").toHaveLength(1);
    expect(o.lectures[0].payload).toMatchObject({ conv_id: "conv_hist", user_id: MOI });
    expect(o.membres, "aucune réparation sur un succès").toHaveLength(0);
    expect(o.traces, "rien à tracer").toEqual([]);
  });

  test("② 42501 → réparation pour MON compte sur CETTE conversation, puis second upsert", async ({ page }) => {
    await banc(page);
    await page.evaluate((refus) => {
      window.__reponses["conv_reads.upsert"] = [refus]; // le second passe
    }, REFUS);
    await page.evaluate(() => supaMarkRead("conv_hist"));
    const o = await observer(page);
    // RÉINJECTION : sur le code d'avant, 1 upsert et 0 membre.
    expect(o.lectures, "l'accusé refusé, puis sa reprise").toHaveLength(2);
    o.lectures.forEach((l) => expect(l.payload).toMatchObject({ conv_id: "conv_hist", user_id: MOI }));
    expect(o.membres.map((m) => m.payload.conv_id).every((c) => c === "conv_hist"),
      "la réparation ne touche que cette conversation").toBe(true);
    expect(o.membres.filter((m) => m.payload.user_id === MOI), "MON appartenance est réinscrite").toHaveLength(1);
    // Le mécanisme de l'envoi réinscrit les DEUX membres d'une 1-à-1.
    expect(o.membres, "une seule réparation (moi + le pair)").toHaveLength(2);
    // L'ordre : refus → réparation → reprise. Une reprise AVANT la réparation
    // serait refusée pareil.
    expect(o.ordre).toEqual(["conv_reads", "conv_members", "conv_members", "conv_reads"]);
    expect(o.tentee.conv_hist, "la tentative unique est consommée").toBe(true);
    expect(o.traces.filter((t) => /conv_reads/.test(t)), "une reprise réussie ne trace pas de refus").toEqual([]);
  });

  test("③ refusé deux fois → 2 upserts, 1 réparation, une trace sans donnée personnelle", async ({ page }) => {
    await banc(page);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    const rendu = await page.evaluate(async (refus) => {
      window.__reponses["conv_reads.upsert"] = [refus, refus];
      try { await supaMarkRead("conv_hist"); return "ok"; } catch (e) { return "exception " + e.message; }
    }, REFUS);
    expect(rendu, "aucune exception ne sort de supaMarkRead").toBe("ok");
    const o = await observer(page);
    expect(o.lectures, "pas de boucle : exactement deux upserts").toHaveLength(2);
    expect(o.membres, "une seule réparation").toHaveLength(2);
    expect(o.membres.filter((m) => m.payload.user_id === MOI)).toHaveLength(1);
    const refus = o.traces.filter((t) => /conv_reads refus apres reparation 42501/.test(t));
    expect(refus, "le refus définitif est TRACÉ").toHaveLength(1);
    // Aucune donnée personnelle dans les traces : ni conversation, ni compte.
    for (const t of o.traces) {
      expect(t).not.toContain("conv_hist");
      expect(t).not.toContain(MOI);
      expect(t).not.toContain(PAIR);
    }
    // Un nouvel appel n'enclenche aucune rafale : un upsert de plus, rien d'autre.
    await page.evaluate((refus) => {
      window.__reponses["conv_reads.upsert"] = [refus];
      return supaMarkRead("conv_hist");
    }, REFUS);
    const o2 = await observer(page);
    expect(o2.lectures).toHaveLength(3);
    expect(o2.membres, "pas de seconde réparation").toHaveLength(2);
    expect(erreurs, "aucune erreur de page").toEqual([]);
  });

  test("④ panne réseau → aucune réparation, et la tentative n'est pas consommée", async ({ page }) => {
    await banc(page);
    await page.evaluate(async (panne) => {
      // La panne rendue par postgrest-js…
      window.__reponses["conv_reads.upsert"] = [panne, { __lever: "Failed to fetch" }];
      await supaMarkRead("conv_hist");
      // … et celle qui LÈVE (fetch avorté).
      await supaMarkRead("conv_hist");
    }, PANNE);
    const o = await observer(page);
    expect(o.lectures, "deux tentatives, une par ouverture").toHaveLength(2);
    expect(o.membres, "le réseau ne se répare pas en ajoutant un membre").toHaveLength(0);
    expect(o.tentee.conv_hist, "la tentative unique reste disponible").toBeUndefined();
    expect(o.traces, "une panne réseau n'est ni un refus ni un défaut de code").toEqual([]);
    // Le réseau revenu, un vrai refus se répare encore.
    await page.evaluate((refus) => {
      window.__reponses["conv_reads.upsert"] = [refus];
      return supaMarkRead("conv_hist");
    }, REFUS);
    const o2 = await observer(page);
    expect(o2.membres.filter((m) => m.payload.user_id === MOI)).toHaveLength(1);
    expect(o2.lectures).toHaveLength(4);
  });

  test("⑤ réparation déjà échouée dans la session → le second appel ne répare pas", async ({ page }) => {
    await banc(page);
    await page.evaluate(async (refus) => {
      window.__reponses["conv_reads.upsert"] = [refus, refus];
      window.__reponses["conv_members.insert"] = [refus, refus]; // la réparation elle-même est refusée
      await supaMarkRead("conv_hist");
    }, REFUS);
    const o1 = await observer(page);
    expect(o1.lectures, "pas de reprise sans réparation").toHaveLength(1);
    expect(o1.membres, "la réparation a été TENTÉE").toHaveLength(2);
    expect(o1.traces.some((t) => /conv_reads refus 42501 : appartenance non reparee/.test(t)),
      "son échec est tracé").toBe(true);
    await page.evaluate(() => supaMarkRead("conv_hist"));
    const o2 = await observer(page);
    expect(o2.lectures, "l'accusé repart à l'ouverture suivante").toHaveLength(2);
    expect(o2.membres, "mais AUCUNE nouvelle réparation").toHaveLength(2);
    expect(o2.traces.some((t) => /conv_reads refus 42501 : reparation deja tentee/.test(t)),
      "et le refus reste visible").toBe(true);
  });

  test("⑥ conversation où je ne suis pas participant localement → aucune réparation", async ({ page }) => {
    await banc(page);
    // Le groupe et le fil de démonstration SONT dans ma liste locale : c'est la
    // règle de participation qui les écarte, pas leur absence.
    const presentes = await page.evaluate(() =>
      ["evgrp_ev1", "conv_lea"].map((id) => !!getConversations().find((c) => c.id === id)));
    expect(presentes).toEqual([true, true]);
    await page.evaluate(async (refus) => {
      window.__reponses["conv_reads.upsert"] = [refus, refus, refus];
      await supaMarkRead("conv_inconnue_x");   // absente de ma liste
      await supaMarkRead("evgrp_ev1");         // groupe d'activité quitté
      await supaMarkRead("conv_lea");          // fil de démonstration
    }, REFUS);
    const o = await observer(page);
    expect(o.lectures, "un upsert chacune, sans reprise").toHaveLength(3);
    expect(o.membres, "on ne s'inscrit jamais là où l'on n'est pas").toHaveLength(0);
    expect(o.tentee, "aucune tentative consommée").toEqual({});
    expect(o.traces.filter((t) => /hors reparation/.test(t)), "chaque refus est tracé").toHaveLength(3);
  });

  test("⑦ 401 → aucune réparation : un jeton absent ne se répare pas par un membre", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => {
      window.__reponses["conv_reads.upsert"] = [
        { status: 401, error: { code: "PGRST301", message: "JWT expired" } },
        // Rôle anonyme sous une policy `to authenticated` : PostgREST rend 401 + 42501.
        { status: 401, error: { code: "42501", message: "new row violates row-level security policy" } },
      ];
      await supaMarkRead("conv_hist");
      await supaMarkRead("conv_hist");
    });
    const o = await observer(page);
    expect(o.lectures).toHaveLength(2);
    expect(o.membres, "aucune réparation sur un 401").toHaveLength(0);
    expect(o.tentee.conv_hist, "la tentative reste disponible").toBeUndefined();
    expect(o.traces.filter((t) => /conv_reads echec/.test(t)), "l'échec reste tracé").toHaveLength(2);
  });
});
