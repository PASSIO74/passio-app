// Sonde bobines 02 : panneau de commentaires d'une bobine — ouverture, saisie (espace, flèches), réactions, Échap, retour.
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  await page.locator('[data-v2-module="reel"] .v2-reel-tile').first().click();
  await page.waitForTimeout(1200);
  await page.locator(".reel-item").first().locator(".reel-action-btn[aria-label='Commenter']").click();
  await page.waitForTimeout(1200);
  await photo("panneau");
  const out = {};
  out.panneau = await page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const inp = document.getElementById("reelCommentInput");
    return { panel: q("#reelCommentsPanel"), close: q(".reel-comments-close"), send: q(".reel-comments-send"), emoji: q(".reel-emoji-btn"), input: q("#reelCommentInput"), inputFs: getComputedStyle(inp).fontSize, focus: document.activeElement && document.activeElement.id, items: document.querySelectorAll("#reelCommentsList .reel-comment-item").length, like: q(".reel-comment-like"), reply: q(".reel-comment-reply"), react: q(".reel-comment-action"), current: reelsState.current };
  });
  // Saisie au clavier physique : « Bonjour à tous » (avec espaces)
  await page.locator("#reelCommentInput").click();
  await page.keyboard.type("Bonjour à tous");
  await page.waitForTimeout(800);
  out.apresFrappe = await page.evaluate(() => ({ valeur: document.getElementById("reelCommentInput").value, current: reelsState.current, compteur: document.getElementById("reelsCounter").textContent, panelOuvert: document.getElementById("reelCommentsPanel").classList.contains("open"), postCommente: window.currentReelCommentPostId }));
  await photo("apres-frappe");
  try {
  // Réaction emoji rapide
  await page.locator("#reelEmojiReactions .reel-emoji-btn").first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  out.reaction = await page.evaluate(() => ({ toasts: (window.__toasts || []).slice(-3), toastVisible: (() => { const t = document.querySelector("#toastStack .toast"); if (!t) return null; const r = t.getBoundingClientRect(); t.style.animation = "none"; const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el && (el.id || el.className); })(), reactions: (() => { const p = findPostAnywhere(window.currentReelCommentPostId); return p && p.reactions; })() }));
  // Échap
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  out.apresEchap = await page.evaluate(() => ({ lecteurOuvert: reelsState.open, panelOuvert: document.getElementById("reelCommentsPanel").classList.contains("open"), hash: location.hash }));
  } catch (e) { out.erreur = String(e.message).slice(0, 600); }
  require("fs").writeFileSync(require("path").join(require("os").tmpdir(),"passio-audit-sondes","bobines-02.json"), JSON.stringify(out,null,1));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peupler(s, c, {}); } };
