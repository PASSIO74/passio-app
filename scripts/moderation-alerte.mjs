#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ALERTE DE MODÉRATION — un signalement qui attend doit être VU (2026-09-11)
//
// Audit go/no-go du 10/09 : « un signalement n'arrive nulle part ». Depuis,
// `reports.status` existe (migration du 11/09) et `npm run moderation` lit la
// file — mais il faut penser à le lancer. Ce script est la partie qui n'oublie
// pas : joué chaque jour par `.github/workflows/moderation-alerte.yml`, il
// compte les signalements OUVERTS depuis plus de 24 h et rend un verdict que le
// workflow transforme en issue GitHub `[MODÉRATION]` (label `moderation`), donc
// en e-mail au propriétaire. Une issue, pas un correctif automatique : décider
// d'un signalement est un geste HUMAIN — le label `claude` n'est jamais posé.
//
// ⚠️ VIE PRIVÉE : la sortie ne porte NI identité de signaleur, NI identité de
// cible, NI motif — une issue est publique sur ce dépôt. Elle dit COMBIEN, DEPUIS
// QUAND, et de quel TYPE. Le détail se lit en local : `npm run moderation`.
//
// ⚠️ FONCTIONNE AVANT COMME APRÈS la migration : sans colonne `status`, tout
// signalement est considéré ouvert (c'est l'état d'avant, où rien ne se fermait).
//
//   node scripts/moderation-alerte.mjs            → verdict sur la sortie standard
//   node scripts/moderation-alerte.mjs --json     → même verdict en JSON (workflow)
//   variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (canal ② d'ADR-012)
// ═══════════════════════════════════════════════════════════════════════════

export const SEUIL_H = 24;

const LIBELLE = {
  user: "compte", post: "publication", comment: "commentaire",
  event: "rencontre", passion: "passion", message: "message",
};

/**
 * Fonction PURE : à partir des lignes `reports` et de l'instant courant, dit ce
 * qu'il faut annoncer. Testée seule (tests/unit/moderation-alerte.test.mjs).
 * @param {Array<{id:string,target_type:string,created_at:string,status?:string}>} lignes
 * @param {number} maintenantMs
 * @returns {{ ouverts:number, enRetard:number, plusAncienH:number, parType:Record<string,number>, alerte:boolean, titre:string, corps:string }}
 */
export function classerSignalements(lignes, maintenantMs) {
  const now = Number.isFinite(maintenantMs) ? maintenantMs : Date.now();
  const ouverts = (lignes || []).filter((l) => l && (l.status === undefined || l.status === null || l.status === "open"));
  let plusAncienMs = 0;
  const parType = {};
  let enRetard = 0;
  for (const l of ouverts) {
    const age = now - new Date(l.created_at).getTime();
    if (!Number.isFinite(age)) continue;
    if (age > plusAncienMs) plusAncienMs = age;
    if (age >= SEUIL_H * 3600_000) {
      enRetard++;
      const t = LIBELLE[l.target_type] || String(l.target_type || "?");
      parType[t] = (parType[t] || 0) + 1;
    }
  }
  const plusAncienH = Math.floor(plusAncienMs / 3600_000);
  const alerte = enRetard > 0;
  const jours = Math.floor(plusAncienH / 24);
  const titre = alerte
    ? `[MODÉRATION] ${enRetard} signalement(s) en attente depuis plus de ${SEUIL_H} h`
    : "";
  const lignesType = Object.entries(parType).sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `- ${n} × ${t}`).join("\n");
  const corps = alerte ? [
    `**${enRetard} signalement(s)** attendent depuis plus de ${SEUIL_H} heures (le plus ancien : ${jours >= 1 ? `${jours} jour(s)` : `${plusAncienH} h`}).`,
    `Au total, ${ouverts.length} signalement(s) sont ouverts.`,
    "",
    "Par type de cible :",
    lignesType,
    "",
    "Pour les lire et les traiter (en local, jamais depuis GitHub) :",
    "```",
    "npm run moderation                         # la file, regroupée par cible",
    "npm run moderation voir --id <id>          # le détail d'un signalement",
    "npm run moderation traiter --id <id> --statut handled --note \"…\"",
    "```",
    "",
    "Cette issue est ouverte par `.github/workflows/moderation-alerte.yml` et se referme",
    "d'elle-même au prochain passage quand plus rien n'attend. Aucun identifiant, aucun",
    "motif n'y figure : le dépôt est public.",
  ].join("\n") : "";
  return { ouverts: ouverts.length, enRetard, plusAncienH, parType, alerte, titre, corps };
}

async function lireSignalements(url, cle) {
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}` };
  // Avec statut d'abord ; sans (400 : colonne absente) on prend tout — l'état d'avant.
  let r = await fetch(`${url}/rest/v1/reports?select=id,target_type,created_at,status&status=eq.open&limit=1000`, { headers: entetes });
  if (r.status === 400) {
    r = await fetch(`${url}/rest/v1/reports?select=id,target_type,created_at&limit=1000`, { headers: entetes });
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} sur reports : ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

const estPrincipal = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (estPrincipal) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !cle) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents.");
    process.exit(2);
  }
  lireSignalements(url, cle).then((lignes) => {
    const v = classerSignalements(lignes, Date.now());
    if (process.argv.includes("--json")) console.log(JSON.stringify(v));
    else {
      console.log(`${v.ouverts} signalement(s) ouvert(s), ${v.enRetard} en attente depuis plus de ${SEUIL_H} h.`);
      if (v.alerte) console.log("\n" + v.titre + "\n\n" + v.corps);
    }
    process.exit(v.alerte ? 3 : 0);
  }).catch((e) => { console.error("❌ " + (e && e.message)); process.exit(2); });
}
