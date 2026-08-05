// ═══════════════════════════════════════════════════════════════════════════
// UTILISATEURS DE TEST — gestion des comptes de test UNIQUEMENT.
// Un compte est « de test » s'il correspond au motif e-mail dédié (jamais un
// compte réel). Les opérations destructives exigent admin + DASH_ALLOW_MUTATIONS.
// ═══════════════════════════════════════════════════════════════════════════
import { getAdmin } from "./ingest.js";
import { config } from "./config.js";
import { audit } from "./audit.js";

const TEST_EMAIL_RE = /@passio-e2e\.test$/i;   // motif des comptes jetables

export async function list() {
  const admin = getAdmin();
  if (!admin) return { configured: false, users: [] };
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const users = (data?.users || []).filter((u) => TEST_EMAIL_RE.test(u.email || ""))
      .map((u) => ({ id: u.id, email: u.email, createdAt: u.created_at, lastSignIn: u.last_sign_in_at }));
    return { configured: true, users, protectedRealAccounts: true };
  } catch (e) { return { configured: true, error: e.message, users: [] }; }
}

/** Supprime un compte de TEST (jamais un compte réel). Guardé. */
export async function remove(userId, actor) {
  if (!config.allowMutations) { const e = new Error("Mutations désactivées."); e.code = 403; throw e; }
  const admin = getAdmin();
  if (!admin) { const e = new Error("Supabase non configuré."); e.code = 400; throw e; }
  // Vérifie que c'est bien un compte de test avant toute suppression.
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email || "";
  if (!TEST_EMAIL_RE.test(email)) { const e = new Error("Refus : ce compte n'est pas un compte de test."); e.code = 403; throw e; }
  await admin.auth.admin.deleteUser(userId);
  audit("test_user_delete", { userId, email }, actor);
  return { deleted: userId };
}
