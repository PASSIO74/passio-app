// ═══════════════════════════════════════════════════════════
// VERROU — LA POUSSÉE SUR `user:<uid>` ARRIVE VRAIMENT (R25, seconde couche).
//
// POURQUOI CETTE SUITE. Depuis #689, `conv_members` et `notifications` sont hors de
// la publication : deux déclencheurs poussent leurs INSERT sur le topic privé du
// destinataire. Le seul contrôle en CI était le « realtime OK » de `multi-comptes`,
// informatif, et qui se satisfait d'une relecture REST : ce chemin pouvait casser
// sans qu'aucune CI le voie. Ici, sur le STAGING, avec le vrai client et le vrai
// serveur Realtime :
//   ① une notification écrite par B arrive chez A, lectures REST de `notifications`
//     BLOQUÉES chez A, trame `notifications:INSERT` comptée ;
//   ② un ajout à une conversation, sans aucun message, arrive chez A par la trame
//     `conv_members:INSERT` ;
//   ③ un tiers C ne rejoint pas `user:<A>`, n'y reçoit rien, n'y émet rien (A, lui,
//     reçoit : c'est le témoin), et une poussée qui vise un autre compte n'est pas
//     appliquée par le client ;
//   ④ un visiteur sans compte reste muet sur ces deux tables, alors qu'il reçoit
//     (témoin) la suppression de `post_likes`, sans la clé.
//
// ⚠️ UN SEUL TEST, QUATRE ÉTAPES : les comptes coûtent cher, et un essai rejoué en CI
// doit repartir de comptes neufs. Mesuré au staging le 2026-11-04 : 268 ms pour la
// notification, 727 ms pour l'ajout, 1,4 min au total. Les attentes restent larges
// (15 et 20 s) : cette suite passe sous le verrou `passio-e2e-prod`, et elle est
// bloquante pour tout le monde.
//
// ⚠️ ELLE ÉCRIT : opt-in `PASSIO_E2E_MULTI`, et elle REFUSE tout autre projet que le
// staging, côté banc ET côté page. La production n'a jamais de compte de cette suite.
//
// ⚠️ LE ④ S'ABONNE À DEUX TABLES NON PUBLIÉES, ET C'EST SON SUJET : une table
// republiée livrerait ses suppressions à tout abonné, sans RLS. La gate
// `audit:realtime` refuse ce geste partout ailleurs : ce fichier et ces deux tables
// sont inscrits, avec leur raison, dans `scripts/realtime-publication.json`
// (`sondesHorsPublication`).
// ⚠️ UNE SONDE PAR CLIENT, ET LE TÉMOIN À PART : une liaison vers une table non publiée
// annule TOUTES les liaisons de son canal (fiche 🔒 R25). Réunies, les deux sondes se
// faisaient taire l'une l'autre : `notifications` republiée seule restait muette sous
// `conv_members`, et la suite restait verte (l'essai d'origine portait ce défaut,
// trouvé en braquant une sonde sur une table publiée).
//
// Fiche : `docs/journal/capacite-perf-realtime.md`, sous 🔒 R25.
// ═══════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { cibleSupabase } = require("./cible-supabase");
const { configAdmin } = require("./compte-e2e");
const { signupUser } = require("./qa-helper");

const STAGING = "fcksxofaelcdmmifnwjo";
const ID_FORGE = "n_forge_poussee";

const decoder = (f) => (typeof f.payload === "string" ? f.payload : Buffer.from(f.payload).toString("latin1"));
const trames = (compte, motif) => compte.frames.filter((t) => t.indexOf(motif) !== -1);

/** B écrit, sous le genre `like` : `follow` est réservé au serveur (`genres_reserves_au_serveur`). */
const ecrireNotification = (B, pour, texte) => B.page.evaluate(async ([a, t]) => {
  const id = "n_" + uid();
  const { error } = await supa.from("notifications").insert({
    id, user_id: a, kind: "like", from_id: MY_UID, ref_id: "e2e_poussee_ref", content: t, seen: false, created_at: new Date().toISOString(),
  });
  return { id, erreur: error ? error.code + " " + error.message : null };
}, [pour, texte]);

const recueChezA = (A, id) => A.page.waitForFunction((n) => (state.notifications || []).some((x) => x.id === n), id, { timeout: 15000 });

test("R25 : la poussée sur user:<uid> arrive, à son seul destinataire", async ({ browser }, testInfo) => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "crée de vrais comptes : opt-in PASSIO_E2E_MULTI, sur le staging seulement");
  test.setTimeout(280000);

  const cfg = configAdmin();
  const cible = cibleSupabase();
  if (!cible || !cible.url.includes(STAGING) || !cfg || !cfg.url.includes(STAGING)) {
    throw new Error("la cible de cette suite n'est pas le staging : elle n'écrit rien");
  }

  const t0 = Date.now();
  const noter = (m) => console.log(`[poussée ${((Date.now() - t0) / 1000) | 0} s] ${m}`);
  const contextes = [];
  const uids = [];
  const aNettoyer = { conv: null, like: null };

  const ouvrir = async (nom) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    contextes.push(ctx);
    const page = await ctx.newPage();
    const frames = [];
    page.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(decoder(f))));
    const uidCompte = await signupUser(page, nom);
    uids.push(uidCompte);
    const vise = await page.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null));
    if (!vise || !vise.includes(STAGING)) throw new Error("la page ne vise pas le staging : " + vise);
    return { page, uid: uidCompte, frames };
  };

  try {
    const A = await ouvrir("Essai Alice");
    const B = await ouvrir("Essai Bob");
    const C = await ouvrir("Essai Chloe");
    await A.page.waitForFunction(() => window._userTopicChan && window._userTopicChan.state === "joined", null, { timeout: 45000 });
    noter("trois comptes prêts, A a rejoint user:<A>");

    // ── ① Une notification, relectures REST bloquées chez A ──
    let notificationPremiere;
    await test.step("① la notification arrive sans relecture REST", async () => {
      let lecturesBloquees = 0;
      await A.page.route(/\/rest\/v1\/notifications/, (route) => {
        if (route.request().method() === "GET") { lecturesBloquees++; return route.abort(); }
        return route.continue();
      });
      const avant = trames(A, "notifications:INSERT").length;
      const debut = Date.now();
      notificationPremiere = await ecrireNotification(B, A.uid, "essai de poussée, une");
      expect(notificationPremiere.erreur, "écriture de la notification").toBeNull();
      await recueChezA(A, notificationPremiere.id);
      noter(`① reçue en ${Date.now() - debut} ms, ${lecturesBloquees} lecture(s) REST bloquée(s)`);
      expect(trames(A, "notifications:INSERT").length - avant, "la trame du serveur est bien arrivée").toBeGreaterThanOrEqual(1);
      const recue = await A.page.evaluate((id) => {
        const n = (state.notifications || []).find((x) => x.id === id);
        return { unread: n.unread, fromSupabase: n.fromSupabase, kind: n.kind, fromId: n.fromId };
      }, notificationPremiere.id);
      expect(recue).toEqual({ unread: true, fromSupabase: true, kind: "like", fromId: B.uid });
    });

    // ── ② Un ajout à une conversation, sans aucun message ──
    let convId;
    await test.step("② l'ajout à une conversation arrive par sa trame", async () => {
      // Un filet relit aussi les conversations : la seule présence de la conversation
      // ne prouverait pas la poussée. On écoute donc le VRAI gestionnaire, appelé par
      // son nom depuis la liaison, et on exige la trame du serveur.
      await A.page.evaluate(() => {
        window.__ajoutsRecus = [];
        const vrai = window._rtAjoutConversationRecu;
        window._rtAjoutConversationRecu = function (r) {
          window.__ajoutsRecus.push(r && r.conv_id);
          return vrai.apply(this, arguments);
        };
      });
      const debut = Date.now();
      convId = await B.page.evaluate((a) => supaCreateConversation(a), A.uid);
      expect(convId, "conversation créée").toBeTruthy();
      aNettoyer.conv = convId;
      await A.page.waitForFunction((id) => window.__ajoutsRecus.includes(id), convId, { timeout: 20000 });
      await A.page.waitForFunction((id) => getConversations().some((c) => c.id === id), convId, { timeout: 20000 });
      noter(`② reçu en ${Date.now() - debut} ms`);
      expect(trames(A, "conv_members:INSERT").filter((t) => t.indexOf(convId) !== -1).length, "la trame porte cette conversation").toBeGreaterThanOrEqual(1);
      const correspondant = await A.page.evaluate((id) => getConversations().find((c) => c.id === id).userId, convId);
      expect(correspondant, "la conversation est bien celle de B").toBe(B.uid);
    });

    // ── ③ Un tiers ──
    let notificationSeconde;
    await test.step("③ un tiers n'entre pas sur user:<A>, et une poussée pour un autre compte n'est pas appliquée", async () => {
      const statuts = await C.page.evaluate(async (a) => {
        window.__tiers = { statuts: [], recus: [] };
        const ch = supa.channel("user:" + a, { config: { private: true } });
        window.__canalTiers = ch;
        ch.on("broadcast", { event: "*" }, (m) => window.__tiers.recus.push(m.event));
        ch.subscribe((s) => window.__tiers.statuts.push(s));
        for (let i = 0; i < 80 && !window.__tiers.statuts.length; i++) await new Promise((r) => setTimeout(r, 250));
        await new Promise((r) => setTimeout(r, 3000)); // un refus suivi d'une adhésion tardive se verrait ici
        return window.__tiers.statuts;
      }, A.uid);
      noter("③ statuts du tiers : " + statuts.join(", "));
      expect(statuts.length, "le serveur a répondu à la demande d'adhésion").toBeGreaterThan(0);
      expect(statuts, "un tiers ne rejoint pas le topic d'un autre").not.toContain("SUBSCRIBED");

      // Il tente d'y émettre une fausse notification. Le retour de `send` ne prouve
      // rien (le repli HTTP peut répondre 202 et laisser tomber) : on regarde chez A.
      await C.page.evaluate(([a, forge]) => window.__canalTiers.send({
        type: "broadcast", event: "notifications:INSERT",
        payload: { table: "notifications", record: { id: forge, user_id: a, kind: "like", from_id: "x", ref_id: "x", content: "FAUX", seen: false, created_at: new Date().toISOString() } },
      }).catch(() => null), [A.uid, ID_FORGE]);

      // Le témoin : pendant ce temps, A reçoit bien ce qui lui revient.
      const chezC = trames(C, "notifications:INSERT").length;
      notificationSeconde = await ecrireNotification(B, A.uid, "essai de poussée, deux");
      expect(notificationSeconde.erreur, "seconde notification").toBeNull();
      await recueChezA(A, notificationSeconde.id);
      await C.page.waitForTimeout(3000);
      expect(await C.page.evaluate(() => window.__tiers.recus), "rien n'arrive au tiers par le canal").toEqual([]);
      expect(trames(C, "notifications:INSERT").length - chezC, "aucune trame n'arrive au tiers").toBe(0);
      expect(await A.page.evaluate((forge) => (state.notifications || []).some((n) => n.id === forge), ID_FORGE), "la fausse notification n'arrive pas chez A").toBe(false);
      await C.page.evaluate(() => supa.removeChannel(window.__canalTiers)).catch(() => {});

      // La garde de destinataire du client : la RLS tient ce topic, mais une poussée
      // qui vise un autre compte ne doit ni s'afficher, ni déclencher une seule lecture.
      const convAutrui = "c_garde_" + Date.now();
      let lecturesPourAutrui = 0;
      const compterLectures = (requete) => { if (requete.url().indexOf(convAutrui) !== -1) lecturesPourAutrui++; };
      A.page.on("request", compterLectures);
      const garde = await A.page.evaluate(async ([autre, conv]) => {
        const id = "n_garde_" + uid();
        _rtNotificationRecue({ id, user_id: autre, kind: "like", from_id: autre, ref_id: "x", content: "pour un autre", seen: false, created_at: new Date().toISOString() });
        await _rtAjoutConversationRecu({ conv_id: conv, user_id: autre });
        return { notification: (state.notifications || []).some((n) => n.id === id), conversation: getConversations().some((c) => c.id === conv) };
      }, [C.uid, convAutrui]);
      A.page.off("request", compterLectures);
      expect(garde, "une poussée pour un autre compte n'est pas appliquée").toEqual({ notification: false, conversation: false });
      expect(lecturesPourAutrui, "une poussée pour un autre compte ne déclenche aucune lecture").toBe(0);
    });

    // ── ④ Un visiteur sans compte ──
    await test.step("④ un visiteur sans compte est muet sur ces deux tables, et son témoin reçoit", async () => {
      await C.page.evaluate(async ([url, anon]) => {
        const client = (nom) => window.supabase.createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "poussee_visiteur_" + nom },
        });
        window.__visiteur = { temoin: { statuts: [], evenements: [] }, sondes: { statuts: [], evenements: [] } };
        const temoin = client("temoin");
        const sondeAjouts = client("sonde_ajouts");
        const sondeNotifications = client("sonde_notifications");
        const session = await temoin.auth.getSession();
        window.__visiteur.sansSession = !(session.data && session.data.session);
        temoin.channel("realtime:db", { config: { private: true } })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_likes" }, (p) => window.__visiteur.temoin.evenements.push({
            post: (p.old || {}).post_id || null, compte: (p.old || {}).user_id || null,
          }))
          .subscribe((s) => window.__visiteur.temoin.statuts.push(s));
        sondeAjouts.channel("realtime:db", { config: { private: true } })
          .on("postgres_changes", { event: "*", schema: "public", table: "conv_members" }, () => window.__visiteur.sondes.evenements.push("conv_members"))
          .subscribe((s) => window.__visiteur.sondes.statuts.push(s));
        sondeNotifications.channel("realtime:db", { config: { private: true } })
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => window.__visiteur.sondes.evenements.push("notifications"))
          .subscribe((s) => window.__visiteur.sondes.statuts.push(s));
        await new Promise((r) => setTimeout(r, 9000));
      }, [cible.url, cible.anon]);
      expect(await C.page.evaluate(() => window.__visiteur.sansSession), "ce visiteur n'a aucune session").toBe(true);

      // Le lot 3 de l'audit du 06/11 retire au visiteur l'entrée de `realtime:db` : plus de témoin à attendre,
      // le refus du canal est une garantie plus forte que son silence. Sans ce lot, le témoin reste exigé.
      await C.page.waitForFunction(() => window.__visiteur.temoin.statuts.length > 0, null, { timeout: 20000, polling: 100 });
      const canalFerme = await C.page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 3000));
        return !window.__visiteur.temoin.statuts.includes("SUBSCRIBED");
      });
      noter("④ canal du visiteur " + (canalFerme ? "refusé" : "ouvert"));

      // Le témoin peut tarder à être branché : on rejoue un « j'aime » jusqu'à le voir
      // recevoir, sans quoi le silence des sondes ne dirait rien.
      const temoinRecoit = async (delai) => {
        if (canalFerme) return true;
        const avant = await C.page.evaluate(() => window.__visiteur.temoin.evenements.length);
        for (let essai = 0; essai < 8; essai++) {
          const postId = "e2e_poussee_" + Date.now();
          aNettoyer.like = postId;
          const like = await B.page.evaluate(async (p) => {
            const i = await supa.from("post_likes").insert({ post_id: p, user_id: MY_UID });
            await new Promise((r) => setTimeout(r, 800));
            const d = await supa.from("post_likes").delete().eq("post_id", p).eq("user_id", MY_UID).select();
            return { insertion: i.error && i.error.message, supprimees: (d.data || []).length, suppression: d.error && d.error.message };
          }, postId);
          expect(like, "le « j'aime » du témoin s'écrit et s'efface").toEqual({ insertion: null, supprimees: 1, suppression: null });
          await C.page.waitForTimeout(delai);
          if (await C.page.evaluate(() => window.__visiteur.temoin.evenements.length) > avant) return true;
        }
        return false;
      };
      expect(await temoinRecoit(3000), "le témoin du visiteur reçoit la suppression de post_likes").toBe(true);

      // A efface ses lignes : ce sont les DELETE qu'une table publiée livrerait à tous.
      const efface = await A.page.evaluate(async ([conv, ids]) => {
        const n = await supa.from("notifications").delete().in("id", ids).select();
        const m = await supa.from("conv_members").delete().eq("conv_id", conv).eq("user_id", MY_UID).select();
        return { notifications: (n.data || []).length, membres: (m.data || []).length, erreur: (n.error && n.error.message) || (m.error && m.error.message) || null };
      }, [convId, [notificationPremiere.id, notificationSeconde.id]]);
      expect(efface, "A efface ses deux notifications et sa place").toEqual({ notifications: 2, membres: 1, erreur: null });

      // Un second passage du témoin borne la livraison : les effacements de A sont partis avant lui.
      expect(await temoinRecoit(3000), "le témoin reçoit encore après les effacements de A").toBe(true);
      await C.page.waitForTimeout(3000);
      const vu = await C.page.evaluate(() => window.__visiteur);
      noter("④ " + JSON.stringify({ temoin: vu.temoin.statuts, sondes: vu.sondes.statuts, evenements: vu.temoin.evenements.length }));
      expect(vu.sondes.evenements, "aucune suppression de ces deux tables n'atteint un visiteur").toEqual([]);
      for (const e of vu.temoin.evenements) {
        expect(e, "la suppression reçue par le témoin ne porte ni la publication ni le compte").toEqual({ post: null, compte: null });
      }
    });
  } finally {
    // Nettoyage ciblé : mes lignes et mes comptes. Le teardown de la CI purge par motif,
    // mais une exécution locale n'a pas de teardown (il effacerait les comptes d'un autre run).
    const entetes = { apikey: cfg.cle, Authorization: "Bearer " + cfg.cle };
    const supprimer = (chemin) => fetch(cfg.url + "/rest/v1/" + chemin, { method: "DELETE", headers: { ...entetes, Prefer: "return=minimal" } }).catch(() => null);
    if (uids.length) {
      const liste = uids.join(",");
      await supprimer(`notifications?user_id=in.(${liste})`);
      await supprimer(`notifications?from_id=in.(${liste})`);
      await supprimer(`conv_members?user_id=in.(${liste})`);
      if (aNettoyer.conv) await supprimer(`conversations?id=eq.${aNettoyer.conv}`);
      await supprimer(`post_likes?user_id=in.(${liste})`);
      await supprimer(`profiles?id=in.(${liste})`);
      for (const u of uids) await fetch(cfg.url + "/auth/v1/admin/users/" + u, { method: "DELETE", headers: entetes }).catch(() => null);
    }
    for (const ctx of contextes) await ctx.close().catch(() => {});
  }
});
