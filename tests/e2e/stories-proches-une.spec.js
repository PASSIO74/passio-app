// ═══════════════════════════════════════════════════════════════════════════
// STORIES « AMIS PROCHES » ET « À LA UNE » (lot E, 2026-11-26) — façon Instagram
// Serveur : migrations/migration_stories_proches_une_2026-11-26.sql (la RLS est
// éprouvée par tests/sql/migration-stories-proches-une.test.sh). Ici, le CLIENT :
//   ① drapeaux éteints : aucun bouton, aucune rangée, aucune requête vers les
//      tables neuves (la migration n'est peut-être pas appliquée) ;
//   ② la liste : l'INTENTION part (`insert {ami_id}`), `{ error }` est lu, un
//      refus annule l'affichage ; liste vide → la feuille s'ouvre avant publier ;
//   ③ publier « proches » : `audience: "proches"` dans l'INSERT, aucune mention
//      envoyée ; une story « tous » n'envoie PAS la colonne (serveur sans migration) ;
//   ④ lecteur : anneau vert et pastille sur une story « proches » seulement ;
//   ⑤ à la une : rangée du profil visité (titre hostile échappé), lecture du
//      groupe, retour au profil ; épingler depuis « ⋯ » ; table absente → message.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

const MOI = "a1b2c3d4-0000-4000-8000-00000000e001";
const LEA = "a1b2c3d4-0000-4000-8000-00000000e002";

// Serveur simulé : chaque requête est notée ; `window.__tables[t]` règle la réponse.
async function banc(page, { proches = true, une = true } = {}) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea, proches, une }) => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window._supaReal = true;
    STORY_PROCHES_ACTIF = proches; STORY_UNE_ACTIF = une;
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== lea);
    state.seed.users.push({ id: lea, name: "Léa Martin", profileEmoji: "🎸", avatar: "#ec4899" });
    window.__req = []; window.__tables = {}; window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push(m); try { t0(m, k); } catch (e) {} };
    supa = {
      from: (t) => {
        const st = { op: "select", f: [], row: null };
        const fin = () => {
          const cfg = window.__tables[t] || {};
          window.__req.push({ t, op: st.op, row: st.row, f: st.f });
          if (st.op === "insert") {
            if (cfg.insertError) return { data: null, error: cfg.insertError };
            const r = st.row || {};
            return { data: r.author_id ? [{ id: r.id, author_id: r.author_id, media_url: r.media_url == null ? null : r.media_url }] : null, error: null };
          }
          if (st.op === "delete") return { data: cfg.deleteError ? null : [{ ok: 1 }], error: cfg.deleteError || null };
          return { data: cfg.error ? null : (cfg.rows || []), error: cfg.error || null };
        };
        const b = {
          select() { return b; }, insert(r) { st.op = "insert"; st.row = r; return b; }, delete() { st.op = "delete"; return b; },
          eq(c, v) { st.f.push([c, v]); return b; }, in(c, v) { st.f.push([c, v]); return b; },
          order() { return b; }, limit() { return b; }, gte() { return b; }, abortSignal() { return b; }, maybeSingle() { return b; },
          then(ok, ko) { return Promise.resolve(fin()).then(ok, ko); },
        };
        return b;
      },
      rpc: async () => ({ data: null, error: null }),
    };
  }, { moi: MOI, lea: LEA, proches, une });
}
const requetes = (page, t) => page.evaluate((t) => window.__req.filter((r) => r.t === t), t);

test("① drapeaux éteints : ni bouton « Amis proches », ni rangée à la une, ni requête", async ({ page }) => {
  await banc(page, { proches: false, une: false });
  await page.evaluate(() => { meOpen("story"); meEnterEditPhase(); });
  await expect(page.locator("#mePublishBtn")).toBeVisible();
  await expect(page.locator("#mePublishProchesBtn")).toHaveCount(0);
  await page.evaluate(() => meClose());
  await page.evaluate(() => goTo("profiles"));
  await page.evaluate(() => renderMainProfile());
  await expect(page.locator("#mainStoriesUne")).toBeHidden();
  await page.waitForTimeout(200);
  expect(await requetes(page, "amis_proches")).toEqual([]);
  expect(await requetes(page, "stories_une")).toEqual([]);
});

test("② la liste : liste vide → la feuille s'ouvre ; ajout envoyé, refus annulé", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => meOpen("story"));
  await page.locator("#meBgBtn").click();
  await page.locator("#meTeChamp").fill("Entre nous");
  await page.locator("#meTeOk").click();
  await expect(page.locator("#mePublishProchesBtn")).toBeVisible();
  await page.evaluate(() => { meState._enteredEditAt = 0; });
  await page.locator("#mePublishProchesBtn").click();
  // Personne dans la liste : rien n'est publié, la feuille de la liste s'ouvre.
  await expect(page.locator("#amisProchesListe")).toBeVisible();
  expect((await requetes(page, "stories")).filter((r) => r.op === "insert")).toEqual([]);
  const ligne = page.locator(".amis-proches-ligne", { hasText: "Léa Martin" });
  await expect(ligne).toBeVisible();
  await ligne.locator(".amis-proches-bascule").click();
  await expect(ligne.locator(".amis-proches-bascule")).toHaveClass(/on/);
  const ins = (await requetes(page, "amis_proches")).filter((r) => r.op === "insert");
  expect(ins.map((r) => r.row)).toEqual([{ ami_id: LEA }]);
  // Refus serveur au retrait : l'affichage revient à « Ajouté ».
  await page.evaluate(() => { window.__tables.amis_proches = { deleteError: { code: "42501", message: "rls" } }; });
  await ligne.locator(".amis-proches-bascule").click();
  await expect(ligne.locator(".amis-proches-bascule")).toHaveClass(/on/);
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Liste non modifiée");
  // Un identifiant d'exemple (u_…) n'est jamais proposé.
  await page.evaluate(() => { state.seed.users.push({ id: "u_demo", name: "Démo Exemple" }); });
  await page.locator("#amisProchesRecherche").fill("démo");
  await expect(page.locator(".amis-proches-ligne")).toHaveCount(0);
});

test("③ publier « proches » : audience dans l'INSERT, mentions bornées à la liste ; « tous » n'envoie pas la colonne", async ({ page }) => {
  await banc(page);
  await page.evaluate(({ lea }) => {
    window.__tables.amis_proches = { rows: [{ ami_id: lea }] };
    window.__tables.profiles = { rows: { is_private: false } };
    window.__mentions = []; window._prevenirMentionsStory = (ov, quoi, seulement) => { window.__mentions.push(seulement); };
    supaEnsureProfileExists = async () => {};
    passioMediaProteges.capture = () => ({ uid: MY_UID });
    passioMediaProteges.courant = () => true;
    passioMediaProteges.envoyer = async () => null;
    passioMediaProteges.avecSession = async (fn) => fn({ signal: undefined });
    passioMediaProteges.appliquerEnvoi = () => {};
    meOpen("story");
    meAddOverlay({ type: "mention", uid: lea, nom: "Léa Martin", x: 50, y: 60 });
    meAddOverlay({ type: "text", text: "Pour vous", color: "#fff", size: 30, x: 50, y: 40 });
    meEnterEditPhase();
    meState._enteredEditAt = 0;
  }, { lea: LEA });
  // Une seule rangée : « Publier » et « Amis proches » reçoivent chacun leur toucher.
  for (const sel of ["#mePublishBtn", "#mePublishProchesBtn", "#meAmisProchesLien"]) {
    const atteint = await page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); });
    expect(atteint, sel + " reçoit le toucher").toBe(true);
  }
  await page.locator("#mePublishProchesBtn").click();
  await expect.poll(async () => (await requetes(page, "stories")).filter((r) => r.op === "insert").length).toBe(1);
  const [p1] = (await requetes(page, "stories")).filter((r) => r.op === "insert");
  expect(p1.row.audience).toBe("proches");
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("amis proches");
  // Mentions : prévenues avec la liste relue au serveur comme SEULE audience
  // (le filtrage lui-même est éprouvé dans story-stickers.spec.js ⑥).
  await expect.poll(() => page.evaluate(() => window.__mentions.length)).toBe(1);
  expect(await page.evaluate(() => window.__mentions[0]), "mentions bornées aux amis proches").toEqual([LEA]);
  // Story « tous » : la colonne ne part pas (un serveur sans migration l'accepte).
  await page.evaluate(() => { meOpen("story"); meAddOverlay({ type: "text", text: "Pour tous", color: "#fff", size: 30, x: 50, y: 40 }); meEnterEditPhase(); meState._enteredEditAt = 0; });
  await page.locator("#mePublishBtn").click();
  await expect.poll(async () => (await requetes(page, "stories")).filter((r) => r.op === "insert").length).toBe(2);
  const p2 = (await requetes(page, "stories")).filter((r) => r.op === "insert")[1];
  expect("audience" in p2.row).toBe(false);
  // Colonne absente côté serveur : la story « proches » est REFUSÉE, jamais publiée pour tous.
  await page.evaluate(() => { window.__tables.stories = { insertError: { code: "PGRST204", message: "audience" } }; meOpen("story"); meAddOverlay({ type: "text", text: "x", color: "#fff", size: 30, x: 50, y: 40 }); meEnterEditPhase(); meState._enteredEditAt = 0; });
  await page.locator("#mePublishProchesBtn").click();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("non publiée");
  const p3 = (await requetes(page, "stories")).filter((r) => r.op === "insert")[2];
  expect(p3.row.audience).toBe("proches");
});

test("④ lecteur : anneau vert et pastille sur une story « proches » seulement", async ({ page }) => {
  await banc(page);
  await page.evaluate(({ lea }) => {
    state.user.seenStories = [];
    state.seed.stories = [
      { id: "s_pr", authorId: lea, authorName: "Léa Martin", text: "proches", audience: "proches", createdAt: Date.now() - 1000, fromSupabase: true },
      { id: "s_tous", authorId: "a1b2c3d4-0000-4000-8000-00000000e003", authorName: "Tom", text: "tous", audience: "tous", createdAt: Date.now() - 2000, fromSupabase: true },
    ];
    goTo("feed"); renderStories();
  }, { lea: LEA });
  const anneaux = await page.evaluate(() => Array.from(document.querySelectorAll("#storiesRowFeed .story-item .story-ring")).map((r) => r.className));
  expect(anneaux.filter((c) => /proches/.test(c)).length).toBe(1);
  const vert = await page.evaluate(() => getComputedStyle(document.querySelector("#storiesRowFeed .story-ring.proches")).backgroundImage);
  expect(vert).toContain("34, 197, 94");
  await page.evaluate(({ lea }) => openStoryGroup(lea), { lea: LEA });
  await expect(page.locator("#storyProchesPastille")).toHaveText("⭐ Amis proches");
  await page.evaluate(() => { closeStoryViewer(); openStoryGroup("a1b2c3d4-0000-4000-8000-00000000e003"); });
  await expect(page.locator("#storyViewer")).toHaveClass(/active/);
  await expect(page.locator("#storyProchesPastille")).toHaveCount(0);
});

test("⑤ à la une : rangée du profil visité, lecture, retour ; épingler ; table absente", async ({ page }) => {
  await banc(page);
  await page.evaluate(({ lea }) => {
    window.__tables.stories_une = { rows: [
      { story_id: "su1", groupe: "Voyages", created_at: "2026-11-20T10:00:00+00:00" },
      { story_id: "su2", groupe: "<img src=x onerror=1>", created_at: "2026-11-21T10:00:00+00:00" },
    ] };
    window.__tables.stories = { rows: [
      { id: "su1", author_id: lea, content: "Lisbonne", created_at: "2026-11-20T09:00:00", overlays: null, audience: "tous" },
      { id: "su2", author_id: lea, content: "Concert", created_at: "2026-11-21T09:00:00", overlays: null, audience: "tous" },
    ] };
  }, { lea: LEA });
  await page.evaluate(({ lea }) => openUserProfile(lea), { lea: LEA });
  const rangee = page.locator("#visitedStoriesUne");
  await expect(rangee).toBeVisible();
  await expect(rangee.locator(".une-bulle")).toHaveCount(2);
  await expect(rangee.locator(".une-titre").nth(1)).toHaveText("<img src=x onerror=1>");
  expect(await page.locator("#visitedStoriesUne img").count(), "le titre hostile ne devient pas une image").toBe(0);
  const lu = (await requetes(page, "stories_une"))[0];
  expect(lu.f).toEqual([["owner_id", LEA]]);
  await rangee.locator(".une-bulle", { hasText: "Voyages" }).click();
  await expect(page.locator("#storyViewer")).toHaveClass(/active/);
  await expect(page.locator("#storyContent")).toContainText("Lisbonne");
  await page.evaluate(() => closeStoryViewer());
  await expect(page.locator("#visitedStoriesUne")).toBeVisible();

  // Épingler MA story depuis « ⋯ ».
  await page.evaluate(({ moi }) => {
    closeModal();
    window.__tables.stories_une = { rows: [] };
    state.seed.stories = [{ id: "s_moi", authorId: moi, authorName: "Moi", text: "Ma story", createdAt: Date.now() - 1000, fromSupabase: true }];
    storyGroups = [{ authorId: moi, stories: state.seed.stories.slice() }];
    openStoryViewerAt(0, 0);
  }, { moi: MOI });
  await page.locator("#storyOptionsBtn").click();
  await page.locator("#feuilleConfirmation button", { hasText: "Mettre à la une" }).click();
  await page.locator("#uneNouveauTitre").fill("  É\u202Eté\u200B  ");
  await page.locator("#uneCreerBtn").click();
  await expect.poll(async () => (await requetes(page, "stories_une")).filter((r) => r.op === "insert").map((r) => r.row)).toEqual([{ story_id: "s_moi", groupe: "Été" }]);
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Ajoutée");

  // Table absente (migration pas encore appliquée) : un message clair.
  await page.evaluate(() => { window.__tables.stories_une = { insertError: { code: "PGRST205", message: "absente" } }; choisirGroupeUne("s_moi"); });
  await page.locator("#uneNouveauTitre").fill("Autre");
  await page.locator("#uneCreerBtn").click();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("bientôt");
});
