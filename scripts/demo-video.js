#!/usr/bin/env node
// Vidéo de démo — enregistre une session réelle de l'app (Playwright screencast).
// Produit docs/demo/passio-demo.webm (format mobile 390x844, ~50 s) à partir du
// serveur local. Usage : serveur sur 8080 (npm run serve) puis
// `node scripts/demo-video.js [--port 8080]`.
// Conversion mp4 (iPhone) : ffmpeg -i passio-demo.webm -c:v libx264 -pix_fmt yuv420p passio-demo.mp4
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");
const fs = require("fs");
const path = require("path");

const argPort = process.argv.indexOf("--port");
const PORT = argPort > -1 ? process.argv[argPort + 1] : "8080";
const OUT = path.join(__dirname, "..", "docs", "demo");
const VP = { width: 390, height: 844 };
const STATE = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: {
    name: "Léa", birthYear: 1995, isMinor: false, score: 120, passia: 45,
    currentProfileId: "pp_0",
    profiles: [{ id: "pp_0", name: "Léa", passion: "musique", emoji: "🎵", bio: "Passionnée de musique et de voyages", color: "#7c3aed", createdAt: 1 }],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: [], savedCarnets: [], general: { username: "Léa" },
  },
  userPosts: [], userEvents: [], transactions: [], notifications: [], quests: [],
  currentMood: "all", selectedFeedPassions: [],
};

async function slowScroll(page, steps, dy) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(450);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VP, locale: "fr-FR", deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: VP },
  });
  const page = await ctx.newPage();
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, STATE]);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
  await page.evaluate(() => { try { toggleProfileFilter("musique"); } catch (e) {} });
  await page.waitForTimeout(1500);

  // Scénario : chaque étape = [écran, pause avant scroll, nb scrolls]
  const scenes = [
    ["feed", 2200, 5],
    ["explore", 1800, 3],
    ["irl", 1800, 3],
    ["cdv", 1800, 2],
    ["messages", 2000, 0],
    ["profiles", 1800, 2],
    ["studio", 1800, 0],
    ["feed", 1500, 2],
  ];
  for (const [screen, pause, scrolls] of scenes) {
    try {
      await page.evaluate((s) => goTo(s), screen);
      await page.waitForTimeout(pause);
      if (scrolls) await slowScroll(page, scrolls, 320);
      await page.waitForTimeout(600);
    } catch (e) {
      console.warn(`✗ ${screen}: ${e.message}`);
    }
  }
  await page.waitForTimeout(1200);

  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const dest = path.join(OUT, "passio-demo.webm");
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(raw, dest);
  await browser.close();
  console.log(`✓ Vidéo : ${dest}`);
})();
