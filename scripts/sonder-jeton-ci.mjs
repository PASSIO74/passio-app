// Une sonde = un seul jeton de compte, une destination fixe, aucun texte distant publié.
import { pathToFileURL } from "node:url";
export async function sonderJeton(service, env, requete = fetch, maintenant = Date.now()) {
  const cibles = {
    github: ["https://api.github.com/user", "SENTINELLE_TOKEN"],
    supabase: ["https://api.supabase.com/v1/projects", "SUPABASE_ACCESS_TOKEN"],
    netlify: ["https://api.netlify.com/api/v1/user", "NETLIFY_AUTH_TOKEN"],
  };
  if (!Object.hasOwn(cibles, service)) throw new Error("Sonde inconnue");
  const [url, nom] = cibles[service];
  if (!env[nom]) return service === "github" ? { statut: 0, joursRestants: null } : { statut: 0 };
  try {
    const r = await requete(url, { redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Bearer " + env[nom], Accept: "application/json", "User-Agent": "passio-veille" } });
    const statut = Number.isInteger(r.status) && r.status >= 100 && r.status <= 599 ? r.status : 0;
    if (service !== "github") return { statut };
    const expire = Date.parse(r.headers.get("github-authentication-token-expiration") || "");
    return { statut, joursRestants: Number.isFinite(expire) ? Math.floor((expire - maintenant) / 86400000) : null };
  } catch { return service === "github" ? { statut: 0, joursRestants: null } : { statut: 0 }; }
}
export function lireJetonsCI(texte) {
  const objet = JSON.parse(texte);
  const out = {};
  for (const service of ["github", "supabase", "netlify"]) {
    const m = objet?.[service];
    if (!m || !Number.isInteger(m.statut) || m.statut < 0 || m.statut > 599) throw new Error("Sonde CI absente ou invalide");
    out[service] = { statut: m.statut };
    if (service === "github") {
      const j = m.joursRestants;
      if (j != null && (!Number.isSafeInteger(j) || Math.abs(j) > 36500)) throw new Error("Expiration CI invalide");
      out.github.joursRestants = j ?? null;
    }
  }
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sonderJeton(process.argv[2] === "hebergement" ? "netlify" : process.argv[2], process.env).then(r => console.log(JSON.stringify(r)))
    .catch(() => { console.error("Sonde CI refusée"); process.exitCode = 2; });
}
