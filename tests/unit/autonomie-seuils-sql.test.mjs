// Les seuils de l'autonomie de la veille vivent à DEUX endroits : la logique
// pure (supabase/functions/_shared/autonomie.js) les DIT, la migration les
// APPLIQUE (pilotage_audience, pilotage_familles_erreurs). Ce verrou rougit
// dès qu'une fenêtre, une ancienneté ou un seuil change d'un seul côté
// (contre-revue du 2026-10-13). Livré avec la migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { REVEIL, RETOUR } from "../../supabase/functions/_shared/autonomie.js";

const MIGRATION = fs.readFileSync("migrations/migration_reglages_distants_2026-10-11.sql", "utf8");
const position = (texte, motif, quoi) => { const i = texte.indexOf(motif); assert.ok(i >= 0, quoi + " : « " + motif + " » introuvable"); return i; };

test("① les seuils du JS DISENT ceux de la base (mutation : changer une fenêtre d'un seul côté)", () => {
  const ech = MIGRATION.slice(position(MIGRATION, "'comptes_echecs_30min', (", "échecs 30 min"), MIGRATION.indexOf("'saturation_minute_max', ("));
  assert.equal(REVEIL.fenetreMs, 30 * 60e3); assert.match(ech, /interval '30 minutes'/);
  assert.equal(REVEIL.ancienneteMinMs, 24 * 3600e3); assert.match(ech, /u\.created_at < now\(\) - interval '24 hours'/);
  const fam = MIGRATION.slice(position(MIGRATION, "create or replace function public.pilotage_familles_erreurs", "familles"));
  assert.equal(RETOUR.ancienneteMinMs, 7 * 864e5); assert.match(fam, /v_avant  timestamptz := v_depuis - interval '7 days'/);
  assert.match(fam, /order by \(coalesce\(a\.c, 0\) >= 2\)/); assert.equal(RETOUR.vuAilleursMin, 2);
  assert.match(fam, /having count\(distinct ici\.auth_uid\) >= 2/, "la base rend dès 2 comptes ; le seuil de 5 est appliqué ici");
  assert.ok(RETOUR.comptesMin >= 2);
  for (const bloc of [ech, fam]) assert.match(bloc, /u\.email_confirmed_at is not null and not coalesce\(u\.is_anonymous, false\)/, "comptes confirmés, non anonymes");
});

test("② les pannes qui délestent toute la production ne comptent que des comptes de plus de 7 jours (mutation : retirer la jointure auth.users)", () => {
  const p = MIGRATION.slice(position(MIGRATION, "'comptes_5xx_15min', (", "pannes"), MIGRATION.indexOf("'comptes_echecs_30min', ("));
  assert.match(p, /join auth\.users u on u\.id = t\.auth_uid/);
  assert.match(p, /u\.created_at < now\(\) - interval '7 days'/);
  assert.match(p, /u\.email_confirmed_at is not null and not coalesce\(u\.is_anonymous, false\)/);
});
