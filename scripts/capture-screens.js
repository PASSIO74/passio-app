#!/usr/bin/env node
// Mission 4 — capture des écrans pour l'audit UX/UI.
// Génère docs/screenshots/<ecran>-<mobile|desktop>.png à partir de l'app locale
// (serveur sur 8080), en état onboardé. Usage : npm run serve puis
// `node scripts/capture-screens.js`.
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "docs", "screenshots");
const SCREENS = ["feed", "profiles", "studio", "explore", "irl", "wallet", "messages", "cdv"];
const STATE = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: {
    name: "Audit QA", birthYear: 1995, isMinor: false, score: 120, passia: 45,
    currentProfileId: "pp_0",
    profiles: [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", bio: "Passionné de musique et de voyages", color: "#7c3aed", createdAt: 1 }],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: [], savedCarnets: [], general: { username: "Audit QA" },
  },
  userPosts: [], userEvents: [], transactions: [], notifications: [], quests: [],
  currentMood: "all", selectedFeedPassions: [],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [tag, vp] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport: vp, locale: "fr-FR" });
    const page = await ctx.newPage();
    await page.addInitScript(([k, t, st]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }, [GATE_KEY, GATE_TOKEN, STATE]);
    await page.goto("http://127.0.0.1:8080/index.html");
    await page.waitForTimeout(3000);
    await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
    // Activer une passion pour que le fil ait du contenu
    await page.evaluate(() => { try { toggleProfileFilter("musique"); } catch (e) {} });
    for (const s of SCREENS) {
      try {
        await page.evaluate((scr) => goTo(scr), s);
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `${s}-${tag}.png`), fullPage: false });
        console.log(`✓ ${s}-${tag}.png`);
      } catch (e) {
        console.warn(`✗ ${s}-${tag}: ${e.message}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log("\nCaptures dans docs/screenshots/");
})();
