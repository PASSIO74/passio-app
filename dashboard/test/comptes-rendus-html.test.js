// ═══════════════════════════════════════════════════════════════════════════
// COMPTES RENDUS — verrous de l'INTERFACE (Accueil app.js, Pilot mobile.js/mobile.html).
//
// Le corps du digest et les lignes de veille viennent d'issues GitHub : le
// texte est DONNÉE. Le cahier (lot F) pose deux règles — « échapper TOUT le
// HTML d'abord » et « liens uniquement depuis les `url` de l'API, vers
// github.com » — et exige la présence de la carte sur l'Accueil et le Pilot.
// Mesuré le 2026-09-18 : cinq mutations restaient vertes sur 555 tests. Ce banc
// les fait rougir ; les helpers sont ÉVALUÉS DEPUIS LE SOURCE réel, jamais
// recopiés (même patron que spa-echappement.test.js → helpers()).
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · U1 : `esc(t).split("\n")` → `t.split("\n")` dans crMarkdown       → « U1 »
//   · U2 : crLien `/^https:\/\/github\.com\//.test(u) ?` → `true ?`      → « U2 »
//   · U3 : mobile.js lienGithub sans le filtre `^https:\/\/github\.com\/` → « U3 »
//   ·      mobile.js renderComptesRendus avec innerHTML/insertAdjacentHTML → « U3 »
//   · U4 : app.js `api.get("/comptes-rendus")` retiré du Promise.all       → « U4 »
//   ·      app.js `setHtml("#ovComptesRendus", comptesRendusHtml(cr))` retiré → « U4 »
//   · U5 : mobile.js `["comptes", "/comptes-rendus"]` → `/attente`        → « U5 »
//   ·      mobile.html sans `id="comptesRendus"` sous m-attente            → « U5 »
//   · crPill("constructor") rend la fonction Object (lookup sans hasOwn) → « pastille »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const APP = fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8");
const MOBILE = fs.readFileSync(path.join(PUB, "js", "mobile.js"), "utf8");
const HTML = fs.readFileSync(path.join(PUB, "mobile.html"), "utf8");

const bloc = (src, re, nom, fichier) => { const m = re.exec(src); assert.ok(m, `${nom} introuvable dans ${fichier} — relis-le avant d'ajuster ce test`); return m[0]; };

/**
 * Évalue les helpers de la carte depuis le SOURCE réel d'app.js. ⚠️ `new Function`
 * sur du texte interpolé n'est acceptable QUE parce que le texte vient d'un
 * fichier du dépôt, jamais d'une entrée. Ce n'est pas un motif à reproduire.
 */
function helpers() {
  const src = [
    bloc(APP, /^const esc = .*$/m, "esc", "app.js"),
    bloc(APP, /^const CR_ETAT_CLS = .*$/m, "CR_ETAT_CLS", "app.js"),
    bloc(APP, /^const CR_ETAT_LIB = .*$/m, "CR_ETAT_LIB", "app.js"),
    bloc(APP, /^const CR_TEXTE_MAX = .*$/m, "CR_TEXTE_MAX", "app.js"),
    bloc(APP, /^function crPill\(.*$/m, "crPill", "app.js"),
    bloc(APP, /^function crLien\([\s\S]*?\n\}$/m, "crLien", "app.js"),
    bloc(APP, /^function crMarkdown\([\s\S]*?\n\}$/m, "crMarkdown", "app.js"),
  ].join("\n");
  return new Function(`${src}\nreturn { esc, crPill, crLien, crMarkdown, CR_TEXTE_MAX };`)();
}

test("U1 : crMarkdown échappe TOUT le HTML avant de poser h4 / li / strong / br — un <img onerror> lu dans une issue n'est jamais vif", () => {
  const { crMarkdown, CR_TEXTE_MAX } = helpers();
  const h = crMarkdown("<img src=x onerror=alert(1)>\n## t\n- **a**");
  assert.ok(!h.includes("<img"), "le chevron de la donnée est neutralisé : " + h);
  assert.ok(h.includes("&lt;img src=x onerror=alert(1)&gt;"), "… et rendu comme texte : " + h);
  assert.ok(h.includes("<h4>t</h4>"), "## → h4 : " + h);
  assert.ok(h.includes("<ul><li><strong>a</strong></li></ul>"), "- ** ** → li/strong : " + h);
  // Guillemets, apostrophes, esperluettes et balises fermantes : jamais bruts.
  const g = crMarkdown(`a"b'c&d</script><script>alert(1)</script>`);
  assert.ok(!/[<>"']/.test(g.replace(/<br>/g, "")), "aucun chevron ni guillemet brut hors notre <br> : " + g);
  assert.ok(g.includes("&quot;") && g.includes("&#39;") && g.includes("&amp;") && g.includes("&lt;script&gt;"), g);
  // Aucun lien construit depuis le texte : une URL reste du texte.
  const u = crMarkdown("voir https://evil.example/x et [lien](javascript:alert(1))");
  assert.ok(!u.includes("<a"), "aucune ancre tirée du texte : " + u);
  // Bornée : au-delà de CR_TEXTE_MAX, « … ».
  assert.equal(CR_TEXTE_MAX, 8000);
  const long = crMarkdown("y".repeat(9000));
  assert.ok(long.includes(" …") && !long.includes("y".repeat(8001)), "le corps est coupé à 8 000 puis « … »");
  // Sans corps : rien d'autre que notre propre <br> (crDigestHtml n'appelle pas crMarkdown sur un corps vide).
  assert.match(crMarkdown(null), /^(<br>)?$/); assert.match(crMarkdown(""), /^(<br>)?$/);
});

test("U2 : crLien ne rend un <a> que pour une URL https://github.com/ — javascript:, http:, un autre hôte rendent \"\" ; libellé et href échappés, rel=noopener", () => {
  const { crLien } = helpers();
  assert.equal(crLien("javascript:alert(1)", "x"), "");
  assert.equal(crLien("https://evil.example/", "x"), "");
  assert.equal(crLien("http://github.com/PASSIO74/passio-app", "x"), "", "http (non chiffré) refusé");
  assert.equal(crLien("https://github.com.evil.example/x", "x"), "", "un hôte qui commence par github.com n'est pas github.com");
  assert.equal(crLien("", "x"), ""); assert.equal(crLien(null, "x"), ""); assert.equal(crLien(undefined, "x"), "");
  const ok = crLien('https://github.com/PASSIO74/passio-app/issues/1?a="b', '<b>"x');
  assert.ok(ok.startsWith("<a "), ok);
  assert.ok(ok.includes('href="https://github.com/PASSIO74/passio-app/issues/1?a=&quot;b"'), "href échappé : " + ok);
  assert.ok(ok.includes('rel="noopener"') && ok.includes('target="_blank"'), ok);
  assert.ok(ok.includes("&lt;b&gt;&quot;x</a>") && !ok.includes("<b>"), "libellé échappé : " + ok);
});

test("pastille : crPill rend l'une des quatre classes, jamais une clé du prototype (constructor, __proto__) ni un état inconnu", () => {
  const { crPill } = helpers();
  assert.equal(crPill("ok"), '<span class="pill ok">ok</span>');
  assert.equal(crPill("warn"), '<span class="pill warn">attention</span>');
  assert.equal(crPill("alert"), '<span class="pill error">alerte</span>');
  assert.equal(crPill("unknown"), '<span class="pill info">?</span>');
  for (const e of ["constructor", "__proto__", "toString", "hasOwnProperty", "BOUM", "", null, undefined, 0]) {
    assert.equal(crPill(e), '<span class="pill info">?</span>', "état hors contrat → unknown : " + String(e));
  }
});

test("U4 : l'Accueil demande /comptes-rendus dans le MÊME Promise.all que /attente et monte comptesRendusHtml(cr) dans #ovComptesRendus", () => {
  const debut = APP.indexOf("VIEWS.overview = async");
  assert.ok(debut >= 0, "VIEWS.overview introuvable");
  const fin = APP.indexOf("\nVIEWS.", debut + 1);
  const overview = APP.slice(debut, fin > 0 ? fin : undefined);
  const promesses = bloc(overview, /const \[[^\]]*\] = await Promise\.all\(\[[\s\S]*?\]\);/, "le Promise.all de refresh()", "VIEWS.overview");
  assert.ok(promesses.includes('api.get("/attente")'), promesses);
  assert.ok(promesses.includes('api.get("/comptes-rendus").catch(() => null)'), "la carte lit /comptes-rendus, et « non lus » sur échec — jamais un compte rendu vide : " + promesses);
  assert.ok(/const \[[^\]]*\bcr\b[^\]]*\] = await Promise\.all/.test(promesses), "la réponse est nommée `cr` : " + promesses);
  assert.ok(overview.includes('setHtml("#ovComptesRendus", comptesRendusHtml(cr))'), "la carte est montée depuis la réponse de la route");
  assert.ok(overview.includes('<div id="ovComptesRendus"></div>'), "le conteneur existe dans le montage de l'Accueil");
  assert.ok(overview.indexOf('id="ovAttente"') < overview.indexOf('id="ovComptesRendus"'), "sous « Ce qui t'attend »");
  assert.ok(/^function comptesRendusHtml\(cr\)/m.test(APP), "comptesRendusHtml existe");
});

test("U3 : mobile.js — renderComptesRendus construit ses nœuds (ni innerHTML ni insertAdjacentHTML) ; lienGithub n'accepte que https://github.com/", () => {
  const rendu = bloc(MOBILE, /^function renderComptesRendus\(cr\) \{[\s\S]*?\n\}$/m, "renderComptesRendus", "mobile.js");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(rendu), "rendu par card()/textContent seulement");
  assert.ok(!/\.href\s*=/.test(rendu), "aucun href posé hors lienGithub");
  assert.ok(/\bcard\(/.test(rendu) && /lienGithub\(/.test(rendu), rendu);
  const lien = bloc(MOBILE, /^function lienGithub\(el, url\) \{[\s\S]*?\n\}$/m, "lienGithub", "mobile.js");
  assert.ok(lien.includes("^https:\\/\\/github\\.com\\/"), "le filtre github.com est là : " + lien);
  assert.ok(/if \(!\/\^https:\\\/\\\/github\\\.com\\\/\/\.test\(u\)\) return;/.test(lien), "… et il REFUSE (return) tout le reste : " + lien);
  assert.ok(lien.includes('l.rel = "noopener"') && lien.includes('l.textContent ='), lien);
  // crState : un état hors contrat (clé du prototype) ne devient pas une fonction dans la pastille.
  assert.ok(/^const crState = \(etat\) => \(Object\.hasOwn\(CR_STATE, etat\) \? CR_STATE\[etat\] : "UNKNOWN"\);$/m.test(MOBILE), "crState par hasOwn");
  assert.ok(!/CR_STATE\[[^\]]+\]\s*\|\|/.test(MOBILE), "aucun lookup direct `CR_STATE[x] ||` (constructor → fonction)");
});

test("U5 : le Pilot mobile demande /comptes-rendus dans sa liste de fetch, rend renderComptesRendus(map.comptes.value) et mobile.html porte la section sous m-attente", () => {
  assert.ok(MOBILE.includes('["comptes", "/comptes-rendus"]'), "la route est dans la liste des requêtes (Promise.allSettled)");
  assert.ok(MOBILE.includes('map.comptes.status === "fulfilled" ? renderComptesRendus(map.comptes.value) : unavailable("comptesRendus", "Comptes rendus non lus", map.comptes.reason)'),
    "rendu sur succès, « non lus » sur échec — jamais une carte vide");
  assert.ok(HTML.includes('id="comptesRendus"'), "le conteneur existe");
  assert.ok(/<section class="m-attente m-comptes-rendus" aria-label="Comptes rendus">/.test(HTML), "la section m-comptes-rendus");
  assert.ok(HTML.indexOf('id="attente"') < HTML.indexOf('id="comptesRendus"'), "sous « Ce qui t'attend »");
  assert.ok(HTML.indexOf('id="comptesRendus"') < HTML.indexOf('<nav class="m-tabs"'), "dans l'onglet Santé, avant la barre d'onglets");
  assert.ok(MOBILE.includes("aucun tableau de veille lu (première exécution après fusion ?)"), "le message du cahier quand la veille est null");
});
