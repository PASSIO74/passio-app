// ============================================================================
// ADR-009 : LES NOTIFICATIONS D'UN COMPTE EXISTANT PROMETTAIENT ENCORE DES POINTS
// ----------------------------------------------------------------------------
// Le contenu de démonstration est COPIÉ dans l'état à la première ouverture
// (`parsed.notifications = def.seed.notifications.map(…)`, app-02) puis persisté.
// ADR-009 a bien réécrit la graine — mais un compte ouvert AVANT le retrait garde
// sa copie pour toujours. Deux textes, relevés dans la graine d'avant :
//
//   n5  « Nouvelle quête du jour : publie ton premier post 🎨 <b>+15 pts</b> »
//   n6  « Bienvenue sur PASSIO 🎉 Tu as gagné <b>10 💎 Passia</b> de bienvenue. »
//
// Rien ne les nettoyait : `stripLegacyEconomy` traitait `user.score`,
// `transactions`, `quests`… mais pas `notifications`. Et comme `_leanState()`
// recopie `notifications` dans le blob `user_state`, elles voyagent d'appareil en
// appareil — d'où le traitement aux TROIS frontières.
//
// ⚠️ Le filtrage par TEXTE est borné aux notifications écrites PAR L'APP
// (`fromId` absent ou "me"). Une notification qui rapporte le contenu d'un autre
// compte le CITE : la publication d'actualité du contenu de démonstration
// contient « +4 pts » (participation électorale). Le dernier test tient cette
// borne — sans elle, le nettoyage supprimerait une notification réelle.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

const NOTIFS_ANCIENNES = [
  { id: "n5", kind: "quest", fromId: "me", text: "Nouvelle quête du jour : publie ton premier post 🎨 <b>+15 pts</b>", createdAt: Date.now() - 5 * 3600000, unread: false, emoji: "🎯" },
  { id: "n6", kind: "system", fromId: "me", text: "Bienvenue sur PASSIO 🎉 Tu as gagné <b>10 💎 Passia</b> de bienvenue.", createdAt: Date.now() - 6 * 3600000, unread: false, emoji: "✨" },
  { id: "n_rang", kind: "local", text: "🎉 Nouveau rang : <b>Explorateur</b>", createdAt: Date.now() - 7 * 3600000, unread: false, emoji: "🏆" },
  { id: "n_vraie", kind: "comment", fromId: "u_lea", text: "<b>Léa Moreau</b> a réagi à ton post : « participation +4 pts, joli signal 💎 »", createdAt: Date.now() - 3600000, unread: true, emoji: "💬" },
  // Écrite PAR L'APP (fromId "me") mais citant un titre d'activité d'autrui :
  // c'est exactement ce que produit `pushNotification("Tu rejoins <b>…</b>", "🤝")` :
  // le TEXTE n'a plus d'emoji de tête, la PASTILLE (2e argument) le garde.
  { id: "n_rejoint", kind: "local", fromId: "me", text: "Tu rejoins <b>Atelier 💎 Bijoux</b>", createdAt: Date.now() - 2 * 3600000, unread: true, emoji: "🤝" },
];

async function bootAvecAncienEtat(page) {
  await page.addInitScript((st) => {
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, Object.assign(onboardedState(1), { notifications: NOTIFS_ANCIENNES }));
  await bootOnboarded(page);
}

test.describe("ADR-009 — notifications héritées de l'économie retirée", () => {
  test("au chargement, les promesses de points et de Passia disparaissent", async ({ page }) => {
    await bootAvecAncienEtat(page);

    const r = await page.evaluate(() => ({
      ids: (state.notifications || []).map((n) => n.id),
      textes: (state.notifications || []).map((n) => n.text).join(" | "),
    }));

    expect(r.ids).not.toContain("n5");
    expect(r.ids).not.toContain("n6");
    expect(r.ids).not.toContain("n_rang");
    expect(r.textes).not.toMatch(/\+\s*15\s*pts/);
    expect(r.textes).not.toMatch(/Passia/);
  });

  test("la notification d'un AUTRE compte est conservée, même si elle cite « pts » ou « 💎 »", async ({ page }) => {
    await bootAvecAncienEtat(page);

    const r = await page.evaluate(() => {
      const n = (state.notifications || []).find((x) => x.id === "n_vraie");
      return { presente: !!n, texte: n ? n.text : null };
    });

    expect(r.presente, "une notification réelle ne doit jamais être emportée").toBe(true);
    expect(r.texte).toContain("+4 pts");
  });

  test("une notification de l'app qui cite un titre avec 💎 est conservée", async ({ page }) => {
    await bootAvecAncienEtat(page);

    // ⚠️ Le cas limite du filtre : `pushNotification` interpole des titres
    // d'activité et des destinations de carnet, avec `fromId` = "me". Un « 💎 »
    // y est parfaitement légitime — c'est pourquoi il n'est PAS dans le motif.
    const r = await page.evaluate(() => {
      const n = (state.notifications || []).find((x) => x.id === "n_rejoint");
      return { presente: !!n, texte: n ? n.text : null };
    });
    expect(r.presente).toBe(true);
    expect(r.texte).toContain("💎");
  });

  test("rien n'est renvoyé au serveur, et rien n'en revient", async ({ page }) => {
    await bootAvecAncienEtat(page);

    const r = await page.evaluate(() => {
      // Frontière d'ENVOI : le blob synchronisé n'emporte plus ces notifications.
      const envoi = _syncableState();
      const idsEnvoyes = (envoi.notifications || []).map((n) => n.id);

      // Frontière d'HYDRATATION : un vieil appareil repousse le blob d'avant.
      _applyUserState({
        notifications: [
          { id: "n5", kind: "quest", fromId: "me", text: "Nouvelle quête du jour 🎨 <b>+15 pts</b>", createdAt: Date.now(), unread: true, emoji: "🎯" },
          { id: "n_vraie2", kind: "like", fromId: "u_karim", text: "<b>Karim</b> a aimé ton post", createdAt: Date.now(), unread: true, emoji: "💖" },
        ],
      });
      const idsApres = (state.notifications || []).map((n) => n.id);

      return { idsEnvoyes, idsApres, etatVivantIntact: Array.isArray(state.notifications) };
    });

    expect(r.idsEnvoyes).not.toContain("n5");
    expect(r.idsEnvoyes).not.toContain("n6");
    // L'hydratation d'un ancien blob ne les fait pas revenir…
    expect(r.idsApres).not.toContain("n5");
    // …et n'emporte pas ce qui est légitime.
    expect(r.idsApres).toContain("n_vraie2");
    expect(r.etatVivantIntact).toBe(true);
  });
});
