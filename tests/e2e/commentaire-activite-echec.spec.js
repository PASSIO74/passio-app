// ═════════════════════════════════════════════════════════════════════
// UN COMMENTAIRE D'ACTIVITÉ REFUSÉ NE RESTE PAS À L'ÉCRAN (ETAT-09, audit du 2026-11-10)
//
// `addEventComment` affichait le commentaire tout de suite (optimiste), puis
// ignorait l'échec de l'écriture : il restait affiché sous un identifiant local,
// persisté, vu de son seul auteur, pour toujours — un fantôme.
//
// Ce que la suite garde :
//   ① compte, écriture refusée → le commentaire est retiré, le texte revient dans
//      le champ, la personne est prévenue ;
//   ② compte, écriture acceptée → le commentaire reste sous l'identifiant serveur ;
//   ③ visiteur → sa copie locale reste, comme avant (rien en base pour lui).
//
// PARC-01 — le « j'aime » d'une activité jetait le verdict de `supaSetEventLike` et
// notifiait l'organisateur tout de suite : un « j'aime » refusé restait peint.
//   ④ compte, « j'aime » refusé → l'état d'avant revient, la personne est prévenue ;
//   ⑤ compte, « j'aime » accepté → il reste.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "5c4b3a29-1807-4f6e-9d5c-4b3a29180716";
const EVT = "evt_banc_etat09";

async function banc(page, { verdict, visiteur = false }) {
  if (!visiteur) await page.addInitScript((uid) => { try { localStorage.setItem("passio_uid", uid); } catch (e) {} }, UID);
  await bootOnboarded(page);
  await page.evaluate(({ verdict }) => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window.__inserts = 0;
    window.supabase = { createClient: () => ({
      from: () => ({
        insert: async () => {
          window.__inserts++;
          return verdict === "refus" ? { data: null, error: { code: "42501", message: "refus" } } : { data: null, error: null };
        },
      }),
    }) };
    window._supaReal = false;
    _initRealSupa();
    window._supaReal = true;
    // Le champ de saisie tel que la feuille de commentaires le pose.
    const champ = document.createElement("input");
    champ.id = "eventCommentInput";
    document.body.appendChild(champ);
  }, { verdict });
}

async function commenter(page, texte) {
  return page.evaluate(async ({ evt, texte }) => {
    document.getElementById("eventCommentInput").value = texte;
    await addEventComment(evt);
    const liste = (_eventCommentsCache[evt] || []).map((c) => ({ id: c.id, text: c.text }));
    return { liste, champ: document.getElementById("eventCommentInput").value, toasts: window.__toasts.slice(), inserts: window.__inserts };
  }, { evt: EVT, texte });
}

test.describe("ETAT-09 : un commentaire d'activité refusé ne devient pas un fantôme", () => {
  test("① compte, écriture refusée : retiré, texte rendu, personne prévenue", async ({ page }) => {
    await banc(page, { verdict: "refus" });
    const r = await commenter(page, "Je viens samedi");
    expect(r.inserts, "l'écriture est bien partie").toBe(1);
    expect(r.liste, "aucun commentaire fantôme").toEqual([]);
    expect(r.champ, "le texte revient dans le champ").toBe("Je viens samedi");
    expect(r.toasts.some((t) => /non envoyé/i.test(t)), JSON.stringify(r.toasts)).toBe(true);
  });

  test("② compte, écriture acceptée : le commentaire reste, sous l'identifiant serveur", async ({ page }) => {
    await banc(page, { verdict: "ok" });
    const r = await commenter(page, "Je viens samedi");
    expect(r.liste.length).toBe(1);
    expect(r.liste[0].text).toBe("Je viens samedi");
    expect(r.liste[0].id.startsWith("ec_local_"), "l'identifiant local est remplacé").toBe(false);
    expect(r.champ).toBe("");
  });

  test("③ visiteur : la copie locale reste, comme avant", async ({ page }) => {
    await banc(page, { verdict: "refus", visiteur: true });
    const r = await commenter(page, "Je viens samedi");
    expect(r.liste.length).toBe(1);
    expect(r.toasts.some((t) => /non envoyé/i.test(t))).toBe(false);
  });
});

test.describe("PARC-01 : le « j'aime » d'une activité suit le verdict du serveur", () => {
  const aimer = (page) => page.evaluate(async (evt) => {
    state.user.likedEvents = [];
    window._eventLikes = {};
    toggleEventLike(evt, null);
    const apresClic = !!(window._eventLikes[evt] && window._eventLikes[evt].liked);
    await new Promise((r) => setTimeout(r, 300));
    return { apresClic, aime: !!window._eventLikes[evt].liked, liste: state.user.likedEvents.slice(),
      compteur: window._eventLikes[evt].likes, toasts: window.__toasts.slice(), inserts: window.__inserts };
  }, EVT);

  test("④ compte, « j'aime » refusé : l'état d'avant revient, la personne est prévenue", async ({ page }) => {
    await banc(page, { verdict: "refus" });
    const r = await aimer(page);
    expect(r.apresClic, "l'affichage optimiste a bien eu lieu").toBe(true);
    expect(r.inserts).toBe(1);
    expect(r.aime).toBe(false);
    expect(r.liste).toEqual([]);
    expect(r.compteur).toBe(0);
    expect(r.toasts.some((t) => /non enregistré/i.test(t)), JSON.stringify(r.toasts)).toBe(true);
  });

  test("⑤ compte, « j'aime » accepté : il reste", async ({ page }) => {
    await banc(page, { verdict: "ok" });
    const r = await aimer(page);
    expect(r.aime).toBe(true);
    expect(r.liste).toEqual([EVT]);
    expect(r.toasts.some((t) => /non enregistré/i.test(t))).toBe(false);
  });
});
