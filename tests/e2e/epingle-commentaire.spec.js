// ═══════════════════════════════════════════════════════════════════════════
// RV-38 — ÉPINGLER UN COMMENTAIRE : LE VERDICT DE L'ÉCRITURE EST LU ET DIT, ET
// L'ÉPINGLE EST UN ÉTAT DU FIL, LU AU NIVEAU DU FIL, DU SEUL PROPRIÉTAIRE
// (audit 2026-11-02, 05/11)
//
// LE DÉFAUT : `togglePinComment` (app-04) écrivait l'épingle par
// `supaCommentInteract` sans lire le résultat ; la base la refusait toujours
// (`ci_kind_check` n'admet pas « pin » : 23514), et l'écran disait « Commentaire
// épinglé ». L'épingle restait locale à l'appareil du propriétaire. Et le lecteur
// (`supaLoadCommentInteractions`) prenait la dernière ligne « pin » d'un
// commentaire, de QUI qu'elle soit, dans N'IMPORTE quel fil.
//
// CE QUE CETTE SUITE EXIGE :
//   ① le propriétaire épingle : l'écriture porte le contrat de la garde serveur
//     (son compte, le fil, « 1 »), la cible part AVANT le « 0 » de l'ancien
//     épinglé, l'écran et le toast le disent ; retirer écrit « 0 » ;
//   ② un refus 23514 (la base sans la migration RV-38) DÉFAIT l'épingle à
//     l'écran — l'ancien épinglé revient — et le dit ; rien d'autre ne part ;
//   ③ un refus 42501 et une panne réseau : même retour, chacun son mot ;
//   ④ qui n'est pas le propriétaire, ou un commentaire pas encore envoyé
//     (publication ou activité) : rien ne part, et la raison est dite ;
//   ⑤ la LECTURE (B voit l'épingle) se fait au niveau du FIL : seules les lignes
//     du propriétaire, dans CE fil, sont demandées ; le « 1 » le plus récent
//     l'emporte, sauf si un « 0 » plus récent vise ce même commentaire ;
//   ⑥ un seul épinglé par fil : deux appareils du propriétaire en ont posé deux,
//     le plus récent l'emporte ;
//   ⑦ une lecture en ÉCHEC — après une page relue, qui reconstruit les objets
//     sans leur drapeau — ne retire rien ; une lecture RÉUSSIE retire l'épingle
//     restée locale d'avant RV-38 (personne d'autre ne la voyait) ;
//   ⑧ EN DIRECT (la vraie liaison de `_creerCanalDb`) : l'épingle du
//     propriétaire s'applique — la mienne aussi, venue d'un autre de mes
//     appareils —, celle d'un autre compte non, « 0 » la retire ;
//   ⑨ une lecture partie AVANT ou PENDANT une épingle ne l'efface pas en revenant ;
//   ⑩ retirer l'épinglé ne fait reparaître aucun « 1 » plus ancien, même quand le
//     « 0 » de l'ancien s'est perdu ;
//   ⑪ une page relue PENDANT l'écriture : l'épingle confirmée reste à l'écran ;
//   ⑫ l'épinglé plus ancien que la première page (30) est lu par son identifiant
//     et montré en tête, chez tous ; « précédents » ne le redouble pas ;
//   ⑬ un fil HOMONYME (une publication et une activité sous le même identifiant)
//     n'a pas de propriétaire : aucune épingle lue, reçue ni posée — l'auteur de
//     la publication homonyme passait pour le propriétaire de l'activité ;
//   ⑭ une ligne d'épingle RETIRÉE en direct (purge, retour arrière) : la vérité
//     du fil se relit.
// ⑨ à ⑫ (et ⑦) viennent de la contre-revue du lot (audit-passio, six
// reproductions), ⑬ et ⑭ de la red team de la migration (P2 et P4).
// Aucune requête ne part : `supa.from` et `supa.channel` sont
// simulés. Fiche : docs/journal/serveur-securite-base.md, « 📌 RV-38 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "6f3a1c2e-9b7d-4e8f-8a0b-1c2d3e4f5a38";
const ALICE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c38";
const ZOE = "9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e38";
const P = "post_rv38_moi";      // ma publication
const PA = "post_rv38_alice";   // celle d'Alice

async function preparer(page) {
  await bootOnboarded(page);
  await page.waitForFunction(() => window._supaInitTerminee === true || !window._supaReal, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate((o) => {
    try { stopFeedRefreshLoop(); } catch (e) {}
    try { stopPostLikeRefresh(); } catch (e) {}
    try { _clearProfileCache(); } catch (e) {}
    window._cmtThreadLoadedAt = {};
    window._feedExtraPosts = [];
    state.user.blocked = [];
    MY_UID = o.moi; window.MY_UID = MY_UID;
    window._supaReal = true;
    window.requireAuthentication = () => true;
    window.supaInsertNotif = async () => null;
    window.supaTrack = async () => null;
    window.__toasts = [];
    window.toast = (t) => { window.__toasts.push(String(t)); };
    // Deux publications du SERVEUR : la mienne, celle d'Alice.
    const pub = (id, auteur, nom) => ({ id, authorId: auteur, authorName: nom, authorEmoji: "📷", passion: "photo", mood: "all",
      text: "Publication " + id, content: "Publication " + id, createdAt: Date.now() - 3600000, likes: 0, liked: false,
      comments: [], reactions: [], fromSupabase: true });
    state.supabasePosts = [pub(o.P, o.moi, "Moi"), pub(o.PA, o.alice, "Alice")];
    state.userPosts = [];
    window.__profils = [
      { id: o.alice, username: "Alice", emoji: "📷", color: "#123456", avatar_url: null, passion_id: "photo", passions: [], bio: "" },
      { id: o.zoe, username: "Zoé", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" },
    ];
    window.__commentaires = [
      { id: "c_rv38_1", post_id: o.P, author_id: o.alice, content: "Premier, d'Alice", created_at: "2026-11-05T08:01:00" },
      { id: "c_rv38_2", post_id: o.P, author_id: o.zoe, content: "Deuxième, de Zoé", created_at: "2026-11-05T08:02:00" },
      { id: "c_rv38_a1", post_id: o.PA, author_id: o.zoe, content: "A1, de Zoé", created_at: "2026-11-05T08:03:00" },
      { id: "c_rv38_a2", post_id: o.PA, author_id: o.moi, content: "A2, de moi", created_at: "2026-11-05T08:04:00" },
      { id: "c_rv38_a3", post_id: o.PA, author_id: o.zoe, content: "A3, de Zoé", created_at: "2026-11-05T08:05:00" },
    ];
    // ── Le « serveur » : des tables, des écritures et des lectures journalisées ──
    window.__interactions = [];
    window.__ecritures = [];
    window.__lectures = [];
    window.__verdictEcriture = null;   // (ligne) => { error } pour refuser
    window.__lectureEnErreur = false;  // les lectures de comment_interactions échouent
    window.__delaiLecture = 0;         // … ou arrivent au bout de ce délai (l'instantané est pris à la requête)
    window.__delaiEpingle = 0;         // la seule lecture de l'épingle du fil (filtre `kind`)
    window.__delaiInteractions = 0;    // les seules lectures des interactions (« j'aime », réponses)
    window.__delaiEcriture = 0;        // l'INSERT n'est validé qu'au bout de ce délai
    window.__delaiCommentaires = 0;    // la page post_comments arrive au bout de ce délai
    window.__horloge = Date.parse("2026-11-05T09:00:00Z");
    // Filtres et ordre de PostgREST : chaque `eq`, chaque `in`, l'ordre demandé, la limite.
    const filtrer = (rows, req) => {
      let r = rows.filter((x) => req.eqs.every(([c, v]) => String(x[c]) === String(v))
        && Object.entries(req.ins).every(([c, vs]) => vs.includes(x[c])));
      // Le curseur de « précédents » (`supaLoadComments`) : plus ancien que la dernière ligne lue.
      if (req.or) {
        const lire = (m) => (m ? (m[1].startsWith('"') ? JSON.parse(m[1]) : m[1]) : null);
        const d = lire(/created_at\.lt\.("(?:[^"\\]|\\.)*"|[^,()]+)/.exec(req.or));
        const i = lire(/id\.lt\.("(?:[^"\\]|\\.)*"|[^,()]+)/.exec(req.or));
        if (d) r = r.filter((x) => x.created_at < d || (x.created_at === d && (i == null || x.id < i)));
      }
      const ord = req.orders[0];
      if (ord) r = r.slice().sort((a, b) => {
        const d = a[ord[0]] < b[ord[0]] ? -1 : a[ord[0]] > b[ord[0]] ? 1 : 0;
        return ord[1] === "desc" ? -d : d;
      });
      if (req.limit) r = r.slice(0, req.limit);
      const cols = String(req.cols || "").split(",").map((s) => s.trim()).filter(Boolean);
      return cols.length ? r.map((x) => Object.fromEntries(cols.map((c) => [c, x[c] === undefined ? null : x[c]]))) : r;
    };
    supa.from = function (table) {
      const req = { table, ins: {}, eqs: [], orders: [] };
      const q = {
        select: (cols) => { req.cols = cols; return q; },
        insert: (ligne) => { req.insert = ligne; return q; },
        eq: (col, v) => { req.eqs.push([col, v]); return q; },
        in: (col, vs) => { req.ins[col] = vs.slice(); return q; },
        order: (col, o) => { req.orders.push([col, o && o.ascending === false ? "desc" : "asc"]); return q; },
        limit: (n) => { req.limit = n; return q; },
        range: () => q, or: (f) => { req.or = f; return q; },
        then: (ok, ko) => {
          if (req.insert) {
            const ligne = Object.assign({}, req.insert);
            __ecritures.push(Object.assign({ table }, ligne));
            const v = typeof __verdictEcriture === "function" ? __verdictEcriture(ligne) : null;
            if (v && v.error) return Promise.resolve({ data: null, error: v.error }).then(ok, ko);
            // L'heure du SERVEUR (trg_rate_limit), qui avance d'une seconde par écriture.
            // `v.perdue` : la ligne est VALIDÉE en base, mais la réponse se perd en route.
            const valider = () => {
              __horloge += 1000;
              if (table === "comment_interactions") __interactions.push(Object.assign(ligne, { created_at: new Date(__horloge).toISOString() }));
              return { data: null, error: (v && v.perdue) || null };
            };
            if (__delaiEcriture) return new Promise((r) => setTimeout(r, __delaiEcriture)).then(valider).then(ok, ko);
            return Promise.resolve(valider()).then(ok, ko);
          }
          __lectures.push(req);
          if (table === "profiles") return Promise.resolve({ data: __profils.filter((p) => (req.ins.id || []).includes(p.id)), error: null }).then(ok, ko);
          if (table === "post_comments") {
            const rep = { data: filtrer(__commentaires, req), error: null };
            // Un délai propre à la lecture d'UN commentaire par son identifiant (`__delaiParId`).
            const parId = (req.eqs.find(([c]) => c === "id") || [])[1];
            const d = (parId && window.__delaiParId && __delaiParId[parId]) || __delaiCommentaires;
            if (d) return new Promise((r) => setTimeout(r, d)).then(() => rep).then(ok, ko);
            return Promise.resolve(rep).then(ok, ko);
          }
          if (table === "comment_interactions") {
            if (__lectureEnErreur) return Promise.resolve({ data: null, error: { code: "PGRST000", message: "lecture impossible" } }).then(ok, ko);
            const reponse = { data: filtrer(__interactions, req), error: null };   // instantané pris À LA REQUÊTE
            const delai = __delaiLecture || (req.eqs.some(([c]) => c === "kind") ? __delaiEpingle : __delaiInteractions);
            if (delai) return new Promise((r) => setTimeout(r, delai)).then(() => reponse).then(ok, ko);
            return Promise.resolve(reponse).then(ok, ko);
          }
          return Promise.resolve({ data: [], error: null }).then(ok, ko);
        },
      };
      return q;
    };
    // ── Le temps réel simulé, qui RETIENT chaque liaison (comme R37) ──
    window.__canaux = [];
    Object.defineProperty(window.supa, "channel", { configurable: true, writable: true, value: function (topic) {
      const ch = { topic, liaisons: [], on(type, filtre, cb) { ch.liaisons.push({ type, filtre, cb }); return ch; },
        subscribe() { return ch; }, unsubscribe: async () => "ok" };
      window.__canaux.push(ch);
      return ch;
    } });
    window.__canalDb = _creerCanalDb(true);
    window.__recevoir = (ligne) => {
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "comment_interactions" && x.filtre.event === "INSERT");
      if (!l) throw new Error("aucune liaison INSERT sur comment_interactions");
      l.cb({ schema: "public", table: "comment_interactions", eventType: "INSERT", commit_timestamp: ligne.created_at, errors: null, new: ligne, old: {} });
    };
    window.__ligne = (id, cid, fil, qui, charge, heure) => ({ id, comment_id: cid, post_id: fil, user_id: qui, kind: "pin", payload: charge, created_at: heure });
    window.__ouvrir = async (fil) => { window._cmtThreadLoadedAt = {}; await openComments(fil); };
    // L'état VU : la vérité du fil (celle du rendu), et ce que l'écran montre.
    window.__etat = (fil) => {
      const p = findPostAnywhere(fil);
      const boite = document.getElementById("commentsBox");
      const doms = boite ? Array.from(boite.querySelectorAll(".comment[data-commentid]")) : [];
      return {
        epingles: (p.comments || []).filter((c) => _estEpingle(fil, c)).map((c) => c.id).sort(),
        premier: doms.length ? doms[0].getAttribute("data-commentid") : null,
        badges: doms.filter((d) => d.querySelector(".cmt-pinned-badge")).map((d) => d.getAttribute("data-commentid")),
      };
    };
    window.__pins = () => __ecritures.filter((e) => e.kind === "pin").map((e) => [e.comment_id, e.payload]);
    window.__base = () => __interactions.filter((i) => i.kind === "pin").map((i) => [i.comment_id, i.payload]);
  }, { moi: MOI, alice: ALICE, zoe: ZOE, P, PA });
}

const etat = (page, fil) => page.evaluate((f) => __etat(f), fil);

test.describe("RV-38 — l'épingle d'un commentaire : verdict lu, refus dit, un état du fil, du seul propriétaire", () => {
  test("① le propriétaire épingle : contrat de la garde, cible d'abord, écran et toast ; retirer écrit « 0 »", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_2"]')).toHaveCount(1);

    await page.evaluate((p) => togglePinComment(p, "c_rv38_2"), P);
    const e1 = await page.evaluate(() => __ecritures.map((e) => ({ table: e.table, comment_id: e.comment_id, post_id: e.post_id, user_id: e.user_id, kind: e.kind, payload: e.payload })));
    expect(e1, "le contrat de la garde : mon compte, le FIL, « 1 »").toEqual([
      { table: "comment_interactions", comment_id: "c_rv38_2", post_id: P, user_id: MOI, kind: "pin", payload: "1" },
    ]);
    expect(await etat(page, P)).toEqual({ epingles: ["c_rv38_2"], premier: "c_rv38_2", badges: ["c_rv38_2"] });
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Commentaire épinglé");

    // Épingler l'autre : la CIBLE part d'abord, puis le « 0 » de l'ancien.
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect(await page.evaluate(() => __pins())).toEqual([["c_rv38_2", "1"], ["c_rv38_1", "1"], ["c_rv38_2", "0"]]);
    expect(await etat(page, P)).toEqual({ epingles: ["c_rv38_1"], premier: "c_rv38_1", badges: ["c_rv38_1"] });

    // Retirer.
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect((await page.evaluate(() => __pins())).slice(-1)).toEqual([["c_rv38_1", "0"]]);
    expect((await etat(page, P)).epingles).toEqual([]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Épingle retirée");

    // Et la base, relue au niveau du fil : ce que l'écran dit (aucun épinglé).
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles).toEqual([]);

    // La forme historique reste un booléen pour les autres appelants.
    expect(await page.evaluate((p) => supaCommentInteract("c_rv38_1", p, "like", ""))).toBe(true);
    await page.evaluate(() => { __verdictEcriture = () => ({ error: { code: "42501", message: "refus" } }); });
    expect(await page.evaluate((p) => supaCommentInteract("c_rv38_1", p, "like", ""))).toBe(false);
  });

  test("② refus 23514 (la base sans la migration) : l'épingle est défaite, l'ancien épinglé revient, et c'est dit", async ({ page }) => {
    await preparer(page);
    await page.evaluate(({ p, moi }) => { __interactions.push(__ligne("ci_srv_1", "c_rv38_1", p, moi, "1", "2026-11-05T08:30:00+00:00")); }, { p: P, moi: MOI });
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles, { message: "l'épingle du serveur est lue" }).toEqual(["c_rv38_1"]);

    await page.evaluate(() => {
      __verdictEcriture = () => ({ error: { code: "23514", message: 'new row for relation "comment_interactions" violates check constraint "ci_kind_check"', hint: null } });
    });
    await page.evaluate((p) => togglePinComment(p, "c_rv38_2"), P);
    expect(await page.evaluate(() => __pins()), "la cible seule a été tentée : aucun « 0 » pour l'ancien").toEqual([["c_rv38_2", "1"]]);
    expect(await etat(page, P), "l'écran revient à l'état d'avant").toEqual({ epingles: ["c_rv38_1"], premier: "c_rv38_1", badges: ["c_rv38_1"] });
    expect(await page.evaluate(() => __toasts.slice())).toEqual(["L'épingle n'est pas encore disponible : rien n'a été enregistré"]);
  });

  test("③ refus 42501 (la garde) et panne réseau : même retour, chacun son mot", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);

    await page.evaluate(() => {
      __verdictEcriture = () => ({ error: { code: "42501", message: 'new row violates row-level security policy for table "comment_interactions"',
        hint: "épingle : réservée au propriétaire du fil, sur un commentaire de ce fil" } });
    });
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect((await etat(page, P)).epingles).toEqual([]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Épingle refusée : ce commentaire ne peut pas être épinglé");

    // Une panne : le SDK rend une erreur SANS code, au message du navigateur.
    await page.evaluate(() => { __verdictEcriture = () => ({ error: { code: "", message: "TypeError: Failed to fetch", details: "", hint: "" } }); });
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect((await etat(page, P)).epingles).toEqual([]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Pas de connexion : l'épingle n'a pas été enregistrée");
    expect(await page.evaluate(() => __toasts.filter((t) => t === "Commentaire épinglé").length), "jamais « épinglé » sur un refus").toBe(0);
  });

  test("④ qui n'est pas le propriétaire, ou un commentaire pas encore envoyé : rien ne part, la raison est dite", async ({ page }) => {
    await preparer(page);
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_a1"]')).toHaveCount(1);
    await page.evaluate((pa) => togglePinComment(pa, "c_rv38_a1"), PA);
    expect(await page.evaluate(() => __ecritures.length)).toBe(0);
    expect((await etat(page, PA)).epingles).toEqual([]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Seul l'auteur du fil peut épingler un commentaire");

    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    await page.evaluate((p) => {
      const post = findPostAnywhere(p);
      post.comments.unshift({ id: "c_rv38_local", authorId: MY_UID, authorName: "Moi", text: "pas encore parti", content: "pas encore parti", createdAt: Date.now(), _pending: true });
      // L'optimiste d'un commentaire d'ACTIVITÉ ne porte pas `_pending` : son identifiant le dit.
      post.comments.unshift({ id: "ec_local_1730000000000", authorId: MY_UID, authorName: "Moi", text: "pas encore parti", content: "pas encore parti", createdAt: Date.now() });
    }, P);
    for (const id of ["c_rv38_local", "ec_local_1730000000000"]) {
      await page.evaluate(([p, c]) => togglePinComment(p, c), [P, id]);
      expect(await page.evaluate(() => __ecritures.length), id).toBe(0);
      expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Ce commentaire n'est pas encore envoyé : épingle-le dans un instant");
    }
  });

  test("⑤ la lecture (B voit l'épingle) se fait au niveau du FIL, du seul propriétaire — la dernière ligne décide", async ({ page }) => {
    await preparer(page);
    await page.evaluate(({ pa, alice, zoe }) => {
      __interactions.push(
        __ligne("ci_r1", "c_rv38_a1", pa, alice, "1", "2026-11-05T08:10:00+00:00"),          // Alice, propriétaire : A1
        __ligne("ci_r2", "c_rv38_a3", pa, zoe, "1", "2026-11-05T08:11:00+00:00"),            // Zoé FORGE une épingle sur A3
        __ligne("ci_r3", "c_rv38_a2", "post_ailleurs", alice, "1", "2026-11-05T08:12:00+00:00")); // Alice, mais dans un AUTRE fil
    }, { pa: PA, alice: ALICE, zoe: ZOE });
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect.poll(async () => await etat(page, PA), { message: "l'épingle d'Alice, seule, en tête" })
      .toEqual({ epingles: ["c_rv38_a1"], premier: "c_rv38_a1", badges: ["c_rv38_a1"] });
    // La lecture du fil ne DEMANDE que les lignes du propriétaire, dans ce fil.
    const demande = await page.evaluate((pa) => __lectures.filter((l) => l.table === "comment_interactions" && l.eqs.some(([c]) => c === "kind"))
      .map((l) => Object.fromEntries(l.eqs)).find((e) => e.post_id === pa), PA);
    expect(demande).toEqual({ post_id: PA, kind: "pin", user_id: ALICE });

    // Alice retire : un « 0 » plus récent sur A1 décide, à la réouverture.
    await page.evaluate(({ pa, alice }) => { __interactions.push(__ligne("ci_r4", "c_rv38_a1", pa, alice, "0", "2026-11-05T08:13:00+00:00")); }, { pa: PA, alice: ALICE });
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect.poll(async () => (await etat(page, PA)).epingles).toEqual([]);
    expect((await etat(page, PA)).badges).toEqual([]);
  });

  test("⑥ un seul épinglé par fil : deux appareils du propriétaire en ont posé deux, le plus récent l'emporte", async ({ page }) => {
    await preparer(page);
    await page.evaluate(({ pa, alice }) => {
      __interactions.push(
        __ligne("ci_d1", "c_rv38_a3", pa, alice, "1", "2026-11-05T08:20:00+00:00"),
        __ligne("ci_d2", "c_rv38_a1", pa, alice, "1", "2026-11-05T08:21:00+00:00"));   // l'autre appareil, sans « 0 » pour A3
    }, { pa: PA, alice: ALICE });
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect.poll(async () => await etat(page, PA)).toEqual({ epingles: ["c_rv38_a1"], premier: "c_rv38_a1", badges: ["c_rv38_a1"] });
  });

  test("⑦ une lecture en ÉCHEC après une page relue ne retire rien ; une lecture RÉUSSIE retire l'épingle restée locale d'avant RV-38", async ({ page }) => {
    await preparer(page);
    // L'état d'avant RV-38 : épinglé sur CET appareil seulement (drapeau persisté), rien en base.
    await page.evaluate((p) => {
      findPostAnywhere(p).comments = [
        { id: "c_rv38_1", authorId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c38", authorName: "Alice", text: "Premier, d'Alice", content: "Premier, d'Alice", createdAt: Date.parse("2026-11-05T08:01:00Z"), fromSupabase: true, pinned: true },
        { id: "c_rv38_2", authorId: "9f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e38", authorName: "Zoé", text: "Deuxième, de Zoé", content: "Deuxième, de Zoé", createdAt: Date.parse("2026-11-05T08:02:00Z"), fromSupabase: true },
      ];
    }, P);
    // La page serveur RECONSTRUIT les objets (sans drapeau), puis les lectures échouent.
    await page.evaluate(() => { __lectureEnErreur = true; });
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    expect(await page.evaluate((p) => findPostAnywhere(p).comments.find((c) => c.id === "c_rv38_1").pinned, P), "la page a bien reconstruit l'objet").toBeFalsy();
    expect(await etat(page, P), "une source illisible n'est pas une source calme").toEqual({ epingles: ["c_rv38_1"], premier: "c_rv38_1", badges: ["c_rv38_1"] });

    await page.evaluate(() => { __lectureEnErreur = false; });
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles, { message: "lue, et rien en base : l'épingle locale part" }).toEqual([]);
  });

  test("⑧ en direct : l'épingle du propriétaire s'applique (la mienne aussi), celle d'un autre compte non, « 0 » la retire", async ({ page }) => {
    await preparer(page);
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_a3"]')).toHaveCount(1);
    // Une épingle reçue repeint, et n'envoie rien dans `user_state` (contre-revue : P2-B, B1).
    await page.evaluate(() => {
      window.__sauvegardesRecues = 0;
      const vraiSave = window.saveState;
      window.saveState = function () {
        if (/_epingleRecue/.test(new Error().stack || "")) window.__sauvegardesRecues++;
        return vraiSave.apply(this, arguments);
      };
    });

    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t1", "c_rv38_a1", pa, alice, "1", "2026-11-05T09:30:00.123456+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => await etat(page, PA)).toEqual({ epingles: ["c_rv38_a1"], premier: "c_rv38_a1", badges: ["c_rv38_a1"] });

    await page.evaluate(({ pa, zoe }) => __recevoir(__ligne("ci_t2", "c_rv38_a3", pa, zoe, "1", "2026-11-05T09:31:00+00:00")), { pa: PA, zoe: ZOE });
    await page.evaluate(({ alice }) => __recevoir(__ligne("ci_t3", "c_rv38_a2", "post_ailleurs", alice, "1", "2026-11-05T09:31:30+00:00")), { alice: ALICE });
    expect((await etat(page, PA)).epingles, "ni la ligne forgée de Zoé, ni celle d'un autre fil").toEqual(["c_rv38_a1"]);

    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t4", "c_rv38_a3", pa, alice, "1", "2026-11-05T09:32:00+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => await etat(page, PA), { message: "un seul épinglé : A3 remplace A1" })
      .toEqual({ epingles: ["c_rv38_a3"], premier: "c_rv38_a3", badges: ["c_rv38_a3"] });
    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t5", "c_rv38_a1", pa, alice, "0", "2026-11-05T09:32:30+00:00")), { pa: PA, alice: ALICE });
    expect((await etat(page, PA)).epingles, "un « 0 » pour un autre commentaire ne retire rien").toEqual(["c_rv38_a3"]);
    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t6", "c_rv38_a3", pa, alice, "0", "2026-11-05T09:33:00+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => (await etat(page, PA)).epingles).toEqual([]);

    // La MIENNE, venue d'un autre de mes appareils, dans MON fil.
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_2"]')).toHaveCount(1);
    await page.evaluate(({ p, moi }) => __recevoir(__ligne("ci_t7", "c_rv38_2", p, moi, "1", "2026-11-05T09:34:00+00:00")), { p: P, moi: MOI });
    await expect.poll(async () => await etat(page, P)).toEqual({ epingles: ["c_rv38_2"], premier: "c_rv38_2", badges: ["c_rv38_2"] });
    expect(await page.evaluate(() => window.__sauvegardesRecues), "aucune sauvegarde pour une épingle reçue").toBe(0);
  });

  test("⑨ une lecture partie AVANT ou PENDANT une épingle ne l'efface pas en revenant", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    // AVANT : l'instantané est pris à la requête, SANS l'épingle.
    const avant = await page.evaluate(async (p) => {
      __delaiLecture = 400;
      const lecture = hydrateCommentInteractions(findPostAnywhere(p));
      await new Promise((r) => setTimeout(r, 50));
      __delaiLecture = 0;
      await togglePinComment(p, "c_rv38_1");
      await lecture;
      return __etat(p).epingles;
    }, P);
    expect(avant, "la réponse périmée ne défait pas l'épingle posée pendant la lecture").toEqual(["c_rv38_1"]);
    // PENDANT : l'écriture est en vol quand la lecture part ; la lecture revient après elle.
    const pendant = await page.evaluate(async (p) => {
      __delaiEcriture = 300;
      const geste = togglePinComment(p, "c_rv38_2");
      await new Promise((r) => setTimeout(r, 50));
      __delaiLecture = 600;
      const lecture = hydrateCommentInteractions(findPostAnywhere(p));
      await geste;
      const apresGeste = __etat(p).epingles;
      await lecture;
      __delaiLecture = 0; __delaiEcriture = 0;
      return { apresGeste, apresLecture: __etat(p).epingles, base: __base() };
    }, P);
    expect(pendant.base.slice(-2)).toEqual([["c_rv38_2", "1"], ["c_rv38_1", "0"]]);
    expect(pendant, "la lecture partie pendant l'écriture ne défait pas l'épingle confirmée").toMatchObject({ apresGeste: ["c_rv38_2"], apresLecture: ["c_rv38_2"] });
    // La lecture suivante, elle, voit les lignes écrites.
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles).toEqual(["c_rv38_2"]);
  });

  test("⑩ retirer l'épinglé ne fait reparaître aucun « 1 » plus ancien — même quand le « 0 » de l'ancien s'est perdu", async ({ page }) => {
    await preparer(page);
    // Deux « 1 » en base (deux appareils), l'écran montre le plus récent ; je le retire.
    await page.evaluate(({ p, moi }) => {
      __interactions.push(__ligne("ci_x1", "c_rv38_2", p, moi, "1", "2026-11-05T08:20:00+00:00"),
        __ligne("ci_x2", "c_rv38_1", p, moi, "1", "2026-11-05T08:21:00+00:00"));
    }, { p: P, moi: MOI });
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles).toEqual(["c_rv38_1"]);
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect(await page.evaluate(() => __pins())).toEqual([["c_rv38_1", "0"]]);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => await etat(page, P), { message: "relu : rien d'épinglé, chez tous" }).toEqual({ epingles: [], premier: "c_rv38_2", badges: [] });

    // Le « 0 » de l'ancien se perd (réseau) quand j'en épingle un autre ; puis je retire.
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    await page.evaluate(() => { __verdictEcriture = (l) => (l.comment_id === "c_rv38_1" && l.payload === "0") ? { error: { code: "", message: "TypeError: Failed to fetch" } } : null; });
    await page.evaluate((p) => togglePinComment(p, "c_rv38_2"), P);
    expect(await page.evaluate(() => __toasts.slice(-1)[0]), "la cible est passée").toBe("Commentaire épinglé");
    await page.evaluate(() => { __verdictEcriture = null; });
    await page.evaluate((p) => togglePinComment(p, "c_rv38_2"), P);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => (await etat(page, P)).epingles, { message: "le « 1 » de l'ancien, sans son « 0 », ne revient pas" }).toEqual([]);
  });

  test("⑪ une page relue PENDANT l'écriture : l'épingle confirmée reste à l'écran", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    const fin = await page.evaluate(async (p) => {
      __delaiEcriture = 500;
      __delaiCommentaires = 200;
      window._cmtThreadLoadedAt = {};
      const ouverture = openComments(p);
      await new Promise((r) => setTimeout(r, 20));
      const geste = togglePinComment(p, "c_rv38_1");
      await ouverture;
      await geste;
      await new Promise((r) => setTimeout(r, 150));
      return { toasts: __toasts.slice(), base: __base() };
    }, P);
    expect(fin.base).toEqual([["c_rv38_1", "1"]]);
    expect(fin.toasts).toContain("Commentaire épinglé");
    await expect.poll(async () => await etat(page, P), { message: "la page relue n'a pas emporté l'épingle" })
      .toEqual({ epingles: ["c_rv38_1"], premier: "c_rv38_1", badges: ["c_rv38_1"] });
  });

  test("⑫ l'épinglé plus ancien que la première page est lu par son identifiant et montré en tête, chez tous", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async ({ p, moi, alice }) => {
      // 35 commentaires sur MA publication ; la première page en porte 30, les plus récents.
      const base = Date.parse("2026-11-05T07:00:00Z");
      __commentaires = [];
      for (let i = 0; i < 35; i++) __commentaires.push({ id: "c_p" + String(i).padStart(2, "0"), post_id: p, author_id: alice, content: "n°" + i, created_at: new Date(base + i * 60000).toISOString().replace("Z", "") });
      // Le propriétaire (moi) a épinglé le plus ANCIEN.
      __interactions.push(__ligne("ci_old", "c_p00", p, moi, "1", "2026-11-05T08:40:00+00:00"));
      await __ouvrir(p);
    }, { p: P, moi: MOI, alice: ALICE });
    // La chaîne de l'épingle suit l'hydratation sans la retarder (contre-revue du delta, P3-A).
    const charge = (p) => page.evaluate((f) => {
      const post = findPostAnywhere(f);
      return { charges: post.comments.length, n00: post.comments.filter((c) => c.id === "c_p00").length,
        lu: __lectures.filter((l) => l.table === "post_comments" && l.eqs.some(([c, v]) => c === "id" && v === "c_p00")).length };
    }, p);
    await expect.poll(() => charge(P), { message: "les 30 de la page, plus l'épinglé lu par son identifiant" }).toEqual({ charges: 31, n00: 1, lu: 1 });
    await expect.poll(async () => await etat(page, P)).toEqual({ epingles: ["c_p00"], premier: "c_p00", badges: ["c_p00"] });
    // « Précédents » : la suite arrive, l'épinglé n'est pas redoublé.
    await page.evaluate((p) => _chargerCommentairesPrecedents(p), P);
    const apres = await page.evaluate((p) => {
      const post = findPostAnywhere(p);
      return { charges: post.comments.length, n00: post.comments.filter((c) => c.id === "c_p00").length };
    }, P);
    expect(apres).toEqual({ charges: 35, n00: 1 });
    expect((await etat(page, P)).premier).toBe("c_p00");
    // Apporté par « précédents », il est chargé comme les autres : retirer l'épingle ne
    // l'enlève pas de la liste (seul l'épinglé lu À PART la quitte avec l'épingle).
    await page.evaluate((p) => togglePinComment(p, "c_p00"), P);
    expect(await page.evaluate((p) => findPostAnywhere(p).comments.filter((c) => c.id === "c_p00").length, P),
      "toujours dans la liste après le retrait de l'épingle").toBe(1);
  });

  test("⑫ bis l'épinglé lu à part est GARDÉ par la page relue, sans quitter l'écran, et se REVÉRIFIE : supprimé en base, il part", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async ({ p, moi, alice }) => {
      const base = Date.parse("2026-11-05T07:00:00Z");
      __commentaires = [];
      for (let i = 0; i < 35; i++) __commentaires.push({ id: "c_p" + String(i).padStart(2, "0"), post_id: p, author_id: alice, content: "n°" + i, created_at: new Date(base + i * 60000).toISOString().replace("Z", "") });
      __interactions.push(__ligne("ci_old", "c_p00", p, moi, "1", "2026-11-05T08:40:00+00:00"));
      // L'épinglé chargé à part n'envoie rien dans `user_state` (P2-B) : compté dès la première ouverture.
      window.__sauvegardesChargement = 0;
      const vraiSave = window.saveState;
      window.saveState = function () {
        if (/_assurerCommentaireEpingle/.test(new Error().stack || "")) window.__sauvegardesChargement++;
        return vraiSave.apply(this, arguments);
      };
      await __ouvrir(p);
    }, { p: P, moi: MOI, alice: ALICE });
    const parId = () => page.evaluate(() => __lectures.filter((l) => l.table === "post_comments" && l.eqs.some(([c, v]) => c === "id" && v === "c_p00")).length);
    await expect.poll(parId).toBe(1);
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_p00");
    // Les 30 de la page restent affichés : l'épinglé lu à part n'en prend pas une place (P4).
    expect(await page.evaluate(() => ({
      montres: document.querySelectorAll("#commentsBox .comment[data-commentid]").length,
      voirPlus: Array.from(document.querySelectorAll("#commentsBox button")).some((b) => /Voir \d+ commentaires de plus/.test(b.textContent)),
    }))).toEqual({ montres: 31, voirPlus: false });
    // Réouvertures (la page est relue) : il reste en tête à CHAQUE rendu, et sa présence en base
    // se revérifie une fois par page relue ; rien ne part dans `user_state` (P2-B).
    const r = await page.evaluate(async (p) => {
      const premiers = [];
      const obs = new MutationObserver(() => {
        const el = document.querySelector("#commentsBox .comment[data-commentid]");
        if (el) premiers.push(el.getAttribute("data-commentid"));
      });
      obs.observe(document.getElementById("modalContent"), { childList: true, subtree: true });
      for (let i = 0; i < 2; i++) {
        closeModal();
        window._cmtThreadLoadedAt = {};
        await openComments(p);
        await new Promise((res) => setTimeout(res, 150));
      }
      obs.disconnect();
      return { autres: premiers.filter((x) => x !== "c_p00"), sauvegardes: window.__sauvegardesChargement };
    }, P);
    expect(r.autres, "l'épinglé n'a jamais quitté la tête de la liste").toEqual([]);
    expect(r.sauvegardes, "aucune sauvegarde pour l'épinglé chargé à part").toBe(0);
    await expect.poll(parId, { message: "une vérification par page relue" }).toBe(3);

    // Son auteur le SUPPRIME ; la ligne d'épingle reste (un homonyme : la purge R31 ne la prend pas).
    await page.evaluate((p) => {
      __commentaires = __commentaires.filter((c) => c.id !== "c_p00");
      closeModal();
      window._cmtThreadLoadedAt = {};
      return openComments(p);
    }, P);
    await expect.poll(async () => page.evaluate((p) => findPostAnywhere(p).comments.some((c) => c.id === "c_p00"), P),
      { message: "absent en base : la copie gardée part" }).toBe(false);
    expect((await etat(page, P)).badges).toEqual([]);
  });

  test("⑫ ter l'épinglé lu à part quitte la liste quand l'épingle le QUITTE (retiré, ou purgé avec son commentaire)", async ({ page }) => {
    await preparer(page);
    await page.evaluate(async ({ p, moi, alice }) => {
      const base = Date.parse("2026-11-05T07:00:00Z");
      __commentaires = [];
      for (let i = 0; i < 35; i++) __commentaires.push({ id: "c_p" + String(i).padStart(2, "0"), post_id: p, author_id: alice, content: "n°" + i, created_at: new Date(base + i * 60000).toISOString().replace("Z", "") });
      __interactions.push(__ligne("ci_old", "c_p00", p, moi, "1", "2026-11-05T08:40:00+00:00"));
      await __ouvrir(p);
    }, { p: P, moi: MOI, alice: ALICE });
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_p00");
    // La purge R31 : le commentaire supprimé emporte sa ligne d'épingle. À la réouverture, plus d'épingle.
    await page.evaluate((p) => {
      __commentaires = __commentaires.filter((c) => c.id !== "c_p00");
      __interactions = __interactions.filter((i) => i.id !== "ci_old");
      closeModal();
      window._cmtThreadLoadedAt = {};
      return openComments(p);
    }, P);
    await expect.poll(async () => page.evaluate((p) => findPostAnywhere(p).comments.some((c) => c.id === "c_p00"), P),
      { message: "l'épingle l'a quitté : la copie gardée part" }).toBe(false);
  });

  test("⑮ ouvrir une discussion : l'épingle s'applique APRÈS les « j'aime » et ne les fait pas attendre ; rien ne change → ni repeinte ni sauvegarde", async ({ page }) => {
    await preparer(page);
    // Deux « j'aime » sur C1, aucune épingle en base.
    await page.evaluate(({ p, zoe, alice }) => {
      __interactions.push({ id: "ci_l1", comment_id: "c_rv38_1", post_id: p, user_id: zoe, kind: "like", payload: null, created_at: "2026-11-05T08:30:00+00:00" },
        { id: "ci_l2", comment_id: "c_rv38_1", post_id: p, user_id: alice, kind: "like", payload: null, created_at: "2026-11-05T08:31:00+00:00" });
    }, { p: P, zoe: ZOE, alice: ALICE });
    await page.evaluate((p) => __ouvrir(p), P);
    await expect.poll(async () => page.evaluate((p) => findPostAnywhere(p).comments.find((c) => c.id === "c_rv38_1").likes, P)).toBe(2);
    // Réouverture : la page reconstruit les objets SANS leurs « j'aime » ; les interactions
    // arrivent 400 ms après la lecture de l'épingle. Chaque rendu de la boîte est relevé.
    const r = await page.evaluate(async (p) => {
      __delaiInteractions = 400;   // la lecture de l'épingle (sans délai) revient AVANT les « j'aime »
      const vus = [];
      const releve = () => {
        const el = document.querySelector('#commentsBox [data-cmtlike="c_rv38_1"]');
        if (el) vus.push(el.textContent.trim());
      };
      const obs = new MutationObserver(releve);
      obs.observe(document.getElementById("modalContent"), { childList: true, subtree: true, characterData: true });
      // Seules comptent les sauvegardes du chemin de l'épingle (l'application en fait d'autres, en fond).
      let sauvegardes = 0;
      const vraiSave = window.saveState;
      window.saveState = function () {
        if (/_lireEpingleFil|_sauverEtRepeindreFil|_epingleRecue|_assurerCommentaireEpingle/.test(new Error().stack || "")) sauvegardes++;
        return vraiSave.apply(this, arguments);
      };
      closeModal();
      window._cmtThreadLoadedAt = {};
      await openComments(p);
      await new Promise((res) => setTimeout(res, 300));
      obs.disconnect();
      window.saveState = vraiSave;
      __delaiInteractions = 0;
      return { vus, sauvegardes };
    }, P);
    expect(r.vus.length, "la boîte a bien été rendue").toBeGreaterThan(0);
    expect(r.vus.filter((v) => !/ 2$/.test(v)), "jamais un rendu sans ses « j'aime » après la page relue").toEqual([]);
    expect(r.sauvegardes, "aucune épingle n'a changé : aucune sauvegarde").toBe(0);

    // L'épingle CHANGE à la réouverture (mon autre appareil a épinglé C2) : sa lecture revient
    // avant les « j'aime », et ne repeint qu'APRÈS eux.
    const change = await page.evaluate(async ({ p, moi }) => {
      __interactions.push(__ligne("ci_c2", "c_rv38_2", p, moi, "1", "2026-11-05T08:45:00+00:00"));
      __delaiInteractions = 400;
      const vus = [];
      const obs = new MutationObserver(() => {
        const el = document.querySelector('#commentsBox [data-cmtlike="c_rv38_1"]');
        if (el) vus.push(el.textContent.trim());
      });
      obs.observe(document.getElementById("modalContent"), { childList: true, subtree: true, characterData: true });
      closeModal();
      window._cmtThreadLoadedAt = {};
      await openComments(p);
      await new Promise((res) => setTimeout(res, 300));
      obs.disconnect();
      __delaiInteractions = 0;
      return { vus, epingles: __etat(p).epingles };
    }, { p: P, moi: MOI });
    expect(change.epingles).toEqual(["c_rv38_2"]);
    expect(change.vus.filter((v) => !/ 2$/.test(v)), "l'épingle lue ne repeint pas avant les « j'aime »").toEqual([]);

    // L'hydratation n'attend pas une lecture d'épingle qui traîne.
    const lent = await page.evaluate(async (p) => {
      __delaiEpingle = 3000;
      closeModal();
      window._cmtThreadLoadedAt = {};
      const t0 = performance.now();
      await openComments(p);
      const duree = performance.now() - t0;
      __delaiEpingle = 0;
      return duree;
    }, P);
    expect(lent, "l'ouverture ne dure pas les 3 s de la lecture de l'épingle").toBeLessThan(2000);
  });

  test("⑯ une modale FERMÉE n'est plus à l'écran : ni l'épinglé reçu en direct, ni un retrait n'y lisent quoi que ce soit", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    await page.evaluate(() => closeModal());
    const avant = await page.evaluate(() => __lectures.length);
    // Un épinglé que la page ne porte pas, reçu en direct, puis le retrait d'une ligne indexée.
    await page.evaluate(({ p, moi }) => {
      __recevoir(__ligne("ci_f1", "c_rv38_hors_page", p, moi, "1", "2026-11-05T09:50:00+00:00"));
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "comment_interactions" && x.filtre.event === "DELETE");
      l.cb({ schema: "public", table: "comment_interactions", eventType: "DELETE", commit_timestamp: "2026-11-05T10:00:00Z", errors: null, new: {}, old: { id: "ci_f1" } });
    }, { p: P, moi: MOI });
    await page.waitForTimeout(300);
    // Les deux lectures en jeu : l'épinglé par son identifiant, la relecture de l'épingle du fil.
    expect(await page.evaluate((n) => __lectures.slice(n)
      .filter((l) => (l.table === "post_comments" && l.eqs.some(([c]) => c === "id")) || (l.table === "comment_interactions" && l.eqs.some(([c]) => c === "kind")))
      .map((l) => l.table + " " + JSON.stringify(l.eqs)), avant), "aucune lecture pour une discussion fermée").toEqual([]);
  });

  test("⑰ une épingle du propriétaire reçue PENDANT mon écriture (son autre appareil) n'est pas réécrasée : la base tranche", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_2"]')).toHaveCount(1);
    await page.evaluate(async ({ p, moi }) => {
      __delaiEcriture = 300;
      const geste = togglePinComment(p, "c_rv38_1");
      await new Promise((r) => setTimeout(r, 50));
      // Mon autre appareil épingle C2 : sa ligne arrive en direct, et elle est plus RÉCENTE en base.
      const l = __ligne("ci_autre", "c_rv38_2", p, moi, "1", "2026-11-05T23:00:00+00:00");
      __interactions.push(l);
      __recevoir(l);
      await geste;
      __delaiEcriture = 0;
    }, { p: P, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).epingles, { message: "relu : le plus récent en base, celui de l'autre appareil" }).toEqual(["c_rv38_2"]);
    // L'ÉCHO de ma propre écriture, arrivé pendant le geste, n'est pas un autre appareil :
    // aucune relecture (contre-vérification de 84cb6b3, D2).
    await page.waitForTimeout(200);
    const relues = await page.evaluate(async ({ p, moi }) => {
      const avant = __lectures.length;
      __delaiEcriture = 300;
      const geste = togglePinComment(p, "c_rv38_1");   // C2 → C1 : « 1 » pour C1, puis « 0 » pour C2
      await new Promise((r) => setTimeout(r, 50));
      __recevoir(__ligne("ci_echo", "c_rv38_1", p, moi, "1", "2026-11-05T23:30:00+00:00"));
      await geste;
      __delaiEcriture = 0;
      await new Promise((r) => setTimeout(r, 200));
      return __lectures.slice(avant).filter((x) => x.table === "comment_interactions" && x.eqs.some(([c]) => c === "kind")).length;
    }, { p: P, moi: MOI });
    expect(relues, "l'écho de ma propre écriture ne coûte aucune relecture").toBe(0);
    expect((await etat(page, P)).epingles).toEqual(["c_rv38_1"]);
  });

  test("⑱ un fil d'EXEMPLE (auteur sans compte) ne lit aucune épingle ; le panneau d'une bobine non plus — sa page détail, si", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      const ex = { id: "p_rv38_exemple", authorId: "u_lea", _source: "seed", comments: [{ id: "c_ex1", authorId: "u_lea", text: "x", content: "x", createdAt: Date.now() }] };
      state.seed.posts = (state.seed.posts || []).concat([ex]);
      if (!findPostAnywhere(ex.id)) throw new Error("l'exemple doit être trouvé, sinon le cas ne prouve rien");
      await hydrateCommentInteractions(ex);
      await new Promise((res) => setTimeout(res, 100));
      return __lectures.filter((l) => l.table === "comment_interactions" && l.eqs.some(([c]) => c === "kind")).length;
    });
    expect(r, "aucune lecture d'épingle pour un exemple").toBe(0);
    const bobine = await page.evaluate(async ({ pa }) => {
      const post = findPostAnywhere(pa);
      post.isReel = true;
      post.comments = [{ id: "c_rv38_a1", authorId: "x", text: "a", content: "a", createdAt: Date.now(), fromSupabase: true }];
      const lues = () => __lectures.filter((l) => l.table === "comment_interactions" && l.eqs.some(([c, v]) => c === "post_id" && v === pa) && l.eqs.some(([c]) => c === "kind")).length;
      await hydrateCommentInteractions(post, { epingle: false });   // le panneau de la bobine
      await new Promise((res) => setTimeout(res, 100));
      const panneau = lues();
      await hydrateCommentInteractions(post);                       // sa page détail
      await new Promise((res) => setTimeout(res, 100));
      return { panneau, detail: lues() };
    }, { pa: PA });
    expect(bobine).toEqual({ panneau: 0, detail: 1 });
  });

  test("⑲ une activité rechargée par le temps réel (un commentaire reçu) ne relit pas une épingle CONNUE ; inconnue, elle la relit", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async ({ alice, zoe }) => {
      const fiche = document.getElementById("eventDetailPage");
      if (!fiche) throw new Error("fiche d'activité absente du DOM");
      fiche.innerHTML = '<div id="eventCommentsList"></div>';
      fiche.style.display = "block";
      window._eventCommentsCache = window._eventCommentsCache || {};
      window.supaLoadEventComments = async () => [{ id: "ec_rv38_d1", authorId: zoe, author: "Zoé", text: "d1", at: Date.now() - 500 }];
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "event_comments" && x.filtre.event === "INSERT");
      if (!l) throw new Error("aucune liaison INSERT sur event_comments");
      const lues = (e, depuis) => __lectures.slice(depuis).filter((x) => x.table === "comment_interactions"
        && x.eqs.some(([c, v]) => c === "post_id" && v === e) && x.eqs.some(([c]) => c === "kind")).length;
      const recevoir = async (e) => {
        const avant = __lectures.length;
        l.cb({ schema: "public", table: "event_comments", eventType: "INSERT", new: { id: "ec_rv38_x_" + e, event_id: e, author_id: zoe, text: "x", created_at: "2026-11-05T10:00:00+00:00" }, old: {} });
        await new Promise((res) => setTimeout(res, 400));
        return lues(e, avant);
      };
      const out = {};
      for (const e of ["ev_rv38_connue", "ev_rv38_inconnue"]) {
        state.seed.events = (state.seed.events || []).concat([{ id: e, title: "Activité d'Alice", date: Date.now() + 86400000, organizerId: alice, authorId: alice }]);
        window._eventCommentsCache[e] = [{ id: "ec_rv38_d1", authorId: zoe, authorName: "Zoé", text: "d1", content: "d1", createdAt: Date.now() - 500, replies: [], likes: 0, likedBy: [] }];
      }
      // CONNUE : la fiche a été ouverte, sa lecture a eu lieu.
      window._openEventDetailId = "ev_rv38_connue";
      const avantOuverture = __lectures.length;
      await _loadEventComments("ev_rv38_connue");
      await new Promise((res) => setTimeout(res, 200));
      out.ouverture = lues("ev_rv38_connue", avantOuverture);
      out.connue = await recevoir("ev_rv38_connue");
      // INCONNUE : aucune lecture n'a abouti pour cette fiche.
      window._openEventDetailId = "ev_rv38_inconnue";
      out.inconnue = await recevoir("ev_rv38_inconnue");
      return out;
    }, { alice: ALICE, zoe: ZOE });
    expect(r, "l'ouverture lit ; le direct ne relit qu'une épingle inconnue").toEqual({ ouverture: 1, connue: 0, inconnue: 1 });
  });

  test("⑬ un fil HOMONYME — une publication et une activité sous le même identifiant — n'a pas de propriétaire : aucune épingle lue, reçue ni posée", async ({ page }) => {
    await preparer(page);
    const E = "ev_rv38_alice";
    // La red team (P2) : Alice organise l'activité E ; Zoé PUBLIE sous l'identifiant E
    // (rien ne l'interdit), y épingle son commentaire w1, puis commente l'activité
    // d'Alice sous ce même identifiant. Le visiteur a la publication de Zoé dans son fil.
    await page.evaluate(({ e, alice, zoe }) => {
      state.seed.events = (state.seed.events || []).concat([{ id: e, title: "L'activité d'Alice", date: Date.now() + 86400000, organizerId: alice, authorId: alice }]);
      state.supabasePosts.push({ id: e, authorId: zoe, authorName: "Zoé", authorEmoji: "🎸", passion: "musique", mood: "all",
        text: "Homonyme", content: "Homonyme", createdAt: Date.now() - 1000, likes: 0, liked: false, comments: [], reactions: [], fromSupabase: true });
      window._eventCommentsCache = window._eventCommentsCache || {};
      window._eventCommentsCache[e] = [{ id: "ec_rv38_w1", authorId: zoe, authorName: "Zoé", text: "w1", content: "w1", createdAt: Date.now() - 500, replies: [], likes: 0, likedBy: [] }];
      __interactions.push(__ligne("ci_h1", "ec_rv38_w1", e, zoe, "1", "2026-11-05T08:30:00+00:00"));
    }, { e: E, alice: ALICE, zoe: ZOE });
    // L'ouverture de la discussion de l'activité (`_loadEventComments` → hydrate) : AUCUNE
    // lecture d'épingle — avant le correctif, Zoé passait pour la propriétaire.
    await page.evaluate((e) => hydrateCommentInteractions({ id: e, comments: window._eventCommentsCache[e] }), E);
    const lues = await page.evaluate((e) => __lectures.filter((l) => l.table === "comment_interactions"
      && l.eqs.some(([c, v]) => c === "post_id" && v === e) && l.eqs.some(([c]) => c === "kind")).length, E);
    expect(lues, "aucune épingle lue dans un fil homonyme").toBe(0);
    expect(await page.evaluate((e) => _estEpingle(e, { id: "ec_rv38_w1" }), E)).toBe(false);
    // … ni reçue en direct.
    await page.evaluate(({ e, zoe }) => __recevoir(__ligne("ci_h2", "ec_rv38_w1", e, zoe, "1", "2026-11-05T09:40:00+00:00")), { e: E, zoe: ZOE });
    expect(await page.evaluate((e) => _estEpingle(e, { id: "ec_rv38_w1" }), E), "ni reçue en direct").toBe(false);

    // … ni posée : MA publication P, puis une activité d'Alice sous l'identifiant P.
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    const proposee = async () => page.evaluate((p) => {
      openCommentOptions(p, "c_rv38_1", 0);
      const rangs = Array.from(document.querySelectorAll("#cmtSheet .cmt-sheet-row")).map((b) => b.textContent);
      _closeCmtSheet();
      return rangs.some((t) => /pingl/i.test(t));
    }, P);
    expect(await proposee(), "fil sans homonyme : l'épingle est proposée au propriétaire").toBe(true);
    await page.evaluate(({ p, alice }) => {
      state.seed.events.push({ id: p, title: "Homonyme de ma publication", date: Date.now() + 86400000, organizerId: alice, authorId: alice });
    }, { p: P, alice: ALICE });
    expect(await proposee(), "fil homonyme : plus d'épingle proposée").toBe(false);
    await page.evaluate((p) => togglePinComment(p, "c_rv38_1"), P);
    expect(await page.evaluate(() => __ecritures.length), "rien ne part").toBe(0);
    expect((await etat(page, P)).epingles).toEqual([]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Épingle indisponible sur ce fil");

    // Un fil épinglé, lu, qui DEVIENT homonyme : à la réouverture, ce qu'on en savait ne vaut plus.
    await page.evaluate(({ pa, alice }) => { __interactions.push(__ligne("ci_h3", "c_rv38_a1", pa, alice, "1", "2026-11-05T08:50:00+00:00")); }, { pa: PA, alice: ALICE });
    await page.evaluate((pa) => { closeModal(); return __ouvrir(pa); }, PA);
    await expect.poll(async () => (await etat(page, PA)).badges).toEqual(["c_rv38_a1"]);
    await page.evaluate(({ pa, zoe }) => {
      state.seed.events.push({ id: pa, title: "Homonyme de la publication d'Alice", date: Date.now() + 86400000, organizerId: zoe, authorId: zoe });
    }, { pa: PA, zoe: ZOE });
    await page.evaluate((pa) => { closeModal(); return __ouvrir(pa); }, PA);
    await expect.poll(async () => { const e = await etat(page, PA); return [e.epingles, e.badges]; },
      { message: "devenu homonyme : plus d'épingle" }).toEqual([[], []]);
  });

  test("⑭ une ligne d'épingle RETIRÉE en direct (une purge, le retour arrière) : la vérité du fil se relit", async ({ page }) => {
    await preparer(page);
    await page.evaluate(({ pa, alice }) => { __interactions.push(__ligne("ci_x1", "c_rv38_a1", pa, alice, "1", "2026-11-05T08:40:00+00:00")); }, { pa: PA, alice: ALICE });
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect.poll(async () => (await etat(page, PA)).badges).toEqual(["c_rv38_a1"]);
    // Le serveur purge la ligne ; le temps réel n'en livre que la clé primaire (R37).
    await page.evaluate(() => {
      window.__interactions = window.__interactions.filter((i) => i.id !== "ci_x1");
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "comment_interactions" && x.filtre.event === "DELETE");
      if (!l) throw new Error("aucune liaison DELETE sur comment_interactions");
      l.cb({ schema: "public", table: "comment_interactions", eventType: "DELETE", commit_timestamp: "2026-11-05T10:00:00Z", errors: null, new: {}, old: { id: "ci_x1" } });
    });
    await expect.poll(async () => { const e = await etat(page, PA); return [e.epingles, e.badges]; },
      { message: "relue : plus rien d'épinglé" }).toEqual([[], []]);
  });

  test("⑭ bis une RAFALE de retraits (une purge) ne coûte qu'UNE relecture", async ({ page }) => {
    await preparer(page);
    await page.evaluate(({ pa, alice }) => {
      for (let i = 0; i < 6; i++) __interactions.push(__ligne("ci_b" + i, i % 2 ? "c_rv38_a1" : "c_rv38_a3", pa, alice, "1", "2026-11-05T08:4" + i + ":00+00:00"));
    }, { pa: PA, alice: ALICE });
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect.poll(async () => (await etat(page, PA)).badges).toEqual(["c_rv38_a1"]);
    const lues = await page.evaluate(async (pa) => {
      const avant = __lectures.length;
      window.__interactions = window.__interactions.filter((i) => !/^ci_b/.test(i.id));
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "comment_interactions" && x.filtre.event === "DELETE");
      for (let i = 0; i < 6; i++) l.cb({ schema: "public", table: "comment_interactions", eventType: "DELETE", commit_timestamp: "2026-11-05T10:00:00Z", errors: null, new: {}, old: { id: "ci_b" + i } });
      await new Promise((res) => setTimeout(res, 800));
      return __lectures.slice(avant).filter((x) => x.table === "comment_interactions" && x.eqs.some(([c, v]) => c === "post_id" && v === pa) && x.eqs.some(([c]) => c === "kind")).length;
    }, PA);
    expect(lues, "six retraits, une relecture").toBe(1);
    expect((await etat(page, PA)).badges).toEqual([]);
  });

  // ── Contre-vérification de d38d2fb (audit-passio) : P3-a, P3-b, P4-a, P4-b, P4-c ──
  const fil35 = async (page, n) => page.evaluate(async ({ p, moi, alice, n }) => {
    const base = Date.parse("2026-11-05T07:00:00Z");
    __commentaires = [];
    for (let i = 0; i < n; i++) __commentaires.push({ id: "c_p" + String(i).padStart(2, "0"), post_id: p, author_id: alice, content: "n°" + i, created_at: new Date(base + i * 60000).toISOString().replace("Z", "") });
    __interactions.push(__ligne("ci_old", "c_p00", p, moi, "1", "2026-11-05T08:40:00+00:00"));
    await __ouvrir(p);
  }, { p: P, moi: MOI, alice: ALICE, n });
  const dansLaListe = (page, id) => page.evaluate(([p, c]) => findPostAnywhere(p).comments.filter((x) => x.id === c).length, [P, id]);
  const lusParId = (page, id) => page.evaluate((c) => __lectures.filter((l) => l.table === "post_comments" && l.eqs.some(([k, v]) => k === "id" && v === c)).length, id);

  test("⑳ un commentaire RÉCENT épinglé (manqué par le direct : écrit de mon autre appareil) ne quitte pas la liste quand l'épingle le quitte", async ({ page }) => {
    await preparer(page);
    await fil35(page, 35);
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_p00");
    // Un commentaire PLUS RÉCENT que la page, que le direct n'a pas apporté ; mon autre appareil l'épingle…
    await page.evaluate(({ p, alice, moi }) => {
      __commentaires.push({ id: "c_recent", post_id: p, author_id: alice, content: "récent", created_at: "2026-11-05T09:30:00" });
      __recevoir(__ligne("ci_r1", "c_recent", p, moi, "1", "2026-11-05T09:31:00+00:00"));
    }, { p: P, alice: ALICE, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).premier, { message: "lu par son identifiant, montré en tête" }).toBe("c_recent");
    // … puis le retire : le commentaire reste, à sa place (il est dans la fenêtre des pages).
    await page.evaluate(({ p, moi }) => __recevoir(__ligne("ci_r2", "c_recent", p, moi, "0", "2026-11-05T09:32:00+00:00")), { p: P, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).epingles).toEqual([]);
    expect(await dansLaListe(page, "c_recent"), "toujours dans la liste").toBe(1);
    // Le même, mais son INSERT arrive en direct APRÈS l'épingle : pas de doublon, et il reste au retrait.
    await page.evaluate(({ p, alice, moi }) => {
      __commentaires.push({ id: "c_recent2", post_id: p, author_id: alice, content: "récent 2", created_at: "2026-11-05T09:40:00" });
      __recevoir(__ligne("ci_r3", "c_recent2", p, moi, "1", "2026-11-05T09:41:00+00:00"));
    }, { p: P, alice: ALICE, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_recent2");
    await page.evaluate(({ p, alice }) => {
      const l = window.__canalDb.liaisons.find((x) => x.type === "postgres_changes" && x.filtre.table === "post_comments" && x.filtre.event === "INSERT");
      return l.cb({ schema: "public", table: "post_comments", eventType: "INSERT", new: { id: "c_recent2", post_id: p, author_id: alice, content: "récent 2", created_at: "2026-11-05T09:40:00" }, old: {} });
    }, { p: P, alice: ALICE });
    await page.evaluate(({ p, moi }) => __recevoir(__ligne("ci_r4", "c_recent2", p, moi, "0", "2026-11-05T09:42:00+00:00")), { p: P, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).epingles).toEqual([]);
    expect(await dansLaListe(page, "c_recent2"), "ni doublon, ni disparition").toBe(1);
  });

  test("㉑ discussion paginée PLUS LOIN (« précédents », puis réouverture) : l'épinglé lu à part se revérifie encore, et part s'il n'existe plus", async ({ page }) => {
    await preparer(page);
    await fil35(page, 65);
    await expect.poll(() => lusParId(page, "c_p00")).toBe(1);
    await page.evaluate((p) => _chargerCommentairesPrecedents(p), P);
    expect(await page.evaluate((p) => findPostAnywhere(p).comments.length, P), "30 + 30 + l'épinglé").toBe(61);
    await page.evaluate((p) => { closeModal(); window._cmtThreadLoadedAt = {}; return openComments(p); }, P);
    await expect.poll(() => lusParId(page, "c_p00"), { message: "revérifié, même la discussion paginée plus loin" }).toBe(2);
    // Supprimé en base (homonyme : sa ligne d'épingle reste) : la réouverture suivante l'enlève.
    await page.evaluate((p) => { __commentaires = __commentaires.filter((c) => c.id !== "c_p00"); closeModal(); window._cmtThreadLoadedAt = {}; return openComments(p); }, P);
    await expect.poll(() => dansLaListe(page, "c_p00"), { message: "absent en base : il part" }).toBe(0);
  });

  test("㉒ la réponse d'une écriture se PERD alors qu'elle a abouti : son écho le prouve, l'écran montre ce que dit la base", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_2"]')).toHaveCount(1);
    await page.evaluate((p) => togglePinComment(p, "c_rv38_2"), P);
    expect((await etat(page, P)).epingles).toEqual(["c_rv38_2"]);
    await page.evaluate(async ({ p, moi }) => {
      __verdictEcriture = (l) => (l.comment_id === "c_rv38_1" && l.payload === "1") ? { perdue: { code: "", message: "TypeError: Failed to fetch" } } : null;
      __delaiEcriture = 300;
      const geste = togglePinComment(p, "c_rv38_1");
      await new Promise((r) => setTimeout(r, 50));
      __recevoir(__ligne("ci_echo1", "c_rv38_1", p, moi, "1", "2026-11-05T23:50:00+00:00"));   // l'écho de MON écriture
      await geste;
      __delaiEcriture = 0; __verdictEcriture = null;
    }, { p: P, moi: MOI });
    await expect.poll(async () => (await etat(page, P)).epingles, { message: "la base a la nouvelle épingle : l'écran aussi" }).toEqual(["c_rv38_1"]);
    expect(await page.evaluate(() => __toasts.slice(-1)[0]), "et il ne dit pas qu'elle a échoué").toBe("Commentaire épinglé");
  });

  test("㉓ l'absence lue de l'ANCIEN épinglé ne retire pas le nouveau, lu à part entre-temps", async ({ page }) => {
    await preparer(page);
    await fil35(page, 35);
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_p00");
    await page.evaluate(async ({ p, moi }) => {
      __commentaires = __commentaires.filter((c) => c.id !== "c_p00");   // supprimé ; sa ligne d'épingle reste
      window.__delaiParId = { c_p00: 600 };                              // sa revérification traîne
      closeModal(); window._cmtThreadLoadedAt = {};
      const ouverture = openComments(p);
      await new Promise((r) => setTimeout(r, 150));
      // Pendant ce temps, mon autre appareil épingle c_p01, lui aussi plus ancien que la page.
      __recevoir(__ligne("ci_p01", "c_p01", p, moi, "1", "2026-11-05T23:55:00+00:00"));
      await ouverture;
      await new Promise((r) => setTimeout(r, 900));
      window.__delaiParId = {};
    }, { p: P, moi: MOI });
    await expect.poll(async () => await etat(page, P), { message: "c_p01 reste, épinglé en tête" })
      .toMatchObject({ epingles: ["c_p01"], premier: "c_p01", badges: ["c_p01"] });
    expect(await dansLaListe(page, "c_p00")).toBe(0);
  });

  test("㉔ « précédents » atteint la DERNIÈRE page sans l'épinglé lu à part (supprimé) : il part, et ne compte pas", async ({ page }) => {
    await preparer(page);
    await fil35(page, 35);
    await expect.poll(async () => (await etat(page, P)).premier).toBe("c_p00");
    const r = await page.evaluate(async (p) => {
      __commentaires = __commentaires.filter((c) => c.id !== "c_p00");
      await _chargerCommentairesPrecedents(p);
      const post = findPostAnywhere(p);
      return { present: post.comments.some((c) => c.id === "c_p00"), total: post.commentsTotal, suite: !!post._commentsSuite };
    }, P);
    expect(r).toEqual({ present: false, total: 34, suite: false });
  });
});
