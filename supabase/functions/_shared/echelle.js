// ═══════════════════════════════════════════════════════════════════════════
// LES SEUILS À L'ÉCHELLE — plancher absolu ET taux (2026-11-21, audit « 100 000 », T3)
//
// Les seuils de la veille sont des NOMBRES (10 erreurs, 5 pannes serveur, 2 comptes) :
// juste à 20 comptes, faux à 25 000, où le bruit de fond normal les dépasse à chaque
// quart d'heure — le voyant resterait rouge, et une vraie panne s'y noierait. UNE règle,
// pour tous les lecteurs :
//
//     seuil effectif = max(plancher, ⌈dénominateur × pourMille / 1000⌉)
//
// · Le taux ne peut que RELEVER un seuil au-dessus de son plancher, et seulement au-delà
//   du pivot (`pivotEchelle`) : sous lui, le plancher décide seul, exactement comme avant.
// · Des ENTIERS pour mille, jamais une fraction : 0.07 × 100 vaut 7.000000000000001 en
//   JavaScript, et Math.ceil en ferait 8. Aucun taux en service n'est touché aujourd'hui
//   (balayage de 1 à 100 000) : c'est une précaution, épinglée par seuilEchelle(1, 70, 100).
// · DÉNOMINATEUR HONNÊTE OU RIEN : il compte la même population que le numérateur, par
//   identité SERVEUR (auth.users), jamais par un identifiant qu'écrit le navigateur (un
//   device_id se forge gratuitement, et gonfler le dénominateur ferait taire une alarme).
//   Absent, illisible, nul, négatif ou non numérique → le PLANCHER seul.
//
// Module feuille : aucun import, aucun appel réseau. Le plancher et le taux sont des
// constantes des appelants, que leurs bancs épinglent ; la seule donnée d'exécution est
// le dénominateur, et c'est lui que la fonction valide.
// ═══════════════════════════════════════════════════════════════════════════

export const POUR_MILLE = 1000;

/** Le seuil effectif : le plancher, relevé par le taux quand un dénominateur honnête est connu. */
export function seuilEchelle(plancher, pourMille, denominateur) {
  if (!Number.isInteger(pourMille) || pourMille <= 0) return plancher;
  if (typeof denominateur !== "number" || !Number.isFinite(denominateur) || denominateur <= 0) return plancher;
  return Math.max(plancher, Math.ceil((Math.floor(denominateur) * pourMille) / POUR_MILLE));
}

/** Le plus grand dénominateur pour lequel le plancher décide encore seul. */
export const pivotEchelle = (plancher, pourMille) => Math.floor((plancher * POUR_MILLE) / pourMille);
