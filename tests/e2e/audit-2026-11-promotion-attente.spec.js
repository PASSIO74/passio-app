// Audit 2026-11-02 — B-02 / E-01 : la liste d'attente a une sortie, FAITE PAR LA
// BASE (RPC `promouvoir_attente`, migrations/migration_promotion_attente_2026-11-02.sql).
// Faux serveur PostgREST de l'agent E (policies de prod, RPC miroir du banc SQL
// tests/sql/migration-promotion-attente.test.sh), vrai SDK, vrais handlers.
//
//   ① manuelle : l'organisateur promeut quelqu'un depuis la liste d'attente
//      (`promoteWaitlisted`) → RPC avec `p_user_id`, ligne `going` en base,
//      notification d'origine serveur UNE fois, « Participant inscrit » à l'écran ;
//   ② un non-organisateur qui tente la même chose : `non_autorise`, rien ne bouge,
//      et le client NE L'ANNONCE PAS ;
//   ③ transition (migration pas encore appliquée, PGRST202) : le client retombe
//      sur le chemin d'avant, qui touche 0 ligne — personne n'est promu, rien
//      n'est annoncé, aucune fausse notification. Le défaut historique n'est pas
//      « réparé » par le client seul : c'est la migration qui le ferme.
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte } = require("./audit-2026-11-parcours-faux-serveur");

const ORGA = "aaaaaaaa-0000-4000-8000-000000000021";
const B = "bbbbbbbb-0000-4000-8000-000000000022";
const C = "cccccccc-0000-4000-8000-000000000023";

function peupler(srv, evId) {
  srv.compte(ORGA, "orga_attente"); srv.compte(B, "bob_attente"); srv.compte(C, "carol_attente");
  const dans2j = new Date(Date.now() + 2 * 86400000).toISOString().replace("Z", "");
  srv.t.events.push({ id: evId, author_id: ORGA, organizer_id: ORGA, title: "Atelier capacité 2", passion_id: "musique", city: "Annecy",
    emoji: "🎸", max_attendees: 2, date_at: dans2j, status: "active", co_organizers: [], created_at: new Date().toISOString().replace("Z", ""), lat: 45.9, lng: 6.12 });
  // Capacité 2 : l'organisateur inscrit ; B puis C en liste d'attente (B le plus ancien).
  srv.t.event_attendees.push(
    { event_id: evId, user_id: ORGA, rsvp: "going", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
    { event_id: evId, user_id: B, rsvp: "waitlist", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { event_id: evId, user_id: C, rsvp: "waitlist", created_at: new Date(Date.now() - 1 * 3600000).toISOString() },
  );
}

async function chargerActivite(page, evId) {
  return page.evaluate(async (id) => {
    const evs = await supaLoadEvents();
    const ev = evs.find((e) => e.id === id);
    if (!ev) return null;
    state.seed.events = (state.seed.events || []).filter((e) => e.id !== id);
    state.seed.events.unshift(ev);
    saveState();
    return { attendees: ev.attendees, waitlist: ev.waitlist, max: ev.maxAttendees };
  }, evId);
}

test.describe("Audit 2026-11 — promotion depuis la liste d'attente (B-02 / E-01)", () => {
  test.setTimeout(150000);

  test("① l'organisateur promeut C (pas le plus ancien) : la base écrit `going` et notifie une fois", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_promo_" + Date.now().toString(36);
    peupler(srv, evId);
    const ctx = await browser.newContext();
    try {
      const o = await ouvrirCompte(ctx, srv, ORGA, { nom: "orga_attente" });
      const vu = await chargerActivite(o.page, evId);
      expect(vu && vu.waitlist && vu.waitlist.sort(), "l'organisateur voit la liste d'attente").toEqual([B, C].sort());

      const verdict = await o.page.evaluate(async ([id, cible]) => {
        window.__toasts = [];
        const ok = await promoteWaitlisted(id, cible);
        const ev = _findCanonicalEvent(id);
        return { ok: !!ok, attendees: ev.attendees, waitlist: ev.waitlist, toasts: (window.__toasts || []).map((t) => t.msg) };
      }, [evId, C]);
      console.log("[promo ①]", JSON.stringify(verdict));
      expect(verdict.ok, "promoteWaitlisted rend un succès").toBe(true);

      const rpc = srv.requetes((r) => r.rpc && r.table === "promouvoir_attente" && r.me === ORGA);
      expect(rpc.length, "la promotion passe par la RPC").toBe(1);
      expect(rpc[0].body.p_user_id, "promotion CHOISIE : la personne désignée voyage").toBe(C);
      expect(srv.requetes((r) => r.table === "event_attendees" && r.m === "PATCH" && r.me === ORGA).length, "plus d'UPDATE de la ligne d'autrui").toBe(0);

      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === C).rsvp, "C est `going` EN BASE").toBe("going");
      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === B).rsvp, "B, plus ancien, attend encore (choix de l'organisation)").toBe("waitlist");
      const notifs = srv.t.notifications.filter((n) => n.user_id === C && n.ref_id === evId);
      expect(notifs.length, "UNE notification pour C (la base l'écrit, le client ne double pas)").toBe(1);
      expect(notifs[0].origine).toBe("serveur");
      expect(verdict.attendees, "l'écran de l'organisateur compte C inscrit, une seule fois").toEqual(expect.arrayContaining([C]));
      expect(verdict.attendees.filter((x) => x === C).length).toBe(1);
      expect(verdict.waitlist).not.toContain(C);
      expect(verdict.toasts.join(" | ")).toMatch(/Participant inscrit/);
    } finally { await ctx.close(); }
  });

  test("② un simple participant qui désigne quelqu'un : non_autorise, rien ne bouge, rien d'annoncé", async ({ browser }) => {
    const srv = new FauxServeur();
    const evId = "evt_promo_" + Date.now().toString(36) + "b";
    peupler(srv, evId);
    const ctx = await browser.newContext();
    try {
      const b = await ouvrirCompte(ctx, srv, B, { nom: "bob_attente" });
      await chargerActivite(b.page, evId);
      const verdict = await b.page.evaluate(async ([id, cible]) => {
        window.__toasts = [];
        // Appel direct de la couche serveur (le bouton n'est pas offert à un participant).
        const r = await supaPromoteFromWaitlist(id, cible);
        return { r, toasts: (window.__toasts || []).map((t) => t.msg) };
      }, [evId, C]);
      console.log("[promo ②]", JSON.stringify(verdict));
      expect(verdict.r, "refus lu par le client").toBe(false);
      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === C).rsvp, "C attend toujours").toBe("waitlist");
      expect(srv.t.notifications.some((n) => n.user_id === C && n.ref_id === evId), "aucune notification").toBe(false);
      expect(verdict.toasts.join(" | ")).not.toMatch(/inscrit/);
    } finally { await ctx.close(); }
  });

  test("③ transition — migration pas encore appliquée (PGRST202) : chemin d'avant, 0 ligne, personne promu, rien d'annoncé", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.rpcPromotionAbsente = true;
    const evId = "evt_promo_" + Date.now().toString(36) + "c";
    peupler(srv, evId);
    const ctx = await browser.newContext();
    try {
      const o = await ouvrirCompte(ctx, srv, ORGA, { nom: "orga_attente" });
      await chargerActivite(o.page, evId);
      const verdict = await o.page.evaluate(async ([id, cible]) => {
        window.__toasts = [];
        const ok = await promoteWaitlisted(id, cible);
        const ev = _findCanonicalEvent(id);
        return { ok: !!ok, absente: window._promotionRpcAbsente === true, attendees: ev.attendees, waitlist: ev.waitlist, toasts: (window.__toasts || []).map((t) => t.msg) };
      }, [evId, B]);
      console.log("[promo ③]", JSON.stringify(verdict));
      expect(verdict.absente, "le client a constaté l'absence de la RPC (PGRST202)").toBe(true);
      const patch = srv.requetes((r) => r.table === "event_attendees" && r.m === "PATCH" && r.me === ORGA);
      expect(patch.length, "chemin d'avant : l'UPDATE de la ligne d'autrui est tenté").toBeGreaterThan(0);
      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === B).rsvp, "…et touche 0 ligne (policy propriétaire) : B attend toujours").toBe("waitlist");
      expect(verdict.ok, "le client lit le refus").toBe(false);
      expect(verdict.attendees).not.toContain(B);
      expect(verdict.toasts.join(" | "), "il le dit, sans fausse annonce").toMatch(/non enregistrée/);
      expect(srv.t.notifications.some((n) => n.user_id === B && n.ref_id === evId), "aucune fausse notification « tu es inscrit·e »").toBe(false);
    } finally { await ctx.close(); }
  });
});
