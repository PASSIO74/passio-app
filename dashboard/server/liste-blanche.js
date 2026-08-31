// ═══════════════════════════════════════════════════════════════════════════
// LISTES BLANCHES — lire une table par une clé qu'on ne choisit pas.
//
// `TABLE[cle]` traverse la chaîne de prototypes : `TABLE["constructor"]`,
// `"toString"`, `"valueOf"`, `"__proto__"` rendent tous quelque chose de VRAI,
// même sur une table qui ne les déclare pas. Une garde écrite `if (!TABLE[cle])
// return refus;` laisse donc passer ces cinq clés — la liste blanche a un trou
// qui ne se voit pas à la lecture.
//
// Ce n'était pas théorique dans ce dépôt (mesuré le 2026-08-30) :
//   • `tests.js` — l'identifiant de suite vient du corps de la requête. Avec
//     « constructor », le refus « hors liste blanche » ne partait pas ; la
//     fonction allait plus loin et tombait sur une erreur 500. Aucune commande
//     ne pouvait être exécutée (elle vient de la table, pas de l'appelant),
//     mais la garde ne gardait pas.
//   • `interactions.js` — `ev.action` vient de la TÉLÉMÉTRIE, donc du navigateur
//     de n'importe quel compte. Une action « constructor » était acceptée comme
//     une émission connue : un enregistrement fantôme entrait dans le journal,
//     chassait un enregistrement réel du tampon circulaire, et déclenchait une
//     re-lecture du panneau. Ni compté ni affiché, mais bien là.
//
// D'où cette fonction, unique et greppable : la clé doit être une propriété
// PROPRE de la table. Le reste du code garde sa forme (`const x = entree(T, k);
// if (!x) …`).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valeur associée à `cle` dans `table`, et `undefined` si `cle` n'y est pas
 * déclarée en propre — quoi qu'en dise la chaîne de prototypes.
 */
export function entree(table, cle) {
  if (!table || typeof cle !== "string") return undefined;
  return Object.hasOwn(table, cle) ? table[cle] : undefined;
}
