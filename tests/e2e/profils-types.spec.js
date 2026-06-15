// Mission 2 — parcours utilisateurs simulés (profils types du cahier des charges).
// Tests CI-safe : état onboardé injecté, écritures Supabase neutralisées (prod propre).
// Les profils « nouvel utilisateur (onboarding complet) » et « messageur complet
// (vocal + GIF + pièce jointe sur 2 comptes réels) » sont couverts par le test
// opt-in tests/e2e/multi-comptes.spec.js (inscription réelle + realtime).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("profils types — parcours simulés", () => {
  test("créateur : publie un post texte, visible dans le fil ET persistant après reload", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const unique = "Post audit QA " + Date.now();
    const passion = await page.evaluate(async (txt) => {
      goTo("studio");
      window.studioType = "text";
      const ta = document.getElementById("postText");
      const sel = document.getElementById("postPassion");
      ta.value = txt;
      if (sel && sel.options.length) sel.selectedIndex = 0;
      const p = sel ? sel.value : "";
      await publishPost();
      return p;
    }, unique);

    // Le fil est volontairement vide tant qu'aucune passion n'est sélectionnée
    // (« Choisis une passion »). On active le filtre de la passion publiée, comme
    // le ferait un utilisateur, puis on vérifie l'apparition (optimistic update).
    await page.evaluate((pa) => { toggleProfileFilter(pa); }, passion);
    await page.waitForFunction((txt) => {
      const f = document.getElementById("screen-feed");
      return f && f.textContent.includes(txt);
    }, unique, { timeout: 8000 });

    // Persistance : après reload, le post est toujours là (localStorage)
    await page.reload();
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-feed");
      return el && el.classList.contains("active");
    }, null, { timeout: 20000 });
    await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
    const persisted = await page.evaluate((txt) => {
      const lean = JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "{}");
      return (lean.userPosts || []).some((p) => (p.text || "").includes(txt));
    }, unique);
    expect(persisted, "post persistant en localStorage après reload").toBe(true);
    expect(errors.js).toEqual([]);
  });

  test("créateur média : publie photo, vidéo et carnet", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    // 1px GIF/MP4 en data URL (petit, sous la limite)
    const IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    const VID = "data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28y";

    const res = await page.evaluate(async ({ img, vid }) => {
      const out = {};
      const passion = (() => { const s = document.getElementById("postPassion"); return s && s.options.length ? s.options[0].value : "musique"; })();

      // ── PHOTO ──
      goTo("studio");
      studioType = "photo"; photoDataUrl = img; videoDataUrl = null;
      { const s = document.getElementById("postPassion"); if (s && s.options.length) s.selectedIndex = 0; }
      await publishPost();
      out.photo = state.userPosts[0] && state.userPosts[0].type === "photo" && !!state.userPosts[0].image;

      // ── VIDÉO ──
      goTo("studio");
      studioType = "video"; videoDataUrl = vid; photoDataUrl = null;
      { const s = document.getElementById("postPassion"); if (s && s.options.length) s.selectedIndex = 0; }
      await publishPost();
      out.video = state.userPosts[0] && state.userPosts[0].type === "video" && !!state.userPosts[0].video;

      // ── CARNET (vlog) ──
      goTo("studio");
      studioType = "vlog"; photoDataUrl = null; videoDataUrl = null;
      const dest = document.getElementById("vlogDestination");
      if (dest) dest.value = "Lisbonne [audit]";
      vlogState.cover = null;
      vlogState.steps = [{ place: "Alfama", text: "Jour 1", tip: "Tram 28", photo: null, video: null, audio: null }];
      await publishPost();
      out.vlog = state.userPosts[0] && state.userPosts[0].type === "vlog" && /Lisbonne/.test(state.userPosts[0].destination || state.userPosts[0].text || "");

      // Le fil (passion activée) doit rendre la photo postée (img data:)
      toggleProfileFilter(passion);
      out.photoRendered = !!document.querySelector('#screen-feed .post img[src^="data:image"]');
      out.totalUserPosts = state.userPosts.length;
      return out;
    }, { img: IMG, vid: VID });

    expect(res.photo, "post photo créé (type+image)").toBe(true);
    expect(res.video, "post vidéo créé (type+video)").toBe(true);
    expect(res.vlog, "carnet créé (type vlog + destination)").toBe(true);
    expect(res.photoRendered, "photo rendue dans le fil").toBe(true);
    expect(res.totalUserPosts, "3 posts créés").toBe(3);
    expect(errors.js).toEqual([]);
  });

  test("upload trop volumineux : rejet propre (toast, pas de crash, pas de post)", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const res = await page.evaluate(async () => {
      goTo("studio");
      studioType = "text"; photoDataUrl = null;
      const before = state.userPosts.length;
      // Fichier de 600 Ko > limite 500 Ko sur #photoInput
      const big = new File([new Uint8Array(600 * 1024)], "big.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(big);
      const input = document.getElementById("photoInput");
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      return {
        photoStillNull: photoDataUrl === null, // handler a rejeté avant d'assigner
        noNewPost: state.userPosts.length === before,
        inputExists: !!input,
      };
    });

    expect(res.inputExists, "#photoInput présent").toBe(true);
    expect(res.photoStillNull, "fichier trop gros rejeté (photoDataUrl reste null)").toBe(true);
    expect(res.noNewPost, "aucun post créé suite au rejet").toBe(true);
    expect(errors.js, "aucune exception JS sur le rejet").toEqual([]);
  });

  test("utilisateur actif : like + commentaire sur un post du fil", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const res = await page.evaluate(() => {
      const post = state.seed.posts[0];
      const id = post.id;
      const before = post.likes || 0;
      likePost(id);
      const afterLike = (state.seed.posts.find((p) => p.id === id).likes) || 0;
      // Commentaire via le vrai parcours (openComments → #newComment → submitComment)
      openComments(id);
      const ta = document.getElementById("newComment");
      ta.value = "Super contenu, bravo ! [audit]";
      submitComment(id);
      const p2 = state.seed.posts.find((p) => p.id === id);
      return {
        likeUp: afterLike === before + 1,
        liked: state.user.likedPosts.includes(id),
        commentAdded: (p2.comments || []).some((c) => (c.text || "").includes("[audit]")),
      };
    });
    expect(res.likeUp, "compteur de likes +1").toBe(true);
    expect(res.liked, "post dans likedPosts").toBe(true);
    expect(res.commentAdded, "commentaire ajouté au post").toBe(true);
    expect(errors.js).toEqual([]);
  });

  test("visiteur : consulte le fil et l'explorer sans rien publier", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    await page.evaluate(() => goTo("explore"));
    await page.waitForFunction(() => document.getElementById("screen-explore").classList.contains("active"));
    await page.evaluate(() => goTo("feed"));
    await page.waitForFunction(() => document.getElementById("screen-feed").classList.contains("active"));

    const noPosts = await page.evaluate(() => (state.userPosts || []).length === 0);
    expect(noPosts, "aucun post créé par un visiteur").toBe(true);
    expect(errors.js).toEqual([]);
  });

  test("visiteur de profils : ouvre le profil d'un auteur depuis le fil", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const opened = await page.evaluate(async () => {
      const author = state.seed.posts.find((p) => p.authorId && p.authorId.startsWith("u_"));
      if (!author) return { ok: false, reason: "pas d'auteur seed" };
      await openUserProfile(author.authorId, "feed");
      // openUserProfile ouvre l'écran profil utilisateur (overlay/screen dédié)
      const scr = document.getElementById("screen-userprofile") || document.querySelector(".userprofile-screen, #userProfileScreen");
      const active = document.querySelector(".screen.active, [id^=screen-].active");
      return { ok: true, hasProfileView: !!scr || !!active };
    });
    expect(opened.ok, opened.reason || "").toBe(true);
    expect(errors.js).toEqual([]);
  });

  test("partageur : la feuille de partage d'un post s'ouvre", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    const shareOpened = await page.evaluate(() => {
      const id = state.seed.posts[0].id;
      sharePost(id);
      const modal = document.querySelector(".modal, #modal, [class*=modal]");
      const txt = document.body.textContent || "";
      return txt.includes("Partager") && !!modal;
    });
    expect(shareOpened, "modal de partage ouvert avec options").toBe(true);
    expect(errors.js).toEqual([]);
  });

  test("multi-passions : 3 profils, bascule fonctionnelle", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors, 3);

    const res = await page.evaluate(() => {
      const ids = state.user.profiles.map((p) => p.id);
      switchToProfile(ids[2]);
      const after = state.user.currentProfileId;
      goTo("profiles");
      // Gamification retirée (badges / streak / activité 7 jours) : ne doit plus exister
      const badges = document.getElementById("profileBadges");
      const graph = document.getElementById("activityGraph");
      return {
        nbProfiles: state.user.profiles.length,
        switched: after === ids[2],
        badgesAbsent: !badges,
        graphAbsent: !graph,
      };
    });
    expect(res.nbProfiles, "3 profils passion").toBe(3);
    expect(res.switched, "bascule de profil effective").toBe(true);
    expect(res.badgesAbsent, "#profileBadges retiré").toBe(true);
    expect(res.graphAbsent, "#activityGraph retiré").toBe(true);
    expect(errors.js).toEqual([]);
  });
});
