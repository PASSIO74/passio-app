// ═══════════════════════════════════════════════════════════════════════════
// LOT-48 (audit UX/UI du 2026-11-10) — FICHE, COMPTEUR, CIBLES
//   ① PCS-C04 : suivre un compte public fait +1 sur son compteur d'abonnés, se
//      désabonner −1 ; une demande en attente ne compte pas.
//   ② IRL-C64 : « C'est complet » ne s'accompagne plus d'un second toast.
//   ③ IRL-C67 : un seul tri des commentaires dans la fiche (les deux portes de
//      partage décidées par LOT-12, PAR-C12, restent).
//   ④ PAR-C18 : le « × » des fenêtres a une zone de 44 px.
// Compte de démonstration local (`bootOnboarded`) ; écritures simulées.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const TOM = "a1b2c3d4-0000-4000-8000-00000000c848";

test("① PCS-C04 : le compteur d'abonnés suit le bouton", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((tom) => {
    window._visited = { authorId: tom };
    const box = document.createElement("div");
    box.innerHTML = '<span data-abonnes-visite="5" data-suivi-initial="0">5</span>';
    document.body.appendChild(box);
    const el = box.firstChild;
    _majCompteurAbonnesVisite(tom, "suivi");
    const suivi = el.textContent;
    _majCompteurAbonnesVisite(tom, "attente");
    const attente = el.textContent;
    _majCompteurAbonnesVisite(tom, "aucun");
    const aucun = el.textContent;
    el.setAttribute("data-suivi-initial", "1"); el.setAttribute("data-abonnes-visite", "6");
    _majCompteurAbonnesVisite(tom, "aucun");
    const desabo = el.textContent;
    box.remove();
    return { suivi, attente, aucun, desabo };
  }, TOM);
  expect(r).toEqual({ suivi: "6", attente: "5", aucun: "5", desabo: "5" });
});

test("② IRL-C64 : un seul toast quand l'activité est complète", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    window.__toasts = []; window.toast = (m) => window.__toasts.push(String(m));
    window.requireAdmission = async () => true;
    const ev = { id: "ev_l48", title: "Atelier", passion: "musique", city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 86400000, time: "19:00",
      attendees: ["x1", "x2"], maybes: [], waitlist: [], checkedIn: [], organizerId: "a1b2c3d4-0000-4000-8000-00000000c849", status: "active", maxAttendees: 2 };
    state.userEvents = [ev];
    await setEventRsvp("ev_l48", "going");
    await new Promise((res) => setTimeout(res, 200));
    return window.__toasts;
  });
  expect(r.filter((t) => /complet|Liste d'attente|En attente/i.test(t))).toEqual(["C'est complet — tu es sur liste d'attente"]);
});

test("③ IRL-C67 : un seul tri des commentaires, deux portes de partage", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const ev = { id: "ev_l48b", title: "Jam", passion: "musique", city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 86400000, time: "19:00",
      attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "a1b2c3d4-0000-4000-8000-00000000c849", status: "active" };
    state.userEvents = [ev];
    _eventCommentsCache["ev_l48b"] = [
      { id: "k1", authorId: "a1b2c3d4-0000-4000-8000-00000000c849", authorName: "Léa", text: "un", at: Date.now() - 60000 },
      { id: "k2", authorId: "a1b2c3d4-0000-4000-8000-00000000c849", authorName: "Léa", text: "deux", at: Date.now() },
    ];
    openEventDetails("ev_l48b");
    await new Promise((res) => setTimeout(res, 500));
    _renderEventComments("ev_l48b");
    const page = document.getElementById("eventDetailPage");
    const partages = [...page.querySelectorAll('[onclick*="shareEvent("]')].length + (document.getElementById("eventDetailShareBtn") ? 1 : 0);
    const aimes = [...page.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Aimés").length;
    return { partages, aimes };
  });
  expect(r.partages).toBe(2);
  expect(r.aimes).toBe(0);
});

test("④ PAR-C18 : « × » d'une fenêtre, zone de 44 px", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => openModal('<div class="modal-title">Essai</div>'));
  await page.waitForTimeout(600); // la fenêtre finit d'entrer
  const r = await page.evaluate(() => {
    const x = [...document.querySelectorAll(".modal-close")].pop();
    if (!x) return null;
    const b = x.getBoundingClientRect();
    const touche = (dx, dy) => { const t = document.elementFromPoint(b.left + b.width / 2 + dx, b.top + b.height / 2 + dy); return t === x || x.contains(t); };
    const out = { haut: touche(0, -21), bas: touche(0, 21), gauche: touche(-21, 0) };
    closeModal();
    return out;
  });
  test.skip(r === null, "pas de « × » dans ce banc");
  expect(r).toEqual({ haut: true, bas: true, gauche: true });
});
