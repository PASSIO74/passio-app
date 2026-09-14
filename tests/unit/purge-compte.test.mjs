// AUTH-05 / SUP-10 — la purge d'un compte est VÉRIFIÉE (supabase/functions/_shared/purge-compte.js).
//
// Le fichier testé est CELUI que Deno déploie dans `delete-account`. Le client
// Supabase est un FAUX en mémoire : tables = { nom: [lignes] }, seaux = { nom:
// { chemin: true } }, avec des pannes scriptables. Assez pour prouver la RÈGLE :
//   ① tout ce qui porte l'uid part, médias et pièces jointes compris, et `ok`
//   ② un delete en erreur est un ÉCHEC nommé — jamais avalé
//   ③ ce qui subsiste après relecture est un RESTE nommé, `ok` faux
//   ④ les pièces jointes sont relevées AVANT la suppression des messages, dans
//      les deux formes d'URL, sans doublon
//   ⑤ un seau illisible est un échec ; un dossier vide n'en est pas un
//   ⑥ la relecture illisible compte comme un reste (fail-closed)
//   ⑦ la liste des tables couvre bien celles que la base porte (schéma du 2026-09-14)
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgerCompte, cheminsPiecesJointes, TABLES_COMPTE, DOSSIERS_CONTENU } from "../../supabase/functions/_shared/purge-compte.js";

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTRE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fauxAdmin({ tables = {}, seaux = {}, pannesDelete = [], pannesCount = [], pannesList = [], pannesRemove = [] } = {}) {
  const t = JSON.parse(JSON.stringify(tables));
  const s = JSON.parse(JSON.stringify(seaux));
  return {
    _t: t, _s: s,
    from(table) {
      const filtres = [];
      let mode = "select", head = false;
      const rows = () => (t[table] || []).filter((r) => filtres.every((f) => f(r)));
      const b = {
        select(_c, o) { mode = "select"; head = !!(o && o.head); return b; },
        delete() { mode = "delete"; return b; },
        eq(col, v) { filtres.push((r) => r[col] === v); return b; },
        then(res, rej) {
          let out;
          if (mode === "delete") {
            if (pannesDelete.includes(table)) out = { data: null, error: { message: "panne delete " + table } };
            else { t[table] = (t[table] || []).filter((r) => !filtres.every((f) => f(r))); out = { data: null, error: null }; }
          } else if (head) {
            if (pannesCount.includes(table)) out = { data: null, count: null, error: { message: "panne count " + table } };
            else out = { data: null, count: rows().length, error: null };
          } else out = { data: rows(), error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from(seau) {
        return {
          list(prefixe) {
            if (pannesList.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne list" } });
            const noms = Object.keys(s[seau] || {}).filter((k) => k.startsWith(prefixe + "/")).map((k) => ({ name: k.slice(prefixe.length + 1) }));
            return Promise.resolve({ data: noms, error: null });
          },
          remove(chemins) {
            if (pannesRemove.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne remove" } });
            for (const c of chemins) delete (s[seau] || {})[c];
            return Promise.resolve({ data: chemins, error: null });
          },
        };
      },
    },
  };
}

function baseComplete() {
  const tables = {};
  for (const [table, col] of TABLES_COMPTE) {
    tables[table] = tables[table] || [];
    tables[table].push({ [col]: U, content: "x" }, { [col]: AUTRE, content: "y" });
  }
  tables.conv_messages = [
    { from_id: U, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/1_photo.jpg" }) },
    { from_id: U, content: JSON.stringify({ type: "audio", url: "https://passio-app.netlify.app/media/attachments/attachments/conv_1/2_voice.webm" }) },
    { from_id: U, content: "texte simple" },
    { from_id: AUTRE, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/3_autre.jpg" }) },
  ];
  const seaux = { content: {}, attachments: {
    "attachments/conv_1/1_photo.jpg": true, "attachments/conv_1/2_voice.webm": true, "attachments/conv_1/3_autre.jpg": true,
  } };
  for (const d of DOSSIERS_CONTENU) { seaux.content[`${d}/${U}/a.jpg`] = true; seaux.content[`${d}/${AUTRE}/b.jpg`] = true; }
  return { tables, seaux };
}

test("① tout ce qui porte l'uid part — lignes, huit dossiers de médias, pièces jointes — et rien d'autre", async () => {
  const admin = fauxAdmin(baseComplete());
  const r = await purgerCompte(admin, U);
  assert.deepEqual(r.echecs, []);
  assert.deepEqual(r.restes, []);
  assert.equal(r.ok, true);
  assert.equal(r.piecesJointes, 2);
  for (const [table, col] of TABLES_COMPTE) {
    assert.equal(admin._t[table].some((x) => x[col] === U), false, table + ":" + col + " purgée");
    assert.equal(admin._t[table].some((x) => x[col] === AUTRE), true, table + " : l'autre compte est intact");
  }
  for (const d of DOSSIERS_CONTENU) {
    assert.equal(admin._s.content[`${d}/${U}/a.jpg`], undefined, d + " purgé");
    assert.equal(admin._s.content[`${d}/${AUTRE}/b.jpg`], true, d + " de l'autre intact");
  }
  assert.equal(admin._s.attachments["attachments/conv_1/1_photo.jpg"], undefined);
  assert.equal(admin._s.attachments["attachments/conv_1/2_voice.webm"], undefined);
  assert.equal(admin._s.attachments["attachments/conv_1/3_autre.jpg"], true, "la pièce jointe de l'autre reste");
});

test("② un delete en erreur est un échec NOMMÉ, et ok est faux", async () => {
  const r = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesDelete: ["user_state"] }), U);
  assert.equal(r.ok, false);
  assert.ok(r.echecs.some((e) => e.startsWith("user_state:user_id")), JSON.stringify(r.echecs));
  assert.ok(r.restes.some((e) => e.startsWith("user_state:user_id=1")), "…et la relecture le voit aussi");
});

test("③ ce qui subsiste après relecture est un reste nommé", async () => {
  // Un delete qui « réussit » sans rien retirer (policy, trigger) : la relecture le dit.
  const admin = fauxAdmin(baseComplete());
  const vraiFrom = admin.from.bind(admin);
  admin.from = (table) => {
    const b = vraiFrom(table);
    if (table !== "blocks") return b;
    const vraiThen = b.then;
    b.then = (res, rej) => vraiThen.call(b, res, rej);
    const vraiDelete = b.delete;
    b.delete = () => { b.select("*", { head: true }); return b; }; // ne supprime pas : compte seulement
    return b;
  };
  const r = await purgerCompte(admin, U);
  assert.equal(r.ok, false);
  assert.deepEqual(r.echecs, []);
  assert.ok(r.restes.includes("blocks:blocker_id=1") && r.restes.includes("blocks:blocked_id=1"), JSON.stringify(r.restes));
});

test("④ les pièces jointes : deux formes d'URL, sans doublon, seulement celles de l'uid", () => {
  const lignes = [
    { content: JSON.stringify({ type: "media", url: "https://x.supabase.co/storage/v1/object/public/attachments/attachments/c1/a.jpg" }) },
    { content: JSON.stringify({ type: "media", url: "https://x.supabase.co/storage/v1/object/public/attachments/attachments/c1/a.jpg?x=1" }) },
    { content: JSON.stringify({ type: "audio", fileUrl: "https://passio-app.netlify.app/media/attachments/attachments/c2/v.webm" }) },
    { content: JSON.stringify({ type: "gif", url: "https://media.giphy.com/x.gif" }) },
    { content: JSON.stringify({ type: "media", url: "https://x.supabase.co/storage/v1/object/public/content/photos/u/p.jpg" }) },
    { content: "{pas du json" }, { content: null }, { content: "texte" },
  ];
  assert.deepEqual(cheminsPiecesJointes(lignes).sort(), ["attachments/c1/a.jpg", "attachments/c2/v.webm"]);
  assert.deepEqual(cheminsPiecesJointes(null), []);
});

test("⑤ un seau illisible est un échec ; un dossier vide n'en est pas un", async () => {
  const r1 = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesList: ["content"] }), U);
  assert.equal(r1.ok, false);
  assert.ok(r1.echecs.some((e) => e.startsWith("content/photos")));
  const r2 = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesRemove: ["attachments"] }), U);
  assert.equal(r2.ok, false);
  assert.ok(r2.echecs.some((e) => e.startsWith("attachments")));
  const vide = baseComplete(); vide.seaux.content = {}; vide.tables.conv_messages = [];
  const r3 = await purgerCompte(fauxAdmin(vide), U);
  assert.equal(r3.ok, true, JSON.stringify(r3));
  assert.equal(r3.piecesJointes, 0);
});

test("⑥ une relecture illisible compte comme un reste (fail-closed)", async () => {
  const r = await purgerCompte(fauxAdmin({ ...baseComplete(), pannesCount: ["profiles"] }), U);
  assert.equal(r.ok, false);
  assert.ok(r.restes.includes("profiles:id=illisible"), JSON.stringify(r.restes));
});

test("⑦ la liste couvre les tables à identifiant de compte du schéma du 2026-09-14, profiles en dernier", () => {
  const attendues = ["analytics_events", "blocks", "client_errors", "comment_interactions", "comment_likes", "conv_members",
    "conv_messages", "conv_reads", "event_attendees", "event_comments", "event_reactions", "events", "follows", "notifications",
    "passion_quotas", "passion_requests", "post_collaborators", "post_comments", "post_likes", "posts", "profiles",
    "push_subscriptions", "step_interactions", "stories", "story_views", "telemetry_events", "user_passions", "user_safety",
    "user_state", "video_lives"];
  const couvertes = new Set(TABLES_COMPTE.map(([t]) => t));
  for (const t of attendues) assert.ok(couvertes.has(t), t + " manque à TABLES_COMPTE");
  assert.deepEqual(TABLES_COMPTE[TABLES_COMPTE.length - 1], ["profiles", "id"]);
  assert.ok(TABLES_COMPTE.some(([t, c]) => t === "notifications" && c === "from_id"), "les notifications ENVOYÉES aussi (elles portent le nom)");
});
