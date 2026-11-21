#!/usr/bin/env node
// Fabrique les médias FICTIFS du banc (aucune photo réelle, aucun contenu d'utilisateur) :
//   · des « photos » synthétiques (scènes vectorielles rendues en JPEG) à plusieurs rapports ;
//   · des avatars synthétiques ;
//   · une boucle vidéo WebM (enregistrée par Playwright sur une page animée).
// À lancer une fois :  node docs/audit-ux-ui-2026-11-10/outils/medias.js
"use strict";
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { chromium } = require("@playwright/test");

const DOSSIER = path.join(__dirname, "medias");
fs.mkdirSync(DOSSIER, { recursive: true });

function scene(w, h, t) {
  // t : palette et motif. Scène simple : ciel en dégradé, astre, trois plans de relief, premier plan.
  const P = {
    montagne: ["#1e3a8a", "#f59e0b", "#fde68a", "#334155", "#475569", "#1f2937"],
    foret: ["#064e3b", "#a7f3d0", "#fef9c3", "#166534", "#15803d", "#052e16"],
    ville: ["#312e81", "#f472b6", "#fde68a", "#1e1b4b", "#3730a3", "#111827"],
    plage: ["#0ea5e9", "#fde68a", "#fff7ed", "#0369a1", "#f59e0b", "#b45309"],
    atelier: ["#7c2d12", "#fdba74", "#fff7ed", "#9a3412", "#c2410c", "#431407"],
    scene: ["#4c1d95", "#f0abfc", "#fae8ff", "#581c87", "#7e22ce", "#2e1065"],
  }[t] || ["#1e3a8a", "#f59e0b", "#fde68a", "#334155", "#475569", "#1f2937"];
  const y = (r) => Math.round(h * r), x = (r) => Math.round(w * r);
  const cretes = (base, amp, n, graine) => {
    let d = "M0 " + h + " L0 " + y(base);
    for (let i = 1; i <= n; i++) {
      const px = x(i / n);
      const py = y(base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + graine))));
      d += " L" + px + " " + py;
    }
    return d + " L" + w + " " + h + " Z";
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P[0]}"/><stop offset="0.75" stop-color="${P[1]}"/><stop offset="1" stop-color="${P[2]}"/></linearGradient>
    <radialGradient id="astre" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="${P[2]}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#ciel)"/>
  <circle cx="${x(0.68)}" cy="${y(0.42)}" r="${Math.round(Math.min(w, h) * 0.22)}" fill="url(#astre)"/>
  <circle cx="${x(0.68)}" cy="${y(0.42)}" r="${Math.round(Math.min(w, h) * 0.07)}" fill="#fffbeb"/>
  <path d="${cretes(0.62, 0.22, 9, 0.4)}" fill="${P[4]}" opacity="0.75"/>
  <path d="${cretes(0.74, 0.18, 12, 1.9)}" fill="${P[3]}"/>
  <path d="${cretes(0.9, 0.12, 16, 3.1)}" fill="${P[5]}"/>
</svg>`;
}
function avatar(c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="158" r="74" fill="#ffffff" opacity="0.92"/>
  <path d="M60 400 C60 290 130 250 200 250 C270 250 340 290 340 400 Z" fill="#ffffff" opacity="0.92"/>
</svg>`;
}

(async () => {
  const photos = [
    ["photo-paysage.jpg", 1200, 800, "montagne"],
    ["photo-portrait.jpg", 1080, 1350, "foret"],
    ["photo-carre.jpg", 1080, 1080, "ville"],
    ["photo-panorama.jpg", 2000, 700, "plage"],
    ["photo-haute.jpg", 900, 1800, "scene"],
    ["photo-atelier.jpg", 1200, 900, "atelier"],
    ["couverture.jpg", 1080, 720, "plage"],
    ["couverture-evenement.jpg", 1200, 630, "ville"],
  ];
  for (const [nom, w, h, t] of photos) {
    await sharp(Buffer.from(scene(w, h, t))).jpeg({ quality: 82 }).toFile(path.join(DOSSIER, nom));
  }
  const avatars = [["#7c3aed", "#ec4899"], ["#0ea5e9", "#22c55e"], ["#f59e0b", "#ef4444"], ["#14b8a6", "#6366f1"], ["#e11d48", "#f97316"], ["#475569", "#0f172a"]];
  for (let i = 0; i < avatars.length; i++) {
    await sharp(Buffer.from(avatar(avatars[i][0], avatars[i][1]))).jpeg({ quality: 84 }).toFile(path.join(DOSSIER, "avatar-" + (i + 1) + ".jpg"));
  }
  // Boucle vidéo : Playwright enregistre une page animée (WebM/VP8), 540×960, ~4 s.
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "passio-audit-video-"));
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 540, height: 960 }, recordVideo: { dir: tmp, size: { width: 540, height: 960 } } });
  const page = await ctx.newPage();
  await page.setContent(`<style>html,body{margin:0;height:100%;overflow:hidden;background:#1e1b4b}
    .f{position:absolute;inset:0;background:linear-gradient(160deg,#312e81,#be185d 60%,#f59e0b);animation:t 4s linear infinite alternate}
    .b{position:absolute;left:50%;top:50%;width:260px;height:260px;margin:-130px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#fde68a 40%,#f59e0b);animation:r 2s ease-in-out infinite alternate}
    .l{position:absolute;left:0;right:0;bottom:0;height:38%;background:linear-gradient(#0000,#0f172a)}
    @keyframes t{to{filter:hue-rotate(60deg)}} @keyframes r{to{transform:translateY(-140px) scale(.8)}}</style>
    <div class="f"></div><div class="b"></div><div class="l"></div>`);
  await page.waitForTimeout(4200);
  await ctx.close();
  await nav.close();
  const webm = fs.readdirSync(tmp).find((f) => f.endsWith(".webm"));
  if (webm) fs.copyFileSync(path.join(tmp, webm), path.join(DOSSIER, "boucle.webm"));
  console.log("médias fictifs : " + fs.readdirSync(DOSSIER).join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
