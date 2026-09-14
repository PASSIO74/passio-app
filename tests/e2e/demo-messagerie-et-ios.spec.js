// UXO-03 / UXO-01 — la messagerie de démonstration se dit et ne compte pas ;
// iPhone Safari n'a plus de mur d'installation automatique.
//
// LES DÉFAUTS (contre-revue Astra) : cinq conversations fictives rendues comme
// de vraies (pas d'étiquette, pastille « 3 » de non-lus, un message qu'on y
// écrivait partait vers un compte inexistant) ; sur iPhone Safari, le guide
// « Installer sur iPhone / iPad » recouvrait le fil de première visite 1,5 s
// après le chargement. Ce que cette suite exige : ① une conversation de
// démonstration porte « Exemple PASSIO » et aucune pastille (RÉINJECTION) ; ②
// l'onglet Messages ne compte que les non-lus réels (RÉINJECTION) ; ③ écrire
// dans une démo n'envoie rien et le dit (RÉINJECTION) ; ④ une vraie
// conversation garde sa pastille ; ⑤ iPhone Safari : aucun overlay automatique,
// la porte manuelle reste (RÉINJECTION).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((lea) => {
    window._supaReal = true; window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window._convNetLoaded = true;
    const convs = getConversations();
    // Une vraie conversation non lue, à côté de la démonstration (conv_lea, u_lea).
    convs.push({ id: "c_reel", userId: lea, userName: "Léa (vraie)", unread: 2, lastAt: Date.now(), messages: [{ id: "m1", from: lea, text: "coucou", at: Date.now() }], fromSupabase: true });
    const demo = convs.find((c) => c.id === "conv_lea"); if (demo) demo.unread = 3;
    saveConversationsNow(); goTo("messages"); renderMessages(); renderMsgBadge();
  }, UID_LEA);
}

test.describe("UXO-03 — messagerie de démonstration", () => {
  test("① une conversation de démonstration porte « Exemple PASSIO » et aucune pastille", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => { const card = document.querySelector('#messageList .msg-card[data-conv-demo="1"]') || [...document.querySelectorAll("#messageList .msg-card")].find((c) => /openConversation\('conv_lea'\)/.test(c.getAttribute("onclick") || "")); return { present: !!card, texte: card ? card.textContent : "", badge: card ? !!card.querySelector(".msg-badge") : null, classe: card ? card.className : "" }; });
    // RÉINJECTION : sur le code d'avant, aucune étiquette, pastille « 3 », classe unread.
    expect(r.present).toBe(true);
    expect(r.texte).toMatch(/Exemple PASSIO/);
    expect(r.badge).toBe(false);
    expect(r.classe).not.toMatch(/\bunread\b/);
  });

  test("② l'onglet Messages ne compte que les non-lus réels ; ④ la vraie conversation garde sa pastille", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(() => ({ nonLus: _convNonLus(), badge: (document.querySelector(".nav-msg-badge") || {}).textContent || "", titre: (renderTopbar(), document.title), notifs: unreadCount(),
      reel: !!([...document.querySelectorAll("#messageList .msg-card")].find((c) => /c_reel/.test(c.getAttribute("onclick") || "")) || {}).querySelector?.(".msg-badge") }));
    // RÉINJECTION : sur le code d'avant, _convNonLus n'existe pas et la pastille dit 5 (3 démo + 2 réels).
    expect(r.nonLus).toBe(2);
    expect(r.badge).toBe("2");
    expect(r.titre).toBe("(" + (r.notifs + 2) + ") PASSIO"); // 3 non-lus de démo NON comptés (sinon +5)
  });

  test("③ écrire dans une démonstration n'envoie rien, et le dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__envois = 0; window._sendTextToSupa = () => { window.__envois++; };
      await openConversation("conv_lea");
      const inp = document.getElementById("convFpInput"); inp.value = "bonjour démo";
      const avant = (getConversations().find((c) => c.id === "conv_lea").messages || []).length;
      sendMessageFp("conv_lea", "Léa");
      return { envois: window.__envois, ajoutes: (getConversations().find((c) => c.id === "conv_lea").messages || []).length - avant, toasts: window.__toasts.slice() };
    });
    // RÉINJECTION : sur le code d'avant, un message local est ajouté et part vers u_lea.
    expect(r.envois).toBe(0);
    expect(r.ajoutes).toBe(0);
    expect(r.toasts.some((t) => /démonstration/.test(t))).toBe(true);
  });
});

test.describe("UXO-01 — iPhone Safari", () => {
  test("⑤ aucun mur d'installation automatique ; la porte manuelle reste", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.route(/supabase\.co/, (route) => route.abort());
    await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const ov = document.getElementById("pwa-overlay"); return { visible: !!(ov && ov.style.display === "flex"), ios: !!window._isIOSSafari || /iPhone/.test(navigator.userAgent) }; });
    // RÉINJECTION : sur le code d'avant, l'overlay est affiché 1,5 s après le chargement.
    expect(r.ios).toBe(true);
    expect(r.visible).toBe(false);
    // La porte manuelle : pwaInstall() ouvre le guide.
    // La porte manuelle : pwaInstall() ouvre le guide (le helper de boot avait fermé l'overlay pour la session).
    expect(await page.evaluate(() => { sessionStorage.removeItem("passio_pwa_dismissed"); pwaInstall(); const ov = document.getElementById("pwa-overlay"); return !!(ov && ov.style.display === "flex"); })).toBe(true);
    // À la SOURCE (le helper de boot ferme l'overlay pour la session, donc le
    // comportement seul ne distingue pas avant/après) : platform.js ne planifie
    // plus aucun pwaShowOverlay automatique.
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "js", "platform.js"), "utf8");
    // RÉINJECTION : sur le code d'avant, `setTimeout(function() { … pwaShowOverlay() … }, 1500)` sous `if (_isIOSSafari)`.
    expect((src.match(/pwaShowOverlay/g) || []).length, "aucun appel automatique dans platform.js").toBe(0);
    await ctx.close();
  });
});
