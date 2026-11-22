// Sonde 05b — ce que le MediaRecorder du banc sait enregistrer avec un flux de synthèse
// (pour savoir si « aucun vocal envoyé » vient du produit ou du Chromium de Playwright).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, GENS }) => {
  const out = {};
  try {
    await jeu.routes(page);
    await jeu.entrer(page, GENS.ines.nom);
    await page.locator("#convFpInput").tap();     // activation utilisateur réelle
    out.essais = await page.evaluate(async () => {
      const res = [];
      const mimes = [(typeof _passioBestAudioMime === "function") ? _passioBestAudioMime() : "", "audio/webm;codecs=opus", "audio/webm", ""];
      for (const mime of mimes) {
        const r = { mime: mime || "(défaut)", supporte: mime ? MediaRecorder.isTypeSupported(mime) : true };
        try {
          const ctx = new AudioContext(); r.ctx = ctx.state;
          const osc = ctx.createOscillator(); const dst = ctx.createMediaStreamDestination(); osc.connect(dst); osc.start();
          const rec = mime ? new MediaRecorder(dst.stream, { mimeType: mime, audioBitsPerSecond: 128000 }) : new MediaRecorder(dst.stream);
          const chunks = [];
          rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data.size); };
          const fini = new Promise((ok) => { rec.onstop = ok; rec.onerror = (e) => { r.erreur = String(e.error || e.name || "erreur"); ok(); }; });
          rec.start();
          await new Promise((ok) => setTimeout(ok, 1200));
          r.ctxApres = ctx.state; r.etat = rec.state; r.mimeReel = rec.mimeType;
          try { rec.stop(); } catch (e) { r.stopErr = e.message; }
          await Promise.race([fini, new Promise((ok) => setTimeout(ok, 1500))]);
          r.octets = chunks.reduce((a, b) => a + b, 0);
          ctx.close();
        } catch (e) { r.exception = e.message; }
        res.push(r);
      }
      return res;
    });
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
