// P0 CONFIDENTIALITÉ — l'identité SERVEUR fait foi quand l'état local ne sait rien.
//
// LE DÉFAUT, révélé par le run 2337 de la CI et d'abord mal diagnostiqué.
// Retirer `if (!prof) return;` a débloqué la CRÉATION de la ligne `profiles`
// (le P0 que le hotfix répare) mais a ouvert du même coup une ÉCRITURE que
// `main` n'autorisait pas : un compte dont l'état local est VIDE — connexion sur
// un appareil neuf, avant que la reconstruction serveur n'ait peuplé
// `state.user.profiles` — envoyait ses REPLIS par-dessus une ligne existante.
//
// Mesuré en CI sur deux tests indépendants : `username` devenait « Profil »,
// `is_private` devenait `false`. Ce n'est pas une course de test : c'est une
// perte de données publiques et une régression de confidentialité — un compte
// privé redevenait public, en silence, à la simple connexion.
//
// Ce que cette suite prouve :
//   ① ligne absente + local vide       → la ligne est créée, et PRIVÉE ;
//   ② ligne existante + local vide     → username inchangé ;
//   ③ ligne existante privée + local vide → `is_private` reste `true` ;
//   ④ ligne publique + local vide      → reste publique (on ne la privatise pas) ;
//   ⑤ écriture concurrente             → aucun écrasement ;
//   ⑥ choix public PROUVÉ + ligne absente → créée publique ;
//   ⑦ simple `false` local sans preuve  → créée PRIVÉE ;
//   ⑧ profil local perso résoluble     → chemin normal, passion normalisée en `null` ;
//   ⑨ un 23505 sur une AUTRE contrainte n'est pas « la ligne existe ».
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Client factice qui applique la vraie règle d'unicité de la clé primaire :
// un `insert` sur un `id` déjà présent est refusé en 23505, avec le message que
// PostgreSQL produit réellement (il NOMME la contrainte).
async function boot(page, lignesInitiales = []) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((initiales) => {
    window.__rows = initiales.slice();
    window.__inserts = [];
    window.__upserts = [];
    window.__updates = [];
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // ⚠️ `supa` est un `let` de portée script : le seul point d'injection est
    // `_initRealSupa()`, qui lit le SDK global (cf. partage-bobine.spec.js).
    window.supabase = {
      createClient: () => ({
        from: () => ({
          insert: async (row) => {
            window.__inserts.push(JSON.parse(JSON.stringify(row)));
            if (window.__rows.some((r) => r.id === row.id)) {
              return { error: {
                code: "23505",
                message: 'duplicate key value violates unique constraint "profiles_pkey"',
                details: 'Key (id)=(' + row.id + ') already exists.',
              } };
            }
            window.__rows.push(JSON.parse(JSON.stringify(row)));
            return { error: null };
          },
          upsert: async (row) => {
            window.__upserts.push(JSON.parse(JSON.stringify(row)));
            window.__rows = window.__rows.filter((r) => r.id !== row.id).concat([JSON.parse(JSON.stringify(row))]);
            return { error: null };
          },
          // `update` CIBLÉ : il ne touche que les colonnes envoyées — c'est le
          // comportement réel de PostgREST, et c'est ce que les trois nouvelles
          // API exploitent pour ne jamais écraser un champ qu'elles n'écrivent pas.
          update: (corps) => {
            const q = {
              eq: () => q,
              select: async () => {
                window.__updates.push(JSON.parse(JSON.stringify(corps)));
                const cible = window.__rows.find((r) => r.id === window.__uid);
                if (!cible) return { data: [], error: null };
                Object.assign(cible, JSON.parse(JSON.stringify(corps)));
                return { data: [{ id: cible.id }], error: null };
              },
            };
            return q;
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
    // ⚠️ `supaInit` a déjà appelé `ensure` au démarrage : sans cette remise à
    // zéro, l'UID est marqué ASSURÉ et l'appel du test rend `true` sans rien
    // insérer. Le cache est une optimisation de production, pas un état que le
    // test doit hériter.
    if (typeof _resetProfilAssure === "function") _resetProfilAssure();
    // ⚠️ `MY_UID` est un `let` de PORTÉE SCRIPT (app-08:2384) : `window.MY_UID = …`
    // ne le rebinde pas — l'application continuerait d'écrire sous son propre id
    // et le test chercherait une ligne qui n'existe pas. On LIT donc l'id réel au
    // lieu d'en imposer un. (Le piège est documenté dans CLAUDE.md ; il m'a eu
    // ici même en écrivant cette suite.)
    window.__uid = MY_UID;
  }, lignesInitiales);
  // Les lignes de départ doivent porter l'id RÉEL du compte, pas un id inventé.
  await page.evaluate(() => {
    window.__rows.forEach((r) => { if (r.id === "uid_test") r.id = window.__uid; });
  });
}

// L'appareil neuf : authentifié, mais l'état local ne sait encore RIEN du compte.
// C'est le seul état qui déclenche le chemin « insert if absent ».
async function appareilNeuf(page, general = {}) {
  await page.evaluate((g) => {
    state.user.profiles = [];
    state.user.currentProfileId = null;
    state.user.name = "";
    state.user.general = g;
  }, general);
}

const ligneDe = (page) => page.evaluate(() => window.__rows.find((r) => r.id === window.__uid) || null);

test("① ligne absente + état local vide : la ligne est créée, et PRIVÉE", async ({ page }) => {
  await boot(page, []);
  await appareilNeuf(page);

  const ok = await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);

  expect(ok, "l'opération doit réussir — cinq clés étrangères dépendent de cette ligne").toBe(true);
  expect(ligne, "la ligne doit exister").not.toBeNull();
  expect(ligne.username).toBe("Profil");
  expect(ligne.passion_id, "aucune passion résoluble : la FK accepte NULL").toBe(null);
  // ⚠️ Le point de l'arbitrage : sans preuve de choix, le profil naît PRIVÉ.
  expect(ligne.is_private, "aucun choix prouvé → privé").toBe(true);
});

test("② ligne existante + état local vide : le username n'est PAS écrasé", async ({ page }) => {
  await boot(page, [{ id: "uid_test", username: "Benjamin", bio: "Ma vraie bio", is_private: false, emoji: "🏍️" }]);
  await appareilNeuf(page);

  const ok = await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);
  const upserts = await page.evaluate(() => window.__upserts.length);

  expect(ok, "la ligne existe : l'état voulu est atteint").toBe(true);
  expect(ligne.username, "c'est CE champ que le run 2337 voyait devenir « Profil »").toBe("Benjamin");
  expect(ligne.bio).toBe("Ma vraie bio");
  expect(ligne.emoji).toBe("🏍️");
  // Aucune écriture de mise à jour : le chemin normal ne doit pas être emprunté.
  expect(upserts, "aucun upsert : on ne réécrit pas une identité sur une ignorance").toBe(0);
});

test("③ ligne existante PRIVÉE + état local vide : elle reste privée", async ({ page }) => {
  await boot(page, [{ id: "uid_test", username: "Benjamin", is_private: true }]);
  await appareilNeuf(page);

  await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);

  // ⚠️ LE cas grave : un compte privé rendu public en silence, à la connexion.
  expect(ligne.is_private, "un compte privé ne redevient JAMAIS public tout seul").toBe(true);
});

test("④ ligne existante PUBLIQUE + état local vide : elle reste publique", async ({ page }) => {
  // La symétrie compte : la règle « privé par défaut » vaut pour une ligne
  // NEUVE. Sur une ligne existante, le choix serveur fait foi dans les DEUX
  // sens — privatiser d'office serait aussi un écrasement.
  await boot(page, [{ id: "uid_test", username: "Benjamin", is_private: false }]);
  await appareilNeuf(page);

  await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);

  expect(ligne.is_private).toBe(false);
  expect(ligne.username).toBe("Benjamin");
});

test("⑤ écriture concurrente : la ligne arrivée entre-temps n'est pas écrasée", async ({ page }) => {
  // La course réelle : deux démarrages simultanés, ou un test qui écrit sa ligne
  // pendant que l'application se connecte. Ici la « base » est vide au moment où
  // l'application construit sa charge, et la ligne apparaît AVANT que l'insert
  // n'arrive — exactement l'ordre qui rendait le run 2337 rouge.
  await boot(page, []);
  await appareilNeuf(page);

  const res = await page.evaluate(async () => {
    const insertOriginal = supa.from("profiles").insert;
    // Un écrivain concurrent glisse sa ligne juste avant que la nôtre parte.
    const vraiFrom = supa.from.bind(supa);
    supa.from = (t) => {
      const q = vraiFrom(t);
      const ins = q.insert;
      q.insert = async (row) => {
        window.__rows.push({ id: window.__uid, username: "Benjamin", is_private: true, bio: "concurrent" });
        return ins(row);
      };
      return q;
    };
    const ok = await supaEnsureProfileExists();
    return { ok, ligne: window.__rows.find((r) => r.id === window.__uid), nb: window.__rows.length };
  });

  expect(res.ok, "un conflit de clé primaire est un SUCCÈS : l'état voulu est atteint").toBe(true);
  expect(res.ligne.username, "la ligne du concurrent est intacte").toBe("Benjamin");
  expect(res.ligne.is_private).toBe(true);
  expect(res.nb, "une seule ligne : rien n'a été dupliqué ni recouvert").toBe(1);
});

test("⑥ choix public explicitement PROUVÉ + ligne absente : créée publique", async ({ page }) => {
  await boot(page, []);
  // Le marqueur que `saveMainProfile` pose quand la personne agit sur le contrôle.
  await appareilNeuf(page, { isPrivate: false, privacyChoisi: true });

  await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);

  expect(ligne.is_private, "un choix prouvé est respecté").toBe(false);
});

test("⑦ simple `false` local, SANS preuve de choix : créée PRIVÉE", async ({ page }) => {
  await boot(page, []);
  // ⚠️ Exactement ce que `is_private: !!g.isPrivate` aurait rendu public.
  await appareilNeuf(page, { isPrivate: false });

  await page.evaluate(() => supaEnsureProfileExists());
  const ligne = await ligneDe(page);

  expect(ligne.is_private, "`false` sans marqueur ne prouve aucun choix → privé").toBe(true);
});

test("⑦ bis — `undefined` ne doit jamais devenir `false` en silence", async ({ page }) => {
  await boot(page, []);
  await appareilNeuf(page, {});   // `general` vide : l'état réel d'un appareil neuf

  const vu = await page.evaluate(async () => {
    const avant = state.user.general.isPrivate;
    await supaEnsureProfileExists();
    return { avant, ligne: window.__rows.find((r) => r.id === window.__uid) };
  });

  expect(vu.avant, "prémisse : la valeur est bien absente, pas `false`").toBe(undefined);
  expect(vu.ligne.is_private).toBe(true);
});

test("⑧ profil local perso résoluble : chemin NORMAL, passion normalisée en null", async ({ page }) => {
  // L'état local est autoritaire (il porte une passion) : on ne prend pas le
  // chemin minimal, et le P0 d'origine reste couvert.
  await boot(page, []);
  await page.evaluate(() => {
    state.user.customPassions = [];
    state.user.profiles = [{ id: "pp_c", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6" }];
    state.user.currentProfileId = "pp_c";
    state.user.general = { username: "Benjamin", bio: "Salut" };
  });

  // ⚠️ POINT D'ENTRÉE ADAPTÉ (2026-08-31). Publier les passions n'est plus le
  // rôle de `supaUpsertProfile` : c'est `supaSavePassionState`, qui n'écrit QUE
  // `passions` et `passion_id`. L'attente « le reste de l'identité est publié
  // au passage » a été RETIRÉE — c'est précisément le comportement invalidé :
  // republier tout le profil à chaque changement de passion.
  const ok = await page.evaluate(() => supaSavePassionState());
  const vu = await page.evaluate(() => ({ ligne: window.__rows.find((r) => r.id === window.__uid) }));

  expect(ok).toBe(true);
  // L'assertion de RÉSULTAT qui compte est conservée : la passion hors
  // référentiel ne doit jamais partir telle quelle vers la clé étrangère.
  expect(vu.ligne.passion_id, "passion hors référentiel → normalisée").toBe(null);
});

test("⑨ un 23505 sur une AUTRE contrainte n'est PAS « la ligne existe »", async ({ page }) => {
  // ⚠️ La dette D2 propose un index unique sur `username`. Le jour où il
  // existera, un conflit dessus signifiera « ce pseudo est pris », pas « ta
  // ligne existe » — et renoncer alors à créer la ligne laisserait le compte
  // incapable d'écrire quoi que ce soit (cinq clés étrangères en dépendent).
  await boot(page, []);
  await appareilNeuf(page);

  const res = await page.evaluate(async () => {
    const vraiFrom = supa.from.bind(supa);
    supa.from = (t) => {
      const q = vraiFrom(t);
      q.insert = async () => ({ error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "profiles_username_unique"',
        details: 'Key (lower(trim(username)))=(benjamin) already exists.',
      } });
      return q;
    };
    return await supaEnsureProfileExists();
  });

  expect(res, "un conflit qui ne porte PAS sur `id` doit être remonté comme un échec").toBe(false);
});
