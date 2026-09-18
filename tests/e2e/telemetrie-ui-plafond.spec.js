// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — EFFETS UI VISIBLES, ET FLOWS HORS PLAFOND (LOT E, E4)
//
// ① ui_open / ui_close : l'ouverture d'un panneau n'émettait RIEN. La
//    sentinelle (« bouton sans effet ») ne pouvait pas distinguer un bouton
//    mort d'un bouton qui ouvre une fenêtre non instrumentée. openModal émet
//    désormais `ui_open {panel}` avec un identifiant STATIQUE (dérivé d'un
//    `id`/`data-panel` écrit dans le code), jamais le titre — qui peut être un
//    texte de la personne. closeModal émet `ui_close` seulement si une modale
//    ÉTAIT ouverte (elle est appelée « par précaution » un peu partout).
// ② flow et rt_recv sortent du plafond 400/min/onglet : plafonnés, une rafale
//    pouvait laisser passer le `start` d'un flow et jeter son `step`/`end` —
//    « clic mort » ou « non confirmé » FABRIQUÉ par le plafond, alerte high au
//    pilotage pour un défaut qui n'existe pas.
//
// `?telemetry=1` obligatoire (seul opt-in local). Les POST telemetry_events
// sont servis en 201 par une route : rien ne part en production.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_TELEMETRIE = path.join(__dirname, "..", "..", "js", "telemetry.js");

async function bootTel(page) {
  await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
}

test.describe("Télémétrie — panneaux et plafond", () => {

  // MUTATION : retirer `tel.action("ui_open", …)` d'openModal → ① rouge ;
  // dériver le panel du `.modal-title` → le titre libre fuit → ① rouge.
  test("① openModal émet ui_open avec un identifiant statique, jamais le titre ; closeModal émet ui_close une fois", async ({ page }) => {
    await bootTel(page);
    const r = await page.evaluate(() => {
      window.__cap = [];
      window.tel.action = function (name, meta) { window.__cap.push({ name, meta: meta || {} }); };
      const TITRE = "Titre-libre-de-la-personne-NE-DOIT-PAS-FUITER";
      // Un gabarit typique : poignée, titre (texte libre), champ avec un id.
      openModal('<div class="modal-handle"></div><div class="modal-title">' + TITRE + '</div>'
        + '<input id="deleteConfirmInput" placeholder="x"/>');
      closeModal();
      closeModal();                                  // déjà fermée : rien
      // Un id suffixé par un identifiant d'objet redevient sa famille.
      openModal('<div class="modal-title">' + TITRE + '</div><div id="evd-a1b2c3-x"></div>');
      // Remplacement du contenu SANS fermeture : nouvelle ouverture, pas de close.
      openModal('<div data-panel="choix-date"></div><div id="autre9"></div>', undefined);
      // Appelant explicite.
      openModal("<p>sans id</p>", "profil-edit");
      closeModal();
      openModal("<p>sans id</p>");
      closeModal();
      return { cap: window.__cap, titre: TITRE };
    });
    const noms = r.cap.map((e) => e.name + ":" + e.meta.panel);
    expect(noms).toEqual([
      "ui_open:deleteConfirmInput", "ui_close:deleteConfirmInput",
      "ui_open:evd-a", "ui_open:choix-date", "ui_open:profil-edit", "ui_close:profil-edit",
      "ui_open:modal", "ui_close:modal",
    ]);
    for (const e of r.cap) {
      expect(Object.keys(e.meta)).toEqual(["panel"]);
      expect(String(e.meta.panel)).not.toContain(r.titre);
      expect(String(e.meta.panel).length).toBeLessThanOrEqual(40);
    }
  });

  // MUTATION : retirer `flow: 1, rt_recv: 1` de CRITICAL_TYPE (telemetry.js) →
  // ② rouge : sous plafond, l'étape de flow est jetée comme une action.
  test("② au-delà du plafond, action est jetée mais flow et rt_recv passent toujours", async ({ page }) => {
    await bootTel(page);
    const r = await page.evaluate(() => {
      // `track` rend l'identifiant de l'événement quand il est MIS EN FILE,
      // `undefined` quand le plafond ou l'échantillonnage l'ont jeté.
      let dernierAction;
      for (let i = 0; i < 420; i++) dernierAction = window.tel.track("action", "banc_rafale", { meta: { i: i } });
      return {
        actionJetee: dernierAction === undefined,
        flowStep: window.tel.track("flow", "step", { correlation_id: "fl_banc", meta: { step: "saved" } }),
        flowEnd: window.tel.track("flow", "end", { correlation_id: "fl_banc" }),
        recv: typeof window.tel.track("rt_recv", "post", { meta: { postId: "p1" } }),
        actionEncore: window.tel.track("action", "banc_rafale_apres"),
        erreur: typeof window.tel.track("error", "js_error", { message: "banc" }),
      };
    });
    expect(r.actionJetee).toBe(true);
    expect(r.flowStep).toBe("fl_banc");
    expect(r.flowEnd).toBe("fl_banc");
    expect(r.recv).toBe("string");
    expect(r.actionEncore).toBeUndefined();
    expect(r.erreur).toBe("string");
  });

  test("③ contrat de source : CRITICAL_TYPE porte flow et rt_recv, avec son « pourquoi »", async () => {
    const src = fs.readFileSync(SOURCE_TELEMETRIE, "utf8");
    expect(src).toMatch(/var CRITICAL_TYPE = \{ error: 1, connectivity: 1, link: 1, flow: 1, rt_recv: 1 \};/);
  });
});
