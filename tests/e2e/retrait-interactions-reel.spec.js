// ═══════════════════════════════════════════════════════════════════════════
// VERROU — R37 : UN RETRAIT D'INTERACTION SE VOIT EN DIRECT, ENTRE DEUX VRAIS COMPTES
// (audit 2026-11-02, registre RV-30 ; lot du 2026-11-05)
//
// POURQUOI CETTE SUITE. Le gestionnaire DELETE de `comment_interactions` sortait
// sans rien faire : `realtime.apply_rls` réduit l'ancienne ligne d'un DELETE à la
// clé primaire, et le client cherchait `comment_id` dedans. Aucune suite ne
// couvrait le retrait : `multi-comptes` ne teste que l'ajout. Ici, sur le STAGING,
// avec le vrai client et le vrai serveur Realtime :
//   ① la charge réelle d'un retrait : jusqu'au 2026-11-09, `{ id }` et rien
//     d'autre (le DELETE `postgres_changes` sous RLS, le fait qui motivait R37) ;
//     depuis la migration « 📴 » qui vide la publication, la LIGNE ENTIÈRE,
//     poussée par le serveur sur le sujet de la discussion (`fil:<publication>`)
//     — mesurée sur la trame ;
//   ② A retire son like et son emoji d'un commentaire : la discussion ouverte
//     chez B les perd EN DIRECT, ses relectures de ces interactions BLOQUÉES (la
//     preuve que c'est l'index, pas une relecture) ;
//   ③ A retire sa réaction d'une publication que B a lue par `fil_compteurs`
//     (sans identifiant) : la pastille de B la perd, sans aucun tour du fil ;
//   ④ A réagit puis retire sa réaction : B la voit arriver puis partir, sans
//     relire les réactions.
//
// ⚠️ ELLE ÉCRIT : opt-in `PASSIO_E2E_MULTI`, et elle REFUSE tout autre projet que
// le staging, côté banc ET côté page. La production n'a jamais de compte de cette
// suite. Le filet du fil est ARRÊTÉ chez B : un tour qui relirait `fil_compteurs`
// ferait partir la réaction pour une autre raison que celle qu'on mesure.
//
// Fiche : `docs/journal/capacite-perf-realtime.md`, « 🧹 R37 ».
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { cibleSupabase } = require("./cible-supabase");
const { configAdmin } = require("./compte-e2e");
const { signupUser } = require("./qa-helper");

const STAGING = "fcksxofaelcdmmifnwjo";

const decoder = (f) => (typeof f.payload === "string" ? f.payload : Buffer.from(f.payload).toString("utf8"));
// Une trame de CHANGEMENT du serveur Realtime, quelle que soit la forme du
// protocole (objet JSON ou tableau du sérialiseur 2.0.0) : `{ type, table, old_record }`,
// ou null. On ne nomme pas l'événement : cette suite ne s'abonne à rien, elle LIT
// les trames que reçoit l'application (la gate `audit:realtime` compte les abonnés).
// ⚠️ DEUX FORMES DEPUIS LE 2026-11-09 (« 📴 ») : la trame d'un changement CDC
// (`data.type`, `data.old_record`) d'avant la migration, et la poussée du serveur
// sur un sujet privé (`broadcast`, événement `<table>:<OPÉRATION>`, `payload.record`)
// d'après. Les deux se lisent ici sous la même forme normalisée.
function changement(texte) {
  try {
    const m = JSON.parse(texte);
    const evenement = Array.isArray(m) ? m[3] : m && m.event;
    const charge = Array.isArray(m) ? m[4] : m && m.payload;
    if (evenement === "broadcast" && charge && typeof charge.event === "string" && charge.event.indexOf(":") > 0) {
      const [table, type] = charge.event.split(":");
      const rec = charge.payload && charge.payload.record;
      return { type, table, old_record: type === "DELETE" ? (rec || null) : null, sujet: Array.isArray(m) ? m[2] : m.topic };
    }
    const d = charge && charge.data;
    if (!d || typeof d.table !== "string" || typeof d.type !== "string") return null;
    return { type: d.type, table: d.table, old_record: d.old_record || null };
  } catch (e) { return diffusionBinaire(texte); }
}
// ⚠️ LA DIFFUSION D'UN SUJET ARRIVE EN BINAIRE (mesuré sur le staging migré,
// 2026-11-09 : « aucune trame de changement décodée »). Le sérialiseur 2.0.0 de
// realtime-js encode une diffusion en un en-tête binaire — le genre, puis les
// LONGUEURS du sujet, du nom d'événement (et, pour une diffusion d'utilisateur,
// des métadonnées et l'encodage) — suivi du sujet, du nom, des métadonnées et de
// la charge JSON, sans séparateur : un motif sur le texte collait le sujet au nom
// (« …post_xcomment_interactions:DELETE »). On lit donc les longueurs. Elles
// tiennent sous 0x80 : le décodage UTF-8 de `decoder` les garde à l'identique.
function diffusionBinaire(texte) {
  const genre = texte.charCodeAt(0);
  let pos, sujet, nom;
  if (genre === 4) {          // diffusion d'utilisateur : genre, sujet, nom, métadonnées, encodage
    const t = texte.charCodeAt(1), e = texte.charCodeAt(2), m = texte.charCodeAt(3);
    pos = 5; sujet = texte.substr(pos, t); pos += t; nom = texte.substr(pos, e); pos += e + m;
  } else if (genre === 2) {   // diffusion : genre, sujet, nom
    const t = texte.charCodeAt(1), e = texte.charCodeAt(2);
    pos = 3; sujet = texte.substr(pos, t); pos += t; nom = texte.substr(pos, e); pos += e;
  } else return null;
  let charge = null;
  try { charge = JSON.parse(texte.slice(pos)); } catch (e) { return null; }
  // Le genre 2 peut porter l'enveloppe `broadcast` : le vrai nom est dedans.
  if (nom === "broadcast" && charge && typeof charge.event === "string") { nom = charge.event; charge = charge.payload; }
  const ev = /^([a-z_]+):(INSERT|DELETE|UPSERT)$/.exec(nom || "");
  if (!ev) return null;
  const rec = charge && (charge.record || (charge.payload && charge.payload.record));
  if (!rec) return null;
  return { type: ev[2], table: ev[1], old_record: ev[2] === "DELETE" ? rec : null, sujet };
}

test("R37 : le retrait d'une interaction par un autre compte se voit en direct", async ({ browser }, testInfo) => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "crée de vrais comptes : opt-in PASSIO_E2E_MULTI, sur le staging seulement");
  test.setTimeout(260000);

  const cfg = configAdmin();
  const cible = cibleSupabase();
  if (!cible || !cible.url.includes(STAGING) || !cfg || !cfg.url.includes(STAGING)) {
    throw new Error("la cible de cette suite n'est pas le staging : elle n'écrit rien");
  }

  const t0 = Date.now();
  const noter = (m) => console.log(`[R37 ${((Date.now() - t0) / 1000) | 0} s] ${m}`);
  const contextes = [];
  const uids = [];
  const aNettoyer = { post: null, commentaire: null };

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
  const suppressionsRecues = (compte) => compte.frames.map(changement)
    .filter((c) => c && c.type === "DELETE" && c.table === "comment_interactions");

  try {
    const A = await ouvrir("Essai Alice");
    const B = await ouvrir("Essai Bob");

    // A est PUBLIQUE (un compte neuf est privé par défaut, règle du 2026-08-31) :
    // B doit pouvoir lire sa publication et ses interactions.
    const publication = await A.page.evaluate(async () => {
      state.user.general = state.user.general || {};
      state.user.general.isPrivate = false; state.user.general.privacyChoisi = true;
      saveState();
      await supaUpsertProfile();
      const pub = await supa.from("profiles").update({ is_private: false }).eq("id", MY_UID).select("id");
      if (pub.error || !(pub.data || []).length) return { erreur: "profil public : " + ((pub.error && pub.error.message) || "0 ligne") };
      const pid = "post_" + uid();
      const p = await supa.from("posts").insert([{ id: pid, author_id: MY_UID, passion_id: "musique", mood: "all",
        content: "Publication R37 [test auto]", media_url: null, created_at: new Date().toISOString() }]);
      if (p.error) return { erreur: "publication : " + p.error.code + " " + p.error.message };
      const cid = "c_" + uid();
      const c = await supa.from("post_comments").insert({ id: cid, post_id: pid, author_id: MY_UID,
        content: "Commentaire R37 [test auto]", created_at: new Date().toISOString() });
      if (c.error) return { erreur: "commentaire : " + c.error.code + " " + c.error.message };
      // Les VRAIS chemins d'écriture des gestes : like, emoji d'un commentaire,
      // réaction d'une publication (convention comment_id === post_id).
      const like = await supaCommentInteract(cid, pid, "like", "");
      await _syncReactionEmoji(cid, pid, "🔥");
      await _syncReactionEmoji(pid, pid, "😍");
      const lu = await supa.from("comment_interactions").select("id,comment_id,kind,payload").eq("user_id", MY_UID);
      const id = (kind, cible) => ((lu.data || []).find((r) => r.kind === kind && r.comment_id === cible) || {}).id || null;
      return { postId: pid, commentId: cid, like, lignes: (lu.data || []).map((r) => r.kind + ":" + (r.comment_id === pid ? "post" : "commentaire")).sort(),
        idsCommentaire: [id("like", cid), id("emoji", cid)] };
    });
    expect(publication.erreur, "A publie, commente et réagit").toBeUndefined();
    aNettoyer.post = publication.postId; aNettoyer.commentaire = publication.commentId;
    expect(publication.lignes, "les trois interactions de A sont en base").toEqual(["emoji:commentaire", "emoji:post", "like:commentaire"]);
    const P = publication.postId, C = publication.commentId;
    noter("A=" + A.uid + " B=" + B.uid + " publication " + P);

    // ── Les lectures que B ferait s'il RELISAIT, comptées DÈS MAINTENANT ──
    // (une autre suite tourne en parallèle sur le staging : un DELETE étranger peut
    // déclencher la lecture des identifiants à tout instant, elle doit être vue).
    // Interactions du commentaire : bloquées une fois la discussion ouverte ;
    // réactions de la publication : comptées ; tours du fil : comptés.
    const lectures = { commentaire: 0, publication: 0, fil: 0 };
    const mesure = { bloquerCommentaire: false, compterFil: false };
    await B.page.route(/\/rest\/v1\/comment_interactions/, (route) => {
      const u = decodeURIComponent(route.request().url());
      if (route.request().method() !== "GET") return route.continue();
      if (mesure.bloquerCommentaire && u.indexOf(C) !== -1) { lectures.commentaire++; return route.abort(); }
      if (u.indexOf(P) !== -1 && u.indexOf("kind=in.") !== -1) lectures.publication++;
      return route.continue();
    });
    await B.page.route(/\/rest\/v1\/rpc\/fil_compteurs/, (route) => {
      // Seulement un tour qui RELIT P : une autre suite publie en parallèle, et un
      // INSERT de `posts` peut faire compléter le fil de B avec d'autres publications.
      if (mesure.compterFil && String(route.request().postData() || "").indexOf(P) !== -1) lectures.fil++;
      return route.continue();
    });

    // ── B lit la publication comme au démarrage (`fil_compteurs`), ouvre la discussion ──
    // Le filet du fil est arrêté APRÈS la chaîne de démarrage, qui le lance.
    await B.page.waitForFunction(() => window._supaInitTerminee === true, null, { timeout: 45000 });
    await B.page.evaluate(() => { try { stopFeedRefreshLoop(); } catch (e) {} try { stopPostLikeRefresh(); } catch (e) {} });
    let lue = null;
    for (let essai = 0; essai < 12 && !lue; essai++) {
      lue = await B.page.evaluate(async ([pid, alice]) => {
        const posts = await supaLoadPosts(0, alice);
        const p = (posts || []).find((x) => x.id === pid);
        if (!p || !(p.reactions || []).some((x) => x.authorId === alice)) return null;
        state.supabasePosts = [p].concat((state.supabasePosts || []).filter((x) => x.id !== pid));
        return { reactions: p.reactions.map((x) => ({ texte: x.text, ci: x.ci || null })) };
      }, [P, A.uid]);
      if (!lue) await B.page.waitForTimeout(1500);
    }
    expect(lue, "B lit la publication de A et sa réaction").toBeTruthy();
    noter("B a lu la publication : " + JSON.stringify(lue.reactions) + (lue.reactions.every((x) => !x.ci) ? " (fil_compteurs, sans identifiant)" : " (repli du fil, identifiant lu)"));
    await B.page.evaluate(async (pid) => {
      const carte = document.createElement("div");
      carte.setAttribute("data-r37-carte", "1");
      carte.innerHTML = renderPostHTML(findPostAnywhere(pid));
      document.body.appendChild(carte);
      window._cmtThreadLoadedAt = {};
      await openComments(pid);
    }, P);
    await expect(B.page.locator(`#commentsBox .comment[data-commentid="${C}"]`)).toHaveCount(1, { timeout: 20000 });
    const etatB = () => B.page.evaluate(([pid, cid, alice]) => {
      const p = findPostAnywhere(pid);
      const n = ((p && p.comments) || []).find((x) => x.id === cid) || {};
      const dom = document.querySelector('#commentsBox .comment[data-commentid="' + cid + '"]');
      return {
        likes: n.likes || 0, likeAlice: (n.likedBy || []).includes(alice),
        emojiAlice: (n.replies || []).some((r) => r.type === "emoji_reaction" && r.authorId === alice),
        boutonLike: dom ? dom.querySelector('[data-cmtlike="' + cid + '"]').textContent.trim() : null,
        pastilleCommentaire: dom ? dom.querySelector('[data-cmtchip="' + cid + '"]').textContent.trim() : null,
        reactionPostAlice: ((p && p.reactions) || []).filter((x) => x.authorId === alice).map((x) => x.text),
        pastillePost: Array.from(document.querySelectorAll('[data-postchip="' + pid + '"]')).map((h) => h.textContent.trim()),
      };
    }, [P, C, A.uid]);
    expect(await etatB(), "B voit le like, l'emoji et la réaction de A").toMatchObject({
      likes: 1, likeAlice: true, emojiAlice: true, boutonLike: "🤍 1", pastilleCommentaire: "🔥 1", reactionPostAlice: ["😍"],
    });
    // Depuis le 2026-11-09 (« 📴 ») : B écoute le sujet de la discussion ouverte,
    // `fil:<publication>` — le SDK le nomme « realtime:fil:<id> » — et plus `realtime:db`.
    await B.page.waitForFunction((pid) => (supa.getChannels() || []).some((c) => c.topic === "realtime:fil:" + pid && c.state === "joined"),
      P, { timeout: 45000 });
    noter("B a ouvert la discussion, fil:" + P + " rejoint");
    mesure.bloquerCommentaire = true;
    mesure.compterFil = true;

    await test.step("① ② A retire son like et son emoji : la discussion de B les perd, sans relecture", async () => {
      const avant = suppressionsRecues(B).length;
      const debut = Date.now();
      await A.page.evaluate(async ([pid, cid]) => { await supaCommentRemoveLike(cid); await _syncReactionEmoji(cid, pid, ""); }, [P, C]);
      await expect.poll(etatB, { timeout: 20000, message: "le like et l'emoji de A quittent la discussion de B" })
        .toMatchObject({ likes: 0, likeAlice: false, emojiAlice: false, boutonLike: "🤍 0", pastilleCommentaire: "" });
      noter(`② retirés chez B en ${Date.now() - debut} ms ; relectures du commentaire : ${lectures.commentaire}`);
      expect(lectures.commentaire, "B n'a pas relu les interactions du commentaire : l'index a suffi").toBe(0);
      // Le protocole est-il lisible ? B a reçu des INSERT (le like et l'emoji de A) :
      // s'il n'en décode aucun, c'est le décodeur de ce banc qui est en cause, pas le
      // correctif — le poll ci-dessus reste la preuve, et on le dit.
      const lisibles = B.frames.map(changement).filter(Boolean).length;
      if (!lisibles) { noter("⚠️ aucune trame de changement décodée : forme du protocole inconnue, contrôle de la charge non fait"); return; }
      // Les DELETE de A, et eux seuls : une autre suite efface aussi des interactions sur le staging.
      const recues = suppressionsRecues(B).slice(avant).filter((c) => c.old_record && publication.idsCommentaire.includes(c.old_record.id));
      expect(recues.map((c) => c.old_record.id).sort(), "les deux DELETE de A sont arrivés par le temps réel").toEqual(publication.idsCommentaire.slice().sort());
      for (const c of recues) {
        // ① Depuis la migration : la ligne ENTIÈRE, sur le sujet de la discussion
        // (seuls ceux qui pouvaient la lire la reçoivent — c'est la policy du sujet).
        expect(c.sujet, "① le retrait arrive sur le sujet de la discussion").toMatch(new RegExp("fil:" + P + "$"));
        expect(Object.keys(c.old_record).sort(), "① la charge d'un retrait : la ligne entière")
          .toEqual(["comment_id", "created_at", "id", "kind", "payload", "post_id", "user_id"]);
        expect(c.old_record.user_id, "le retrait dit qui retire").toBe(A.uid);
      }
    });

    await test.step("③ A retire sa réaction de la publication : la pastille de B la perd, sans tour du fil", async () => {
      const debut = Date.now();
      await A.page.evaluate(async (pid) => { await _syncReactionEmoji(pid, pid, ""); }, P);
      await expect.poll(etatB, { timeout: 20000, message: "la réaction de A quitte la pastille de B" })
        .toMatchObject({ reactionPostAlice: [] });
      const e = await etatB();
      for (const t of e.pastillePost) expect(t, "la pastille est vide").toBe("");
      noter(`③ retirée chez B en ${Date.now() - debut} ms ; lectures d'identifiants : ${lectures.publication}, tours du fil : ${lectures.fil}`);
      expect(lectures.fil, "aucun tour du fil : c'est le temps réel qui l'a retirée").toBe(0);
      // ⚠️ DEPUIS LA MIGRATION « 📴 » (2026-11-09), LE RETRAIT ARRIVE AVEC LA LIGNE
      // ENTIÈRE sur `fil:<publication>` : même une réaction lue SANS identifiant
      // (`fil_compteurs`) se retire sans rien relire. Avant, la charge CDC d'un
      // DELETE ne portait que `{ id }`, et il fallait UNE lecture des identifiants
      // pour la retrouver (R37) — mesuré sur le staging migré : 0 lecture, ~200 ms.
      expect(lectures.publication, "la ligne entière suffit : aucune lecture des identifiants").toBe(0);
    });

    await test.step("④ A réagit puis retire : B voit arriver puis partir, sans relire", async () => {
      const lecturesAvant = lectures.publication;
      await A.page.evaluate(async (pid) => { await _syncReactionEmoji(pid, pid, "🎉"); }, P);
      await expect.poll(etatB, { timeout: 20000, message: "la nouvelle réaction de A arrive chez B" }).toMatchObject({ reactionPostAlice: ["🎉"] });
      await A.page.evaluate(async (pid) => { await _syncReactionEmoji(pid, pid, ""); }, P);
      await expect.poll(etatB, { timeout: 20000, message: "et repart" }).toMatchObject({ reactionPostAlice: [] });
      expect(lectures.publication - lecturesAvant, "reçue en direct, elle était indexée : aucune lecture").toBe(0);
      expect(lectures.fil).toBe(0);
    });
  } finally {
    // Nettoyage ciblé : mes lignes et mes comptes. Le teardown de la CI purge par motif,
    // mais une exécution locale n'a pas de teardown (il effacerait les comptes d'un autre run).
    const entetes = { apikey: cfg.cle, Authorization: "Bearer " + cfg.cle };
    const supprimer = (chemin) => fetch(cfg.url + "/rest/v1/" + chemin, { method: "DELETE", headers: { ...entetes, Prefer: "return=minimal" } }).catch(() => null);
    if (uids.length) {
      const liste = uids.join(",");
      await supprimer(`comment_interactions?user_id=in.(${liste})`);
      if (aNettoyer.commentaire) await supprimer(`post_comments?id=eq.${aNettoyer.commentaire}`);
      if (aNettoyer.post) await supprimer(`posts?id=eq.${aNettoyer.post}`);
      await supprimer(`notifications?user_id=in.(${liste})`);
      await supprimer(`notifications?from_id=in.(${liste})`);
      await supprimer(`profiles?id=in.(${liste})`);
      for (const u of uids) await fetch(cfg.url + "/auth/v1/admin/users/" + u, { method: "DELETE", headers: entetes }).catch(() => null);
    }
    for (const ctx of contextes) await ctx.close().catch(() => {});
  }
});
