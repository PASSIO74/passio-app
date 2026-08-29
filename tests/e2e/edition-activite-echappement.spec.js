// ============================================================================
// ÉDITION D'UNE ACTIVITÉ : LE TEXTE REVIENT TEL QU'IL A ÉTÉ SAISI (2026-08-29)
// ----------------------------------------------------------------------------
// Le formulaire d'édition construit ses valeurs avec un helper local `v()` qui
// ÉCHAPPE DÉJÀ (`escapeHtml(String(...))`, app-07 l. ~4661). Dix des onze
// appels le ré-enveloppaient dans un second `escapeHtml()`.
//
// Mesuré avant correctif, sur une activité réelle :
//   titre   « Atelier d'Été & Co »   →  « Atelier d&#39;Été &amp; Co »
//   lieu    « Café d'Or »            →  « Café d&#39;Or »
//   ville   « L'Haÿ-les-Roses »      →  « L&#39;Haÿ-les-Roses »
//
// Et le défaut ne s'arrêtait pas à l'affichage : en enregistrant, l'utilisateur
// PERSISTE la valeur corrompue, donc chaque édition aggrave la corruption
// (`&#39;` puis `&amp;#39;` puis…). Le textarea `evDesc` était le seul appel
// correct — il sert de témoin dans ce fichier.
//
// ⚠️ Retirer un `escapeHtml` demande de prouver qu'on n'ouvre pas une sortie
// d'attribut. `escapeHtml` échappe `& < > " '` : un seul passage suffit pour un
// `value="…"`. Le second test le vérifie sur une charge réelle plutôt que de
// s'en remettre au raisonnement.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function ouvrirEdition(page, champs) {
  return page.evaluate((c) => {
    const ev = Object.assign({
      id: "ev_edit", passion: "cuisine", date: Date.now() + 3 * 86400000,
      time: "14:00", price: 12, maxAttendees: 10, attendees: [], ownerId: "me",
    }, c);
    state.userEvents = [ev];
    state.seed.events = [];
    saveState();
    openCreateEvent(ev.id);
    const g = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
    return {
      titre: g("evTitle"), ville: g("evCity"), lieu: g("evVenue"),
      adresse: g("evAddress"), contact: g("evContact"), description: g("evDesc"),
    };
  }, champs);
}

test.describe("édition d'une activité", () => {
  test("les apostrophes et les esperluettes reviennent telles quelles", async ({ page }) => {
    await bootOnboarded(page);
    const r = await ouvrirEdition(page, {
      title: "Atelier d'Été & Co",
      city: "L'Haÿ-les-Roses",
      venue: "Café d'Or",
      address: "3 rue de l'Église",
      contact: "a&b@test.fr",
      desc: "Venez nombreux & curieux",
    });

    expect(r.titre).toBe("Atelier d'Été & Co");
    expect(r.ville).toBe("L'Haÿ-les-Roses");
    expect(r.lieu).toBe("Café d'Or");
    expect(r.adresse).toBe("3 rue de l'Église");
    expect(r.contact).toBe("a&b@test.fr");
    // Témoin : ce champ était déjà correct avant le correctif. S'il casse, c'est
    // que le helper lui-même a changé, pas les appels.
    expect(r.description).toBe("Venez nombreux & curieux");

    // Aucune entité HTML ne doit apparaître dans un champ de saisie.
    Object.entries(r).forEach(([k, val]) => {
      expect(String(val), k).not.toMatch(/&(amp|#39|quot|lt|gt);/);
    });
  });

  test("une tentative de sortie d'attribut reste neutralisée", async ({ page }) => {
    await bootOnboarded(page);
    const charge = '" onfocus="window.__XSS_EDITION=1" x="';
    const r = await ouvrirEdition(page, { title: charge, city: "Paris" });

    // La valeur revient littéralement — donc elle a été traitée comme du TEXTE,
    // pas comme du balisage.
    expect(r.titre).toBe(charge);

    // Et le handler n'a pas été posé : on met le focus, puis on regarde.
    const pose = await page.evaluate(() => {
      const el = document.getElementById("evTitle");
      if (el) el.focus();
      return {
        attribut: el ? el.getAttribute("onfocus") : "absent",
        marqueur: !!window.__XSS_EDITION,
      };
    });
    expect(pose.attribut).toBe(null);
    expect(pose.marqueur).toBe(false);
  });
});
