// Une conversation sans membre en base se RÉPARE au lieu d'être abandonnée.
//
// MESURÉ EN PRODUCTION LE 2026-09-10 : 19 conversations sur 20 n'ont AUCUNE
// ligne `conv_members`. La policy d'insertion de `conv_messages` exige
// `is_conv_member(conv_id, auth.uid())` — sans membre, TOUT message est refusé,
// pour toujours. C'est la cause des 798 refus HTTP 403 du 2026-09-09.
//
// ⚠️ MAIS CES CONVERSATIONS PORTENT UN `created_by`, et la policy d'aujourd'hui
// autorise `is_conversation_creator(conv_id)` : leur créateur PEUT réinscrire
// les membres manquants. Le correctif du 2026-09-09 s'arrêtait à « ne plus
// rejouer » ; celui-ci RÉPARE, puis renvoie le message.
//
// Ce que cette suite exige : la réparation part sur un 403 (①) et le message
// repart après elle (② — RÉINJECTION : sur le code d'avant, aucun ajout de
// membre) ; elle N'EST PAS tentée sur un 401, où elle ne servirait à rien (③) ;
// elle n'est tentée QU'UNE FOIS par conversation (④, la garde anti-obstination)
// et un échec de réparation rend la main au refus définitif (⑤).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ⚠️ On MUTE les membres de `window.supa` par `defineProperty` : en CI le vrai
// SDK se charge et ses membres sont des getters de prototype qu'une simple
// affectation ne masque pas (vert en local, rouge en CI).
const FAUX_SUPA = `
window.__envois = [];
window._supaReal = true;
window._convReparationTentee = {};
Object.defineProperty(window.supa, "from", {
  configurable: true, writable: true,
  value: function (table) {
    return {
      insert: function (row) {
        window.__envois.push({ table: table, row: row });
        var r = (table === "conv_members") ? (window.__repMembres || { error: null })
                                           : (window.__repMessage || { error: null });
        // Le premier message est refusé, le suivant passe : c'est ce qui
        // distingue « réparé puis renvoyé » de « renvoyé pour rien ».
        if (table === "conv_messages" && window.__messageSuivant) {
          window.__repMessage = window.__messageSuivant; window.__messageSuivant = null;
        }
        return Promise.resolve(r);
      },
    };
  },
});
window.__poserConv = function (convId, msgId, pair) {
  var convs = getConversations();
  convs.push({ id: convId, userId: pair, userName: "Léane",
               messages: [{ id: msgId, text: "coucou", mine: true }] });
  saveConversations();
};
`;

const REFUS_403 = { status: 403, error: { code: "42501", message: "row-level security" } };

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate((f) => { eval(f); }, FAUX_SUPA);
}

const membres = (envois) => envois.filter((e) => e.table === "conv_members");
const messages = (envois) => envois.filter((e) => e.table === "conv_messages");

test.describe("Réparation de l'appartenance à une conversation", () => {
  test("① un 403 déclenche l'ajout des DEUX membres manquants", async ({ page }) => {
    await preparer(page);
    const envois = await page.evaluate(async (refus) => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p1", "msg_p1", "u_leane");
      window.__repMessage = refus;
      _sendTextToSupa("conv_p1", "msg_p1", "coucou");
      await new Promise((r) => setTimeout(r, 120));
      return window.__envois;
    }, REFUS_403);
    const m = membres(envois);
    // RÉINJECTION : sur le code d'avant, m.length vaut 0.
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.row.user_id)).toContain("u_leane");
  });

  test("② une fois réparée, le message REPART — et il passe", async ({ page }) => {
    await preparer(page);
    const res = await page.evaluate(async (refus) => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p2", "msg_p2", "u_leane");
      window.__repMessage = refus;
      window.__messageSuivant = { error: null }; // le renvoi d'après réussit
      _sendTextToSupa("conv_p2", "msg_p2", "coucou");
      await new Promise((r) => setTimeout(r, 150));
      const c = getConversations().find((x) => x.id === "conv_p2");
      return { envois: window.__envois, statut: (c.messages || [])[0].status };
    }, REFUS_403);
    expect(messages(res.envois).length).toBe(2); // le refusé, puis le renvoi
    expect(res.statut).toBe("sent");
  });

  test("③ un 401 ne déclenche AUCUNE réparation", async ({ page }) => {
    await preparer(page);
    const envois = await page.evaluate(async () => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p3", "msg_p3", "u_leane");
      // Un jeton absent ou expiré ne se répare pas en ajoutant un membre :
      // l'écriture partirait sous une identité qui n'existe pas.
      window.__repMessage = { status: 401, error: { message: "JWT expired" } };
      _sendTextToSupa("conv_p3", "msg_p3", "coucou");
      await new Promise((r) => setTimeout(r, 120));
      return window.__envois;
    });
    expect(membres(envois)).toHaveLength(0);
  });

  test("④ UNE SEULE tentative par conversation : pas de nouvelle obstination", async ({ page }) => {
    await preparer(page);
    const envois = await page.evaluate(async (refus) => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p4", "msg_p4", "u_leane");
      window.__repMessage = refus; // tout est refusé, toujours
      for (let i = 0; i < 3; i++) {
        _sendTextToSupa("conv_p4", "msg_p4_" + i, "coucou");
        await new Promise((r) => setTimeout(r, 60));
      }
      return window.__envois;
    }, REFUS_403);
    // Trois envois refusés, mais UNE seule réparation (2 lignes de membres).
    expect(membres(envois)).toHaveLength(2);
  });

  test("⑤ si la réparation est refusée, le message sort de la file", async ({ page }) => {
    await preparer(page);
    const file = await page.evaluate(async (refus) => {
      localStorage.removeItem("passio_outbox_v1");
      window.__poserConv("conv_p5", "msg_p5", "u_leane");
      window.__repMessage = refus;
      window.__repMembres = refus; // la réparation elle-même est refusée
      _sendTextToSupa("conv_p5", "msg_p5", "coucou");
      await new Promise((r) => setTimeout(r, 150));
      return JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]");
    }, REFUS_403);
    // On ne rejoue pas un refus qu'on n'a pas su réparer.
    expect(file).toHaveLength(0);
  });
});
