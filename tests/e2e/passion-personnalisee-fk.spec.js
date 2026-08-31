// La chaîne « passion personnalisée » est COUPÉE — verrou de non-régression.
//
// ⚠️ CE FICHIER A CHANGÉ DE SENS LE 2026-08-31, délibérément. Il REPRODUISAIT le
// défaut du 2026-08-30, maillon par maillon, pour que la décision se prenne sur
// des faits. La décision est prise (sortie A, `.passio/adr/ADR-010`), donc les
// attentes qui EXIGEAIENT le défaut sont devenues fausses : elles décrivaient un
// comportement que le correctif a supprimé. Elles sont retournées, pas retirées —
// la chaîne garde ses cinq maillons, et chacun est désormais vérifié COUPÉ.
//
// La chaîne d'origine, entièrement atteignable depuis l'interface :
//   ① `openCreateCustomPassion` → id `custom_<slug>_<rand>` dans
//      `state.user.customPassions` (LOCAL, jamais envoyé au serveur) ;
//   ② `allPassions()` la renvoie, donc la grille de `openCreateProfile` la montre ;
//   ③ créer une passion depuis cette tuile en fait un profil publiable ;
//   ④ `renderStudio` la met dans `#postPassion` ;
//   ⑤ `publishPost` l'envoie comme `passion_id` → rejet 23503, message trompeur.
//
// En production, `posts.posts_passion_fk` référence `passions(id)`, et la table
// `passions` n'a qu'une policy SELECT (`passions_select_all`) : aucun client ne
// peut y insérer la ligne correspondante. L'insert serait rejeté (23503) — c'est
// pourquoi la porte d'ÉCRITURE est fermée en amont, avant toute mutation locale.
//
// ⚠️ CE QUI N'A PAS CHANGÉ, et que ce fichier continue d'exiger : AUCUNE passion
// personnalisée n'est supprimée ni transformée. Elle reste dans le catalogue de
// LECTURE, elle range toujours le fil. Seule l'écriture est refusée.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Client Supabase factice qui SE COMPORTE COMME LA PROD : il rejette un
// `passion_id` absent du référentiel, avec le code PostgreSQL réel.
const PASSIONS_REFERENTIEL = ["musique", "sport", "cuisine", "moto", "yoga", "podcast"];

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((ref) => {
    window.__inserts = [];
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supabase = {
      createClient: () => ({
        from: (table) => ({
          insert: (rows) => {
            const arr = Array.isArray(rows) ? rows : [rows];
            window.__inserts.push({ table, rows: arr });
            const bad = arr.find(r => r.passion_id && ref.indexOf(r.passion_id) < 0);
            const err = bad ? {
              code: "23503",
              message: 'insert or update on table "' + table + '" violates foreign key constraint "'
                + table + '_passion_fk"',
              details: 'Key (passion_id)=(' + bad.passion_id + ') is not present in table "passions".',
            } : null;
            const res = { data: err ? null : arr, error: err };
            return { select: async () => res, then: (r) => r(res) };
          },
          upsert: async (row) => {
            window.__inserts.push({ table, rows: [row] });
            if (row && row.passion_id && ref.indexOf(row.passion_id) < 0) {
              return { error: { code: "23503", message: 'violates foreign key constraint "profiles_passion_fk"' } };
            }
            return { error: null };
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    window.supaPublishPostWithRetry = window.__vraiSupaPublishPost;
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
  }, PASSIONS_REFERENTIEL);
}

test("① ② ③ intacts (rien n'est supprimé), ④ coupé : le Studio ne la propose plus", async ({ page }) => {
  await boot(page);

  // ① et ② — la passion personnalisée entre dans le catalogue local.
  const dansLaGrille = await page.evaluate(() => {
    state.user.customPassions = [{
      id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot",
      color: "#8b5cf6", custom: true, approved: true, createdAt: Date.now(),
    }];
    saveState();
    return allPassions().some(p => p.id === "custom_tricot_ab12");
  });
  expect(dansLaGrille).toBe(true);

  // ③ — elle devient un profil, donc une destination de publication.
  const publiable = await page.evaluate(() => {
    state.user.profiles.push({
      id: "pp_tricot", name: "QA", passion: "custom_tricot_ab12",
      emoji: "🧶", color: "#8b5cf6", createdAt: Date.now(),
    });
    state.user.currentProfileId = "pp_tricot";
    saveState();
    goTo("studio");
    renderStudio();
    return Array.from(document.querySelectorAll("#postPassion option")).map(o => o.value);
  });
  // ④ COUPÉ — le <select> du Studio ne la propose plus (sortie A).
  expect(publiable, "une passion hors référentiel n'est plus une destination d'écriture")
    .not.toContain("custom_tricot_ab12");
  // …et le Studio n'est pas vide pour autant : la passion canonique du compte
  // reste proposée. Fermer la porte invalide ne doit pas fermer les valides.
  expect(publiable).toContain("musique");
});

test("⑤ coupé : la publication ne PART PLUS, et rien n'est écrit en local", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_tricot", name: "QA", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6" }];
    state.user.currentProfileId = "pp_tricot";
    saveState();
    goTo("studio");
    renderStudio();
    document.getElementById("postText").value = "Mon écharpe avance bien";
    window.__inserts = [];
    publishPost();
  });
  await page.waitForTimeout(6000);

  const insertsPosts = await page.evaluate(() =>
    window.__inserts.filter(i => i.table === "posts").map(i => i.rows[0].passion_id));
  // ⑤ COUPÉ — plus aucun insert ne part avec un id absent du référentiel.
  expect(insertsPosts, "aucune écriture ne doit partir vers une clé étrangère impossible")
    .toEqual([]);
  // ⚠️ Et le refus intervient AVANT la mutation locale : un post « publié » qui
  // n'atteint jamais personne est pire qu'un refus net — il paraît réussi à
  // l'écran et disparaît au rechargement.
  const local = await page.evaluate(() => (state.userPosts || []).length);
  expect(local, "aucune publication optimiste sans passion canonique").toBe(0);
});

test("le message dit la VRAIE cause, et oriente vers le catalogue", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_tricot", name: "QA", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6" }];
    state.user.currentProfileId = "pp_tricot";
    saveState();
    goTo("studio");
    renderStudio();
    // ⚠️ Un toast est TRANSITOIRE : le chercher dans le DOM après coup ne prouve
    // rien (il a disparu, et `publishPost` a ramené l'utilisateur au fil). On
    // enregistre les appels au moment où ils partent.
    window.__toasts = [];
    const _vraiToast = window.toast;
    window.toast = function (msg, kind) { window.__toasts.push(String(msg)); return _vraiToast.apply(this, arguments); };
    document.getElementById("postText").value = "Mon écharpe avance bien";
    publishPost();
  });
  await page.waitForTimeout(9000);

  const vu = await page.evaluate(() => (window.__toasts || []).join(" | "));
  // ⚠️ ATTENTE RETOURNÉE. Le message accusait la CONNEXION (« Post en local,
  // sera republié ») pour une contrainte de base définitive : réessayer n'aurait
  // jamais rien donné, et le post restait invisible de tous. Il nomme désormais
  // la vraie cause et dit quoi faire.
  expect(vu, "le message ne doit plus accuser le réseau").not.toContain("Post en local");
  expect(vu).toContain("Ajoute une passion du catalogue");
  // ⚠️ Il ne rouvre AUCUNE porte fermée par la sortie A : il oriente vers une
  // passion existante du catalogue, jamais vers la création d'une passion perso.
  expect(vu.toLowerCase()).not.toContain("crée ta passion");
  expect(vu.toLowerCase()).not.toContain("créer une passion");
  const local = await page.evaluate(() => (state.userPosts || []).length);
  expect(local, "rien n'est écrit en local non plus").toBe(0);
});

test("le profil PUBLIC part quand même : la passion invalide est normalisée en null", async ({ page }) => {
  await boot(page);
  const verdict = await page.evaluate(async () => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    // SEULE passion du compte → c'est elle que supaUpsertProfile met en passion_id.
    state.user.profiles = [{ id: "pp_tricot", name: "QA", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6" }];
    state.user.currentProfileId = "pp_tricot";
    saveState();
    window.__inserts = [];
    const ok = await supaUpsertProfile();
    const envoye = window.__inserts.filter(i => i.table === "profiles").map(i => i.rows[0].passion_id);
    return { ok: ok, envoye: envoye };
  });
  // ⚠️ ATTENTE RETOURNÉE, et c'est le maillon le plus grave des cinq.
  // `profiles.profiles_passion_fk` référence la même table : la synchronisation de
  // l'identité PUBLIQUE échouait elle aussi, donc pseudo, avatar et bio
  // n'atteignaient personne — et comme cinq tables portent une clé étrangère vers
  // `profiles(id)`, un compte NEUF dans ce cas ne pouvait plus rien écrire du tout.
  // Le profil public a une raison d'exister indépendante de son classement : la
  // passion invalide est donc normalisée en `null` plutôt que de faire rejeter
  // toute la ligne. Politique FACULTATIVE d'ADR-010.
  expect(verdict.envoye[0], "une passion hors référentiel devient null, elle ne bloque plus la ligne")
    .toBe(null);
  expect(verdict.ok, "l'identité publique atteint la base").toBe(true);
});
