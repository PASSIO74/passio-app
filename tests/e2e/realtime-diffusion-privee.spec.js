// ═══════════════════════════════════════════════════════════════════════════
// R25 — L'AJOUT À UNE CONVERSATION ET LA NOTIFICATION ARRIVENT PAR `user:<moi>`
// (audit 2026-11-02, lot du 2026-11-03)
//
// LE DÉFAUT : `conv_members` et `notifications` étaient publiées dans
// `supabase_realtime` pour UNE écoute chacune (INSERT filtré `user_id=eq.<moi>`).
// Or `realtime.apply_rls` livre chaque DELETE d'une table publiée à TOUT abonné
// sans évaluer la RLS, clé primaire en clair : `(evgrp_<activité>, compte)` à
// chaque départ d'une discussion d'activité, `n_pa_<activité>_<compte>` à chaque
// notification effacée — même à un visiteur muni de la seule clé anon. Reproduit
// avec le `apply_rls` de production : tests/sql/migration-realtime-diffusion-privee.test.sh.
//
// LE REMÈDE CÔTÉ CLIENT, ce que cette suite exige du VRAI câblage
// (`supaSubscribe`, `_subscribeUserTopic`, app-08) :
//   ① v3 : `user:<moi>` porte ses liaisons ; et depuis le 2026-11-09 (« 📴 »,
//      publication vide) plus AUCUN canal ne pose de liaison `postgres_changes`
//      — `realtime:db` lui-même est parti ;
//   ② soupapes v1/v2 : le topic est QUAND MÊME ouvert (ajouts, notifications) ;
//      les messages y sont lus hors v2 (v1 n'a plus de canal global) ;
//   ③ une notification poussée entre dans la cloche, neutralisée, toast compris,
//      une seule fois ; celle d'un autre compte est ignorée ;
//   ④ un ajout poussé fait apparaître la conversation, sans message fantôme ;
//   ⑤ LE PIÈGE DU LOT : une ligne `conv_members` reçue sous « INSERT » n'est pas
//      un message ;
//   ⑥ le contrat serveur ↔ client (noms d'événement, colonnes lues) ;
//   ⑦ un visiteur n'ouvre aucun topic ; ⑧ le socket au repos rejoint les trois
//      liaisons au réveil.
// Aucune requête ne part : `supa.channel` et `supa.from` sont simulés.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const COMPTE = "7c6b5a49-3827-4165-9473-2b1a0f9e8d7c";
const AUTRE_COMPTE = "11111111-1111-4111-8111-111111111111";

async function preparer(page, opts = {}) {
  await bootOnboarded(page);
  // Le démarrage d'abord : son bloc différé ne doit pas tomber au milieu du cas.
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate((opts) => {
    try { stopFeedRefreshLoop(); } catch (e) {}
    try { stopPostLikeRefresh(); } catch (e) {}
    MY_UID = opts.uid; window.MY_UID = MY_UID;
    window._supaReal = true;
    window._supaSubscribed = false; window._userTopicChan = null; window._callRingChan = null;
    window._privateConvChans = {};
    // `arme: true` : `_rtReposArmer` sort aussitôt (ni écouteurs ni minuteur pendant le cas).
    window._rtRepos = { endormi: false, masqueeDepuis: 0, dernierGeste: 0, endormiDepuis: 0, raison: null, cycles: 0, reveils: 0, timer: null, arme: true };
    window.appelsDisponibles = () => false; // pas de canal `ring:` dans ces cas
    window.ensureCallPushSubscription = () => {};
    window._pushAbonnementTente = true;
    window.__canaux = [];
    // SDK simulé qui RETIENT chaque liaison (type, filtre, gestionnaire). Posé par
    // `defineProperty` : en CI le vrai client est chargé, et une propriété propre
    // masque la méthode de prototype dans les deux mondes.
    const poser = (nom, valeur) => Object.defineProperty(window.supa, nom, { value: valeur, configurable: true, writable: true });
    poser("channel", function (topic, cfg) {
      const ch = { topic, prive: !!(cfg && cfg.config && cfg.config.private), liaisons: [], ferme: false,
        on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe() { return ch; }, unsubscribe: async () => { ch.ferme = true; return "ok"; } };
      window.__canaux.push(ch);
      return ch;
    });
    poser("removeChannel", async () => "ok");
    poser("removeAllChannels", async () => { window.__canaux.forEach((c) => { c.ferme = true; }); return []; });
    poser("realtime", { disconnect: () => {}, connect: () => {}, isConnected: () => false });
    // Le gestionnaire que le produit a posé pour `evenement` sur `user:<moi>`, ou null.
    window.__liaisonUser = (evenement) => {
      const ch = window.__canaux.filter((c) => c.topic === "user:" + MY_UID && !c.ferme).pop();
      const l = ch && ch.liaisons.find((x) => x.type === "broadcast" && x.filtre && x.filtre.event === evenement);
      return l ? l.cb : null;
    };
  }, { uid: opts.uid || COMPTE });
}

test.describe("R25 — ajouts et notifications poussés sur user:<moi>", () => {
  test("① v3 : user:<moi> porte ses liaisons (R25, puis 2026-11-09) ; plus aucune liaison postgres_changes, et la publication est vide", async ({ page }) => {
    await preparer(page);
    const publiees = JSON.parse(fs.readFileSync(path.join(RACINE, "scripts/realtime-publication.json"), "utf8")).publiees;
    const r = await page.evaluate(() => {
      window.PASSIO_REALTIME_V3 = true; window.PASSIO_REALTIME_V2 = false;
      supaSubscribe();
      const user = window.__canaux.find((c) => c.topic === "user:" + MY_UID);
      return {
        user: user && { prive: user.prive, liaisons: user.liaisons.map((l) => l.type + "|" + l.filtre.event) },
        sujets: window.__canaux.map((c) => c.topic),
        cdc: window.__canaux.flatMap((c) => c.liaisons).filter((l) => l.type === "postgres_changes").length,
      };
    });
    expect(r.user).toEqual({ prive: true, liaisons: ["broadcast|INSERT", "broadcast|conv_members:INSERT", "broadcast|notifications:INSERT",
      "broadcast|conv_reads:UPSERT", "broadcast|post_comments:INSERT", "broadcast|comment_interactions:INSERT", "broadcast|comment_interactions:DELETE"] });
    // ⚠️ LE PENDANT VIVANT DE LA GATE `audit:realtime`. Elle lit le texte ; ici on
    // compte ce que l'app POSE. Depuis la migration du 2026-11-09 (« 📴 ») la
    // publication est VIDE : une seule liaison `postgres_changes` ne recevrait
    // rien, et le serveur la réessaierait toutes les 5 à 10 s, canal ouvert.
    expect(publiees, "la publication déclarée est vide").toEqual([]);
    expect(r.cdc, "plus aucune liaison postgres_changes").toBe(0);
    expect(r.sujets, "`realtime:db` est parti").not.toContain("realtime:db");
  });

  test("② soupapes v1/v2 : user:<moi> est QUAND MÊME ouvert pour les ajouts et les notifications ; les messages y sont lus hors v2", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(() => {
      const essai = (v3, v2) => {
        window.__canaux.length = 0;
        window._supaSubscribed = false; window._userTopicChan = null; window._privateConvChans = {};
        window.PASSIO_REALTIME_V3 = v3; window.PASSIO_REALTIME_V2 = v2;
        supaSubscribe();
        const user = window.__canaux.find((c) => c.topic === "user:" + MY_UID);
        return { user: user ? user.liaisons.map((l) => l.filtre.event) : null,
                 cdc: window.__canaux.flatMap((c) => c.liaisons).filter((l) => l.type === "postgres_changes").length };
      };
      return { v1: essai(false, false), v2: essai(false, true), v3: essai(true, false) };
    });
    // v1 : son canal global `postgres_changes` est parti avec la publication (2026-11-09) ;
    // ses messages arrivent désormais par le topic, comme en v3.
    expect(r.v1).toEqual({ user: ["INSERT", "conv_members:INSERT", "notifications:INSERT", "conv_reads:UPSERT", "post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE"], cdc: 0 });
    // v2 : les messages arrivent par `conv:<id>` ; les lire AUSSI sur le topic les doublerait.
    expect(r.v2).toEqual({ user: ["conv_members:INSERT", "notifications:INSERT", "conv_reads:UPSERT", "post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE"], cdc: 0 });
    expect(r.v3).toEqual({ user: ["INSERT", "conv_members:INSERT", "notifications:INSERT", "conv_reads:UPSERT", "post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE"], cdc: 0 });
  });

  test("③ une notification poussée entre dans la cloche, neutralisée, toast compris, UNE fois ; celle d'un autre compte est ignorée", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(({ autre }) => {
      window.PASSIO_REALTIME_V3 = true;
      _subscribeUserTopic();
      const recevoir = window.__liaisonUser("notifications:INSERT");
      // ⚠️ UNE CLOCHE QUI CONTIENT DÉJÀ QUELQUE CHOSE (relecture adversariale du
      // 2026-11-03) : partir d'une cloche vide cachait que `mergeSupaNotifs`,
      // appelée avec la seule nouvelle, REMPLAÇAIT toutes les autres.
      state.notifications = [
        { id: "n_ancienne", kind: "follow", fromId: "u_marc", text: "Marc te suit", createdAt: Date.parse("2026-11-02T09:00:00Z"), unread: false, fromSupabase: true },
        { id: "n_locale", kind: "local", text: "Rappel local", createdAt: Date.parse("2026-11-02T08:00:00Z"), unread: false },
      ];
      window.__toasts = [];
      window.toast = (texte) => { window.__toasts.push(texte); };
      // La charge EXACTE de `diffuser_notification` (même forme qu'au banc SQL) :
      // `record` colonne par colonne, et l'`id` de message que `realtime.send` ajoute.
      const ligne = { id: "n_like_rt_1", user_id: MY_UID, kind: "like", from_id: "u_lea", ref_id: "post_9",
        content: "Léa <b>aime</b> ta publication", seen: false, created_at: "2026-11-03T10:00:00.123456" };
      const message = (rec) => ({ type: "broadcast", event: "notifications:INSERT",
        payload: { "table": "notifications", "operation": "INSERT", "record": rec, "id": "9f2c7d0e-0000-4000-8000-000000000001" } });
      recevoir(message(ligne));
      recevoir(message(ligne)); // rejeu : aucune seconde entrée, aucun second toast
      recevoir(message({ ...ligne, id: "n_pour_un_autre", user_id: autre }));
      // Un émetteur BLOQUÉ : la cloche l'écarte, et désormais le toast aussi.
      window.isBlocked = (id) => id === "u_bloque";
      recevoir(message({ ...ligne, id: "n_bloque", from_id: "u_bloque", content: "Je reviens" }));
      // Une apostrophe échappée par l'émetteur : le toast la montre en clair.
      recevoir(message({ ...ligne, id: "n_apostrophe", from_id: "u_equipe", content: "L&#39;équipe t&#39;a invité" }));
      const n = state.notifications.filter((x) => x.id === "n_like_rt_1");
      return { n: n.length, unread: n[0] && n[0].unread, kind: n[0] && n[0].kind, de: n[0] && n[0].fromId, cible: n[0] && n[0].refId,
               texte: n[0] && n[0].text, quand: n[0] && n[0].createdAt,
               garde: ["n_ancienne", "n_locale"].map((id) => state.notifications.some((x) => x.id === id)),
               bloque: state.notifications.some((x) => x.id === "n_bloque"),
               autre: state.notifications.some((x) => x.id === "n_pour_un_autre"), toasts: window.__toasts };
    }, { autre: AUTRE_COMPTE });
    expect(r.n).toBe(1);
    expect([r.unread, r.kind, r.de, r.cible]).toEqual([true, "like", "u_lea", "post_9"]);
    // Le point de passage UNIQUE (`mergeSupaNotifs`) neutralise le texte d'autrui :
    // le nouveau transport n'a pas de chemin de côté.
    expect(r.texte).toBe("Léa &lt;b&gt;aime&lt;/b&gt; ta publication");
    expect(r.quand).toBe(Date.parse("2026-11-03T10:00:00.123Z")); // `timestamp` sans fuseau = UTC (supaTs)
    expect(r.autre, "un canal est un transport : la garde `user_id === MY_UID` reste").toBe(false);
    expect(r.garde, "la cloche garde ce qu'elle avait : distante ET locale").toEqual([true, true]);
    expect(r.bloque, "un émetteur bloqué n'entre pas dans la cloche").toBe(false);
    // `toast()` écrit en `textContent` : du texte BRUT, ni « &lt;b&gt; » ni « &#39; »,
    // et rien pour l'émetteur bloqué.
    expect(r.toasts).toEqual(["Léa aime ta publication", "L'équipe t'a invité"]);
  });

  test("④ un ajout poussé fait apparaître la conversation, sans message fantôme ; celui d'un autre compte est ignoré", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async ({ autre }) => {
      window.PASSIO_REALTIME_V3 = true; window.PASSIO_REALTIME_V2 = false;
      // Faux PostgREST : ce que la RLS rend au membre AJOUTÉ (il est membre).
      const reponses = {
        conversations: { data: { id: "grp_rt_1", is_group: true, group_name: "Rando du dimanche", created_by: "u_lea", created_at: "2026-11-03T09:00:00" }, error: null },
        conv_members: { data: [{ user_id: MY_UID, profiles: null }, { user_id: "u_lea", profiles: { username: "Léa", emoji: "🥾", color: "#123456", avatar_url: null } }], error: null },
      };
      window.__lectures = [];
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: (table) => {
        window.__lectures.push(table);
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
          maybeSingle: () => Promise.resolve(reponses[table] || { data: null, error: null }),
          then: (ok, ko) => Promise.resolve(reponses[table] || { data: [], error: null }).then(ok, ko) };
        return q;
      } });
      window.__rendus = 0; window.renderMessages = () => { window.__rendus++; };
      _subscribeUserTopic();
      const ajout = window.__liaisonUser("conv_members:INSERT");
      const charge = (rec) => ({ payload: { "table": "conv_members", "operation": "INSERT", "record": rec } });
      await ajout(charge({ conv_id: "grp_rt_autre", user_id: autre }));
      const lecturesPourAutrui = window.__lectures.length;
      await ajout(charge({ conv_id: "grp_rt_1", user_id: MY_UID }));
      await ajout(charge({ conv_id: "grp_rt_1", user_id: MY_UID })); // rejeu : déjà là, rien ne se relit
      const c = getConversations().filter((x) => x.id === "grp_rt_1");
      return { autre: getConversations().some((x) => x.id === "grp_rt_autre"), lecturesPourAutrui,
               lectures: window.__lectures, n: c.length, groupe: c[0] && c[0].isGroup, nom: c[0] && c[0].groupName,
               messages: c[0] && c[0].messages.length, unread: c[0] && c[0].unread, membres: c[0] && c[0].userIds, rendus: window.__rendus };
    }, { autre: AUTRE_COMPTE });
    expect(r.autre).toBe(false);
    expect(r.lecturesPourAutrui, "un ajout qui ne me concerne pas ne coûte aucune requête").toBe(0);
    expect(r.lectures).toEqual(["conversations", "conv_members"]);
    expect(r).toMatchObject({ n: 1, groupe: true, nom: "Rando du dimanche", messages: 0, unread: 0, rendus: 1 });
    expect(r.membres).toEqual([COMPTE, "u_lea"]);
  });

  test("④ bis — la base tranche : retiré aussitôt, 1:1 sans correspondant, ou déjà posée pendant la lecture → rien de matérialisé", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      window.PASSIO_REALTIME_V3 = true; window.PASSIO_REALTIME_V2 = false;
      let reponses = {};
      window.__pendantLecture = null;
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: (table) => {
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
          maybeSingle: () => Promise.resolve(reponses[table] || { data: null, error: null }),
          then: (ok, ko) => {
            if (table === "conv_members" && window.__pendantLecture) window.__pendantLecture();
            return Promise.resolve(reponses[table] || { data: [], error: null }).then(ok, ko);
          } };
        return q;
      } });
      window.__rendus = 0; window.renderMessages = () => { window.__rendus++; };
      _subscribeUserTopic();
      const ajout = window.__liaisonUser("conv_members:INSERT");
      const pousser = (conv) => ajout({ payload: { "table": "conv_members", "operation": "INSERT", "record": { conv_id: conv, user_id: MY_UID } } });
      const combien = (id) => getConversations().filter((c) => c.id === id).length;
      // (a) Ajouté puis retiré aussitôt (« Suppression admin ») : la relecture ne me compte plus.
      reponses = { conversations: { data: { id: "grp_retire", is_group: true, created_by: "u_lea" }, error: null },
                   conv_members: { data: [{ user_id: "u_lea", profiles: null }], error: null } };
      await pousser("grp_retire");
      // (b) Le CRÉATEUR d'un 1:1 : sa ligne arrive avant celle du pair, aucun correspondant lisible.
      reponses = { conversations: { data: { id: "dm_createur", is_group: false, created_by: MY_UID }, error: null },
                   conv_members: { data: [{ user_id: MY_UID, profiles: null }], error: null } };
      await pousser("dm_createur");
      // (c) Le flux de création local pose l'entrée PENDANT la lecture des membres.
      reponses = { conversations: { data: { id: "grp_course", is_group: true, group_name: "Course", created_by: MY_UID }, error: null },
                   conv_members: { data: [{ user_id: MY_UID, profiles: null }, { user_id: "u_lea", profiles: null }], error: null } };
      window.__pendantLecture = () => { conversationsState = [{ id: "grp_course", isGroup: true, groupName: "Course", messages: [] }].concat(getConversations()); };
      await pousser("grp_course");
      window.__pendantLecture = null;
      return { retire: combien("grp_retire"), createur: combien("dm_createur"), course: combien("grp_course"), rendus: window.__rendus };
    });
    expect(r).toEqual({ retire: 0, createur: 0, course: 1, rendus: 0 });
  });

  test("④ ter — créer un groupe dont la poussée est arrivée AVANT la fin de la création : une seule entrée, la locale", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      // Le formulaire, réduit à ce que `confirmCreateGroup` lit.
      document.body.insertAdjacentHTML("beforeend",
        '<div id="__formGroupe"><input id="groupName" value="Rando du jeudi">' +
        '<label class="group-passion-option selected"><input value="randonnee"></label>' +
        '<label class="group-user-option selected"><input value="u_lea"></label></div>');
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: () => {
        const q = { insert: () => Promise.resolve({ error: null }), select: () => q, eq: () => q,
          then: (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko) };
        return q;
      } });
      // La poussée de MA ligne arrive pendant `supaCreateGroup` et pose l'entrée.
      window.supaCreateGroup = async () => {
        conversationsState = [{ id: "grp_pousse", isGroup: true, groupName: "Rando du jeudi", messages: [], fromSupabase: true }].concat(getConversations());
        return "grp_pousse";
      };
      window.toast = () => {}; window.closeModal = () => {}; window.renderMessages = () => {};
      await confirmCreateGroup();
      const c = getConversations().filter((x) => x.id === "grp_pousse");
      document.getElementById("__formGroupe").remove();
      return { n: c.length, bienvenue: c[0] && c[0].messages.length, passions: c[0] && c[0].groupPassions };
    });
    expect(r).toEqual({ n: 1, bienvenue: 1, passions: ["randonnee"] });
  });

  test("⑤ LE PIÈGE DU LOT : une ligne `conv_members` reçue sous « INSERT » n'est PAS un message", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(() => {
      window.PASSIO_REALTIME_V3 = true;
      const recus = [];
      window._handleIncomingConvMessage = (ligne) => { recus.push(ligne.id || ("sans-id:" + ligne.conv_id)); };
      _subscribeUserTopic();
      const insert = window.__liaisonUser("INSERT");
      // Ce qu'un serveur MAL réglé enverrait (une table de R25 sous « INSERT ») :
      // l'ancien gestionnaire n'exigeait qu'un `conv_id`, et en aurait fait une bulle.
      insert({ payload: { "table": "conv_members", "operation": "INSERT", "record": { conv_id: "grp_x", user_id: MY_UID } } });
      insert({ payload: { "table": "notifications", "operation": "INSERT", "record": { id: "n_1", conv_id: "grp_x", user_id: MY_UID } } });
      // Le vrai message, tel que `broadcast_changes` le pose, et la forme nue d'avant.
      insert({ payload: { "table": "conv_messages", "operation": "INSERT", "record": { id: "m_1", conv_id: "grp_x", from_id: "u_lea", content: "salut" } } });
      insert({ payload: { id: "m_2", conv_id: "grp_x", from_id: "u_lea", content: "re" } });
      return recus;
    });
    expect(r).toEqual(["m_1", "m_2"]);
  });

  test("⑥ le contrat serveur ↔ client : mêmes événements, colonnes lues ⊂ colonnes poussées, jamais « INSERT »", async () => {
    const sql = fs.readFileSync(path.join(RACINE, "migrations/migration_realtime_diffusion_privee_2026-11-03.sql"), "utf8");
    const app08 = fs.readFileSync(path.join(RACINE, "js/app-08-ui-modals-tour.js"), "utf8");
    // Le corps d'une fonction SQL du lot, sans les commentaires de l'en-tête.
    const corps = (nom) => {
      const i = sql.indexOf(`create or replace function public.${nom}()`);
      expect(i, `fonction ${nom} absente de la migration`).toBeGreaterThan(0);
      return sql.slice(i, sql.indexOf("$$;", i));
    };
    const pousseNotif = corps("diffuser_notification"), pousseMembre = corps("diffuser_ajout_membre");
    const evenement = (src) => (/'([a-z_]+:INSERT)',\s*'user:' \|\| new\.user_id,/.exec(src) || [])[1];
    expect([evenement(pousseNotif), evenement(pousseMembre)]).toEqual(["notifications:INSERT", "conv_members:INSERT"]);
    for (const e of ["notifications:INSERT", "conv_members:INSERT"]) {
      expect(app08, `le client n'écoute pas « ${e} »`).toContain(`ch.on("broadcast", { event: "${e}" }`);
    }
    // Les colonnes que le gestionnaire LIT doivent être dans celles que le serveur
    // POUSSE : une colonne lue et jamais envoyée rendrait `undefined`, en silence.
    const poussees = new Set([...pousseNotif.matchAll(/'([a-z_]+)', (?:left\()?new\.\1\b/g)].map((m) => m[1]));
    const i = app08.indexOf("function _rtNotificationRecue(r)");
    const lues = new Set([...app08.slice(i, app08.indexOf("window._rtNotificationRecue =", i)).matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]));
    expect(lues.size).toBeGreaterThan(4);
    for (const c of lues) expect(poussees, `le client lit r.${c}, que le serveur ne pousse pas`).toContain(c);
    expect(poussees.has("origine"), "la provenance serveur ne voyage pas").toBe(false);
    const j = app08.indexOf("async function _rtAjoutConversationRecu(r)");
    const luesAjout = new Set([...app08.slice(j, app08.indexOf("window._rtAjoutConversationRecu =", j)).matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]));
    expect([...luesAjout].sort()).toEqual(["conv_id", "user_id"]);
    expect(pousseMembre).toContain("jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id)");
  });

  test("⑨ une exception sur le topic user: n'emporte pas le reste du temps réel", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(() => {
      window.PASSIO_REALTIME_V3 = true;
      const canal = window.supa.channel;
      Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic, cfg) {
        if (String(topic).startsWith("user:")) throw new Error("refus simulé");
        return canal.call(this, topic, cfg);
      } });
      // Depuis le 2026-11-09 (« 📴 »), « le reste » n'est plus `realtime:db` (parti
      // avec la publication) : c'est l'armement du repos et les sujets des
      // discussions à l'écran, posés APRÈS le topic. On les observe tous deux.
      const appels = [];
      const reposArmer = window._rtReposArmer, reconcilier = window._filsRtReconcilier;
      window._rtReposArmer = function () { appels.push("repos"); return reposArmer.apply(this, arguments); };
      window._filsRtReconcilier = function () { appels.push("fils"); return reconcilier.apply(this, arguments); };
      try { supaSubscribe(); } finally { window._rtReposArmer = reposArmer; window._filsRtReconcilier = reconcilier; }
      return { appels, abonne: window._supaSubscribed === true };
    });
    expect(r, "le repos s'arme et les sujets des discussions se rejoignent même si user: a levé").toEqual({ appels: ["repos", "fils"], abonne: true });
  });

  test("⑦ un visiteur n'ouvre aucun topic user:", async ({ page }) => {
    await preparer(page, { uid: "u_visiteur_42" });
    const topics = await page.evaluate(() => { _subscribeUserTopic(); return window.__canaux.map((c) => c.topic); });
    expect(topics).toEqual([]);
  });

  test("⑧ socket au repos puis réveil : user:<moi> revient avec TOUTES ses liaisons, et la cloche est relue", async ({ page }) => {
    await preparer(page);
    // ⚠️ LE BLOC DIFFÉRÉ DU DÉMARRAGE D'ABORD (même piège que
    // `capacite-socket-au-repos`) : `supaInit` relit les notifications ~2 s après
    // le boot. Tombé pendant le cas, il comptait une relecture que le RÉVEIL n'a
    // pas faite — 1 rouge sur 3, mesuré, avant cette attente.
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => {
      window.PASSIO_REALTIME_V3 = true;
      window.__relectures = 0;
      window.supaLoadNotifications = async () => { window.__relectures++; return []; };
      window._rafraichirConversationsServeur = async () => {};
      window._rattraperConversationOuverte = async () => {};
      window.feedFiletReveiller = () => {};
      window.supaRefreshVideoLives = () => false;
      window.tel = { action: () => {}, recv: () => {}, flowStart: () => null };
      supaSubscribe();
      _rtEndormir("masque");
      const endormi = { topics: window.__canaux.filter((c) => !c.ferme).length, chan: window._userTopicChan };
      _rtReveiller("retour");
      const user = window.__canaux.filter((c) => c.topic === "user:" + MY_UID && !c.ferme);
      return { endormi, rouverts: user.length, liaisons: user.length ? user[0].liaisons.map((l) => l.filtre.event) : null };
    });
    expect(r.endormi).toEqual({ topics: 0, chan: null });
    expect(r.rouverts).toBe(1);
    expect(r.liaisons).toEqual(["INSERT", "conv_members:INSERT", "notifications:INSERT", "conv_reads:UPSERT", "post_comments:INSERT", "comment_interactions:INSERT", "comment_interactions:DELETE"]);
    // Ce qui est arrivé pendant le repos n'est pas rejoué par Realtime : on le RELIT.
    await expect.poll(() => page.evaluate(() => window.__relectures)).toBe(1);
  });
});
