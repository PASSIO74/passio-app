// ═══════════════════════════════════════════════════════════════════════════
// LOT-41 (audit UX/UI du 2026-11-10, MSG-C77) — L'HEURE SOUS LE DERNIER MESSAGE
// D'UNE SÉRIE
//   ① une série (même expéditeur, même jour, < 5 min) n'écrit l'heure que sous
//      son dernier message, et ses bulles se serrent (4 px) ;
//   ② un de mes messages NON PARTI au milieu d'une série garde son statut ;
//   ③ l'heure de chaque message reste dans sa feuille d'actions.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "a1b2c3d4-0000-4000-8000-00000000c841";

async function ouvrir(page, messages) {
  await bootOnboarded(page);
  await page.evaluate(({ autre, messages }) => {
    conversationsState = [{ id: "c_l41", userId: autre, userName: "Léa", lastAt: Date.now(), messages }];
    openConversation("c_l41");
  }, { autre: AUTRE, messages });
  await page.waitForTimeout(200);
}

const T0 = () => { const d = new Date(); d.setHours(10, 0, 0, 0); return d.getTime(); };

test("① une série n'a qu'une heure, et ses bulles se serrent", async ({ page }) => {
  const t = T0();
  await ouvrir(page, [
    { id: "a1", from: "me", text: "un", at: t },
    { id: "a2", from: "me", text: "deux", at: t + 60000 },
    { id: "a3", from: "me", text: "trois", at: t + 120000 },
    { id: "b1", from: AUTRE, text: "réponse", at: t + 10 * 60000 },
    { id: "b2", from: AUTRE, text: "plus tard", at: t + 20 * 60000 },
  ]);
  const r = await page.evaluate(() => {
    const heure = (id) => {
      const w = document.querySelector('#convFpThread .conv-bubble-wrap[data-mid="' + id + '"]');
      const t = w.querySelector(".conv-bubble-time");
      return { heure: t && t.offsetParent ? (t.textContent.match(/\d\d:\d\d/) || [""])[0] : "", serie: w.classList.contains("conv-serie"), marge: getComputedStyle(w).marginBottom };
    };
    return ["a1", "a2", "a3", "b1", "b2"].map(heure);
  });
  expect(r.map((x) => x.heure)).toEqual(["", "", "10:02", "10:10", "10:20"]);
  expect(r.map((x) => x.serie)).toEqual([true, true, false, false, false]);
  expect(r[0].marge).toBe("4px");
});

test("② un message non parti au milieu d'une série garde son statut", async ({ page }) => {
  const t = T0();
  await ouvrir(page, [
    { id: "c1", from: "me", text: "un", at: t, status: "failed" },
    { id: "c2", from: "me", text: "deux", at: t + 60000 },
  ]);
  const r = await page.evaluate(() => {
    const st = document.querySelector('#convFpThread [data-msgst="c1"] .msg-st-echec');
    return { visible: !!(st && st.offsetParent), texte: st && st.textContent };
  });
  expect(r.visible).toBe(true);
  expect(r.texte).toBe("Non envoyé · réessayer");
});

test("③ l'heure est en tête de la feuille d'actions", async ({ page }) => {
  const t = T0();
  await ouvrir(page, [
    { id: "d1", from: AUTRE, text: "un", at: t },
    { id: "d2", from: AUTRE, text: "deux", at: t + 60000 },
  ]);
  const h = await page.evaluate(() => {
    _openMsgActions("c_l41", "d1");
    const e = document.querySelector(".msg-actions-heure");
    const out = e && e.textContent;
    closeModal();
    return out;
  });
  expect(h).toBe("Reçu aujourd'hui à 10:00");
});
