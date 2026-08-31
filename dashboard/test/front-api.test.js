// ═══════════════════════════════════════════════════════════════════════════
// CONTRAT ENTRE LA PAGE ET LE SERVEUR — la seule chose qu'on pouvait vérifier
// sans navigateur, et la plus utile.
//
// La SPA (3 000 lignes de vanilla, aucun bundler, aucun typage) appelle 60
// points d'API. Renommer une route côté serveur, ou se tromper d'une lettre
// côté page, ne casse RIEN au chargement : le panneau concerné reste
// simplement vide, avec un 404 dans une console que personne ne regarde. C'est
// exactement le mode de panne « un onglet se vide sans que rien ne rougisse ».
//
// Ce fichier lit les DEUX côtés — les appels réellement écrits dans
// `public/js/*.js`, les routes réellement déclarées dans `server/index.js` — et
// les confronte. Il ne remplace pas un test de navigateur : il ne dit rien de ce
// qui s'affiche. Il dit que ce que la page demande existe, avec le bon verbe.
//
// ⚠️ Quatre façons d'appeler l'API cohabitent dans ce dépôt (le client partagé
// `api.get/post/patch/del`, et trois enveloppes locales dans `command.js`,
// `mobile.js` et `orchestrator-panel.js`). L'extracteur les couvre toutes, et un
// test vérifie qu'il en trouve un nombre plausible : un extracteur qui ne
// trouverait plus rien rendrait ce fichier vert et vide de sens.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoutes } from "./aide-routes.js";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JS = path.join(RACINE, "public", "js");

const VERBE = { get: "GET", post: "POST", patch: "PATCH", del: "DELETE" };

/** Normalise un chemin écrit dans la page : query retirée, paramètres unifiés. */
function normaliser(p) {
  return p.split("?")[0].replace(/\$\{[^}]*\}/g, ":p").replace(/\/+$/, "") || "/";
}

/** Tous les appels d'API écrits dans la SPA, quelle que soit l'enveloppe. */
function appelsDeLaPage() {
  const appels = [];
  for (const f of fs.readdirSync(JS).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(JS, f), "utf8");

    // ① Client partagé : api.get("/x"), api.post(`/x/${id}`, …), et la
    //    concaténation `api.get("/x/" + id)`.
    for (const m of src.matchAll(/api\.(get|post|patch|del)\(\s*(`[^`]*`|"[^"]*")(\s*\+\s*[A-Za-z_$])?/g)) {
      appels.push({ methode: VERBE[m[1]], chemin: normaliser(m[2].slice(1, -1) + (m[3] ? "${x}" : "")), fichier: f });
    }
    // ② Enveloppes locales de `mobile.js` et `orchestrator-panel.js` : le
    //    préfixe /api est ajouté DANS l'enveloppe, le chemin s'écrit nu.
    if (/fetch\("\/api" \+ path/.test(src)) {
      for (const m of src.matchAll(/\b(?:api|req)\(\s*(?:"(GET|POST|PATCH|DELETE)"\s*,\s*)?(`[^`]*`|"[^"]*")([^\n]*)/g)) {
        const chemin = m[2].slice(1, -1);
        if (!chemin.startsWith("/")) continue;
        // ⚠️ `mobile.js` passe le verbe dans les OPTIONS : `api("/tests/run",
        // { method:"POST", … })`. Le lire comme un GET fabriquait un faux
        // orphelin — et aurait masqué un vrai le jour où il y en a un.
        const dansLesOptions = /method\s*:\s*"(GET|POST|PATCH|DELETE)"/.exec(m[3] || "");
        appels.push({ methode: m[1] || dansLesOptions?.[1] || "GET", chemin: normaliser(chemin), fichier: f });
      }
    }
    // ③ Chemins absolus écrits en clair (`command.js` passe le chemin complet).
    for (const m of src.matchAll(/[`"](\/api\/[^`"?)]*)/g)) {
      appels.push({ methode: "GET", chemin: normaliser(m[1].replace(/^\/api/, "")), fichier: f });
    }
  }
  return appels;
}

const ROUTES = parseRoutes().map((r) => ({ ...r, segments: r.route.split("/").filter(Boolean) }));

function routePour(methode, chemin) {
  const seg = chemin.split("/").filter(Boolean);
  return ROUTES.find((r) => r.method === methode && r.segments.length === seg.length
    && r.segments.every((s, i) => s.startsWith(":") || seg[i] === ":p" || s === seg[i])) || null;
}

test("l'extracteur trouve bien les appels — sinon ce fichier serait vert et vide", () => {
  const appels = appelsDeLaPage();
  assert.ok(appels.length >= 60, `seulement ${appels.length} appels trouvés : l'extracteur a décroché`);
  const distincts = new Set(appels.map((a) => a.methode + " " + a.chemin));
  assert.ok(distincts.size >= 45, `seulement ${distincts.size} points d'API distincts`);
  // Les trois enveloppes doivent être vues, pas seulement le client partagé.
  const fichiers = new Set(appels.map((a) => a.fichier));
  for (const f of ["app.js", "mobile.js", "command.js", "orchestrator-panel.js"]) {
    assert.ok(fichiers.has(f), `aucun appel détecté dans ${f} — l'enveloppe a changé de forme`);
  }
});

test("chaque appel de la page correspond à une route du serveur, avec le bon verbe", () => {
  const orphelins = [];
  for (const a of appelsDeLaPage()) {
    if (!routePour(a.methode, a.chemin)) orphelins.push(`${a.methode} ${a.chemin}  (${a.fichier})`);
  }
  assert.deepEqual([...new Set(orphelins)], [],
    "la page appelle des routes qui n'existent pas : le panneau concerné reste vide, " +
    "avec un 404 dans une console que personne ne regarde.");
});

test("le mauvais VERBE est aussi un appel mort", () => {
  // Contre-test de l'assertion précédente : elle doit dépendre du verbe, pas
  // seulement du chemin. `PATCH /overview` n'existe pas, `GET /overview` oui.
  assert.ok(routePour("GET", "/overview"), "la sonde du contre-test est fausse");
  assert.equal(routePour("PATCH", "/overview"), null);
  assert.equal(routePour("DELETE", "/bugs/:p"), null);
});

test("inventaire des routes qu'AUCUNE page n'appelle", () => {
  // Une route sans appelant est soit une porte oubliée, soit du code mort. On ne
  // l'interdit pas — plusieurs sont légitimes (sonde de vie, flux SSE, actions
  // réservées à un futur écran) — mais on la NOMME, pour qu'une nouvelle orpheline
  // se remarque au lieu de s'ajouter au tas.
  const appelees = new Set();
  for (const a of appelsDeLaPage()) {
    const r = routePour(a.methode, a.chemin);
    if (r) appelees.add(r.method + " " + r.route);
  }
  const orphelines = ROUTES.map((r) => r.method + " " + r.route).filter((k) => !appelees.has(k)).sort();

  const CONNUES = [
    "GET /activity-sessions",      // vue « sessions » historique, non branchée
    "GET /anomalies",              // moteur d'anomalies : lu par le pilotage serveur
    "GET /control/history",        // historique du poste de commande
    "GET /git/diff",               // réservé à l'écran de revue de correctif
    "GET /health",                 // sonde de vie (superviseur, supervision externe)
    "GET /incidents",              // paquets d'incidents : consommés côté serveur
    "GET /observation",            // santé d'observation, agrégée par /control/command
    "GET /releases",               // historique de release
    "GET /test-sessions/:id",      // fiche unitaire, la liste suffit à l'écran
    "POST /alerts/manual",         // alerte levée à la main (outil, pas écran)
    "POST /claude/analyze",        // analyse profonde : déclenchée côté serveur
    "POST /claude/context",        // idem
    "POST /flags",                 // création de drapeau : pas encore d'écran
    "POST /git/branch",            // création de branche : réservée
    "POST /incidents/:id/transition",
  ];

  const nouvelles = orphelines.filter((k) => !CONNUES.includes(k));
  assert.deepEqual(nouvelles, [],
    "nouvelle route sans appelant : ajoute-la à la liste en disant POURQUOI, ou branche-la.");

  const disparues = CONNUES.filter((k) => !orphelines.includes(k));
  assert.deepEqual(disparues, [],
    "ces routes ont trouvé un appelant : retire-les de la liste des orphelines.");
});
