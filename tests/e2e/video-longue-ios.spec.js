// ════════════════════════════════════════════════════════════════════════════
// VIDÉO DE GALERIE SUR iPHONE (2026-11-22) — signalé par une testeuse : « Vidéo
// impossible à optimiser (41 Mo) » en story comme dans le Studio. Télémétrie :
//  · « too long » — toute vidéo de plus de 65 s était REFUSÉE ;
//  · NotAllowedError — iOS refuse `play()` d'un élément sonore hors d'un toucher,
//    la compression ne démarrait jamais, et 41 Mo dépasse le repli brut (25 Mo).
// Correctif : la vidéo longue est COUPÉE (VIDEO_DUREE_MAX), et un refus de
// lecture demande UN toucher au lieu d'échouer.
// ════════════════════════════════════════════════════════════════════════════
const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "medias-proteges-video.webm")).toString("base64");

test("une vidéo plus longue que la durée maximale est COUPÉE, pas refusée", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const f = new File([u], "v.webm", { type: "video/webm" });
    let coupe = 0;
    try {
      const d = await passioCompressVideo(f, { dureeMax: 1, surCoupe: (s) => { coupe = s; } });
      return { ok: typeof d === "string" && d.indexOf("data:video/") === 0, coupe };
    } catch (e) { return { erreur: String(e && e.message) }; }
  }, FIXTURE);
  expect(r.erreur, "la vidéo longue ne doit plus être refusée").toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.coupe).toBe(1);
});

test("iOS refuse la lecture sonore : un bouton demande UN toucher et la compression repart", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const f = new File([u], "v.webm", { type: "video/webm" });
    const play = HTMLMediaElement.prototype.play;
    let refus = 0;
    HTMLMediaElement.prototype.play = function () {
      if (refus++ === 0) return Promise.reject(new DOMException("refus", "NotAllowedError"));
      return play.call(this);
    };
    let geste = false;
    const p = passioCompressVideo(f, { demanderGeste: (relancer) => { geste = true; setTimeout(relancer, 50); } });
    try { const d = await p; return { geste, ok: d.indexOf("data:video/") === 0 }; }
    catch (e) { return { geste, erreur: String(e && e.message) }; }
    finally { HTMLMediaElement.prototype.play = play; }
  }, FIXTURE);
  expect(r.geste, "le refus NotAllowedError doit demander un toucher").toBe(true);
  expect(r.erreur).toBeUndefined();
  expect(r.ok).toBe(true);
});

test("le CÂBLAGE : `passioVideoPourEnvoi` affiche le bouton, le toucher relance, coupe annoncée", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__toasts = [];
    const t = window.toast; window.toast = function (m) { window.__toasts.push(m); return t && t.apply(this, arguments); };
    window.passioCompressVideo = function (f, opts) {
      return new Promise((res) => {
        opts.demanderGeste(() => { opts.surDemarrage(60); opts.surCoupe(opts.dureeMax); res("data:video/mp4;base64," + "A".repeat(4000)); });
      });
    };
    window.__envoi = passioVideoPourEnvoi(new File([new Uint8Array(41 * 1024 * 1024)], "long.mov", { type: "video/quicktime" }));
  });
  const bouton = page.locator("#meProgressToucher");
  await expect(bouton).toBeVisible();
  await bouton.click();
  const r = await page.evaluate(async () => { const d = await window.__envoi; return { ok: d.indexOf("data:video/mp4") === 0, toasts: window.__toasts }; });
  expect(r.ok).toBe(true);
  expect(r.toasts.join(" ")).toMatch(/coupée aux 60 premières secondes/);
  await expect(page.locator("#meProgressOv")).toHaveCount(0);
});

test("une vidéo COUPÉE n'est jamais remplacée par l'original entier, même plus léger", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const issues = [];
    window.tel = { action: (n, m) => issues.push(m.issue), error() {} };
    window._meReadFile = async () => "data:video/mp4;base64," + "B".repeat(4096);
    window.passioCompressVideo = async (f, opts) => { opts.surCoupe(opts.dureeMax); return "data:video/mp4;base64," + "A".repeat(8 * 1024 * 1024); };
    const d = await passioVideoPourEnvoi(new File([new Uint8Array(3 * 1024 * 1024)], "long-leger.mp4", { type: "video/mp4" }));
    return { compresse: d.indexOf("AAAA") > 0, issues };
  });
  expect(r.compresse, "la version coupée doit partir, pas les 90 s d'origine").toBe(true);
  expect(r.issues).toEqual(["compression"]);
});
