const path = require("path");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/playwright"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8120", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 2);
  const r = await page.evaluate(async () => {
    window.__toasts = []; window.__pubStory = 0;
    const vt = toast;
    window.toast = function (m, t) { window.__toasts.push(String(m) + "|" + t); return vt.apply(this, arguments); };
    window.supa = window.supa || {};
    window.supaPublishStory = async () => { window.__pubStory++; return false; };
    openStoryComposer();
    const ta = document.getElementById("storyComposeText"); ta.value = "story relecture";
    const n0 = (state.seed.stories || []).length;
    publishStoryFromComposer();
    await new Promise(r => setTimeout(r, 400));
    const mine = (state.seed.stories || []).filter(s => s.text === "story relecture");
    const bulle = !!document.querySelector('#storiesRowFeed .story-item[title="Voir ta story"]');
    return { avant: n0, apres: state.seed.stories.length, mine: mine.length, pubStory: window.__pubStory, toasts: window.__toasts, bulleMaStory: bulle,
      deleteStory: typeof deleteStory, fnsSuppr: Object.keys(window).filter(k => /story/i.test(k) && /del|supprim|remove/i.test(k)),
      viewerBtns: Array.from(document.querySelectorAll('#storyViewer [onclick]')).map(e => e.getAttribute('onclick')) };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error("ECHEC", e); process.exit(1); });
