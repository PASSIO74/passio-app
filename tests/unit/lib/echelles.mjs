// ═══════════════════════════════════════════════════════════════════════════
// LES TROIS ÉCHELLES du lot T3 (2026-11-21, audit « 100 000 ») — des DONNÉES, aucun import.
//
// Les suites qui jugent un seuil « plancher ET taux » (_shared/echelle.js) le jouent contre
// les mêmes tailles de production :
//   · petit : 100 comptes connectés — la taille où les planchers doivent décider seuls ;
//   · grand : 25 000 comptes connectés, presque tous anciens — le bruit de fond normal
//     dépasse chaque seuil absolu à chaque quart d'heure ;
//   · vague : un lancement — 5 000 connectés dont 300 comptes anciens seulement : un
//     dénominateur « tous âges » diluerait une panne des seuls comptes anciens.
// ⚠️ Ce fichier n'importe AUCUN module de supabase/functions : une suite non listée par
// edge-functions.yml (veille-production) l'importe aussi (règle ② de edge-functions-verrous).
// ═══════════════════════════════════════════════════════════════════════════

export const ECHELLES = Object.freeze({
  petit: Object.freeze({ nom: "petit", connectes15: 100, anciens15: 90, anciensActifs1h: 95 }),
  grand: Object.freeze({ nom: "grand", connectes15: 25000, anciens15: 22000, anciensActifs1h: 23000 }),
  vague: Object.freeze({ nom: "vague", connectes15: 5000, anciens15: 300, anciensActifs1h: 350 }),
});

/** Les trois, dans l'ordre petit → grand → vague. */
export const TOUTES_ECHELLES = Object.freeze([ECHELLES.petit, ECHELLES.grand, ECHELLES.vague]);

/** Deux décisions sont-elles les mêmes (couleur, raisons, sonnerie) ? Rend la première différence, ou null. */
export function memeDecision(a, b) {
  const cles = ["couleur", "titre", "sonner", "etat"];
  for (const k of cles) if (JSON.stringify(a && a[k]) !== JSON.stringify(b && b[k])) return k;
  if (JSON.stringify((a && a.raisons) || null) !== JSON.stringify((b && b.raisons) || null)) return "raisons";
  if (JSON.stringify((a && a.texte) || null) !== JSON.stringify((b && b.texte) || null)) return "texte";
  return null;
}
