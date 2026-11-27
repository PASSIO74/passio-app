// ═══════════════════════════════════════════════════════════════════════════
// VERROU — ACTIVITÉ PRIVÉE ENTRE TROIS VRAIS COMPTES, SUR LE STAGING
// (2026-11-27, lots #1104 / #1107)
//
// POURQUOI CETTE SUITE. Le banc SQL (`tests/sql/migration-activites-privees.test.sh`)
// éprouve les règles sur une base jetable, `activite-privee.spec.js` l'interface
// avec une base simulée. Ici, le VRAI client contre le VRAI serveur :
//   ① Léa (organisatrice) publie une activité PRIVÉE et invite Ben par le vrai
//      chemin (`supaInviterActivite`) ;
//   ② Ben la lit, Kevin (inconnu) ne la lit pas — ni par la liste, ni par
//      identifiant, ni ses compteurs ; Kevin ne peut ni s'y inscrire ni
//      s'inviter ;
//   ③ Kevin entre par le lien d'invitation (`rejoindre_par_code`) ; un faux
//      code n'ouvre rien ;
//   ④ Léa retire Kevin : il ne lit plus, son inscription est partie, et le
//      même lien ne le fait pas revenir ;
//   ⑤ la clé anon (visiteur) ne lit pas l'activité.
//
// ⚠️ ELLE ÉCRIT : opt-in `PASSIO_E2E_MULTI`, et elle REFUSE tout autre projet que
// le staging, côté banc ET côté page. Fiche : docs/journal/serveur-securite-base.md,
// « 🔒 ACTIVITÉS PRIVÉES ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { cibleSupabase } = require("./cible-supabase");
const { configAdmin, supprimerComptesJetables } = require("./compte-e2e");
const { signupUser } = require("./qa-helper");

const STAGING = "fcksxofaelcdmmifnwjo";

test("activité privée : invité, inconnu, lien, retrait — entre trois vrais comptes", async ({ browser }, testInfo) => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "crée de vrais comptes : opt-in PASSIO_E2E_MULTI, sur le staging seulement");
  test.setTimeout(300000);

  const cfg = configAdmin();
  const cible = cibleSupabase();
  if (!cible || !cible.url.includes(STAGING) || !cfg || !cfg.url.includes(STAGING)) {
    throw new Error("la cible de cette suite n'est pas le staging : elle n'écrit rien");
  }

  const t0 = Date.now();
  const noter = (m) => console.log(`[privée ${((Date.now() - t0) / 1000) | 0} s] ${m}`);
  const contextes = [];
  const uids = [];
  const entetes = { apikey: cfg.cle, Authorization: "Bearer " + cfg.cle };
  let eventId = null;

  const ouvrir = async (nom) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    contextes.push(ctx);
    const page = await ctx.newPage();
    const uidCompte = await signupUser(page, nom);
    uids.push(uidCompte);
    const vise = await page.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null));
    if (!vise || !vise.includes(STAGING)) throw new Error("la page ne vise pas le staging : " + vise);
    await page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 45000 });
    return { page, uid: uidCompte };
  };
  // Ce qu'un compte lit de l'activité par ses propres droits (RLS), sans rien du cache local.
  const lecture = (compte, id) => compte.page.evaluate(async (e) => {
    const r = await supa.from("events").select("id,visibilite").eq("id", e);
    const n = await supa.rpc("participants_compte", { p_event_ids: [e] });
    return { lignes: r.error ? "err:" + r.error.code : (r.data || []).length, comptes: n.error ? "err" : (n.data || []).length };
  }, id);

  try {
    const [lea, ben, kevin] = [await ouvrir("Privee Lea"), await ouvrir("Privee Ben"), await ouvrir("Privee Kevin")];
    noter("comptes prêts");

    await test.step("① Léa publie une activité privée et invite Ben", async () => {
      eventId = await lea.page.evaluate(async () => {
        const id = "evp_" + uid();
        const ok = await supaPublishEvent({
          id, title: "Dîner privé e2e", passion: "musique", city: "Annecy", emoji: "🎵",
          date: Date.now() + 2 * 864e5, visibilite: "privee",
        });
        if (!ok) return null;
        await supaJoinEvent(id);
        return id;
      });
      expect(eventId, "activité privée publiée").toBeTruthy();
      const invite = await lea.page.evaluate(([e, b]) => supaInviterActivite(e, [b]), [eventId, ben.uid]);
      expect(invite, "invitation de Ben écrite").toBe(true);
      const ligne = await (await fetch(cfg.url + "/rest/v1/events?select=visibilite&id=eq." + eventId, { headers: entetes })).json();
      expect(ligne).toEqual([{ visibilite: "privee" }]);
    });

    await test.step("② Ben la lit ; Kevin ni ne la lit, ni ne s'y inscrit, ni ne s'invite", async () => {
      expect(await lecture(ben, eventId)).toEqual({ lignes: 1, comptes: 1 });
      expect(await lecture(kevin, eventId)).toEqual({ lignes: 0, comptes: 0 });
      const ecritures = await kevin.page.evaluate(async (e) => {
        const ins = await supa.from("event_attendees").insert({ event_id: e, user_id: MY_UID, rsvp: "going" });
        const inv = await supa.from("event_invites").insert({ event_id: e, user_id: MY_UID, invited_by: MY_UID });
        return [ins.error ? ins.error.code : "ok", inv.error ? inv.error.code : "ok"];
      }, eventId);
      expect(ecritures).toEqual(["42501", "42501"]);
    });

    let code = null;
    await test.step("③ Kevin entre par le lien d'invitation ; un faux code n'ouvre rien", async () => {
      code = await lea.page.evaluate((e) => supaCodeInvitationActivite(e, false), eventId);
      expect(code).toMatch(/^[0-9a-f]{64}$/);
      expect(await kevin.page.evaluate((e) => supaRejoindreParCode(e, "0".repeat(64)), eventId)).toBe(false);
      expect(await lecture(kevin, eventId)).toEqual({ lignes: 0, comptes: 0 });
      expect(await kevin.page.evaluate(([e, c]) => supaRejoindreParCode(e, c), [eventId, code])).toBe(true);
      expect((await lecture(kevin, eventId)).lignes).toBe(1);
      const venir = await kevin.page.evaluate(async (e) => {
        const r = await supa.from("event_attendees").insert({ event_id: e, user_id: MY_UID, rsvp: "going" });
        return r.error ? r.error.code : "ok";
      }, eventId);
      expect(venir, "invité, Kevin peut s'inscrire").toBe("ok");
    });

    await test.step("④ Léa retire Kevin : plus de lecture, plus d'inscription, et le lien ne le ramène pas", async () => {
      expect(await lea.page.evaluate(([e, k]) => supaRetirerInviteActivite(e, k), [eventId, kevin.uid])).toBe(true);
      expect(await lecture(kevin, eventId)).toEqual({ lignes: 0, comptes: 0 });
      const inscrit = await (await fetch(cfg.url + "/rest/v1/event_attendees?select=user_id&event_id=eq." + eventId + "&user_id=eq." + kevin.uid, { headers: entetes })).json();
      expect(inscrit, "son inscription est partie").toEqual([]);
      expect(await kevin.page.evaluate(([e, c]) => supaRejoindreParCode(e, c), [eventId, code])).toBe(false);
      expect((await lecture(kevin, eventId)).lignes).toBe(0);
      expect((await lecture(ben, eventId)).lignes, "Ben n'est pas touché").toBe(1);
    });

    await test.step("⑤ la clé anon ne lit pas l'activité", async () => {
      const r = await fetch(cible.url + "/rest/v1/events?select=id&id=eq." + eventId, { headers: { apikey: cible.anon, Authorization: "Bearer " + cible.anon } });
      expect(r.ok).toBe(true);
      expect(await r.json()).toEqual([]);
    });
  } finally {
    const supprimer = (chemin) => fetch(cfg.url + "/rest/v1/" + chemin, { method: "DELETE", headers: { ...entetes, Prefer: "return=minimal" } }).catch(() => null);
    if (eventId) await supprimer(`events?id=eq.${eventId}`);   // cascade : invités, codes, retraits, inscriptions
    if (uids.length) {
      const liste = uids.join(",");
      await supprimer(`notifications?user_id=in.(${liste})`);
      await supprimer(`notifications?from_id=in.(${liste})`);
      await supprimer(`event_attendees?user_id=in.(${liste})`);
      // Le jeu persistant (staging) garde ses comptes ; seul un jetable part.
      await supprimerComptesJetables(cfg, uids);
    }
    for (const ctx of contextes) await ctx.close().catch(() => {});
  }
});
