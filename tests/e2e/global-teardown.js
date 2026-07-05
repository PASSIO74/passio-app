// Teardown global Playwright : après une suite multi-comptes (PASSIO_E2E_MULTI=1),
// purge les comptes jetables %@passio-e2e.test en prod (best-effort — la CLI
// Supabase doit être liée ; sinon simple avertissement, la suite reste verte).
module.exports = async () => {
  if (!process.env.PASSIO_E2E_MULTI) return;
  try {
    require("child_process").execSync("node scripts/purge-e2e-accounts.js", {
      cwd: require("path").resolve(__dirname, "..", ".."),
      stdio: "inherit",
      timeout: 240000,
    });
  } catch (e) {
    console.warn("[teardown] purge e2e non bloquante en échec :", e.message);
  }
};
