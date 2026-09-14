// Viser un AUTRE projet Supabase que la production — SUP-04 / TCI-04
// (contre-revue Astra, 2026-09-14).
//
// Le client lit `window.PASSIO_SUPABASE_CIBLE = { url, anon }` s'il est posé
// AVANT app-08 (voir `_cibleSupabase`, app-08) ; sans lui, c'est la production.
// Ici, la cible vient de l'environnement du banc :
//   PASSIO_SUPABASE_URL   https://<ref>.supabase.co
//   PASSIO_SUPABASE_ANON  la clé anon de ce projet
// et `compte-e2e.js` prend la clé `service_role` du MÊME projet dans
// SUPABASE_SERVICE_ROLE_KEY. Les trois ensemble = les suites `prod` écrivent sur
// le staging ; aucune des trois = comportement d'avant, à l'octet près.
//
// ⚠️ Une cible à moitié posée (URL sans clé, ou l'inverse) n'est PAS prise :
// on ne détourne pas un client vers un projet dont on n'a pas la clé, et le
// client refuse de son côté ce qui n'a pas la forme attendue.
function cibleSupabase() {
  const url = (process.env.PASSIO_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.PASSIO_SUPABASE_ANON || "").trim();
  if (!url || !anon) return null;
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url)) throw new Error("PASSIO_SUPABASE_URL doit être https://<ref>.supabase.co (reçu : " + url + ")");
  return { url, anon };
}

/** À appeler AVANT `page.goto` (c'est un script d'initialisation). Sans cible : ne fait rien. */
async function viserCibleSupabase(page) {
  const c = cibleSupabase();
  if (!c) return null;
  await page.addInitScript((cible) => { window.PASSIO_SUPABASE_CIBLE = cible; }, c);
  return c;
}

module.exports = { cibleSupabase, viserCibleSupabase };
