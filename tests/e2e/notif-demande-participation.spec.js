// ============================================================================
// DEMANDE DE PARTICIPATION DANS LES NOTIFICATIONS (2026-11-23, retour de Benjamin)
// ----------------------------------------------------------------------------
// ① Le serveur (`inscription_tracee`) écrit « demande à participer à ton
//    activité » SANS nom : la ligne doit nommer la personne (depuis `fromId`,
//    jamais depuis `content`) et l'activité.
// ② L'organisation valide ou refuse DEPUIS la notification.
// ③ Toucher la ligne ouvre DIRECTEMENT la liste de validation, la personne en
//    tête — avant, la fiche de l'activité seule, sans rien à faire.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poser(page) {
  return page.evaluate(() => {
    const u = state.seed.users.find((x) => x && x.id && x.name);
    const ev = { id: "ev_notif_join", title: "Atelier « poterie »", organizerId: MY_UID, authorId: MY_UID,
      date: Date.now() + 864e5, fromSupabase: true };
    window._findCanonicalEvent = (id) => (id === ev.id ? ev : null);
    window._canManageEvent = (e) => !!e && e.id === ev.id;
    window.openEventDetails = (id) => { window.__detail = id; };
    const n = { id: "n_rv_test", kind: "event_join", fromId: u.id, refId: ev.id,
      text: "demande à participer à ton activité", emoji: "🤝", createdAt: Date.now(),
      unread: true, fromSupabase: true };
    state.notifications = [n];
    return { nom: u.name, uid: u.id };
  });
}

test.describe("notification « demande à participer »", () => {
  test("① nomme la personne et l'activité ; ② Valider tranche depuis la notification", async ({ page }) => {
    await bootOnboarded(page);
    const { nom, uid } = await poser(page);
    const r = await page.evaluate(async () => {
      openNotifications();
      await new Promise((res) => setTimeout(res, 300));
      const texte = document.querySelector(".notif-text").textContent;
      const boutons = Array.from(document.querySelectorAll(".notif-demande-actions .btn")).map((b) => b.textContent);
      const appels = [];
      const ancien = supa;
      window._supaReal = true;
      supa = { rpc: async (f, a) => { appels.push({ f, a }); return { data: true, error: null }; } };
      try {
        document.querySelector(".notif-demande-actions .btn.primary").click();
        await new Promise((res) => setTimeout(res, 300));
      } finally { supa = ancien; }
      return { texte, boutons, appels, verdict: (document.querySelector(".notif-demande-verdict") || {}).textContent || "",
        detailOuvert: window.__detail || null };
    });
    expect(r.texte).toContain(nom);
    expect(r.texte).toContain("Atelier « poterie »");
    expect(r.boutons).toEqual(["Valider", "Refuser"]);
    expect(r.appels).toEqual([{ f: "valider_participant", a: { p_event_id: "ev_notif_join", p_user_id: uid, p_accepter: true } }]);
    expect(r.verdict).toContain("validée");
    // Le bouton ne déclenche pas aussi la ligne.
    expect(r.detailOuvert).toBeNull();
  });

  test("③ toucher la ligne ouvre directement la validation, la personne en tête", async ({ page }) => {
    await bootOnboarded(page);
    const { uid } = await poser(page);
    const r = await page.evaluate(async () => {
      window.__valid = null;
      window.openEventParticipantValidation = (id, focus) => { window.__valid = { id, focus }; };
      openNotifications();
      await new Promise((res) => setTimeout(res, 300));
      document.querySelector(".notif-row .notif-text").click();
      await new Promise((res) => setTimeout(res, 200));
      return { detail: window.__detail, valid: window.__valid };
    });
    expect(r.detail).toBe("ev_notif_join");
    expect(r.valid).toEqual({ id: "ev_notif_join", focus: uid });
  });

  test("une personne qui n'organise pas l'activité ne voit pas les boutons", async ({ page }) => {
    await bootOnboarded(page);
    await poser(page);
    const n = await page.evaluate(async () => {
      window._canManageEvent = () => false;
      openNotifications();
      await new Promise((res) => setTimeout(res, 300));
      return document.querySelectorAll(".notif-demande-actions .btn").length;
    });
    expect(n).toBe(0);
  });
});
