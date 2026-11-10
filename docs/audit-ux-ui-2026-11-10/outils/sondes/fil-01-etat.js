// Sonde — état du fil d'un compte connecté (jeu « fil ») : structure, ordre des cartes, tailles.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/fil");
module.exports = async ({ page, photo }) => {
  const out = {};
  await page.waitForTimeout(1500);
  out.tete = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { y: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
    return {
      suivis: (state.user.following || []).length, passions: Array.from(_activeFeedPassions), envies: state.feedIntents,
      topbar: r(".app-topbar"), rail: r("#profileStrip"), envie: r("#feedIntentSelector"), stories: r("#storiesRowFeed"), liste: r("#feedList"), nav: r(".app-nav"),
      tuiles: Array.from(document.querySelectorAll("#profileStrip .profile-tile")).map((t) => { const b = t.getBoundingClientRect(); return [t.innerText.trim(), t.getAttribute("aria-pressed"), Math.round(b.width) + "x" + Math.round(b.height)]; }),
      enviesBtn: Array.from(document.querySelectorAll("#feedIntentSelector .feed-intent-btn")).map((t) => { const b = t.getBoundingClientRect(); return [t.innerText.trim(), Math.round(b.width) + "x" + Math.round(b.height), getComputedStyle(t).fontSize]; }),
      storiesItems: Array.from(document.querySelectorAll("#storiesRowFeed .story-item")).map((t) => { const b = t.getBoundingClientRect(); return [t.innerText.trim(), Math.round(b.width) + "x" + Math.round(b.height), t.getAttribute("role"), t.getAttribute("tabindex")]; }),
      enfants: Array.from(document.querySelectorAll("#feedList > *")).map((e) => (e.getAttribute("data-postid") || e.className || e.id || e.tagName).toString().slice(0, 40)),
      recap: !!document.querySelector(".recap-semaine, [class*=recap-semaine]"),
    };
  });
  out.carte = await page.evaluate(() => {
    const c = document.querySelector('#feedList .post[data-postid="pa_lea_1"]');
    if (!c) return null;
    return {
      html: c.outerHTML.replace(/\s+/g, " ").slice(0, 3500),
      actions: Array.from(c.querySelectorAll(".post-actions > *, .post-menu-btn, [data-v3-bridge] *, .v3-bridge, button")).map((e) => { const b = e.getBoundingClientRect(); return [e.tagName, (e.className || "").toString().slice(0, 30), (e.innerText || "").trim().slice(0, 24), e.getAttribute("aria-label"), e.getAttribute("role"), e.getAttribute("tabindex"), Math.round(b.width) + "x" + Math.round(b.height)]; }),
    };
  });
  await photo("a-haut");
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 520; });
  await page.waitForTimeout(500);
  await photo("b-defile");
  return out;
};
module.exports.demarrage = { mode: "compte", nbPassions: 3, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
