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

if (out) {
  const m = out.match(/"comptes_e2e_restants":\s*(\d+)/);
  console.log(`[purge:e2e] comptes e2e restants : ${m ? m[1] : "?"}`);
  if (m && m[1] !== "0") process.exitCode = 1;
} else {
  console.warn("[purge:e2e] ⚠️ purge impossible (CLI Supabase non liée ?) — purge manuelle : " +
    "supabase db query --linked --file scripts/purge_e2e_accounts.sql depuis le repo principal.");
}
