// Sonde — carte, j'aime, discussion, options, détail, réactions (compte connecté).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/fil");
const boites = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => e.getBoundingClientRect().height > 0).map((e) => { const b = e.getBoundingClientRect(); return [e.tagName.toLowerCase() + "." + String(e.className || "").split(" ")[0], (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 28), e.getAttribute("aria-label"), e.getAttribute("role"), e.getAttribute("tabindex"), Math.round(b.width) + "x" + Math.round(b.height), getComputedStyle(e).fontSize]; });
module.exports = async ({ page, photo, serveur, banc }) => {
  const out = {};
  await page.waitForTimeout(1500);
  const carte = '#feedList .post[data-postid="pa_lea_1"]';
  out.actions = await page.evaluate(boites, carte + " .post-actions > *, " + carte + " .post-menu-btn, " + carte + " .post-mood-tag, " + carte + " .comment-action, " + carte + " [data-v3-bridge] button, " + carte + " .avatar, " + carte + " .post-author");
  out.aime = await page.evaluate(() => { const p = findPostAnywhere("pa_lea_1"); return { liked: p.liked, likes: p.likes, dansListe: (state.user.likedPosts || []).includes("pa_lea_1"), total: p.commentsTotal, nbC: nbCommentairesPost(p) }; });
  // J'aime : vrai geste
  await page.locator(carte + ' [data-action="like"]').click();
  await page.waitForTimeout(700);
  out.apresLike = await page.evaluate(() => ({ txt: document.querySelector('#feedList .post[data-postid="pa_lea_1"] [data-action="like"]').innerText, toasts: (window.__toasts || []).map((t) => t.msg) }));
  out.ecritureLike = serveur.requetes((r) => r.table === "post_likes" && r.m !== "GET" && r.m !== "HEAD").map((r) => r.m);
  // Discussion
  await page.locator(carte + " [data-cmtcount]").click();
  await page.waitForTimeout(1800);
  out.discussion = await page.evaluate(() => { const b = document.getElementById("commentsBox"); const m = document.getElementById("modalContent").getBoundingClientRect(); return { titre: document.querySelector(".modal-title").innerText, sous: document.querySelector(".modal-subtitle").innerText, boxH: b.clientHeight, boxScroll: b.scrollHeight, nb: b.querySelectorAll(".comment").length, modal: [Math.round(m.top), Math.round(m.height)], suite: (b.querySelector("button.btn.ghost.block") || {}).innerText || null, focus: document.activeElement && document.activeElement.id }; });
  out.discussionCibles = await page.evaluate(boites, "#modalContent .comment:nth-of-type(1) .comment-action, #modalContent .comment-menu-btn, #modalContent .cmt-sort, #modalContent .cmt-tool-btn, #modalContent .btn.primary, #modalContent textarea, #modalContent .modal-close, #modalContent .comment-reply-count, #modalContent .cmt-react-chip");
  await photo("a-discussion");
  // Options d'un commentaire d'autrui (premier)
  await page.locator("#commentsBox .comment-menu-btn").first().click();
  await page.waitForTimeout(500);
  out.optionsAutrui = await page.evaluate(boites, "#cmtSheet .cmt-sheet-row");
  await photo("b-options-commentaire-autrui");
  await page.locator("#cmtSheet .cmt-sheet-row.cancel").click();
  // Répondre
  await page.locator("#commentsBox .comment .comment-action[title='Répondre']").first().click();
  await page.waitForTimeout(600);
  out.reponse = await page.evaluate(boites, ".comment-reply-input > *");
  await photo("c-repondre");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  out.apresEchap = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
  return out;
};
module.exports.demarrage = { mode: "compte", nbPassions: 3, peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
