// ═════════════════════════════════════════════════════════════════════
// UNE NOTIFICATION EST L'ÉCHO D'UNE ÉCRITURE ACCEPTÉE (SRV-02, 2026-11-13)
//
// Depuis la migration du 13/11 (`trg_notifications_preuve`), la base refuse une
// notification `like` / `comment` / `event_*` / `live_video` dont l'événement
// métier n'existe pas. Le client notifiait EN PARALLÈLE de son écriture : la
// notification arrivait avant le fait et se faisait refuser — une notification
// légitime perdue. Ce que la suite garde :
//   ① `notifierApresEcriture` n'écrit RIEN tant que l'écriture n'a pas répondu,
//      écrit au succès (vrai, `{ ok: true }`, identifiant), jamais sur un refus ;
//   ② la réaction emoji d'une publication notifie au verdict de SA file ;
//   ③ la file des commentaires notifie à la CONFIRMATION de l'envoi (pas à la
//      mise en file, pas sur un échec), avec le fil pour référence.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "5c4b3a29-1807-4f6e-9d5c-4b3a2918a113";

async function banc(page) {
  await page.addInitScript((uid) => { try { localStorage.setItem("passio_uid", uid); localStorage.removeItem("passio_cmt_outbox_v1"); } catch (e) {} }, UID);
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__notifs = [];
    window.supaInsertNotif = function (to, kind, ref, text) { window.__notifs.push({ to, kind, ref, text }); return Promise.resolve(); };
    window.__differer = function () {
      let regler; const p = new Promise((r) => { regler = r; });
      return { p, regler };
    };
  });
}

test.describe("SRV-02 : une notification part au verdict de son écriture", () => {
  test("① notifierApresEcriture : rien avant la réponse, tout au succès, rien sur un refus", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const out = {};
      const d = window.__differer();
      const fin = notifierApresEcriture(d.p, "u_dest", "like", "p1", "a aimé ton commentaire");
      await new Promise((x) => setTimeout(x, 50));
      out.avant = window.__notifs.length;
      d.regler(true); await fin;
      out.apresVrai = window.__notifs.slice();
      window.__notifs = [];
      for (const v of [false, null, undefined, { ok: false }, ""]) await notifierApresEcriture(Promise.resolve(v), "u", "like", "p", "x");
      await notifierApresEcriture(Promise.reject(new Error("réseau")), "u", "like", "p", "x");
      out.refus = window.__notifs.length;
      await notifierApresEcriture(Promise.resolve({ ok: true }), "u2", "comment", "p2", "y");
      await notifierApresEcriture(Promise.resolve("ec_123"), "u3", "comment", "e3", "z");
      out.objetEtId = window.__notifs.map((n) => n.to);
      return out;
    });
    expect(r.avant, "aucune notification avant le verdict").toBe(0);
    expect(r.apresVrai).toEqual([{ to: "u_dest", kind: "like", ref: "p1", text: "a aimé ton commentaire" }]);
    expect(r.refus, "refus, échec, rejet : rien ne part").toBe(0);
    expect(r.objetEtId).toEqual(["u2", "u3"]);
  });

  test("② réaction emoji d'une publication : au verdict de sa file, jamais sur un refus", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const post = { id: "p_srv02", authorId: "u_autrice", fromSupabase: true };
      const d = window.__differer();
      _notifyPostReaction(post, "🔥", d.p);
      await new Promise((x) => setTimeout(x, 50));
      const avant = window.__notifs.length;
      d.regler(true); await new Promise((x) => setTimeout(x, 20));
      const apres = window.__notifs.slice();
      window.__notifs = [];
      _notifyPostReaction(post, "😍", Promise.resolve(false));
      await new Promise((x) => setTimeout(x, 20));
      return { avant, apres, refus: window.__notifs.length };
    });
    expect(r.avant).toBe(0);
    expect(r.apres).toEqual([{ to: "u_autrice", kind: "like", ref: "p_srv02", text: "a réagi 🔥 à ton post" }]);
    expect(r.refus).toBe(0);
  });

  test("③ file des commentaires : la notification part à la confirmation, pas à la mise en file", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._supaReal = true;
      window._sessionExpiree = false;
      // Un COMPTE (la file appartient à un compte, AUTH-06) : sans lui l'entrée est jetée.
      window._uidEstUnCompte = function () { return true; };
      let verdict = false;
      window._cmtObRun = function () { return Promise.resolve(verdict); };
      _enqueueCommentSync({ type: "post_comment", threadId: "p_fil", commentId: "c_srv02", nodeId: "c_srv02", text: "Bravo",
        notif: { to: "u_autrice", kind: "comment", text: "a commenté ton post" } });
      await new Promise((x) => setTimeout(x, 100));
      const apresEchec = window.__notifs.length;
      const enFile = _cmtObLoad().length;
      verdict = true;
      await _cmtObFlush();
      return { apresEchec, enFile, apres: window.__notifs.slice(), reste: _cmtObLoad().length };
    });
    expect(r.enFile, "l'envoi refusé reste en file").toBe(1);
    expect(r.apresEchec, "aucune notification sur un envoi refusé").toBe(0);
    expect(r.apres).toEqual([{ to: "u_autrice", kind: "comment", ref: "p_fil", text: "a commenté ton post" }]);
    expect(r.reste).toBe(0);
  });
});
