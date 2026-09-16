// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-24 (cinquième contre-revue Astra, 2026-09-15) — les mentions sont
// écrites par le SERVEUR : le client porte des IDENTIFIANTS, après que le
// commentaire / le message a atterri, et n'écrit plus de ligne `notifications`
// de genre 'mention'. Vrais chemins (`supaAddComment`, `_sendTextToSupa`),
// `supa` muté (jamais remplacé : en CI le vrai SDK est là).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "11111111-1111-4111-8111-111111111111";
const UID_LEA2 = "22222222-2222-4222-8222-222222222222";

const FAUX_SUPA = `
window.__inserts = []; window.__rpc = []; window.__pushes = []; window.__traces = [];
window.__rpcReponse = { data: { demandees: 1, notifiees: 1 }, error: null };
window._supaReal = true;
window.diagLog = function (m) { window.__traces.push(String(m)); };
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function (table) {
    var b = {
      insert: function (row) { window.__inserts.push({ table: table, row: row }); return Promise.resolve({ data: null, error: null }); },
      select: function () { return b; }, eq: function () { return b; },
      then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); },
    };
    return b;
  } });
Object.defineProperty(window.supa, "rpc", { configurable: true, writable: true,
  value: function (nom, args) { window.__rpc.push({ nom: nom, args: args }); return Promise.resolve(window.__rpcReponse); } });
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true,
  value: { invoke: function (nom, opts) { window.__pushes.push({ nom: nom, body: opts && opts.body }); return Promise.resolve({ data: { ok: true } }); } } });
// bootOnboarded neutralise supaAddComment/supaInsertNotif : on rend les VRAIES (copie posée par app-helper).
window.supaAddComment = window.__vraiSupa.addComment; window.supaInsertNotif = window.__vraiSupa.insertNotif;
window.supaEnsureProfileExists = async function () {};
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  await page.evaluate(([lea, lea2]) => {
    // Deux « Léa » : la résolution rend les DEUX identifiants (le client ne
    // tranche pas l'homonymie ; le serveur écrit vers chacun s'il est autorisé).
    state.seed.users = state.seed.users.filter((u) => u.id !== lea && u.id !== lea2);
    state.seed.users.push({ id: lea, name: "Léa", profileEmoji: "🌿" }, { id: lea2, name: "Léa", profileEmoji: "🌱" }, { id: "u_demo", name: "Démo", profileEmoji: "🎭" });
  }, [UID_LEA, UID_LEA2]);
}

test.describe("ASTRA-24 — les mentions partent au serveur, par identifiants, après l'atterrissage", () => {
  test("① commentaire : aucune ligne 'mention' écrite par le client ; la RPC porte les ids (les deux homonymes, pas le compte démo), APRÈS l'insert", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const ok = await supaAddComment("p1", "Bonjour @Léa et @Démo", "c1");
      await new Promise((res) => setTimeout(res, 60));
      return { ok, inserts: window.__inserts, rpc: window.__rpc, pushes: window.__pushes };
    });
    expect(r.ok).toBe(true);
    // AVANT : un insert `notifications` { kind: 'mention', content: "… t'a mentionné dans un commentaire" } par Léa trouvée.
    expect(r.inserts.filter((i) => i.table === "notifications"), "le client n'écrit plus de notification de mention").toEqual([]);
    expect(r.inserts[0].table).toBe("post_comments");
    expect(r.rpc.length).toBe(1);
    expect(r.rpc[0].nom).toBe("notifier_mentions");
    expect(r.rpc[0].args.p_genre).toBe("commentaire");
    expect(r.rpc[0].args.p_ref_id).toBe("p1");
    expect(r.rpc[0].args.p_mentionnes.sort()).toEqual([UID_LEA, UID_LEA2].sort());
    // Puis la push, une par identifiant demandé, sans texte (le serveur le dérive).
    const pushes = r.pushes.filter((p) => p.nom === "notify-call" && p.body.kind === "mention");
    expect(pushes.map((p) => p.body.toUserId).sort()).toEqual([UID_LEA, UID_LEA2].sort());
    expect(pushes.every((p) => !p.body.text)).toBe(true);
  });

  test("② TRANSITION : fonction absente (PGRST202) → rien d'autre, tracé ; aucun repli vers l'écriture client", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__rpcReponse = { data: null, error: { code: "PGRST202", message: "Could not find the function public.notifier_mentions in the schema cache" } };
      await supaAddComment("p1", "@Léa regarde", "c2");
      await new Promise((res) => setTimeout(res, 60));
      return { inserts: window.__inserts.filter((i) => i.table === "notifications"), pushes: window.__pushes.filter((p) => p.body && p.body.kind === "mention"), traces: window.__traces };
    });
    expect(r.inserts).toEqual([]);
    expect(r.pushes).toEqual([]);
    expect(r.traces.some((t) => /mentions_serveur_absente PGRST202/.test(t))).toBe(true);
  });

  test("③ message de groupe : les ids sont résolus à la composition, portés APRÈS l'envoi réussi — pas avant, pas sur un échec", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async ([lea, lea2]) => {
      const convs = getConversations();
      convs.push({ id: "grp_1", isGroup: true, groupName: "Les grimpeurs", userIds: [lea, lea2, "u_demo"], messages: [] });
      saveConversations();
      window._groupMemberName = function (id) { return id === lea ? "Léa" : id === lea2 ? "Léa" : "Démo"; };
      // La composition : ce que fait sendMessage (résolution + mémorisation), sans l'UI.
      _notifyMentions(convs.find((c) => c.id === "grp_1"), "salut @Léa", "m1");
      const avantEnvoi = { rpc: window.__rpc.length, attente: JSON.parse(JSON.stringify(window._mentionsEnAttente)) };
      // Un envoi qui ÉCHOUE (erreur transitoire) : rien ne part au serveur.
      const vraiFrom = window.supa.from;
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: function (t) { const b = vraiFrom(t); if (t === "conv_messages") b.insert = function () { return Promise.resolve({ data: null, error: { message: "503", status: 503 } }); }; return b; } });
      _sendTextToSupa("grp_1", "m1", "salut @Léa");
      await new Promise((res) => setTimeout(res, 80));
      const apresEchec = { rpc: window.__rpc.length };
      // Puis l'envoi RÉUSSIT : la RPC part, avec l'identifiant.
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: vraiFrom });
      _outboxRemove("m1");
      _sendTextToSupa("grp_1", "m1", "salut @Léa");
      await new Promise((res) => setTimeout(res, 80));
      return { avantEnvoi, apresEchec, rpc: window.__rpc, inserts: window.__inserts.filter((i) => i.table === "notifications" && i.row.kind === "mention") };
    }, [UID_LEA, UID_LEA2]);
    expect(r.avantEnvoi.rpc, "rien ne part au serveur à la composition").toBe(0);
    expect(r.avantEnvoi.attente.m1.ids.sort()).toEqual([UID_LEA, UID_LEA2].sort());
    expect(r.apresEchec.rpc, "rien ne part sur un envoi refusé").toBe(0);
    expect(r.rpc.length).toBe(1);
    expect(r.rpc[0].args).toMatchObject({ p_genre: "message", p_ref_id: "grp_1" });
    expect(r.rpc[0].args.p_mentionnes.sort()).toEqual([UID_LEA, UID_LEA2].sort());
    expect(r.inserts, "aucune ligne 'mention' écrite par le client").toEqual([]);
  });
});
