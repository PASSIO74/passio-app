// Faux client Supabase modélisant la table `profiles` — partagé.
//
// POURQUOI UN MODULE, et pas une copie par suite. Depuis la séparation des
// autorités (P0 confidentialité, 2026-08-31), écrire le profil public passe par
// TROIS opérations distinctes au lieu d'un `upsert` unique :
//   · `supaEnsureProfileExists()` → `insert`, et un conflit de clé primaire
//     signifie « la ligne existe », pas un échec ;
//   · `supaSavePublicProfile(c)`  → `update(c).eq("id").select()` ciblé ;
//   · `supaSavePassionState()`    → `update({passions, passion_id})` ciblé.
// Un faux qui n'implémente que `upsert` ne voit donc plus rien passer, et une
// suite bâtie dessus mesure son propre double au lieu du code.
//
// ⚠️ Le modèle de la CLÉ PRIMAIRE est la partie qu'il ne faut surtout pas
// dupliquer : `_insertProfilMinimalSiAbsent` traite le `23505` sur
// `profiles_pkey` comme un SUCCÈS (la ligne existe déjà) et TOUTE autre erreur
// comme un échec. Deux copies de cette règle finiraient par diverger — c'est
// exactement ce qui s'était produit entre `sharePostInFeed` et
// `shareReelInFeed`, où le champ `createdAt` manquait dans une seule des deux.
//
// S'installe dans la page : `await page.evaluate(installerFauxProfiles)`.
// Expose ensuite `window.__rows` (la table), `window.__updates` (les mises à
// jour reçues, dans l'ordre) et `window.__inserts` (les insertions tentées).
function installerFauxProfiles() {
  // ⚠️ `MY_UID` est un `let` de portée script : il existe comme identifiant
  // global mais n'est PAS une propriété de `window`. Un test qui lit
  // `window.MY_UID` obtient `undefined` et compare des lignes à rien. On en
  // publie donc une copie ici, une fois, pour toutes les suites.
  window.__uid = (typeof MY_UID !== "undefined") ? MY_UID : null;
  window.__rows = [];
  window.__updates = [];
  window.__inserts = [];
  window.supaLoadPosts = async () => [];
  window.supaSaveUserState = async () => {};
  window.supaUsernameTaken = async () => null;   // pas d'aller-retour réseau

  const table = (nom) => ({
    insert: async (row) => {
      const r = Array.isArray(row) ? row[0] : row;
      window.__inserts.push({ table: nom, row: r });
      if (nom !== "profiles") return { data: [r], error: null };
      if (window.__rows.some((x) => x.id === r.id)) {
        // Le conflit RÉEL de PostgreSQL, avec le code et la contrainte exacts :
        // le code de production n'accepte que celui-là comme « existe déjà ».
        return {
          data: null,
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "profiles_pkey"',
            details: 'Key (id)=(' + r.id + ') already exists.',
          },
        };
      }
      window.__rows.push(Object.assign({}, r));
      return { data: [r], error: null };
    },
    update: (patch) => ({
      eq: (col, val) => {
        const appliquer = () => {
          window.__updates.push({ table: nom, patch: Object.assign({}, patch), col, val });
          const touchees = window.__rows.filter((x) => x[col] === val);
          touchees.forEach((x) => Object.assign(x, patch));
          return { data: touchees.map((x) => ({ id: x.id })), error: null };
        };
        // `update().eq().select()` ET `update().eq()` seul doivent marcher :
        // le second est un thenable, comme le vrai SDK.
        const p = { select: async () => appliquer(), then: (res) => res(appliquer()) };
        return p;
      },
    }),
    upsert: async (row) => {
      const r = Array.isArray(row) ? row[0] : row;
      window.__rows = window.__rows.filter((x) => x.id !== r.id).concat([Object.assign({}, r)]);
      return { data: [r], error: null };
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
    select: () => ({
      eq: (col, val) => ({
        maybeSingle: async () => ({ data: window.__rows.find((x) => x[col] === val) || null, error: null }),
      }),
    }),
  });

  window.supabase = { createClient: () => ({ from: table }) };
  // ⚠️ `supa` est un `let` de portée script : seul `_initRealSupa()` peut le
  // rebinder, et il sort tôt sur `window._supaReal`. Le drapeau DOIT retomber
  // à false avant l'appel, sinon le faux n'est jamais installé et la suite
  // passe — ou échoue — pour une raison qui n'a rien à voir avec le sujet.
  window._supaReal = false;
  _initRealSupa();
  if (typeof _resetProfilAssure === "function") _resetProfilAssure();
}

module.exports = { installerFauxProfiles };
