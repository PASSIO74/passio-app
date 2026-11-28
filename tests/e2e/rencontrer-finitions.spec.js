// Rencontrer — finitions du 2026-11-28 (sujets 137 et .ics).
//
//   ① une activité REPORTÉE dans le même palier : le rappel de la cloche prend
//      la NOUVELLE heure (la marque `<id>:<palier>` sans date le taisait) ;
//   ② une marque ANCIENNE (sans date) reste valable tant que rien ne prouve un
//      report : pas de rappel de plus au déploiement ;
//   ③ l'export .ics neutralise le retour chariot NU : un titre ne peut pas
//      ajouter de propriété au calendrier importé.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const EVENT_SEED = "e1";

test.describe("Rencontrer — finitions", () => {
  test("① activité reportée dans le même palier : le rappel prend la nouvelle heure", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((id) => {
      localStorage.removeItem("passio_event_reminded");
      const ev = state.seed.events.find((e) => e.id === id);
      ev.status = "active";
      ev.date = Date.now() + 20 * 3600e3;          // palier J-1
      state.user.joinedEvents = [id];
      state.notifications = [];
      _checkEventReminders();
      const avant = state.notifications.filter((n) => n.kind === "event_reminder" && n.refId === id);
      const dateAvant = avant[0] && avant[0].dateActivite;
      ev.date = ev.date + 3 * 3600e3;               // reportée de 3 h : toujours J-1
      _checkEventReminders();
      _checkEventReminders();
      const apres = state.notifications.filter((n) => n.kind === "event_reminder" && n.refId === id);
      return { avant: avant.length, apres: apres.length, dateAvant,
        dateApres: apres[0] && apres[0].dateActivite, attendu: ev.date };
    }, EVENT_SEED);
    expect(r.avant).toBe(1);
    expect(r.apres, "un seul rappel subsiste").toBe(1);
    expect(r.dateApres, "le rappel porte la date reportée").toBe(r.attendu);
    expect(r.dateApres).not.toBe(r.dateAvant);
  });

  test("② une marque ancienne sans date ne fait pas re-sonner un rappel inchangé", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((id) => {
      const ev = state.seed.events.find((e) => e.id === id);
      ev.status = "active";
      ev.date = Date.now() + 20 * 3600e3;
      state.user.joinedEvents = [id];
      // Ce qu'un appareil a laissé avant le correctif : marque sans date, et le
      // rappel déjà dans la cloche… puis effacé par la personne.
      localStorage.setItem("passio_event_reminded", JSON.stringify([id + ":d1"]));
      state.notifications = [];
      _checkEventReminders();
      const sansReport = state.notifications.filter((n) => n.kind === "event_reminder").length;
      // Même marque ancienne, mais la cloche prouve un report.
      state.notifications = [{ id: "rappel_" + id + ":d1", kind: "event_reminder", refId: id, palier: "d1",
        dateActivite: ev.date - 3 * 3600e3, text: "Rappel", createdAt: Date.now() - 6e4, unread: false, emoji: "⏰", fromId: "me", html: true }];
      _checkEventReminders();
      const l = state.notifications.filter((n) => n.kind === "event_reminder");
      return { sansReport, avecReport: l.length, date: l[0] && l[0].dateActivite, attendu: ev.date };
    }, EVENT_SEED);
    expect(r.sansReport, "rien ne prouve un report : la marque ancienne vaut").toBe(0);
    expect(r.avecReport).toBe(1);
    expect(r.date, "le report prouvé par la cloche rejoue le palier").toBe(r.attendu);
  });

  test("③ .ics : un retour chariot nu dans le titre n'ajoute aucune ligne au calendrier", async ({ page }) => {
    await bootOnboarded(page);
    const ics = await page.evaluate(async (id) => {
      const ev = state.seed.events.find((e) => e.id === id);
      ev.status = "active";
      ev.date = Date.now() + 5 * 86400e3;
      ev.title = "Sortie\rATTENDEE:mailto:x@x.fr";
      ev.desc = "a\r\nb\rc";
      let texte = null;
      const vrai = URL.createObjectURL;
      URL.createObjectURL = (b) => { b.text().then((t) => { texte = t; }); return "blob:x"; };
      const clic = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      try { downloadEventIcs(id); } finally { HTMLAnchorElement.prototype.click = clic; }
      for (let i = 0; i < 50 && texte == null; i++) await new Promise((r) => setTimeout(r, 20));
      URL.createObjectURL = vrai;
      return texte;
    }, EVENT_SEED);
    expect(ics).toBeTruthy();
    const lignes = ics.split(/\r\n|\r|\n/);
    expect(lignes.some((l) => /^ATTENDEE:/.test(l)), "aucune propriété injectée").toBe(false);
    expect(lignes.find((l) => l.startsWith("SUMMARY:"))).toBe("SUMMARY:Sortie\\nATTENDEE:mailto:x@x.fr");
    expect(lignes.find((l) => l.startsWith("DESCRIPTION:a"))).toBe("DESCRIPTION:a\\nb\\nc");
  });
});
