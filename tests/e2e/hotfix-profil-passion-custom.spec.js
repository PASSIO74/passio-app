// HOTFIX P0 — la ligne `profiles` doit exister, quelle que soit la passion.
//
// LE DÉFAUT. `supaUpsertProfile` commençait par `if (!prof) return;` et publiait
// `passion_id` sans vérifier que l'identifiant existe dans le référentiel.
// Or `profiles.passion_id` porte une clé étrangère vers `passions(id)`, table qui
// n'a qu'une policy SELECT : aucun client ne peut y insérer une ligne. Une passion
// personnalisée (`custom_…`) faisait donc rejeter TOUT l'upsert en 23503.
//
// PORTÉE EXACTE, à ne pas surestimer :
//   · un compte NEUF dont la première passion est personnalisée restait SANS ligne
//     `profiles` — et comme posts, stories, conv_members, conv_messages et
//     post_comments portent tous une FK vers `profiles(id)`, il ne pouvait plus
//     rien écrire ;
//   · un compte possédant DÉJÀ une ligne n'était PAS bloqué : un upsert qui échoue
//     ne supprime pas l'existant, ses données publiques restaient simplement
//     périmées.
//
// Ces tests tournent contre un client Supabase FACTICE qui applique la même règle
// que la production (rejet 23503 hors référentiel). Aucun octet ne part en base.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Le référentiel réel : les 19 ids semés par migration_passions_referentiel.sql.
const REFERENTIEL = ["musique","photo","voyage","cuisine","sport","litterature","cinema",
  "tech","art","jardinage","metier","jeuxvideo","yoga","mode","danse","podcast","moto","animaux","actu"];

async function boot(page, ref = REFERENTIEL) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((refs) => {
    window.__rows = [];      // ce que la « base » contient réellement
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // ⚠️ `supa` est un `let` de portée script : le seul point d'injection est
    // `_initRealSupa()`, qui lit le SDK global (cf. partage-bobine.spec.js).
    window.supabase = {
      createClient: () => ({
        from: (table) => ({
          upsert: async (row) => {
            if (row && row.passion_id && refs.indexOf(row.passion_id) < 0) {
              return { error: { code: "23503",
                message: 'violates foreign key constraint "' + table + '_passion_fk"',
                details: 'Key (passion_id)=(' + row.passion_id + ') is not present in table "passions".' } };
            }
            window.__rows = window.__rows.filter(r => r.id !== row.id).concat([row]);
            return { error: null };
          },
          insert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
  }, ref);
}

// Un compte dont la SEULE passion est personnalisée, sans le drapeau `custom` —
// exactement l'état d'un appareil neuf : la reconstruction du boot rebâtit les
// profils depuis le jsonb `profiles.passions` et ne restaure jamais
// `state.user.customPassions`.
async function compteCustomOnly(page, opts = {}) {
  await page.evaluate((o) => {
    state.user.customPassions = [];               // drapeau ABSENT
    state.user.profiles = [{
      id: "pp_custom", name: o.nomProfil || "QA",
      passion: "custom_tricot_ab12",              // id local, hors référentiel
      emoji: "🧶", color: "#8b5cf6",
    }];
    state.user.currentProfileId = "pp_custom";
    state.user.general = Object.assign({}, state.user.general, o.general || {});
    if (o.effacerNom) { state.user.name = ""; delete state.user.general.username; }
    saveState();
  }, opts);
}

test("compte custom-only : la ligne profiles est CRÉÉE, avec passion_id null", async ({ page }) => {
  await boot(page);
  await compteCustomOnly(page, { general: { username: "Benjamin" } });

  const res = await page.evaluate(async () => {
    window.__rows = [];
    await supaUpsertProfile();
    return window.__rows;
  });
  // Le cœur du hotfix : une ligne existe.
  expect(res.length).toBe(1);
  expect(res[0].passion_id).toBeNull();
  expect(res[0].username).toBe("Benjamin");
});

test("le username explicite du compte est CONSERVÉ", async ({ page }) => {
  await boot(page);
  await compteCustomOnly(page, { general: { username: "Benjamin" } });
  const row = await page.evaluate(async () => { window.__rows = []; await supaUpsertProfile(); return window.__rows[0]; });
  expect(row.username).toBe("Benjamin");
});

test("sans username résoluble : la ligne est créée avec « Profil »", async ({ page }) => {
  await boot(page);
  await compteCustomOnly(page, { effacerNom: true });
  const row = await page.evaluate(async () => { window.__rows = []; await supaUpsertProfile(); return window.__rows[0]; });
  // Un profil temporairement nommé « Profil » est moins grave qu'un compte privé
  // de ligne serveur et bloqué dans toutes ses interactions.
  expect(row).toBeTruthy();
  expect(row.username).toBe("Profil");
});

test("aucune donnée d'authentification privée n'est utilisée", async ({ page }) => {
  await boot(page);
  await compteCustomOnly(page, { effacerNom: true });
  const row = await page.evaluate(async () => {
    // Si le code lisait l'e-mail ou les métadonnées d'auth, elles seraient ici.
    window.__authLu = [];
    window.__rows = [];
    await supaUpsertProfile();
    return { row: window.__rows[0], authLu: window.__authLu };
  });
  const brut = JSON.stringify(row.row);
  expect(brut).not.toContain("@");            // aucune adresse e-mail publiée
  expect(row.authLu.length).toBe(0);
});

test("une passion CANONIQUE reste publiée telle quelle", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_moto", name: "QA", passion: "moto", emoji: "🏍", color: "#111" }];
    state.user.currentProfileId = "pp_moto";
    saveState();
  });
  const row = await page.evaluate(async () => { window.__rows = []; await supaUpsertProfile(); return window.__rows[0]; });
  // La normalisation ne doit toucher QUE l'invalide.
  expect(row.passion_id).toBe("moto");
});

test("passion canonique + passion perso : la canonique est choisie, rien n'est perdu", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.customPassions = [];
    state.user.profiles = [
      { id: "pp_custom", name: "QA", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", bio: "Écharpes" },
      { id: "pp_yoga", name: "QA", passion: "yoga", emoji: "🧘", color: "#8b5cf6" },
    ];
    state.user.currentProfileId = "pp_custom";
    saveState();
  });
  const row = await page.evaluate(async () => { window.__rows = []; await supaUpsertProfile(); return window.__rows[0]; });
  expect(row.passion_id).toBe("yoga");
  // ⚠️ AUCUNE donnée supprimée : la passion perso reste dans la LISTE publique
  // (le jsonb `passions` ne porte pas de clé étrangère), donc rien n'est perdu.
  const ids = row.passions.map(p => p.id);
  expect(ids).toContain("custom_tricot_ab12");
  expect(ids).toContain("yoga");
});

test("l'identité visuelle du COMPTE prime sur celle de la passion", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.profiles = [{ id: "pp_moto", name: "QA", passion: "moto", emoji: "🏍", color: "#111111" }];
    state.user.currentProfileId = "pp_moto";
    state.user.general = Object.assign({}, state.user.general, { emoji: "😎", color: "#ff0000" });
    saveState();
  });
  const row = await page.evaluate(async () => { window.__rows = []; await supaUpsertProfile(); return window.__rows[0]; });
  expect(row.emoji).toBe("😎");
  expect(row.color).toBe("#ff0000");
});

test("aucune passion locale n'est supprimée ni transformée par le hotfix", async ({ page }) => {
  await boot(page);
  await compteCustomOnly(page, { general: { username: "Benjamin" } });
  const avant = await page.evaluate(() => JSON.stringify(state.user.profiles));
  await page.evaluate(async () => { await supaUpsertProfile(); });
  const apres = await page.evaluate(() => JSON.stringify(state.user.profiles));
  expect(apres).toBe(avant);
});

test("la création de passion personnalisée est indisponible, et le dit", async ({ page }) => {
  await boot(page);
  const vu = await page.evaluate(() => {
    openCreateCustomPassion();
    const m = document.getElementById("modalContent");
    return m ? m.innerText : "";
  });
  expect(vu).toContain("momentanément indisponible");
  // Elle ne doit PAS laisser croire que les passions existantes sont perdues.
  expect(vu).toContain("ne sont pas touchées");
  // Et aucun formulaire de création n'est présenté.
  const champ = await page.evaluate(() => !!document.getElementById("customPassionName"));
  expect(champ).toBe(false);
});

test("l'outil de diagnostic utilise une passion canonique", async ({ page }) => {
  await boot(page);
  const src = await page.evaluate(async () => (await (await fetch("/js/emoji-misc.js")).text()));
  // C'était `passion_id: "test"` — un id hors référentiel, donc un 23503
  // systématique depuis la pose des FK : l'outil concluait à une panne de la base.
  expect(src).not.toContain('passion_id: "test"');
  // Et il nettoie désormais ce qu'il écrit.
  expect(src).toContain('.delete().eq("id", testPost.id)');
});
