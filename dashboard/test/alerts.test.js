// ═══════════════════════════════════════════════════════════════════════════
// ALERTES — verrous de l'émetteur typé `raise`, du bruit et des sinks.
//
// Mesuré sur 14 jours (2026-09-18) : 125 alertes sur 133 étaient « API très
// lente » (une par appel > 4 s, par endpoint, re-sonnée toutes les 61 s) ou
// « connexion d'un testeur » (tout événement connectivity, y compris le premier
// envoi raté d'une page et la RÉCUPÉRATION) ; 0 acquittée ; NOTIFY_SINKS vide.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · retirer le test de cooldown dans emit()            → « cooldown »
//   · `alerte: n >= 1` dans evaluerLenteur               → « 1 appel lent isolé »
//   · retirer `devices >= 2 ||`                          → « 3 appels, 2 appareils »
//   · ne plus exclure status error / meta.masquee        → « timeout » / « masquée »
//   · alerter sur send_failed #1                         → « premier envoi raté »
//   · alerter sur recovered                              → « récupération »
//   · émettre offline sans délai de grâce                → « offline suivi d'online »
//   · retirer le filtre `level` d'autoAcquitter          → « high reste manuelle »
//   · appeler le sink avant db.update / sans isolation   → « sink qui jette »
//   · retirer la clé obligatoire de raise                → « clé obligatoire »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

const alerts = await import("../server/alerts.js");
const { raise, onEvent, flushOffline, autoAcquitter, listAlerts, evaluerLenteur, _resetForTests, _setSinksForTests } = alerts;
const sinks = await import("../server/notify-sinks.js");

const T0 = Date.parse("2026-09-18T10:00:00Z");
const MIN = 60_000;
const api = (over = {}) => ({ type: "api", endpoint: "/rest/v1/posts", status: "ok", http_status: 200, duration_ms: 6000, device_id: "dev_a", screen: "feed", ...over });
const conn = (over = {}) => ({ type: "connectivity", severity: "warn", action: "send_failed", device_id: "dev_a", user_label: "Testeur", message: "Échec d'envoi", meta: {}, ...over });
const vierge = () => { _resetForTests(); _setSinksForTests([]); };

// ─── raise ───────────────────────────────────────────────────────────────────
test("raise : clé obligatoire, manual:false, enregistrée et lisible", () => {
  vierge();
  assert.throws(() => raise({ level: "warn", title: "x" }), /key/);
  const r = raise({ key: "disk:low", level: "warn", title: "Disque", message: "2 Go", source: "disque" }, T0);
  assert.ok(r && r.id);
  assert.equal(r.manual, false);
  assert.equal(r.key, "disk:low");
  assert.equal(listAlerts()[0].id, r.id);
});

test("cooldown : même clé sous 60 s = une seule alerte ; cooldownMs:0 la lève ; cooldownMs long la garde", () => {
  vierge();
  assert.ok(raise({ key: "k1", level: "warn", title: "a" }, T0));
  assert.equal(raise({ key: "k1", level: "warn", title: "a" }, T0 + 30_000), null, "re-sonnée sous 60 s");
  assert.ok(raise({ key: "k1", level: "warn", title: "a" }, T0 + 61_000), "après 60 s elle repasse");
  assert.ok(raise({ key: "k2", level: "warn", title: "b", cooldownMs: 0 }, T0));
  assert.ok(raise({ key: "k2", level: "info", title: "b", cooldownMs: 0 }, T0 + 1), "cooldown 0 : la bascule warn→info passe tout de suite");
  assert.ok(raise({ key: "k3", level: "warn", title: "c", cooldownMs: 60 * MIN }, T0));
  assert.equal(raise({ key: "k3", level: "warn", title: "c", cooldownMs: 60 * MIN }, T0 + 30 * MIN), null, "cooldown d'une heure respecté");
});

// ─── API très lente ─────────────────────────────────────────────────────────
test("1 appel lent isolé → 0 alerte ; 3 appels lents d'un seul appareil parmi beaucoup d'appels rapides → 0", () => {
  vierge();
  onEvent(api(), T0);
  assert.equal(listAlerts().length, 0);
  // Six appels rapides du même endpoint (p50 sous le seuil) et trois lents du même appareil.
  for (let i = 0; i < 6; i++) onEvent(api({ duration_ms: 300, device_id: "dev_b" }), T0 + i * 1000);
  onEvent(api({ device_id: "dev_a" }), T0 + 10_000);
  onEvent(api({ device_id: "dev_a" }), T0 + 11_000);
  assert.equal(listAlerts().length, 0, "un seul testeur lent, endpoint globalement rapide : rien");
});

test("3 appels lents sur 2 appareils → 1 alerte agrégée warn kind:reseau, puis silence 60 min", () => {
  vierge();
  onEvent(api({ device_id: "dev_a" }), T0);
  onEvent(api({ device_id: "dev_a" }), T0 + 1000);
  onEvent(api({ device_id: "dev_b" }), T0 + 2000);
  const l = listAlerts();
  assert.equal(l.length, 1);
  assert.equal(l[0].level, "warn");
  assert.equal(l[0].key, "apislow:/rest/v1/posts");
  assert.equal(l[0].meta.kind, "reseau");
  assert.equal(l[0].meta.devices, 2);
  assert.match(l[0].message, /3 appels lents/);
  onEvent(api({ device_id: "dev_c" }), T0 + 10 * MIN);
  assert.equal(listAlerts().length, 1, "deuxième salve à +10 min : cooldown 60 min");
  onEvent(api({ device_id: "dev_c" }), T0 + 61 * MIN);
  onEvent(api({ device_id: "dev_d" }), T0 + 61 * MIN + 1000);
  onEvent(api({ device_id: "dev_d" }), T0 + 61 * MIN + 2000);
  assert.equal(listAlerts().length, 2, "après l'heure, une nouvelle fenêtre peut alerter");
});

test("p50 : quand la moitié des appels d'un endpoint est lente, un seul appareil suffit", () => {
  vierge();
  for (let i = 0; i < 3; i++) onEvent(api({ device_id: "dev_a" }), T0 + i * 1000);
  assert.equal(listAlerts().length, 1, "3 lents sur 3 : p50 > 4 s");
});

test("timeout (status error, http 0) et échec masqué n'entrent pas dans « API très lente »", () => {
  vierge();
  for (let i = 0; i < 4; i++) onEvent(api({ status: "error", http_status: 0, duration_ms: 30_000, device_id: "dev_" + i }), T0 + i);
  assert.equal(listAlerts().length, 0, "timeout");
  for (let i = 0; i < 4; i++) onEvent(api({ meta: { masquee: true }, device_id: "dev_" + i }), T0 + i);
  assert.equal(listAlerts().length, 0, "masquée");
});

test("evaluerLenteur est pure : n, p50, appareils, verdict", () => {
  const v = evaluerLenteur([{ ms: 100 }, { ms: 5000, device: "a" }, { ms: 6000, device: "b" }, { ms: 7000, device: "a" }]);
  assert.equal(v.n, 3); assert.equal(v.total, 4); assert.equal(v.devices, 2); assert.equal(v.alerte, true);
  assert.equal(evaluerLenteur([{ ms: 5000, device: "a" }, { ms: 5000, device: "a" }]).alerte, false);
});

// ─── Connexion d'un testeur ─────────────────────────────────────────────────
test("premier envoi raté (#1) → 0 ; à partir de 3 échecs → 1 alerte warn kind:reseau ; cooldown 30 min par appareil", () => {
  vierge();
  onEvent(conn({ meta: { failed_sends: 1 } }), T0);
  assert.equal(listAlerts().length, 0, "un premier envoi raté au chargement d'une page n'est pas une panne");
  onEvent(conn({ meta: { failed_sends: 3 } }), T0 + 1000);
  const l = listAlerts();
  assert.equal(l.length, 1);
  assert.equal(l[0].level, "warn", "un seul testeur = son réseau, pas notre code : pas d'analyse Claude");
  assert.equal(l[0].key, "conn:dev_a");
  assert.equal(l[0].meta.kind, "reseau");
  onEvent(conn({ meta: { failed_sends: 10 } }), T0 + 20 * MIN);
  assert.equal(listAlerts().length, 1, "même appareil sous 30 min : silence");
  onEvent(conn({ severity: "error", meta: { failed_sends: 70 } }), T0 + 31 * MIN);
  assert.equal(listAlerts().length, 2);
});

test("la récupération n'est jamais une alerte", () => {
  vierge();
  onEvent(conn({ action: "recovered", status: "ok", message: "Connexion rétablie après 1 échec(s)" }), T0);
  onEvent(conn({ action: "online", severity: "info" }), T0 + 1);
  assert.equal(listAlerts().length, 0);
});

test("offline suivi d'online sous 2 min → 0 ; offline sans retour → 1 alerte après le délai de grâce", () => {
  vierge();
  onEvent(conn({ action: "offline", message: "Appareil passé hors ligne" }), T0);
  assert.equal(listAlerts().length, 0, "pas d'alerte immédiate");
  onEvent(conn({ action: "online", severity: "info" }), T0 + 30_000);
  assert.deepEqual(flushOffline(T0 + 3 * MIN), []);
  assert.equal(listAlerts().length, 0, "revenu en ligne sous 2 min : rien");
  onEvent(conn({ action: "offline", device_id: "dev_z" }), T0 + 5 * MIN);
  assert.equal(flushOffline(T0 + 6 * MIN).length, 0, "toujours dans le délai de grâce");
  assert.equal(flushOffline(T0 + 8 * MIN).length, 1, "2 min sans retour : c'est une coupure");
  assert.equal(listAlerts()[0].key, "conn:dev_z");
});

test("3 appareils en difficulté en 15 min → alerte agrégée conn:window (high)", () => {
  vierge();
  for (const d of ["dev_1", "dev_2", "dev_3"]) onEvent(conn({ device_id: d, meta: { failed_sends: 3 } }), T0);
  const keys = listAlerts().map((a) => a.key);
  assert.ok(keys.includes("conn:window"));
  assert.equal(listAlerts().find((a) => a.key === "conn:window").level, "high");
  assert.equal(keys.filter((k) => k === "conn:window").length, 1);
});

// ─── Dossiers d'incident ────────────────────────────────────────────────────
test("pas de dossier d'incident pour info, ni pour la première occurrence conn:/apislow: en 24 h", () => {
  vierge();
  const i = raise({ key: "linkopen:x", level: "info", title: "Lien ouvert" }, T0);
  assert.equal(i.incidentId, undefined);
  onEvent(conn({ device_id: "dev_p", meta: { failed_sends: 3 } }), T0);
  assert.equal(listAlerts()[0].incidentId, undefined, "première occurrence : pas de paquet");
  onEvent(conn({ device_id: "dev_p", meta: { failed_sends: 3 } }), T0 + 31 * MIN);
  assert.ok(listAlerts()[0].incidentId, "deuxième occurrence en 24 h : paquet");
  const h = raise({ key: "obs:dbread", level: "high", title: "Base illisible" }, T0);
  assert.ok(h.incidentId, "une high a toujours son dossier");
});

// ─── Auto-acquittement ──────────────────────────────────────────────────────
test("auto-acquittement : warn muette depuis 6 h → ackBy auto ; récente → non ; high reste manuelle", () => {
  vierge();
  raise({ key: "apislow:/a", level: "warn", title: "vieille" }, T0 - 7 * 60 * MIN);
  raise({ key: "apislow:/b", level: "warn", title: "recente" }, T0 - 60 * MIN);
  raise({ key: "obs:canary", level: "high", title: "haute" }, T0 - 30 * 60 * MIN);
  assert.equal(autoAcquitter({ now: T0 }), 1);
  const par = Object.fromEntries(listAlerts().map((a) => [a.key, a]));
  assert.equal(par["apislow:/a"].acknowledged, true);
  assert.equal(par["apislow:/a"].ackBy, "auto");
  assert.equal(par["apislow:/b"].acknowledged, false);
  assert.equal(par["obs:canary"].acknowledged, false, "high reste manuelle");
});

// ─── Sinks ──────────────────────────────────────────────────────────────────
test("un sink qui jette (sync ou async) n'empêche ni l'enregistrement ni le flux ; un sink est appelé une fois par clé", async () => {
  _resetForTests();
  const vus = [];
  _setSinksForTests([
    { type: "casse", enabled: true, accepte: () => true, envoyer: () => { throw new Error("boum"); } },
    { type: "casse2", enabled: true, accepte: () => true, envoyer: async () => { throw new Error("boum async"); } },
    { type: "espion", enabled: true, accepte: (a) => a.key.startsWith("disk:"), envoyer: async (a) => { vus.push(a.key); } },
    { type: "eteint", enabled: false, accepte: () => true, envoyer: () => { vus.push("ETEINT"); } },
  ]);
  const r = raise({ key: "disk:low", level: "warn", title: "Disque" }, T0);
  assert.ok(r, "l'alerte est émise malgré les sinks cassés");
  assert.equal(listAlerts()[0].key, "disk:low");
  raise({ key: "disk:low", level: "warn", title: "Disque" }, T0 + 1000);
  raise({ key: "obs:x", level: "high", title: "autre" }, T0);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(vus, ["disk:low"], "le sink voit la clé une fois (cooldown) et ne voit pas les clés qu'il refuse ; un sink éteint n'est pas appelé");
  _setSinksForTests([]);
});

test("sink GitHub [POSTE] : une issue label poste (jamais claude), dédup 24 h par clé, refermée quand tout est revenu", async () => {
  const appels = [];
  let numero = 0;
  const execFileImpl = (cmd, args, opts, cb) => {
    appels.push([cmd, ...args]);
    if (args[0] === "issue" && args[1] === "list") return cb(null, "[]", "");
    if (args[0] === "issue" && args[1] === "create") { numero = 42; return cb(null, "https://github.com/PASSIO74/passio-app/issues/42\n", ""); }
    cb(null, "", "");
  };
  const memoire = { data: { issue: null, cles: {}, labelOk: false }, get() { return this.data; }, update(fn) { fn(this.data); return this; } };
  const s = sinks.sinkGithubPoste({ execFileImpl, db: memoire, now: () => T0 });
  assert.equal(s.accepte({ key: "disk:low", level: "warn" }), true);
  assert.equal(s.accepte({ key: "apislow:/x", level: "warn" }), false, "seules les clés du poste sortent");
  assert.equal(s.accepte({ key: "disk:low", level: "info" }), false, "un retour sans panne connue ne fait rien");

  const r1 = await s.envoyer({ key: "disk:low", level: "warn", title: "Disque presque plein", ts: T0 });
  assert.equal(r1.action, "publie"); assert.equal(r1.issue, 42);
  const creation = appels.find((a) => a[1] === "issue" && a[2] === "create");
  assert.ok(creation, "gh issue create appelé");
  assert.equal(creation[0], "gh");
  assert.ok(creation.includes(sinks.TITRE_POSTE));
  assert.ok(creation.includes("--label") && creation[creation.indexOf("--label") + 1] === "poste");
  assert.ok(!creation.includes("claude"), "jamais le label claude : c'est un message à un humain, pas une enquête");
  assert.ok(creation.includes("--body-file"), "le corps passe par un fichier, jamais par un argument ni un shell");

  const avant = appels.length;
  const r2 = await s.envoyer({ key: "disk:low", level: "warn", title: "Disque presque plein", ts: T0 + 60_000 });
  assert.equal(r2.action, "dedup");
  assert.equal(appels.length, avant, "même clé sous 24 h : aucun appel gh");

  await s.envoyer({ key: "claudecli:logged_out", level: "warn", title: "Claude Code déconnecté", ts: T0 });
  assert.ok(appels.some((a) => a[1] === "issue" && a[2] === "edit" && a[3] === "42"), "une deuxième clé actualise l'issue existante");

  assert.equal(s.accepte({ key: "disk:low", level: "info" }), true);
  await s.envoyer({ key: "disk:low", level: "info", title: "Disque : de la place à nouveau", ts: T0 });
  assert.ok(!appels.some((a) => a[2] === "close"), "une clé encore active : on n'a pas refermé");
  await s.envoyer({ key: "claudecli:logged_out", level: "info", title: "Claude Code reconnecté", ts: T0 });
  assert.ok(appels.some((a) => a[1] === "issue" && a[2] === "close" && a[3] === "42"), "toutes les clés revenues : issue refermée");
  assert.equal(s._etat().issue, null);
});

test("le corps de l'issue [POSTE] porte clé, titre et geste — jamais un chemin ni un identifiant", () => {
  const corps = sinks.composerCorpsPoste({
    "disk:low": { level: "warn", title: "Disque presque plein", since: T0 },
    "obs:dbread": { level: "high", title: "Base illisible", since: T0 },
  }, T0);
  assert.match(corps, /disk:low/); assert.match(corps, /Geste :/); assert.match(corps, /obs:dbread/);
  assert.doesNotMatch(corps, /[A-Za-z]:\\|\/Users\/|dev_[a-z0-9]{6}|@/, "aucun chemin, aucun identifiant, aucune adresse");
  assert.ok(corps.indexOf("obs:dbread") < corps.indexOf("disk:low"), "la plus grave d'abord");
});

test("construireSinks : rien sans variables d'environnement ; webhook seulement si l'URL est posée", () => {
  assert.deepEqual(sinks.construireSinks({}), []);
  const w = sinks.construireSinks({ DASH_NOTIFY_WEBHOOK: "https://exemple.invalid/hook" }, { fetchImpl: async () => ({ ok: true }) });
  assert.equal(w.length, 1); assert.equal(w[0].type, "webhook");
  assert.equal(w[0].accepte({ level: "warn" }), false, "niveau minimal high par défaut");
  assert.equal(w[0].accepte({ level: "high" }), true);
});
