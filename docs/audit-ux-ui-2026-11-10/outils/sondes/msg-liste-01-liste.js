// Sonde 01 — écran Messages, 12 conversations (compte connecté, faux serveur).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo }) => {
  await page.evaluate(() => goTo("messages"));
  await jeu.attendreListe(page, 3);
  await page.waitForTimeout(600);
  await photo("haut");
  const r = await page.evaluate(() => {
    const cartes = [...document.querySelectorAll("#messageList .msg-card")].map((c) => ({
      nom: (c.querySelector(".msg-name") || {}).textContent,
      heure: (c.querySelector(".msg-time") || {}).textContent,
      ligne2: [...c.querySelectorAll(".msg-passion")].map((x) => x.textContent).join(" | "),
      apercu: (c.querySelector(".msg-preview") || {}).textContent,
      nonLu: c.classList.contains("unread"), badge: !!c.querySelector(".msg-badge"),
      h: Math.round(c.getBoundingClientRect().height),
      role: c.getAttribute("role"), tabindex: c.getAttribute("tabindex"),
    }));
    const nav = [...document.querySelectorAll("nav *, .bottom-nav *, #bottomNav *")].filter((e) => /badge|dot/i.test(String(e.className || "") + " " + (e.id || ""))).map((e) => ({ cls: String(e.className), id: e.id, txt: e.textContent, disp: getComputedStyle(e).display }));
    return {
      cartes, nav,
      tete: (document.getElementById("v6aHead") || {}).outerHTML,
      titreDoc: document.title,
      nbConvs: getConversations().length,
      seedUsers: (state.seed.users || []).length,
      seedUsers12: (state.seed.users || []).slice(0, 12).map((u) => u.id + "|" + u.name + "|" + (u.distant ? "distant" : "demo")),
      appels: typeof appelsDisponibles === "function" ? appelsDisponibles() : null,
    };
  });
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 99999; });
  await page.waitForTimeout(300);
  await photo("bas");
  return r;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
