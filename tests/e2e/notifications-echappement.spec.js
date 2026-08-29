// ============================================================================
// XSS STOCKÉE DANS LES NOTIFICATIONS (2026-08-29)
// ----------------------------------------------------------------------------
// `_notifListHtml` insérait `n.text` BRUT : `<div class="notif-text">${n.text}</div>`.
//
// Or une notification venue de Supabase porte `notifications.content`, texte
// libre insérable par TOUT compte authentifié — même famille que
// `comment_interactions` et `event_reactions`, que CLAUDE.md impose d'échapper
// à l'affichage. Mesuré avant correctif : une charge `<img src=x onerror=…>`
// s'EXÉCUTAIT dans le panneau de la victime.
//
// ⚠️ Pourquoi le correctif n'est PAS un `escapeHtml` global : les notifications
// LOCALES portent du HTML VOULU. `pushNotification` compose « Tu rejoins
// <b>…</b> » en ayant déjà échappé la partie variable, et le contenu de
// démonstration fait de même. Les échapper toutes afficherait « &lt;b&gt; ».
//
// La confiance est donc EXPLICITE et le défaut est le refus : `html: true` pour
// les producteurs du dépôt, `kind === "local"` pour les notifications déjà
// persistées avant que le drapeau n'existe, tout le reste est échappé.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const CHARGE = '<img src=x onerror="window.__XSS_NOTIF=true">Léa a aimé';

async function poserEtOuvrir(page, notif) {
  return page.evaluate(async (n) => {
    window.__XSS_NOTIF = false;
    state.notifications = [n];
    saveState();
    openNotifications();
    await new Promise((r) => setTimeout(r, 600));
    const el = document.querySelector(".notif-text");
    return {
      texte_affiche: el ? el.textContent : "(absent)",
      html_rendu: el ? el.innerHTML : "(absent)",
      balise_injectee: !!document.querySelector(".notif-text img"),
      script_execute: !!window.__XSS_NOTIF,
      gras_present: !!document.querySelector(".notif-text b"),
    };
  }, notif);
}

test.describe("le texte d'une notification", () => {
  test("venu de Supabase est ÉCHAPPÉ : aucune balise, aucun script", async ({ page }) => {
    await bootOnboarded(page);
    const r = await poserEtOuvrir(page, {
      id: "n_xss", kind: "like", fromId: "u_autre", text: CHARGE,
      emoji: "❤️", createdAt: Date.now(), unread: true, fromSupabase: true,
    });

    expect(r.script_execute, "aucun script ne doit s'exécuter").toBe(false);
    expect(r.balise_injectee, "aucune balise ne doit être créée").toBe(false);
    // Garde anti-creux : le texte doit être AFFICHÉ, pas simplement absent.
    expect(r.texte_affiche).toContain("Léa a aimé");
  });

  test("d'une notification LOCALE garde son gras voulu", async ({ page }) => {
    await bootOnboarded(page);
    const r = await poserEtOuvrir(page, {
      id: "n_local", kind: "local", fromId: "me",
      text: "🤝 Tu rejoins <b>Jam session</b>",
      emoji: "🤝", createdAt: Date.now(), unread: true, html: true,
    });

    expect(r.gras_present, "le <b> voulu doit être rendu").toBe(true);
    expect(r.texte_affiche).toContain("Jam session");
    // Et surtout : pas d'entité affichée littéralement.
    expect(r.texte_affiche).not.toContain("&lt;");
  });

  // Les comptes existants ont des notifications locales PERSISTÉES écrites
  // avant que `html` n'existe. Elles ne portent que `kind: "local"`.
  test("d'une notification locale ANCIENNE, sans le drapeau, garde son gras", async ({ page }) => {
    await bootOnboarded(page);
    const r = await poserEtOuvrir(page, {
      id: "n_ancienne", kind: "local", fromId: "me",
      text: "📔 Ton carnet <b>Lisbonne</b> est en ligne",
      emoji: "📔", createdAt: Date.now(), unread: false,
    });
    expect(r.gras_present).toBe(true);
    expect(r.texte_affiche).not.toContain("&lt;");
  });

  // Le défaut est le REFUS : un producteur futur qui oublie de se déclarer
  // doit être échappé, pas exécuté.
  test("d'une source inconnue, non déclarée, est échappé", async ({ page }) => {
    await bootOnboarded(page);
    const r = await poserEtOuvrir(page, {
      id: "n_inconnue", kind: "quelque_chose_de_neuf", fromId: "u_autre",
      text: CHARGE, emoji: "✨", createdAt: Date.now(), unread: true,
    });
    expect(r.script_execute).toBe(false);
    expect(r.balise_injectee).toBe(false);
  });
});
