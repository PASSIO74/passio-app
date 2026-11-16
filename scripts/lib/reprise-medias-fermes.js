"use strict";
const { transformerJson } = require("./reprise-medias-portables.js");
const REGISTRES = ["media_reservations", "media_assets", "media_objects"];
const CLE = "medias_proteges", PREFIXE = "Reprise médias fermés : ";
const erreur = (code) => { throw new Error(PREFIXE + code); };
const connue = (e) => typeof e?.message === "string" && /^Reprise médias fermés : [A-Z_]+$/.test(e.message);
const codeErreur = (e) => connue(e) ? e.message.slice(PREFIXE.length) : "CIBLE_LECTURE_INDETERMINEE";
const valide = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === 1 && Object.hasOwn(v, "actif") && typeof v.actif === "boolean";
function inspecterArchive({ tables = [], lignes = [] }) {
  const presents = REGISTRES.filter(t => tables.includes(t));
  if (presents.length > 0 && presents.length !== REGISTRES.length) erreur("ARCHIVE_REGISTRES_INCOMPLETS");
  const flags = lignes.filter(l => l && l.cle === CLE);
  if (flags.length > 1) erreur("ARCHIVE_REGLAGE_MULTIPLE");
  if (presents.length && flags.length !== 1) erreur("ARCHIVE_REGLAGE_ABSENT");
  if (flags.length && !valide(flags[0].valeur)) erreur("ARCHIVE_REGLAGE_INVALIDE");
  return { version: 1, couverture: presents.length ? "registres_couverts" : "legacy_non_attestee",
    activation_source: flags.length ? (flags[0].valeur.actif ? "active" : "fermee") : "absente",
    activation_attendue: "fermee", projection_volontaire: true, archive_modifiee: false };
}
function projeterReglage(texte) {
  const ligne = JSON.parse(texte);
  if (!ligne || ligne.cle !== CLE) return texte;
  if (!valide(ligne.valeur)) erreur("ARCHIVE_REGLAGE_INVALIDE");
  return transformerJson(texte, v => v, (v, p) => p.length === 2 && p[0] === "valeur" && p[1] === "actif" ? false : v);
}
// Deux lectures attestées : aucune référence à une table absente au parsing,
// aucun DO/CREATE/fonction temporaire, aucune valeur de réglage dans le retour.
const SQL_CATALOGUE = `select current_setting('transaction_read_only') = 'on' as lecture_seule,
  to_regclass('public.reglages_distants') is not null as presente,
  (select relkind::text from pg_class where oid=to_regclass('public.reglages_distants')) as genre,
  case when to_regclass('public.reglages_distants') is null then true else
    has_table_privilege(current_user,to_regclass('public.reglages_distants'),'SELECT')
      and not row_security_active(to_regclass('public.reglages_distants')) end as non_filtree`;
const SQL_ETAT = `select current_setting('transaction_read_only') = 'on' as lecture_seule,
  count(*)::int as total,
  count(*) filter(where valeur = '{"actif":false}'::jsonb)::int as fermes,
  count(*) filter(where valeur = '{"actif":true}'::jsonb)::int as actifs
  from public.reglages_distants where cle='medias_proteges'`;
async function garderCible(lire) {
  try {
    const c = await lire(SQL_CATALOGUE);
    if (c.lecture_seule !== true) erreur("CIBLE_LECTURE_INDETERMINEE");
    if (c.presente === false && c.genre === null && c.non_filtree === true) return "ABSENTE";
    if (c.presente !== true || !["r", "p"].includes(c.genre) || c.non_filtree !== true) erreur("CIBLE_CATALOGUE_INDETERMINE");
    const s = await lire(SQL_ETAT);
    if (s.lecture_seule !== true) erreur("CIBLE_LECTURE_INDETERMINEE");
    if (![s.total,s.fermes,s.actifs].every(n => Number.isSafeInteger(n) && n >= 0)) erreur("CIBLE_LECTURE_INDETERMINEE");
    if (s.total === 0 && s.fermes === 0 && s.actifs === 0) return "ABSENTE";
    if (s.total === 1 && s.fermes === 1 && s.actifs === 0) return "FERMEE";
    if (s.total === 1 && s.fermes === 0 && s.actifs === 1) erreur("CIBLE_ACTIVE");
    erreur("CIBLE_REGLAGE_INVALIDE");
  } catch (e) { erreur(codeErreur(e)); }
}
module.exports = { REGISTRES, CLE, PREFIXE, connue, codeErreur, valide, inspecterArchive, projeterReglage, garderCible, SQL_CATALOGUE, SQL_ETAT };
