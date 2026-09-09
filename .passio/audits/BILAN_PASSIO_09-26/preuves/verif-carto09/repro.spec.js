const { test, expect } = require("/home/user/passio-app/node_modules/@playwright/test");
const { bootVisiteur } = require("/home/user/passio-app/tests/e2e/first-run-helper");
test("CARTO-09 : partage dans mon feed par un visiteur", async ({ page }) => {
  await bootVisiteur(page);
  const r = await page.evaluate(async () => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); return vrai.apply(null, arguments); };
    const p = allFeedPosts()[0];
    sharePost(p.id);
    const btn = document.getElementById("_shareInFeedBtn");
    const ouvert = !!btn;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 500));
    const ev = (typeof allEvents === "function" ? allEvents() : [])[0];
    let evBtn = false;
    if (ev) { shareEvent(ev.id); const b = document.getElementById("_shareEvInFeedBtn"); evBtn = !!b; if (b) b.click(); await new Promise(r => setTimeout(r, 500)); }
    return {
      visiteur: PassioFirstRun.estVisiteur(), MY_UID: typeof MY_UID === "undefined" ? "undef" : MY_UID,
      modaleOuverte: ouvert, evBtn, toasts: window.__toasts,
      gateVisible: !!document.querySelector(".fr-gate-title"),
      modalText: (document.getElementById("modalContent") || {}).textContent || ""
    };
  });
  console.log(JSON.stringify(r, null, 1));
  expect(r.visiteur).toBe(true);
});
