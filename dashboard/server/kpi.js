// ═══════════════════════════════════════════════════════════════════════════
// KPI PRODUIT — utilisateurs actifs réels, calculés côté serveur sur la table
// `telemetry_events` (service_role), PAS sur le buffer live borné.
//   • DAU / WAU / MAU  = utilisateurs IDENTIFIÉS distincts actifs sur 1 / 7 / 30 j.
//   • Stickiness       = DAU / MAU (habitude).
//   • Taux de retour 7 j = actifs [0-7 j] qui l'étaient AUSSI [7-14 j].
//   • Série 14 j des DAU pour un graphe.
// Honnêteté : on ne compte que les user_id non nuls (identités connectées), on
// exclut les comptes de test, et si la requête est tronquée on le signale
// (confidence = "partial"). La rétention par COHORTE (J1/J7/J30) reste UNKNOWN
// tant qu'une requête/vue dédiée n'existe pas — cf. .passio/METRICS_REGISTRY.md.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

const DAY = 86_400_000;
const PAGE = 1000;                // PostgREST plafonne CHAQUE réponse à 1000 lignes
const MAX_PAGES = 25;            // borne dure : 25 000 lignes / minute max
let cache = null, cacheAt = 0;

export async function kpi() {
  const admin = getAdmin();
  if (!admin) return { configured: false };
  if (cache && Date.now() - cacheAt < 60_000) return cache;
  try {
    const now = Date.now();
    const sinceIso = new Date(now - 30 * DAY).toISOString();
    // Pagination du plus RÉCENT au plus ancien : si on tronque, on perd les jours
    // les plus anciens (donc on SOUS-estime MAU) — direction honnête, signalée.
    const rows = [];
    let page = 0, truncated = false;
    for (; page < MAX_PAGES; page++) {
      const { data, error } = await admin
        .from("telemetry_events")
        .select("user_id,received_at")
        .gt("received_at", sinceIso)
        .not("user_id", "is", null)
        .order("received_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      for (const r of batch) if (r.user_id && !store.testUids.has(r.user_id)) rows.push(r);
      if (batch.length < PAGE) break;   // dernière page atteinte
    }
    const partial = page >= MAX_PAGES;  // borne de sécurité atteinte → lecture tronquée

    // Ensembles d'utilisateurs distincts par fenêtre.
    const inWin = (from, to) => {
      const s = new Set();
      for (const r of rows) {
        const t = Date.parse(r.received_at);
        if (isNaN(t)) continue;
        const age = now - t;
        if (age >= from && age < to) s.add(r.user_id);
      }
      return s;
    };
    const dau = inWin(0, DAY);
    const wau = inWin(0, 7 * DAY);
    const mau = inWin(0, 30 * DAY);
    const prev7 = inWin(7 * DAY, 14 * DAY);
    const last7 = inWin(0, 7 * DAY);
    let returned = 0;
    for (const u of prev7) if (last7.has(u)) returned++;
    const returnRate7 = prev7.size ? Math.round((returned / prev7.size) * 100) : null;
    const stickiness = mau.size ? Math.round((dau.size / mau.size) * 100) : null;

    // Série 14 j : DAU par jour calendaire.
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now - i * DAY); start.setHours(0, 0, 0, 0);
      const s0 = start.getTime(), s1 = s0 + DAY;
      const set = new Set();
      for (const r of rows) { const t = Date.parse(r.received_at); if (t >= s0 && t < s1) set.add(r.user_id); }
      series.push({ t: start.toISOString().slice(5, 10), n: set.size });
    }

    cache = {
      configured: true,
      confidence: partial ? "partial" : "high",
      partial,
      windowDays: 30,
      dau: dau.size, wau: wau.size, mau: mau.size,
      stickiness, returnRate7,
      returnBase: prev7.size, returnCount: returned,
      series,
      // Explicitement non calculé (honnêteté) :
      retentionCohort: null,   // J1/J7/J30 par cohorte → UNKNOWN (requête dédiée à venir)
      updatedAt: now,
    };
    cacheAt = now;
    return cache;
  } catch (e) {
    return { configured: true, error: e.message };
  }
}
