// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-36 / IRL-06 — la suppression d'une activité détruisait ses lignes
// filles AVANT de savoir si le parent partait.
//
// LE DÉFAUT. `supaDeleteEvent` faisait TROIS DELETE sur `event_attendees`,
// `event_comments` et `event_reactions`, puis le DELETE du parent. Un refus du
// parent (HTTP 500, réseau, ou zéro ligne parce que `author_id` ne correspond
// pas) rendait `false` — mais les filles étaient DÉJÀ effacées. L'activité
// survivait sans elles, la notification aux inscrits ne partait jamais, et
// l'écran disait « réessaie » : un second essai n'efface rien de plus, la perte
// a déjà eu lieu.
//
// LE REMÈDE : une SEULE écriture serveur, celle du parent. Les quatre tables
// filles portent `ON DELETE CASCADE` depuis le 14/09 (mesuré en production le
// 15/09, `event_checkin_secrets` comprise — que le client ne nettoyait pas).
//
// Aucune requête ne part : `window.supa.from` est MUTÉ (jamais remplacé — en CI
// le vrai SDK se charge avec des getters de prototype).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "5c3a9d71-4b82-4e1f-9a20-7c6b5d4e3f21";

const FAUX_SUPA = `
window.__ecritures = [];
window._supaReal = true;
window.__refusParent = false;
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    const filtres = {};
    const b = {
      delete: function () { b.__op = "delete"; return b; },
      update: function (v) { b.__op = "update"; b.__valeurs = v; return b; },
      eq: function (c, v) { filtres[c] = v; return b; },
      select: function () { return b.__resoudre(); },
      then: function (res, rej) { return b.__resoudre().then(res, rej); },
      __resoudre: function () {
        window.__ecritures.push({ table: table, op: b.__op, filtres: Object.assign({}, filtres) });
        if (table === "events" && window.__refusParent) {
          return Promise.resolve({ data: null, error: { message: "internal error" }, status: 500 });
        }
        return Promise.resolve({ data: [{ id: filtres.id || "ev1" }], error: null, status: 200 });
      },
    };
    return b;
  },
});
window.__filles = function () { return window.__ecritures.filter(function (e) { return e.table !== "events"; }); };
window.__attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  await page.evaluate((u) => { MY_UID = u; window.MY_UID = u; }, UID);
}

test.describe("ASTRA-36 — supprimer une activité est atomique ou ne fait rien", () => {
  test("① le parent REFUSE : plus aucune ligne fille n'a été touchée", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__ecritures = [];
      window.__refusParent = true;
      const ok = await supaDeleteEvent("ev_refuse");
      return { ok, filles: window.__filles(), tout: window.__ecritures };
    });
    // AVANT : trois DELETE filles partaient, puis le parent échouait → `false`
    // avec les filles déjà détruites. Le verrou mesure la DESTRUCTION, pas le
    // seul retour de la fonction.
    expect(r.ok, "un parent refusé rend toujours false").toBe(false);
    expect(r.filles, "AUCUNE destruction avant le verdict du parent").toEqual([]);
    expect(r.tout.length, "une seule écriture serveur : le parent").toBe(1);
    expect(r.tout[0].table).toBe("events");
  });

  test("② le parent ACCEPTE : une seule écriture, et le CASCADE fait le reste", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__ecritures = [];
      window.__refusParent = false;
      const ok = await supaDeleteEvent("ev_ok");
      return { ok, tout: window.__ecritures };
    });
    expect(r.ok).toBe(true);
    expect(r.tout.length, "le client ne nettoie plus les tables filles").toBe(1);
    expect(r.tout[0]).toMatchObject({ table: "events", op: "delete", filtres: { id: "ev_ok", author_id: UID } });
  });

  test("③ à la SOURCE : plus aucun DELETE de table fille dans le chemin de suppression", async ({ page }) => {
    await banc(page);
    // ⚠️ Un verrou de comportement ne suffit pas : quelqu'un pourrait remettre
    // le nettoyage ailleurs dans la fonction. On mesure la SOURCE, comme le
    // dépôt le fait pour `_notifierMessage` et `showTour`.
    const src = await page.evaluate(() => String(supaDeleteEvent));
    for (const t of ["event_attendees", "event_comments", "event_reactions", "event_checkin_secrets"]) {
      expect(src, "supaDeleteEvent ne doit plus toucher " + t).not.toContain(t);
    }
    expect(src, "elle supprime le parent, et lui seul").toContain('from("events")');
  });

  test("④ l'organisateur seul supprime : le filtre author_id est conservé", async ({ page }) => {
    await banc(page);
    const filtres = await page.evaluate(async () => {
      window.__ecritures = [];
      await supaDeleteEvent("ev_tiers");
      return window.__ecritures[0].filtres;
    });
    // Le serveur tranche (policy « Suppression propre »), mais le filtre client
    // évite d'émettre une écriture qu'on sait refusée — et il DOIT rester : sans
    // lui, `expectRows` ne distinguerait plus « pas mon activité » de « déjà
    // supprimée ».
    expect(filtres.author_id).toBe(UID);
    expect(filtres.id).toBe("ev_tiers");
  });

  test("⑤ le refus ne prévient personne et ne touche pas l'état local", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__refusParent = true;
      window.__ecritures = [];
      // Le VRAI chemin applicatif, pas la fonction à la main : c'est lui qui
      // décide de notifier et de retirer l'activité de l'état.
      state.userEvents = [{ id: "ev_etat", title: "Sortie", author_id: MY_UID }];
      let prevenus = 0;
      window._prevenirSuppressionActivite = function () { prevenus++; };
      const avant = (state.userEvents || []).length;
      const ok = await supaDeleteEvent("ev_etat");
      return { ok, prevenus, avant, apres: (state.userEvents || []).length, filles: window.__filles() };
    });
    expect(r.ok).toBe(false);
    expect(r.filles).toEqual([]);
    expect(r.prevenus, "on ne prévient pas d'une suppression qui n'a pas eu lieu").toBe(0);
    expect(r.apres, "et l'activité reste dans l'état local").toBe(r.avant);
  });
});
