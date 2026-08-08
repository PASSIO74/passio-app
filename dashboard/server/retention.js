// ═══════════════════════════════════════════════════════════════════════════
// RÉTENTION PAR COHORTE — J1 / J7 / J30, calculée SANS migration :
//   • date d'acquisition = `profiles.created_at` (réelle),
//   • signal de retour    = un événement `telemetry_events` après l'inscription.
// Piège d'honnêteté géré : la télémétrie n'existe que depuis peu. Une cohorte
// n'est ÉLIGIBLE que si sa fenêtre (D, D+N] est ENTIÈREMENT couverte par la
// télémétrie ET déjà écoulée. Sinon → « données insuffisantes », jamais 0 %.
// Convention : « retenu à JN » = au moins un événement entre J+1 et J+N.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

const DAY = 86_400_000;
const WINDOWS = [1, 7, 30];
const MIN_COHORT = 5;             // en dessous : échantillon trop faible → inconnu
const PAGE = 1000, MAX_PAGES = 25;

const dayEpoch = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * Calcul PUR (testable) de la rétention par cohorte.
 * @param {{id:string, created_at:string}[]} profiles  cohortes (date d'inscription)
 * @param {{user_id:string, received_at:string}[]} activity  événements de retour
 * @param {number} now epoch ms
 * @param {number|null} telemetryStart epoch ms du 1er événement de télémétrie
 */
export function cohortRetention(profiles, activity, now = Date.now(), telemetryStart = null) {
  const activeDays = new Map();           // user_id -> Set(jour epoch)
  for (const a of activity) {
    if (!a || !a.user_id) continue;
    const t = Date.parse(a.received_at); if (isNaN(t)) continue;
    let s = activeDays.get(a.user_id); if (!s) { s = new Set(); activeDays.set(a.user_id, s); }
    s.add(dayEpoch(t));
  }
  const tStartDay = telemetryStart != null ? dayEpoch(telemetryStart) : null;
  const nowDay = dayEpoch(now);
  const out = {};
  for (const w of WINDOWS) {
    let base = 0, retained = 0;
    for (const p of profiles) {
      if (!p || !p.created_at) continue;
      const ct = Date.parse(p.created_at); if (isNaN(ct)) continue;
      const D = dayEpoch(ct);
      if (D + w * DAY > nowDay) continue;                 // fenêtre pas encore écoulée
      if (tStartDay != null && D < tStartDay) continue;   // avant la télémétrie → inconnu
      base++;
      const days = activeDays.get(p.id);
      if (days) { for (let k = 1; k <= w; k++) if (days.has(D + k * DAY)) { retained++; break; } }
    }
    out["j" + w] = base >= MIN_COHORT
      ? { rate: Math.round((retained / base) * 100), base, retained }
      : { rate: null, base, retained, insufficient: true };
  }
  return { ...out, telemetryStart, minCohort: MIN_COHORT };
}

let cache = null, cacheAt = 0;

// Pagination générique (contourne le plafond PostgREST de 1000 lignes).
async function fetchAll(admin, build) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(admin.select("*")).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function retention() {
  const admin = getAdmin();
  if (!admin) return { configured: false };
  if (cache && Date.now() - cacheAt < 120_000) return cache;
  try {
    const now = Date.now();
    // 1) Début de la télémétrie (borne d'éligibilité des cohortes).
    const { data: firstRows, error: e0 } = await admin
      .from("telemetry_events").select("received_at").order("received_at", { ascending: true }).limit(1);
    if (e0) throw e0;
    const telemetryStart = firstRows?.[0]?.received_at ? Date.parse(firstRows[0].received_at) : null;

    // 2) Cohortes (profils réels, hors comptes de test).
    const profRaw = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await admin.from("profiles").select("id,created_at")
        .order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      for (const r of batch) if (r.id && !store.testUids.has(r.id)) profRaw.push(r);
      if (batch.length < PAGE) break;
    }

    // 3) Activité (retours) depuis le début de la télémétrie, identités connues.
    const activity = [];
    if (telemetryStart != null) {
      const sinceIso = new Date(telemetryStart).toISOString();
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await admin.from("telemetry_events").select("user_id,received_at")
          .gte("received_at", sinceIso).not("user_id", "is", null)
          .order("received_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        for (const r of batch) if (r.user_id && !store.testUids.has(r.user_id)) activity.push(r);
        if (batch.length < PAGE) break;
      }
    }

    const coverageDays = telemetryStart != null ? Math.floor((now - telemetryStart) / DAY) : 0;
    cache = {
      configured: true,
      ...cohortRetention(profRaw, activity, now, telemetryStart),
      cohortsTotal: profRaw.length,
      coverageDays,
      updatedAt: now,
    };
    cacheAt = now;
    return cache;
  } catch (e) {
    return { configured: true, error: e.message };
  }
}
