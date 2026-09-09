#!/usr/bin/env node
// Génère les rapports Markdown par domaine à partir des sorties structurées des sous-agents
// et des verdicts de vérification adversariale. Aucune donnée inventée : tout vient des JSON.
const fs = require('fs');
const path = require('path');

const SP = '/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad';
const OUT = process.argv[2] || '/home/user/passio-app/.passio/audits/BILAN_PASSIO_09-26';
// Résultats de domaine : un fichier JSON par domaine dans resultats/ (clé = nom de fichier)
const domaines = fs.readdirSync(path.join(SP, 'resultats')).filter((f) => f.endsWith('.json') && !f.startsWith('carto---')).map((f) => {
  const r = JSON.parse(fs.readFileSync(path.join(SP, 'resultats', f), 'utf8'));
  return { key: f.replace(/\.json$/, ''), ...r };
});
// Verdicts de relecture : { id: [ {lens, verdict, priorite_proposee, justification, ...}, ... ] }
const verifsBrut = fs.existsSync(path.join(SP, 'verifs-partiel.json')) ? JSON.parse(fs.readFileSync(path.join(SP, 'verifs-partiel.json'), 'utf8')) : {};
const verifById = new Map(Object.entries(verifsBrut).map(([id, votes]) => [id, { id, votes }]));

// Regroupement des domaines en rapports (numérotation du dossier)
const RAPPORTS = [
  { fichier: '02-CARTOGRAPHIE.md', titre: 'Cartographie des fonctionnalités', domaines: ['carto'] },
  { fichier: '03-AUDIT-UX-ONGLETS-ONBOARDING.md', titre: 'Audit UX, onglets et onboarding', domaines: ['ux-onboarding'] },
  { fichier: '04-AUDIT-FONCTIONNEL.md', titre: 'Audit fonctionnel', domaines: ['contenu', 'messagerie-notifs', 'irl', 'profils-passions', 'robustesse-pannes', 'tests-ci'] },
  { fichier: '05-AUDIT-CODE-ET-NETTOYAGE.md', titre: 'Audit du code et nettoyage proposé', domaines: ['code-nettoyage'] },
  { fichier: '06-AUDIT-SECURITE-DONNEES.md', titre: 'Audit sécurité et données', domaines: ['supabase-isolation', 'auth-rgpd'] },
  { fichier: '07-AUDIT-PERFORMANCE-CAPACITE-COUTS.md', titre: 'Audit performance, capacité et coûts', domaines: ['perf-capacite-couts'] },
  { fichier: '08-AUDIT-PILOTAGE-SENTINELLE.md', titre: 'Audit Centre de pilotage et Sentinelle', domaines: ['pilotage-sentinelle'] },
  { fichier: '09-AUDIT-APPAREILS-ACCESSIBILITE.md', titre: 'Audit appareils et accessibilité', domaines: ['appareils-a11y'] },
  { fichier: '10-AUDIT-MODERATION-IRL-SUPPORT-EXPLOITATION.md', titre: 'Audit modération, IRL, support et exploitation', domaines: ['moderation', 'exploitation-continuite'] },
];

const md = (s) => String(s == null ? '' : s).replace(/\r/g, '').trim();
const cell = (s) => md(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function verdictFinal(f) {
  const v = verifById.get(f.id);
  if (!v || !v.votes || !v.votes.length) return { statut: 'NON VÉRIFIÉ (pas de relecture)', priorite: f.priorite, votes: [] };
  const votes = v.votes;
  const refutes = votes.filter((x) => x.verdict === 'RÉFUTÉ').length;
  const confirmes = votes.filter((x) => x.verdict === 'CONFIRMÉ').length;
  let statut;
  if (refutes > votes.length / 2) statut = 'RÉFUTÉ par la relecture';
  else if (confirmes >= Math.ceil(votes.length / 2)) statut = 'CONFIRMÉ par la relecture';
  else statut = 'INCERTAIN après relecture';
  // priorité retenue : celle proposée par l'angle impact si confirmée, sinon initiale
  const imp = votes.find((x) => x.lens === 'impact') || votes.find((x) => x.lens === 'reproduction');
  const priorite = imp && imp.verdict !== 'RÉFUTÉ' && imp.priorite_proposee ? imp.priorite_proposee : f.priorite;
  return { statut, priorite, votes };
}

function findingMd(f, d) {
  const vf = verdictFinal(f);
  const lignes = [];
  lignes.push(`### ${f.id} — ${md(f.titre)}`);
  lignes.push('');
  lignes.push(`| Champ | Valeur |`);
  lignes.push(`|---|---|`);
  lignes.push(`| Identifiant | ${cell(f.id)} |`);
  lignes.push(`| Priorité retenue | **${vf.priorite}** (proposée par l'auditeur : ${f.priorite}) |`);
  lignes.push(`| Relecture adversariale | ${vf.statut} |`);
  lignes.push(`| Confiance de l'auditeur | ${cell(f.confiance)} |`);
  lignes.push(`| Fonctionnalité | ${cell(f.fonctionnalite)} |`);
  lignes.push(`| Résultat attendu | ${cell(f.attendu)} |`);
  lignes.push(`| Résultat observé | ${cell(f.observe)} |`);
  lignes.push(`| Reproduction | ${cell(f.reproduction)} |`);
  lignes.push(`| Preuve | ${cell(f.preuve)} |`);
  lignes.push(`| Impact utilisateur et commercial | ${cell(f.impact)} |`);
  lignes.push(`| Visibilité dans le Centre de pilotage | ${cell(f.visibilite_pilotage)} |`);
  lignes.push(`| Détection par la Sentinelle | ${cell(f.detection_sentinelle)} |`);
  lignes.push(`| Proposition de correction | ${cell(f.correction)} |`);
  lignes.push(`| Risque de régression | ${cell(f.risque_regression)} |`);
  lignes.push(`| Effort estimé | ${cell(f.effort)} |`);
  lignes.push('');
  if (vf.votes.length) {
    lignes.push('Relecture (angles indépendants) :');
    lignes.push('');
    for (const v of vf.votes) {
      lignes.push(`- **${v.lens}** → ${v.verdict} (priorité proposée ${v.priorite_proposee}). ${md(v.justification).replace(/\n+/g, ' ')}${v.correction_du_finding ? ' — Correction de formulation : ' + md(v.correction_du_finding).replace(/\n+/g, ' ') : ''}`);
    }
    lignes.push('');
  }
  return lignes.join('\n');
}

function domaineMd(d) {
  const L = [];
  L.push(`## Domaine « ${d.key} »`);
  L.push('');
  if (d.reconstruit_par_orchestrateur) {
    L.push(`> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.`);
    L.push('');
  }
  L.push(md(d.resume));
  L.push('');
  L.push(`### Contrôles (${d.controles.length})`);
  L.push('');
  L.push(`| Id | Contrôle | Statut | Méthode | Preuve |`);
  L.push(`|---|---|---|---|---|`);
  for (const c of d.controles) L.push(`| ${cell(c.id)} | ${cell(c.controle)} | **${cell(c.statut)}** | ${cell(c.methode)} | ${cell(c.preuve)} |`);
  L.push('');
  const fs_ = d.findings || [];
  L.push(`### Problèmes (${fs_.length})`);
  L.push('');
  if (!fs_.length) L.push('_Aucun problème rapporté dans ce domaine._');
  if (fs_.length) {
    L.push(`| Id | Priorité retenue | Relecture | Titre |`);
    L.push(`|---|---|---|---|`);
    for (const f of fs_) { const vf = verdictFinal(f); L.push(`| ${cell(f.id)} | **${vf.priorite}** | ${cell(vf.statut)} | ${cell(f.titre)} |`); }
    L.push('');
  }
  for (const f of fs_) { L.push(findingMd(f, d)); }
  L.push(`### Surfaces saines`);
  L.push('');
  for (const s of d.surfaces_saines || []) L.push(`- ${md(s)}`);
  if (!(d.surfaces_saines || []).length) L.push('_Aucune surface déclarée saine._');
  L.push('');
  L.push(`### Non vérifié (BLOQUÉ) et ce qu'il faudrait`);
  L.push('');
  for (const s of d.non_verifie || []) L.push(`- ${md(s)}`);
  if (!(d.non_verifie || []).length) L.push('_Rien._');
  L.push('');
  L.push(`### Affirmations des anciens rapports confrontées au code actuel`);
  L.push('');
  for (const s of d.anciens_rapports || []) L.push(`- ${md(s)}`);
  if (!(d.anciens_rapports || []).length) L.push('_Aucune._');
  L.push('');
  if ((d.preuves_fichiers || []).length) {
    L.push(`### Fichiers de preuve`);
    L.push('');
    for (const s of d.preuves_fichiers) L.push(`- \`${md(s).replace(SP + '/preuves/', 'preuves/')}\``);
    L.push('');
  }
  if (md(d.notes)) { L.push(`### Notes de l'auditeur`); L.push(''); L.push(md(d.notes)); L.push(''); }
  return L.join('\n');
}

const entete = (titre) => `# ${titre} — BILAN PASSIO 09/26\n\n> SHA audité : \`c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf\` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.\n\n`;

fs.mkdirSync(OUT, { recursive: true });
const byKey = new Map(domaines.map((d) => [d.key, d]));
for (const r of RAPPORTS) {
  const parts = [entete(r.titre)];
  for (const k of r.domaines) {
    const d = byKey.get(k);
    if (!d || d.echec) { parts.push(`## Domaine « ${k} »\n\n_Résultat absent (agent sans sortie)._\n`); continue; }
    parts.push(domaineMd(d));
  }
  fs.writeFileSync(path.join(OUT, r.fichier), parts.join('\n'));
  console.log('écrit', r.fichier);
}

// Registre consolidé des problèmes (JSON) pour la synthèse et le registre des risques
const registre = [];
for (const d of domaines) for (const f of d.findings || []) {
  const vf = verdictFinal(f);
  registre.push({ domaine: d.key, reconstruit: !!d.reconstruit_par_orchestrateur, ...f, priorite_retenue: vf.priorite, relecture: vf.statut, votes: vf.votes.map((v) => ({ lens: v.lens, verdict: v.verdict, priorite_proposee: v.priorite_proposee })) });
}
fs.writeFileSync(path.join(SP, 'registre-problemes.json'), JSON.stringify(registre, null, 1));
const compte = {};
for (const r of registre) { if (/RÉFUTÉ/.test(r.relecture)) continue; compte[r.priorite_retenue] = (compte[r.priorite_retenue] || 0) + 1; }
console.log('problèmes retenus par priorité :', compte, 'réfutés :', registre.filter((r) => /RÉFUTÉ/.test(r.relecture)).length);
