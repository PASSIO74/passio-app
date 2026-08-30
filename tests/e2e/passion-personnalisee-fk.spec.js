// REPRODUCTION du défaut « passion personnalisée » (2026-08-30).
//
// Ce fichier ne corrige rien : il ÉTABLIT le parcours et ses conséquences, pour
// que la décision (désactiver la publication, ou migrer) se prenne sur des faits.
//
// Chaîne, entièrement atteignable depuis l'interface :
//   ① `openCreateCustomPassion` → id `custom_<slug>_<rand>` dans
//      `state.user.customPassions` (LOCAL, jamais envoyé au serveur) ;
//   ② `allPassions()` la renvoie, donc la grille de `openCreateProfile` la montre
//      (elle a même une classe dédiée `passion-custom` : c'est prévu) ;
//   ③ créer une passion depuis cette tuile en fait un profil publiable ;
//   ④ `renderStudio` la met dans `#postPassion` ;
//   ⑤ `publishPost` l'envoie comme `passion_id`.
//
// En production, `posts.posts_passion_fk` référence `passions(id)`, et la table
// `passions` n'a qu'une policy SELECT (`passions_select_all`) : aucun client ne
// peut y insérer la ligne correspondante. L'insert est donc rejeté (23503).
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

test("le parcours est atteignable : une passion personnalisée devient publiable", async ({ page }) => {
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
  // ④ — le <select> du Studio la propose.
  expect(publiable).toContain("custom_tricot_ab12");
});

test("la publication part avec un passion_id que la base REFUSE", async ({ page }) => {
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
  // ⑤ — le client envoie bien l'id local, que le référentiel ne contient pas.
  expect(insertsPosts.length).toBeGreaterThan(0);
  expect(insertsPosts[0]).toBe("custom_tricot_ab12");
});

test("l'utilisateur voit un message de RÉSEAU pour une erreur permanente de données", async ({ page }) => {
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
  // Le défaut d'expérience : la cause est une contrainte de base, définitive, et
  // le message accuse la connexion. Réessayer ne servira jamais à rien.
  expect(vu).toContain("Post en local");
  // Et le post reste dans l'état LOCAL, invisible de tous, perdu au changement
  // d'appareil (il ne sera jamais rejoué : rien ne retente cet insert).
  const local = await page.evaluate(() => (state.userPosts || []).length);
  expect(local).toBeGreaterThan(0);
});

test("le profil PUBLIC est atteint aussi quand la passion custom est la principale", async ({ page }) => {
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
  // `profiles.profiles_passion_fk` référence la même table : la synchronisation
  // de l'identité PUBLIQUE échoue elle aussi. Portée plus large que la seule
  // publication — c'est le pseudo, l'avatar et la bio qui n'atteignent personne.
  expect(verdict.envoye[0]).toBe("custom_tricot_ab12");
  expect(verdict.ok).toBeFalsy();
});
