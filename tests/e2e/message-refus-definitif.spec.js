// Un message que la règle d'accès REFUSE ne doit pas être rejoué à l'infini.
//
// LE DÉFAUT, MESURÉ EN PRODUCTION LE 2026-09-09. `telemetry_events` portait
// 798 refus HTTP 403 sur `POST /rest/v1/conv_messages` en six jours, pour
// QUATRE messages réellement partis. `_sendTextToSupa` traitait TOUTE
// défaillance à l'identique — coupure réseau, panne serveur et refus de la RLS
// — donc remise en file ; `_flushOutbox` rejouait la file à chaque démarrage et
// à chaque retour de connexion. Un message refusé par une policy ne passera
// JAMAIS : le rejouer ne le livre pas, ça noie seulement le vrai signal.
//
// ⚠️ Aucune erreur JavaScript n'était levée : le SDK Supabase rend le refus
// dans `{ error }`. `client_errors` portait DEUX lignes sur la même semaine.
//
// Ce que cette suite exige : un refus définitif sort de la file (① et ② :
// RÉINJECTION — elles échouent sur le code d'avant), un échec transitoire y
// reste (③, la contrepartie : le correctif ne doit pas casser le hors-ligne),
// le compteur d'essais SURVIT à la remise en file (④ — défaut introduit puis
// corrigé le jour même), le plafond finit par arrêter une cause inconnue (⑤),
// et rien n'est jamais perdu à l'écran (⑥).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Faux client : mémorise l'appel et rend la réponse dictée par le test. Aucune
// requête ne part — cette suite ne touche JAMAIS la base de production.
//
// ⚠️ On MUTE les membres de `window.supa` par `defineProperty`, on ne remplace
// pas `window.supa` : le `supa` lexical d'app-08 et `window.supa` désignent le
// MÊME objet, et en CI le vrai SDK se charge avec des getters de prototype
// qu'une simple affectation ne masque pas (défaut vert en local, rouge en CI).
const FAUX_SUPA = `
window.__envois = [];
window._supaReal = true;
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) {
        window.__envois.push({ table: table, row: row });
        return Promise.resolve(window.__reponse || { error: null });
      },
    };
  },
});
`;

// Pose une conversation locale avec un message, pour que `_setMsgStatus` ait
// une cible réelle : sans elle il sort en silence et le test mesurerait le vide.
const POSER_CONV = `
window.__poserConv = function (convId, msgId) {
  var convs = getConversations();
  convs.push({ id: convId, userName: "Léane", messages: [{ id: msgId, text: "coucou", mine: true }] });
  saveConversations();
};
`;

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate(([a, b]) => { eval(a); eval(b); }, [FAUX_SUPA, POSER_CONV]);
}

test.describe("Refus définitif d'un message", () => {
  test("① un refus 403 SORT de la file : plus aucun renvoi automatique", async ({ page }) => {
    await preparer(page);
    const res = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_r1", "msg_r1");
      window.__reponse = { status: 403, error: { code: "42501", message: "new row violates row-level security policy" } };
      _sendTextToSupa("conv_r1", "msg_r1", "coucou");
      await new Promise((r) => setTimeout(r, 60));
      return { file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]"), envois: window.__envois.length };
    });
    expect(res.envois).toBe(1);
    // RÉINJECTION : sur le code d'avant, la file contient 1 entrée ici.
    expect(res.file).toHaveLength(0);
  });

  test("② un 401 sort aussi : rejouer le même jeton échouera pareil", async ({ page }) => {
    await preparer(page);
    const file = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_r2", "msg_r2");
      // ⚠️ 401 et 403 sont DEUX causes distinctes (jeton absent vs règle qui
      // dit non) — on ne les confond que sur ce point précis : ni l'un ni
      // l'autre ne se répare en rejouant la MÊME requête telle quelle.
      window.__reponse = { status: 401, error: { message: "JWT expired" } };
      _sendTextToSupa("conv_r2", "msg_r2", "coucou");
      await new Promise((r) => setTimeout(r, 60));
      return JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]");
    });
    expect(file).toHaveLength(0);
  });

  test("③ un échec TRANSITOIRE reste en file — le hors-ligne n'est pas cassé", async ({ page }) => {
    await preparer(page);
    const file = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_r3", "msg_r3");
      // 500 = le serveur a un problème, il n'en aura peut-être plus dans dix
      // minutes. C'est exactement le cas que la file existe pour couvrir.
      window.__reponse = { status: 500, error: { message: "internal error" } };
      _sendTextToSupa("conv_r3", "msg_r3", "coucou");
      await new Promise((r) => setTimeout(r, 60));
      return JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]");
    });
    expect(file).toHaveLength(1);
    expect(file[0].msgId).toBe("msg_r3");
  });

  test("④ le compteur d'essais SURVIT à la remise en file", async ({ page }) => {
    await preparer(page);
    const essais = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_r4", "msg_r4");
      window.__reponse = { status: 500, error: { message: "boom" } };
      // Trois échecs transitoires d'affilée sur le MÊME message.
      for (let i = 0; i < 3; i++) {
        _outboxAdd("conv_r4", "msg_r4", "coucou");
        const a = JSON.parse(localStorage.getItem("passio_outbox_v1"));
        a[0].essais = Number(a[0].essais || 0) + 1;
        localStorage.setItem("passio_outbox_v1", JSON.stringify(a));
      }
      _outboxAdd("conv_r4", "msg_r4", "coucou");
      return JSON.parse(localStorage.getItem("passio_outbox_v1"))[0].essais;
    });
    // RÉINJECTION : sans la reprise de l'ancienne entrée, `essais` vaut 0 et le
    // plafond n'est JAMAIS atteint — la seconde ceinture ne servirait à rien.
    expect(essais).toBe(3);
  });

  test("⑤ au-delà du plafond, la file cesse de rejouer — même cause inconnue", async ({ page }) => {
    await preparer(page);
    const res = await page.evaluate(async () => {
      window.__poserConv("conv_r5", "msg_r5");
      window.__envois = [];
      window.__reponse = { status: 500, error: { message: "boom" } };
      localStorage.setItem("passio_outbox_v1", JSON.stringify(
        [{ convId: "conv_r5", msgId: "msg_r5", content: "coucou", at: Date.now(), essais: 99 }]));
      _flushOutbox();
      await new Promise((r) => setTimeout(r, 60));
      return { envois: window.__envois.length, file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]") };
    });
    expect(res.envois).toBe(0);
    expect(res.file).toHaveLength(0);
  });

  test("⑥ le message n'est JAMAIS perdu : il reste à l'écran, en échec", async ({ page }) => {
    await preparer(page);
    const statut = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_r6", "msg_r6");
      window.__reponse = { status: 403, error: { code: "42501", message: "refus" } };
      _sendTextToSupa("conv_r6", "msg_r6", "coucou");
      await new Promise((r) => setTimeout(r, 60));
      const c = getConversations().find((x) => x.id === "conv_r6");
      return (c.messages || [])[0].status;
    });
    // On retire l'AUTOMATISME du renvoi, jamais le texte ni le « réessayer ».
    expect(statut).toBe("failed");
  });
});
