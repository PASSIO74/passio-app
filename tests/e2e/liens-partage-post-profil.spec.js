// Liens partagés d'une publication (#post-<id>) et d'un profil (#user-<id>).
//
// Défaut mesuré le 2026-10-03 : deux boucles de partage sur quatre étaient
// rompues. « Partager en dehors » une publication envoyait l'URL de l'ACCUEIL,
// en dur ; « Partager le profil » fabriquait `#user-<id>` que personne ne lisait.
// Le destinataire — quelqu'un qui ne connaît pas encore PASSIO — tombait sur un
// fil quelconque. Un lien partagé est le seul chemin d'entrée de ces personnes.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① un lien de publication ouvert au démarrage montre CETTE publication, et
//      son hash est consommé (le retour arrière ferme la page, il ne rejoue pas) ;
//   ② un lien de profil ouvert au démarrage ouvre CE profil ;
//   ③ un identifiant inconnu le DIT et n'ouvre rien ;
//   ④ un lien collé en cours de session est routé lui aussi (hashchange) ;
//   ⑤ « Partager en dehors » diffuse un lien qui désigne la publication — et
//      ce lien, rejoué tel quel, la rouvre (aller-retour, pas deux moitiés) ;
//   ⑥ une publication absente de la page chargée est cherchée de façon CIBLÉE
//      (son auteur, puis ses publications) avant de conclure ;
//   ⑦ un compte bloqué n'est jamais ouvert par un lien.
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

// Publications et compte du contenu de démonstration : présents dès le boot.
const POST_SEED = "p1";       // auteur u_lea
const POST_SEED_2 = "p40";    // auteur u_lea
const COMPTE_SEED = "u_lea";  // « Léa Moreau »

function pagePublicationOuverte(page, id, timeout = 20000) {
  return page.waitForFunction((pid) => {
    const p = document.getElementById("postDetailPage");
    if (!p || p.style.display === "none" || !p.style.display) return false;
    const carte = document.querySelector("#postDetailContent .post[data-postid]");
    return !!carte && carte.getAttribute("data-postid") === pid;
  }, id, { timeout });
}

function publicationAffichee(page) {
  return page.evaluate(() => {
    const p = document.getElementById("postDetailPage");
    return !!(p && p.style.display && p.style.display !== "none");
  });
}

test.describe("Liens partagés #post-<id> et #user-<id>", () => {
  test("① au démarrage, le lien ouvre la publication qu'il désigne", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors, 1, { query: "#post-" + POST_SEED });
    await pagePublicationOuverte(page, POST_SEED);
    expect(await page.evaluate(() => location.hash)).not.toContain("post-");
    expect(errors.js, "aucune erreur JS pendant le routage").toEqual([]);
  });

  test("② au démarrage, le lien ouvre le profil qu'il désigne", async ({ page }) => {
    test.setTimeout(90000);
    const errors = { js: [], console: [], network: [] };
    // On observe l'APPEL réel du routeur (le nom nu se résout sur la propriété
    // globale), puis on laisse la vraie fonction faire son travail.
    await page.addInitScript(() => {
      window.__profilsOuverts = [];
      const poser = () => {
        const vraie = window.openUserProfile;
        if (typeof vraie !== "function" || vraie.__espion) return false;
        const espion = function (id, src) { window.__profilsOuverts.push([id, src]); return vraie.apply(this, arguments); };
        espion.__espion = true;
        window.openUserProfile = espion;
        return true;
      };
      const t = setInterval(() => { if (poser()) clearInterval(t); }, 20);
    });
    await bootOnboarded(page, errors, 1, { query: "#user-" + COMPTE_SEED });
    await page.waitForFunction(() => (window.__profilsOuverts || []).length > 0, null, { timeout: 20000 });
    const appels = await page.evaluate(() => window.__profilsOuverts);
    expect(appels[0][0]).toBe(COMPTE_SEED);
    // Le profil s'affiche réellement : la modale porte le nom du compte.
    // ⚠️ Délai large, et mesuré : `openUserProfile` relit TOUJOURS le profil en
    // base avant d'ouvrir, et au démarrage cette lecture attend l'initialisation
    // du SDK. Hors réseau (bac local) elle a mis 15,7 s ; en CI quelques ms.
    await page.waitForFunction(() => {
      const b = document.getElementById("modalBackdrop");
      return !!b && b.classList.contains("active") && /Léa Moreau/.test(b.textContent || "");
    }, null, { timeout: 45000 });
    expect(await page.evaluate(() => location.hash)).not.toContain("user-");
    expect(errors.js).toEqual([]);
  });

  test("③ un identifiant inconnu le dit et n'ouvre rien", async ({ page }) => {
    await bootOnboarded(page, null, 1, { query: "#post-inexistant_zz9" });
    await page.waitForFunction(() => /Publication introuvable/.test(document.body.textContent || ""),
      null, { timeout: 20000 });
    expect(await publicationAffichee(page)).toBe(false);
  });

  test("④ un lien collé en cours de session est routé", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    expect(await publicationAffichee(page)).toBe(false);
    await page.evaluate((id) => { location.hash = "#post-" + id; }, POST_SEED_2);
    await pagePublicationOuverte(page, POST_SEED_2);
  });

  test("⑤ « Partager en dehors » diffuse un lien qui rouvre la publication", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    const url = await page.evaluate(async (id) => {
      let diffuse = null;
      window.partagerOuCopier = (data) => { diffuse = data && data.url; };
      sharePost(id);
      await new Promise((r) => setTimeout(r, 50));
      const btn = document.getElementById("_shareOutBtn");
      if (btn) btn.click();
      return diffuse;
    }, POST_SEED);
    expect(url, "un lien a été diffusé").toBeTruthy();
    expect(url).toMatch(new RegExp("#post-" + POST_SEED + "$"));
    // L'aller-retour : on ouvre CE lien tel quel, dans une page neuve.
    const u = new URL(url);
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await bootOnboarded(page, null, 1, { query: u.search + u.hash });
    await pagePublicationOuverte(page, POST_SEED);
  });

  test("⑥ une publication hors de la page chargée est cherchée de façon ciblée", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    const ID = "post_ancien_lien";
    await page.evaluate((id) => {
      window.__lecturesCiblees = [];
      window._supaReal = true;
      const vraiFrom = supa.from.bind(supa);
      supa.from = function (table) {
        if (table !== "posts") return vraiFrom(table);
        const q = {
          select() { return q; },
          eq(col, val) { window.__lecturesCiblees.push([col, val]); return q; },
          maybeSingle: async () => ({ data: { author_id: "auteur_ancien" }, error: null }),
        };
        return q;
      };
      window.supaLoadPosts = async (offset, auteur) => (auteur === "auteur_ancien" ? [{
        id, authorId: "auteur_ancien", authorName: "Ancienne", passion: "musique", type: "text",
        text: "Publication ancienne", createdAt: 1000, likes: 0, comments: [], _source: "supabase",
      }] : []);
      location.hash = "#post-" + id;
    }, ID);
    await pagePublicationOuverte(page, ID, 25000);
    const lectures = await page.evaluate(() => window.__lecturesCiblees);
    expect(lectures).toEqual([["id", ID]]);
    // Fusion dans `supabasePosts`, jamais dans `seed.posts` (invariant maison).
    const ou = await page.evaluate((id) => ({
      supa: (state.supabasePosts || []).some((p) => p.id === id),
      seed: (state.seed.posts || []).some((p) => p.id === id),
    }), ID);
    expect(ou).toEqual({ supa: true, seed: false });
  });

  test("⑦ un compte bloqué n'est jamais ouvert par un lien", async ({ page }) => {
    const st = onboardedState(1);
    st.user.blocked = [COMPTE_SEED];
    await bootOnboarded(page, null, 1, { state: st, query: "#post-" + POST_SEED });
    await page.waitForFunction(() => /pas disponible/.test(document.body.textContent || ""),
      null, { timeout: 20000 });
    expect(await publicationAffichee(page)).toBe(false);
  });
});
