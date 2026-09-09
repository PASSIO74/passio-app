#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SENTINELLE AUTONOME — ÉTAPE 1 : TROUVER CE QUE SUBISSENT LES UTILISATEURS.
//
// Tourne dans GitHub Actions (pas sur un PC), lit `client_errors` en production
// et rend UN verdict : y a-t-il un défaut qui mérite un correctif automatique ?
//
// ⚠️ IL NE CORRIGE RIEN ET N'ÉCRIT NULLE PART. Il lit, il classe, il rend du
// JSON. Séparer la DÉTECTION de la RÉPARATION est ce qui permet de le tester
// sans base et sans réseau : `classer()` est une fonction pure.
//
// ⚠️ « AUCUNE ERREUR » NE VEUT PAS DIRE « TOUT VA BIEN ». Ce détecteur ne voit
// que ce qui LÈVE une erreur JavaScript. Un bouton qui n'émet plus rien, un
// résultat faux en HTTP 200, une télémétrie interrompue : zéro ligne ici, et ça
// ressemble exactement au calme. C'est l'angle mort documenté en tête de
// `dashboard/server/sentinel.js`, et il ne disparaît pas en changeant de
// machine. Le silence de ce script n'est jamais une preuve de santé.
// ═══════════════════════════════════════════════════════════════════════════

// Messages qui ne portent AUCUNE information exploitable : les corriger est
// impossible, les compter fait du bruit qui masque le vrai signal.
//   · « Script error. » = erreur d'un script d'une autre origine, le navigateur
//     REFUSE d'en dire plus par sécurité. Il n'y a rien à lire, jamais.
//   · Les extensions de navigateur du visiteur ne sont pas notre code.
export const BRUIT = [
  /^script error\.?$/i,
  /^resizeobserver loop/i,
  /extension:\/\//i,
  /^network ?error$/i,
];

// Un seul compte qui rencontre une erreur peut être un appareil exotique ; le
// même défaut chez plusieurs comptes est un défaut du produit. On garde les
// deux, mais on les classe différemment.
const MIN_OCCURRENCES = Number(process.env.SENTINELLE_MIN_OCCURRENCES || 3);

/** Normalise un message pour regrouper les variantes d'une même cause. */
export function empreinte(message) {
  return String(message || "")
    .slice(0, 300)
    .replace(/\d+/g, "#")                      // indices, ids, tailles
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function estDuBruit(message) {
  const m = String(message || "").trim();
  if (!m) return true;
  return BRUIT.some((re) => re.test(m));
}

/**
 * Classe des lignes brutes de `client_errors` en causes candidates.
 * FONCTION PURE — c'est elle que les tests éprouvent, sans base ni réseau.
 *
 * @returns {{candidates: Array, ecartees: number}}
 */
export function classer(lignes = [], options = {}) {
  const min = options.min ?? MIN_OCCURRENCES;
  const groupes = new Map();
  let ecartees = 0;

  for (const l of lignes) {
    if (estDuBruit(l.message)) { ecartees++; continue; }
    const cle = empreinte(l.message);
    if (!groupes.has(cle)) {
      groupes.set(cle, { cle, message: String(l.message).slice(0, 300), n: 0, comptes: new Set(), dernier: null, exemple: null });
    }
    const g = groupes.get(cle);
    g.n++;
    if (l.uid) g.comptes.add(String(l.uid));
    if (!g.dernier || String(l.created_at) > g.dernier) g.dernier = String(l.created_at);
    // On garde UN exemple complet : c'est lui qui porte la pile d'appel, donc
    // le seul contexte qui permette d'établir une cause dans le code.
    if (!g.exemple && (l.stack || l.source)) {
      g.exemple = { stack: String(l.stack || "").slice(0, 2000), source: l.source || null, line: l.line || null, url: l.url || null };
    }
  }

  const candidates = [...groupes.values()]
    .map((g) => ({ ...g, comptes: g.comptes.size }))
    // ⚠️ LE TRI EST PAR NOMBRE DE COMPTES D'ABORD. Une erreur vue 200 fois par
    // UNE personne est souvent un appareil ou une extension ; vue 3 fois par
    // 3 personnes, c'est le produit. Trier par volume brut ferait travailler la
    // sentinelle sur le cas le moins représentatif.
    .sort((a, b) => (b.comptes - a.comptes) || (b.n - a.n))
    .filter((g) => g.n >= min || g.comptes >= 2);

  return { candidates, ecartees };
}

/** Lit les erreurs récentes via PostgREST. Isolé pour rester testable. */
async function lireErreurs({ url, cle, heures }) {
  const depuis = new Date(Date.now() - heures * 3600_000).toISOString();
  const r = await fetch(
    `${url}/rest/v1/client_errors?select=message,source,line,stack,url,uid,created_at&created_at=gt.${depuis}&order=created_at.desc&limit=1000`,
    { headers: { apikey: cle, Authorization: "Bearer " + cle } });
  if (!r.ok) throw new Error(`client_errors: HTTP ${r.status}`);
  return r.json();
}

async function principal() {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const heures = Number(process.env.SENTINELLE_FENETRE_H || 24);
  if (!url || !cle) {
    // ⚠️ On ÉCHOUE, on ne rend pas « rien à signaler ». Une sentinelle sans
    // accès qui rend un verdict vide est indiscernable d'une prod saine —
    // c'est la panne silencieuse que tout ce chantier corrige.
    console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant : la détection ne peut pas s'exécuter.");
    process.exit(2);
  }
  const lignes = await lireErreurs({ url, cle, heures });
  const { candidates, ecartees } = classer(lignes);
  const verdict = {
    fenetreHeures: heures,
    lues: lignes.length,
    ecartees,
    retenues: candidates.length,
    cible: candidates[0] || null,
  };
  console.log(JSON.stringify(verdict, null, 2));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  principal().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
