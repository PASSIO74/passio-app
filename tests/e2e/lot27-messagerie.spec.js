// ═══════════════════════════════════════════════════════════════════════════
// LOT-27 (audit UX/UI du 2026-11-10) — MESSAGERIE (SUITE)
//   ① MSG-C80 : un seul vocal à la fois ; fermer la conversation coupe le son.
//   ② MSG-C84 : transférer ne propose ni la conversation d'origine ni un compte
//      bloqué, et demande « Transférer à … ? ».
//   ③ MSG-C13 : la ligne dit combien de non-lus (pastille lisible).
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c1a1";
const MALIK = "a1b2c3d4-0000-4000-8000-00000000c1a2";
const BLOQUE = "a1b2c3d4-0000-4000-8000-00000000c1a3";

test("① MSG-C80 : un seul vocal à la fois, coupé à la fermeture", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const lus = [];
    function FauxAudio() { this.paused = true; this.playbackRate = 1; }
    FauxAudio.prototype.play = function () { this.paused = false; lus.push(this); return Promise.resolve(); };
    FauxAudio.prototype.pause = function () { this.paused = true; };
    window.Audio = FauxAudio;
    window._vd_a1 = "data:audio/webm;base64,AAAA"; window._vd_a2 = "data:audio/webm;base64,BBBB";
    _playVoiceById("a1");
    await new Promise((res) => setTimeout(res, 20));
    _playVoiceById("a2");
    await new Promise((res) => setTimeout(res, 20));
    const deux = { premier: window._aud_a1.paused, second: window._aud_a2.paused };
    closeConversation();
    return { deux, apres: window._aud_a2.paused };
  });
  expect(r.deux, "le premier se met en pause quand le second démarre").toEqual({ premier: true, second: false });
  expect(r.apres, "fermer la conversation coupe le son").toBe(true);
});

test("② MSG-C84 : ni l'origine ni un compte bloqué ; confirmation avant l'envoi", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(([lea, malik, bloque]) => {
    state.user.blocked = [bloque];
    conversationsState = [
      { id: "c_origine", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "m1", from: lea, text: "salut", at: Date.now() }] },
      { id: "c_malik", userId: malik, userName: "Malik", lastAt: Date.now() - 1000, messages: [] },
      { id: "c_bloque", userId: bloque, userName: "Bloqué", lastAt: Date.now() - 2000, messages: [] },
    ];
    _forwardPick("c_origine", "m1");
    const liste = Array.from(document.querySelectorAll("#modalContent .csetting-label")).map((x) => x.textContent);
    let envoye = null;
    const t0 = window._forwardTo;
    window._forwardTo = function (id) { envoye = id; };
    document.querySelector("#modalContent .csetting-item").click();
    const titre = document.querySelector("#modalContent .modal-title").textContent;
    const avant = envoye;
    Array.from(document.querySelectorAll("#modalContent button")).find((b) => b.textContent === "Transférer").click();
    window._forwardTo = t0;
    return { liste, titre, avant, apres: envoye };
  }, [LEA, MALIK, BLOQUE]);
  expect(r.liste).toEqual(["Malik"]);
  expect(r.titre).toBe("Transférer à Malik ?");
  expect(r.avant, "rien ne part avant la confirmation").toBeNull();
  expect(r.apres).toBe("c_malik");
});

test("③ MSG-C13 : la ligne dit combien de non-lus", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((lea) => {
    window._convNetLoaded = true;
    conversationsState = [{ id: "c_nl", userId: lea, userName: "Léa", unread: 3, lastAt: Date.now(), messages: [{ id: "m", from: lea, text: "hé", at: Date.now() }] }];
    goTo("messages");
    renderMessages();
    const b = document.querySelector(".msg-card .msg-badge");
    const cs = b && getComputedStyle(b);
    return b ? { texte: b.textContent, taille: parseFloat(cs.fontSize), h: b.getBoundingClientRect().height } : null;
  }, LEA);
  expect(r.texte).toBe("3");
  expect(r.taille).toBeGreaterThan(10);
  expect(r.h).toBeGreaterThanOrEqual(20);
});
