// ═════════════════════════════════════════════════════════════════════
// CE QUI EST ANNONCÉ EST CE QUI EST GARDÉ (2026-11-10, audit de stabilisation)
//
// ETAT-07 — Au démarrage, `_rafraichirConversationsServeur` (sans `fusion`) REMPLACE
// une conversation connue du serveur par la sienne, qui ne porte que son dernier
// message. Le correctif du 2026-11-07 y reportait MES bulles de pièce jointe en
// attente ; une bulle TEXTE « envoi… » ou « réessayer », et le brouillon tapé dans
// la conversation, disparaissaient au premier démarrage réussi — alors que l'écran
// avait promis « le message reste dans la conversation, marqué échec ».
//
// SRV-03 — « Modifier » était proposé sur un commentaire d'ACTIVITÉ. Mesuré au
// canal ① le 10/11 : `event_comments` n'a ni colonne `content` ni policy UPDATE.
// L'écran disait « Commentaire modifié » ; le texte ne quittait jamais l'appareil.
// Et sur une publication, une modification refusée (0 ligne, ou erreur) laissait
// le nouveau texte à l'écran avec le même message de réussite.
//
// Ce que la suite garde :
//   ① une bulle texte « failed » et une « sending » survivent au remplacement ;
//   ② le brouillon d'une conversation survit au remplacement ;
//   ③ « Modifier » n'est pas proposé sur un commentaire d'activité, et l'édition
//      directe y est refusée ;
//   ④ sur une publication, un refus du serveur rend l'ancien texte, et ne dit
//      pas « Commentaire modifié » ;
//   ⑤ la même modification acceptée garde le texte et le dit.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function capterToasts(page) {
  await page.evaluate(() => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (msg) { window.__toasts.push(String(msg)); try { return vrai.apply(this, arguments); } catch (e) {} };
  });
}

test.describe("ETAT-07 : le démarrage ne retire ni les bulles en attente ni le brouillon", () => {
  const CONV = "conv_banc_etat07";

  async function preparer(page) {
    await bootOnboarded(page);
    await page.evaluate((cid) => {
      const maintenant = Date.now();
      const convs = getConversations();
      convs.push({
        id: cid, userId: "11111111-2222-4333-8444-555555555555", userName: "Camille",
        messages: [
          { id: "m_serveur_1", from: "them", text: "Salut", at: maintenant - 60000, status: "sent" },
          { id: "m_local_echec", from: "me", text: "Message refusé", at: maintenant - 30000, status: "failed" },
          { id: "m_local_envoi", from: "me", text: "Message en route", at: maintenant - 10000, status: "sending" },
        ],
        draft: "Brouillon pas encore envoyé",
        lastAt: maintenant - 10000, unread: 0,
      });
      saveConversationsNow();
      // Ce que rend le serveur : la conversation, avec son seul dernier message connu.
      window.supaLoadMyConversations = async () => [{
        id: cid, userId: "11111111-2222-4333-8444-555555555555", userName: "Camille",
        messages: [{ id: "m_serveur_1", from: "them", text: "Salut", at: maintenant - 60000, status: "sent" }],
        lastAt: maintenant - 60000, unread: 0,
      }];
    }, CONV);
  }

  const etat = (page) => page.evaluate((cid) => {
    const c = getConversations().find((x) => x.id === cid) || {};
    return { ids: (c.messages || []).map((m) => m.id + ":" + m.status), draft: c.draft || null };
  }, CONV);

  test("① les bulles texte en échec et en route survivent au remplacement par le serveur", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => _rafraichirConversationsServeur());
    const e = await etat(page);
    expect(e.ids).toEqual(["m_serveur_1:sent", "m_local_echec:failed", "m_local_envoi:sending"]);
  });

  test("② le brouillon de la conversation survit au remplacement par le serveur", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => _rafraichirConversationsServeur());
    expect((await etat(page)).draft).toBe("Brouillon pas encore envoyé");
  });
});

test.describe("SRV-03 : modifier un commentaire n'annonce que ce que la base a gardé", () => {
  async function preparer(page, verdictUpdate, opts = {}) {
    // Un COMPTE réel (forme d'un uuid), sauf demande : un visiteur n'a rien en base.
    if (!opts.visiteur) await page.addInitScript(() => { try { localStorage.setItem("passio_uid", "3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a"); } catch (e) {} });
    await bootOnboarded(page);
    await capterToasts(page);
    await page.evaluate((verdict) => {
      window.__updates = [];
      // ⚠️ `supa` est un `let` de portée script (app-08) : `window.supa = …` ne le rebinde
      // pas. On installe le faux client par `_initRealSupa`, comme profil-confidentialite-interface.
      window.supabase = { createClient: () => ({
        from: (table) => ({
          update: (corps) => {
            const q = {
              eq: () => q,
              select: async () => {
                window.__updates.push({ table, corps });
                if (verdict === "refus") return { data: null, error: { code: "42501", message: "refus" } };
                if (verdict === "zero") return { data: [], error: null };
                return { data: [{ id: "x" }], error: null };
              },
              then: (ok) => ok(verdict === "refus" ? { error: { code: "42501", message: "refus" } } : { error: null }),
            };
            return q;
          },
        }),
      }) };
      window._supaReal = false;
      _initRealSupa();
      window._supaReal = true;
    }, verdictUpdate);
  }

  // Un fil réel de l'application, avec un commentaire à moi.
  async function filAvecMonCommentaire(page, commentId) {
    return page.evaluate((cid) => {
      const pid = "p_banc_srv03";
      const post = { id: pid, authorId: "11111111-2222-4333-8444-555555555555", authorName: "Camille", passion: "musique",
        text: "Concert", createdAt: Date.now(), likes: 0, comments: [] };
      state.userPosts = state.userPosts || [];
      state.userPosts.unshift(post);
      post.comments.push({ id: cid, authorId: MY_UID, author: "Moi", authorName: "Moi", text: "Ancien texte", content: "Ancien texte", at: Date.now() });
      saveState();
      return pid;
    }, commentId);
  }

  test("③ « Modifier » n'est pas proposé sur un commentaire d'activité, et l'édition y est refusée", async ({ page }) => {
    await preparer(page, "ok");
    const ok = await page.evaluate(() => {
      // Le menu d'un commentaire d'activité à moi.
      const ec = "ec_banc_srv03";
      window._eventComments = window._eventComments || {};
      const avant = window.__updates.length;
      let menuModifier = null;
      try {
        const ctx = { authorId: MY_UID, text: "Texte" };
        // `_commentaireModifiable` est l'autorité qu'utilisent le menu et l'édition.
        menuModifier = _commentaireModifiable(ec, ctx.text);
      } catch (e) { menuModifier = "absente : " + e.message; }
      editCommentEntry("evt:banc", ec);
      return { menuModifier, ecritures: window.__updates.length - avant, toasts: window.__toasts.slice() };
    });
    expect(ok.menuModifier, "le menu ne propose pas « Modifier » sur un commentaire d'activité").toBe(false);
    expect(ok.ecritures).toBe(0);
  });

  test("④ sur une publication, un refus du serveur rend l'ancien texte et ne dit pas « Commentaire modifié »", async ({ page }) => {
    await preparer(page, "zero");
    const cid = "c_banc_srv03";
    const pid = await filAvecMonCommentaire(page, cid);
    const r = await page.evaluate(async ({ pid, cid }) => {
      const node = findPostAnywhere(pid).comments.find((c) => c.id === cid);
      // L'enregistrement, tel que le bouton le déclenche, sans dépendre du rendu.
      await _enregistrerModificationCommentaire({ node, thread: null }, "p:" + pid, cid, "Nouveau texte", "Ancien texte");
      return { texte: node.text, contenu: node.content, edite: !!node.edited, toasts: window.__toasts.slice(), ecritures: window.__updates.length };
    }, { pid, cid });
    expect(r.ecritures, "l'écriture est bien partie").toBe(1);
    expect(r.texte).toBe("Ancien texte");
    expect(r.contenu).toBe("Ancien texte");
    expect(r.edite).toBe(false);
    expect(r.toasts).not.toContain("Commentaire modifié");
    expect(r.toasts.some((t) => /refus|pas été modifié|non modifié/i.test(t)), "toasts : " + JSON.stringify(r.toasts)).toBe(true);
  });

  test("⑥ un visiteur garde sa modification locale : le refus serveur attendu n'est pas un échec", async ({ page }) => {
    await preparer(page, "refus", { visiteur: true });
    const cid = "c_banc_srv03";
    const pid = await filAvecMonCommentaire(page, cid);
    const r = await page.evaluate(async ({ pid, cid }) => {
      const node = findPostAnywhere(pid).comments.find((c) => c.id === cid);
      await _enregistrerModificationCommentaire({ node, thread: null }, "p:" + pid, cid, "Nouveau texte", "Ancien texte");
      return { texte: node.text, ecritures: window.__updates.length, toasts: window.__toasts.slice() };
    }, { pid, cid });
    expect(r.ecritures, "rien ne part au serveur pour un visiteur").toBe(0);
    expect(r.texte).toBe("Nouveau texte");
    expect(r.toasts).toContain("Commentaire modifié");
  });

  test("⑤ la même modification acceptée garde le texte et le dit", async ({ page }) => {
    await preparer(page, "ok");
    const cid = "c_banc_srv03";
    const pid = await filAvecMonCommentaire(page, cid);
    const r = await page.evaluate(async ({ pid, cid }) => {
      const node = findPostAnywhere(pid).comments.find((c) => c.id === cid);
      await _enregistrerModificationCommentaire({ node, thread: null }, "p:" + pid, cid, "Nouveau texte", "Ancien texte");
      return { texte: node.text, edite: !!node.edited, toasts: window.__toasts.slice() };
    }, { pid, cid });
    expect(r.texte).toBe("Nouveau texte");
    expect(r.edite).toBe(true);
    expect(r.toasts).toContain("Commentaire modifié");
  });
});
