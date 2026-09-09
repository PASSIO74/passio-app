export const meta = {
  name: 'bilan-passio-completude',
  description: 'BILAN PASSIO 09/26 — critique de complétude : ce que les 16 domaines ont manqué face aux 37 points du mandat, puis audits complémentaires ciblés',
  phases: [{ title: 'Critique de complétude' }, { title: 'Compléments ciblés' }],
}

const MODEL = 'claude-fable-5-1'
const SP = '/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad'
const CTX = SP + '/CONTEXTE_AUDIT.md'

const GAPS_SCHEMA = {
  type: 'object',
  properties: {
    couverture: { type: 'array', items: { type: 'object', properties: { point: { type: 'string' }, couvert: { type: 'string', enum: ['OUI', 'PARTIEL', 'NON'] }, par: { type: 'string' }, manque: { type: 'string' } }, required: ['point', 'couvert', 'par', 'manque'] } },
    complements: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, prompt: { type: 'string', description: 'consigne autonome et précise pour un sous-agent (fichiers, commandes, ce qu il doit rendre)' }, port: { type: 'number' } }, required: ['titre', 'prompt', 'port'] }, description: 'au plus 6 compléments, les plus importants d abord' },
    incoherences: { type: 'array', items: { type: 'string' }, description: 'contradictions entre domaines (même fait, verdicts opposés), doublons de findings à fusionner (ids)' },
  },
  required: ['couverture', 'complements', 'incoherences'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    domaine: { type: 'string' },
    resume: { type: 'string' },
    controles: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, controle: { type: 'string' }, statut: { type: 'string', enum: ['PROUVÉ', 'CONFORME PAR INSPECTION', 'PROBABLE', 'DÉFAILLANT', 'BLOQUÉ', 'NON APPLICABLE'] }, methode: { type: 'string', enum: ['appareil réel', 'émulation', 'inspection code', 'requête base', 'test exécuté', 'non réalisé'] }, preuve: { type: 'string' } }, required: ['id', 'controle', 'statut', 'methode', 'preuve'] } },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, priorite: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, titre: { type: 'string' }, fonctionnalite: { type: 'string' }, attendu: { type: 'string' }, observe: { type: 'string' }, reproduction: { type: 'string' }, preuve: { type: 'string' }, impact: { type: 'string' }, visibilite_pilotage: { type: 'string' }, detection_sentinelle: { type: 'string' }, correction: { type: 'string' }, risque_regression: { type: 'string' }, effort: { type: 'string' }, confiance: { type: 'string', enum: ['CONFIRMÉ', 'PLAUSIBLE'] } }, required: ['id', 'priorite', 'titre', 'fonctionnalite', 'attendu', 'observe', 'reproduction', 'preuve', 'impact', 'visibilite_pilotage', 'detection_sentinelle', 'correction', 'risque_regression', 'effort', 'confiance'] } },
    surfaces_saines: { type: 'array', items: { type: 'string' } },
    non_verifie: { type: 'array', items: { type: 'string' } },
    anciens_rapports: { type: 'array', items: { type: 'string' } },
    preuves_fichiers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['domaine', 'resume', 'controles', 'findings', 'surfaces_saines', 'non_verifie', 'anciens_rapports', 'preuves_fichiers', 'notes'],
}

const MANDAT = `1 cartographier écrans/onglets/boutons/modales/formulaires/fonctions/données/services · 2 tous les onglets, logique cohérente · 3 chaque fonctionnalité au bon endroit, non dupliquée · 4 tous les parcours de bout en bout · 5 pitch, arrivée directe, onboarding, tour, bulles · 6 bulles claires, au bon moment, fermables, sans répétition · 7 profils multiples, passions, identité active par action · 8 publications, photos, vidéos, bobines, stories, audio, podcast, formats réels · 9 réactions, commentaires, abonnements, invitations, partage · 10 messagerie, pièces jointes, notifications · 11 IRL création/modification/annulation/recherche/filtres/liste/carte/inscription/désinscription/adresse/participants · 12 signalements, blocages, faux comptes, spam, harcèlement, outils de modération · 13 authentification, confirmation e-mail, récupération, sessions, suppression du compte · 14 Supabase tables/RLS/Storage/Realtime/fonctions/clés/permissions/séparation · 15 plusieurs comptes : jamais accès aux données d'un autre · 16 données personnelles, consentement, localisation, export, suppression, RGPD · 17 code mort, doublons, anciennes interfaces, fonctions inutilisées, docs obsolètes · 18 dépendances, secrets, erreurs silencieuses, collisions, migrations, SW, cache, flags, kill switches · 19 conserver/supprimer/nettoyer/refactoriser/soumettre · 20 performances démarrage/navigation/recherche/carte/messagerie/longs fils/médias/mémoire/batterie/réseau lent · 21 requêtes lentes, index, pagination, traitements inutiles, limites Realtime · 22 doubles clics, actions simultanées, pertes réseau, reprises, permissions refusées, changement de profil pendant une action · 23 capacité 1 000 / 10 000 / 100 000 · 24 coûts Supabase/Netlify/stockage/bande passante/e-mails/médias/carte/services · 25 « capacité non prouvée » sans mesure · 26 charge sur staging seulement · 27 iPhone/iPad/Android/tablette/Windows/macOS · 28 Safari/Chrome/Edge/Firefox/Samsung/PWA installée · 29 320/360/390/412/430, tablettes, ordinateurs · 30 portrait/paysage/encoches/clavier virtuel/souris/clavier/zoom/texte agrandi · 31 caméra/micro/localisation/partage/notifications/permissions refusées · 32 réel vs émulation vs non réalisé · 33 accessibilité contraste/lecteur d'écran/focus/boutons/alt/animations · 34 sauvegardes/restauration/rollback/modes dégradés · 35 pannes Supabase/Netlify/SMTP/carte simulées sans risque · 36 support, incidents, demandes RGPD, continuité · 37 juridique, contenus, PI, mineurs, sécurité IRL · CP Centre de pilotage : chaîne fonctionnalité→signal→alerte→diagnostic→action→preuve, 15 affichages · SE Sentinelle : 10 propriétés · AD sécurité administrative MFA/rôles/autorisations/journal/confirmation`

const resume = args && args.resume ? args.resume : ''

phase('Critique de complétude')
const gaps = await agent(`Tu es le critique de complétude du projet « BILAN PASSIO 09/26 ». Lis ${CTX}. Voici le MANDAT (points numérotés) :\n${MANDAT}\n\nVoici le RÉSUMÉ des 16 audits de domaine déjà rendus (résumés, nombre de contrôles, ids et titres des findings, non vérifiés) :\n${resume}\n\nLes sorties complètes sont dans ${SP}/resultats-domaines.json (lis-le : c'est un tableau d'objets {key, resume, controles[], findings[], surfaces_saines[], non_verifie[], anciens_rapports[], notes}).\n\nTâche : (1) pour CHAQUE point du mandat, dire s'il est couvert (OUI/PARTIEL/NON), par quel(s) domaine(s), et ce qui manque précisément ; (2) proposer au plus 6 compléments d'audit ciblés, formulés comme des consignes autonomes pour un sous-agent en lecture seule (fichiers à lire, commandes à lancer, port Playwright dédié à partir de 8130, ce qu'il doit rendre) — priorise ce qui pèse sur le verdict commercial (critères d'interdiction du GO : P0 ouvert ; isolation non prouvée ; restauration non prouvée ; capacité non mesurée ; fonction critique invisible du pilotage ET de la Sentinelle ; sécurité IRL ou modération insuffisante ; staging non séparé) ; (3) relever les incohérences entre domaines (même fait, verdicts opposés) et les doublons de findings (ids à fusionner). Ne modifie aucun fichier suivi.`, {
  label: 'critique:completude', phase: 'Critique de complétude', model: MODEL, effort: 'high', schema: GAPS_SCHEMA,
})

if (!gaps) return { gaps: null, complements: [] }
log(`Compléments proposés : ${gaps.complements.length}`)

phase('Compléments ciblés')
const SOCLE = `Tu es un auditeur senior indépendant, sous-agent complémentaire du projet « BILAN PASSIO 09/26 ». AVANT TOUT lis intégralement ${CTX} (règles absolues : lecture seule, aucune écriture en base, aucun test de charge sur la production, aucun secret ni contenu privé recopié, aucun fichier suivi modifié ; termine par git status --short vide). INTERDICTION D'OUTIL : n'utilise JAMAIS les outils du connecteur Supabase (mcp__supabase-passio-readonly__*), ni ToolSearch pour les charger. Toute vérification en base s'appuie sur les preuves déjà déposées dans le dossier preuves/ (par ex. preuves/supabase-isolation/policies.json, preuves/*/…) et sur le code (migrations/, js/). Si une requête SQL serait indispensable pour trancher, réponds INCERTAIN et écris la requête exacte dans le champ notes : l'orchestrateur l'exécutera lui-même. Dépose tes preuves dans ${SP}/preuves/complements/. Chaque contrôle reçoit un statut et une méthode ; chaque problème reçoit TOUS les champs du format, une priorité et une confiance. Préfixe tes ids par COMP-. Réponds UNIQUEMENT par l'objet structuré.`
const complements = await pipeline(gaps.complements.slice(0, 6), (c, _o, i) =>
  agent(`${SOCLE}\n\nTITRE : ${c.titre}\nPORT PLAYWRIGHT DÉDIÉ : ${c.port || 8130 + i}\n\nCONSIGNE :\n${c.prompt}`, {
    label: 'complement:' + (i + 1), phase: 'Compléments ciblés', model: MODEL, effort: 'high', schema: FINDINGS_SCHEMA,
  }).then((r) => (r ? { key: 'complement-' + (i + 1) + '-' + c.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), ...r } : null))
)

return { gaps, complements: complements.filter(Boolean) }
