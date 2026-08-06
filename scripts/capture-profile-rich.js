#!/usr/bin/env node
// Capture d'un profil RICHE (démo commerciale) — pour la vidéo de présentation.
// Usage : npm run serve puis `node scripts/capture-profile-rich.js`
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "docs", "screenshots");

const AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&q=80";
const COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&q=80";

function post(id, passion, emoji, text, likes) {
  return { id, passion, authorEmoji: emoji, text, likes, comments: [], reactions: [],
    createdAt: Date.now() - id * 3600000, _source: "me", authorName: "Léa Moreau" };
}

const STATE = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: {
    name: "Léa Moreau", birthYear: 1997, isMinor: false, score: 1240, passia: 320,
    currentProfileId: "pp_music",
    profiles: [
      { id: "pp_music", name: "Léa Moreau", passion: "musique", emoji: "🎸", bio: "Guitariste autodidacte, je partage mes sessions et mes reprises.", color: "#7c3aed", createdAt: 1 },
      { id: "pp_travel", name: "Léa Moreau", passion: "voyage", emoji: "✈️", bio: "Carnets de route et bons plans.", color: "#0ea5e9", createdAt: 2 },
      { id: "pp_photo", name: "Léa Moreau", passion: "photo", emoji: "📷", bio: "Lumière dorée et argentique.", color: "#f59e0b", createdAt: 3 },
    ],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: Array.from({ length: 214 }, (_, i) => "u_" + i),
    savedCarnets: [],
    general: {
      username: "Léa Moreau",
      bio: "Guitariste & voyageuse 🎸✈️ Je partage mes sessions, mes carnets de route et les lieux qui m'inspirent.",
      avatarPhoto: AVATAR,
      coverPhoto: COVER,
      rsLinks: [
        { platform: "instagram", url: "https://instagram.com" },
        { platform: "youtube", url: "https://youtube.com" },
      ],
    },
  },
  userPosts: [
    post(1, "musique", "🎸", "Nouvelle reprise en fingerstyle ce soir 🎶 Le genre de morceau qu'on porte des années avant d'oser le jouer.", 342),
    post(2, "voyage", "✈️", "5 jours à Lisbonne : le tram 28, les pastéis de nata et un coucher de soleil à Cascais. Carnet complet bientôt !", 289),
    post(3, "photo", "📷", "Golden hour sur les toits. Argentique, 50mm, zéro retouche.", 198),
    post(4, "musique", "🎸", "Petit riff du dimanche 🤘", 156),
    post(5, "voyage", "✈️", "Prochaine étape : les Dolomites cet été. Des spots à conseiller ?", 121),
  ],
  userEvents: [], transactions: [], notifications: [], quests: [],
  currentMood: "all", selectedFeedPassions: [],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    window._followersCount = 2847;
  }, [GATE_KEY, GATE_TOKEN, STATE]);
  await page.goto("http://127.0.0.1:8080/index.html");
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
  // Neutralise le fetch Supabase des abonnés (stub local → 0) et fige un vrai nombre
  await page.evaluate(() => { window.loadFollowersCount = function () {}; window._followersCount = 2847; try { goTo("profiles"); } catch (e) {} });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    window.loadFollowersCount = function () {};
    window._followersCount = 2847;
    try { renderMainProfile(); } catch (e) {}
    var f = document.getElementById("mainStatFollowers"); if (f) f.textContent = "2847";
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "profile-rich-mobile.png"), fullPage: false });
  console.log("✓ profile-rich-mobile.png");
  await ctx.close();
  await browser.close();
})();
