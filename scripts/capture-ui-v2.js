#!/usr/bin/env node
// Captures avant/après du lot UI-1 (shell et navigation V2), en 390 × 844.
//
// « avant »  = URL normale, interface actuelle inchangée ;
// « après »  = même état, même serveur, avec ?passio_preview=passio-ui-v2.
//
// Les deux séries sont prises dans la MÊME session de navigateur et le MÊME état
// local : une différence visible est donc imputable à l'aperçu, pas au jeu de
// données. Usage : `npm run serve` puis `node scripts/capture-ui-v2.js [avant|apres]`.
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");
const fs = require("fs");
const path = require("path");

const PHASE = (process.argv[2] || "avant").toLowerCase();
if (PHASE !== "avant" && PHASE !== "apres") {
  console.error("Usage : node scripts/capture-ui-v2.js [avant|apres]");
  process.exit(1);
}
const PORT = process.env.PASSIO_PORT || 8080;
const OUT = path.join(__dirname, "..", "docs", "screenshots", "ui-v2");
const SCREENS = ["feed", "irl", "messages", "profiles"];

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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, STATE]);

  const query = PHASE === "apres" ? "?passio_preview=passio-ui-v2" : "";
  await page.goto(`http://127.0.0.1:${PORT}/index.html${query}`);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
  await page.evaluate(() => { try { toggleProfileFilter("musique"); } catch (e) {} });

  for (const s of SCREENS) {
    await page.evaluate((scr) => goTo(scr), s);
    await page.waitForTimeout(1100);
    const file = path.join(OUT, `${PHASE}-${s}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("✓", path.basename(file));
  }

  // Gros plan sur la barre du bas : c'est elle que le lot UI-1 change.
  await page.evaluate((scr) => goTo(scr), "feed");
  await page.waitForTimeout(700);
  const navSel = PHASE === "apres" ? "#appNavV2" : "#appNav";
  const nav = await page.$(navSel);
  if (nav) {
    await nav.screenshot({ path: path.join(OUT, `${PHASE}-bottom-nav.png`) });
    console.log("✓", `${PHASE}-bottom-nav.png`);
  } else {
    console.warn("✗ barre du bas introuvable :", navSel);
  }

  // Le sélecteur « Créer » n'existe que dans l'aperçu V2.
  if (PHASE === "apres") {
    await page.click('#appNavV2 [data-v2-action="create"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "apres-creer-sheet.png"), fullPage: false });
    console.log("✓ apres-creer-sheet.png");
  }

  await ctx.close();
  await browser.close();
  console.log(`\nCaptures « ${PHASE} » dans docs/screenshots/ui-v2/`);
})();
