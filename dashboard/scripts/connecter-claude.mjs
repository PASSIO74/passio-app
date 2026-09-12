// ═══════════════════════════════════════════════════════════════════════════
// CONNECTER CLAUDE CODE POUR LE PILOTAGE (2026-09-12).
//
// Le pilotage appelle le `claude` local avec l'abonnement de l'utilisateur.
// Quand la session tombe, la consigne était « tape `claude auth login` » — vrai
// si le pilotage partage `~/.claude` avec tout le reste, FAUX dès que
// `DASH_CLAUDE_CONFIG_DIR` isole ses identifiants : une connexion faite dans un
// terminal ordinaire ne le reconnecterait pas.
//
// Ce script est donc LA porte unique : il lit `dashboard/.env`, pose le même
// CLAUDE_CONFIG_DIR que le serveur, lance `claude auth login` dans le terminal
// (le navigateur s'ouvre, l'utilisateur autorise), puis vérifie par
// `claude auth status` que la connexion a bien pris — celle que le pilotage
// verra en moins d'une minute (cadence de reprise, cf. claudecli.js).
//
//   node scripts/connecter-claude.mjs          connexion + vérification
//   node scripts/connecter-claude.mjs etat     vérification seule
//
// Il n'écrit rien dans .env et ne touche à aucun autre identifiant.
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, "..");

/** Lit UNE clé de dashboard/.env sans dotenv (script autonome, zéro dépendance). */
export function lireCle(texteEnv, cle) {
  const re = new RegExp(`^\\s*${cle}\\s*=\\s*(.*)\\s*$`, "m");
  const m = (texteEnv || "").match(re);
  if (!m) return "";
  return m[1].replace(/^["']|["']$/g, "").trim();
}

/** Environnement du CLI : celui du poste, moins la session Claude Code parente
 *  éventuelle, plus le dossier d'identifiants isolé s'il est configuré. */
export function envCli(texteEnv, base = process.env) {
  const e = { ...base };
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_HOST_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH",
    "CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_PID"]) delete e[k];
  const dir = lireCle(texteEnv, "DASH_CLAUDE_CONFIG_DIR");
  if (dir) e.CLAUDE_CONFIG_DIR = path.isAbsolute(dir) ? dir : path.resolve(RACINE, dir);
  else delete e.CLAUDE_CONFIG_DIR;
  return e;
}

function statut(env) {
  const r = spawnSync("claude", ["auth", "status"], { shell: true, env, encoding: "utf8", windowsHide: true, timeout: 45_000 });
  let j = null;
  try { j = JSON.parse((r.stdout || "").match(/\{[\s\S]*\}/)?.[0] || ""); } catch {}
  return { installe: j !== null, connecte: Boolean(j && j.loggedIn === true), brut: (r.stdout || r.stderr || "").trim() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let texteEnv = "";
  try { texteEnv = fs.readFileSync(path.join(RACINE, ".env"), "utf8"); } catch {}
  const env = envCli(texteEnv);
  const isole = Boolean(env.CLAUDE_CONFIG_DIR);
  console.log(`\n  PASSIO — Connexion de Claude Code pour le pilotage`);
  console.log(`  ▸ Identifiants : ${isole ? `ISOLÉS dans ${env.CLAUDE_CONFIG_DIR}` : "partagés (~/.claude, comme les terminaux)"}\n`);

  const avant = statut(env);
  if (!avant.installe) {
    console.log("  ✗ `claude` ne répond pas ici : Claude Code est-il installé et dans le PATH ?");
    console.log("    " + (avant.brut || "(aucune sortie)").split("\n")[0]);
    process.exit(2);
  }
  if (process.argv[2] === "etat") {
    console.log(avant.connecte ? "  ✓ Connecté : le pilotage peut analyser." : "  ✗ Non connecté : lance ce script sans argument pour te connecter.");
    process.exit(avant.connecte ? 0 : 1);
  }
  if (avant.connecte) {
    console.log("  ✓ Déjà connecté — rien à faire. Le pilotage le voit en moins d'une minute.");
    process.exit(0);
  }

  console.log("  Ouverture de la connexion (une page web va s'ouvrir, autorise l'accès)…\n");
  if (isole) fs.mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
  spawnSync("claude", ["auth", "login"], { shell: true, env, stdio: "inherit", windowsHide: false });

  const apres = statut(env);
  if (apres.connecte) {
    console.log("\n  ✓ Connecté. Le pilotage reprend ses diagnostics tout seul (moins d'une minute), sans redémarrage.");
    process.exit(0);
  }
  console.log("\n  ✗ Toujours pas connecté. Relance ce script, ou vérifie que la page web a bien confirmé l'autorisation.");
  process.exit(1);
}
