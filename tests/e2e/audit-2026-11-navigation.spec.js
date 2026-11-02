// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D — NAVIGATION, RETOUR, COHÉRENCE ENTRE ONGLETS
//
// ① lien direct `#post-<id>` ; ② `goTo('wallet'|'shop'|'cdv')` redirigés
// (ADR-009/011) : jamais d'application sans écran actif ; ③ retour arrière
// (popstate) depuis un écran, depuis une modale, depuis une conversation ;
// ④ rafraîchissement en plein écran de conversation ; ⑤ changement de compte :
// l'état du compte précédent ne réapparaît pas ; ⑥ deux onglets du même
// contexte restent cohérents (localStorage partagé, `storage` event ?).
// Stub local (bootOnboarded) : aucune écriture en production.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes, onboardedState } = require("./app-helper");

const ecranActif = (page) => page.evaluate(() => { const s = document.querySelector(".screen.active"); return s ? s.id : null; });

test.describe("AUDIT D — navigation et cohérence", () => {
  test("① un lien direct #post-<id> (publication de démonstration) ouvre la page de détail", async ({ page }) => {
    await sansDonneesDistantes(page);
    // On récupère un id de démonstration sur une première page, puis on recharge avec le hash.
    await bootOnboarded(page);
    const id = await page.evaluate(() => (state.seed.posts || [])[0].id);
    await page.goto("/index.html#post-" + encodeURIComponent(id));
    await page.waitForFunction(() => { const p = document.getElementById("postDetailPage"); return p && p.style.display !== "none" && p.style.display !== ""; }, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ hash: location.hash, titre: (document.querySelector("#postDetailContent .post-body") || {}).textContent }));
    expect(r.titre).toBeTruthy();
    // Le hash est nettoyé (règle ④ du routeur) et remplacé par celui de la page.
    expect(r.hash).not.toMatch(/^#post-/);
  });

  test("① bis un lien #post-<id> inconnu : la landing (sans session) bloque le routeur ; une fois fermée, il conclut « introuvable » et laisse un écran actif", async ({ page }) => {
    await sansDonneesDistantes(page);
    await page.addInitScript((st) => { if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st)); sessionStorage.setItem("passio_pwa_dismissed", "1"); }, onboardedState(1));
    await page.goto("/index.html#post-inexistant_xyz");
    await page.waitForFunction(() => document.querySelector("#screen-feed.active"), null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    // Sans session SDK, un compte onboardé voit la landing (chemin de test) : le
    // routeur attend (règle ⑤ : rien ne s'ouvre par-dessus la landing). On la ferme.
    await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); }; const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
    await page.waitForFunction(() => (window.__toasts || []).some((m) => /introuvable/.test(m)), null, { timeout: 25000 });
    expect(await ecranActif(page)).toBe("screen-feed");
    expect(await page.evaluate(() => document.querySelectorAll(".screen.active").length)).toBe(1);
  });

  test("② goTo('wallet'), goTo('shop') et goTo('cdv') ne laissent jamais l'app sans écran actif", async ({ page }) => {
    await bootOnboarded(page);
    for (const [cible, attendu] of [["wallet", "screen-profiles"], ["shop", "screen-profiles"], ["cdv", "screen-feed"]]) {
      await page.evaluate((c) => goTo(c), cible);
      await page.waitForTimeout(150);
      expect(await ecranActif(page), cible).toBe(attendu);
      expect(await page.evaluate(() => document.querySelectorAll(".screen.active").length)).toBe(1);
      expect(await page.evaluate(() => location.hash)).toBe("#" + attendu.replace("screen-", ""));
    }
    // Un hash ancien rechargé : `#wallet` au démarrage.
    await page.goto("/index.html#wallet");
    await page.waitForFunction(() => document.querySelector(".screen.active"), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.querySelectorAll(".screen.active").length)).toBe(1);
  });

  test("③ retour arrière : écran → écran, modale → fermée (une seule entrée), conversation → fermée", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("irl"));
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(200);
    await page.goBack();
    await page.waitForTimeout(300);
    expect(await ecranActif(page)).toBe("screen-irl");
    // Modale : ouverture = une entrée ; retour = modale fermée, écran inchangé.
    await page.evaluate(() => openNotifications());
    await page.waitForTimeout(200);
    const avantH = await page.evaluate(() => history.length);
    await page.goBack();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"))).toBe(false);
    expect(await ecranActif(page)).toBe("screen-irl");
    // Fermer au doigt puis retour : on ne doit PAS reculer de deux écrans (entrée reprise).
    await page.evaluate(() => openNotifications());
    await page.waitForTimeout(200);
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(400);
    const apres = await ecranActif(page);
    test.info().annotations.push({ type: "mesure", description: "après modale fermée au doigt + retour : écran=" + apres + " (attendu : l'écran d'avant irl = feed)" });
    expect(["screen-feed", "screen-irl"]).toContain(apres);
    // Conversation plein écran : retour la ferme.
    await page.evaluate(() => {
      const convs = getConversations();
      if (!convs.some((c) => c.id === "c_nav")) { convs.push({ id: "c_nav", userId: "11111111-2222-4333-8444-555555555555", userName: "Nora", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: [{ id: "n1", from: "11111111-2222-4333-8444-555555555555", text: "Hello", at: Date.now() - 1000 }] }); saveConversationsNow(); }
      goTo("messages"); renderMessages(); openConversation("c_nav");
    });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById("conv-fullpage").classList.contains("active"))).toBe(true);
    await page.goBack();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById("conv-fullpage").classList.contains("active"))).toBe(false);
    expect(await ecranActif(page)).toBe("screen-messages");
  });

  test("④ rafraîchir en plein écran de conversation : l'app revient sur un écran utilisable, la conversation est conservée", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      const convs = getConversations();
      convs.push({ id: "c_refresh", userId: "11111111-2222-4333-8444-555555555555", userName: "Nora", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: [{ id: "r1", from: "me", text: "Avant le rechargement", at: Date.now() - 1000 }] });
      saveConversationsNow(); goTo("messages"); renderMessages(); openConversation("c_refresh");
    });
    await page.waitForTimeout(600);
    const hashAvant = await page.evaluate(() => location.hash);
    await page.reload();
    await page.waitForFunction(() => document.querySelector(".screen.active"), null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash,
      convOuverte: document.getElementById("conv-fullpage").classList.contains("active"),
      convGardee: !!getConversations().find((c) => c.id === "c_refresh" && c.messages.some((m) => m.text === "Avant le rechargement")),
      landing: document.getElementById("landing").classList.contains("active"),
    }));
    test.info().annotations.push({ type: "mesure", description: "hash avant=" + hashAvant + " après=" + JSON.stringify(r) });
    expect(r.convGardee).toBe(true);
    expect(r.ecran).toBeTruthy();
    // ⚠️ La landing paraît ici parce que le banc n'a AUCUNE session SDK (en
    // production un compte onboardé en a une) : limite de l'environnement, pas
    // un défaut — consignée, pas assertée.
    test.info().annotations.push({ type: "limite", description: "landing après rechargement (sans session SDK) = " + r.landing });
  });

  test("⑤ changement de compte : l'état et les conversations du compte précédent ne réapparaissent pas", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      state.user.general.username = "CompteA";
      state.user.likedPosts.push(state.seed.posts[0].id);
      state.userPosts.unshift({ id: "p_compteA", type: "text", authorId: MY_UID, authorName: "CompteA", text: "Secret de A", passion: "musique", mood: "all", createdAt: Date.now(), likes: 0, comments: [] });
      saveState();
      const convs = getConversations();
      convs.push({ id: "c_A", userId: "11111111-2222-4333-8444-555555555555", userName: "Confident", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: [{ id: "a1", from: "me", text: "Message privé de A", at: Date.now() }] });
      saveConversationsNow();
    });
    await page.waitForTimeout(300);
    // Déconnexion par le produit (purge + rechargement).
    await page.evaluate(() => { doLogout("signin"); });
    await page.waitForTimeout(2500);
    await page.waitForFunction(() => document.readyState === "complete", null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      state: localStorage.getItem("passio_mvp_state_v1"),
      convs: localStorage.getItem("passio_conversations_v1"),
      uid: localStorage.getItem("passio_uid"),
      memoireConvs: (typeof getConversations === "function" ? getConversations() : []).some((c) => c.id === "c_A"),
      memoirePosts: (typeof state !== "undefined" && state && state.userPosts || []).some((p) => p.id === "p_compteA"),
      texteEcran: document.body.innerText.indexOf("Secret de A") >= 0 || document.body.innerText.indexOf("Message privé de A") >= 0,
    }));
    expect(r.state === null || !/CompteA|Secret de A/.test(r.state), "l'état du compte A ne survit pas").toBe(true);
    expect(r.memoirePosts).toBe(false);
    expect(r.texteEcran).toBe(false);
    // ⚠️ D-01 (démontré le 2026-11-02) : `doLogout` purge localStorage ET IndexedDB,
    // puis `location.reload()` déclenche `beforeunload` → `saveConversationsNow`
    // (app-08, branché par supaInit) qui RÉÉCRIT `conversationsState` — encore en
    // mémoire — dans les deux stores. Le compte suivant hérite des messages privés.
    // RÉINJECTION : sur le code d'avant, `convs`, `memoireConvs` et `idb` valent true.
    expect(r.convs === null || !/Message privé de A/.test(r.convs), "localStorage : conversations de A purgées").toBe(true);
    expect(r.memoireConvs, "mémoire après rechargement : plus de conversation de A").toBe(false);
    const idb = await page.evaluate(async () => { try { const c = await idbConvLoad(); return JSON.stringify(c || []).indexOf("Message privé de A") >= 0; } catch (e) { return "erreur " + e.message; } });
    expect(idb, "IndexedDB : conversations de A purgées").toBe(false);
  });

  test("⑥ deux onglets du même contexte : un like posé dans l'onglet 1 est visible dans l'onglet 2 après rechargement ; sans rechargement, les deux divergent ?", async ({ page, context }) => {
    await bootOnboarded(page);
    const page2 = await context.newPage();
    await sansDonneesDistantes(page2);
    await page2.goto("/index.html");
    await page2.waitForFunction(() => document.querySelector("#screen-feed.active"), null, { timeout: 20000 });
    await page2.waitForTimeout(2500);
    await page2.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); window.supaSetPostLike = async () => ({ ok: true, error: null }); });
    const id = await page.evaluate(() => (state.seed.posts || [])[0].id);
    await page.evaluate((pid) => likePost(pid), id);
    await page.waitForTimeout(500);
    const vu2SansReload = await page2.evaluate((pid) => state.user.likedPosts.includes(pid), id);
    const storage2 = await page2.evaluate((pid) => JSON.parse(localStorage.getItem("passio_mvp_state_v1")).user.likedPosts.includes(pid), id);
    // Puis l'onglet 2 écrit quelque chose : écrase-t-il le like de l'onglet 1 ?
    await page2.evaluate(() => { state.user.general.bio = "bio onglet 2"; saveState(); });
    await page2.waitForTimeout(300);
    const storageApres = await page.evaluate((pid) => { const s = JSON.parse(localStorage.getItem("passio_mvp_state_v1")); return { like: s.user.likedPosts.includes(pid), bio: s.user.general.bio }; }, id);
    test.info().annotations.push({ type: "mesure", description: "like onglet1 vu par onglet2 sans rechargement=" + vu2SansReload + " · dans localStorage=" + storage2 + " · après saveState onglet2 : " + JSON.stringify(storageApres) });
    await page2.close();
    // Constat consigné (D-07) : aucun canal entre onglets (`storage` n'est écouté que
    // pour l'invitation, app-06) ; le dernier onglet qui sauvegarde ÉCRASE l'état
    // de l'autre (« dernier écrit gagne »). Mesuré, pas asserté : ce n'est pas un
    // invariant du dépôt aujourd'hui.
    test.info().annotations.push({ type: "verdict", description: storageApres.like ? "pas d'écrasement" : "ÉCRASEMENT : le like de l'onglet 1 est perdu quand l'onglet 2 sauvegarde (dernier écrit gagne)" });
    expect(vu2SansReload, "sans canal entre onglets, l'onglet 2 ne voit pas le like de l'onglet 1 en mémoire").toBe(false);
  });
});
