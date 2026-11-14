// Sonde transverse 01 : le panneau « Paramètres » (#devPanel) et chacun de ses sous-écrans.
// Relève : entrées, tailles, textes, titres ; une image par sous-écran.
const base = require("../jeu/base");
const jeu = require("../jeu/transverse");
module.exports = async ({ page, photo }) => {
  const out = {};
  const dialogues = [];
  page.on("dialog", async (d) => { dialogues.push({ type: d.type(), msg: d.message() }); try { await d.dismiss(); } catch (e) {} });
  try {
    await page.waitForTimeout(1500);
    // Porte : le « ⋯ » de la barre du haut
    out.porte = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("[onclick*='toggleDevPanel']")).filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(); return { tag: x.tagName, cls: x.className, aria: x.getAttribute("aria-label"), txt: x.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; });
      return b;
    });
    await page.evaluate(() => toggleDevPanel());
    await page.waitForTimeout(500);
    await photo("panneau-ferme");
    out.panneau = await page.evaluate(() => {
      const p = document.getElementById("devPanel"); const r = p.getBoundingClientRect(); const cs = getComputedStyle(p);
      return { rect: [r.x, r.y, r.width, r.height].map(Math.round), z: cs.zIndex, pos: cs.position, role: p.getAttribute("role"), aria: p.getAttribute("aria-label"),
        sections: Array.from(p.querySelectorAll(".settings-section-header")).map((h) => { const rr = h.getBoundingClientRect(); return { t: h.textContent.trim().replace(/\s+/g, " "), h: Math.round(rr.height), w: Math.round(rr.width) }; }),
        boutonsVisibles: Array.from(p.querySelectorAll("button")).filter((b) => b.offsetParent).map((b) => { const rr = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(rr.height), fs: getComputedStyle(b).fontSize }; }),
      };
    });
    // Ouvrir chaque section
    const sections = await page.$$("#devPanel .settings-section");
    out.contenus = [];
    for (let i = 0; i < sections.length; i++) {
      await page.evaluate((i) => { const s = document.querySelectorAll("#devPanel .settings-section")[i]; s.querySelector(".settings-section-header").click(); }, i);
      await page.waitForTimeout(300);
      out.contenus.push(await page.evaluate((i) => { const s = document.querySelectorAll("#devPanel .settings-section")[i]; return { titre: s.querySelector(".settings-section-header").textContent.trim().replace(/\s+/g, " "), boutons: Array.from(s.querySelectorAll(".settings-section-body button")).filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), fs: getComputedStyle(b).fontSize }; }) }; }, i));
      if (i === 0) await photo("section-compte");
    }
    // Sous-écrans
    const fns = ["openNotifSettings", "openPrivacySettings", "openContentSettings", "openScreenTime", "openPauseMode", "openConfigurator", "openBlockedList", "openChangePassword", "openLogoutConfirm", "openDeleteAccountConfirm", "openLimitesPilote", "openAbout", "openPrivacyPolicy", "openTermsOfService", "openLegalNotice", "feedbackModal"];
    out.sousEcrans = {};
    for (const f of fns) {
      try {
        await page.evaluate(() => { try { closeModal(); } catch (e) {} const p = document.getElementById("devPanel"); if (p) p.classList.remove("active"); });
        await page.waitForTimeout(250);
        await page.evaluate((f) => { window[f](); }, f);
        await page.waitForTimeout(700);
        await photo("sous-" + f);
        out.sousEcrans[f] = await page.evaluate(() => {
          const m = document.getElementById("modalContent");
          const bd = document.getElementById("modalBackdrop");
          const vis = bd && bd.classList.contains("active");
          const croix = Array.from(m.querySelectorAll("button")).filter((b) => b.offsetParent && /^[×✕✖]$/.test(b.textContent.trim())).map((b) => { const r = b.getBoundingClientRect(); return { cls: b.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
          const titre = (m.querySelector(".modal-title, h2, h3") || {}).textContent;
          return { ouverte: vis, titre: titre && titre.trim().slice(0, 80), hauteurContenu: m.scrollHeight, hauteurVisible: m.clientHeight, croix, texte: m.innerText.replace(/\s+/g, " ").slice(0, 700), nbCaracteres: m.innerText.length,
            boutons: Array.from(m.querySelectorAll("button")).filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return b.textContent.trim().slice(0, 40) + " [" + Math.round(r.width) + "×" + Math.round(r.height) + "]"; }).slice(0, 20),
            champs: Array.from(m.querySelectorAll("input,select,textarea")).filter((x) => x.offsetParent).map((x) => ({ type: x.type, id: x.id, fs: getComputedStyle(x).fontSize })) };
        });
      } catch (e) { out.sousEcrans[f] = { erreur: String(e.message || e).slice(0, 200) }; }
    }
  } catch (e) { out.erreur = String(e.stack || e).slice(0, 500); }
  out.dialogues = dialogues;
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peuplerBlocages(s, c); } };
