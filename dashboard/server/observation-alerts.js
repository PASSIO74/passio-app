// ═══════════════════════════════════════════════════════════════════════════
// ALERTES D'OBSERVATION — le pilotage se surveille lui-même (2026-09-18).
//
// Jusqu'ici observation.js calculait ses états À LA LECTURE seulement : une
// base illisible, un canari jamais observé, un polling en échec, un realtime en
// CHANNEL_ERROR ou une nuit entière sans signal réel n'apparaissaient que si un
// humain ouvrait /api/observation. Ce module fait un tour par minute, compare
// à l'état précédent (persisté : un redémarrage ne re-sonne pas) et n'émet
// qu'à la BASCULE, via `alerts.raise` — chargé paresseusement (alerts.js →
// sse.js → observation.js : un import statique bouclerait).
//
// Ce qu'il surveille, et à quel niveau :
//   obs:dbread    high      lecture service_role UNAVAILABLE
//   obs:canary    high      canari UNAVAILABLE (2 manqués de suite, cf. observation.js)
//   obs:realtime  warn      realtime ≠ SUBSCRIBED depuis > 5 min (le polling reprend)
//   obs:polling   high      polling de secours ≥ 6 échecs de suite
//   obs:ingest    critical  ni realtime ni polling : le pilotage est sourd
//   obs:silence   warn      aucun signal RÉEL depuis DASH_SILENCE_MIN (240) — en
//                           heures actives seulement (09–21 Paris), jamais tant
//                           qu'aucun signal n'a été vu, tenu la nuit
//   storage:write high      un fichier de données du pilotage ne s'écrit plus
// Le retour est signalé en `info` sur la même clé : c'est ce que suit le sink
// GitHub [POSTE] pour refermer son issue. Tout est pur et injectable : le
// minuteur est coupé par DASH_OBS_ALERTS_MIN=0 (tests).
// ═══════════════════════════════════════════════════════════════════════════
import { JsonDb } from "./jsondb.js";
import { observationSnapshot } from "./observation.js";
import { ingestState } from "./ingest.js";

const EVERY_MS = Math.max(0, Number(process.env.DASH_OBS_ALERTS_MIN ?? 1)) * 60_000;
const SILENCE_MS = Math.max(1, Number(process.env.DASH_SILENCE_MIN || 240)) * 60_000;
const REALTIME_GRACE_MS = 5 * 60_000;
const POLL_FAIL_STREAK = 6;
const HEURES_ACTIVES = [9, 21];

const db = new JsonDb("observation-alerts", { etats: null, realtimeBadSince: null, updatedAt: null });
let _timer = null;

/** Heure locale de Paris (0-23), pure : l'horloge du poste peut être ailleurs. */
export function heureParis(now = Date.now()) {
  const h = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hour12: false }).format(new Date(now));
  return Number(String(h).replace(/\D/g, "")) % 24;
}
export function enHeuresActives(now = Date.now()) { const h = heureParis(now); return h >= HEURES_ACTIVES[0] && h < HEURES_ACTIVES[1]; }

/**
 * Instant (ms UTC) du début des heures actives — 09:00 à Paris — du jour de
 * `now`. Pur. On lit les champs de date à Paris, on les recompose en UTC, et
 * l'écart entre cette recomposition et `now` EST le décalage Paris/UTC (+1 h
 * ou +2 h) : 09:00 Paris = Date.UTC(y, m, j, 9) − décalage.
 */
export function debutHeuresActivesParis(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(new Date(now)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const murParis = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  const decalage = Math.round((murParis - now) / 60_000) * 60_000;
  return Date.UTC(parts.year, parts.month - 1, parts.day, HEURES_ACTIVES[0], 0, 0) - decalage;
}

const SPEC = {
  dbread: { key: "obs:dbread", level: "high", titre: "Lecture de la base impossible", retour: "Lecture de la base rétablie" },
  canary: { key: "obs:canary", level: "high", titre: "Canari public non observé", retour: "Canari public de nouveau observé" },
  realtime: { key: "obs:realtime", level: "warn", titre: "Realtime décroché (repli sur le polling)", retour: "Realtime de nouveau abonné" },
  polling: { key: "obs:polling", level: "high", titre: "Polling de secours en échec", retour: "Polling de secours rétabli" },
  ingest: { key: "obs:ingest", level: "critical", titre: "Ingestion sourde : ni realtime ni polling", retour: "Ingestion rétablie" },
  silence: { key: "obs:silence", level: "warn", titre: "Aucun signal réel depuis des heures", retour: "Des signaux réels arrivent de nouveau" },
  storage: { key: "storage:write", level: "high", titre: "Écriture des données du pilotage impossible", retour: "Écriture des données rétablie" },
};

const heures = (ms) => Math.round(ms / 360_000) / 10;

/**
 * Évalue les sept états à partir d'un instantané d'observation et de l'état
 * d'ingestion. PUR. `prev` apporte la mémoire nécessaire (depuis quand le
 * realtime est décroché, valeur tenue du silence la nuit).
 */
export function evaluer({ obs, ingest, now = Date.now(), prev = null, silenceMs = SILENCE_MS } = {}) {
  const parts = (obs && obs.parts) || {};
  const ing = ingest || {};
  const ready = Boolean(ing.supabaseReady);
  const etats = {};
  etats.dbread = { mauvais: parts.dbRead?.state === "UNAVAILABLE", detail: parts.dbRead?.detail || "" };
  etats.canary = { mauvais: parts.canary?.state === "UNAVAILABLE", detail: parts.canary?.detail || "" };
  etats.storage = { mauvais: parts.persistence?.state === "UNAVAILABLE", detail: parts.persistence?.detail || "" };

  const decroche = ready && ing.realtimeStatus && ing.realtimeStatus !== "SUBSCRIBED";
  const realtimeBadSince = decroche ? (prev?.realtimeBadSince || now) : null;
  etats.realtime = { mauvais: Boolean(decroche && now - realtimeBadSince > REALTIME_GRACE_MS), detail: decroche ? `${ing.realtimeStatus}${ing.realtimeLastError ? " — " + ing.realtimeLastError : ""} depuis ${heures(now - realtimeBadSince)} h` : "" };

  const streak = Number(ing.polling?.failStreak) || 0;
  etats.polling = { mauvais: ready && streak >= POLL_FAIL_STREAK, detail: streak ? `${streak} lectures en échec de suite${ing.polling?.lastError ? " — " + ing.polling.lastError : ""}` : "" };
  etats.ingest = { mauvais: ready && ing.ingestAlive === false, detail: ready ? "ni realtime abonné ni polling qui lit" : "" };

  const vu = ing.lastRealSeenIso ? Date.parse(ing.lastRealSeenIso) : NaN;
  const silenceMesurable = ready && Number.isFinite(vu);
  let silence;
  if (!silenceMesurable) silence = { mauvais: false, detail: "" };
  else if (!enHeuresActives(now)) silence = { mauvais: Boolean(prev?.etats?.silence?.mauvais), detail: "hors heures actives : état tenu", tenu: true };
  else {
    // Le silence se compte en temps ACTIF, pas en heures d'horloge : un dernier
    // signal à 23:30 ne fait pas 9,6 h de silence à 09:05 — la nuit n'est pas
    // un silence (D1-C2 : sinon l'issue [POSTE] partait chaque matin).
    const depuis = Math.max(vu, debutHeuresActivesParis(now));
    silence = { mauvais: now - depuis > silenceMs, detail: `dernier signal réel il y a ${heures(now - vu)} h, soit ${heures(now - depuis)} h en heures actives (seuil ${heures(silenceMs)} h, heures actives 09–21)` };
  }
  etats.silence = silence;

  return { etats, realtimeBadSince, evaluatedAt: now };
}

/**
 * Les alertes à émettre entre deux évaluations : une par état qui BASCULE.
 * PUR. Sans `prev` (première évaluation), seuls les états mauvais sonnent.
 */
export function transitions(prev, next) {
  const out = [];
  const avant = (prev && prev.etats) || {};
  for (const [nom, spec] of Object.entries(SPEC)) {
    const a = Boolean(avant[nom]?.mauvais);
    const b = Boolean(next?.etats?.[nom]?.mauvais);
    if (a === b) continue;
    const detail = next.etats[nom].detail || "";
    out.push(b
      ? { key: spec.key, level: spec.level, title: spec.titre, message: detail || spec.titre, meta: { view: "sources", kind: nom === "storage" ? "infra" : "observation" }, source: "observation", cooldownMs: 0 }
      : { key: spec.key, level: "info", title: spec.retour, message: detail || spec.retour, meta: { view: "sources", kind: nom === "storage" ? "infra" : "observation" }, source: "observation", cooldownMs: 0 });
  }
  return out;
}

/** Un tour : évalue, compare, persiste, émet. Tout est injectable. */
export async function observationAlertsTick({ now = Date.now(), obs = null, ingest = null, notify = null } = {}) {
  const prev = db.get();
  const next = evaluer({ obs: obs || observationSnapshot(), ingest: ingest || ingestState(), now, prev });
  const alertes = transitions(prev.etats ? prev : null, next);
  db.update((d) => { d.etats = next.etats; d.realtimeBadSince = next.realtimeBadSince; d.updatedAt = now; });
  if (alertes.length) {
    try {
      const raise = notify || (await import("./alerts.js")).raise;
      for (const a of alertes) { try { raise(a); } catch {} }
    } catch {}
  }
  return { next, alertes };
}

export function observationAlertsState() { return { ...db.get(), everyMs: EVERY_MS, silenceMs: SILENCE_MS }; }

export function startObservationAlerts(everyMs = EVERY_MS, { immediate = false } = {}) {
  if (_timer || !everyMs) return _timer;
  if (immediate) observationAlertsTick().catch(() => {});
  _timer = setInterval(() => { observationAlertsTick().catch(() => {}); }, everyMs);
  if (typeof _timer.unref === "function") _timer.unref();
  return _timer;
}
export function stopObservationAlerts() { if (_timer) { clearInterval(_timer); _timer = null; } }

/** RÉSERVÉ AUX TESTS. */
export function _setStateForTests(next) { db.update((d) => { d.etats = next?.etats ?? null; d.realtimeBadSince = next?.realtimeBadSince ?? null; }); return db.get(); }
