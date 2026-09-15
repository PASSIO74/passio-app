// PRO-04 / PRO-05 — la vitrine publique suit le compte, et le Studio ne
// publie pas dans une passion archivée.
//
// LE DÉFAUT (contre-revue Astra, chantier 8), mesuré en base le 2026-09-14 :
//   PRO-04 — la vitrine (`profiles.passions`) n'était publiée qu'aux gestes :
//            un geste dont la publication a échoué la laissait en retard pour
//            toujours (mesuré : 25 passions dans l'état, 16 dans la vitrine).
//            `profiles.passion_id`, lui, porte DÉLIBÉRÉMENT la première vivante
//            canonique (ADR-010, rétro-compat) et ne suit pas la bascule — la
//            contre-revue avait lu l'inverse dans une doc, corrigée ;
//   PRO-05 — après `archiverPassion('sport')`, `#postPassion` proposait encore
//            `sport` et la publication partait dans un profil archivé.
// Ce que cette suite exige : ① `passion_id` = première vivante canonique,
// indépendante de la bascule (ADR-010, inchangé) ; ② archivée → écartée ;
// ③ la vitrine se réconcilie au démarrage quand
// elle diffère de la dernière publiée, et une seule fois (RÉINJECTION) ; ④ un
// archivage repeint le sélecteur du Studio à l'écran (RÉINJECTION) ; ⑤ une
// passion archivée lue dans un sélecteur périmé est REFUSÉE au point d'écriture,
// sans publication locale (RÉINJECTION).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.supaEnsureProfileExists = async () => true;
    window.supaMiroirUserPassions = async () => true;
    window.supaSaveUserState = async () => true;
    window.__maj = [];
    Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: (table) => {
      const b = { eq: () => b, select: () => Promise.resolve({ data: [{ id: "x" }], error: null }), then: (a, c) => Promise.resolve({ data: [{ id: "x" }], error: null }).then(a, c) };
      return { update: (corps) => { window.__maj.push({ table, corps }); return b; }, upsert: () => b, insert: () => b, select: () => b };
    } });
    state.user.profiles = [
      { id: "p_musique", passion: "musique", emoji: "🎵", color: "#111", createdAt: 1 },
      { id: "p_sport", passion: "sport", emoji: "⚽", color: "#222", createdAt: 2 },
      { id: "p_photo", passion: "photo", emoji: "📷", color: "#333", createdAt: 3 },
    ];
    state.user.currentProfileId = "p_sport";
    localStorage.removeItem("passio_vitrine_publiee_v1");
    saveState();
  });
}

test.describe("PRO-04 — la vitrine dit la passion active", () => {
  test("① passion_id = la première vivante canonique, indépendante de la bascule (ADR-010)", async ({ page }) => {
    await banc(page);
    expect(await page.evaluate(() => _chargeProfilComplete().passion_id)).toBe("musique");
    expect(await page.evaluate(() => (switchToProfile("p_photo"), _chargeProfilComplete().passion_id))).toBe("musique");
  });

  test("② la première archivée est écartée : la première VIVANTE est publiée", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => { state.user.profiles[0].archived = true; return _chargeProfilComplete().passion_id; });
    expect(r).toBe("sport");
  });

  test("③ la vitrine se réconcilie au démarrage quand elle diffère, une seule fois", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._etatCompteCharge = true;
      // RÉINJECTION : `_reconcilierVitrinePassions` n'existe pas sur le code d'avant.
      _reconcilierVitrinePassions(0);
      await new Promise((res) => setTimeout(res, 300));
      const n1 = window.__maj.filter((m) => m.table === "profiles").length;
      const corps = window.__maj.find((m) => m.table === "profiles").corps;
      _reconcilierVitrinePassions(0);
      await new Promise((res) => setTimeout(res, 300));
      const n2 = window.__maj.filter((m) => m.table === "profiles").length;
      // Un geste change l'empreinte → la prochaine réconciliation republie.
      state.user.profiles[2].archived = true; saveState();
      _reconcilierVitrinePassions(0);
      await new Promise((res) => setTimeout(res, 300));
      const n3 = window.__maj.filter((m) => m.table === "profiles").length;
      return { n1, n2, n3, passion_id: corps.passion_id, ids: (corps.passions || []).map((p) => p.id + (p.archived ? "(A)" : "")) };
    });
    expect(r.n1).toBe(1);
    expect(r.n2).toBe(1);
    expect(r.n3).toBe(2);
    expect(r.passion_id).toBe("musique");
    expect(r.ids).toEqual(["musique", "sport", "photo"]);
  });

  // ③ ter — la COURSE (contre-revue Astra, 2026-09-15) : A est envoyé, l'état
  // devient B pendant l'aller-retour, et l'empreinte mémorisée au succès était
  // celle de B — jamais envoyé, jamais republié. L'empreinte mémorisée doit être
  // celle de ce qui est PARTI ; la réconciliation suivante republie B.
  test("③ ter l'état qui change pendant la publication est republié au tour suivant", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._etatCompteCharge = true;
      // Un `update` LENT : l'état change entre l'envoi et la réponse.
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: (table) => {
        const lent = { eq: () => lent, select: () => new Promise((res) => setTimeout(() => res({ data: [{ id: "x" }], error: null }), 150)) };
        return { update: (corps) => { window.__maj.push({ table, corps }); return lent; }, upsert: () => lent, insert: () => lent, select: () => lent };
      } });
      const p1 = supaSavePassionState();                       // envoie A (3 passions)
      await new Promise((res) => setTimeout(res, 30));
      state.user.profiles[2].archived = true; saveState();     // l'état devient B pendant l'aller-retour
      await p1;
      const memorisee = localStorage.getItem("passio_vitrine_publiee_v1");
      const envoyeA = (window.__maj[0].corps.passions || []).map((p) => p.id + (p.archived ? "(A)" : "")).join(",");
      // La réconciliation suivante doit voir l'écart et republier B.
      _reconcilierVitrinePassions(0);
      await new Promise((res) => setTimeout(res, 400));
      const n = window.__maj.filter((m) => m.table === "profiles").length;
      const dernier = (window.__maj[window.__maj.length - 1].corps.passions || []).map((p) => p.id + (p.archived ? "(A)" : "")).join(",");
      return { memorisee, envoyeA, n, dernier, empreinteB: _empreinteVitrine() };
    });
    // RÉINJECTION : sur le code d'avant, `memorisee` porte l'empreinte de B et n = 1 (B jamais republié).
    expect(r.envoyeA).toBe("musique,sport,photo");
    expect(r.memorisee, "l'empreinte mémorisée est celle de A, ce qui est parti").not.toBe(UID_MOI + ":" + r.empreinteB);
    expect(r.n).toBe(2);
    expect(r.dernier).toBe("musique,sport,photo(A)");
  });

  test("③ bis sans compte réel, rien ne part", async ({ page }) => {
    await banc(page);
    const n = await page.evaluate(async () => {
      window._etatCompteCharge = true; MY_UID = "u_visiteur"; window.MY_UID = "u_visiteur";
      _reconcilierVitrinePassions(0);
      await new Promise((res) => setTimeout(res, 300));
      return window.__maj.length;
    });
    expect(n).toBe(0);
  });
});

test.describe("PRO-05 — le Studio ne publie pas dans une passion archivée", () => {
  test("④ archiver depuis ailleurs repeint le sélecteur du Studio à l'écran", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      goTo("studio"); renderStudio();
      const avant = [...document.querySelectorAll("#postPassion option")].map((o) => o.value);
      // `silencieux` : le chemin de l'échange et des appels programmatiques — sans repeint dédié avant.
      archiverPassion("p_photo", true);
      const apres = [...document.querySelectorAll("#postPassion option")].map((o) => o.value);
      return { avant, apres };
    });
    expect(r.avant).toContain("photo");
    // RÉINJECTION : sur le code d'avant, « photo » reste proposée.
    expect(r.apres).not.toContain("photo");
    expect(r.apres).toContain("sport");
  });

  test("⑤ un sélecteur périmé qui porte une passion archivée : refus au point d'écriture, aucune publication locale", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      goTo("studio"); renderStudio();
      state.user.profiles[2].archived = true; saveState(); // photo archivée SANS repeint : le select est périmé
      const sel = document.getElementById("postPassion");
      sel.innerHTML = '<option value="photo" selected>📷 Photo</option>';
      studioType = "text";
      document.getElementById("postText").value = "publication test archivée";
      const nAvant = (state.userPosts || []).length;
      await publishPost();
      return { nApres: (state.userPosts || []).length - nAvant, toasts: window.__toasts.slice(), options: [...sel.options].map((o) => o.value) };
    });
    // RÉINJECTION : sur le code d'avant, un post local est créé avec le profil archivé.
    expect(r.nApres).toBe(0);
    expect(r.toasts.some((t) => /archivée/.test(t))).toBe(true);
    expect(r.options).not.toContain("photo");
  });
});
