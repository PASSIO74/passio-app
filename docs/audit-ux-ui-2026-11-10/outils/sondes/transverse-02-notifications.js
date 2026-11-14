// Sonde transverse 02 : cloche, panneau de notifications, destination de chaque type.
const base = require("../jeu/base");
const jeu = require("../jeu/transverse");
module.exports = async ({ page, photo }) => {
  const out = {};
  try {
    await page.waitForTimeout(2500);
    out.cloche = await page.evaluate(() => {
      const b = document.querySelector(".topbar-bell[onclick*='openNotifications'], [onclick*='openNotifications']");
      const d = document.getElementById("bellDot");
      const r = b ? b.getBoundingClientRect() : null;
      return { aria: b && b.getAttribute("aria-label"), rect: r && [r.x, r.y, r.width, r.height].map(Math.round), pastille: d && d.textContent, pastilleVisible: d && d.offsetParent !== null, nbEtat: (state.notifications || []).length, nonLues: unreadCount(), titre: document.title };
    });
    await photo("cloche");
    await page.locator("[onclick*='openNotifications']").first().click();
    await page.waitForTimeout(1500);
    await photo("panneau");
    out.panneau = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".notif-row"));
      return { nb: rows.length, pastilleApres: (document.getElementById("bellDot") || {}).textContent, titreOnglet: document.title,
        lignes: rows.map((r) => { const rr = r.getBoundingClientRect(); return { txt: r.innerText.replace(/\s+/g, " ").slice(0, 110), nonLue: r.classList.contains("unread"), h: Math.round(rr.height), role: r.getAttribute("role"), tab: r.getAttribute("tabindex") }; }),
        boutons: Array.from(document.querySelectorAll("#modalContent button")).filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return b.textContent.trim() + " [" + Math.round(r.width) + "×" + Math.round(r.height) + "]"; }),
        defile: (() => { const m = document.getElementById("modalContent"); return [m.scrollHeight, m.clientHeight]; })() };
    });
    // Destination de chaque type : on rejoue clickNotif sur chaque ligne et on relève l'écran.
    const ids = await page.evaluate(() => (state.notifications || []).map((n) => ({ id: n.id, kind: n.kind, ref: n.refId })));
    out.destinations = [];
    for (const n of ids) {
      try {
        await page.evaluate(() => { try { closeModal(); } catch (e) {} try { closePost && closePost(); } catch (e) {} try { closeConversation && closeConversation(); } catch (e) {} try { goTo("feed"); } catch (e) {} });
        await page.waitForTimeout(400);
        const avantToasts = await page.evaluate(() => (window.__toasts || []).length);
        await page.evaluate((id) => clickNotif(id), n.id);
        await page.waitForTimeout(1600);
        const res = await page.evaluate((a) => {
          const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; };
          const bd = document.getElementById("modalBackdrop");
          return { ecran: (document.querySelector(".screen.active") || {}).id, modale: bd.classList.contains("active") ? ((document.querySelector("#modalContent .modal-title, #modalContent h2, #modalContent h3") || {}).textContent || "ouverte").trim().slice(0, 60) : null,
            postPage: vis("postDetailPage"), conv: (document.getElementById("conv-fullpage") || { classList: { contains: () => false } }).classList.contains("active"),
            profil: (() => { const p = document.querySelector("#userProfilePage, .user-profile-page, #visitedProfile"); return p ? vis(p.id) : null; })(),
            toasts: (window.__toasts || []).slice(a).map((t) => t.msg), hash: location.hash };
        }, avantToasts);
        out.destinations.push(Object.assign({ kind: n.kind, ref: n.ref }, res));
        if (n.kind === "like" && /supprime/.test(String(n.ref))) await photo("dest-supprime");
        if (n.kind === "message") await photo("dest-message");
        if (n.kind === "event_cancelled") await photo("dest-annulee");
      } catch (e) { out.destinations.push({ kind: n.kind, erreur: String(e.message).slice(0, 160) }); }
    }
  } catch (e) { out.erreur = String(e.stack || e).slice(0, 600); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peuplerNotifs(s, c); } };
