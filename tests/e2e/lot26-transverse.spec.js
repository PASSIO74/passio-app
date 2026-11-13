// ═══════════════════════════════════════════════════════════════════════════
// LOT-26 (audit UX/UI du 2026-11-10) — TRANSVERSES ET FIL (SUITE)
//   ① TRA-C18 : une seule réponse de signalement ; un doublon le dit, un vrai
//      échec invite à réessayer.
//   ② TRA-C14 : les j'aime d'une même publication tiennent en UNE ligne.
//   ③ FIL-C21 / C27 : pas de commandes natives avant la lecture ; la
//      publication d'un compte privé porte « Abonnés ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① TRA-C18 : une réponse unique, le doublon dit comme tel", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const vus = [];
    const t0 = window.toast;
    window.toast = (m) => { vus.push(String(m)); };
    window._dernierSignalementMotif = null; messageSignalement(true);
    window._dernierSignalementMotif = "doublon"; messageSignalement(false);
    window._dernierSignalementMotif = "reseau"; messageSignalement(false);
    window.toast = t0;
    return vus;
  });
  expect(r[0]).toMatch(/^Signalement envoyé/);
  expect(r[1]).toContain("déjà signalé");
  expect(r[2]).toBe("Signalement non envoyé — réessaie");
});

test("② TRA-C14 : trois j'aime d'une publication → une ligne", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.seed.users = (state.seed.users || []).concat([
      { id: "u_l26_a", name: "Léa" }, { id: "u_l26_b", name: "Malik" }, { id: "u_l26_c", name: "Inès" },
    ]);
    const t = Date.now();
    state.notifications = [
      { id: "n1", kind: "like", refId: "p_l26", fromId: "u_l26_a", text: "<b>Léa</b> a aimé ton post", createdAt: t, unread: true },
      { id: "n2", kind: "like", refId: "p_l26", fromId: "u_l26_b", text: "<b>Malik</b> a aimé ton post", createdAt: t - 1000, unread: false },
      { id: "n3", kind: "like", refId: "p_l26", fromId: "u_l26_c", text: "<b>Inès</b> a aimé ton post", createdAt: t - 2000, unread: false },
      { id: "n4", kind: "follow", fromId: "u_l26_a", text: "<b>Léa</b> te suit", createdAt: t - 3000, unread: false },
    ];
    openNotifications();
    const lignes = Array.from(document.querySelectorAll("#modalContent .notif-row .notif-text")).map((x) => x.textContent.trim());
    return lignes;
  });
  expect(r).toHaveLength(2);
  expect(r[0]).toBe("Léa, Malik et 1 autre ont aimé ta publication");
});

test("③ FIL-C21 / C27 : commandes natives après la lecture ; « Abonnés » sur un compte privé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const html = videoPubliqueHTML("https://exemple.passio.test/v.mp4");
    const box = document.createElement("div");
    box.innerHTML = renderPostHTML({ id: "p_l26_prive", authorId: "a1b2c3d4-0000-4000-8000-00000000c0b1", authorName: "Inès", authorPrive: true, passion: "musique", mood: "all", type: "text", text: "Réservé", createdAt: Date.now(), likes: 0, comments: [], fromSupabase: true });
    return { controls: /<video[^>]*\scontrols[\s>]/.test(html), prive: (box.querySelector(".post-prive") || {}).textContent || "" };
  });
  expect(r.controls, "pas de barre native superposée à « ▶ Lire »").toBe(false);
  expect(r.prive).toContain("Abonnés");
});
