// Aides communes aux sondes et aux scénarios du domaine « partage ».
// Rien ici ne modifie l'application : ce sont des lectures et des gestes.
"use strict";

// Les toasts à l'écran, et pour chacun s'il est RÉELLEMENT visible (le premier
// élément sous son centre est-il lui-même ?). Fonction sérialisée dans la page.
function toastsVisibles() {
  return Array.from(document.querySelectorAll("#toastStack .toast")).map(function (t) {
    var r = t.getBoundingClientRect();
    var top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      txt: t.innerText, type: t.className.replace("toast", "").trim(),
      visible: top === t || t.contains(top),
      auDessus: top ? (top.id || String(top.className).slice(0, 40) || top.tagName) : null,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    };
  });
}

// Exécute une étape ; un échec est NOTÉ (et la sonde continue) au lieu de tout perdre.
async function etape(out, nom, fn) {
  try { out[nom] = await fn(); }
  catch (e) { out[nom] = { ECHEC: String(e && e.message ? e.message.split("\n")[0] : e) }; }
  return out[nom];
}

// Amène une carte du fil au centre de l'écran (le fil est repeint une fois après
// le démarrage : un `scrollIntoViewIfNeeded` trop tôt tombe sur un nœud détaché).
async function centrerCarte(page, postId) {
  await page.waitForFunction((id) => !!document.querySelector('#screen-feed .post[data-postid="' + id + '"]'), postId, { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.evaluate((id) => { const c = document.querySelector('#screen-feed .post[data-postid="' + id + '"]'); if (c) c.scrollIntoView({ block: "center" }); }, postId);
  await page.waitForTimeout(350);
  return page.locator('#screen-feed .post[data-postid="' + postId + '"]').first();
}

// Simule la présence de la feuille de partage du système : `navigator.share`
// existe et note ce qu'on lui confie. `issue` : "ok" | "annule" | "refuse".
async function simulerPartageNatif(page, issue) {
  await page.evaluate((i) => {
    window.__partages = window.__partages || [];
    navigator.share = function (d) {
      window.__partages.push(d);
      if (i === "annule") return Promise.reject(Object.assign(new Error("Share canceled"), { name: "AbortError" }));
      if (i === "refuse") return Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
      return Promise.resolve();
    };
  }, issue || "ok");
}
async function retirerPartageNatif(page) { await page.evaluate(() => { try { delete navigator.share; } catch (e) {} }); }

// La feuille basse ouverte : texte, boutons et leurs tailles.
function lireFeuille() {
  var c = document.getElementById("modalContent");
  var b = document.getElementById("modalBackdrop");
  var m = document.querySelector(".modal");
  return {
    ouverte: b.classList.contains("active"),
    texte: c.innerText,
    fermetures: c.querySelectorAll(".modal-close").length,
    poignee: !!c.querySelector(".modal-handle"),
    hauteur: m ? Math.round(m.getBoundingClientRect().height) : null,
    boutons: Array.from(c.querySelectorAll("button, a.btn")).filter(function (x) { return x.getBoundingClientRect().width > 0; }).map(function (x) {
      var r = x.getBoundingClientRect();
      return { t: (x.innerText || x.getAttribute("aria-label") || "").trim().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height * 10) / 10, fs: getComputedStyle(x).fontSize, cls: String(x.className).slice(0, 40) };
    }),
  };
}

module.exports = { toastsVisibles, etape, centrerCarte, simulerPartageNatif, retirerPartageNatif, lireFeuille };
