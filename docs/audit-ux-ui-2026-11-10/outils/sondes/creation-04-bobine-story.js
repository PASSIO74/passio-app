// Sonde CRÉATION ④ — éditeur média : bobine (caméra refusée, photo refusée,
// vidéo choisie, feuille « Ta bobine », publication) puis story (fond coloré,
// texte superposé par prompt(), emojis, GIF, publication).
"use strict";
const path = require("path");
const fs = require("fs"); const os = require("os");
const jeu = require("../jeu/creation");
const MEDIAS = path.join(__dirname, "..", "medias");

module.exports = async ({ page, photo }) => {
  const r = {};
  const sauver = () => fs.writeFileSync(path.join(os.tmpdir(), "cre04.json"), JSON.stringify(r, null, 1));
  const toasts = () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  const raz = () => page.evaluate(() => { window.__toasts = []; });
  const tailles = (sel) => page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((e) => e.getBoundingClientRect().height > 0).map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || "").trim().slice(0, 30), aria: e.getAttribute("aria-label"), title: e.getAttribute("title"), w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y) }; }), sel);
  const dialogues = [];
  page.on("dialog", async (d) => { dialogues.push(d.type() + ":" + d.message()); await d.accept("Session du jeudi"); });
  // ── BOBINE
  await page.locator('#appNavV2 [data-v2-action="create"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-v2-create="bobine"]').click(); await page.waitForTimeout(2500);
  r.bobineCapture = { classes: await page.evaluate(() => document.getElementById("mediaEditor").className), boutons: await tailles("#mediaEditor .me-topbar button, #mediaEditor .me-capture-bar button, #mePlaceholder button"), hint: await page.locator("#meCaptureHint").innerText(), titre: await page.locator("#mePhTitle").innerText() };
  sauver(); await photo("bobine-capture");
  await raz();
  await page.setInputFiles("#meMediaInput", path.join(MEDIAS, "photo-carre.jpg")); await page.waitForTimeout(600);
  r.bobinePhoto = await toasts(); sauver();
  await page.setInputFiles("#meMediaInput", path.join(MEDIAS, "boucle.webm"));
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("phase-edit"))) break; await page.waitForTimeout(1000); }
  await page.waitForTimeout(1200);
  r.bobineEdition = { classes: await page.evaluate(() => document.getElementById("mediaEditor").className), boutons: await tailles("#mediaEditor .me-topbar button, #mediaEditor .me-toolbar button, #mediaEditor .me-bottom button, #mePreviewCtrls button") };
  sauver(); await photo("bobine-edition");
  await page.locator('[data-v7-bobine-act="continuer"]').click(); await page.waitForTimeout(700);
  r.feuille = { texte: await page.locator("#v7BobineSheet .v7-sheet").innerText(), champs: await tailles("#v7BobineSheet button, #v7BobineSheet select, #v7BobineSheet textarea"), fs: await page.evaluate(() => Array.from(document.querySelectorAll("#v7BobineSheet select, #v7BobineSheet textarea")).map((e) => getComputedStyle(e).fontSize)), activites: await page.evaluate(() => Array.from(document.querySelectorAll("#v7BobineEvent option")).map((o) => o.textContent)) };
  sauver(); await photo("bobine-feuille");
  await page.locator("#v7BobineDesc").fill("Trente secondes au kiosque.");
  await raz(); await page.locator("#v7BobinePublier").click(); await page.waitForTimeout(3500);
  r.bobinePubliee = { toasts: await toasts(), ecran: await page.evaluate(() => ({ actif: document.querySelector(".screen.active").id, bobines: document.getElementById("reelsViewer") && document.getElementById("reelsViewer").classList.contains("active") })), post: await page.evaluate(() => (state.userPosts || []).slice(0, 1).map((p) => ({ isReel: p.isReel, passion: p.passion, mood: p.mood, text: p.text, sync: p.syncStatus }))) };
  sauver(); await photo("bobine-publiee");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.evaluate(() => { try { if (typeof closeReels === "function") closeReels(); } catch (e) {} goTo("feed"); });
  await page.waitForTimeout(600);
  // ── STORY
  await page.locator('#appNavV2 [data-v2-action="create"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-v2-create="story"]').click(); await page.waitForTimeout(2500);
  r.storyCapture = { classes: await page.evaluate(() => document.getElementById("mediaEditor").className), boutons: await tailles("#mediaEditor .me-topbar button, #mediaEditor .me-capture-bar button, #mePlaceholder button"), hint: await page.locator("#meCaptureHint").innerText() };
  sauver(); await photo("story-capture");
  await page.locator("#meGradientBtn").click(); await page.waitForTimeout(700);
  r.storyFond = { boutons: await tailles("#mediaEditor .me-topbar button, #mediaEditor .me-toolbar button, #mediaEditor .me-bottom button") };
  sauver(); await photo("story-fond");
  await page.locator(".me-tool", { hasText: "Aa" }).click(); await page.waitForTimeout(600);
  r.dialogues = dialogues.slice();
  r.overlay = await tailles("#meOverlays .me-overlay, #meOverlays .me-ov-ctrl");
  sauver(); await photo("story-texte");
  await page.locator(".me-tool", { hasText: "😀" }).click(); await page.waitForTimeout(500);
  r.emojis = await tailles("#meEmojiBar button");
  sauver(); await photo("story-emojis");
  await page.locator("#meEmojiBar button").first().click(); await page.waitForTimeout(400);
  await page.locator(".me-tool", { hasText: "GIF" }).click(); await page.waitForTimeout(2500);
  r.gif = await page.evaluate(() => { const p = document.getElementById("meGifPanel"); return p ? p.innerText.slice(0, 300) : null; });
  sauver(); await photo("story-gif");
  await page.evaluate(() => { const p = document.getElementById("meGifPanel"); if (p) p.remove(); });
  await raz(); await page.waitForTimeout(800);
  await page.locator("#mePublishBtn").click(); await page.waitForTimeout(2500);
  r.storyPubliee = { toasts: await toasts(), ouvert: await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("open")), stories: await page.evaluate(() => (state.seed.stories || []).slice(0, 1).map((s) => ({ text: s.text, passion: s.passion, overlays: (s.overlays || []).length }))) };
  sauver(); await photo("story-publiee");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
