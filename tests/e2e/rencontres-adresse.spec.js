// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LE LIEU D'UNE ACTIVITÉ — audit de sécurité du 06/11, B-17 et G-07 (lot 4)
//
// Tout compte lisait l'adresse et le téléphone de toute activité, sans s'inscrire. Ils passent par la RPC
// `adresses_activites`, pour l'organisation et pour qui vient :
//   ① un compte ne les demande plus à la table, et reçoit ce que la RPC lui rend ;
//   ② tant que la base n'a pas le lot (PGRST202), repli sur les colonnes : le client part en ligne d'abord ;
//   ③ une lecture en échec n'est pas une adresse vide : l'édition n'efface rien, ce qu'on tape reste ;
//   ④ un visiteur n'appelle pas la RPC ;
//   ⑤ la fiche dit que l'adresse existe, tant qu'on ne vient pas.
// Le comportement de la base se mesure au banc : tests/sql/migration-securite-2026-11-06.test.sh.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_COMPTE = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const LIGNE = { id: "ev_lieu", author_id: "org_1", title: "Chez moi", lat: 45.76, lng: 4.84, status: "active", date_at: "2030-01-01T10:00:00" };

async function banc(page, { compte, rpc, repli }) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (compte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_COMPTE);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(([ligne, rpc, repli]) => {
    window.__lectures = [];
    window.__rpc = [];
    window._resolveProfilesByIds = async () => ({});
    window.supaLireParticipants = async () => ({ attByEvent: {}, maybeByEvent: {}, waitByEvent: {}, checkedByEvent: {}, countsByEvent: {} });
    window.supa.from = (table) => {
      const q = { __cols: "" };
      ["order", "limit", "in", "eq", "not", "or", "maybeSingle", "single"].forEach((m) => { q[m] = () => q; });
      q.select = (cols) => { q.__cols = String(cols || ""); window.__lectures.push({ table, cols: q.__cols }); return q; };
      q.then = (ok, ko) => {
        const r = table === "events" && q.__cols === "id,address,contact" ? repli : { data: table === "events" ? [ligne] : [], error: null };
        return Promise.resolve(r).then(ok, ko);
      };
      return q;
    };
    window.supa.rpc = (nom, args) => {
      window.__rpc.push({ nom, args });
      return Promise.resolve(nom === "adresses_activites" ? rpc : { data: [], error: null });
    };
  }, [LIGNE, rpc, repli || { data: [], error: null }]);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__lectures = []; window.__rpc = []; _adressesParColonnes = false; _eventColsPubliquesSeulement = false; });
}

const charger = (page) => page.evaluate(async () => {
  const evs = await supaLoadEvents();
  return {
    ev: evs[0] ? { address: evs[0].address, contact: evs[0].contact, inconnue: evs[0]._adresseInconnue } : null,
    colonnes: window.__lectures.filter((l) => l.table === "events").map((l) => l.cols),
    rpc: window.__rpc.filter((r) => r.nom === "adresses_activites").map((r) => r.args.p_event_ids),
  };
});

test.describe("Le lieu d'une activité", () => {
  test("① un compte ne demande plus l'adresse à la table : la RPC la lui rend", async ({ page }) => {
    await banc(page, { compte: true, rpc: { data: [{ event_id: "ev_lieu", address: "12 rue du Domicile", contact: "0600000000" }], error: null } });
    const r = await charger(page);
    expect(r.colonnes.length).toBe(1);
    expect(r.colonnes[0]).not.toContain("address");
    expect(r.colonnes[0]).not.toContain("contact");
    expect(r.colonnes[0], "conv_id reste une colonne de compte").toContain("conv_id");
    expect(r.rpc).toEqual([["ev_lieu"]]);
    expect(r.ev).toEqual({ address: "12 rue du Domicile", contact: "0600000000", inconnue: false });
  });

  test("① bis sans droit, la RPC ne rend rien : ni adresse, ni contact", async ({ page }) => {
    await banc(page, { compte: true, rpc: { data: [], error: null } });
    const r = await charger(page);
    expect(r.ev).toEqual({ address: "", contact: "", inconnue: false });
  });

  test("② base sans le lot : repli sur les colonnes, le client peut partir en ligne d'abord", async ({ page }) => {
    await banc(page, {
      compte: true,
      rpc: { data: null, error: { code: "PGRST202", message: "absente" } },
      repli: { data: [{ id: "ev_lieu", address: "3 rue du Repli", contact: "" }], error: null },
    });
    const r = await charger(page);
    expect(r.colonnes).toContain("id,address,contact");
    expect(r.ev).toEqual({ address: "3 rue du Repli", contact: "", inconnue: false });
  });

  test("③ lecture en échec : l'édition n'efface pas l'adresse, et ce qu'on tape reste", async ({ page }) => {
    await banc(page, { compte: true, rpc: { data: null, error: { code: "57014", message: "délai" } } });
    const r = await charger(page);
    expect(r.ev.inconnue, "on ne sait pas : ce n'est pas une adresse vide").toBe(true);
    const lignes = await page.evaluate(() => ({
      sansSaisie: _eventRow({ title: "x", date: Date.now(), _adresseInconnue: true, address: "", contact: "" }),
      avecSaisie: _eventRow({ title: "x", date: Date.now(), _adresseInconnue: true, address: "Tapée", contact: "" }),
      connue: _eventRow({ title: "x", date: Date.now(), _adresseInconnue: false, address: "", contact: "" }),
    }));
    expect("address" in lignes.sansSaisie).toBe(false);
    expect("contact" in lignes.sansSaisie).toBe(false);
    expect(lignes.avecSaisie.address).toBe("Tapée");
    expect(lignes.connue.address, "connue et vide : l'organisation l'a bien retirée").toBeNull();
  });

  test("④ un visiteur n'appelle pas la RPC", async ({ page }) => {
    await banc(page, { compte: false, rpc: { data: [], error: null } });
    const r = await charger(page);
    expect(r.rpc).toEqual([]);
    expect(r.ev.address).toBe("");
  });

  test("⑤ la fiche dit que l'adresse existe, puis la montre une fois inscrit·e", async ({ page }) => {
    await banc(page, { compte: true, rpc: { data: [], error: null } });
    const fiche = (adresse) => page.evaluate(async (a) => {
      const id = "ev_fiche_" + Math.random().toString(36).slice(2);
      const ev = { id, title: "Chez moi", authorId: "org_1", organizerId: "org_1", city: "Lyon", date: Date.now() + 864e5, fromSupabase: true, address: a, contact: "", attendees: [], maybes: [], waitlist: [] };
      state.userEvents = state.userEvents || [];
      state.userEvents.push(ev);
      openEventDetails(id);
      await new Promise((r) => setTimeout(r, 150));
      return document.body.innerText;
    }, adresse);
    expect(await fiche("")).toContain("Communiquée une fois inscrit·e");
    const avec = await fiche("12 rue du Domicile");
    expect(avec).toContain("12 rue du Domicile");
    expect(avec).not.toContain("Communiquée une fois inscrit·e");
  });
});
