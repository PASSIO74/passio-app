// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT E — PARCOURS MULTI-COMPTES : CONTENU ET ACTIVITÉS
//
// Deux à quatre `BrowserContext` (un compte chacun) parlent au MÊME faux
// serveur (`audit-2026-11-parcours-faux-serveur.js`), qui juge chaque requête
// sous l'identité de son jeton d'après les policies de production. Le VRAI
// SDK 2.116 et les vraies fonctions d'écriture de l'application sont exercés ;
// l'état final des TABLES est mesuré, pas seulement l'écran.
//
// Limite du banc, écrite pour qu'on ne la lui fasse pas dire : la RLS est
// RECOPIÉE (pas la vraie), le temps réel est coupé, les courses serveur sont
// imitées par une sérialisation Node. Les scénarios « réel » correspondants
// sont ajoutés aux suites `prod` (multi-comptes, confidentialite,
// authz-critical) et ne s'exécutent qu'en CI.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { FauxServeur, ouvrirCompte, toasts } = require("./audit-2026-11-parcours-faux-serveur");

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";

test.describe.configure({ mode: "serial" });

test.describe("AUDIT E — contenu : publier, partager, passer privé, supprimer", () => {
  test.setTimeout(180000);

  test("a. A publie → B voit et partage #post-<id> → C sans session ; A privé puis supprime → B et C", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e"); srv.compte(C, "carol_e2e");
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      expect(a.identite.uid, "prémisse : la page A tourne sous A").toBe(A);
      expect(a.identite.reel, "prémisse : SDK réel").toBe(true);

      // ── A publie par le VRAI chemin d'écriture ─────────────────────────────
      const postId = "post_e2e_" + Date.now().toString(36);
      const pub = await a.page.evaluate(async (pid) => {
        const post = { id: pid, type: "text", text: "Publication d'Alice pour l'audit E", passion: "musique", mood: "all", createdAt: Date.now() };
        const ok = await supaPublishPostWithRetry(post);
        return { ok, lien: lienPartagePublication(pid) };
      }, postId);
      expect(pub.ok, "l'insert de A est accepté par la policy posts INSERT").toBe(true);
      const ligne = srv.t.posts.find((p) => p.id === postId);
      expect(ligne && ligne.author_id, "la ligne porte author_id = A").toBe(A);
      expect(pub.lien, "le lien de partage porte #post-<id> hors hôte de prod").toContain("#post-" + postId);

      // ── B charge le fil (lecture réelle sous B), voit le post, le partage ──
      const b = await ouvrirCompte(ctxB, srv, B, { nom: "bob_e2e" });
      const vuParB = await b.page.evaluate(async (pid) => {
        const posts = await supaLoadPosts();
        state.supabasePosts = posts; renderFeed();
        const p = findPostAnywhere(pid);
        return { trouve: !!p, auteur: p && p.authorId, dom: !!document.querySelector('#feedList article.post[data-postid="' + pid + '"]') };
      }, postId);
      expect(vuParB.trouve, "B lit le post public de A").toBe(true);
      expect(vuParB.auteur).toBe(A);
      expect(vuParB.dom, "la carte est dans le fil de B").toBe(true);
      const lienB = await b.page.evaluate((pid) => lienPartagePublication(pid), postId);
      expect(lienB).toContain("#post-" + postId);

      // ── C, SANS session, ouvre le lien ─────────────────────────────────────
      const c = await ouvrirCompte(ctxC, srv, null, { query: "#post-" + postId });
      expect(c.identite.uid && /^u_/.test(c.identite.uid), "prémisse : C est un visiteur (uid fabriqué)").toBe(true);
      await c.page.waitForFunction(() => !!document.querySelector("#postDetailPage.active, #postDetailPage[style*='block']") || (window.__toasts || []).some((t) => /introuvable|disponible/.test(t.msg)), null, { timeout: 25000 }).catch(() => {});
      const ouvertC = await c.page.evaluate((pid) => ({
        detail: !!document.querySelector("#postDetailPage.active"),
        texte: (document.getElementById("postDetailContent") || {}).textContent || "",
        toasts: (window.__toasts || []).map((t) => t.msg),
        lectures: null,
      }), postId);
      const lecturesC = srv.requetes((r) => r.role === "anon" && r.m === "GET" && r.table === "posts").length;
      expect(lecturesC, "le visiteur a bien interrogé posts sous le rôle anon").toBeGreaterThan(0);
      expect(ouvertC.detail || /Alice/.test(ouvertC.texte), "C (visiteur) ouvre la publication PUBLIQUE par le lien").toBe(true);

      // ── A passe PRIVÉ (vrai chemin : état + supaSavePublicProfile) ─────────
      const prive = await a.page.evaluate(async () => {
        state.user.general = state.user.general || {};
        state.user.general.privacyChoisi = true; state.user.general.isPrivate = true;
        saveState();
        const ok = await supaSavePublicProfile({ is_private: true });
        return ok;
      });
      expect(prive, "le profil de A est marqué privé (UPDATE profiles sous A)").toBe(true);
      expect(srv.prof(A).is_private, "la ligne profiles de A porte is_private").toBe(true);

      // B (non abonné) relit : le post de A doit avoir DISPARU de la réponse
      const apresPriveB = await b.page.evaluate(async (pid) => {
        const posts = await supaLoadPosts();
        return { nServeur: posts.length, encore: posts.some((p) => p.id === pid), local: !!findPostAnywhere(pid) };
      }, postId);
      expect(apresPriveB.encore, "le serveur ne livre plus le post d'un compte privé à un non-abonné").toBe(false);
      // Ce que le CLIENT fait d'un post devenu invisible : il reste dans
      // `state.supabasePosts` tant que la lecture rend `[]` (« rien à remplacer »).
      // Mesuré, pas supposé — E-02 si vrai.
      const resteDansFilB = apresPriveB.local;

      // C relit sans session : rien non plus
      const apresPriveC = await c.page.evaluate(async (pid) => {
        const r = await supa.from("posts").select("id").eq("id", pid);
        return { n: (r.data || []).length, status: r.status };
      }, postId);
      expect(apresPriveC.n, "un visiteur ne lit pas le post d'un compte privé").toBe(0);

      // ── A supprime (vrai chemin deletePost → pierre tombale → file serveur) ─
      await a.page.evaluate(async (pid) => {
        state.userPosts = state.userPosts || [];
        if (!findPostAnywhere(pid)) state.userPosts.push({ id: pid, authorId: MY_UID, type: "text", text: "Publication d'Alice pour l'audit E", passion: "musique", createdAt: Date.now(), _source: "me" });
        deletePost(pid);
        await new Promise((r) => setTimeout(r, 1500));
      }, postId);
      await a.page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("passio_post_delete_outbox_v1") || "[]").length === 0; } catch (e) { return false; } }, null, { timeout: 20000 }).catch(() => {});
      expect(srv.t.posts.some((p) => p.id === postId), "la ligne posts est supprimée en base").toBe(false);
      const tombeA = await a.page.evaluate((pid) => postSupprime(pid), postId);
      expect(tombeA, "A porte la pierre tombale").toBe(true);

      // B rouvre le lien : « introuvable ou supprimée », aucune fuite de contenu
      const lienChezB = await b.page.evaluate(async (pid) => {
        window.__toasts = [];
        state.supabasePosts = []; renderFeed();
        location.hash = "#post-" + pid;
        _lienPartage = _lienPartageLire(); _lienPartageEssais = 0; _lienPartageCible = false;
        const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
          const fini = _ouvrirLienPartage();
          if (fini || (window.__toasts || []).length) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        return { toasts: (window.__toasts || []).map((t) => t.msg), detail: !!document.querySelector("#postDetailPage.active") };
      }, postId);
      expect(lienChezB.toasts.join(" | "), "B lit un verdict neutre sur le lien d'un post supprimé").toMatch(/introuvable ou supprimée/);
      expect(lienChezB.detail, "aucune page détail ne s'ouvre chez B").toBe(false);

      // Recherche chez B : le post n'est plus dans ses lectures serveur
      const rechercheB = await b.page.evaluate(async (pid) => {
        const r = await supa.from("posts").select("id,content").ilike("content", "%Alice pour l'audit%");
        return (r.data || []).length;
      });
      expect(rechercheB, "la recherche de B ne rend plus le texte").toBe(0);
      // Notification : aucune notification de A chez B n'a été créée par ce parcours
      expect(srv.t.notifications.filter((n) => n.user_id === B).length).toBe(0);

      // C (visiteur) : aperçu neutre
      const lienChezC = await c.page.evaluate(async (pid) => {
        window.__toasts = [];
        state.supabasePosts = [];
        location.hash = "#post-" + pid;
        _lienPartage = _lienPartageLire(); _lienPartageEssais = 0; _lienPartageCible = false;
        const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
          const fini = _ouvrirLienPartage();
          if (fini || (window.__toasts || []).length) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        return (window.__toasts || []).map((t) => t.msg);
      }, postId);
      expect(lienChezC.join(" | ")).toMatch(/introuvable ou supprimée/);

      console.log("[E-a] post privé resté dans le fil local de B après passage privé :", resteDansFilB, "| requêtes :", srv.journal.length);
      test.info().annotations.push({ type: "E-a", description: "post devenu privé encore dans state.supabasePosts de B = " + resteDansFilB });
    } finally { await ctxA.close(); await ctxB.close(); await ctxC.close(); }
  });
});

test.describe("AUDIT E — activité : capacité 2, course pour la dernière place, liste d'attente, annulation", () => {
  test.setTimeout(240000);

  test("b. B et C rejoignent, D et C en course, A change la date puis annule, B se retire → promotion (B-02)", async ({ browser }) => {
    const srv = new FauxServeur();
    srv.compte(A, "alice_e2e"); srv.compte(B, "bob_e2e"); srv.compte(C, "carol_e2e"); srv.compte(D, "dan_e2e");
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(), ctxC = await browser.newContext(), ctxD = await browser.newContext();
    try {
      const a = await ouvrirCompte(ctxA, srv, A, { nom: "alice_e2e" });
      const evId = "evt_e2e_" + Date.now().toString(36);
      const dans2j = Date.now() + 2 * 86400000;
      const pubEv = await a.page.evaluate(async ([id, date]) => {
        const ok = await supaPublishEvent({ id, title: "Jam capacité 2", passion: "musique", city: "Annecy", emoji: "🎸", date, maxAttendees: 2, desc: "audit E", lat: 45.9, lng: 6.12 });
        return ok;
      }, [evId, dans2j]);
      expect(pubEv, "A publie l'activité (events INSERT, author_id = A)").toBe(true);
      const evRow = srv.t.events.find((e) => e.id === evId);
      expect(evRow.max_attendees).toBe(2);

      // Les trois autres chargent l'activité par le VRAI chemin (supaLoadEvents sous leur compte)
      const pages = {};
      for (const [uid, ctx, nom] of [[B, ctxB, "bob_e2e"], [C, ctxC, "carol_e2e"], [D, ctxD, "dan_e2e"]]) {
        const p = await ouvrirCompte(ctx, srv, uid, { nom });
        pages[uid] = p.page;
        const charge = await p.page.evaluate(async (id) => {
          const evs = await supaLoadEvents();
          const ev = evs.find((e) => e.id === id);
          if (!ev) return null;
          state.seed.events = state.seed.events || [];
          state.seed.events = state.seed.events.filter((e) => e.id !== id);
          state.seed.events.unshift(ev);
          saveState();
          return { attendees: ev.attendees, max: ev.maxAttendees, fromSupabase: ev.fromSupabase };
        }, evId);
        expect(charge, "l'activité de A est lisible par " + nom).toBeTruthy();
        expect(charge.fromSupabase).toBe(true);
      }

      // ── B rejoint (vrai handler toggleJoinEvent) ───────────────────────────
      await pages[B].evaluate((id) => toggleJoinEvent(id), evId);
      await pages[B].waitForFunction((id) => myRsvp(id) === "going", evId, { timeout: 15000 });
      await pages[B].waitForTimeout(1200); // supaSetEventRsvp + supaInsertNotif atterrissent
      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === B).rsvp, "B est `going` en base").toBe("going");
      expect(srv.t.notifications.some((n) => n.user_id === A && n.kind === "event_join" && n.from_id === B), "A est notifié de l'arrivée de B").toBe(true);

      // ── C et D : deux `toggleJoinEvent` SIMULTANÉS pour la dernière place ──
      // Chacun croit l'activité à 1 inscrit (B) : les deux envoient `going`.
      await Promise.all([C, D].map((uid) => pages[uid].evaluate((id) => { const ev = _findCanonicalEvent(id); ev.attendees = ev.attendees.filter((x) => x !== MY_UID); toggleJoinEvent(id); }, evId)));
      await Promise.all([C, D].map((uid) => pages[uid].waitForFunction(() => (window.__toasts || []).length > 0 || (window.__hasRsvp = true), null, { timeout: 15000 }).catch(() => {})));
      await pages[C].waitForTimeout(1500);
      const lignes = srv.t.event_attendees.filter((x) => x.event_id === evId);
      const going = lignes.filter((x) => x.rsvp === "going").map((x) => x.user_id);
      const envoisCD = srv.requetes((r) => r.table === "event_attendees" && (r.m === "POST" || r.m === "PATCH") && (r.me === C || r.me === D));
      console.log("[E-b] course : going =", going, "| envois C/D =", envoisCD.map((r) => r.me.slice(0, 1) + ":" + r.m + ":" + ((r.body && r.body.rsvp) || "")));
      expect(going.length, "la capacité 2 est tenue : jamais trois `going`").toBeLessThanOrEqual(2);
      expect(going).toContain(B);
      const perdant = [C, D].find((u) => !going.includes(u));
      const gagnant = [C, D].find((u) => going.includes(u));
      expect(gagnant, "l'un des deux a la dernière place").toBeTruthy();
      // Le perdant a reçu `activite_complete` : que fait son client ?
      const etatPerdant = await pages[perdant].evaluate((id) => ({ rsvp: myRsvp(id), toasts: (window.__toasts || []).map((t) => t.msg), going: (_findCanonicalEvent(id).attendees || []).includes(MY_UID) }), evId);
      console.log("[E-b] perdant", perdant.slice(0, 8), etatPerdant);
      expect(etatPerdant.going, "le perdant n'est PAS compté `going` localement (optimiste annulé)").toBe(false);
      expect(etatPerdant.toasts.join(" | "), "le perdant lit la vraie raison et la sortie (liste d'attente)").toMatch(/complète|liste d'attente/);
      const lignePerdant = lignes.find((x) => x.user_id === perdant);
      // ⚠️ Le perdant n'a AUCUNE ligne : le refus du trigger a annulé l'INSERT.
      // Il n'est donc pas inscrit en liste d'attente automatiquement — E-03 si on
      // attendait une bascule automatique. On mesure et on consigne.
      test.info().annotations.push({ type: "E-b", description: "ligne du perdant après refus = " + JSON.stringify(lignePerdant || null) + " ; rsvp local = " + etatPerdant.rsvp });

      // SECOND TAP du perdant SANS rechargement (ce que fait une personne qui lit « tu peux rejoindre la liste d'attente ») :
      // le compteur local est périmé (2 places, 1 inscrit vu) → le client renvoie `going`, refusé pareil ? (E-03)
      const nAvantRetap = srv.requetes((r) => r.table === "event_attendees" && r.me === perdant).length;
      const retap = await pages[perdant].evaluate(async (id) => {
        window.__toasts = [];
        toggleJoinEvent(id);
        await new Promise((r) => setTimeout(r, 1200));
        return { toasts: (window.__toasts || []).map((t) => t.msg), rsvp: myRsvp(id), attendeesLocaux: (_findCanonicalEvent(id).attendees || []).length, complet: _eventIsFull(_findCanonicalEvent(id)) };
      }, evId);
      const envoisRetap = srv.requetes((r) => r.table === "event_attendees" && r.me === perdant).slice(nAvantRetap).map((r) => r.m + ":" + ((r.body && r.body.rsvp) || ""));
      console.log("[E-b] second tap du perdant sans rechargement :", retap, "| envois :", envoisRetap);
      test.info().annotations.push({ type: "E-03", description: "second tap → rsvp envoyé = " + JSON.stringify(envoisRetap) + " ; verdict local = " + JSON.stringify(retap) });
      expect(srv.t.event_attendees.filter((x) => x.event_id === evId && x.rsvp === "going").length, "toujours 2 going").toBe(2);

      // Le perdant rejoint la liste d'attente À LA MAIN (second tap : l'activité est pleine)
      await pages[perdant].evaluate(async (id) => {
        const evs = await supaLoadEvents(); const ev = evs.find((e) => e.id === id);
        const canon = _findCanonicalEvent(id); canon.attendees = ev.attendees; canon.maybes = ev.maybes; canon.waitlist = ev.waitlist;
        window.__toasts = [];
        await setEventRsvp(id, "going");
      }, evId);
      await pages[perdant].waitForTimeout(800);
      expect(srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === perdant).rsvp, "le perdant est en liste d'attente en base").toBe("waitlist");

      // ── A change la date (co-org absent : UPDATE events par l'auteur) ───────
      const nouvelleDate = dans2j + 86400000;
      const maj = await a.page.evaluate(async ([id, date]) => {
        const ev = Object.assign({}, _findCanonicalEvent(id) || { id, title: "Jam capacité 2", passion: "musique", city: "Annecy", emoji: "🎸", maxAttendees: 2 }, { id, date });
        const ok = await supaUpdateEvent(ev);
        _notifyEventAttendees(Object.assign({}, ev, { attendees: [], maybes: [], waitlist: [], fromSupabase: true }), "a modifié la date", "event_update");
        return ok;
      }, [evId, nouvelleDate]);
      expect(maj, "A modifie la date (events UPDATE)").toBe(true);
      expect(Date.parse(srv.t.events.find((e) => e.id === evId).date_at), "la date en base a bougé").toBe(new Date(nouvelleDate).getTime());
      // Qui est prévenu du changement de date ? `_destinatairesActivite(ev)` lit l'objet LOCAL de A.
      const destinatairesMaj = await a.page.evaluate((id) => { const ev = _findCanonicalEvent(id); return ev ? _destinatairesActivite(ev) : null; }, evId);
      test.info().annotations.push({ type: "E-b-date", description: "destinataires calculés par A pour la modification = " + JSON.stringify(destinatairesMaj) });

      // ── B se retire : la promotion du premier de la file est TENTÉE (B-02) ─
      await pages[B].evaluate(async (id) => {
        const evs = await supaLoadEvents(); const ev = evs.find((e) => e.id === id);
        const canon = _findCanonicalEvent(id); Object.assign(canon, { attendees: ev.attendees, maybes: ev.maybes, waitlist: ev.waitlist, maxAttendees: 2, fromSupabase: true });
        window.__toasts = [];
        await setEventRsvp(id, null);
        await new Promise((r) => setTimeout(r, 800));
      }, evId);
      expect(srv.t.event_attendees.some((x) => x.event_id === evId && x.user_id === B), "B n'a plus de ligne").toBe(false);
      const tentativePromo = srv.requetes((r) => r.table === "event_attendees" && r.m === "PATCH" && r.me === B && r.url.includes("user_id=eq." + perdant));
      expect(tentativePromo.length, "le client de B TENTE l'UPDATE de la ligne du premier en attente").toBeGreaterThan(0);
      const lignePromu = srv.t.event_attendees.find((x) => x.event_id === evId && x.user_id === perdant);
      // B-02 : la policy UPDATE `user_id = me` → 0 ligne → la file n'a pas de sortie.
      expect(lignePromu.rsvp, "B-02 reproduit : la promotion cross-compte touche 0 ligne, la personne RESTE en attente").toBe("waitlist");
      expect(srv.t.notifications.some((n) => n.user_id === perdant && /place s'est libérée/.test(n.content)), "aucune fausse annonce « tu es inscrit·e »").toBe(false);

      // ── A annule : les inscrits sont prévenus ──────────────────────────────
      await a.page.evaluate(async (id) => {
        const evs = await supaLoadEvents(); const ev = evs.find((e) => e.id === id);
        const canon = _findCanonicalEvent(id) || (state.userEvents.push(ev), ev);
        Object.assign(canon, { attendees: ev.attendees, maybes: ev.maybes, waitlist: ev.waitlist, fromSupabase: true, organizerId: MY_UID, authorId: MY_UID });
        await toggleCancelEvent(id);
        await new Promise((r) => setTimeout(r, 800));
      }, evId);
      expect(srv.t.events.find((e) => e.id === evId).status, "events.status = cancelled").toBe("cancelled");
      const prevenus = srv.t.notifications.filter((n) => n.kind === "event_cancelled" && n.ref_id === evId).map((n) => n.user_id).sort();
      console.log("[E-b] prévenus de l'annulation :", prevenus, "| gagnant", gagnant.slice(0, 8), "| attente", perdant.slice(0, 8));
      expect(prevenus, "le `going` restant est prévenu").toContain(gagnant);
      test.info().annotations.push({ type: "E-b-annul", description: "prévenus = " + JSON.stringify(prevenus) + " ; liste d'attente prévenue = " + prevenus.includes(perdant) });

      // Après annulation : rejoindre est refusé par le trigger (activite_annulee), le client le dit
      // Le compte en liste d'attente (pas le gagnant, déjà `going` : `prev === rsvp` sortirait sans rien tenter).
      const apresAnnul = await pages[perdant].evaluate(async (id) => {
        const evs = await supaLoadEvents(); const ev = evs.find((e) => e.id === id);
        const canon = _findCanonicalEvent(id); Object.assign(canon, { attendees: ev.attendees, waitlist: ev.waitlist, status: "active", cancelled: false });
        window.__toasts = [];
        _setMyRsvpLocal(id, null);
        await setEventRsvp(id, "going");
        await new Promise((r) => setTimeout(r, 500));
        return { toasts: (window.__toasts || []).map((t) => t.msg), rsvp: myRsvp(id) };
      }, evId);
      console.log("[E-b] inscription après annulation (client qui ne sait pas encore) :", apresAnnul);
      expect(apresAnnul.toasts.join(" | ")).toMatch(/annulée|non enregistrée|complète/);
    } finally { await ctxA.close(); await ctxB.close(); await ctxC.close(); await ctxD.close(); }
  });
});
