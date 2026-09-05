// Relecture CONT-01 — reproduction Chromium (émulation), port 8120, aucune écriture Supabase.
const path = require("path");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/playwright"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
const R = {}; const log = (k, v) => { R[k] = v; console.log(k, JSON.stringify(v)); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8120", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 2);
  await page.evaluate(() => {
    window.__toasts = []; const vt = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vt.apply(this, arguments); } catch (e) {} };
    window.supaLoadPosts = async () => []; window.supaSaveUserState = async () => {}; window.supaSaveUserStateBeacon = () => {}; window.supaUpsertProfile = async () => {};
    // Faux SDK Supabase : on laisse le VRAI supaPublishPostWithRetry / supaUploadMedia tourner, en capturant upload + insert.
    window.__uploads = []; window.__inserts = [];
    window._supaReal = true;
    supa = {
      storage: { from: (b) => ({
        upload: async (p, blob) => { window.__uploads.push({ bucket: b, path: p, type: blob.type, size: blob.size }); return { error: null }; },
        getPublicUrl: (p) => ({ data: { publicUrl: "https://x.supabase.co/storage/v1/object/public/content/" + p } }),
        remove: async () => ({ error: null }) }) },
      from: (t) => ({ insert: (row) => ({ select: () => ({ single: async () => { window.__inserts.push({ table: t, type: row.type, media_url: row.media_url, is_reel: row.is_reel }); return { data: { id: row.id }, error: null }; } }) }) }),
      auth: { getSession: async () => ({ data: { session: { user: { id: "e2e-uid" } } } }) },
    };
    window.MY_UID = "e2e-uid"; try { MY_UID = "e2e-uid"; } catch(e){}
  });
  await page.evaluate(() => goTo("studio")); await page.waitForTimeout(400);
  // 1. vidéo à MIME menteur
  await page.setInputFiles("#videoInput", { name: "faux.mp4", mimeType: "text/plain", buffer: Buffer.from("ceci n'est pas une video") });
  await page.waitForTimeout(800);
  log("video_mime_menteur", await page.evaluate(() => ({ studioType, videoDataUrl: (videoDataUrl || "").slice(0, 30), toasts: window.__toasts.slice(-2) })));
  await page.fill("#postText", "vidéo texte");
  await page.evaluate(() => publishPost()); await page.waitForTimeout(2500);
  log("video_mime_menteur_publiee", await page.evaluate(() => ({ uploads: window.__uploads, inserts: window.__inserts, toasts: window.__toasts.slice(-2), post: state.userPosts[0] && { type: state.userPosts[0].type, video: (state.userPosts[0].video || "").slice(0, 80), sync: state.userPosts[0].syncStatus } })));
  // 2. vidéo 0 octet
  await page.evaluate(() => { window.__uploads = []; window.__inserts = []; goTo("studio"); }); await page.waitForTimeout(400);
  await page.setInputFiles("#videoInput", { name: "vide.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(800);
  log("video_0_octet", await page.evaluate(() => ({ studioType, videoDataUrl, toasts: window.__toasts.slice(-2) })));
  await page.fill("#postText", "vidéo vide");
  await page.evaluate(() => publishPost()); await page.waitForTimeout(2500);
  log("video_0_octet_publiee", await page.evaluate(() => ({ uploads: window.__uploads, inserts: window.__inserts, toasts: window.__toasts.slice(-2) })));
  // 3. audio à MIME menteur
  await page.evaluate(() => { window.__uploads = []; window.__inserts = []; goTo("studio"); }); await page.waitForTimeout(400);
  await page.setInputFiles("#audioInput", { name: "faux.mp3", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 pas un audio") });
  await page.waitForTimeout(800);
  log("audio_mime_menteur", await page.evaluate(() => ({ studioType, audioDataUrl: (audioDataUrl || "").slice(0, 30), recStatus: document.getElementById("recStatus").textContent, toasts: window.__toasts.slice(-2) })));
  await page.fill("#postText", "audio pdf");
  await page.evaluate(() => publishPost()); await page.waitForTimeout(2500);
  log("audio_mime_menteur_publie", await page.evaluate(() => ({ uploads: window.__uploads, inserts: window.__inserts, toasts: window.__toasts.slice(-2) })));
  log("erreurs_js", errors.js.slice(0, 5)); log("echec_publication", await page.evaluate(() => window._passioEchecPublication));
  require("fs").writeFileSync(__dirname + "/repro-resultats.json", JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
