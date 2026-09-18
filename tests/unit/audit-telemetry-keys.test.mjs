// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES CLÉS DE TÉLÉMÉTRIE — l'analyseur voit ce que la regex ne voyait pas.
//
// LOT E (2026-09-18) : `passion` (publish_post/publish_reel) et `authorId`
// (rt_recv post) étaient JETÉES par scrubMeta depuis des semaines, audit VERT,
// parce que le premier argument était un ternaire et que l'audit exigeait un
// littéral. Chaque cas ci-dessous nomme la MUTATION qui le rend rouge.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  relever, clesObjet, decouperArguments, jeteesParmi, chargerDenyKeyDepuis,
} = require("../../scripts/audit-telemetry-keys.js");

const TELEMETRY = new URL("../../js/telemetry.js", import.meta.url);
const DENY_KEY = chargerDenyKeyDepuis(fs.readFileSync(TELEMETRY, "utf8"));

const cles = (src) => relever(src, "x.js").map((t) => t.cle);
const jetees = (src) => jeteesParmi(relever(src, "x.js"), DENY_KEY).map((t) => t.cle);

test("① DENY_KEY est LUE dans js/telemetry.js, jamais recopiée", () => {
  assert.ok(DENY_KEY instanceof RegExp);
  assert.ok(DENY_KEY.test("password"));
  assert.ok(!DENY_KEY.test("postId"));
});

test("② premier argument NON littéral (ternaire, variable) : les clés sont relevées", () => {
  // RÉINJECTION : sur l'ancien motif `tel\.action\(\s*["'…]`, ces deux appels
  // étaient invisibles — l'audit rendait OK sur `passion` et `authorId`.
  const src = `
    tel.action(post && post.is_reel ? "publish_reel" : "publish_post", { passion: post.passion, postId: post.id });
    tel.recv("post", { postId: r.id, authorId: r.author_id });
    tel.action(nom, { rc: "mdp" });
  `;
  assert.deepEqual(cles(src), ["passion", "postId", "postId", "authorId", "rc"]);
  assert.deepEqual(jetees(src), ["passion", "authorId"]);
});

test("③ les méthodes recv/click/perf/flowStart/step/flowEnd sont couvertes, settle ne l'est pas", () => {
  const src = `
    window.tel.click("btn", { label: x });
    tel.perf("boot", ms, { query: q });
    tel.flowStart(cur ? "event_leave" : "event_join", { eventId: id });
    tel.step(cid, "saved", "ok", { detail: d });
    tel.flowEnd(cid, "ok", { email: e });
    PassioTelemetry.recv("like", { pseudo: p });
    tel.settle(cid, "saved", false, { message: code, code: code });
  `;
  assert.deepEqual(jetees(src), ["label", "query", "email", "pseudo"]);
  // `settle` RENOMME message/code (→ detail/rc) : relever son 4e argument ferait
  // rougir l'audit sur un usage correct. MUTATION : ajouter "settle" à METHODES.
  assert.ok(!cles(src).includes("message"));
  assert.ok(!cles(src).includes("code"));
});

test("④ wrappers maison tel(/track(/_passionsPageTel( à deux arguments ; tel.track interne ignoré", () => {
  const src = `
    tel("guest_signup_started", { ctx: "irl", user: u });
    track("ui_v2_nav", { key: d.key, screen: d.screen });
    _passionsPageTel("passions_page", { plafond: 3 });
    track("session", "start", { message: "x", meta: { referrer: "direct" } });
    obj.track("x", { token: t });
  `;
  assert.deepEqual(jetees(src), ["user", "key"]);
  // Le `track(type, action, fields)` interne (3 args) : seul son \`meta: {…}\` compte.
  assert.ok(cles(src).includes("referrer"));
  assert.ok(!cles(src).includes("message"));
  // `obj.track(` n'est pas le wrapper.
  assert.ok(!cles(src).includes("token"));
});

test("⑤ raccourcis `{ ok, rc }`, clés entre guillemets, spreads ignorés", () => {
  assert.deepEqual(clesObjet(`{ ok, rc: "x", "delai_s": 3, ...reste, [calc]: 1 }`), ["ok", "rc", "delai_s"]);
  assert.deepEqual(clesObjet(`{ a: { b: 1 }, c: fn(1, 2), d: "x,y" }`), ["a", "c", "d"]);
  assert.deepEqual(clesObjet(`pasUnObjet`), []);
});

test("⑥ decouperArguments respecte chaînes, gabarits et imbrications", () => {
  const d = decouperArguments(`"a,b", \`x\${f(1, 2)}\`, { k: [1, 2] }, g((3), 4))`, 0);
  assert.equal(d.args.length, 4);
  assert.equal(d.args[2].trim(), "{ k: [1, 2] }");
  assert.equal(decouperArguments("jamais fermée", 0), null);
});

test("⑦ le dépôt réel : aucune clé jetée (c'est la gate de `npm run verif`)", () => {
  const dossier = new URL("../../js/", import.meta.url);
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith(".js"));
  let total = 0; const rouges = [];
  for (const f of fichiers) {
    const t = relever(fs.readFileSync(new URL(f, dossier), "utf8"), "js/" + f);
    total += t.length;
    rouges.push(...jeteesParmi(t, DENY_KEY).map((x) => x.fichier + ":" + x.ligne + " " + x.cle));
  }
  assert.deepEqual(rouges, []);
  assert.ok(total > 150, "l'analyseur doit relever nettement plus que l'ancien motif (87)");
});

// ── scrubMeta RÉEL : les clés renommées survivent au filtre ──────────────────
// On extrait DENY_KEY, redactString et scrubMeta de js/telemetry.js (par
// motif, comme chargerDenyKey) et on les exécute tels quels dans un bac à sable.
function scrubMetaReel() {
  const src = fs.readFileSync(TELEMETRY, "utf8");
  const bloc = (re) => { const m = src.match(re); assert.ok(m, re + " introuvable dans telemetry.js"); return m[0]; };
  const code = [
    bloc(/var DENY_KEY = \/[^\n]+\/i;/),
    bloc(/var EMAIL_RE = [^\n]+/), bloc(/var JWT_RE = [^\n]+/), bloc(/var LONGHEX_RE = [^\n]+/),
    bloc(/function redactString\(v\) \{[\s\S]*?\n  \}/),
    bloc(/function scrubMeta\(obj\) \{[\s\S]*?\n  \}/),
    "this.scrubMeta = scrubMeta;",
  ].join("\n");
  const ctx = {}; vm.runInNewContext(code, ctx); return ctx.scrubMeta;
}

test("⑧ pid, auteur, item et les clés du LOT E survivent au scrubMeta RÉEL ; passion/authorId/key non", () => {
  const scrub = scrubMetaReel();
  const out = scrub({
    pid: "cuisine", auteur: "a1b2", item: "feed", postId: "p1",
    rc: "non_confirme", mode: "signup", ok: true, delai_s: 42, panel: "deleteAccount",
    eventId: "e1", rsvp: "going", detail: "x", step: "saved",
    passion: "cuisine", authorId: "a1b2", key: "feed",
  });
  assert.deepEqual(Object.keys(out).sort(), [
    "auteur", "delai_s", "detail", "eventId", "item", "mode", "ok", "panel", "pid", "postId", "rc", "rsvp", "step",
  ]);
  assert.equal(out.pid, "cuisine");
  assert.equal(out.auteur, "a1b2");
});
