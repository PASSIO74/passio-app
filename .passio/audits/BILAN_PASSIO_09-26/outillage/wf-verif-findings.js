export const meta = {
  name: 'bilan-passio-verification',
  description: 'BILAN PASSIO 09/26 — vérification adversariale de chaque finding par des relecteurs indépendants (Fable 5.1)',
  phases: [{ title: 'Vérification adversariale', detail: 'chaque finding est attaqué par 2 à 3 relecteurs à angle distinct' }],
}

const MODEL = 'claude-fable-5-1'
const SP = '/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad'
const CTX = SP + '/CONTEXTE_AUDIT.md'

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMÉ', 'RÉFUTÉ', 'INCERTAIN'] },
    priorite_proposee: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    justification: { type: 'string', description: '3 à 10 lignes, avec fichier:ligne / requête / commande et résultat' },
    preuve_supplementaire: { type: 'string' },
    correction_du_finding: { type: 'string', description: 'si le finding est partiellement juste : ce qu il faut corriger dans sa formulation (attendu/observé/preuve/impact/effort)' },
  },
  required: ['verdict', 'priorite_proposee', 'justification', 'preuve_supplementaire', 'correction_du_finding'],
}

const LENSES = {
  reproduction: `ANGLE « REPRODUCTION » : ton unique question est : le défaut est-il RÉEL sur le SHA audité ? Refais toi-même la vérification (lecture du code aux lignes citées, preuves déposées dans preuves/ — jamais le connecteur Supabase —, test ciblé Playwright sur le serveur local si nécessaire avec PASSIO_PORT=8120). Si la preuve citée n'existe pas, est mal lue, ou décrit un autre comportement, RÉFUTE. Si tu ne peux pas reproduire ni infirmer, INCERTAIN. Par défaut, en cas de doute, RÉFUTÉ (la charge de la preuve est au finding).`,
  impact: `ANGLE « IMPACT ET PRIORITÉ » : suppose le défaut réel. Ta question : la priorité est-elle juste au regard des définitions (P0 bloque la commercialisation ; P1 avant lancement public ; P2 amélioration importante ; P3 optimisation future) et des critères d'interdiction du GO grande échelle (P0 ouvert ; isolation des comptes non prouvée ; restauration non prouvée ; capacité non mesurée ; fonction critique invisible du pilotage ET de la Sentinelle ; sécurité IRL ou modération insuffisante ; staging et prod non séparés) ? Est-ce vraiment un défaut, ou un comportement attendu / une décision produit documentée (ADR, CLAUDE.md, docs/lots-ui) ? Propose la priorité correcte. CONFIRMÉ = c'est un défaut réel à cette priorité (ou à la priorité corrigée que tu proposes) ; RÉFUTÉ = comportement attendu ou décision documentée ; INCERTAIN sinon.`,
  contexte: `ANGLE « CONTEXTE PROJET ET DOUBLONS » : lis CLAUDE.md, docs/PIEGES_CONNUS.md, .passio/context/KNOWN_RISKS.md, TECH_DEBT.md, les fiches docs/lots-ui pertinentes et les ADR. Ta question : ce finding est-il déjà connu, déjà traité, déjà décidé (alors dis-le et cite l'endroit — un risque connu et assumé reste un finding mais sa formulation doit le dire), contredit-il un invariant documenté, ou la correction proposée viole-t-elle un piège connu / un invariant (par ex. rouvrir ADR-009, toucher tests/, réintroduire une liste noire) ? CONFIRMÉ = finding nouveau ou connu mais toujours ouvert, correction compatible ; RÉFUTÉ = déjà corrigé sur le SHA audité (preuve) ; INCERTAIN sinon. Signale aussi si le même défaut est rapporté par un autre domaine (nom du doublon probable) dans correction_du_finding.`,
}

const SOCLE = `Tu es un relecteur INDÉPENDANT et SCEPTIQUE du projet « BILAN PASSIO 09/26 ». Lis d'abord ${CTX} (règles absolues : lecture seule, aucune écriture en base, aucun secret recopié, aucune modification de fichier suivi ; termine par git status --short vide). INTERDICTION D'OUTIL : n'utilise JAMAIS les outils du connecteur Supabase (mcp__supabase-passio-readonly__*), ni ToolSearch pour les charger. Toute vérification en base s'appuie sur les preuves déjà déposées dans le dossier preuves/ (par ex. preuves/supabase-isolation/policies.json, preuves/*/…) et sur le code (migrations/, js/). Si une requête SQL serait indispensable pour trancher, réponds INCERTAIN et écris la requête exacte dans preuve_supplementaire : l'orchestrateur l'exécutera lui-même. Tu reçois UN finding produit par un auditeur de domaine. Ton rôle est de l'ATTAQUER selon l'angle indiqué, pas de le compléter. Réponds UNIQUEMENT par l'objet structuré demandé.`

const findings = Array.isArray(args) ? args : []
log(`Findings à vérifier : ${findings.length}`)

phase('Vérification adversariale')
const results = await pipeline(findings, (f, _orig, i) => {
  const lenses = (f.priorite === 'P0' || f.priorite === 'P1') ? ['reproduction', 'impact'] : ['reproduction']
  return parallel(lenses.map((lens) => () =>
    agent(`${SOCLE}\n\n${LENSES[lens]}\n\nFINDING À VÉRIFIER : id « ${f.id} », domaine « ${f.domaine} », priorité proposée ${f.priorite}. Lis-le INTÉGRALEMENT (tous ses champs) dans le fichier ${f.fichier} (tableau \`findings\`, entrée dont \`id\` vaut « ${f.id} ») ; lis aussi le \`resume\`, les \`controles\` liés et les \`preuves_fichiers\` de ce domaine si utile.`, {
      label: `verif:${f.id}:${lens}`,
      phase: 'Vérification adversariale',
      model: MODEL,
      effort: (lens === 'reproduction' && (f.priorite === 'P0' || f.priorite === 'P1')) ? 'high' : 'medium',
      schema: VERDICT_SCHEMA,
    }).then((v) => ({ lens, ...(v || { verdict: 'INCERTAIN', priorite_proposee: f.priorite, justification: 'agent sans résultat', preuve_supplementaire: '', correction_du_finding: '' }) }))
  )).then((votes) => ({ id: f.id, domaine: f.domaine, priorite_initiale: f.priorite, votes: votes.filter(Boolean) }))
})

const out = results.filter(Boolean)
log(`Vérifications terminées : ${out.length}/${findings.length}`)
return out
