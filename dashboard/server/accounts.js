// ═══════════════════════════════════════════════════════════════════════════
// COMPTES RÉELS — la LISTE de tous les profils créés (table `profiles`).
// Contrairement à la vue « Utilisateurs » qui ne montrait que les comptes ayant
// émis de la télémétrie récente (buffer live), cette source liste TOUS les
// comptes jamais créés — y compris ceux des testeurs (Maxime, etc.) qui
// n'apparaissaient pas faute d'événements récents dans le flux.
// Source de vérité : `profiles`. Les comptes de test (@passio-e2e.test) exclus.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

let cache = null, cacheAt = 0;

export async function accounts() {
  const admin = getAdmin();
  if (!admin) return { configured: false, users: [] };
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id,username,avatar_url,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    const users = (data || [])
      .filter((r) => !store.isExcludedUid(r.id))
      .map((r) => ({
        id: r.id,
        name: r.username || null,
        avatar: r.avatar_url || null,
        createdAt: r.created_at || null,
      }));
    cache = { configured: true, users, total: users.length };
    cacheAt = Date.now();
    return cache;
  } catch (e) {
    return { configured: true, error: e.message, users: [] };
  }
}
