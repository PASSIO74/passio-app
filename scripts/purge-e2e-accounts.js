// Purge best-effort des comptes e2e jetables (%@passio-e2e.test).
// - Manuel : npm run purge:e2e
// - Auto  : globalTeardown Playwright quand PASSIO_E2E_MULTI=1 (tests/e2e/global-teardown.js)
// La CLI Supabase doit être LIÉE au projet : on essaie le repo courant, puis le
// worktree principal (le lien vit dans le répertoire principal, pas les worktrees),
// puis PASSIO_SUPABASE_DIR si fourni. Échec = avertissement, jamais bloquant.
const { execSync } = require("child_process");
const path = require("path");

const SQL = path.join(__dirname, "purge_e2e_accounts.sql");

function mainWorktreeDir() {
  try {
    const out = execSync("git worktree list --porcelain", { cwd: path.resolve(__dirname, ".."), timeout: 15000 })
      .toString();
    const m = out.match(/^worktree (.+)$/m);
    return m ? m[1].trim() : null;
  } catch (e) { return null; }
}

function tryPurge(dir) {
  if (!dir) return null;
  try {
    return execSync(`supabase db query --linked --file "${SQL}"`,
      { cwd: dir, stdio: ["ignore", "pipe", "pipe"], timeout: 180000 }).toString();
  } catch (e) {
    if (process.env.PASSIO_PURGE_DEBUG) {
      console.warn(`[purge:e2e][debug] échec via ${dir} — status=${e.status} stderr=${(e.stderr || "").toString().slice(0, 200)}`);
    }
    return null;
  }
}

const candidates = [
  process.env.PASSIO_SUPABASE_DIR,
  path.resolve(__dirname, ".."),
  mainWorktreeDir(),
].filter(Boolean);

let out = null;
for (const dir of candidates) {
  out = tryPurge(dir);
  if (out) { console.log(`[purge:e2e] OK via ${dir}`); break; }
}

// ⚠️ DEUX FORMATS DE SORTIE, ET LE SECOND A CASSÉ LA LECTURE (2026-09-01).
// Les anciennes versions de la CLI rendaient du JSON ; depuis, `supabase db
// query` dessine un TABLEAU en caractères box-drawing :
//
//   ┌──────────────────────┐
//   │ comptes_e2e_restants │
//   ├──────────────────────┤
//   │ 0                    │
//   └──────────────────────┘
//
// Le motif JSON ne matchait plus rien : le script affichait « restants : ? » et,
// surtout, ne posait JAMAIS `exitCode = 1`. Une purge qui laisse des comptes
// derrière elle passait donc pour un succès — et comme le teardown Playwright
// ignore déjà les échecs, plus personne ne pouvait voir que le nettoyage ne
// faisait plus son travail. Mesuré sur la CLI v2.105.0 le 2026-09-01.
function restantsDepuis(sortie) {
  const json = sortie.match(/"comptes_e2e_restants":\s*(\d+)/);
  if (json) return json[1];
  // Format tableau : on trouve la ligne d'en-tête, puis le premier nombre qui
  // suit dans une ligne de données. On ne se fie pas à une position fixe — les
  // bordures et l'alignement varient d'une version à l'autre.
  const lignes = sortie.split(/\r?\n/);
  const iEntete = lignes.findIndex((l) => l.indexOf("comptes_e2e_restants") >= 0);
  if (iEntete < 0) return null;
  for (let i = iEntete + 1; i < lignes.length; i++) {
    const m = lignes[i].match(/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

if (out) {
  const n = restantsDepuis(out);
  console.log(`[purge:e2e] comptes e2e restants : ${n === null ? "ILLISIBLE" : n}`);
  // ⚠️ Un décompte ILLISIBLE est traité comme un ÉCHEC, pas comme un succès.
  // L'asymétrie décide du sens du doute : croire à tort que la purge a réussi
  // laisse la prod se remplir en silence, ce qui a fini par rendre la suite
  // rouge sans que rien ne désigne la cause.
  if (n !== "0") process.exitCode = 1;
} else {
  // ⚠️ REPLI REST — C'EST LE CHEMIN DE LA CI (2026-09-01). La CLI Supabase n'y
  // est ni installée ni liée : sans ce repli, la purge s'y soldait par le seul
  // avertissement ci-dessous, que le teardown Playwright ignore par conception.
  // Les comptes créés par `authz-critical`, `blocage-acces` et
  // `user-state-horodatage` — de VRAIS comptes, sur la VRAIE prod — n'étaient
  // donc JAMAIS supprimés. Ils se sont accumulés jusqu'à pousser le post semé
  // par les tests hors des vingt premières cartes du fil : `main` au rouge,
  // déploiement production sauté, et rien pour désigner la cause.
  console.warn("[purge:e2e] CLI Supabase non liée — repli sur le chemin REST.");
  try {
    execSync("node scripts/purge-e2e-rest.js", {
      cwd: path.resolve(__dirname, ".."), stdio: "inherit", timeout: 240000,
    });
  } catch (e) {
    console.warn("[purge:e2e] ⚠️ repli REST en échec. Vérifier d'abord " +
      "SUPABASE_SERVICE_ROLE_KEY (dashboard/.env en local, secret GitHub en CI) : " +
      "sans elle, configAdmin() rend null et le canal ② ne peut pas s'ouvrir. " +
      "En dernier recours, appliquer scripts/purge_e2e_accounts.sql par le canal ③ " +
      "d'ADR-012 (psql ou le SQL Editor) — surtout pas par la CLI liée, dont " +
      "l'échec silencieux est le post-mortem du 2026-09-01.");
    process.exitCode = 1;
  }
}
