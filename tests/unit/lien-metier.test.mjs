// MSG-04 — le lien métier d'une push (supabase/functions/_shared/lien-metier.js).
//
// Le fichier testé est CELUI que Deno déploie dans `notify-call`. Le client
// Supabase est un FAUX scripté : chaque `from(table)` rend un constructeur qui
// mémorise ses filtres et résout depuis un jeu de lignes en mémoire — assez
// pour prouver la RÈGLE (quel lien ouvre la push, quel texte part), pas le SQL.
//   ① ② appel : 1:1 commune → ok ; groupe seul, aucune conversation, tiers → refus
//   ③ ④ notification : ligne récente de moi vers lui → ok, texte de LA LIGNE
//        (entités décodées) ; ligne ancienne, ligne d'un autre, ligne vers un
//        autre → refus
//   ⑤ identité : profil lu en base, bornée ; ligne absente → repli neutre
//   ⑥ une erreur de lecture est un REFUS (fail-closed), jamais une push
//   ⑦ decoderEntites : les cinq entités d'escapeHtml, et rien d'autre
import { test } from "node:test";
import assert from "node:assert/strict";
import { decoderEntites, identiteAppelant, lienAppel, lienNotification } from "../../supabase/functions/_shared/lien-metier.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T0 = Date.parse("2026-09-14T10:00:00Z");

/** Faux client : `tables` = { nom: [lignes] } ; `pannes` = tables qui rendent une erreur. */
function fauxAdmin(tables, pannes = []) {
  return {
    from(table) {
      const filtres = [];
      let limite = null, ordre = null;
      const exec = () => {
        if (pannes.includes(table)) return { data: null, error: { message: "panne " + table } };
        let rows = (tables[table] || []).filter((r) => filtres.every((f) => f(r)));
        if (ordre) rows = rows.slice().sort((x, y) => (x[ordre.col] < y[ordre.col] ? 1 : -1) * (ordre.asc ? -1 : 1));
        if (limite != null) rows = rows.slice(0, limite);
        return { data: rows, error: null };
      };
      const b = {
        select() { return b; },
        eq(col, v) { filtres.push((r) => r[col] === v); return b; },
        in(col, vals) { filtres.push((r) => vals.includes(r[col])); return b; },
        gte(col, v) { filtres.push((r) => String(r[col]) >= String(v)); return b; },
        order(col, o) { ordre = { col, asc: !!(o && o.ascending) }; return b; },
        limit(n) { limite = n; return b; },
        maybeSingle() { const r = exec(); return Promise.resolve({ data: r.error ? null : (r.data[0] || null), error: r.error }); },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return b;
    },
  };
}

const BASE = {
  profiles: [{ id: A, username: "Ben'j <b>x</b>", emoji: "🎸" }],
  conversations: [{ id: "dm_ab", is_group: false }, { id: "grp_abc", is_group: true }],
  conv_members: [
    { conv_id: "dm_ab", user_id: A }, { conv_id: "dm_ab", user_id: B },
    { conv_id: "grp_abc", user_id: A }, { conv_id: "grp_abc", user_id: B }, { conv_id: "grp_abc", user_id: C },
  ],
  notifications: [
    { from_id: A, user_id: B, kind: "message", content: "Ben&#39;j t&#39;a envoyé un message", created_at: new Date(T0 - 30_000).toISOString() },
    { from_id: A, user_id: C, kind: "like", content: "vieille", created_at: new Date(T0 - 3_600_000).toISOString() },
    { from_id: B, user_id: C, kind: "follow", content: "B te suit", created_at: new Date(T0 - 10_000).toISOString() },
  ],
};

test("① appel : une conversation 1:1 commune ouvre la push", async () => {
  assert.equal((await lienAppel(fauxAdmin(BASE), A, B)).ok, true);
});

test("② appel : un groupe commun ne suffit pas, ni l'absence de conversation, ni un tiers", async () => {
  // A et C ne partagent que le groupe.
  assert.equal((await lienAppel(fauxAdmin(BASE), A, C)).ok, false);
  // Un compte sans aucune conversation.
  assert.equal((await lienAppel(fauxAdmin(BASE), "dddddddd-dddd-4ddd-8ddd-dddddddddddd", B)).ok, false);
  // Le pair n'est dans aucune de mes conversations.
  const sansB = { ...BASE, conv_members: BASE.conv_members.filter((m) => m.user_id !== B) };
  assert.equal((await lienAppel(fauxAdmin(sansB), A, B)).ok, false);
});

test("③ notification : une ligne récente de moi vers lui ouvre la push, avec SON texte décodé", async () => {
  const r = await lienNotification(fauxAdmin(BASE), A, B, T0);
  assert.equal(r.ok, true);
  assert.equal(r.texte, "Ben'j t'a envoyé un message");
  assert.equal(r.kind, "message");
});

test("④ notification : ligne trop ancienne, ligne d'un autre émetteur, ligne vers un autre → refus", async () => {
  assert.equal((await lienNotification(fauxAdmin(BASE), A, C, T0)).ok, false, "1 h : hors fenêtre");
  assert.equal((await lienNotification(fauxAdmin(BASE), A, C, T0 - 3_599_000)).ok, true, "…mais dans la fenêtre à l'époque");
  assert.equal((await lienNotification(fauxAdmin(BASE), C, B, T0)).ok, false, "C n'a rien écrit vers B");
  assert.equal((await lienNotification(fauxAdmin(BASE), B, A, T0)).ok, false, "B n'a rien écrit vers A (sa ligne va vers C)");
});

test("⑤ identité : lue en base et bornée ; ligne absente → repli neutre", async () => {
  const idn = await identiteAppelant(fauxAdmin(BASE), A);
  assert.equal(idn.name, "Ben'j <b>x</b>"); // brut : c'est l'OS qui affiche, pas du HTML
  assert.equal(idn.emoji, "🎸");
  const long = { profiles: [{ id: A, username: "x".repeat(200), emoji: "🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸" }] };
  const b = await identiteAppelant(fauxAdmin(long), A);
  assert.equal(Array.from(b.name).length, 60);
  assert.equal(Array.from(b.emoji).length, 8);
  assert.deepEqual(await identiteAppelant(fauxAdmin({ profiles: [] }), A), { name: "Quelqu'un", emoji: "📞" });
});

test("⑥ une erreur de lecture est un refus, jamais une push", async () => {
  assert.equal((await lienAppel(fauxAdmin(BASE, ["conv_members"]), A, B)).ok, false);
  assert.equal((await lienAppel(fauxAdmin(BASE, ["conversations"]), A, B)).ok, false);
  assert.equal((await lienNotification(fauxAdmin(BASE, ["notifications"]), A, B, T0)).ok, false);
  // L'identité, elle, replie : un nom manquant ne doit pas empêcher un appel légitime.
  assert.deepEqual(await identiteAppelant(fauxAdmin(BASE, ["profiles"]), A), { name: "Quelqu'un", emoji: "📞" });
});

test("⑦ decoderEntites : les cinq entités d'escapeHtml, dans le bon ordre", () => {
  assert.equal(decoderEntites("a &amp;lt; b"), "a &lt; b"); // &amp; décodé en dernier : pas de double décodage
  assert.equal(decoderEntites("&lt;b&gt; &quot;x&quot; &#39;y&#x27;"), "<b> \"x\" 'y'");
  assert.equal(decoderEntites(null), "");
});
