const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// COMPTEURS VISIBLES : LA CADENCE RECULE QUAND RIEN NE BOUGE (2026-09-21)
//
// Vrai moteur du produit (`startPostLikeRefresh`, app-03), horloge navigateur
// pilotée, serveur HEAD contrôlé. Ce que ce banc prouve :
//   · compteurs stables → 15 → 22,5 → 33,75 → 50,6 → 60 s entre débuts, plafond ;
//   · un compteur qui change, une erreur, une carte jamais relue → 15 s ;
//   · mon propre like, le retour au premier plan, le réseau revenu → 15 s ET
//     un rendez-vous lointain rapproché (au plus 16,5 s) ;
//   · l'onglet masqué coupe le minuteur comme avant ;
//   · la politique est PURE, même forme que `filetProchainPas`, et le banc de
//     charge en porte la copie comparée (tests/unit/charge-realiste).
// ═══════════════════════════════════════════════════════════════════════════

async function preparer(page, count = 1) {
  await bootOnboarded(page);
  await page.clock.install();
  await page.evaluate((n) => {
    stopFeedRefreshLoop();
    stopPostLikeRefresh();
    _postLikeRefreshNextAt = 0;
    _postLikeRefreshPhaseIdentity = null;
    _postLikeRefreshEntries.clear();
    _postLikeRefreshPas = POST_LIKE_REFRESH_MS;
    Math.random = () => 0; // jitter 0, phase initiale 200 ms : mesures exactes
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b";
    window.MY_UID = MY_UID;
    state.user.likedPosts = [];
    state.user.blocked = [];
    window._supaReal = true;
    window._rechargementImminent = false;
    window.requireAuthentication = () => true;
    window.supaTrack = async () => null;
    window.supaInsertNotif = async () => null;
    window.__headReads = [];
    window.__counts = {};
    window.__erreur = false;
    window.__writeResolvers = [];
    window.supaSetPostLike = () => new Promise(resolve => window.__writeResolvers.push(resolve));
    state.supabasePosts = Array.from({ length: n }, (_, i) => ({
      id: "cad_" + i, authorId: "auteur_cadence", passion: "musique", mood: "all",
      text: "Publication " + i, likes: 7, liked: false, comments: [], fromSupabase: true,
      createdAt: Date.now(), type: "text",
    }));
    state.supabasePosts.forEach(p => { __counts[p.id] = 7; });
    const stage = document.createElement("div");
    stage.id = "cadence-stage";
    stage.style.cssText = "position:fixed;inset:90px 20px 90px;overflow:auto;z-index:250000;background:white;";
    document.body.appendChild(stage);
    const style = document.createElement("style");
    style.textContent = "#cadence-stage .post {height:100px!important;min-height:100px!important;overflow:hidden;content-visibility:visible!important;contain-intrinsic-size:none!important;margin:0!important;animation:none!important;} #cadence-stage .post-header{display:none} #cadence-stage .post-body{padding:2px}";
    document.head.appendChild(style);
    stage.innerHTML = state.supabasePosts.map(renderPostHTML).join("");
    supa.from = function (table) {
      const req = { table };
      const q = {
        select: (cols, options) => { req.options = options; return q; },
        eq: (col, value) => { req.id = value; return q; },
        abortSignal: () => q,
        then: (yes, no) => {
          if (table !== "post_likes" || !req.options || !req.options.head) return Promise.resolve({ data: [], error: null }).then(yes, no);
          __headReads.push({ id: req.id, at: Date.now() });
          if (__erreur) return Promise.resolve({ data: null, count: null, error: { message: "timeout" } }).then(yes, no);
          return Promise.resolve({ data: null, count: __counts[req.id], error: null }).then(yes, no);
        },
      };
      return q;
    };
    startPostLikeRefresh();
  }, count);
  // Horloge FIGÉE : sans cela le temps réel s'écoule entre deux `evaluate` et
  // décale les rendez-vous de quelques millisecondes — le banc mourrait de son
  // propre instrument.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 50)));
}
async function passer(page, ms) { await page.clock.fastForward(ms); await page.evaluate(() => Promise.resolve()); }
const stats = (page) => page.evaluate(() => ({ ...window._postLikeRefreshStats, reads: __headReads.length, pas: _postLikeRefreshPas, dans: _postLikeRefreshNextAt - Date.now() }));
// Avance jusqu'au prochain rendez-vous : rien ne part une milliseconde avant,
// un HEAD part à l'échéance. Rend l'écart entre les débuts des deux cycles.
async function cycleSuivant(page) {
  const avant = await stats(page);
  await passer(page, avant.dans - 1);
  expect((await stats(page)).reads).toBe(avant.reads);
  await passer(page, 1);
  const apres = await stats(page);
  expect(apres.reads).toBeGreaterThan(avant.reads);
  return page.evaluate(() => __headReads[__headReads.length - 1].at - __headReads[__headReads.length - 2].at);
}

test("compteurs stables : 15 → 22,5 → 33,75 → 50,6 → 60 s entre débuts, plafond tenu", async ({ page }) => {
  await preparer(page);
  await passer(page, 250); // phase initiale (200 ms) : 1er cycle, carte jamais relue → vivant
  let s = await stats(page);
  expect(s.cycles).toBe(1); expect(s.pas).toBe(15000);
  const ecarts = [];
  for (let i = 0; i < 6; i++) ecarts.push(await cycleSuivant(page));
  expect(ecarts).toEqual([15000, 22500, 33750, 50625, 60000, 60000]);
  s = await stats(page);
  expect(s.pas).toBe(60000); expect(s.cyclesCalmes).toBe(6); expect(s.changed).toBe(0);
});

test("un compteur qui change ramène le pas à 15 s ; une erreur n'est pas un calme", async ({ page }) => {
  await preparer(page);
  await passer(page, 250);
  await cycleSuivant(page); await cycleSuivant(page); // pas → 33,75 s
  expect((await stats(page)).pas).toBe(33750);
  await page.evaluate(() => { __counts.cad_0 = 8; });
  expect(await cycleSuivant(page)).toBe(33750);
  let s = await stats(page);
  expect(s.changed).toBe(1); expect(s.pas).toBe(15000);
  expect(await page.evaluate(() => state.supabasePosts[0].likes)).toBe(8);
  expect(await cycleSuivant(page)).toBe(15000); // stable → 22,5
  expect((await stats(page)).pas).toBe(22500);
  await page.evaluate(() => { __erreur = true; });
  expect(await cycleSuivant(page)).toBe(22500);
  s = await stats(page);
  expect(s.errors).toBe(1); expect(s.pas).toBe(15000);
  await page.evaluate(() => { __erreur = false; });
  expect(await cycleSuivant(page)).toBe(15000);
  expect((await stats(page)).pas).toBe(22500);
});

test("mon propre like : cadence vive et rendez-vous rapproché à 16,5 s au plus, sans nouveau tirage", async ({ page }) => {
  await preparer(page);
  await passer(page, 250);
  for (let i = 0; i < 4; i++) await cycleSuivant(page);
  let s = await stats(page);
  expect(s.pas).toBe(60000); expect(s.dans).toBe(60000);
  await page.evaluate(() => { window.__tirages = 0; Math.random = () => { __tirages++; return 0; }; });
  await page.locator('#cadence-stage [data-action="like"]').click();
  await page.evaluate(() => { __writeResolvers.forEach(r => r(true)); });
  await passer(page, 1);
  s = await stats(page);
  expect(s.pas).toBe(15000);
  expect(s.dans).toBeLessThanOrEqual(16500);
  expect(await page.evaluate(() => __tirages)).toBe(0);
});

test("retour au premier plan : reprise vive ; onglet masqué : plus aucun HEAD", async ({ page }) => {
  await preparer(page);
  await passer(page, 250);
  for (let i = 0; i < 3; i++) await cycleSuivant(page);
  expect((await stats(page)).pas).toBe(50625);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const avant = (await stats(page)).reads;
  await passer(page, 120000);
  expect((await stats(page)).reads).toBe(avant);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const s = await stats(page);
  expect(s.pas).toBe(15000);
  await passer(page, 250);
  expect((await stats(page)).reads).toBe(avant + 1);
});

test("une carte jamais relue qui entre à l'écran rend la cadence vive", async ({ page }) => {
  await preparer(page, 1);
  await passer(page, 250);
  for (let i = 0; i < 2; i++) await cycleSuivant(page);
  expect((await stats(page)).pas).toBe(33750);
  await page.evaluate(() => {
    const p = { id: "cad_neuve", authorId: "auteur_cadence", passion: "musique", mood: "all", text: "Neuve", likes: 3, liked: false, comments: [], fromSupabase: true, createdAt: Date.now(), type: "text" };
    state.supabasePosts.push(p); __counts.cad_neuve = 3;
    document.getElementById("cadence-stage").insertAdjacentHTML("beforeend", renderPostHTML(p));
  });
  await cycleSuivant(page);
  const s = await stats(page);
  expect(s.pas).toBe(15000);
  expect(await page.evaluate(() => __headReads.slice(-2).map(r => r.id).sort())).toEqual(["cad_0", "cad_neuve"]);
});

test("la politique est pure, plafonnée à 60 s, et le filet du fil n'a pas bougé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    let pas = 15000; const suite = [];
    for (let i = 0; i < 6; i++) { pas = compteursProchainPas(pas, false); suite.push(pas); }
    return { suite, reveil: compteursProchainPas(60000, true), absurdes: [undefined, "x", -1, 0, 3000].map(v => compteursProchainPas(v, false)),
      constantes: [POST_LIKE_REFRESH_MS, POST_LIKE_REFRESH_MAX_MS, POST_LIKE_REFRESH_JITTER_MS, POST_LIKE_REFRESH_MAX_POSTS],
      filet: [filetProchainPas(60000, false), filetProchainPas(60000, true), filetProchainPas(300000, false)] };
  });
  expect(r.suite).toEqual([22500, 33750, 50625, 60000, 60000, 60000]);
  expect(r.reveil).toBe(15000);
  expect(r.absurdes).toEqual([22500, 22500, 22500, 22500, 22500]);
  expect(r.constantes).toEqual([15000, 60000, 1500, 3]);
  expect(r.filet).toEqual([90000, 60000, 300000]);
  // Mesuré à la SOURCE : la reprise ne tire aucun aléa, le tour recalcule son rendez-vous.
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "js", "app-03-posts-vlogs.js"), "utf8");
  const reveiller = src.slice(src.indexOf("function _postLikeCadenceReveiller"), src.indexOf("function _postLikeRefreshReprise"));
  expect(reveiller).not.toContain("Math.random");
  expect(src).toContain("_postLikeRefreshPas = compteursProchainPas(_postLikeRefreshPas, vivant);");
  expect(src).toContain('document.addEventListener("visibilitychange", _postLikeRefreshReprise);');
});

test("mon like pendant un tour EN COURS : le réveil survit à la fin du tour (pas 15 s, rendez-vous rapproché)", async ({ page }) => {
  await preparer(page);
  await passer(page, 250);
  for (let i = 0; i < 3; i++) await cycleSuivant(page);
  expect((await stats(page)).pas).toBe(50625);
  // Le prochain HEAD reste EN VOL tant qu'on ne le libère pas.
  await page.evaluate(() => {
    window.__headLibere = [];
    const ancien = supa.from;
    supa.from = function (table) {
      const q = ancien(table);
      const then = q.then;
      q.then = (yes, no) => new Promise((ok) => { __headLibere.push(ok); }).then(() => then(yes, no));
      return q;
    };
  });
  const avant = await stats(page);
  await passer(page, avant.dans);
  expect(await page.evaluate(() => [__headLibere.length, _postLikeRefreshBusy])).toEqual([1, true]);
  // Mon like tombe au milieu du tour : la reprise vive est demandée pendant que le tour est occupé.
  await page.locator('#cadence-stage [data-action="like"]').click();
  await page.evaluate(() => { __writeResolvers.forEach(r => r(true)); });
  await passer(page, 1);
  expect((await stats(page)).pas).toBe(15000);
  // Le HEAD en vol se termine (réponse écartée : la carte a changé de version) et le tour se clôt.
  await page.evaluate(() => { __headLibere.forEach(ok => ok()); });
  await passer(page, 1);
  const s = await stats(page);
  expect(s.discarded).toBeGreaterThanOrEqual(1);
  // Sans mémorisation du réveil, la fin du tour posait 60 000 (50 625 × 1,5 plafonné) et un rendez-vous à 60 s.
  expect(s.pas).toBe(15000);
  expect(s.dans).toBeLessThanOrEqual(16500);
  expect(s.dans).toBeGreaterThan(0);
});
