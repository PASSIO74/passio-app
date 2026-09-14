// Lecture PAGINÉE d'une liste PostgREST (ASTRA-03, 2026-09-14).
//
// `scripts/moderation.js` lisait `reports?…&limit=500` puis filtrait les
// signalements OUVERTS en mémoire : dès que la table porte plus de 500 lignes,
// les plus anciennes — donc les ouverts qui attendent depuis le plus longtemps,
// ceux qui comptent le plus — sortent de la fenêtre et disparaissent de la
// liste, en silence. Le filtre doit être SERVEUR, et la lecture doit continuer
// tant qu'une page est pleine.
//
// Pur et sans réseau : `lirePage(offset, taille)` est fourni par l'appelant et
// rend un tableau. Rend `{ lignes, complet }` — `complet` faux si la borne de
// pages a été atteinte alors que la dernière page était pleine : l'appelant
// doit le DIRE, jamais présenter une liste tronquée comme entière.
async function lireToutesLesPages(lirePage, options) {
  const taille = (options && options.taille) || 500;
  const pagesMax = (options && options.pagesMax) || 20;
  const lignes = [];
  let pages = 0;
  for (;;) {
    const page = await lirePage(pages * taille, taille);
    const n = Array.isArray(page) ? page.length : 0;
    if (n) lignes.push(...page);
    pages++;
    if (n < taille) return { lignes, complet: true, pages };
    if (pages >= pagesMax) return { lignes, complet: false, pages };
  }
}

module.exports = { lireToutesLesPages };
