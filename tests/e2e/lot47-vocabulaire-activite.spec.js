// ═══════════════════════════════════════════════════════════════════════════
// LOT-47 (audit UX/UI du 2026-11-10) — UN MOT PAR OBJET
//   ① TRA-C23 / IRL-C62 : l'objet IRL s'appelle « activité » dans l'interface
//      de Rencontrer (création, filtres, recherche, raccourcis) ; le geste,
//      « Je participe ». Les textes de NOTIFICATION reconnus par le serveur ne
//      changent pas.
//   ② IRL-C59 : la feuille à trois états empile titre et description, alignés
//      à gauche, sur une cible de 56 px.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① « activité » et « Je participe » dans Rencontrer", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? (e.getAttribute("placeholder") || e.textContent || "").trim() : null; };
    return {
      recherche: txt("#irlSearchInput") || [...document.querySelectorAll("input")].map((i) => i.getAttribute("placeholder") || "").find((p) => /Rechercher une ville/.test(p)) || null,
      vide: txt("#irlSearchEmpty"),
      voir: txt("#irlFiltersDoneBtn"),
      html: document.documentElement.innerHTML,
    };
  });
  if (r.recherche) expect(r.recherche).toMatch(/une activité/);
  if (r.vide) expect(r.vide).toBe("Aucune activité trouvée pour cette recherche.");
  expect(r.html).not.toMatch(/>Créer un événement</);
  expect(r.html).not.toMatch(/Voir les événements/);
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(400);
  const racc = await page.evaluate(() => [...document.querySelectorAll("#v4a5Raccourcis [data-irlfilter]")].map((b) => b.textContent.trim()));
  if (racc.length) expect(racc).toEqual(["Mes activités", "Je participe"]);
});

test("② IRL-C59 : la feuille à trois états, lisible et à 56 px", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const ev = { id: "ev_l47", title: "Jam du jeudi", passion: "musique", city: "Lyon", lat: 45.76, lng: 4.83, date: Date.now() + 2 * 86400000, time: "19:00", attendees: [], maybes: [], waitlist: [], checkedIn: [], organizerId: "a1b2c3d4-0000-4000-8000-00000000c847", status: "active", maxAttendees: 10 };
    state.userEvents = [ev];
    openEventRsvpSheet("ev_l47");
    await new Promise((res) => setTimeout(res, 100));
    const opts = [...document.querySelectorAll(".rsvp-option")];
    const out = opts.map((o) => {
      const b = o.querySelector("b"), d = o.querySelector("span");
      const rb = b.getBoundingClientRect(), rd = d.getBoundingClientRect(), ro = o.getBoundingClientRect();
      return { h: ro.height, empile: rd.top >= rb.bottom - 1, gauche: Math.abs(rb.left - rd.left) < 2, titre: b.textContent };
    });
    closeModal();
    return out;
  });
  expect(r.length).toBe(3);
  expect(r.map((x) => x.titre)).toEqual(["Je participe", "Peut-être", "Je ne peux pas"]);
  for (const o of r) {
    expect(o.h).toBeGreaterThanOrEqual(56);
    expect(o.empile).toBe(true);
    expect(o.gauche).toBe(true);
  }
});
