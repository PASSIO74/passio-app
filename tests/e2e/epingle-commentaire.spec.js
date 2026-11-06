// ═══════════════════════════════════════════════════════════════════════════
// RV-38 — ÉPINGLER UN COMMENTAIRE : LE VERDICT DE L'ÉCRITURE EST LU ET DIT, ET
// LE LECTEUR NE CROIT QUE LE PROPRIÉTAIRE DU FIL (audit 2026-11-02, 05/11)
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
//   ④ qui n'est pas le propriétaire, ou un commentaire pas encore envoyé : rien
//     ne part, et la raison est dite ;
//   ⑤ la LECTURE (B voit l'épingle) : seule la ligne du propriétaire, dans CE
//     fil, compte — une ligne forgée par un autre compte, ou écrite dans un
//     autre fil, ne décide de rien ; la dernière ligne d'un commentaire décide ;
//   ⑥ un seul épinglé par fil : deux appareils du propriétaire en ont posé deux,
//     le plus récent l'emporte ;
//   ⑦ une lecture en ÉCHEC ne retire rien ; une lecture RÉUSSIE retire
//     l'épingle restée locale d'avant RV-38 (personne d'autre ne la voyait) ;
//   ⑧ EN DIRECT (la vraie liaison de `_creerCanalDb`) : l'épingle du
//     propriétaire s'applique, celle d'un autre compte non, « 0 » la retire ;
//   ⑨ une lecture partie AVANT une épingle ne l'efface pas en revenant.
// Aucune requête ne part : `supa.from` et `supa.channel` sont simulés.
// Fiche : docs/journal/serveur-securite-base.md, « 📌 RV-38 ».
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
    // ── Le « serveur » : une table, des écritures et des lectures journalisées ──
    window.__interactions = [];
    window.__ecritures = [];
    window.__lectures = [];
    window.__verdictEcriture = null;   // (ligne) => { error } pour refuser
    window.__lectureEnErreur = false;
    window.__delaiLecture = 0;
    window.__horloge = Date.parse("2026-11-05T09:00:00Z");
    supa.from = function (table) {
      const req = { table, ins: {}, eqs: [] };
      const q = {
        select: (cols) => { req.cols = cols; return q; },
        insert: (ligne) => { req.insert = ligne; return q; },
        eq: (col, v) => { req.eqs.push([col, v]); return q; },
        in: (col, vs) => { req.ins[col] = vs.slice(); return q; },
        order: () => q, limit: () => q, range: () => q, or: () => q,
        then: (ok, ko) => {
          if (req.insert) {
            const ligne = Object.assign({}, req.insert);
            __ecritures.push(Object.assign({ table }, ligne));
            const v = typeof __verdictEcriture === "function" ? __verdictEcriture(ligne) : null;
            if (v && v.error) return Promise.resolve({ data: null, error: v.error }).then(ok, ko);
            // L'heure du SERVEUR (trg_rate_limit), qui avance d'une seconde par écriture.
            __horloge += 1000;
            if (table === "comment_interactions") __interactions.push(Object.assign(ligne, { created_at: new Date(__horloge).toISOString() }));
            return Promise.resolve({ data: null, error: null }).then(ok, ko);
          }
          __lectures.push(req);
          if (table === "profiles") return Promise.resolve({ data: __profils.filter((p) => (req.ins.id || []).includes(p.id)), error: null }).then(ok, ko);
          if (table === "post_comments") {
            const fil = (req.eqs.find((e) => e[0] === "post_id") || [])[1];
            return Promise.resolve({ data: __commentaires.filter((c) => c.post_id === fil), error: null }).then(ok, ko);
          }
          if (table === "comment_interactions") {
            if (__lectureEnErreur) return Promise.resolve({ data: null, error: { code: "PGRST000", message: "lecture impossible" } }).then(ok, ko);
            // L'instantané est pris À LA REQUÊTE, comme une vraie lecture ; trié par heure.
            const cols = String(req.cols || "").split(",").map((s) => s.trim()).filter(Boolean);
            const rows = __interactions.filter((i) => (req.ins.comment_id || []).includes(i.comment_id))
              .slice().sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
              .map((i) => Object.fromEntries(cols.map((c) => [c, i[c] === undefined ? null : i[c]])));
            const reponse = { data: rows, error: null };
            if (__delaiLecture) return new Promise((r) => setTimeout(r, __delaiLecture)).then(() => reponse).then(ok, ko);
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
    window.__etat = (fil) => {
      const p = findPostAnywhere(fil);
      const boite = document.getElementById("commentsBox");
      const doms = boite ? Array.from(boite.querySelectorAll(".comment[data-commentid]")) : [];
      return {
        epingles: (p.comments || []).filter((c) => c.pinned).map((c) => c.id).sort(),
        premier: doms.length ? doms[0].getAttribute("data-commentid") : null,
        badges: doms.filter((d) => d.querySelector(".cmt-pinned-badge")).map((d) => d.getAttribute("data-commentid")),
      };
    };
    window.__pins = () => __ecritures.filter((e) => e.kind === "pin").map((e) => [e.comment_id, e.payload]);
  }, { moi: MOI, alice: ALICE, zoe: ZOE, P, PA });
}

const etat = (page, fil) => page.evaluate((f) => __etat(f), fil);

test.describe("RV-38 — l'épingle d'un commentaire : verdict lu, refus dit, propriétaire seul cru", () => {
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

    // Et la base, relue : ce que l'écran dit (aucun épinglé).
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
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Épingle refusée : seul l'auteur du fil épingle un de ses commentaires");

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
    }, P);
    await page.evaluate((p) => togglePinComment(p, "c_rv38_local"), P);
    expect(await page.evaluate(() => __ecritures.length)).toBe(0);
    expect(await page.evaluate(() => __toasts.slice(-1)[0])).toBe("Ce commentaire n'est pas encore envoyé : épingle-le dans un instant");
  });

  test("⑤ la lecture (B voit l'épingle) : seule celle du propriétaire, dans CE fil — la dernière ligne décide", async ({ page }) => {
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

    // Alice retire : la DERNIÈRE ligne de A1 décide, à la réouverture.
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

  test("⑦ une lecture en ÉCHEC ne retire rien ; une lecture RÉUSSIE retire l'épingle restée locale d'avant RV-38", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    // L'état d'avant RV-38 : épinglé sur CET appareil seulement, rien en base.
    await page.evaluate((p) => { findPostAnywhere(p).comments.find((c) => c.id === "c_rv38_1").pinned = true; }, P);

    await page.evaluate(() => { __lectureEnErreur = true; });
    await page.evaluate((p) => hydrateCommentInteractions(findPostAnywhere(p)), P);
    expect((await etat(page, P)).epingles, "une source illisible n'est pas une source calme").toEqual(["c_rv38_1"]);

    await page.evaluate(() => { __lectureEnErreur = false; });
    await page.evaluate((p) => hydrateCommentInteractions(findPostAnywhere(p)), P);
    expect((await etat(page, P)).epingles, "lue, et rien en base : l'épingle locale part").toEqual([]);
  });

  test("⑧ en direct : l'épingle du propriétaire s'applique, celle d'un autre compte non, « 0 » la retire", async ({ page }) => {
    await preparer(page);
    await page.evaluate((pa) => __ouvrir(pa), PA);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_a3"]')).toHaveCount(1);

    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t1", "c_rv38_a1", pa, alice, "1", "2026-11-05T09:30:00.123456+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => await etat(page, PA)).toEqual({ epingles: ["c_rv38_a1"], premier: "c_rv38_a1", badges: ["c_rv38_a1"] });

    await page.evaluate(({ pa, zoe }) => __recevoir(__ligne("ci_t2", "c_rv38_a3", pa, zoe, "1", "2026-11-05T09:31:00+00:00")), { pa: PA, zoe: ZOE });
    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t3", "c_rv38_a2", "post_ailleurs", alice, "1", "2026-11-05T09:31:30+00:00")), { pa: PA, alice: ALICE });
    expect((await etat(page, PA)).epingles, "ni la ligne forgée de Zoé, ni celle d'un autre fil").toEqual(["c_rv38_a1"]);

    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t4", "c_rv38_a3", pa, alice, "1", "2026-11-05T09:32:00+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => await etat(page, PA), { message: "un seul épinglé : A3 remplace A1" })
      .toEqual({ epingles: ["c_rv38_a3"], premier: "c_rv38_a3", badges: ["c_rv38_a3"] });

    await page.evaluate(({ pa, alice }) => __recevoir(__ligne("ci_t5", "c_rv38_a3", pa, alice, "0", "2026-11-05T09:33:00+00:00")), { pa: PA, alice: ALICE });
    await expect.poll(async () => (await etat(page, PA)).epingles).toEqual([]);
  });

  test("⑨ une lecture partie AVANT une épingle ne l'efface pas en revenant", async ({ page }) => {
    await preparer(page);
    await page.evaluate((p) => __ouvrir(p), P);
    await expect(page.locator('#commentsBox .comment[data-commentid="c_rv38_1"]')).toHaveCount(1);
    const fin = await page.evaluate(async (p) => {
      __delaiLecture = 400;   // l'instantané est pris à la requête : SANS l'épingle
      const lecture = hydrateCommentInteractions(findPostAnywhere(p));
      await new Promise((r) => setTimeout(r, 50));
      __delaiLecture = 0;
      await togglePinComment(p, "c_rv38_1");
      await lecture;
      return findPostAnywhere(p).comments.filter((c) => c.pinned).map((c) => c.id);
    }, P);
    expect(fin, "la réponse périmée ne défait pas l'épingle posée pendant la lecture").toEqual(["c_rv38_1"]);
    // La lecture suivante, elle, voit la ligne écrite.
    await page.evaluate((p) => hydrateCommentInteractions(findPostAnywhere(p)), P);
    expect((await etat(page, P)).epingles).toEqual(["c_rv38_1"]);
  });
});
