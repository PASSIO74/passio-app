// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D — ÉTATS DÉGRADÉS ET DOUBLES SOUMISSIONS
//
// Le VRAI client Supabase (SDK 2.116) parle à un faux serveur posé par
// `page.route` sur `/rest/v1/**`, `/auth/v1/**`, `/storage/v1/**` : 500,
// latence longue, coupure réseau, réponses dans le désordre. Ce qu'on mesure,
// c'est le CONTRAT D'INTERFACE : l'affichage optimiste est-il annulé sur un
// échec réel ? un message compréhensible paraît-il ? le bouton reste-t-il
// bloqué ? l'état local (`passio_mvp_state_v1`) dit-il la vérité après coup ?
// Et sur un double clic très rapide : combien de requêtes partent, et dans
// quel état finit-on ?
//
// Compte : un uuid de banc dans `passio_uid` + un jeton SDK de la forme d'une
// vraie session (même forme que `ecritures-identite-compte.spec.js`), sans
// quoi `_uidEstUnCompte()` rend faux et aucune écriture ne part.
// `sansIsolationDesDonnees` : ce banc tient TOUT le réseau Supabase lui-même ;
// aucune requête n'atteint la production (route attrape-tout en tête).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

const UID = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const AUTRE = "88881111-2222-4333-8444-555566667777";
const POST_AUTRUI = "p_audit_autrui_1";
const EVENT_ID = "ev_audit_1";

// Faux serveur : tout `supabase.co` passe par ici. `plan` décide par table.
function fauxServeur(page, plan) {
  const journal = [];
  const reponse = (route, status, body, headers) => route.fulfill({
    status, contentType: "application/json", body: JSON.stringify(body === undefined ? [] : body),
    headers: Object.assign({ "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, headers || {}),
  });
  page.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = req.method();
    const table = (url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/) || [])[2] || url.pathname;
    const entree = { t: Date.now(), m, table, path: url.pathname, body: req.postData() || "" };
    journal.push(entree);
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    // Le WebSocket est coupé par routeWebSocket ; `/auth/v1` : session valide.
    if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname.endsWith("/user")) return reponse(route, 200, { id: UID, aud: "authenticated", role: "authenticated", email: "banc@passio-e2e.test" });
      return reponse(route, 200, {});
    }
    const regle = plan.regle ? plan.regle(entree, journal) : null;
    if (regle) {
      if (regle.abort) return route.abort("failed");
      if (regle.delai) await new Promise((r) => setTimeout(r, regle.delai));
      if (regle.apres) await regle.apres;
      return reponse(route, regle.status || 200, regle.body === undefined ? (m === "GET" ? [] : null) : regle.body);
    }
    // Défaut : lecture vide, écriture acceptée (201 avec l'écho du corps).
    if (m === "GET" || m === "HEAD") return reponse(route, 200, []);
    // Comme PostgREST : un UPDATE sur une ligne absente touche 0 ligne (`[]`),
    // et le produit enchaîne sur l'INSERT — c'est le chemin réel du RSVP.
    if (m === "PATCH" && table === "event_attendees" && !journal.some((e) => e.m === "POST" && e.table === "event_attendees")) return reponse(route, 200, []);
    if (m === "POST" && /\/rpc\//.test(url.pathname)) return reponse(route, 200, []);
    let echo = null; try { echo = JSON.parse(req.postData() || "null"); } catch (e) {}
    const corps = Array.isArray(echo) ? echo : (echo ? [echo] : []);
    return reponse(route, m === "POST" ? 201 : 200, corps);
  });
  return journal;
}

async function banc(page, plan = {}) {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  const journal = fauxServeur(page, plan);
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID);
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 1, { sansIsolationDesDonnees: true });
  // Jeton SDK de la forme d'une vraie session, posé APRÈS le boot (un jeton
  // posé avant est purgé par `purgerJetonAuthLocal`, cf. ecritures-identite-compte).
  await page.evaluate((u) => {
    const ref = (String((window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.url) || "").match(/https?:\/\/([^.]+)\./) || [])[1];
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: u, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 }) + ".banc";
    localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({ access_token: jwt, refresh_token: "banc", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: u } }));
  }, UID);
  // Les neutralisations de bootOnboarded sont RETIRÉES : on veut les vrais chemins
  // d'écriture (le réseau est tenu par la route, rien n'atteint la production).
  await page.evaluate(() => {
    // Journal des toasts : ils vivent 3 s, une lecture tardive les manquerait.
    window.__toasts = [];
    const _toast = window.toast;
    window.toast = function (msg, type, onClick) { window.__toasts.push({ t: Date.now(), msg: String(msg), type: type || "info" }); return _toast.apply(this, arguments); };
    window.supaPublishPostWithRetry = window.__vraiSupa.publishPost;
    window.supaAddComment = window.__vraiSupa.addComment;
    window.supaInsertNotif = async () => null;
    window.supaUpsertProfile = async () => {};
    window.supaTrack = async () => null;
    // `supaSetPostLike` a été remplacé par un stub : on recharge la vraie
    // définition depuis le source de l'application (fonction globale d'app-03).
    delete window.supaSetPostLike;
  });
  // La vraie `supaSetPostLike` est une déclaration de script : la supprimer de
  // window n'y touche pas si elle est non configurable → on la ré-injecte.
  const src = await page.evaluate(async () => { const r = await fetch("js/app-03-posts-vlogs.js"); return r.text(); });
  const debut = src.indexOf("async function supaSetPostLike(");
  const fin = src.indexOf("\nfunction likePost(");
  await page.evaluate((code) => { (0, eval)(code.replace("async function supaSetPostLike(", "window.supaSetPostLike = async function(")); }, src.slice(debut, fin));
  // Un post d'AUTRUI (serveur) dans le fil, un événement d'autrui dans Rencontrer.
  await page.evaluate(([pid, eid, autre]) => {
    state.supabasePosts = [{ id: pid, authorId: autre, authorName: "Camille", authorEmoji: "🎨", authorColor: "#7c3aed", passion: "musique", mood: "all", type: "text", text: "Publication de Camille pour l'audit", createdAt: Date.now() - 60000, timestamp: Date.now() - 60000, likes: 2, liked: false, comments: [], fromSupabase: true }];
    state.seed.events = state.seed.events || [];
    state.seed.events.unshift({ id: eid, title: "Jam d'audit", passion: "musique", date: Date.now() + 86400000, city: "Annecy", organizerId: autre, authorId: autre, attendees: [], maybes: [], waitlist: [], maxAttendees: 10, fromSupabase: true, description: "Un événement d'audit", lat: 45.9, lng: 6.12 });
    window._supaReal = true;
    saveState();
    goTo("feed"); renderFeed();
  }, [POST_AUTRUI, EVENT_ID, AUTRE]);
  await page.waitForTimeout(300);
  journal.length = 0;
  return { journal, errors };
}

const toasts = (page) => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
const etatLocal = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "{}"));
const compter = (journal, m, table) => journal.filter((e) => e.m === m && e.table === table).length;

test.describe("AUDIT D — états dégradés (faux serveur, SDK réel)", () => {
  test.setTimeout(90000);

  // ── LIKE ──────────────────────────────────────────────────────────────────
  test("like · 500 sur post_likes : l'optimiste est annulé, un toast le dit, l'état local ne garde pas le like", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "post_likes" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    // L'optimiste se lit DANS LE MÊME TOUR que le clic : le faux serveur répond
    // en quelques millisecondes, et l'annulation suit aussitôt.
    const pendant = await page.evaluate((pid) => { likePost(pid); return state.user.likedPosts.includes(pid); }, POST_AUTRUI);
    expect(pendant, "affichage optimiste immédiat").toBe(true);
    await page.waitForFunction((pid) => !state.user.likedPosts.includes(pid), POST_AUTRUI, { timeout: 8000 });
    const t = await toasts(page);
    expect(t.join(" | ")).toMatch(/j'aime n'a pas pu être enregistré/);
    const local = await etatLocal(page);
    expect((local.user.likedPosts || []).includes(POST_AUTRUI)).toBe(false);
    expect(compter(journal, "POST", "post_likes")).toBe(1);
    const coeur = await page.evaluate((pid) => { const b = document.querySelector('#feedList article.post[data-postid="' + pid + '"] .post-action[data-action="like"]'); return b ? b.textContent.trim() : null; }, POST_AUTRUI);
    expect(coeur, "le cœur du fil est repeint « non aimé »").toMatch(/🤍/);
  });

  test("like · double clic en 50 ms : une seule écriture part (anti double-clic 800 ms)", async ({ page }) => {
    const { journal } = await banc(page);
    await page.evaluate((pid) => { likePost(pid); setTimeout(() => likePost(pid), 50); }, POST_AUTRUI);
    await page.waitForTimeout(1200);
    expect(compter(journal, "POST", "post_likes") + compter(journal, "DELETE", "post_likes")).toBe(1);
    expect(await page.evaluate((pid) => state.user.likedPosts.includes(pid), POST_AUTRUI)).toBe(true);
  });

  test("like · coupure réseau : l'optimiste est annulé et le toast paraît", async ({ page }) => {
    await banc(page, { regle: (e) => (e.table === "post_likes") ? { abort: true } : null });
    await page.evaluate((pid) => likePost(pid), POST_AUTRUI);
    await page.waitForFunction((pid) => !state.user.likedPosts.includes(pid), POST_AUTRUI, { timeout: 8000 });
    expect((await toasts(page)).join(" | ")).toMatch(/n'a pas pu être enregistré/);
  });

  // ── RSVP ──────────────────────────────────────────────────────────────────
  test("RSVP · 500 sur event_attendees : l'inscription optimiste est annulée, message « non enregistrée »", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "event_attendees" && (e.m === "POST" || e.m === "PATCH")) ? { status: 500, body: { message: "boom" } } : null });
    await page.evaluate(() => { try { admissionLireStatut = async () => "off"; } catch (e) {} window._admissionStatut = "off"; });
    await page.evaluate((id) => { goTo("irl"); toggleJoinEvent(id); }, EVENT_ID);
    await page.waitForTimeout(1500);
    const rsvp = await page.evaluate((id) => myRsvp(id), EVENT_ID);
    expect(rsvp, "RSVP annulé après refus serveur").toBeFalsy();
    expect((await toasts(page)).join(" | ")).toMatch(/non enregistrée/);
    const local = await etatLocal(page);
    expect((local.user.joinedEvents || []).includes(EVENT_ID)).toBe(false);
    expect(compter(journal, "PATCH", "event_attendees") + compter(journal, "POST", "event_attendees")).toBeGreaterThanOrEqual(1);
  });

  test("RSVP · double clic : une inscription puis (peut-être) un retrait — l'état final est cohérent avec le nombre d'écritures", async ({ page }) => {
    const { journal } = await banc(page);
    await page.evaluate(() => { window._admissionStatut = "off"; });
    await page.evaluate((id) => { goTo("irl"); toggleJoinEvent(id); toggleJoinEvent(id); }, EVENT_ID);
    await page.waitForTimeout(1500);
    const rsvp = await page.evaluate((id) => myRsvp(id), EVENT_ID);
    const ecritures = journal.filter((e) => e.table === "event_attendees" && e.m !== "GET").map((e) => e.m);
    // Deux taps = deux intentions opposées : « going » puis retrait. Le produit
    // doit finir « non inscrit » ET avoir envoyé le retrait au serveur — ou
    // ignorer le second tap. Ce qui est interdit : « inscrit » à l'écran sans
    // ligne serveur, ou « non inscrit » avec une ligne restée en base.
    const inscritServeur = ecritures.includes("POST") && !ecritures.includes("DELETE");
    test.info().annotations.push({ type: "mesure", description: "rsvp final=" + rsvp + " ecritures=" + ecritures.join(",") });
    expect(!!rsvp === inscritServeur, "écran et serveur d'accord (rsvp=" + rsvp + ", écritures=" + ecritures.join(",") + ")").toBe(true);
  });

  // ── COMMENTAIRE ───────────────────────────────────────────────────────────
  test("commentaire · 500 : le commentaire reste visible avec « Non envoyé · Réessayer », pas de doublon", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "post_comments" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    await page.evaluate((pid) => openComments(pid), POST_AUTRUI);
    await page.waitForTimeout(300);
    await page.fill("#newComment", "Commentaire d'audit");
    await page.evaluate((pid) => submitComment(pid), POST_AUTRUI);
    await page.waitForTimeout(2500);
    const statut = await page.evaluate(() => { const s = document.querySelector("#commentsBox .cmt-status"); return s ? s.textContent.trim() : null; });
    expect(statut).toMatch(/Non envoyé/);
    // 1 envoi + au plus 1 rejeu automatique (file des commentaires, `_cmtObFlush`
    // 4 s après le boot puis toutes les 15 s) — jamais deux envois du même clic.
    const envois = compter(journal, "POST", "post_comments");
    expect(envois).toBeGreaterThanOrEqual(1);
    expect(envois).toBeLessThanOrEqual(2);
    const nb = await page.evaluate((pid) => (findPostAnywhere(pid).comments || []).length, POST_AUTRUI);
    expect(nb).toBe(1);
    const file = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_cmt_outbox_v1") || localStorage.getItem("passio_comment_outbox_v1") || "[]"));
    test.info().annotations.push({ type: "mesure", description: "envois=" + envois + " file=" + JSON.stringify(file).slice(0, 120) });
  });

  test("commentaire · double clic sur Publier : un seul commentaire, une seule écriture", async ({ page }) => {
    const { journal } = await banc(page);
    await page.evaluate((pid) => openComments(pid), POST_AUTRUI);
    await page.waitForTimeout(300);
    await page.fill("#newComment", "Double clic d'audit");
    const bouton = page.locator("#modalContent .btn.primary", { hasText: "Publier" });
    await bouton.dblclick();
    await page.waitForTimeout(2500);
    const nb = await page.evaluate((pid) => (findPostAnywhere(pid).comments || []).length, POST_AUTRUI);
    expect(nb, "un double clic ne publie pas deux commentaires").toBe(1);
    expect(compter(journal, "POST", "post_comments")).toBe(1);
  });

  // ── MESSAGE ───────────────────────────────────────────────────────────────
  async function ouvrirConv(page) {
    await page.evaluate((autre) => {
      const convs = getConversations();
      if (!convs.some((c) => c.id === "c_audit")) {
        convs.push({ id: "c_audit", userId: autre, userName: "Camille", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: [{ id: "m1", from: autre, text: "Salut", at: Date.now() - 3600000 }] });
        saveConversationsNow();
      }
      goTo("messages"); renderMessages(); openConversation("c_audit");
    }, AUTRE);
    await page.waitForTimeout(500);
  }

  test("message · 500 : le message reste à l'écran en échec avec « réessayer », une seule écriture, puis renvoi manuel = une seconde", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "conv_messages" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    await ouvrirConv(page);
    await page.fill("#convFpInput", "Message d'audit");
    await page.evaluate(() => sendMessageFp("c_audit", "Camille"));
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "c_audit"); const m = c.messages[c.messages.length - 1]; return { status: m.status, texte: m.text, indic: (document.querySelector("#convFpThread [data-msgst]") || {}).textContent }; });
    expect(st.status).toBe("failed");
    expect(st.indic || "").toMatch(/réessayer/);
    expect(compter(journal, "POST", "conv_messages")).toBe(1);
    // Hors-ligne persistant : la file porte l'entrée sous MON compte.
    const file = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]"));
    expect(file.length).toBe(1);
    expect(file[0].owner).toBe(UID);
  });

  test("message · double clic Envoyer : un seul message, une seule écriture", async ({ page }) => {
    const { journal } = await banc(page);
    await ouvrirConv(page);
    await page.fill("#convFpInput", "Double envoi");
    await page.locator("#convFpSendBtn").dblclick();
    await page.waitForTimeout(1500);
    const n = await page.evaluate(() => getConversations().find((x) => x.id === "c_audit").messages.filter((m) => m.from === "me").length);
    expect(n).toBe(1);
    expect(compter(journal, "POST", "conv_messages")).toBe(1);
  });

  test("message · latence 8 s : état « envoi… » visible pendant l'attente, puis « envoyé »", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "conv_messages" && e.m === "POST") ? { delai: 8000 } : null });
    await ouvrirConv(page);
    await page.fill("#convFpInput", "Message lent");
    await page.evaluate(() => sendMessageFp("c_audit", "Camille"));
    await page.waitForTimeout(500);
    const pendant = await page.evaluate(() => { const c = getConversations().find((x) => x.id === "c_audit"); return c.messages[c.messages.length - 1].status; });
    expect(pendant).toBe("sending");
    const indic = await page.evaluate(() => (document.querySelector("#convFpThread [data-msgst]") || {}).textContent || "");
    expect(indic).toMatch(/🕓/);
    await page.waitForFunction(() => { const c = getConversations().find((x) => x.id === "c_audit"); return c.messages[c.messages.length - 1].status === "sent"; }, null, { timeout: 15000 });
    expect(compter(journal, "POST", "conv_messages")).toBe(1);
  });

  // ── PUBLICATION ───────────────────────────────────────────────────────────
  test("publication · 500 sur posts : le post reste local « renvoi automatique », l'utilisateur est prévenu, le bouton se libère", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "posts" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    await page.evaluate(() => { goTo("studio"); studioType = "text"; document.getElementById("postText").value = "Publication d'audit en 500"; });
    await page.evaluate(() => publishPost());
    await page.waitForTimeout(6500);
    const post = await page.evaluate(() => state.userPosts[0]);
    expect(post.text).toBe("Publication d'audit en 500");
    expect(["offline", "syncing"]).toContain(post.syncStatus);
    const t = (await toasts(page)).join(" | ");
    // LOT-1 (audit UX/UI, CRE-C04) : le message nomme le cas vécu — renvoi
    // automatique (panne, hors ligne) ou envoi plus long que prévu.
    expect(t).toMatch(/partira automatiquement|s'affichera « En ligne »/);
    // Le toast « en cours » est retiré au verdict : il n'est plus À L'ÉCRAN.
    const aLEcran = await page.evaluate(() => Array.from(document.querySelectorAll("#toastStack .toast")).map((x) => x.textContent).join(" | "));
    expect(aLEcran).not.toMatch(/Publication en cours/);
    expect(await page.evaluate(() => _publishInProgress)).toBe(false);
    expect(compter(journal, "POST", "posts")).toBeGreaterThanOrEqual(1);
    const local = await etatLocal(page);
    expect(local.userPosts[0].text).toBe("Publication d'audit en 500");
  });

  test("publication · double clic Publier : un seul post, une seule écriture, verrou libéré", async ({ page }) => {
    const { journal } = await banc(page);
    await page.evaluate(() => { goTo("studio"); studioType = "text"; document.getElementById("postText").value = "Publication double clic"; });
    await page.evaluate(() => { publishPost(); publishPost(); });
    await page.waitForTimeout(1500);
    const n = await page.evaluate(() => state.userPosts.filter((p) => p.text === "Publication double clic").length);
    expect(n).toBe(1);
    expect(compter(journal, "POST", "posts")).toBe(1);
    expect((await toasts(page)).join(" | ")).toMatch(/Publication en cours/);
    await page.waitForFunction(() => _publishInProgress === false, null, { timeout: 10000 });
  });

  // ── SUIVRE ────────────────────────────────────────────────────────────────
  test("suivre · 500 sur follows : l'optimiste est annulé, « Impossible de suivre »", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "follows" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    await page.evaluate((autre) => {
      const b = document.createElement("button"); b.id = "followBtn_" + autre; b.setAttribute("data-follow-uid", autre); b.textContent = "Suivre"; document.body.appendChild(b);
      toggleFollowUser(autre, "Camille");
    }, AUTRE);
    await page.waitForFunction((autre) => !(state.user.following || []).includes(autre), AUTRE, { timeout: 8000 });
    expect((await toasts(page)).join(" | ")).toMatch(/Impossible de suivre/);
    expect(compter(journal, "POST", "follows")).toBe(1);
    const local = await etatLocal(page);
    expect((local.user.following || []).includes(AUTRE)).toBe(false);
  });

  test("suivre · double clic : le second tap est ignoré pendant l'écriture (une seule requête)", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "follows" && e.m === "POST") ? { delai: 600, body: [{ status: "accepted" }] } : null });
    await page.evaluate((autre) => {
      const b = document.createElement("button"); b.id = "followBtn_" + autre; b.setAttribute("data-follow-uid", autre); b.textContent = "Suivre"; document.body.appendChild(b);
      toggleFollowUser(autre, "Camille"); toggleFollowUser(autre, "Camille");
    }, AUTRE);
    await page.waitForTimeout(1500);
    expect(compter(journal, "POST", "follows") + compter(journal, "DELETE", "follows")).toBe(1);
    expect(await page.evaluate((autre) => (state.user.following || []).includes(autre), AUTRE)).toBe(true);
  });

  // ── FIL : chargement en 500 / latence / désordre ──────────────────────────
  test("fil · le serveur répond 500 au chargement : le fil local reste affiché, pas d'écran blanc, bandeau après 3 échecs", async ({ page }) => {
    await banc(page, { regle: (e) => (e.table === "posts" && e.m === "GET") ? { status: 500, body: { message: "boom" } } : null });
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) { try { await supaLoadPosts(); } catch (e) {} } });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      cartes: document.querySelectorAll("#feedList .post").length,
      bandeau: (document.getElementById("serveurBanner") || {}).style ? document.getElementById("serveurBanner").style.display : null,
      texte: (document.getElementById("serveurBanner") || {}).textContent || "",
    }));
    expect(r.cartes).toBeGreaterThan(0);
    expect(r.bandeau).not.toBe("none");
    expect(r.texte).toMatch(/Serveur indisponible/);
  });

  test("fil · réponses dans le DÉSORDRE (la 1re page répond après la 2e) : le fil garde la lecture la plus récente", async ({ page }) => {
    let premiere = null;
    const { journal } = await banc(page, {
      regle: (e, journal) => {
        if (e.table !== "posts" || e.m !== "GET") return null;
        const n = journal.filter((x) => x.table === "posts" && x.m === "GET").length;
        if (n === 1) { let lib; premiere = new Promise((r) => { lib = r; }); premiere.lib = lib; return { apres: premiere, body: [{ id: "p_vieux", author_id: AUTRE, passion_id: "musique", mood: "all", content: "ANCIENNE page", media_url: null, created_at: new Date(Date.now() - 3600000).toISOString(), is_reel: false, profiles: { username: "Camille", emoji: "🎨", color: "#7c3aed" } }] }; }
        if (n === 2) { setTimeout(() => premiere && premiere.lib && premiere.lib(), 400); return { body: [{ id: "p_neuf", author_id: AUTRE, passion_id: "musique", mood: "all", content: "NOUVELLE page", media_url: null, created_at: new Date().toISOString(), is_reel: false, profiles: { username: "Camille", emoji: "🎨", color: "#7c3aed" } }] }; }
        return null;
      },
    });
    // Deux « tirer pour rafraîchir » rapprochés : le chemin de production
    // (touchend, app-02) fait `supaLoadPosts().then(posts => state.supabasePosts = …)`
    // sans génération — on rejoue exactement ce geste deux fois.
    await page.evaluate(() => {
      const tirer = () => supaLoadPosts().then(function (posts) {
        if (posts && posts.length > 0) {
          var extra = (window._feedExtraPosts || []).filter(function (p) { return !posts.some(function (x) { return x.id === p.id; }); });
          state.supabasePosts = posts.concat(extra); renderFeed();
        }
      }).catch(function () {});
      tirer(); setTimeout(tirer, 60);
    });
    await page.waitForTimeout(3000);
    const ids = await page.evaluate(() => (state.supabasePosts || []).map((p) => p.id));
    test.info().annotations.push({ type: "mesure", description: "supabasePosts après désordre : " + ids.join(",") });
    // La réponse arrivée EN DERNIER (la plus ancienne) ne doit pas écraser la plus récente.
    expect(ids).toContain("p_neuf");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOT-1 (audit UX/UI du 2026-11-10) — CE QUE L'APPLICATION DIT SE VOIT, ET DIT VRAI
// Constats : TRA-C01 (toasts sous les superpositions : PAR-C03, IRL-C65,
// MSG-C85, BOB-C20), FIL-C06, MSG-C05, MSG-C57, CRE-C04. Chaque cas mesure
// le RÉSULTAT (élément au premier plan, état final des données), jamais le
// seul message.
// ═══════════════════════════════════════════════════════════════════════════
test.describe("LOT-1 — toasts visibles et verdicts vrais", () => {
  // Le toast est `pointer-events: none` : `elementFromPoint` l'ignore. On le
  // rend touchable LE TEMPS DE LA MESURE, et on fige son animation de sortie.
  async function toastAuPremierPlan(page, ouvrir) {
    return page.evaluate(async (code) => {
      (0, eval)(code);
      await new Promise((r) => setTimeout(r, 250));
      const t = toast("Message de contrôle LOT-1");
      t.style.animation = "none"; t.style.pointerEvents = "auto";
      const r = t.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { auPremierPlan: dessus === t || t.contains(dessus), dessus: dessus ? (dessus.id || String(dessus.className)) : null, haut: Math.round(r.top), hauteurFenetre: innerHeight };
    }, ouvrir);
  }

  test("① toast émis fenêtre ouverte : au premier plan, en haut de l'écran", async ({ page }) => {
    await banc(page);
    const m = await toastAuPremierPlan(page, "openModal('<div style=\"height:520px\">Fenêtre de contrôle</div>')");
    expect(m.auPremierPlan, "dessus : " + m.dessus).toBe(true);
    expect(m.haut).toBeLessThan(m.hauteurFenetre / 3);
  });

  test("② toast émis conversation ouverte : au premier plan, sans recouvrir la saisie", async ({ page }) => {
    await banc(page);
    const m = await toastAuPremierPlan(page, "document.getElementById('conv-fullpage').classList.add('active')");
    expect(m.auPremierPlan, "dessus : " + m.dessus).toBe(true);
    expect(m.haut).toBeLessThan(m.hauteurFenetre / 3);
  });

  test("② bis toast émis fiche d'activité ouverte : au premier plan, en haut (le pied fixe reste libre)", async ({ page }) => {
    await banc(page);
    const m = await toastAuPremierPlan(page, "openEventDetails('" + EVENT_ID + "')");
    expect(m.auPremierPlan, "dessus : " + m.dessus).toBe(true);
    expect(m.haut).toBeLessThan(m.hauteurFenetre / 3);
  });

  // ⚠️ La fiche d'activité reste dans le DOM, masquée (`display: none` en ligne) :
  // un sélecteur qui la visait sans condition montait la pile en haut en
  // permanence — défaut attrapé par ce cas pendant le lot.
  test("③ toast sans superposition : reste en bas, au-dessus de la barre d'onglets", async ({ page }) => {
    await banc(page);
    const m = await toastAuPremierPlan(page, "void 0");
    expect(m.auPremierPlan, "dessus : " + m.dessus).toBe(true);
    expect(m.haut).toBeGreaterThan(m.hauteurFenetre / 2);
  });

  async function avecMonCommentaire(page) {
    await page.evaluate(([pid, uid]) => {
      const p = state.supabasePosts.find((x) => x.id === pid);
      p.comments = [{ id: "c_lot1_a", authorId: uid, authorName: "Moi", text: "à supprimer", content: "à supprimer", createdAt: Date.now() - 5000, fromSupabase: true }];
      saveState();
    }, [POST_AUTRUI, UID]);
  }
  const resteCommentaire = (page) => page.evaluate((pid) => !!_findCommentThread(pid).comments.find((c) => c.id === "c_lot1_a"), POST_AUTRUI);

  test("④ suppression de commentaire REFUSÉE (500) : le commentaire revient, aucun « supprimé »", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "post_comments" && e.m === "DELETE") ? { status: 500, body: { message: "boom" } } : null });
    await avecMonCommentaire(page);
    await page.evaluate((pid) => deleteCommentEntry(pid, "c_lot1_a"), POST_AUTRUI);
    await page.waitForTimeout(1500);
    expect(compter(journal, "DELETE", "post_comments")).toBe(1);
    expect(await resteCommentaire(page), "le commentaire est remis à l'écran").toBe(true);
    const t = (await toasts(page)).join(" | ");
    expect(t).not.toMatch(/Commentaire supprimé/);
    expect(t).toMatch(/pas pu être supprimé/);
  });

  test("⑤ suppression de commentaire REFUSÉE par la RLS (0 ligne, ligne toujours là) : même verdict", async ({ page }) => {
    await banc(page, { regle: (e) => {
      if (e.table === "post_comments" && e.m === "DELETE") return { status: 200, body: [] };
      if (e.table === "post_comments" && e.m === "GET") return { status: 200, body: [{ id: "c_lot1_a" }] };
      return null;
    } });
    await avecMonCommentaire(page);
    await page.evaluate((pid) => deleteCommentEntry(pid, "c_lot1_a"), POST_AUTRUI);
    await page.waitForTimeout(1500);
    expect(await resteCommentaire(page)).toBe(true);
    expect((await toasts(page)).join(" | ")).not.toMatch(/Commentaire supprimé/);
  });

  test("⑥ suppression de commentaire ACCEPTÉE : « Commentaire supprimé », le commentaire ne revient pas", async ({ page }) => {
    await banc(page, { regle: (e) => (e.table === "post_comments" && e.m === "DELETE") ? { status: 200, body: [{ id: "c_lot1_a" }] } : null });
    await avecMonCommentaire(page);
    await page.evaluate((pid) => deleteCommentEntry(pid, "c_lot1_a"), POST_AUTRUI);
    await page.waitForTimeout(1500);
    expect(await resteCommentaire(page)).toBe(false);
    expect((await toasts(page)).join(" | ")).toMatch(/Commentaire supprimé/);
  });

  const GRP = "grp_lot1_0000";
  const MEMBRE = "99990000-1111-4222-8333-444455556666";
  async function avecGroupe(page) {
    await page.evaluate(([g, uid, autre]) => {
      const cs = getConversations();
      cs.unshift({ id: g, isGroup: true, groupName: "Groupe LOT-1", userIds: [uid, autre], userName: "Groupe LOT-1", userEmoji: "👥", userColor: "#8b5cf6", unread: 0, lastAt: Date.now(), messages: [] });
      conversationsState = cs; saveConversationsNow();
    }, [GRP, UID, AUTRE]);
  }
  const etatGroupe = (page) => page.evaluate(([g, m]) => { const c = getConversations().find((x) => x.id === g); return { membre: c.userIds.includes(m), rejoint: c.messages.some((x) => /a rejoint/.test(x.text || "")) }; }, [GRP, MEMBRE]);

  test("⑦ ajout d'un membre REFUSÉ par le serveur : pas membre, pas de « a rejoint », un échec dit", async ({ page }) => {
    const { journal } = await banc(page, { regle: (e) => (e.table === "conv_members" && e.m === "POST") ? { status: 403, body: { code: "42501", message: "new row violates row-level security policy" } } : null });
    await avecGroupe(page);
    await page.evaluate(([g, m]) => addGroupMember(g, m), [GRP, MEMBRE]);
    await page.waitForTimeout(1200);
    expect(compter(journal, "POST", "conv_members")).toBe(1);
    expect(await etatGroupe(page)).toEqual({ membre: false, rejoint: false });
    const t = (await toasts(page)).join(" | ");
    expect(t).not.toMatch(/ajouté·e au groupe/);
    expect(t).toMatch(/refusé l'ajout/);
  });

  test("⑧ ajout d'un membre ACCEPTÉ : membre, « a rejoint », succès annoncé APRÈS la réponse", async ({ page }) => {
    await banc(page, { regle: (e) => (e.table === "conv_members" && e.m === "POST") ? { status: 201, body: [{ user_id: MEMBRE }], delai: 600 } : null });
    await avecGroupe(page);
    // Sans `return` : `evaluate` attendrait la promesse de l'ajout, donc la réponse.
    await page.evaluate(([g, m]) => { addGroupMember(g, m); }, [GRP, MEMBRE]);
    await page.waitForTimeout(200);
    expect((await etatGroupe(page)).membre, "rien n'est annoncé avant la réponse").toBe(false);
    await page.waitForTimeout(1200);
    expect(await etatGroupe(page)).toEqual({ membre: true, rejoint: true });
  });

  test("⑨ GIF et position en panne (500) : en échec, jamais affichés envoyés, contenu gardé pour le renvoi", async ({ page }) => {
    await banc(page, { regle: (e) => (e.table === "conv_messages" && e.m === "POST") ? { status: 500, body: { message: "boom" } } : null });
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: 45.9, longitude: 6.12 });
    await page.evaluate((autre) => {
      const cs = getConversations();
      cs.unshift({ id: "c_lot1_gif", userId: autre, userName: "Camille", userEmoji: "🎨", userColor: "#8b5cf6", unread: 0, lastAt: Date.now(), messages: [], isGroup: false });
      conversationsState = cs; saveConversationsNow();
      openConversation("c_lot1_gif");
    }, AUTRE);
    await page.waitForTimeout(600);
    await page.evaluate(() => { _sendGif("https://media.klipy.com/lot1.gif"); shareLocation(); });
    // LOT-4 (MSG-C56) : la position ne part qu'après confirmation.
    await page.locator('#feuilleConfirmation [data-conf="envoyer"]').click();
    await page.waitForTimeout(4000);
    const etats = await page.evaluate(() => getConversations().find((x) => x.id === "c_lot1_gif").messages.map((m) => ({ gif: !!m.gif, status: m.status, envoi: !!m.envoi })));
    expect(etats.length).toBe(2);
    for (const e of etats) {
      expect(["sending", "failed"], JSON.stringify(e)).toContain(e.status);
      expect(e.envoi, "le contenu exact est gardé pour le renvoi").toBe(true);
    }
  });
});
