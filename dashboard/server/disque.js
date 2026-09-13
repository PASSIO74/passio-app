// ═══════════════════════════════════════════════════════════════════════════
// DISQUE DU POSTE — la panne que le pilotage subissait sans la voir (2026-09-13).
//
// Diagnostic du 2026-09-12 : « le pilotage se déconnecte de Claude Code des
// fois ». Première cause, avant toute histoire de connexion : le disque C: à
// 100 % (2,5 Go libres sur 262). 22 plantages `ENOSPC` du serveur entre le 1er
// et le 10 septembre — chaque écriture refusée (alertes, diagnostics, journal)
// tuait le processus, le superviseur le relançait, et le CLI `claude`, qui
// réécrit ses jetons rafraîchis dans son dossier de configuration, perdait sa
// session. Le pilotage mesurait tout — fraîcheur, taux d'erreur, connexion —
// sauf le sol sur lequel il tenait.
//
// Ce module sonde l'espace libre du volume qui porte `data/` (là où le
// pilotage écrit) et SIGNALE le franchissement d'un seuil, une seule fois par
// bascule : `warn` quand il devient bas, `info` quand il remonte. Niveau `warn`
// volontairement : la sentinelle n'analyse que `critical,high`, et un disque
// plein ne se corrige pas par un patch de `js/*.js` — l'appeler dessus
// gaspillerait une analyse pour un verdict « comportement attendu ».
//
// `fs.statfs` (Node ≥ 18.15) fonctionne sur Windows : mesuré, il rend les
// blocs du volume C: pour un chemin `C:\…`. Le minuteur est `unref()`.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const GB = 1e9;
// Seuil bas : en dessous, alerte. 10 Go par défaut — les shards e2e, un build
// `dist/` et Windows Update (6,7 Go mesurés dans SoftwareDistribution) prennent
// facilement plusieurs Go en une heure ; à 2,5 Go on plantait déjà.
const SEUIL_BAS_GB = Math.max(0.5, Number(process.env.DASH_DISK_WARN_GB || 10));
// Hystérésis : on ne signale « revenu au-dessus » qu'au-delà de seuil + marge,
// sinon un disque qui oscille autour du seuil remplirait le flux d'alertes.
const MARGE_GB = Math.max(0.1, Number(process.env.DASH_DISK_HYSTERESIS_GB || 2));
const WATCH_MS = Math.max(60_000, Number(process.env.DASH_DISK_WATCH_MIN || 5) * 60_000);

let _state = { checked: false, ok: null, freeGb: null, totalGb: null, path: config.dataDir, lastCheckAt: null, low: false, since: null, error: null };
let _timer = null;

/** Le chemin lui-même ou son plus proche parent existant : `data/` n'existe pas
 *  encore au premier démarrage (jsondb la crée), et le volume est le même. */
function cheminMesurable(p) {
  let c = path.resolve(p);
  for (let i = 0; i < 12 && !fs.existsSync(c); i++) { const parent = path.dirname(c); if (parent === c) break; c = parent; }
  return c;
}

/** Mesure brute (Promise). Exportée pour être remplacée dans les tests. */
export function mesurer(p = config.dataDir) {
  return new Promise((resolve, reject) => {
    fs.statfs(cheminMesurable(p), (e, s) => {
      if (e) return reject(e);
      resolve({ freeGb: (s.bavail * s.bsize) / GB, totalGb: (s.blocks * s.bsize) / GB });
    });
  });
}

function message(next) {
  const libre = next.freeGb.toFixed(1);
  return next.low
    ? `${libre} Go libres sur le disque qui porte le pilotage (seuil ${SEUIL_BAS_GB} Go). À ce niveau le serveur a déjà planté 22 fois (ENOSPC, sept. 2026) et la session du CLI \`claude\` peut se perdre. Libérer de la place — puis rien à relancer, ce message se ferme tout seul au-dessus de ${(SEUIL_BAS_GB + MARGE_GB).toFixed(0)} Go.`
    : `${libre} Go libres : le disque est revenu au-dessus du seuil (${SEUIL_BAS_GB} Go + ${MARGE_GB} Go de marge).`;
}

/**
 * Un tour de surveillance. `mesure` et `notify` sont injectables pour les tests
 * (la vraie mesure dépend du poste). Retourne { avant, apres, changed }.
 */
export async function diskWatchTick({ mesure = mesurer, notify = null, now = Date.now() } = {}) {
  const avant = { ..._state };
  let m;
  try { m = await mesure(config.dataDir); }
  catch (e) {
    // Une mesure impossible n'est PAS « disque plein » ni « disque sain » : on
    // garde l'état connu et on note l'erreur, comme la sonde `claude auth status`.
    _state = { ..._state, checked: true, lastCheckAt: now, error: e.message || String(e) };
    return { avant: avant.low, apres: _state.low, changed: false };
  }
  // Hystérésis : bas sous le seuil ; redevient sain seulement au-dessus de seuil + marge.
  const low = avant.low ? m.freeGb < SEUIL_BAS_GB + MARGE_GB : m.freeGb < SEUIL_BAS_GB;
  const next = { checked: true, ok: !low, freeGb: m.freeGb, totalGb: m.totalGb, path: config.dataDir, lastCheckAt: now, low, error: null,
    since: (avant.checked && low === avant.low) ? avant.since : now };
  _state = next;
  const changed = avant.checked ? low !== avant.low : low; // au démarrage, seul « bas » vaut d'être dit
  if (changed) {
    try {
      const raise = notify || (await import("./alerts.js")).raiseManual;
      raise({ level: low ? "warn" : "info", title: low ? "Disque presque plein" : "Disque : de la place à nouveau", message: message(next) });
    } catch {}
  }
  return { avant: avant.low, apres: low, changed };
}

/** État connu, pour /api/overview et la page Sources. */
export function diskState() { return { ..._state, thresholdGb: SEUIL_BAS_GB }; }

/** Démarre la surveillance (idempotent). Un premier tour part tout de suite
 *  (`immediate: false` — tests — attend le premier intervalle). */
export function startDiskWatch(everyMs = WATCH_MS, { immediate = true } = {}) {
  if (_timer) return _timer;
  if (immediate) diskWatchTick().catch(() => {});
  _timer = setInterval(() => { diskWatchTick().catch(() => {}); }, everyMs);
  if (typeof _timer.unref === "function") _timer.unref();
  return _timer;
}

export function stopDiskWatch() { if (_timer) { clearInterval(_timer); _timer = null; } }

/** RÉSERVÉ AUX TESTS. */
export function _setDiskStateForTests(next) { _state = { ..._state, ...next }; return { ..._state }; }
