// Suite « systèmes d'interaction » — like / emoji / commentaire sur TOUTES les
// surfaces (fil, post détail, carnet CDV, live CDV, événement IRL, bobine).
//
// Couvre les régressions trouvées lors de l'audit du 2026-07-22, toutes vérifiées
// par clic réel dans le navigateur AVANT correction :
//   · carte carnet CDV : likePost() appelé sans `this` → l'état changeait mais le
//     bouton ne bougeait JAMAIS (le repli renderFeed() repeignait le fil, pas CDV)
//   · carte live épinglée (vue CDV par défaut) : AUCUNE barre d'engagement
//   · like d'un commentaire : patch DOM maison sur le PREMIER [data-commentid] du
//     document → quand le commentaire est rendu deux fois (vue détail sous la
//     modale), c'est la copie CACHÉE qui était repeinte
//   · like d'une bobine : purement cosmétique (pas de compteur, pas de
//     persistance, pas de sync, désynchronisé du fil)
//   · viewer de carnet et fiche événement IRL : ni like ni réaction emoji
//   · compteurs désynchronisés entre une carte et sa fiche ouverte par-dessus
//
// Aucune écriture Supabase : les fonctions de sync sont neutralisées après boot.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function bootInteractions(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    // ⚠️ supaSetPostLike est stubbé à part : il doit répondre { ok:true }, pas
    // `null` — un like dont l'écriture n'est pas confirmée est désormais ANNULÉ.
    window.supaSetPostLike = async () => ({ ok: true, error: null });
    // ⚠️ supaLoadPosts manquait à la liste ci-dessous, et c'était LA cause des
    // flakes de ce fichier (trois tests différents, l. 112/126/142, sur trois
    // exécutions complètes en août 2026). Plusieurs chemins font
    // `state.supabasePosts = posts.concat(extra)` : un chargement différé qui
    // se termine APRÈS seedServerPost remplaçait le tableau en bloc et faisait
    // disparaître le post semé. Le symptôme (« element detached », « not
    // stable ») ressemblait à une course de rendu — c'en était une de DONNÉES.
    // Renvoie [] et non null : les appelants font `.concat()` sur le résultat.
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
    ["supaAddComment", "supaCommentInteract", "supaCommentRemoveLike",
      "supaCommentRemoveReactions", "supaLoadComments", "supaLoadCommentInteractions",
      "supaInsertNotif", "supaSetEventLike", "supaAddEventReaction", "supaRemoveEventReaction",
      "supaLoadEventReactions", "supaLoadEventComments", "supaAddEventComment",
      "supaSetCdvLiveLike", "supaSetStepLike", "supaLoadCdvLiveLikes", "supaReactCdvLive",
      "supaRemoveCdvLiveReaction", "supaAddCdvLiveComment", "supaPublishCdvLive",
      "supaAddCdvLiveStep", "supaRefreshCdvLives", "supaLoadCdvLives",
      "supaTrack"].forEach((fn) => { window[fn] = async () => null; });
    localStorage.removeItem("passio_cdv_lives");
  });
  // Garde anti-course : sous charge (suite complète), des tâches différées du boot
  // pouvaient encore re-rendre un écran APRÈS le début du test et écraser le DOM
  // que l'on venait de mesurer. On attend que les renderers utilisés ici soient
  // tous prêts avant d'agir.
  // ⚠️ `state` est déclaré `let state = null` (app-01) : un `let` de haut niveau
  // ne crée PAS de propriété sur window — tester `window.state` renvoie toujours
  // undefined et le garde n'aurait jamais pu passer. On passe par le binding
  // global via typeof, comme le reste de la suite.
  await page.waitForFunction(
    () => ["renderCdvScreen", "renderIRL", "renderFeed", "openVlogViewer", "addEmojiToPost"]
      .every((f) => typeof window[f] === "function")
      && typeof state !== "undefined" && !!state && !!state.onboarded,
    null, { timeout: 20000 }
  );
}

// Attend que le fil ait CESSÉ de se re-rendre.
//
// Le garde de bootInteractions vérifie que les renderers EXISTENT ; il ne dit
// rien de ceux qui vont encore s'exécuter. Sous charge (suite complète), une
// tâche différée du boot re-rend le fil APRÈS le retour du helper : le nœud que
// le locator vient de résoudre est alors détaché, et le clic échoue avec
// « element is not stable » ou « element was detached from the DOM ».
//
// Symptôme observé les 15/08 sur trois exécutions complètes : trois tests
// DIFFÉRENTS de ce fichier (l. 112, 126, 142) ont floté à tour de rôle. Ce
// n'était donc pas un bug produit mais la fragilité commune de leur mise en
// place — un flaky qui érode la confiance dans le gate, et un gate auquel on ne
// croit plus finit désactivé.
//
// On attend que le MÊME nœud DOM survive à trois rafraîchissements consécutifs.
// Pas de délai fixe : un délai est toujours trop court sur machine chargée et
// toujours trop long sinon.
async function attendreFilStable(page, id) {
  const sel = `[data-postid="${id}"] [data-action="like"]`;
  try {
    await page.waitForSelector(sel, { timeout: 15000 });
  } catch (e) {
    // Le post était là (le seed l'a vu) et il n'y est plus. Dire LEQUEL des deux
    // a lâché : l'état applicatif, ou seulement son rendu.
    const etat = await page.evaluate(() => ({
      dansEtat: (state.supabasePosts || []).some((p) => p.id === "p_srv_test"),
      nbSupabase: (state.supabasePosts || []).length,
      nbNoeuds: document.querySelectorAll("[data-postid]").length,
    })).catch(() => null);
    throw new Error(`le post semé a DISPARU du fil après y être entré\n`
      + `état : ${etat ? JSON.stringify(etat) : "indisponible"}\n`
      + `(dansEtat=false ⇒ state.supabasePosts a été remplacé ; dansEtat=true ⇒ le rendu l'omet)\n${e.message}`);
  }
  // Compteurs de diagnostic : quand cette attente expire, on veut savoir POURQUOI.
  // « Le nœud a été remplacé 900 fois » et « le nœud a disparu du DOM » appellent
  // des corrections opposées ; sans le chiffre, on choisit à pile ou face.
  await page.evaluate(() => { window.__filRef = null; window.__filStable = 0; window.__filDiag = { sondages: 0, remplacements: 0, absences: 0 }; });
  try {
    await page.waitForFunction((s) => {
    const n = document.querySelector(s);
    const d = window.__filDiag; if (d) d.sondages++;
    if (!n) { if (d) d.absences++; window.__filRef = null; window.__filStable = 0; return false; }
    if (window.__filRef === n) { window.__filStable = (window.__filStable || 0) + 1; }
    else { if (d && window.__filRef) d.remplacements++; window.__filRef = n; window.__filStable = 1; }
    return window.__filStable >= 3;
    // ⚠️ polling par INTERVALLE, jamais "raf" : requestAnimationFrame ne se
    // déclenche pas sur une page qui ne compose pas de frames — ce qui est le
    // cas en headless, et plus encore sous charge parallèle. Avec "raf" cette
    // attente expirait alors que le fil était parfaitement stable : le garde
    // ne s'exécutait tout simplement jamais.
  }, sel, { polling: 50, timeout: 15000 });
  } catch (e) {
    const d = await page.evaluate(() => window.__filDiag).catch(() => null);
    throw new Error(`attendreFilStable a expiré sur ${sel}\n`
      + `diagnostic : ${d ? `${d.sondages} sondages, ${d.remplacements} remplacements de nœud, ${d.absences} absences` : "indisponible"}\n`
      + `(remplacements élevés = le fil se re-rend en boucle ; absences élevées = le post n'est plus dans le DOM)\n${e.message}`);
  }
}

// Rend le fil non vide : sans passion sélectionnée, le fil est vide PAR DESIGN.
async function showFeed(page) {
  const id = await page.evaluate(() => {
    const posts = allFeedPosts().filter((p) => p.type !== "vlog");
    _activeFeedPassions.add(posts[0].passion);
    window._feedDomSig = null;
    renderFeed();
    return document.querySelector("#feedList [data-postid]").getAttribute("data-postid");
  });
  await attendreFilStable(page, id);
  return id;
}

// Injecte dans le fil un post « qui existe en base » (fromSupabase) et arme une
// session Supabase factice : c'est la SEULE configuration où likePost écrit côté
// serveur (le contenu de démo, lui, n'écrit rien). `writeResult` = réponse de
// l'écriture. En mode `manual`, elle ne répond QUE sur appel de __releaseWrite() :
// c'est le seul moyen fiable d'observer l'état optimiste avant la réponse — un
// délai en millisecondes rend le test instable dès que la machine est chargée.
async function seedServerPost(page, { writeResult = { ok: true, error: null }, manual = false } = {}) {
  return page.evaluate(([res, isManual]) => {
    const passion = allFeedPosts().filter((p) => p.type !== "vlog")[0].passion;
    state.supabasePosts = state.supabasePosts || [];
    // Idempotent : le seed peut être rejoué (cf. seedServerPostStable), et deux
    // exemplaires du même post fausseraient tous les compteurs.
    state.supabasePosts = state.supabasePosts.filter((p) => p.id !== "p_srv_test");
    state.supabasePosts.unshift({
      id: "p_srv_test", authorId: "u_autre", authorName: "Autre", authorEmoji: "✨",
      passion, mood: "all", type: "text", text: "post serveur", createdAt: Date.now(),
      likes: 4, liked: false, comments: [], fromSupabase: true,
    });
    _activeFeedPassions.add(passion);
    window._feedDomSig = null;
    renderFeed();
    // `supa` et `MY_UID` sont des liaisons de script (let) : on les affecte
    // directement, `window.X = …` ne les toucherait pas (cf. le piège `state`).
    supa = {}; MY_UID = "u_moi";
    window.__likeCalls = [];
    window.supaSetPostLike = function (postId, want) {
      window.__likeCalls.push({ postId, want });
      if (!isManual) return Promise.resolve(res);
      return new Promise((r) => { window.__releaseWrite = function () { r(res); }; });
    };
    return "p_srv_test";
  }, [writeResult, manual]);
}

/**
 * Variante stabilisée : à utiliser dès qu'on va CLIQUER sur le post semé.
 *
 * La course, mesurée et non supposée. Le seed injecte le post dans
 * `state.supabasePosts`, puis neutralise `supa`. Entre les deux, une requête du
 * boot encore EN VOL se résout et **remplace** le tableau : le post semé
 * disparaît du fil. Diagnostic relevé sous charge le 2026-08-16 —
 * `{"dansEtat":false,"nbSupabase":54}`, soit exactement le nombre de posts de la
 * table de production. C'est bien la requête du boot qui écrase le fixture.
 *
 * Le remède attaque la cause : on attend que cette requête ait ATTERRI avant de
 * semer. Après elle, plus personne ne remplace le tableau. Le réessai reste en
 * second rideau pour les cas non couverts.
 *
 * Rien de tout cela ne masque un défaut produit : injecter un post à la main
 * dans une structure que l'application possède et reconstruit est une
 * construction de TEST. Un vrai post arrive PAR cette requête, jamais à côté.
 */
async function seedServerPostStable(page, opts) {
  const sel = `[data-postid="p_srv_test"] [data-action="like"]`;
  let id = null;

  // Sans réseau (ou si la requête échoue), le tableau reste vide : on n'attend
  // pas indéfiniment, on sème quand même. L'échec de cette attente n'est pas
  // l'échec du test.
  await page.waitForFunction(() => (state.supabasePosts || []).length > 0,
    null, { polling: 50, timeout: 8000 }).catch(() => {});
  for (let essai = 1; essai <= 4; essai++) {
    id = await seedServerPost(page, opts);
    try {
      await page.waitForSelector(sel, { timeout: 4000 });
      break;
    } catch (e) {
      if (essai === 4) {
        const etat = await page.evaluate(() => ({
          dansEtat: (state.supabasePosts || []).some((p) => p.id === "p_srv_test"),
          nbPosts: (state.supabasePosts || []).length,
          nbNoeuds: document.querySelectorAll("[data-postid]").length,
        })).catch(() => null);
        throw new Error(`le post semé n'a jamais atteint le fil après 4 tentatives\n`
          + `état : ${etat ? JSON.stringify(etat) : "indisponible"}\n`
          + `(dansEtat=false ⇒ une requête du boot a remplacé state.supabasePosts ; `
          + `dansEtat=true ⇒ le rendu ne l'affiche pas)`);
      }
    }
  }
  await attendreFilStable(page, id);
  return id;
}

test.describe("Interactions — like d'un post", () => {
  test("fil : le bouton ❤️ bascule dans les deux sens et persiste au re-rendu", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);
    const btn = page.locator(`[data-postid="${id}"] [data-action="like"]`);

    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, id);
    await btn.click();
    await expect(btn).toHaveText(new RegExp(`❤️\\s*${before + 1}`));
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);

    // Le compteur survit à un re-rendu complet du fil.
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    await expect(page.locator(`[data-postid="${id}"] [data-action="like"]`))
      .toHaveText(new RegExp(`❤️\\s*${before + 1}`));
  });

  test("écriture serveur refusée : le ❤️ optimiste est ANNULÉ (bouton + état)", async ({ page }) => {
    await bootInteractions(page);
    const id = await seedServerPostStable(page, { writeResult: { ok: false, error: { message: "RLS", code: "42501" } }, manual: true });
    const btn = page.locator(`[data-postid="${id}"] [data-action="like"]`);

    await btn.click();
    await expect(btn).toHaveText(/❤️\s*5/);   // optimiste : immédiat, sans attendre le réseau
    await page.evaluate(() => window.__releaseWrite());
    await expect(btn).toHaveText(/🤍\s*4/);   // puis annulé quand le serveur refuse
    expect(await page.evaluate(() => state.user.likedPosts.includes("p_srv_test"))).toBe(false);
    expect(await page.evaluate(() => findPostAnywhere("p_srv_test").likes)).toBe(4);
    expect(await page.evaluate(() => findPostAnywhere("p_srv_test").liked)).toBe(false);
  });

  test("fil reconstruit pendant l'attente : l'annulation touche le bouton VISIBLE", async ({ page }) => {
    // Le cœur du bug rapporté : garder la référence du bouton à travers l'attente
    // réseau. Si le fil est reconstruit entre le clic et la réponse, ce nœud est
    // détaché — le repeindre ne se voit nulle part.
    await bootInteractions(page);
    const id = await seedServerPostStable(page, { writeResult: { ok: false, error: { message: "réseau" } }, manual: true });
    await page.locator(`[data-postid="${id}"] [data-action="like"]`).click();
    await expect(page.locator(`[data-postid="${id}"] [data-action="like"]`)).toHaveText(/❤️\s*5/);

    // Reconstruction complète du fil pendant que l'écriture est en vol : le bouton
    // cliqué est détaché, seul un nœud retrouvé APRÈS coup peut encore être vu.
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    await page.evaluate(() => window.__releaseWrite());
    await expect(page.locator(`[data-postid="${id}"] [data-action="like"]`)).toHaveText(/🤍\s*4/);
  });

  test("l'écriture serveur reçoit l'INTENTION de l'utilisateur, jamais son inverse", async ({ page }) => {
    // L'ancien supaToggleLike relisait post_likes pour déduire le sens : dès que
    // la base et l'état local divergeaient, le clic écrivait l'inverse de ce que
    // l'utilisateur voyait.
    await bootInteractions(page);
    const id = await seedServerPostStable(page);
    const btn = page.locator(`[data-postid="${id}"] [data-action="like"]`);

    await btn.click();
    await expect(btn).toHaveText(/❤️\s*5/);
    // Lève le verrou anti-double-clic explicitement : l'attendre en temps réel
    // (800 ms) rend le test instable dès que la machine est chargée, et ce n'est
    // pas le verrou qu'on teste ici mais le SENS de l'écriture.
    await page.evaluate(() => _likePending.clear());
    // Le premier clic a repeint le bouton : le nœud a pu être remplacé. On
    // attend qu'il se soit re-stabilisé avant le second clic, sinon celui-ci
    // part sur un nœud en train d'être détaché (« element is not stable »).
    await attendreFilStable(page, id);
    await btn.click();
    await expect(btn).toHaveText(/🤍\s*4/);
    expect(await page.evaluate(() => window.__likeCalls)).toEqual([
      { postId: id, want: true }, { postId: id, want: false },
    ]);
  });

  test("contenu de démo : aucune écriture serveur (elle partirait en orphelin)", async ({ page }) => {
    await bootInteractions(page);
    // ⚠️ On choisit EXPLICITEMENT un post de démo (présent dans state.seed.posts),
    // au lieu de prendre le premier post rendu : le classement du fil peut placer
    // un post utilisateur en tête, et l'écriture serveur est alors parfaitement
    // légitime — le test échouait alors sans qu'aucun code soit en cause.
    const id = await page.evaluate(() => {
      const demo = (state.seed.posts || []).find((p) => p.type !== "vlog");
      _activeFeedPassions.add(demo.passion);
      window._feedDomSig = null;
      renderFeed();
      return demo.id;
    });
    await expect(page.locator(`[data-postid="${id}"]`)).toHaveCount(1);
    await page.evaluate(() => {
      supa = {}; MY_UID = "u_moi";
      window.__likeCalls = [];
      window.supaSetPostLike = function (postId, want) {
        window.__likeCalls.push({ postId, want });
        return Promise.resolve({ ok: true, error: null });
      };
    });
    await page.locator(`[data-postid="${id}"] [data-action="like"]`).click();
    await expect(page.locator(`[data-postid="${id}"] [data-action="like"]`)).toHaveText(/❤️/);
    expect(await page.evaluate(() => window.__likeCalls)).toEqual([]);
  });

  test("carte carnet CDV : le ❤️ met à jour le BOUTON, pas seulement l'état", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });

    const btn = page.locator("#screen-cdv [data-postlike]").first();
    const id = await btn.getAttribute("data-postlike");
    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, id);

    await btn.click();
    // Le cœur ET le compteur doivent bouger : c'était TOUT le bug (l'état passait
    // bien à liked, mais le DOM restait sur « 🤍 <ancien compteur> »).
    await expect(btn).toHaveText(new RegExp(`❤️\\s*${before + 1}`));
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), id)).toBe(true);
  });

  test("carnet : le compteur reste synchronisé entre la carte et le viewer ouvert", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });
    const id = await page.locator("#screen-cdv [data-postlike]").first().getAttribute("data-postlike");

    await page.locator(`#screen-cdv [data-postlike="${id}"]`).click();
    const cardText = await page.locator(`#screen-cdv [data-postlike="${id}"]`).textContent();

    await page.evaluate((i) => openVlogViewer(i), id);
    const viewerBtn = page.locator(`#vlogViewerContent [data-postlike="${id}"]`);
    await expect(viewerBtn).toHaveCount(1); // le viewer a bien un bouton like
    expect((await viewerBtn.textContent()).trim()).toBe(cardText.trim());

    // Un like DEPUIS le viewer repeint aussi la carte qui est dessous.
    await viewerBtn.click();
    expect((await page.locator(`#screen-cdv [data-postlike="${id}"]`).textContent()).trim())
      .toBe((await viewerBtn.textContent()).trim());
  });

  test("viewer de carnet : la réaction emoji est disponible et alimente la pastille", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("cdv"); renderCdvScreen(); });
    const id = await page.locator("#screen-cdv [data-postlike]").first().getAttribute("data-postlike");

    await page.evaluate((i) => openVlogViewer(i), id);
    // Le viewer se peuple en deux temps (rendu local puis commentaires) : on attend
    // qu'il soit réellement ouvert avant d'agir, sinon le test mesure un état
    // transitoire quand la machine est chargée.
    await expect(page.locator("#vlogViewer")).toHaveClass(/open/);
    await expect(page.locator("#vlogViewerContent .post-action[onclick*=showEmojiPickerForPost]")).toHaveCount(1);

    await page.evaluate((i) => addEmojiToPost(i, "🔥"), id);
    await expect(page.locator(`#vlogViewerContent [data-postchip="${id}"]`)).toContainText("🔥");
  });
});

test.describe("Interactions — like d'un commentaire", () => {
  test("le bouton VISIBLE se met à jour même quand le commentaire est rendu deux fois", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);

    // openPost rend le commentaire une 1re fois, openComments une 2e par-dessus :
    // c'est la configuration exacte qui cassait le patch DOM.
    const cid = await page.evaluate(async (i) => {
      openPost(i);
      await openComments(i);
      document.getElementById("newComment").value = "commentaire de test";
      submitComment(i);
      return findPostAnywhere(i).comments.find((c) => c.text === "commentaire de test").id;
    }, id);

    // Attend que les DEUX rendus soient posés (c'est la condition du bug).
    await expect(page.locator(`[data-cmtlike="${cid}"]`)).toHaveCount(2);

    const visible = page.locator(`#commentsBox [data-cmtlike="${cid}"]`);
    await expect(visible).toHaveText(/🤍\s*0/);
    await visible.click();
    await expect(visible).toHaveText(/❤️\s*1/);

    // TOUTES les copies suivent (sinon rouvrir l'autre vue afficherait l'ancien état).
    const all = await page.locator(`[data-cmtlike="${cid}"]`).allTextContents();
    expect(all.every((t) => /❤️\s*1/.test(t))).toBe(true);

    // Et le toggle inverse fonctionne.
    await visible.click();
    await expect(visible).toHaveText(/🤍\s*0/);
  });

  // Régression 2026-08-09 : dans l'APERÇU du fil (2 commentaires sous la carte),
  // le bouton like du commentaire n'avait pas de [data-cmtlike] → le patch central
  // _patchCmtLike ne le repeignait jamais et l'état « aimé » était calculé sans
  // MY_UID → le like semblait « ne pas fonctionner » sur cette surface.
  test("aperçu du fil : liker un commentaire met à jour le bouton visible", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);
    const cid = await page.evaluate((i) => {
      const p = findPostAnywhere(i);
      p.comments = p.comments || [];
      p.comments.unshift({ id: "c_prev_1", authorId: "u_autre", authorName: "Alice", text: "coucou", createdAt: Date.now(), likes: 0, likedBy: [] });
      window._feedDomSig = null; renderFeed();
      return "c_prev_1";
    }, id);

    const like = page.locator(`#feedList [data-postid="${id}"] .comment[data-commentid="${cid}"] [data-cmtlike="${cid}"]`);
    await expect(like).toHaveText(/🤍\s*0/);
    await like.click();
    expect(await page.evaluate((i) => findPostAnywhere(i).comments.find(c => c.id === "c_prev_1").likes, id)).toBe(1);
    await expect(like).toHaveText(/❤️\s*1/);
    // L'état survit à un re-rendu du fil (calcul « aimé » sur toutes mes identités).
    await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
    await expect(page.locator(`#feedList [data-postid="${id}"] [data-cmtlike="${cid}"]`)).toHaveText(/❤️\s*1/);
  });

  // Régression 2026-08-09 : « répondre » depuis la modale insérait le champ dans
  // la 1re copie [data-commentid] du document — souvent l'aperçu du fil CACHÉ sous
  // la modale → le champ s'ouvrait invisible (« répondre ne marche pas »).
  test("répondre depuis la modale ouvre le champ dans la copie visible", async ({ page }) => {
    await bootInteractions(page);
    const id = await showFeed(page);
    const cid = await page.evaluate(async (i) => {
      const p = findPostAnywhere(i);
      p.comments = p.comments || [];
      p.comments.unshift({ id: "c_rep_1", authorId: "u_autre", authorName: "Alice", text: "salut", createdAt: Date.now(), likes: 0, likedBy: [] });
      window._feedDomSig = null; renderFeed();
      await openComments(i);
      return "c_rep_1";
    }, id);

    await expect(page.locator(`[data-commentid="${cid}"]`)).toHaveCount(2); // aperçu + modale
    await page.locator(`#commentsBox [data-commentid="${cid}"] .comment-action[title="Répondre"]`).click();
    // Le champ apparaît DANS la modale (copie cliquée), pas dans l'aperçu caché.
    await expect(page.locator(`#commentsBox [data-commentid="${cid}"] .comment-reply-input`)).toHaveCount(1);
    await expect(page.locator(`#feedList [data-commentid="${cid}"] .comment-reply-input`)).toHaveCount(0);
  });
});

test.describe("Interactions — événement IRL", () => {
  test("la fiche événement expose un like ET une réaction emoji", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => openEventDetails(i), evId);
    // Avant : la fiche ne permettait QUE de commenter.
    await expect(page.locator(`#eventDetailPage [data-evlike="${evId}"]`)).toHaveCount(1);
    await expect(page.locator("#eventDetailPage .post-action[onclick*=showEmojiPickerForEvent]")).toHaveCount(1);
  });

  test("le compteur de like reste synchronisé entre la carte et la fiche", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => openEventDetails(i), evId);
    await page.locator(`#eventDetailPage [data-evlike="${evId}"]`).click();

    const detail = (await page.locator(`#eventDetailPage [data-evlike="${evId}"]`).textContent()).trim();
    const card = (await page.locator(`#screen-irl [data-evlike="${evId}"]`).textContent()).trim();
    expect(detail).toBe(card);
    expect(await page.evaluate((i) => state.user.likedEvents.includes(i), evId)).toBe(true);
  });

  test("une réaction emoji remplace la précédente puis se retire au second tap", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");

    await page.evaluate((i) => applyEventEmojiReaction(i, ["🔥"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🔥");

    // Une seule réaction par personne : 🎉 REMPLACE 🔥.
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🎉"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🎉");

    // Re-tap du même emoji = retrait.
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🎉"]), evId);
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBeFalsy();
  });

  test("ma réaction emoji survit à un rechargement (événement de démo)", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });
    const evId = await page.locator("#screen-irl [data-evlike]").first().getAttribute("data-evlike");
    await page.evaluate((i) => applyEventEmojiReaction(i, ["🔥"]), evId);

    await page.reload();
    await page.waitForFunction(() => typeof renderIRL === "function" && state && state.onboarded);
    await page.evaluate(() => { goTo("irl"); renderIRL(); });

    // Les compteurs de démo sont régénérés à chaque chargement : ma réaction
    // (elle, persistée) doit être REJOUÉE par-dessus, sinon elle disparaît.
    expect(await page.evaluate((i) => state.user.eventReactions[i], evId)).toBe("🔥");
    expect(await page.evaluate((i) => (window._eventLikes[i].emojiCounts || {})["🔥"] > 0, evId)).toBe(true);
  });
});

test.describe("Interactions — live CDV", () => {
  test("la carte live épinglée porte la barre like / commentaire / emoji", async ({ page }) => {
    await bootInteractions(page);
    await page.evaluate(() => {
      const live = {
        id: "live_inter_1", authorId: "u_autre", destination: "Lisbonne",
        visibility: "public", status: "live", steps: [], followers: [], comments: [],
        reactions: [], reactionsBy: [], createdAt: Date.now() - 60000,
      };
      saveCdvLives([live]);
      goTo("cdv"); renderCdvScreen();
    });

    const card = page.locator(".cdv-live-pinned");
    await expect(card).toHaveCount(1);
    // Avant : la carte de la vue par défaut n'avait AUCUNE action.
    await expect(card.locator(".post-actions")).toHaveCount(1);
    await expect(card.locator("[data-livelike]")).toHaveCount(1);
    await expect(card.locator(".post-action[onclick*=reactCdvLivePicker]")).toHaveCount(1);

    await card.locator("[data-livelike]").click();
    await expect(card.locator("[data-livelike]")).toHaveText(/❤️\s*1/);
    expect(await page.evaluate(() => state.user.likedLives.includes("live_inter_1"))).toBe(true);
  });
});

test.describe("Interactions — bobine", () => {
  test("le like d'une bobine est un VRAI like : compteur, persistance et parité avec le fil", async ({ page }) => {
    await bootInteractions(page);
    // Le seed de test ne contient pas de bobine : on en crée une (isReel + média,
    // les deux conditions retenues par buildReels).
    const reelId = await page.evaluate(() => {
      const id = "reel_test_1";
      state.userPosts.unshift({
        id, authorId: MY_UID || "me", authorName: "Audit QA", isReel: true,
        type: "video", passion: "musique", mood: "all", text: "Bobine de test",
        media: "https://example.test/v.mp4", image: "https://example.test/v.mp4",
        likes: 4, comments: [], createdAt: Date.now(),
      });
      saveState();
      return buildReels().some((r) => r.id === id) ? id : null;
    });
    expect(reelId, "la bobine de test doit être visible dans buildReels()").toBe("reel_test_1");

    const before = await page.evaluate((i) => findPostAnywhere(i).likes || 0, reelId);
    await page.evaluate((i) => { goTo("explore"); if (typeof openReels === "function") openReels(); toggleReelLike(i, document.querySelector(`[data-reellike="${i}"]`)); }, reelId);

    // Avant : aucun compteur n'existait et rien n'était persisté.
    expect(await page.evaluate((i) => findPostAnywhere(i).likes, reelId)).toBe(before + 1);
    expect(await page.evaluate((i) => state.user.likedPosts.includes(i), reelId)).toBe(true);
    await expect(page.locator(`[data-reellike="${reelId}"] .reel-action-label`)).toHaveText(String(before + 1));

    // Parité avec le fil : le même contenu ne peut pas être « aimé » d'un côté et
    // « non aimé » de l'autre.
    const likedInFeed = await page.evaluate((i) => {
      const p = findPostAnywhere(i);
      return (state.user.likedPosts || []).includes(p.id);
    }, reelId);
    expect(likedInFeed).toBe(true);
  });
});
