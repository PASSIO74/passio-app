const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// D14-01, SUITE (2026-11-22) — LES RÉACTIONS ET LES STORIES EN UN APPEL GROUPÉ
//
// Vrai code du produit, serveur miniature dans la page : aucune donnée
// distante, aucune écriture. Ce que ce banc prouve :
//   · les interactions d'une discussion passent par `interactions_cibles`
//     (visibilité une fois par cible, migration du 2026-11-22) — plus aucune
//     lecture de la table quand la fonction répond ;
//   · fonction ABSENTE ou refusée DURABLEMENT (PGRST202, 42501) : la lecture
//     d'avant reprend, et la fonction n'est plus appelée de la session ;
//   · erreur PASSAGÈRE (503, réseau) : AUCUN repli vers la lecture d'avant
//     (plus coûteuse en pleine charge) ; la lecture est rendue comme échouée ;
//   · plus de 300 cibles : la lecture d'avant, pour ne perdre aucune cible ;
//   · stories : activité, commentaires et leur compte en un appel chacun, avec
//     le même rendu qu'avant (mes propres vues écartées).
// ═══════════════════════════════════════════════════════════════════════════

const MOI = "812aee2b-214f-4949-931e-842599b6d68b";
const AUTRE = "a09a84a8-b188-45bb-93f4-82648a2973f3";

async function demarrer(page) {
  await bootOnboarded(page);
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate((moi) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    MY_UID = moi; window.MY_UID = moi;
    window._supaReal = true;
    window._lecturesGroupeesIndispo = {};
    window.__lectures = [];
    window.__rpc = [];
    window.__repondre = () => ({ data: [], error: null });
    window.__repondreRpc = () => ({ data: [], error: null });
    // Les profils des auteurs : déjà connus, aucune résolution réseau.
    window._resolveProfilesByIds = async () => null;
    supa.rpc = (fn, args) => {
      __rpc.push({ fn, args });
      let res;
      try { res = __repondreRpc(fn, args); } catch (e) { return Promise.reject(e); }
      return Promise.resolve(res);
    };
    supa.from = function (table) {
      const req = { table, filtres: [] };
      const q = new Proxy({}, {
        get(_t, nom) {
          if (nom === "then") {
            return (ok, ko) => { __lectures.push(req); return Promise.resolve(__repondre(req)).then(ok, ko); };
          }
          return (...args) => {
            if (nom === "select") { req.cols = args[0]; req.options = args[1]; }
            else req.filtres.push([nom].concat(args));
            return q;
          };
        },
      });
      return q;
    };
  }, MOI);
}

const LIGNES = [
  { id: "i1", comment_id: "c1", post_id: "P1", user_id: AUTRE, kind: "like", payload: null, created_at: "2026-11-22T10:00:00+00:00" },
  { id: "i2", comment_id: "c1", post_id: "P1", user_id: MOI, kind: "like", payload: null, created_at: "2026-11-22T10:01:00+00:00" },
  { id: "i3", comment_id: "c2", post_id: "P1", user_id: AUTRE, kind: "emoji", payload: "😍", created_at: "2026-11-22T10:02:00+00:00" },
];

test("réactions : la fonction groupée répond → aucune lecture de la table, même agrégat", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async (lignes) => {
    __repondreRpc = (fn) => fn === "interactions_cibles" ? { data: lignes, error: null } : { data: null, error: { code: "PGRST202" } };
    const m = await supaLoadCommentInteractions(["c1", "c2", "c1", null]);
    return { rpc: __rpc, tables: __lectures.map((q) => q.table), c1: m && m.c1 && [m.c1.likes, m.c1.likedBy.length], c2: m && m.c2 && m.c2.replies.map((x) => x.type) };
  }, LIGNES);
  expect(r.rpc).toEqual([{ fn: "interactions_cibles", args: { _comment_ids: ["c1", "c2"], _kinds: null, _limite: 1000 } }]);
  expect(r.tables, "aucune lecture de comment_interactions").toEqual([]);
  expect(r.c1).toEqual([2, 2]);
  expect(r.c2).toEqual(["emoji_reaction"]);
});

test("réactions : fonction ABSENTE (PGRST202) puis refusée (42501) → la lecture d'avant, et la fonction n'est plus rappelée", async ({ page }) => {
  await demarrer(page);
  for (const code of ["PGRST202", "42501"]) {
    const r = await page.evaluate(async ({ lignes, code }) => {
      _lecturesGroupeesIndispo = {}; __rpc = []; __lectures = [];
      __repondreRpc = () => ({ data: null, error: { code, message: "x" }, status: code === "42501" ? 403 : 404 });
      __repondre = (req) => req.table === "comment_interactions" ? { data: lignes, error: null } : { data: [], error: null };
      const m1 = await supaLoadCommentInteractions(["c1"]);
      const m2 = await supaLoadCommentInteractions(["c1"]);
      return { rpc: __rpc.length, tables: __lectures.map((q) => q.table), likes: [m1 && m1.c1 && m1.c1.likes, m2 && m2.c1 && m2.c1.likes] };
    }, { lignes: LIGNES, code });
    expect(r.rpc, code + " : un seul appel de la fonction pour la session").toBe(1);
    expect(r.tables, code + " : la lecture d'avant, deux fois").toEqual(["comment_interactions", "comment_interactions"]);
    expect(r.likes).toEqual([2, 2]);
  }
});

test("réactions : erreur PASSAGÈRE (503, réseau) → AUCUN repli coûteux, lecture rendue échouée, fonction retentée ensuite", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async () => {
    let n = 0;
    __repondreRpc = () => { n++; if (n === 1) return { data: null, error: { message: "Service Unavailable" }, status: 503 }; throw new TypeError("Failed to fetch"); };
    const m1 = await supaLoadCommentInteractions(["c1"]);
    const m2 = await supaLoadCommentInteractions(["c1"]);
    return { m1, m2, rpc: __rpc.length, tables: __lectures.map((q) => q.table), indispo: Object.keys(_lecturesGroupeesIndispo) };
  });
  expect(r.m1, "503 : rien n'est connu").toBeNull();
  expect(r.m2, "réseau : rien n'est connu").toBeNull();
  expect(r.tables, "aucune lecture de la table en pleine charge").toEqual([]);
  expect(r.rpc, "la fonction est retentée, pas mise de côté").toBe(2);
  expect(r.indispo).toEqual([]);
});

test("réactions : plus de 300 cibles → la lecture d'avant, aucune cible perdue", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async () => {
    const ids = Array.from({ length: 301 }, (_, i) => "c" + i);
    await supaLoadCommentInteractions(ids);
    const filtre = (__lectures[0] && __lectures[0].filtres.find((f) => f[0] === "in")) || [];
    return { rpc: __rpc.length, tables: __lectures.map((q) => q.table), nb: (filtre[2] || []).length, borne: INTERACTIONS_CIBLES_MAX };
  });
  expect(r.borne).toBe(300);
  expect(r.rpc).toBe(0);
  expect(r.tables).toEqual(["comment_interactions"]);
  expect(r.nb).toBe(301);
});

test("stories : activité, commentaires et compte en un appel chacun, rendu inchangé", async ({ page }) => {
  await demarrer(page);
  const r = await page.evaluate(async ({ moi, autre }) => {
    __repondreRpc = (fn) => {
      if (fn === "story_activite") return { data: { vues: [{ user_id: autre, seen_at: "2026-11-22T09:00:00+00:00" }, { user_id: moi, seen_at: "2026-11-22T09:01:00+00:00" }], jaime: [autre] }, error: null };
      if (fn === "story_commentaires_lire") return { data: [{ id: "k1", author_id: autre, content: "bravo", created_at: "2026-11-22T12:00:00+00:00" }], error: null };
      if (fn === "story_nb_commentaires") return { data: 7, error: null };
      return { data: null, error: { code: "PGRST202" } };
    };
    const a = await supaStoryActivite("S1");
    const c = await supaStoryCommentaires("S1");
    const n = await supaStoryNbCommentaires("S1");
    return { a: { vues: a.vues.map((v) => v.userId), jaime: a.jaime, at: typeof a.vues[0].at }, c: c.liste.map((x) => [x.id, x.authorId, x.text]), n,
      rpc: __rpc.map((x) => x.fn + ":" + JSON.stringify(x.args)), tables: __lectures.map((q) => q.table) };
  }, { moi: MOI, autre: AUTRE });
  expect(r.rpc).toEqual(['story_activite:{"_story_id":"S1"}', 'story_commentaires_lire:{"_story_id":"S1","_limite":300}', 'story_nb_commentaires:{"_story_id":"S1"}']);
  expect(r.tables, "aucune lecture des tables de stories").toEqual([]);
  expect(r.a).toEqual({ vues: [AUTRE], jaime: [AUTRE], at: "number" });
  expect(r.c).toEqual([["k1", AUTRE, "bravo"]]);
  expect(r.n).toBe(7);
});

test("stories : fonction absente → lecture d'avant ; erreur passagère → échec sans lecture de table", async ({ page }) => {
  await demarrer(page);
  const absente = await page.evaluate(async (autre) => {
    __repondreRpc = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" }, status: 404 });
    __repondre = (req) => req.table === "story_comments" && req.options && req.options.count
      ? { data: null, error: null, count: 4 }
      : { data: [{ user_id: autre, seen_at: "2026-11-22T09:00:00+00:00", id: "k1", author_id: autre, content: "x", created_at: "2026-11-22T12:00:00+00:00" }], error: null };
    const a = await supaStoryActivite("S1"), c = await supaStoryCommentaires("S1"), n = await supaStoryNbCommentaires("S1");
    return { a: a.jaime, c: c.liste.length, n, tables: __lectures.map((q) => q.table) };
  }, AUTRE);
  expect(absente.tables).toEqual(["story_views", "story_likes", "story_comments", "story_comments"]);
  expect(absente.a).toEqual([AUTRE]);
  expect(absente.c).toBe(1);
  expect(absente.n).toBe(4);
  const passagere = await page.evaluate(async () => {
    _lecturesGroupeesIndispo = {}; __lectures = [];
    __repondreRpc = () => ({ data: null, error: { message: "Service Unavailable" }, status: 503 });
    const a = await supaStoryActivite("S1"), c = await supaStoryCommentaires("S1"), n = await supaStoryNbCommentaires("S1");
    return { a, c, n, tables: __lectures.map((q) => q.table) };
  });
  expect(passagere.a).toEqual({ erreur: true });
  expect(passagere.c).toEqual({ erreur: true });
  expect(passagere.n).toBeNull();
  expect(passagere.tables, "aucune lecture de table en pleine charge").toEqual([]);
});
