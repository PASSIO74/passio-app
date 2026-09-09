// Émulation Chromium (jamais un appareil réel) — audit « contenu », BILAN PASSIO 09/26.
// Aucune écriture Supabase : bootOnboarded neutralise publish/like/comment ; tout le
// reste est mesuré en mémoire. Serveur statique : http-server 8103 (lancé à part).
const path = require("path");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/playwright"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
const OUT = __dirname;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const R = {};
function log(k, v) { R[k] = v; console.log(k, JSON.stringify(v)); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8103", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 2);
  await page.evaluate(() => {
    window.__toasts = [];
    const vt = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vt.apply(this, arguments); } catch (e) {} };
    window.__pubCalls = [];
    window.supaPublishPostWithRetry = async (p) => { window.__pubCalls.push({ id: p.id, type: p.type, hasImage: !!p.image, createdAt: p.createdAt }); await new Promise(r => setTimeout(r, 400)); return true; };
    window.supaLoadPosts = async () => [];
    window.__likeCalls = 0;
    window.supaSetPostLike = async () => { window.__likeCalls++; return { ok: true, error: null }; };
    window.supaAddComment = async () => true;
    window.supaSaveUserState = async () => {};
    window.supaSaveUserStateBeacon = () => {};
    window.supaUpsertProfile = async () => {};
  });

  // ── 1. Publication texte + photo (chemin réel : #photoInput → studioType) ──
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(400);
  await page.fill("#postText", "Audit contenu 09/26 — post texte + photo (émulation).");
  await page.setInputFiles("#photoInput", { name: "audit.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await page.waitForFunction(() => photoDataUrl && studioType === "photo", null, { timeout: 8000 });
  await page.screenshot({ path: OUT + "/01-studio-photo.png" });
  // double clic « Publier »
  await page.evaluate(() => { publishPost(); publishPost(); });
  await page.waitForTimeout(1500);
  log("publish_double_clic", await page.evaluate(() => ({
    userPosts: state.userPosts.length, pubCalls: window.__pubCalls.length,
    toasts: window.__toasts.slice(), post: (function (p) { return p && { id: p.id, type: p.type, image: (p.image || "").slice(0, 30), syncStatus: p.syncStatus, passion: p.passion, createdAt: p.createdAt }; })(state.userPosts[0]),
  })));
  await page.waitForFunction(() => document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 5000 });
  await page.waitForTimeout(600);
  const pid = await page.evaluate(() => state.userPosts[0].id);
  log("feed_rendu", await page.evaluate((id) => {
    const a = document.querySelector('[data-postid="' + id + '"]');
    return { present: !!a, img: !!(a && a.querySelector("img")), meta: a ? a.querySelector(".post-author-meta").textContent.replace(/\s+/g, " ").trim() : null };
  }, pid));
  await page.screenshot({ path: OUT + "/02-feed-post-photo.png" });

  // ── 2. Like : double clic + compteur ──
  await page.evaluate((id) => { likePost(id); likePost(id); }, pid);
  await page.waitForTimeout(300);
  log("like_double_clic", await page.evaluate((id) => ({ liked: state.user.likedPosts.includes(id), likes: findPostAnywhere(id).likes, likeCalls: window.__likeCalls, btn: document.querySelector('[data-postid="' + id + '"] [data-action="like"]').textContent.trim() }), pid));

  // ── 3. Commentaire : vide, court, hostile ──
  await page.evaluate((id) => openComments(id), pid);
  await page.waitForTimeout(400);
  await page.fill("#newComment", " ");
  await page.evaluate((id) => submitComment(id), pid);
  const vide = await page.evaluate((id) => ({ n: findPostAnywhere(id).comments.length, toasts: window.__toasts.slice(-1) }), pid);
  await page.fill("#newComment", '<img src=x onerror="window.__xss=1"> <a href="javascript:alert(1)">x</a> https://media.giphy.com/media/abc/giphy.gif?x="onload="window.__xss2=1');
  await page.evaluate((id) => submitComment(id), pid);
  await page.waitForTimeout(400);
  log("commentaire", await page.evaluate(([id, vide]) => {
    const els = document.querySelectorAll("#commentsBox .comment-text");
    return { vide, n: findPostAnywhere(id).comments.length, xss: window.__xss || 0, xss2: window.__xss2 || 0,
      imgInjectees: document.querySelectorAll('#commentsBox img[src="x"]').length,
      html: Array.from(els).map(e => e.innerHTML.slice(0, 260)) };
  }, [pid, vide]));
  await page.screenshot({ path: OUT + "/03-commentaire-hostile.png" });
  // suppression de mon commentaire
  const cid = await page.evaluate((id) => findPostAnywhere(id).comments[0].id, pid);
  await page.evaluate(([id, c]) => deleteCommentEntry(id, c, true), [pid, cid]);
  log("commentaire_supprime", await page.evaluate((id) => findPostAnywhere(id).comments.length, pid));
  await page.evaluate(() => closeModal());

  // ── 4. Partage ──
  await page.evaluate((id) => sharePost(id), pid);
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/04-partage-post.png" });
  log("partage_modal", await page.evaluate(() => ({ btns: Array.from(document.querySelectorAll("#modalBox button, .modal button")).map(b => b.textContent.trim()).slice(0, 4) })));
  await page.evaluate(() => closeModal());
  log("partage_profil_url", await page.evaluate(() => { let u = null; const orig = window.partagerOuCopier; window.partagerOuCopier = (d) => { u = d.url; }; shareUserProfile("u_theo", "Théo"); window.partagerOuCopier = orig; return u; }));
  // le lien #user-… est-il routé ?
  await page.evaluate(() => { location.hash = "#user-u_theo"; });
  await page.waitForTimeout(1200);
  log("deep_link_user_route", await page.evaluate(() => ({ hash: location.hash, modalOuverte: !!document.querySelector(".modal-backdrop.active, #modalBackdrop.active"), visitedOpen: !!document.getElementById("visitedPassions"), ecran: document.querySelector(".screen.active") && document.querySelector(".screen.active").id })));
  await page.evaluate(() => { history.replaceState(null, "", location.pathname); });

  // ── 5. Suppression + retour au rafraîchissement ──
  await page.evaluate((id) => deletePost(id), pid);
  await page.waitForTimeout(400);
  log("suppression", await page.evaluate((id) => ({ dansUserPosts: state.userPosts.some(p => p.id === id), tombstone: (state.deletedPostIds || []).includes(id), dom: !!document.querySelector('[data-postid="' + id + '"]'), outbox: JSON.parse(localStorage.getItem("passio_post_delete_outbox_v1") || "[]").length }), pid));
  await page.screenshot({ path: OUT + "/05-apres-suppression.png" });

  // ── 6. Attaques média : image 0 octet, vidéo MIME menteur, vidéo texte ──
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(300);
  await page.setInputFiles("#photoInput", { name: "vide.png", mimeType: "image/png", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(800);
  log("image_0_octet", await page.evaluate(() => ({ photoDataUrl: !!photoDataUrl, toasts: window.__toasts.slice(-2) })));
  await page.setInputFiles("#videoInput", { name: "faux.mp4", mimeType: "text/plain", buffer: Buffer.from("ceci n'est pas une video") });
  await page.waitForTimeout(800);
  log("video_mime_menteur", await page.evaluate(() => ({ studioType, videoDataUrl: (videoDataUrl || "").slice(0, 40), toasts: window.__toasts.slice(-2) })));
  await page.setInputFiles("#videoInput", { name: "vide.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(800);
  log("video_0_octet", await page.evaluate(() => ({ studioType, videoDataUrl: (videoDataUrl || "").slice(0, 40) })));
  await page.fill("#postText", "vidéo vide");
  await page.evaluate(() => publishPost());
  await page.waitForTimeout(1200);
  log("video_0_octet_publiee", await page.evaluate(() => ({ userPosts: state.userPosts.length, dernier: state.userPosts[0] && { type: state.userPosts[0].type, video: (state.userPosts[0].video || "").slice(0, 40) }, pubCalls: window.__pubCalls.length })));
  // audio : MIME menteur accepté ?
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(300);
  await page.setInputFiles("#audioInput", { name: "faux.mp3", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 pas un audio") });
  await page.waitForTimeout(600);
  log("audio_mime_menteur", await page.evaluate(() => ({ studioType, audioDataUrl: (audioDataUrl || "").slice(0, 40), recStatus: document.getElementById("recStatus").textContent })));

  // ── 7. Publication pendant échec réseau : statut, reprise ? ──
  await page.evaluate(() => { audioDataUrl = null; clearAudio(); window.supaPublishPostWithRetry = async () => false; });
  await page.evaluate(() => { document.querySelector('#studioTypeTabs [data-type="text"]').click(); });
  await page.fill("#postText", "post publié pendant une coupure réseau");
  await page.evaluate(() => publishPost());
  await page.waitForTimeout(1500);
  log("publication_hors_ligne", await page.evaluate(() => {
    const p = state.userPosts[0];
    const a = document.querySelector('[data-postid="' + p.id + '"]');
    return { syncStatus: p.syncStatus, toasts: window.__toasts.slice(-3), label: a ? (a.querySelector(".post-author-meta").textContent.match(/Sync…|Local|En ligne/) || [null])[0] : null,
      outboxPosts: Object.keys(localStorage).filter(k => /outbox/.test(k)) };
  }));
  // le post « en attente » est-il retenté plus tard ? (aucune file connue : on mesure)
  await page.evaluate(() => { window.__pubCalls = []; window.supaPublishPostWithRetry = async (p) => { window.__pubCalls.push(p.id); return true; }; window.dispatchEvent(new Event("online")); });
  await page.waitForTimeout(3000);
  log("reprise_apres_online", await page.evaluate(() => ({ pubCalls: window.__pubCalls.length, syncStatus: state.userPosts[0].syncStatus })));
  // rechargement : le post local non synchronisé survit-il ?
  const localId = await page.evaluate(() => state.userPosts[0].id);
  await page.reload();
  await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  log("post_local_apres_reload", await page.evaluate((id) => { const p = state.userPosts.find(x => x.id === id); return { present: !!p, syncStatus: p && p.syncStatus, meta: (function () { const a = document.querySelector('[data-postid="' + id + '"]'); return a ? a.querySelector(".post-author-meta").textContent.replace(/\s+/g, " ").trim() : null; })() }; }, localId));

  // ── 8. Changement de profil pendant la rédaction ──
  await page.evaluate(() => { window.supaPublishPostWithRetry = async () => true; window.supaSaveUserState = async () => {}; window.supaUpsertProfile = async () => {}; });
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(300);
  await page.fill("#postText", "brouillon en cours");
  await page.setInputFiles("#photoInput", { name: "b.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await page.waitForFunction(() => photoDataUrl && studioType === "photo", null, { timeout: 8000 });
  log("switch_profil", await page.evaluate(() => {
    const avant = { passion: document.getElementById("postPassion").value, cur: state.user.currentProfileId };
    const autre = state.user.profiles.find(p => p.id !== state.user.currentProfileId && !p.archived);
    switchToProfile(autre.id);
    return { avant, apres: { passion: document.getElementById("postPassion").value, cur: state.user.currentProfileId, text: document.getElementById("postText").value, photo: !!photoDataUrl, studioType, ecran: document.querySelector(".screen.active").id } };
  }));

  // ── 9. Story : échec serveur → reste « publiée » ? ──
  log("story_echec_serveur", await page.evaluate(() => {
    window.__toasts = [];
    window.supaPublishStory = async () => false;
    const ta = document.createElement("textarea"); ta.id = "storyComposeText"; ta.value = "story test"; document.body.appendChild(ta);
    const n0 = (state.seed.stories || []).length;
    publishStoryFromComposer();
    ta.remove();
    return { avant: n0, apres: state.seed.stories.length, toasts: window.__toasts.slice(), deleteStoryFn: typeof deleteStory };
  }));

  // ── 10. Follow : refus serveur → état local ? ──
  log("follow_refus_serveur", await page.evaluate(async () => {
    window.supaFollowUser = async () => false;
    const b = document.createElement("button"); b.id = "followBtn_u_theo"; document.body.appendChild(b);
    toggleFollowUser("u_theo", "Théo");
    await new Promise(r => setTimeout(r, 300));
    const r = { following: state.user.following.includes("u_theo"), btn: b.textContent };
    b.remove(); return r;
  }));

  log("erreurs_js", errors.js);
  require("fs").writeFileSync(OUT + "/emulation-resultats.json", JSON.stringify(R, null, 2));
  await browser.close();
})().catch(e => { console.error("ECHEC", e); process.exit(1); });
