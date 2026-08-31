// TROIS AUTORITÉS D'ÉCRITURE DU PROFIL PUBLIC  (P0 confidentialité, 2026-08-31)
//
// L'autorité d'une écriture ne se DEVINE pas depuis l'état local : elle vient de
// ce que l'appelant est en train de faire. Une première version aiguillait sur
// `state.user.profiles.length > 0` — et le contre-exemple est le test ⑨ de cette
// suite : profil serveur PRIVÉ + passions locales non vides + `general`
// incomplet passait pour « autoritaire », donc `is_private: !!g.isPrivate`
// valait `false` et le compte redevenait public.
//
//   · supaEnsureProfileExists() — la ligne doit exister. N'écrit AUCUN champ.
//   · supaSavePublicProfile(c)  — la personne vient d'éditer `c`. Liste blanche.
//   · supaSavePassionState()    — passions et passion_id, rien d'autre.
//
// ⚠️ L'AUTORITÉ EST AUSSI CHAMP PAR CHAMP : qu'une action soit explicite ne rend
// pas tous ses champs autoritaires (test ⑤).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Faux client qui modélise la VRAIE table : clé primaire unique, `update`
// ciblé qui ne touche que les colonnes envoyées.
async function boot(page, lignesInitiales = []) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((initiales) => {
    window.__rows = [];
    window.__inserts = [];
    window.__updates = [];
    window.__pannes = 0;            // nombre d'inserts à faire échouer (réseau)
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // ⚠️ `supa` est un `let` de portée script : seul `_initRealSupa()` injecte.
    window.supabase = {
      createClient: () => ({
        from: () => ({
          insert: async (row) => {
            window.__inserts.push(JSON.parse(JSON.stringify(row)));
            if (window.__pannes > 0) {
              window.__pannes--;
              return { error: { code: "PGRST000", message: "network error" } };
            }
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
          upsert: async () => ({ error: null }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    // ⚠️ `MY_UID` est un `let` de PORTÉE SCRIPT : `window.MY_UID = …` ne le
    // rebinde pas. On LIT l'identifiant réel plutôt que d'en imposer un.
    window.__uid = MY_UID;
    initiales.forEach((r) => window.__rows.push(Object.assign({}, r, { id: MY_UID })));
    if (typeof _resetProfilAssure === "function") _resetProfilAssure();
  }, lignesInitiales);
}

const ligne = (page) => page.evaluate(() => window.__rows.find((r) => r.id === window.__uid) || null);

// ════════════════════════════════════════════════════════════════════════════
// LE CACHE : un seul insert par session, une seule promesse partagée
// ════════════════════════════════════════════════════════════════════════════

test("① dix envois dans la même session : UN SEUL ensure réseau", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) await supaEnsureProfileExists();
    return { inserts: window.__inserts.length, rows: window.__rows.length };
  });
  // Sans cache : dix INSERT, dont neuf conflits SQL — un aller-retour réseau et
  // un 23505 par message envoyé.
  expect(vu.inserts, "un seul aller-retour, les neuf suivants sont servis par le cache").toBe(1);
  expect(vu.rows).toBe(1);
});

test("② deux ensure SIMULTANÉS : un seul insert", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    const [a, b, c] = await Promise.all([
      supaEnsureProfileExists(), supaEnsureProfileExists(), supaEnsureProfileExists(),
    ]);
    return { a, b, c, inserts: window.__inserts.length };
  });
  expect(vu.a && vu.b && vu.c).toBe(true);
  expect(vu.inserts, "les appels concurrents attendent la MÊME promesse").toBe(1);
});

test("③ premier ensure en erreur RÉSEAU : le second réessaie", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    window.__pannes = 1;                       // le premier insert échoue
    const un = await supaEnsureProfileExists();
    const deux = await supaEnsureProfileExists();
    return { un, deux, inserts: window.__inserts.length, rows: window.__rows.length };
  });
  // ⚠️ Une erreur réelle ne doit RIEN mettre en cache : sinon la ligne ne serait
  // jamais créée de toute la session, et le compte resterait incapable d'écrire.
  expect(vu.un, "l'échec réseau est rapporté").toBe(false);
  expect(vu.deux, "et la reprise aboutit").toBe(true);
  expect(vu.inserts).toBe(2);
  expect(vu.rows).toBe(1);
});

test("④ changement d'UID : un nouvel ensure part", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    await supaEnsureProfileExists();
    const apres1 = window.__inserts.length;
    MY_UID = "uid_autre_compte";               // `let` de portée script : on l'écrit ici
    window.__uid = MY_UID;
    await supaEnsureProfileExists();
    return { apres1, apres2: window.__inserts.length, ids: window.__rows.map((r) => r.id) };
  });
  expect(vu.apres1).toBe(1);
  expect(vu.apres2, "le cache est indexé par UID : un autre compte le manque").toBe(2);
  expect(vu.ids.length).toBe(2);
});

// ════════════════════════════════════════════════════════════════════════════
// L'AUTORITÉ CHAMP PAR CHAMP
// ════════════════════════════════════════════════════════════════════════════

test("⑤ onboarding SANS contrôle de confidentialité : le profil reste privé", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    state.user.general = { username: "Benjamin", bio: "Salut" };   // pas de privacyChoisi
    await supaEnsureProfileExists();
    // Ce que `onbFinish` publie : pseudo et bio, JAMAIS `is_private`.
    await supaSavePublicProfile({ username: "Benjamin", bio: "Salut" });
    return window.__rows.find((r) => r.id === window.__uid);
  });
  expect(vu.username).toBe("Benjamin");
  expect(vu.bio).toBe("Salut");
  // ⚠️ Le point de l'arbitrage : une action explicite sur l'identité n'autorise
  // pas à écrire un champ que ce parcours ne propose pas.
  expect(vu.is_private, "la ligne minimale l'a créé privé, rien ne l'a rendu public").toBe(true);
});

test("⑤ bis — `is_private` soumis SANS preuve de choix est refusé", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    state.user.general = { username: "Benjamin", isPrivate: false };  // aucun marqueur
    await supaEnsureProfileExists();
    await supaSavePublicProfile({ username: "Benjamin", is_private: false });
    return {
      ligne: window.__rows.find((r) => r.id === window.__uid),
      champsEcrits: window.__updates.map((u) => Object.keys(u).sort()),
    };
  });
  expect(vu.ligne.is_private).toBe(true);
  expect(vu.champsEcrits.flat(), "`is_private` n'est même pas envoyé").not.toContain("is_private");
});

test("⑤ ter — avec la preuve, le choix public est respecté", async ({ page }) => {
  await boot(page, []);
  const vu = await page.evaluate(async () => {
    state.user.general = { username: "Benjamin", isPrivate: false, privacyChoisi: true };
    await supaEnsureProfileExists();
    await supaSavePublicProfile({ is_private: false });
    return window.__rows.find((r) => r.id === window.__uid);
  });
  expect(vu.is_private).toBe(false);
});

test("⑥ sauvegarde de la bio seule : la confidentialité ne bouge pas", async ({ page }) => {
  await boot(page, [{ username: "Benjamin", bio: "Ancienne", is_private: true, emoji: "🏍️" }]);
  const vu = await page.evaluate(async () => {
    state.user.general = { username: "Benjamin", bio: "Nouvelle" };
    await supaSavePublicProfile({ bio: "Nouvelle" });
    return { ligne: window.__rows.find((r) => r.id === window.__uid), updates: window.__updates };
  });
  expect(vu.ligne.bio).toBe("Nouvelle");
  expect(vu.ligne.is_private, "un compte privé le reste").toBe(true);
  expect(vu.ligne.username).toBe("Benjamin");
  expect(Object.keys(vu.updates[0]), "un seul champ part").toEqual(["bio"]);
});

test("⑦ changement de photo : seul `avatar_url` change", async ({ page }) => {
  await boot(page, [{ username: "Benjamin", bio: "Ma bio", is_private: true, cover_url: "https://x.test/c.jpg" }]);
  const vu = await page.evaluate(async () => {
    await supaSavePublicProfile({ avatar_url: "https://x.test/a.jpg" });
    return { ligne: window.__rows.find((r) => r.id === window.__uid), updates: window.__updates };
  });
  expect(Object.keys(vu.updates[0])).toEqual(["avatar_url"]);
  expect(vu.ligne.avatar_url).toBe("https://x.test/a.jpg");
  expect(vu.ligne.cover_url, "la couverture n'est pas touchée").toBe("https://x.test/c.jpg");
  expect(vu.ligne.bio).toBe("Ma bio");
  expect(vu.ligne.is_private).toBe(true);
});

test("⑧ changement de passion : AUCUN champ d'identité ne change", async ({ page }) => {
  await boot(page, [{ username: "Benjamin", bio: "Ma bio", is_private: true, emoji: "🏍️", color: "#111111" }]);
  const vu = await page.evaluate(async () => {
    state.user.profiles = [
      { id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed" },
      { id: "pp_1", name: "Yoga", passion: "yoga", emoji: "🧘", color: "#10b981" },
    ];
    state.user.currentProfileId = "pp_1";
    state.user.general = {};        // `general` VIDE : le pire cas
    await supaSavePassionState();
    return { ligne: window.__rows.find((r) => r.id === window.__uid), updates: window.__updates };
  });
  // Seules deux colonnes partent.
  expect(Object.keys(vu.updates[0]).sort()).toEqual(["passion_id", "passions"]);
  expect(vu.ligne.username, "le pseudo est intact").toBe("Benjamin");
  expect(vu.ligne.bio).toBe("Ma bio");
  expect(vu.ligne.emoji).toBe("🏍️");
  expect(vu.ligne.color).toBe("#111111");
  expect(vu.ligne.is_private, "et la confidentialité aussi").toBe(true);
  expect(Array.isArray(vu.ligne.passions)).toBe(true);
});

test("⑨ LE CAS CRITIQUE — profil serveur privé + passions locales + `general` incomplet", async ({ page }) => {
  // ⚠️ C'est exactement ce que l'heuristique `profiles.length > 0` classait
  // « autoritaire » : elle partait sur le chemin d'écriture complet, envoyait
  // `is_private: !!g.isPrivate` → `false`, et le compte privé redevenait public.
  await boot(page, [{ username: "Benjamin", bio: "Ma vraie bio", is_private: true, emoji: "🏍️" }]);
  const vu = await page.evaluate(async () => {
    state.user.profiles = [{ id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    state.user.general = {};        // incomplet : ni username, ni bio, ni isPrivate
    state.user.name = "";
    // Le parcours réel : démarrage, puis une interaction quelconque.
    await supaEnsureProfileExists();
    await supaEnsureProfileExists();
    return { ligne: window.__rows.find((r) => r.id === window.__uid), updates: window.__updates.length };
  });
  expect(vu.ligne.is_private, "un compte privé ne redevient JAMAIS public tout seul").toBe(true);
  expect(vu.ligne.username, "et son pseudo public n'est pas remplacé par « Profil »").toBe("Benjamin");
  expect(vu.ligne.bio).toBe("Ma vraie bio");
  expect(vu.updates, "aucune mise à jour : `ensure` n'écrit AUCUN champ").toBe(0);
});

test("⑩ liste blanche : un champ inconnu n'est jamais écrit", async ({ page }) => {
  await boot(page, [{ username: "Benjamin", is_private: true }]);
  const vu = await page.evaluate(async () => {
    await supaSavePublicProfile({ username: "Ben", role: "admin", passion_id: "moto" });
    return { ligne: window.__rows.find((r) => r.id === window.__uid), updates: window.__updates };
  });
  expect(Object.keys(vu.updates[0]), "seul `username` passe la liste blanche").toEqual(["username"]);
  expect(vu.ligne.role, "un champ hors liste n'atteint jamais la base").toBe(undefined);
  // `passion_id` n'appartient pas à cette API : il relève de supaSavePassionState.
  expect(vu.ligne.passion_id).toBe(undefined);
});
