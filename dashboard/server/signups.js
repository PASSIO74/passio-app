// ═══════════════════════════════════════════════════════════════════════════
// CRÉATIONS DE COMPTE — indicateur de développement commercial.
// Source de vérité : la table `profiles` (comptes réels), PAS la télémétrie.
// Exclut les comptes de test. Fenêtres jour/semaine/mois + série 14 jours.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

let cache = null, cacheAt = 0;

export async function signups() {
  const admin = getAdmin();
  if (!admin) return { configured: false, total: 0, today: 0, week: 0, month: 0, series: [] };
  if (cache && Date.now() - cacheAt < 45_000) return cache;
  try {
    // Toutes les dates de création (hors comptes de test).
    const { data, error } = await admin.from("profiles").select("id,created_at").order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    const rows = (data || []).filter((r) => r.created_at && !store.testUids.has(r.id));
    const ts = rows.map((r) => Date.parse(r.created_at)).filter((t) => !isNaN(t));
    const now = Date.now();
    const since = (ms) => ts.filter((t) => now - t < ms).length;

    // Série quotidienne des 14 derniers jours (nouveaux comptes/jour).
    const days = 14, series = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now - i * 86400000); start.setHours(0, 0, 0, 0);
      const end = start.getTime() + 86400000;
      series.push({ t: start.toISOString().slice(5, 10), n: ts.filter((t) => t >= start.getTime() && t < end).length });
    }
    cache = { configured: true, total: rows.length, today: since(86400000), week: since(7 * 86400000), month: since(30 * 86400000), series };
    cacheAt = now;
    return cache;
  } catch (e) {
    return { configured: true, error: e.message, total: 0, today: 0, week: 0, month: 0, series: [] };
  }
}
