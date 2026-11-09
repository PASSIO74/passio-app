// ══════════════════════════════════════════════════════════════════════════
// MESURE — QUELLES SUITES PLAYWRIGHT PARLENT VRAIMENT À UN PROJET SUPABASE ?
// ──────────────────────────────────────────────────────────────────────────
// Préchargé dans CHAQUE processus du lanceur Playwright, il journalise toute
// requête vers `*.supabase.co` faite par un navigateur de test : la suite, le
// cas, la méthode, le chemin, et SURTOUT si elle a ATTEINT LE RÉSEAU — adresse
// de serveur non nulle — ou si une route l'a servie / abandonnée. Aucun fichier
// de test n'est modifié : l'écoute passe par l'instrumentation que Playwright
// offre à ses propres enregistreurs (`runAfterCreateBrowserContext`).
//
// Usage (une ligne, depuis la racine du dépôt) :
//   TRAFIC_DIR=/tmp/trafic NODE_OPTIONS="--require ./scripts/trafic-supabase-tests.cjs" \
//     npx playwright test --project=local
//   node scripts/trafic-supabase-rapport.mjs /tmp/trafic
//
// Né le 2026-11-09 (docs/journal/capacite-perf-realtime.md) : la mesure qui a
// attribué, suite par suite, les 68 % de requêtes de production venus de la CI.
//
// ⚠️ C'EST UNE SONDE, PAS UN GARDE-FOU : elle n'interdit rien, elle compte. Sans
// `TRAFIC_DIR`, elle ne fait RIEN — la précharger par mégarde est sans effet.
// ⚠️ `_instrumentation` n'est pas une API publique de Playwright. Si une version
// la retire, la sonde se tait : un rapport à ZÉRO requête sur une suite qui en
// fait forcément (le référentiel des passions est demandé à chaque démarrage)
// est une sonde cassée, pas une suite isolée. Le rapport le signale.
// ⚠️ Les pré-requêtes CORS (OPTIONS) ne sont pas des requêtes que Playwright
// expose : la passerelle Supabase les compte, la sonde non.
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = process.env.TRAFIC_DIR;
if (DIR) {
  const RACINE = process.env.TRAFIC_RACINE || process.cwd();
  const SUPABASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co\//;
  let pw = null;
  try { pw = require(path.join(RACINE, "node_modules", "playwright-core")); } catch (e) {}
  let globals = null;
  function cas() {
    try {
      if (!globals) globals = require(path.join(RACINE, "node_modules", "playwright", "lib", "globals.js"));
      const ti = globals.currentTestInfo();
      if (!ti) return { f: "?", t: "?", p: "?" };
      return { f: path.basename(ti.file), t: ti.title, p: ti.project && ti.project.name };
    } catch (e) {
      return { f: "?", t: "?", p: "?" };
    }
  }
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
  const sortie = path.join(DIR, "trafic-" + process.pid + ".jsonl");
  const ecrire = (o) => { try { fs.appendFileSync(sortie, JSON.stringify(o) + "\n"); } catch (e) {} };
  const decrire = (u) => { const x = new URL(u); return { path: x.pathname, q: x.search.slice(0, 200) }; };

  function brancher(ctx) {
    ctx.on("requestfinished", async (req) => {
      if (!SUPABASE.test(req.url())) return;
      const c = cas();
      let adresse = null, status = null;
      try {
        const rep = await req.response();
        if (rep) { status = rep.status(); adresse = await rep.serverAddr(); }
      } catch (e) {}
      ecrire({ ...c, m: req.method(), ...decrire(req.url()), s: status, net: !!adresse });
    });
    ctx.on("requestfailed", (req) => {
      if (!SUPABASE.test(req.url())) return;
      const echec = (req.failure() || {}).errorText || "";
      // ⚠️ UN ÉCHEC NE PROUVE PAS UN DÉPART. `route.abort("internetdisconnected")`
      // — une coupure SIMULÉE par la suite elle-même — rend le même libellé
      // qu'une vraie panne : la première version de cette sonde comptait donc
      // comme « parties » les coupures de `piece-jointe-depot-echec` (huit par
      // course). Seule une adresse de serveur prouve un départ ; un échec est
      // rangé à part, avec son code, et le rapport signale ceux qui ressemblent
      // à une vraie tentative (DNS, tunnel du proxy).
      ecrire({ ...cas(), m: req.method(), ...decrire(req.url()), echec, net: false });
    });
    ctx.on("page", (page) => {
      page.on("websocket", (ws) => {
        if (!/supabase\.co/.test(ws.url())) return;
        // Un WebSocket avalé par `routeWebSocket` émet aussi cet événement : la
        // sonde ne sait pas distinguer, elle le compte à part (`net: null`).
        ecrire({ ...cas(), m: "WS", path: new URL(ws.url()).pathname, net: null });
      });
    });
  }

  if (pw && pw._instrumentation && typeof pw._instrumentation.addListener === "function") {
    pw._instrumentation.addListener({
      runAfterCreateBrowserContext: async (ctx) => { try { brancher(ctx); } catch (e) {} },
    });
  }
}
