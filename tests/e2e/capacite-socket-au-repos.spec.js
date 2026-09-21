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
    window.__pushAbonnements = 0; window.ensureCallPushSubscription = () => { __pushAbonnements++; };
    window._pushAbonnementTente = false;
    // Les appels sont désactivés pour le pilote ; on fige la variable et on
    // simule un canal de sonnerie posé, pour mesurer sa remise à zéro au repos.
    window.appelsDisponibles = () => false;
    window._callIncoming = null; window._openEventDetailId = null;
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
    if (!opts.visiteur) { window._callRingChan = supa.channel("ring:" + MY_UID); }
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
  expect(s.ouverts).toEqual(["realtime", "ring", "user"]);
  expect(s.abonne).toBe(true);
  // Étalon : ce que les gestionnaires `visibilitychange` du PRODUIT relancent
  // à eux seuls sur un retour SANS repos (masqué 10 s) — le réveil du socket ne
  // doit rien y ajouter pour le fil et les lives.
  await masquer(page, true); await passer(page, 10000); await masquer(page, false);
  const etalon = await page.evaluate(() => { const e = { ...__rattrapages }; window.__rattrapages = {}; return e; });
  expect(etalon.conversations).toBeUndefined();
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
  expect(s.deconnexions).toBe(1); expect(s.canaux).toBe(3);
  await masquer(page, false);
  s = await etat(page);
  expect(s.endormi).toBe(false); expect(s.abonne).toBe(true);
  expect(s.ouverts).toEqual(["realtime", "user"]); expect(s.canaux).toBe(5); // ring: relâché et non recréé (appels désactivés)
  // Le fil et les lives sont relus par les gestionnaires `visibilitychange` du
  // produit ; le réveil du socket ne les double pas. Mesuré EXACTEMENT : deux
  // gestionnaires d'app-08 pour le fil (badge et filet), zéro pour les lives
  // (le stub remplace `supaRefreshVideoLives`, app-05 passe par `vliveRefreshCoalesce`).
  expect(s.rattrapages.fil).toBe(etalon.fil);
  expect(s.rattrapages.lives).toBe(etalon.lives);
  expect([s.rattrapages.conversations, s.rattrapages.conversation_ouverte, s.rattrapages.notifications]).toEqual([1, 1, 1]);
  expect(await page.evaluate(() => __pushAbonnements)).toBe(1); // une fois par session, pas une par réveil
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
  expect(s.rattrapages.fil).toBe(1); expect(s.rattrapages.lives).toBe(1); // par geste, seul le réveil du socket relance fil et lives
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

test("pendant le repos, un rafraîchissement de jeton ne rouvre rien ; le filet du fil sait que le socket dort", async ({ page }) => {
  await preparer(page);
  await masquer(page, true); await passer(page, 4 * 60000);
  expect((await etat(page)).endormi).toBe(true);
  const r = await page.evaluate(() => {
    const avant = __canaux.length;
    supaSubscribe(); _subscribeUserTopic(); // ce que fait onAuthStateChange sur TOKEN_REFRESHED
    return { canauxCrees: __canaux.length - avant, abonne: !!window._supaSubscribed, endormi: _rtRepos.endormi };
  });
  expect(r).toEqual({ canauxCrees: 0, abonne: false, endormi: true });
  await passer(page, 60000);
  expect((await etat(page)).endormi).toBe(true);
  // Visible et immobile 15 min sur le fil : le filet devient le seul chemin, comme pour un visiteur.
  await masquer(page, false);
  await page.evaluate(() => { goTo("feed"); });
  expect(await page.evaluate(() => filetEstLeSeulChemin())).toBe(false);
  await passer(page, 16 * 60000);
  expect(await page.evaluate(() => [_rtRepos.endormi, filetEstLeSeulChemin()])).toEqual([true, true]);
  await page.evaluate(() => document.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(await page.evaluate(() => [_rtRepos.endormi, filetEstLeSeulChemin()])).toEqual([false, false]);
});

test("un appel (même sonnant) ou un live en cours n'est jamais coupé ; un visiteur n'a rien à endormir", async ({ page }) => {
  await preparer(page);
  await page.evaluate(() => { window._callIncoming = { id: "c0" }; });
  await masquer(page, true); await passer(page, 5 * 60000);
  expect((await etat(page)).endormi).toBe(false);
  await page.evaluate(() => { window._callIncoming = null; window._call = { id: "c1", status: "in_call" }; });
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
});

test("un visiteur n'a aucun canal, aucun socket, rien à endormir", async ({ page }) => {
  await preparer(page, { visiteur: true });
  let s = await etat(page);
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
  expect(endormir).toContain("if (window._call || window._callIncoming || window._vliveHost || window._vliveView) return;");
  expect(endormir).toContain("window._callRingChan = null;");
  const subscribe = src.slice(src.indexOf("function supaSubscribe()"), src.indexOf("function _rtReposEtat("));
  expect(subscribe).toContain("if (window._rtRepos && window._rtRepos.endormi) {");
  const rattraper = src.slice(src.indexOf("function _rtRattraper("), src.indexOf("window._rtEndormir = _rtEndormir;"));
  expect(rattraper).toContain("await _rafraichirConversationsServeur({ fusion: true });");
  expect(rattraper.indexOf("_rafraichirConversationsServeur")).toBeLessThan(rattraper.indexOf("_rattraperConversationOuverte"));
  const reveiller = src.slice(src.indexOf("function _rtReveiller("), src.indexOf("function _rtRattraper("));
  expect(reveiller).toContain("supaSubscribe();");
  expect(reveiller).not.toContain("supa.channel(");
  expect(src.slice(src.indexOf("function supaSubscribe()"), src.indexOf("function _rtReposEtat("))).toContain("_rtReposArmer();");
  const app02 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-02-state-utils.js"), "utf8");
  expect(app02.split("function socketTempsReelAuRepos(").length).toBe(2);
});

test("rattrapage de la messagerie au réveil : la liste FUSIONNE sans écraser la conversation ouverte, qui est marquée lue", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b"; window.MY_UID = MY_UID; window._supaReal = true;
    const partenaire = "20762060-78c4-40b9-ad2a-ee7c1cb19857";
    const conv = { id: "conv_r", userId: partenaire, userName: "Camille", isGroup: false, lastAt: 1000, unread: 0, draft: "brouillon en cours", _convPage: 2, _otherReadAt: 500,
      messages: [{ id: "m1", from: partenaire, text: "salut", at: 900 }, { id: "m2", from: "me", text: "coucou", at: 1000 }, { from: "me", text: "en cours d'envoi", at: 1001, status: "sending" }] };
    conversationsState = [conv]; saveConversations();
    window._openedConvId = "conv_r";
    // Le serveur : la liste ne porte que le dernier message et 2 non-lus ; le fil complet porte deux nouveaux messages de l'autre.
    window.supaLoadMyConversations = async () => [{ id: "conv_r", userId: partenaire, userName: "Camille B.", isGroup: false, lastAt: 3000, unread: 2, messages: [{ id: "m4", from: partenaire, text: "deuxième", at: 3000 }] }];
    window._filtrerConvsServeur = (x) => x;
    window.supaLoadMessages = async () => [{ id: "m1", from: partenaire, text: "salut", at: 900 }, { id: "m2", from: "me", text: "coucou", at: 1000 }, { id: "m3", from: partenaire, text: "premier", at: 2000 }, { id: "m4", from: partenaire, text: "deuxième", at: 3000 }];
    window.convTombLoad = () => ({}); window._msgMasquePourMoi = () => false;
    window.__lus = []; window.supaMarkRead = async (id) => { __lus.push(id); }; window.__accuses = []; window.supaLoadOtherRead = async (id) => { __accuses.push(id); };
    window.renderConvFpThread = () => {}; window.renderMessages = () => {}; window.renderMsgBadge = () => {};
    await _rafraichirConversationsServeur({ fusion: true });
    const apresListe = getConversations().find(c => c.id === "conv_r");
    const memeObjet = apresListe === conv;
    const listeMessages = (apresListe.messages || []).map(m => m.id || m.text);
    await _rattraperConversationOuverte();
    const c = getConversations().find(x => x.id === "conv_r");
    return { memeObjet, listeMessages, apres: { messages: c.messages.map(m => m.id || m.text), draft: c.draft, page: c._convPage, unread: c.unread, nom: c.userName, lastAt: c.lastAt }, lus: __lus, accuses: __accuses };
  });
  expect(r.memeObjet).toBe(true);
  expect(r.listeMessages).toEqual(["m1", "m2", "en cours d'envoi", "m4"]);
  expect(r.apres).toEqual({ messages: ["m1", "m2", "en cours d'envoi", "m3", "m4"], draft: "brouillon en cours", page: 2, unread: 0, nom: "Camille B.", lastAt: 3000 });
  expect(r.lus).toEqual(["conv_r"]);
  expect(r.accuses).toEqual(["conv_r"]);
});
