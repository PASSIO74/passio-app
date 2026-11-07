// L'environnement d'un processus enfant, sans les secrets du pilotage (audit 2026-11-06, F-17).
// Une suite de tests jouée sur un correctif écrit par le modèle, ou un `claude` qui lit du texte
// hostile, n'a aucune raison de voir `service_role`. Le reste de l'environnement passe : PATH,
// HOME, APPDATA et les identifiants propres aux outils. `gh` et `git push` ont besoin de leur
// jeton : `garderGithub` le laisse, et rien d'autre.
// Par préfixe ET par suffixe : un secret d'un autre fournisseur (`NETLIFY_AUTH_TOKEN`, `VAPID_PRIVATE_KEY`,
// `CLAUDE_CODE_OAUTH_TOKEN`) passait la liste des préfixes.
const SECRETS = /^(?:SUPABASE_|DASH_|NETLIFY_|VAPID_|ANTHROPIC_|OPENAI_|BREVO_|SMTP_)|(?:_TOKEN|_SECRET|_PASSWORD|_PRIVATE_KEY|_API_KEY|_ACCESS_KEY)$/i;
const GITHUB = /^(?:GITHUB_|GH_)/i;

export function envSansSecrets(extra = {}, { garderGithub = false } = {}) {
  const e = { ...process.env, ...extra };
  for (const k of Object.keys(e)) {
    if (Object.hasOwn(extra, k)) continue;
    if (garderGithub && GITHUB.test(k)) continue;
    if (SECRETS.test(k) || GITHUB.test(k)) delete e[k];
  }
  return e;
}
