// ═══════════════════════════════════════════════════════════════════════════
// COMPTES RÉELS — la LISTE de tous les profils créés (table `profiles`),
// FUSIONNÉE avec les informations de connexion issues de Supabase Auth
// (auth.users) : e-mail, numéro de téléphone (saisi à la création, rangé dans
// user_metadata), date de création, dernière connexion, e-mail confirmé.
//
// Le numéro N'EST PAS dans `profiles` (table en lecture publique — l'y mettre
// exposerait tous les numéros à n'importe quel compte). Il vit dans
// auth.users.user_metadata, jamais lisible côté client, lu ICI uniquement via
// la clé service_role. Le centre de pilotage est le SEUL endroit où le numéro
// et les infos de connexion sont réunis.
//
// Les comptes de test (@passio-e2e.test) et internes sont exclus.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { store } from "./store.js";

let cache = null, cacheAt = 0;

// Récupère TOUS les utilisateurs Auth (pagination), avec e-mail, téléphone
// (user_metadata.phone, repli sur la colonne native `phone`) et dernière
// connexion. Renvoie une carte uid -> { email, phone, lastSignInAt, ... }.
async function authIndex(admin) {
  const map = new Map();
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {   // borne : 20 000 comptes max
    let data;
    try {
      const res = await admin.auth.admin.listUsers({ page, perPage });
      if (res.error) break;
      data = res.data;
    } catch (e) { break; }
    const users = (data && data.users) || [];
    for (const u of users) {
      const meta = u.user_metadata || {};
      map.set(u.id, {
        email: u.email || null,
        phone: meta.phone || u.phone || null,
        createdAt: u.created_at || null,
        lastSignInAt: u.last_sign_in_at || null,
        emailConfirmed: !!(u.email_confirmed_at || u.confirmed_at),
      });
    }
    if (users.length < perPage) break;       // dernière page atteinte
  }
  return map;
}

export async function accounts() {
  const admin = getAdmin();
  if (!admin) return { configured: false, users: [] };
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  try {
    const [profRes, auth] = await Promise.all([
      admin
        .from("profiles")
        .select("id,username,avatar_url,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      authIndex(admin).catch(() => new Map()),
    ]);
    if (profRes.error) throw profRes.error;
    const users = (profRes.data || [])
      .filter((r) => !store.isExcludedUid(r.id))
      .map((r) => {
        const a = auth.get(r.id) || {};
        return {
          id: r.id,
          name: r.username || null,
          avatar: r.avatar_url || null,
          createdAt: r.created_at || a.createdAt || null,
          // Informations de connexion (source : auth.users, service_role).
          email: a.email || null,
          phone: a.phone || null,
          lastSignInAt: a.lastSignInAt || null,
          emailConfirmed: a.emailConfirmed || false,
        };
      });
    cache = {
      configured: true,
      users,
      total: users.length,
      withPhone: users.filter((u) => u.phone).length,
    };
    cacheAt = Date.now();
    return cache;
  } catch (e) {
    return { configured: true, error: e.message, users: [] };
  }
}
