// Sélection PURE du déploiement à restaurer (scripts/rollback-netlify.mjs).
// Sortie du script pour être éprouvée sans réseau : `node --test
// tests/unit/rollback-selection.test.mjs`.
//
// ⚠️ ASTRA-19 (contre-revue Astra, 2026-09-15) : « précédent » se calculait
// par `prods[findIndex(courant) + 1]`. Courant absent de la liste (une seule
// page de 30 lue, ou un déploiement ancien remis en ligne) → `findIndex` rend
// -1 → `prods[0]`, c'est-à-dire le PLUS RÉCENT : le retour arrière remettait
// en ligne une version plus neuve que celle qui tourne. On refuse désormais
// de désigner « précédent » sans avoir vu le courant.

/** Les déploiements de production PRÊTS, dans l'ordre reçu (du plus récent au plus ancien). */
export function filtrerProduction(liste) {
  return (liste || []).filter((d) => d && d.context === "production" && d.state === "ready");
}

/**
 * Le déploiement qui précède `courant` dans `prods`. Rend `{ cible }` ou
 * `{ erreur }` — jamais un déploiement deviné.
 */
export function precedentDe(prods, courant) {
  if (!courant) return { erreur: "aucun déploiement courant connu pour le site." };
  const i = (prods || []).findIndex((d) => d && d.id === courant);
  if (i === -1) return { erreur: `le déploiement courant (${courant}) n'est pas dans les ${(prods || []).length} déploiements de production lus : impossible de désigner « précédent » sans deviner — passer un identifiant explicite.` };
  const prev = prods[i + 1];
  if (!prev) return { erreur: "aucun déploiement de production avant le courant." };
  return { cible: prev.id };
}

/**
 * Faut-il lire une page de plus ? Oui tant que la page était pleine et que le
 * courant n'a pas été vu AVEC un successeur derrière lui.
 */
export function continuerPagination(page, taillePage, cumul, courant) {
  if (!page || page.length < taillePage) return false;
  if (!courant) return true;
  const i = cumul.findIndex((d) => d && d.id === courant);
  return i === -1 || i >= cumul.length - 1;
}
