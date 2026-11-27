// ═══════════════════════════════════════════════════════════════════════════
// 📊 SONDAGE EN BOBINE (2026-11-27)
// Le sticker Sondage des stories, ouvert aux bobines. La table des votes
// (`bobine_sondage_votes`, migration_bobine_sondage_2026-11-27.sql) est appliquée
// en production depuis le 2026-11-27 (journal n°96) : le drapeau est ALLUMÉ, et ne
// sait qu'enlever. Verrous :
//   ① création : le sticker est proposé en bobine (un seul par bobine, il voyage
//      dans les overlays de la publication) ; chacune des trois coupures le retire,
//      sans toucher au sticker des stories ;
//   ② lecteur : le sondage d'une bobine s'affiche (question, deux réponses),
//      échappé ; les réponses reçoivent le toucher sur 44 px, sans lancer ni
//      la lecture ni un « j'aime » ;
//   ③ vote : l'INTENTION part une fois (`post_id`, `choix` — rien d'autre),
//      les résultats viennent de la base ; « déjà voté » montre les résultats ;
//      un refus et une table absente se DISENT et laissent revoter ; ma bobine
//      montre les résultats sans voter ; une bobine d'exemple reste locale ;
//   ④ les résultats ne sont demandés que pour la bobine REGARDÉE ;
//   ⑤ un sondage ne se fait pas VOILE : sa taille est bornée (1,6) au rendu comme
//      à l'éditeur — agrandi à toute la scène, un toucher de pause devenait un vote.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000d100";
const LEA = "a1b2c3d4-0000-4000-8000-00000000d101";
const SAM = "a1b2c3d4-0000-4000-8000-00000000d102";
const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

// Un lecteur de bobines sans exemple parasite : Léa (compte réel, sondage), Sam
// (compte réel, sondage), moi (sondage), un personnage d'exemple (sondage), et une
// bobine de Léa sans sondage. Le client Supabase est un faux : il note ce qui part
// et répond ce que le test décide.
async function banc(page) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea, sam, image }) => {
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window.requireAuthentication = () => true;
    window._supaReal = true;
    window.supaSaveUserState = async () => {};
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
    // ── faux client : seules la table et la fonction du sondage sont interceptées
    window.__votes = []; window.__lectures = []; window.__base = {};
    window.__reponseVote = () => ({ data: null, error: null });
    const vrai = supa;
    const resultats = (id) => {
      const v = window.__base[id];
      if (!v) return id === "reel_moi" ? { a_vote: true, mon_choix: null, a: 3, b: 1 } : { a_vote: false };
      return v;
    };
    const faux = {
      from: (table) => table === "bobine_sondage_votes"
        ? { insert: (ligne) => { window.__votes.push(ligne); const r = window.__reponseVote(ligne); if (!r.error) window.__base[ligne.post_id] = { a_vote: true, mon_choix: ligne.choix, a: ligne.choix === 0 ? 4 : 3, b: ligne.choix === 1 ? 2 : 1 }; return Promise.resolve(r); } }
        : vrai.from(table),
      rpc: (nom, args) => nom === "bobine_sondage_resultats"
        ? (window.__lectures.push(args._post_id), Promise.resolve({ data: resultats(args._post_id), error: null }))
        : vrai.rpc(nom, args),
    };
    supa = new Proxy(vrai, { get(cible, cle) {
      if (cle === "from") return faux.from;
      if (cle === "rpc") return faux.rpc;
      const v = cible[cle]; return typeof v === "function" ? v.bind(cible) : v;
    } });
    state.user.following = []; state.user.followingPending = []; state.user.sondagesLocaux = {};
    state.seed.users = (state.seed.users || []).filter((u) => ![lea, sam, "u_exemple"].includes(u.id));
    state.seed.users.push({ id: lea, name: "Léa Martin", profileEmoji: "🎸", avatar: "#8b5cf6", distant: true });
    state.seed.users.push({ id: sam, name: "Sam", profileEmoji: "🍳", avatar: "#0ea5e9", distant: true });
    state.seed.users.push({ id: "u_exemple", name: "Exemple Démo", profileEmoji: "✨", avatar: "#ec4899" });
    const sondage = (q) => [{ type: "sondage", q, a: "Mer", b: "Montagne", x: 50, y: 40 }];
    const bobine = (id, auteur, nom, il_y_a, overlays) => ({ id, authorId: auteur, userId: auteur, authorName: nom, isReel: true, type: "photo", image, passion: "cuisine", mood: "all", text: "Bobine " + id, overlays, fromSupabase: auteur !== "u_exemple", createdAt: Date.now() - il_y_a, likes: 0, comments: [] });
    state.seed.posts = [bobine("reel_exemple", "u_exemple", "Exemple Démo", 9000, sondage("Exemple ?"))];
    state.supabasePosts = [
      bobine("reel_lea", lea, "Léa Martin", 1000, sondage("Plutôt mer ou montagne ?")),
      bobine("reel_sam", sam, "Sam", 2000, sondage('<img src=x onerror="window.__xss=1"> Sucré ?')),
      bobine("reel_sans", lea, "Léa Martin", 3000, null),
    ];
    state.userPosts = [bobine("reel_moi", moi, "Moi", 4000, sondage("Mon sondage"))];
    window._feedExtraPosts = [];
    openReels();
  }, { moi: MOI, lea: LEA, sam: SAM, image: IMAGE });
  await expect(page.locator("#reelsViewer")).toHaveClass(/open/);
}
const carte = (page, id) => page.locator(`#reelsList .reel-item[data-post-id="${id}"] .st-sondage`);
const option = (page, id, c) => page.locator(`#reelsList .reel-item[data-post-id="${id}"] .st-sd-opt[data-choix="${c}"]`);
// Amène une bobine à l'écran et attend qu'elle soit la bobine ACTIVE.
async function regarder(page, id) {
  await page.evaluate((pid) => {
    const it = document.querySelector(`#reelsList .reel-item[data-post-id="${pid}"]`);
    it.scrollIntoView({ block: "start" });
  }, id);
  await expect.poll(() => page.evaluate((pid) => {
    const it = document.querySelector(`#reelsList .reel-item[data-post-id="${pid}"]`);
    return Number(it.getAttribute("data-reel-idx")) === reelsState.current;
  }, id)).toBe(true);
}

test("① création : sticker Sondage proposé en bobine (un seul, il voyage dans les overlays) ; chaque coupure le retire", async ({ page }) => {
  await bootOnboarded(page);
  const ouvrirEditeur = () => page.evaluate(() => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    meOpen("bobine");
    meEnterEditPhase();
  });
  // Les trois COUPURES retirent le sticker de la création (et seulement de la bobine).
  const proposeAvec = async (couper) => {
    await page.evaluate(couper);
    await ouvrirEditeur();
    await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
    await expect(page.locator('#meStickerPanel [data-sticker="Question"]')).toBeVisible();
    const n = await page.locator('#meStickerPanel [data-sticker="Sondage"]').count();
    await page.evaluate(() => { meClose(); localStorage.removeItem("passio_bobine_sondage"); delete window.PASSIO_BOBINE_SONDAGE; BOBINE_SONDAGE_ACTIF = true; });
    return n;
  };
  expect(await proposeAvec(() => { localStorage.setItem("passio_bobine_sondage", "0"); }), "coupure par appareil (localStorage)").toBe(0);
  expect(await proposeAvec(() => { window.PASSIO_BOBINE_SONDAGE = false; }), "coupure par appareil (window)").toBe(0);
  expect(await proposeAvec(() => { BOBINE_SONDAGE_ACTIF = false; }), "coupure pour tous (constante)").toBe(0);

  // Allumé (l'état livré : la table des votes existe en production) : le sticker est proposé.
  expect(await page.evaluate(() => ({ constante: BOBINE_SONDAGE_ACTIF, actif: bobineSondageActif() }))).toEqual({ constante: true, actif: true });
  await ouvrirEditeur();
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Sondage"]').click();
  await page.locator("#meSdQ").fill("Plutôt mer ou montagne ?");
  await page.locator("#meSdA").fill("Mer");
  await page.locator("#meSdB").fill("Montagne");
  await page.locator("#meSdOk").click();
  await expect(page.locator("#meOverlays .me-overlay")).toHaveCount(1);
  // Un seul sondage par bobine (un vote par compte et par bobine en base).
  await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); }; });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Sondage"]').click();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Un seul sondage par bobine");
  // Il voyage dans les overlays de la publication, borné.
  const donnees = await page.evaluate(() => _meOverlaysData().filter((o) => o.type === "sondage"));
  expect(donnees).toHaveLength(1);
  expect({ q: donnees[0].q, a: donnees[0].a, b: donnees[0].b }).toEqual({ q: "Plutôt mer ou montagne ?", a: "Mer", b: "Montagne" });
  // En story, rien ne change — même bobine coupée, le sticker des stories reste.
  await page.evaluate(() => { meClose(); localStorage.setItem("passio_bobine_sondage", "0"); meOpen("story"); meEnterEditPhase(); });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Sondage"]')).toBeVisible();
});

test("② lecteur : le sondage d'une bobine s'affiche, échappé ; ses réponses reçoivent le toucher sans lancer la lecture ni un j'aime", async ({ page }) => {
  await banc(page);
  await expect(carte(page, "reel_lea")).toHaveCount(1);
  await expect(carte(page, "reel_lea").locator("b")).toHaveText("Plutôt mer ou montagne ?");
  await expect(option(page, "reel_lea", 0).locator(".st-sd-lib")).toHaveText("Mer");
  await expect(option(page, "reel_lea", 1).locator(".st-sd-lib")).toHaveText("Montagne");
  await expect(carte(page, "reel_sans"), "pas de carte sans sondage").toHaveCount(0);
  // La question d'un autre compte est du TEXTE : aucune balise n'en sort.
  await expect(carte(page, "reel_sam").locator("b")).toHaveText('<img src=x onerror="window.__xss=1"> Sucré ?');
  expect(await page.evaluate(() => ({ xss: window.__xss || null, img: document.querySelectorAll("#reelsList .st-sondage img").length }))).toEqual({ xss: null, img: 0 });
  // Avant de voter : ni pourcentage, ni total (on ne voit pas la tendance).
  await regarder(page, "reel_lea");
  expect(await carte(page, "reel_lea").evaluate((c) => ({ vote: c.classList.contains("st-sd-vote"), pct: [...c.querySelectorAll(".st-sd-pct")].map((e) => e.textContent).join("") }))).toEqual({ vote: false, pct: "" });
  // Les deux réponses reçoivent le toucher, sur 44 px au moins — à 390 comme à 320 px.
  for (const largeur of [390, 320]) {
    await page.setViewportSize({ width: largeur, height: 700 });
    await regarder(page, "reel_lea");
    for (const c of [0, 1]) {
      const m = await option(page, "reel_lea", c).evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { atteint: !!t && (t === el || el.contains(t)), h: Math.round(r.height), dans: r.left >= 0 && r.right <= document.documentElement.clientWidth }; });
      expect(m, `réponse ${c} à ${largeur} px`).toEqual({ atteint: true, h: expect.any(Number), dans: true });
      expect(m.h).toBeGreaterThanOrEqual(44);
    }
  }
  // Voter n'est ni un toucher de lecture, ni un double toucher « j'aime », ni l'ouverture du profil.
  const avant = await page.evaluate(() => ({ aime: (state.user.likedPosts || []).includes("reel_lea") }));
  await option(page, "reel_lea", 0).tap();
  await option(page, "reel_lea", 0).tap();
  await expect(carte(page, "reel_lea")).toHaveClass(/st-sd-vote/);
  expect(await page.evaluate(() => ({ aime: (state.user.likedPosts || []).includes("reel_lea"), lecteur: document.getElementById("reelsViewer").classList.contains("open"), modale: !!document.querySelector("#modalBackdrop.active") }))).toEqual({ aime: avant.aime, lecteur: true, modale: false });
});

test("③ vote : l'intention part une fois, les résultats viennent de la base ; refus et table absente se disent ; ma bobine et l'exemple", async ({ page }) => {
  await banc(page);
  // ── Vote enregistré : deux colonnes, une écriture, puis les résultats de la base.
  await regarder(page, "reel_lea");
  await option(page, "reel_lea", 1).tap();
  await expect(carte(page, "reel_lea")).toHaveClass(/st-sd-vote/);
  expect(await page.evaluate(() => window.__votes)).toEqual([{ post_id: "reel_lea", choix: 1 }]);
  // 3 + 2 = 5 votes : 60 % / 40 %, et MON choix est marqué.
  await expect(option(page, "reel_lea", 0).locator(".st-sd-pct")).toHaveText("60 %");
  await expect(option(page, "reel_lea", 1).locator(".st-sd-pct")).toHaveText("40 %");
  await expect(option(page, "reel_lea", 1)).toHaveAttribute("aria-pressed", "true");
  await expect(option(page, "reel_lea", 0)).toHaveAttribute("aria-pressed", "false");
  await expect(carte(page, "reel_lea").locator(".st-sd-total")).toHaveText("5 votes");
  // Un second toucher ne renvoie rien : un vote ne se change pas.
  await option(page, "reel_lea", 0).tap();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__votes.length)).toBe(1);

  // ── Table ABSENTE (migration pas encore appliquée) : on le dit, rien n'est marqué voté.
  await regarder(page, "reel_sam");
  await page.evaluate(() => { window.__toasts.length = 0; window.__reponseVote = () => ({ data: null, error: { code: "PGRST205", message: "table absente" } }); });
  await option(page, "reel_sam", 0).tap();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Les sondages arrivent bientôt");
  await expect(carte(page, "reel_sam")).not.toHaveClass(/st-sd-vote/);
  // ── REFUS de la base (42501 : bobine que je ne vois plus, débit…) : dit, et on peut réessayer.
  await page.evaluate(() => { window.__toasts.length = 0; window.__reponseVote = () => ({ data: null, error: { code: "42501", message: "refus" } }); });
  await option(page, "reel_sam", 0).tap();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("Vote non enregistré — réessaie");
  await expect(carte(page, "reel_sam")).not.toHaveClass(/st-sd-vote/);
  // ── DÉJÀ VOTÉ ailleurs (23505) : l'état voulu existe — les résultats s'affichent, sans erreur.
  await page.evaluate(() => { window.__toasts.length = 0; window.__base.reel_sam = { a_vote: true, mon_choix: 0, a: 1, b: 0 }; window.__reponseVote = () => ({ data: null, error: { code: "23505", message: "doublon" } }); });
  await option(page, "reel_sam", 1).tap();
  await expect(carte(page, "reel_sam")).toHaveClass(/st-sd-vote/);
  await expect(option(page, "reel_sam", 0)).toHaveAttribute("aria-pressed", "true");
  await expect(option(page, "reel_sam", 0).locator(".st-sd-pct")).toHaveText("100 %");
  expect(await page.evaluate(() => window.__toasts.filter((t) => /non enregistré|bientôt/.test(t)).length)).toBe(0);

  // ── MA bobine : les résultats s'affichent d'eux-mêmes ; je ne vote pas.
  const envoyes = await page.evaluate(() => window.__votes.length);
  await regarder(page, "reel_moi");
  await expect(carte(page, "reel_moi")).toHaveClass(/st-sd-vote/);
  await expect(option(page, "reel_moi", 0).locator(".st-sd-pct")).toHaveText("75 %");
  await expect(carte(page, "reel_moi").locator(".st-sd-total")).toHaveText("4 votes");
  expect(await page.evaluate(() => [...document.querySelectorAll('#reelsList .reel-item[data-post-id="reel_moi"] .st-sd-opt')].map((b) => b.getAttribute("aria-pressed")))).toEqual(["false", "false"]);
  await page.evaluate(() => { window.__toasts.length = 0; window.__reponseVote = () => ({ data: null, error: null }); });
  await page.evaluate(() => document.querySelector('#reelsList .reel-item[data-post-id="reel_moi"] .st-sd-opt[data-choix="1"]').click());
  expect(await page.evaluate(() => window.__votes.length), "aucun vote ne part sur ma propre bobine").toBe(envoyes);

  // ── Bobine d'EXEMPLE : le vote reste sur cet appareil, rien ne part, rien n'est lu en base.
  const lues = await page.evaluate(() => window.__lectures.filter((x) => x === "reel_exemple").length);
  await regarder(page, "reel_exemple");
  await option(page, "reel_exemple", 1).tap();
  await expect(carte(page, "reel_exemple")).toHaveClass(/st-sd-vote/);
  await expect(option(page, "reel_exemple", 1)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => ({ votes: window.__votes.length, lectures: window.__lectures.filter((x) => x === "reel_exemple").length, local: state.user.sondagesLocaux.reel_exemple }))).toEqual({ votes: envoyes, lectures: lues, local: 1 });
});

test("④ les résultats ne sont demandés que pour la bobine regardée — et rien hors d'un lecteur ouvert", async ({ page }) => {
  await banc(page);
  // À l'ouverture : la première bobine (celle de Léa, la plus récente) et elle seule.
  await expect.poll(() => page.evaluate(() => window.__lectures.slice())).toEqual(["reel_lea"]);
  await regarder(page, "reel_sam");
  await expect.poll(() => page.evaluate(() => window.__lectures.includes("reel_sam"))).toBe(true);
  // La bobine sans sondage ne demande rien ; celle que je n'ai pas regardée non plus.
  await regarder(page, "reel_sans");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({ sans: window.__lectures.includes("reel_sans"), moi: window.__lectures.includes("reel_moi") }))).toEqual({ sans: false, moi: false });
  // Lecteur FERMÉ : un toucher sur une carte restée dans le DOM ne vote pas.
  const avant = await page.evaluate(() => window.__votes.length);
  await page.evaluate(() => { const b = document.querySelector('#reelsList .reel-item[data-post-id="reel_lea"] .st-sd-opt'); reelsState.open = false; if (b) b.click(); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__votes.length)).toBe(avant);
});

test("⑤ un sondage ne se fait pas voile : taille bornée au rendu (valeur forgée) et à l'éditeur (pincement)", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const echelle = (html) => { const d = document.createElement("div"); d.innerHTML = html; const el = d.firstElementChild; const m = /scale\(([\d.]+)\)/.exec(el.getAttribute("style")); return m ? Number(m[1]) : null; };
    const forge = [{ type: "sondage", q: "?", a: "Oui", b: "Non", x: 50, y: 50, scale: 40 }];
    const texte = [{ type: "text", text: "x", x: 50, y: 50, scale: 40 }];
    return {
      sondageBobine: echelle(_storyOverlaysHtml(forge, { bobine: true })),
      sondageStory: echelle(_storyOverlaysHtml(forge, { story: true })),
      texte: echelle(_storyOverlaysHtml(texte, { story: true })),
      petit: echelle(_storyOverlaysHtml([{ type: "sondage", q: "?", a: "a", b: "b", scale: 0.01 }], { bobine: true })),
      normal: echelle(_storyOverlaysHtml([{ type: "sondage", q: "?", a: "a", b: "b", scale: 1.2 }], { bobine: true })),
      maxEditeur: [meEchelleMax({ type: "sondage" }), meEchelleMax({ type: "text" })],
    };
  });
  expect(r).toEqual({ sondageBobine: 1.6, sondageStory: 1.6, texte: 5, petit: 0.3, normal: 1.2, maxEditeur: [1.6, 5] });
  // Rendu à 390 px : la carte bornée laisse la plus grande partie de la scène au toucher de la vidéo.
  await page.setViewportSize({ width: 390, height: 780 });
  const part = await page.evaluate(() => {
    const hote = document.createElement("div");
    hote.style.cssText = "position:fixed;inset:0;";
    hote.className = "reel-overlays-layer";
    hote.innerHTML = _storyOverlaysHtml([{ type: "sondage", q: "Plutôt mer ou montagne ?", a: "Mer", b: "Montagne", x: 50, y: 50, scale: 40 }], { bobine: true });
    document.body.appendChild(hote);
    const b = hote.querySelector(".st-sondage").getBoundingClientRect();
    hote.remove();
    return (b.width * b.height) / (innerWidth * innerHeight);
  });
  expect(part, "la carte couvre moins de la moitié de l'écran").toBeLessThan(0.5);
});
