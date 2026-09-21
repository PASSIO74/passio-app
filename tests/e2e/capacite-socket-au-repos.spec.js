const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET AU REPOS : UN COMPTE QUI NE REGARDE PAS NE TIENT PAS DE CONNEXION (2026-09-21)
//
// Vrai câblage du produit (`supaSubscribe`, `_rtReposTick`, `_rtEndormir`,
// `_rtReveiller`, app-08), horloge navigateur figée, SDK simulé qui compte ses
// canaux, son `removeAllChannels` et son `realtime.disconnect`. Aucune donnée
// distante. Ce que ce banc prouve :
//   · la politique est PURE et bornée (3 min masqué ; 15 min sans geste visible,
//     sauf conversation ouverte ; jamais pendant un appel ou un live) ;
//   · masqué 3 min → tous les canaux relâchés, socket fermé, gardes relâchées ;
//   · retour au premier plan / geste / réseau → mêmes canaux rejoints et
//     rattrapage (fil, conversations, conversation ouverte, notifications,
//     lives), une mesure `rt_repos` sans identifiant ;
//   · un visiteur n'a rien à endormir ; un appel en cours n'est jamais coupé.
// ═══════════════════════════════════════════════════════════════════════════

async function preparer(page, opts = {}) {
  await bootOnboarded(page);
  await page.clock.install();
  await page.evaluate((opts) => {
    stopFeedRefreshLoop(); stopPostLikeRefresh();
    MY_UID = opts.visiteur ? "u_visiteur_123" : "812aee2b-214f-4949-931e-842599b6d68b"; window.MY_UID = MY_UID;
    window._supaReal = true;
    window._rechargementImminent = false;
    window._supaSubscribed = false; window._userTopicChan = null; window._callRingChan = null; window._dbChan = null; window._call = null;
    window._vliveHost = null; window._vliveView = null; window._openedConvId = null;
    window._rtRepos = { endormi: false, masqueeDepuis: 0, dernierGeste: 0, endormiDepuis: 0, raison: null, cycles: 0, reveils: 0, timer: null, arme: false };
    window.__canaux = []; window.__fermes = 0; window.__deconnexions = 0; window.__rattrapages = {}; window.__mesures = [];
    window.tel = { action: (nom, meta) => __mesures.push({ nom, meta }), recv: () => {}, flowStart: () => null };
    const compter = (nom) => { __rattrapages[nom] = (__rattrapages[nom] || 0) + 1; };
    window.feedFiletReveiller = () => compter("fil");
    window._rafraichirConversationsServeur = async () => compter("conversations");
    window._rattraperConversationOuverte = async () => compter("conversation_ouverte");
    window.supaLoadNotifications = async () => { compter("notifications"); return []; };
    window.supaRefreshVideoLives = () => { compter("lives"); return false; };
    window.ensureCallPushSubscription = () => {};
    supa.channel = (topic) => {
      const ch = { topic, ferme: false, on() { return ch; }, subscribe() { return ch; }, send: async () => "ok", unsubscribe: async () => { ch.ferme = true; return "ok"; } };
      __canaux.push(ch); return ch;
    };
    supa.removeAllChannels = async () => { __fermes++; __canaux.forEach(c => { c.ferme = true; }); return []; };
    supa.removeChannel = async () => "ok";
    supa.realtime = { disconnect: () => { __deconnexions++; }, connect: () => {}, isConnected: () => false };
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__cache });
    window.__cache = false;
    supaSubscribe();
  }, opts);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 50)));
}
const etat = (page) => page.evaluate(() => ({
  endormi: _rtRepos.endormi, raison: _rtRepos.raison, abonne: !!window._supaSubscribed, canaux: __canaux.length,
  ouverts: __canaux.filter(c => !c.ferme).map(c => c.topic.split(":")[0]).sort(), fermes: __fermes, deconnexions: __deconnexions,
  rattrapages: __rattrapages, mesures: __mesures.filter(m => m.nom === "rt_repos"),
}));
async function masquer(page, cache) {
  await page.evaluate((c) => { window.__cache = c; document.dispatchEvent(new Event("visibilitychange")); }, cache);
}
async function passer(page, ms) { await page.clock.fastForward(ms); await page.evaluate(() => Promise.resolve()); }

test("la politique est pure et bornée : 3 min masqué, 15 min sans geste sauf conversation ouverte, jamais en appel ou en live", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const f = socketTempsReelAuRepos;
    return [
      f({ visible: false, masqueeDepuisMs: 180000, inactifDepuisMs: 0 }),
      f({ visible: false, masqueeDepuisMs: 179999, inactifDepuisMs: 0 }),
      f({ visible: true, masqueeDepuisMs: 0, inactifDepuisMs: 900000 }),
      f({ visible: true, masqueeDepuisMs: 0, inactifDepuisMs: 899999 }),
      f({ visible: true, masqueeDepuisMs: 0, inactifDepuisMs: 900000, conversationOuverte: true }),
      f({ visible: false, masqueeDepuisMs: 900000, conversationOuverte: true }),
      f({ visible: false, masqueeDepuisMs: 900000, appelEnCours: true }),
      f({ visible: false, masqueeDepuisMs: 900000, liveEnCours: true }),
      f(null), f({}), f({ visible: true, masqueeDepuisMs: "x", inactifDepuisMs: NaN }),
      REPOS_TEMPS_REEL_MASQUE_MS, REPOS_TEMPS_REEL_INACTIF_MS,
    ];
  });
  expect(r).toEqual([true, false, true, false, false, true, false, false, false, false, false, 180000, 900000]);
});

test("masqué 3 min : canaux relâchés, socket fermé, gardes relâchées ; retour : mêmes canaux rejoints et rattrapage mesuré", async ({ page }) => {
  await preparer(page);
  let s = await etat(page);
  expect(s.ouverts).toEqual(["realtime", "user"]); // pas de ring: : appels désactivés pour le pilote (ASTRA-60)
  expect(s.abonne).toBe(true);
  await masquer(page, true);
  await passer(page, 150000); // 2 min 30 : pas encore
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.deconnexions).toBe(0);
  await passer(page, 60000); // 3 min 30 : le tick de 30 s a vu le seuil
  s = await etat(page);
  expect(s.endormi).toBe(true); expect(s.raison).toBe("masque");
  expect(s.abonne).toBe(false); expect(s.fermes).toBe(1); expect(s.deconnexions).toBe(1);
  expect(s.ouverts).toEqual([]);
  expect(await page.evaluate(() => [window._dbChan, window._userTopicChan, window._callRingChan])).toEqual([null, null, null]);
  await passer(page, 600000); // 10 min de plus : rien ne se rouvre tout seul
  s = await etat(page);
  expect(s.deconnexions).toBe(1); expect(s.canaux).toBe(2);
  await masquer(page, false);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.abonne).toBe(true);
  expect(s.ouverts).toEqual(["realtime", "user"]); expect(s.canaux).toBe(4);
  // Le fil est réveillé par les gestionnaires `visibilitychange` du produit (pas par le réveil du socket, qui ne le double pas).
  expect(s.rattrapages.fil).toBeGreaterThanOrEqual(1);
  expect([s.rattrapages.conversations, s.rattrapages.conversation_ouverte, s.rattrapages.notifications, s.rattrapages.lives]).toEqual([1, 1, 1, 1]);
  expect(s.mesures).toHaveLength(1);
  expect(s.mesures[0].meta.raison).toBe("masque"); expect(s.mesures[0].meta.reveil).toBe("retour");
  expect(s.mesures[0].meta.duree_ms).toBeGreaterThanOrEqual(600000);
  expect(Object.keys(s.mesures[0].meta).sort()).toEqual(["duree_ms", "raison", "reveil"]);
});

test("visible sans geste 15 min : au repos ; le premier geste rouvre ; une conversation ouverte garde le socket", async ({ page }) => {
  await preparer(page);
  await passer(page, 14 * 60000);
  expect((await etat(page)).endormi).toBe(false);
  await passer(page, 90000);
  let s = await etat(page);
  expect(s.endormi).toBe(true); expect(s.raison).toBe("inactif"); expect(s.deconnexions).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.ouverts).toEqual(["realtime", "user"]);
  expect(s.mesures[0].meta.reveil).toBe("geste");
  expect(s.rattrapages.fil).toBe(1); // par inactivité, seul le réveil du socket relance le fil
  // Conversation ouverte et visible : jamais par inactivité…
  await page.evaluate(() => { window._openedConvId = "conv_x"; window._subscribeTyping = (id) => { __rattrapages["typing:" + id] = 1; }; });
  await passer(page, 20 * 60000);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.deconnexions).toBe(1);
  // …mais bien par masquage, et le canal de frappe est repris au retour.
  await masquer(page, true); await passer(page, 4 * 60000);
  expect((await etat(page)).endormi).toBe(true);
  await masquer(page, false);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.rattrapages["typing:conv_x"]).toBe(1);
});

test("un appel ou un live en cours n'est jamais coupé ; un visiteur n'a rien à endormir", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => { window._call = { id: "c1", status: "in_call" }; });
  await masquer(page, true); await passer(page, 10 * 60000);
  let s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.deconnexions).toBe(0);
  await page.evaluate(() => { window._call = null; window._vliveView = { chan: {} }; });
  await passer(page, 5 * 60000);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.deconnexions).toBe(0);
  await page.evaluate(() => { window._vliveView = null; });
  await passer(page, 60000);
  expect((await etat(page)).endormi).toBe(true);
  // Visiteur : aucun canal, aucun socket, rien à endormir.
  await preparer(page, { visiteur: true });
  s = await etat(page);
  expect(s.canaux).toBe(0); expect(s.abonne).toBe(false);
  await masquer(page, true); await passer(page, 10 * 60000);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.deconnexions).toBe(0); expect(s.fermes).toBe(0);
});

test("câblage à la source : le réveil passe par supaSubscribe et sa garde, aucun nouveau site de création de canal", async () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");
  const endormir = src.slice(src.indexOf("function _rtEndormir("), src.indexOf("function _rtReveiller("));
  expect(endormir).toContain("window._supaSubscribed = false;");
  expect(endormir).toContain("supa.removeAllChannels()");
  expect(endormir).toContain("supa.realtime.disconnect()");
  expect(endormir).toContain("if (window._call || window._vliveHost || window._vliveView) return;");
  const reveiller = src.slice(src.indexOf("function _rtReveiller("), src.indexOf("function _rtRattraper("));
  expect(reveiller).toContain("supaSubscribe();");
  expect(reveiller).not.toContain("supa.channel(");
  expect(src.slice(src.indexOf("function supaSubscribe()"), src.indexOf("function _rtReposEtat("))).toContain("_rtReposArmer();");
  const app02 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
  expect(app02.split("function socketTempsReelAuRepos(").length).toBe(2);
});
