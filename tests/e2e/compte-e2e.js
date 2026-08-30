// ═══════════════════════════════════════════════════════════════════════════
// COMPTE-E2E — création des comptes jetables des suites qui écrivent en base.
//
// ⚠️ POURQUOI CE MODULE EXISTE (2026-08-30).
// Les suites créaient leurs comptes par `supa.auth.signUp()` et lisaient la
// session dans la réponse. Ce raccourci ne tenait QUE parce que « Confirm
// email » était OFF côté Supabase. Depuis le branchement du SMTP Brevo et la
// réactivation de la confirmation (docs/SETUP_SMTP_AUTH.md), `signUp` rend
// `{ user, session: null }` : plus aucun jeton, et les cinq points d'appel
// expiraient sur leur attente — dont `authz-critical`, qui est la barrière
// RLS du déploiement (.github/workflows/deploy.yml).
//
// Le chemin correct pour un compte de TEST est l'API d'administration :
// `POST /auth/v1/admin/users` avec `email_confirm: true` crée un compte déjà
// confirmé. Deux conséquences voulues :
//   ① aucun e-mail n'est envoyé — le quota Brevo (300/j) n'est pas consommé
//      par les tests, et aucun rebond vers le domaine fictif `passio-e2e.test`
//      ne vient abîmer la réputation d'expéditeur du domaine ;
//   ② la clé `service_role` est nécessaire. Elle n'est JAMAIS dans le dépôt :
//      `dashboard/.env` en local (gitignoré), `secrets.SUPABASE_SERVICE_ROLE_KEY`
//      en CI.
//
// Le repli `signUp` reste en place pour un projet Supabase où la confirmation
// est désactivée. S'il rend une réponse sans session, on ÉCHOUE en nommant la
// cause : un test qui se met en veille silencieuse sur une barrière de sécurité
// serait pire que rouge.
//
// Convention conservée : adresses `…@passio-e2e.test`, seul motif reconnu par
// `scripts/purge-e2e-accounts.js` et le teardown global.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const MDP_E2E = "Passio-e2e-12345!";
const DOMAINE_E2E = "passio-e2e.test";
const RACINE = path.resolve(__dirname, "..", "..");

/** process.env complété par dashboard/.env (jamais l'inverse : l'env explicite prime). */
function _env() {
  const vals = { ...process.env };
  const f = path.join(RACINE, "dashboard", ".env");
  if (fs.existsSync(f)) {
    for (const ligne of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
      if (m && !vals[m[1]]) vals[m[1]] = m[2].trim();
    }
  }
  return vals;
}

/** L'URL du projet : celle de l'env, sinon la constante que l'app elle-même utilise. */
function _urlSupabase(vals) {
  if (vals.SUPABASE_URL) return vals.SUPABASE_URL.replace(/\/+$/, "");
  try {
    const src = fs.readFileSync(path.join(RACINE, "js", "app-08-ui-modals-tour.js"), "utf8");
    const m = /const\s+SUPABASE_URL\s*=\s*"([^"]+)"/.exec(src);
    if (m) return m[1].replace(/\/+$/, "");
  } catch (e) {}
  return null;
}

/** `{ url, cle }` si la création pré-confirmée est possible, sinon null. */
function configAdmin() {
  const vals = _env();
  const url = _urlSupabase(vals);
  const cle = vals.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return { url, cle };
}

/** Adresse jetable purgeable : `e2e_<préfixe>_<horodatage>_<aléa>@passio-e2e.test`. */
function emailE2E(prefixe) {
  const p = prefixe ? String(prefixe).replace(/[^a-z0-9_]/gi, "") + "_" : "";
  return `e2e_${p}${Date.now()}_${Math.random().toString(36).slice(2, 8)}@${DOMAINE_E2E}`;
}

const EXPLICATION_SANS_SESSION = [
  "Compte e2e sans session : « Confirm email » est activé côté Supabase, donc signUp ne rend plus de jeton.",
  "Remède : exposer SUPABASE_SERVICE_ROLE_KEY (dashboard/.env en local, secret du dépôt en CI)",
  "pour que les comptes de test soient créés pré-confirmés via l'API d'administration.",
  "Voir docs/SETUP_SMTP_AUTH.md.",
].join(" ");

async function _creerViaAdmin(cfg, email) {
  const r = await fetch(`${cfg.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: MDP_E2E, email_confirm: true }),
  });
  const corps = await r.json().catch(() => null);
  if (!r.ok) {
    // Le corps peut porter le message d'erreur Supabase ; jamais la clé.
    throw new Error(`création admin du compte e2e : HTTP ${r.status} ${(corps && (corps.msg || corps.message)) || ""}`.trim());
  }
  if (!corps || !corps.id) throw new Error("création admin du compte e2e : réponse sans identifiant");
  return corps.id;
}

/**
 * Crée un compte réel et ouvre sa session DANS LA PAGE.
 *
 * ⚠️ Comme `signUp` auparavant, l'appel BASCULE la session de la page sur le
 * nouveau compte : l'ordre des créations reste significatif pour les suites qui
 * font ensuite agir la page au nom d'un compte précis (voir blocage-acces).
 *
 * @returns {Promise<{uid: string, token: string, email: string}>}
 */
async function creerCompteE2E(page, prefixe = "") {
  const email = emailE2E(prefixe);
  const cfg = configAdmin();

  if (cfg) {
    await _creerViaAdmin(cfg, email);
    const out = await page.evaluate(async ([em, mdp]) => {
      try {
        const { data, error } = await supa.auth.signInWithPassword({ email: em, password: mdp });
        if (error) return { erreur: error.message };
        if (!data || !data.session) return { erreur: "connexion sans session" };
        return { uid: data.session.user.id, token: data.session.access_token };
      } catch (e) { return { erreur: (e && e.message) || String(e) }; }
    }, [email, MDP_E2E]);
    if (out.erreur) throw new Error(`connexion du compte e2e : ${out.erreur}`);
    await _memoriserUid(page, out.uid);
    return { uid: out.uid, token: out.token, email };
  }

  const out = await page.evaluate(async ([em, mdp]) => {
    try {
      const { data, error } = await supa.auth.signUp({ email: em, password: mdp });
      if (error) return { erreur: error.message };
      if (!data || !data.session) return { sansSession: true };
      return { uid: data.session.user.id, token: data.session.access_token };
    } catch (e) { return { erreur: (e && e.message) || String(e) }; }
  }, [email, MDP_E2E]);
  if (out.sansSession) throw new Error(EXPLICATION_SANS_SESSION);
  if (out.erreur) throw new Error(`inscription du compte e2e : ${out.erreur}`);
  await _memoriserUid(page, out.uid);
  return { uid: out.uid, token: out.token, email };
}

// `MY_UID` est un `let` de portée script (app-08) : lui affecter une valeur
// depuis page.evaluate atteint bien le binding, mais c'est `passio_uid` qui le
// restitue après le reload — les deux sont nécessaires.
function _memoriserUid(page, uid) {
  return page.evaluate((u) => {
    try { MY_UID = u; } catch (e) {}
    window.MY_UID = u;
    try { localStorage.setItem("passio_uid", u); } catch (e) {}
  }, uid);
}

module.exports = { creerCompteE2E, emailE2E, configAdmin, MDP_E2E, DOMAINE_E2E };
