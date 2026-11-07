// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — AUCUNE DONNÉE PERSONNELLE NE PART (audit H, 2026-11-02)
//
// Le VRAI js/telemetry.js est chargé dans une VM, mesure ACTIVE
// (`passio_telemetry = "1"`, hôte de production), `fetch` intercepté : on lit
// exactement le corps qui PARTIRAIT vers PostgREST. On tente ensuite de faire
// passer une donnée personnelle par CHAQUE champ qu'un appelant contrôle —
// `message`, `stack`, `correlation_id`, `endpoint`, `action`, `screen`, les
// valeurs ET les clés de `meta`, le pseudo (`user_label`) — et par chaque forme :
// e-mail, JWT, numéro de téléphone, URL avec `?plk=`, base64 long, hex long,
// data-URI, objet imbriqué, tableau. La preuve est le lot sérialisé : si la
// chaîne y figure en clair là où le filtre promet de la masquer, le test rougit.
//
// Ce que ce banc N'AFFIRME PAS — les limites sont MESURÉES, pas tues (tests ⑥ ⑨) :
//   · `redactString` masque e-mail, JWT, hex ≥ 32 et data-URI ; PAS un numéro de
//     téléphone ni un base64 non hex. Pour ces formes, la garantie vient des NOMS
//     de clés (DENY_KEY : tel, phone, base64, content, message…) et du refus des
//     objets/tableaux. Un appelant qui écrirait un numéro sous une clé neutre
//     (`meta.x`) passerait : mesuré avec `assert.equal` sur la valeur reçue. Une
//     amélioration du filtre fera rougir ⑥ — il faudra alors le mettre à jour.
//   · `action`, `screen`, `endpoint` ne passent que par `String().slice()` :
//     seul le code du dépôt les écrit (jamais une saisie) ; mesuré en ⑨. Exception
//     fermée le 2026-11-06 : le libellé d'un CLIC peut venir du texte affiché, il passe
//     par `_libelleClic` (cas en fin de fichier).
//   · Une URL complète posée comme VALEUR de `meta` (clé neutre `url`) part
//     entière, bornée à 160 : mesuré en ④.
// Les minuteurs du module (battement de cœur, hooks) sont neutralisés : sans ça
// le processus de test ne se termine jamais.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SOURCE = fs.readFileSync("js/telemetry.js", "utf8");

const EMAIL = "prenom.nom+test@exemple-domaine.fr";
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const TEL = "+33 6 12 34 56 78";
const PLK_URL = "https://passio-app.netlify.app/?plk=lk_secret_marqueur_123#post-42";
const BASE64 = "QmVuamFtaW4gTGEgRGFtZSBNZXRhbGxlcmllIEFubmVjeSBzZWNyZXQ=".repeat(4);
const HEX = "a".repeat(32) + "b".repeat(8);
const DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";

/**
 * Charge telemetry.js dans une VM : mesure active, hôte de production, config
 * Supabase posée (sinon rien ne part), `fetch` qui capture les lots. Les
 * `setInterval` sont inertes (aucun battement de cœur, aucun hook différé) ; les
 * `setTimeout` sont réels mais détachés (`unref`) : le processus se termine.
 */
function demarrer({ uid = null, label = null, search = "" } = {}) {
  const memoire = new Map([["passio_telemetry", "1"]]);
  const stockage = {
    getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
    setItem: (k, v) => memoire.set(k, String(v)),
    removeItem: (k) => memoire.delete(k),
  };
  const envois = [];
  const ctx = {
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36", onLine: true },
    location: { search, hostname: "passio-app.netlify.app", pathname: "/", hash: "", href: "https://passio-app.netlify.app/" + search },
    localStorage: stockage, sessionStorage: stockage,
    history: { state: null, replaceState() {} },
    document: { referrer: "", hidden: false, visibilityState: "visible", addEventListener() {}, querySelector: () => null },
    screen: { width: 390, height: 844 },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    performance: { now: () => Date.now(), getEntriesByType: () => [] },
    requestAnimationFrame: (f) => setTimeout(f, 0).unref(),
    fetch: (url, init) => {
      envois.push({ url, body: String((init && init.body) || "") });
      return Promise.resolve({ ok: true, status: 200 });
    },
    PASSIO_SUPABASE: { url: "https://njkiyoklssvefstljemx.supabase.co", anon: "anon-key-de-banc" },
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; },
    clearTimeout,
    setInterval: () => ({ inerte: true }),
    clearInterval() {},
    URL, URLSearchParams, console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
  };
  if (uid) ctx.MY_UID = uid;
  if (label) ctx.state = { user: { general: { username: label } } };
  ctx.window = ctx;
  vm.runInNewContext(SOURCE, ctx, { filename: "telemetry.js" });
  return { tel: ctx.tel, envois, ctx };
}

/**
 * Tout ce que la VM a envoyé, concaténé : c'est LÀ qu'une PII se cherche.
 * Deux passes : un envoi en vol (`sending`) bloque le flush suivant jusqu'à la
 * résolution de la promesse de `fetch` — un tour de boucle suffit.
 */
async function corpsEnvoyes(b) {
  for (let i = 0; i < 3; i++) { b.tel.flush(); await new Promise((r) => setImmediate(r)); }
  return b.envois.map((e) => e.body).join("\n");
}
/** Les événements partis, à plat. */
const partis = (b) => b.envois.map((e) => JSON.parse(e.body)).flat();

test("① le banc parle bien au VRAI module : un événement part, vers telemetry_events, en production", async () => {
  const b = demarrer();
  b.tel.action("banc_ok", { n: 1 });
  const corps = await corpsEnvoyes(b);
  assert.ok(b.envois.length >= 1, "au moins un lot doit partir");
  assert.match(b.envois[0].url, /\/rest\/v1\/telemetry_events$/);
  assert.ok(corps.includes('"action":"banc_ok"'));
  assert.ok(corps.includes('"env":"production"'));
});

test("② e-mail : masqué dans message, stack, correlation_id et les valeurs de meta ; la clé `email` est jetée", async () => {
  const b = demarrer();
  b.tel.track("error", "js_error", { message: "Échec pour " + EMAIL, stack: "at x (" + EMAIL + ")", correlation_id: EMAIL, meta: { detail: "contact " + EMAIL, email: EMAIL } });
  const corps = await corpsEnvoyes(b);
  assert.ok(!corps.includes(EMAIL), "l'adresse ne doit apparaître nulle part dans le lot : " + corps);
  assert.ok(corps.includes("[email]"), "le marqueur de masquage doit remplacer l'adresse");
  assert.ok(!/"email"/.test(corps), "la clé `email` de meta doit être jetée (DENY_KEY)");
});

test("③ JWT : masqué dans message, stack, correlation_id, meta ; les clés token/jwt/bearer/authorization sont jetées", async () => {
  const b = demarrer();
  b.tel.track("error", "js_error", { message: "Bearer " + JWT, stack: "Authorization: Bearer " + JWT, correlation_id: JWT, meta: { detail: JWT, token: JWT, jwt: JWT, bearer: JWT, authorization: JWT } });
  const corps = await corpsEnvoyes(b);
  assert.ok(!corps.includes(JWT), "le JWT ne doit apparaître nulle part : " + corps);
  assert.ok(corps.includes("[jwt]"));
  for (const k of ["token", "jwt", "bearer", "authorization"]) assert.ok(!corps.includes('"' + k + '"'), "clé jetée : " + k);
});

test("④ ?plk= : un marqueur FABRIQUÉ dans l'URL d'arrivée n'émet aucun link_open ; un correlation_id est borné à 64 ; LIMITE : une URL en valeur de meta part entière (160)", async () => {
  // L'URL d'arrivée porte un ?plk= qui n'a pas la forme d'un identifiant : la
  // capture au chargement doit l'IGNORER (rien n'entre en base par un lien forgé).
  const forge = demarrer({ search: "?plk=" + encodeURIComponent("<script>" + EMAIL + "</script>") });
  const corpsForge = await corpsEnvoyes(forge);
  assert.ok(!partis(forge).some((x) => x.action === "link_open"), "aucun link_open pour un marqueur hors forme");
  assert.ok(!corpsForge.includes(EMAIL) && !corpsForge.includes("<script>"), "rien du marqueur forgé ne part");
  assert.equal(forge.ctx.localStorage.getItem("passio_lien_arrivee_v1"), null, "le lien d'arrivée n'est pas mémorisé non plus");
  // Un marqueur conforme, lui, émet ; et un correlation_id posé par un appelant
  // est tronqué à 64 puis redacté.
  const b = demarrer({ search: "?plk=lk_ok_123" });
  b.tel.track("link", "link_open", { correlation_id: PLK_URL + "?x=" + EMAIL, message: "Ouverture " + PLK_URL, meta: { link_id: PLK_URL, url: PLK_URL } });
  const corps = await corpsEnvoyes(b);
  const evs = partis(b).filter((x) => x.action === "link_open");
  assert.equal(evs.length, 2, "le link_open du chargement (lk_ok_123) et celui de l'appelant");
  const ev = evs[1];
  assert.ok(String(ev.correlation_id).length <= 64, "correlation_id borné à 64 : " + ev.correlation_id);
  assert.ok(!corps.includes(EMAIL), "l'adresse collée après l'URL tombe avec la troncature (et serait redactée sinon)");
  // LIMITE MESURÉE : `url` et `link_id` ne sont pas des clés interdites, la valeur
  // part entière (bornée à 160). Un appelant ne doit donc jamais y mettre une URL
  // qui porte un secret : c'est au point d'appel de l'écrire, pas au filtre.
  assert.equal(ev.meta.url, PLK_URL, "LIMITE CONNUE : une URL en valeur de meta part telle quelle");
});

test("⑤ data-URI, hex long, base64 long dans message/stack/meta : data-URI et hex masqués, valeurs bornées", async () => {
  const b = demarrer();
  b.tel.track("error", "js_error", { message: DATA_URI, stack: "hash " + HEX + " b64 " + BASE64, meta: { detail: HEX, image: DATA_URI, b: BASE64 } });
  const corps = await corpsEnvoyes(b);
  assert.ok(!corps.includes(DATA_URI.slice(0, 40)), "une data-URI est remplacée par [data-uri]");
  assert.ok(corps.includes("[data-uri]"));
  assert.ok(!corps.includes(HEX), "un hex de 32+ caractères est remplacé par [hex]");
  assert.ok(corps.includes("[hex]"));
  const ev = partis(b).find((x) => x.action === "js_error");
  assert.ok(String(ev.stack).length <= 4001, "stack bornée à 4000");
  for (const v of Object.values(ev.meta)) if (typeof v === "string") assert.ok(v.length <= 161, "valeur de meta bornée à 160 : " + v.length);
  // Le base64 (non hex) n'est PAS reconnu par redactString : il part, tronqué à 160.
  assert.ok(ev.meta.b.startsWith(BASE64.slice(0, 100)), "LIMITE CONNUE : un base64 non hex n'est que tronqué");
});

test("⑥ LIMITE DITE : un numéro de téléphone sous une clé NEUTRE part en clair ; sous une clé nommée (tel/phone), il est jeté", async () => {
  const b = demarrer();
  b.tel.track("action", "banc_tel", { meta: { x: TEL, tel: TEL, phone: TEL, telephone: TEL, mobile: TEL, numero_tel: TEL } });
  const corps = await corpsEnvoyes(b);
  const ev = partis(b).find((x) => x.action === "banc_tel");
  // Ce que le filtre garantit AUJOURD'HUI : les clés qui disent « téléphone »
  // sont jetées (`tel` attrape aussi `telephone` et `numero_tel`).
  for (const k of ["tel", "phone", "telephone", "numero_tel"]) assert.ok(!(k in ev.meta), "clé jetée : " + k);
  // Ce qu'il NE garantit PAS, mesuré : la valeur sous une clé neutre part telle quelle.
  assert.equal(ev.meta.x, TEL, "LIMITE CONNUE : un numéro sous une clé neutre n'est pas masqué — si ce test rougit, le filtre a progressé : mettre à jour");
  assert.equal(ev.meta.mobile, TEL, "LIMITE CONNUE : `mobile` n'est pas une clé interdite");
  assert.ok(corps.includes(TEL));
});

test("⑦ objets et tableaux dans meta sont JETÉS ; 30 clés au plus ; `ech` et `trafic` ne se forgent pas depuis l'appelant", async () => {
  const b = demarrer();
  const meta = { profil: { email: EMAIL, tel: TEL }, liste: [EMAIL, JWT], ech: 1000, trafic: "equipe" };
  for (let i = 0; i < 40; i++) meta["k" + i] = i;
  b.tel.track("action", "banc_meta", { meta });
  const corps = await corpsEnvoyes(b);
  assert.ok(!corps.includes(EMAIL) && !corps.includes(JWT) && !corps.includes(TEL), "rien d'un objet imbriqué ou d'un tableau ne part");
  const ev = partis(b).find((x) => x.action === "banc_meta");
  assert.ok(!("profil" in ev.meta) && !("liste" in ev.meta));
  assert.ok(Object.keys(ev.meta).length <= 30, "30 clés au plus : " + Object.keys(ev.meta).length);
  assert.ok(!("ech" in ev.meta), "`ech` n'est posé que par le module, sur une ligne échantillonnée — jamais recopié de l'appelant");
  assert.ok(!("trafic" in ev.meta), "`trafic` est retiré sur un visiteur ordinaire, même si l'appelant le fabrique");
});

test("⑧ le pseudo (user_label) est redacté et borné à 40 ; un identifiant local `u_…` part à NULL", async () => {
  const b = demarrer({ uid: "u_fabrique_localement", label: EMAIL + " " + "x".repeat(80) });
  b.tel.action("banc_label", {});
  const corps = await corpsEnvoyes(b);
  const ev = partis(b).find((x) => x.action === "banc_label");
  assert.ok(!corps.includes(EMAIL), "le pseudo passe par redactString");
  assert.ok(ev.user_label == null || ev.user_label.length <= 40, "pseudo borné à 40");
  assert.equal(ev.user_id, null, "un identifiant local `u_…` n'est jamais envoyé comme user_id");
});

test("⑨ LIMITE DITE : `action`, `screen`, `endpoint` ne sont que bornés (80 / 200), jamais redactés — champs écrits par le code, pas par une saisie", async () => {
  const b = demarrer();
  b.tel.track("action", "contact:" + EMAIL, { screen: EMAIL, endpoint: "https://x/" + EMAIL });
  await corpsEnvoyes(b);
  const ev = partis(b).find((x) => x.action && x.action.startsWith("contact:"));
  assert.ok(ev, "le lot part");
  assert.ok(ev.action.length <= 80 && ev.endpoint.length <= 200);
  assert.equal(ev.action, "contact:" + EMAIL, "LIMITE CONNUE : `action` n'est pas redactée");
  assert.equal(ev.screen, EMAIL, "LIMITE CONNUE : `screen` n'est pas redacté");
  assert.equal(ev.endpoint, "https://x/" + EMAIL, "LIMITE CONNUE : `endpoint` n'est pas redacté");
});

// ── Audit 2026-11-06 : le libellé d'un clic et l'opposition ───────────────
const elementFictif = (attrs, texte = "") => ({
  getAttribute: (k) => (k in attrs ? attrs[k] : null), id: attrs.id || "", textContent: texte, tagName: "BUTTON",
});

test("audit 2026-11-06 : un libellé fixé par le code passe tel quel, le texte affiché passe au filtre", () => {
  const b = demarrer();
  const l = b.tel._libelleClic;
  assert.equal(l(elementFictif({ "data-tel": "nav_fil" }, "peu importe")), "nav_fil");
  assert.equal(l(elementFictif({ "data-screen": "explore" })), "explore");
  assert.equal(l(elementFictif({ id: "btnPublier" }, "Publier")), "#btnPublier");
  assert.equal(l(elementFictif({}, "Publier")), "Publier");
  assert.equal(l(elementFictif({})), "button");
  assert.equal(l(elementFictif({}, "Écrire à " + EMAIL)).includes(EMAIL), false, "adresse");
  assert.equal(l(elementFictif({}, "Appeler " + TEL)).includes("12 34 56"), false, "numéro");
  assert.equal(l(elementFictif({ "aria-label": "Contact " + EMAIL })).includes(EMAIL), false, "aria-label");
});

test("audit 2026-11-06 : le nom d'un compte connu ne part pas dans le libellé d'un clic", () => {
  const b = demarrer();
  b.ctx.state = { user: { name: "Moi Même" }, seed: { users: [{ name: "Camille Durand" }, { name: "Al" }] } };
  const l = b.tel._libelleClic;
  assert.equal(l(elementFictif({}, "Bloquer Camille Durand")), "[nom]");
  assert.equal(l(elementFictif({ "aria-label": "Profil de camille durand" })), "[nom]");
  assert.equal(l(elementFictif({}, "Voir le profil de Moi Même")), "[nom]");
  // Limite de mot : « Bob » ne masque pas « Bobines », et la Sentinelle retrouve le libellé dans le code.
  b.ctx.state.seed.users.push({ name: "Bob" });
  assert.equal(l(elementFictif({}, "Bobines")), "Bobines");
  assert.equal(l(elementFictif({}, "Profil de Bob")), "[nom]");
  // Un nom de deux lettres ne masque pas tous les boutons de l'application.
  assert.equal(l(elementFictif({}, "Alerter")), "Alerter");
});

test("audit 2026-11-06 : l'opposition vide ce qui attend d'être envoyé, file en mémoire et stock local", async () => {
  const b = demarrer();
  b.tel.action("avant_refus", { n: 1 });
  b.ctx.localStorage.setItem("passio_tel_backlog", "[]");
  b.tel.setEnabled(false);
  assert.equal(b.ctx.localStorage.getItem("passio_tel_backlog"), null);
  const corps = await corpsEnvoyes(b);
  assert.equal(corps.includes("avant_refus"), false, "aucun événement ne part après le refus");
});

test("audit 2026-11-06 : un lien ?telemetry=1 ne relève pas un refus enregistré", () => {
  const b = demarrer({ search: "?telemetry=1" });
  assert.equal(b.ctx.localStorage.getItem("passio_telemetry"), "1", "sans refus, le lien reste le moyen de déboguer");
  const memoire = new Map([["passio_telemetry", "0"]]);
  const stockage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k) };
  const ctx = {
    navigator: { userAgent: "x", language: "fr" },
    location: { search: "?telemetry=1", hostname: "passio-app.netlify.app", pathname: "/", hash: "", href: "https://passio-app.netlify.app/?telemetry=1", origin: "https://passio-app.netlify.app" },
    localStorage: stockage, sessionStorage: stockage,
    history: { state: null, replaceState() {} },
    document: { referrer: "", hidden: false, visibilityState: "visible", addEventListener() {}, querySelector: () => null, getElementById: () => null },
    screen: { width: 390, height: 844 }, matchMedia: () => ({ matches: false }), addEventListener() {},
    performance: { now: () => Date.now(), getEntriesByType: () => [] },
    requestAnimationFrame: (f) => setTimeout(f, 0).unref(),
    fetch: () => Promise.resolve({ ok: true, status: 200 }),
    PASSIO_SUPABASE: { url: "https://njkiyoklssvefstljemx.supabase.co", anon: "anon-key-de-banc" },
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); h.unref(); return h; }, clearTimeout,
    setInterval: () => ({ inerte: true }), clearInterval() {},
    URL, URLSearchParams, console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
  };
  ctx.window = ctx;
  vm.runInNewContext(SOURCE, ctx, { filename: "telemetry.js" });
  assert.equal(memoire.get("passio_telemetry"), "0");
});
