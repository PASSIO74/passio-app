// MSG-06 — ce que j'ai supprimé ne revient pas du SERVEUR.
//
// LE DÉFAUT (contre-revue Astra, chantier 8). Les pierres tombales ADR-008
// n'étaient consultées que par la fusion LOCALE (`_unionConvsById`,
// conv-suppression.spec.js). Trois portes serveur les ignoraient :
//   · `openConversation` réinjectait tout message serveur absent en local —
//     « Supprimer pour moi », fermer, rouvrir : le message était de retour ;
//   · le boot (`supaInit`) remettait toute conversation serveur, y compris
//     celle qu'on venait de « Supprimer » ;
//   · « Effacer le fil » vidait le tableau local et rien d'autre : la
//     réouverture rechargeait l'historique entier.
// Ce que cette suite exige : un message supprimé pour moi ne revient pas à la
// réouverture (① RÉINJECTION) ; un fil effacé reste effacé à la réouverture,
// mais un message POSTÉRIEUR s'affiche (② ③) ; une conversation supprimée
// n'est pas remise par le boot (④) ; un nouveau message la fait réapparaître
// avec ce seul message (⑤) ; ce qui n'a pas été supprimé n'est pas perdu (⑥).
// Aucune requête ne part : `supaLoadMessages` et `supaLoadMyConversations`
// sont remplacés par des retours programmés.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LUI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T0 = 1757800000000; // horodatages fixes, en ms

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(([lui, t0]) => {
    window._supaReal = true;
    window.__toasts = []; window.toast = (t) => window.__toasts.push(String(t));
    window.confirm = () => true;
    localStorage.removeItem("passio_conv_deleted_v1");
    // Le serveur : trois messages dans la conversation `c_x`.
    window.__serveur = [
      { id: "m1", from: lui, fromName: "Léa", text: "message-un-xyz", at: t0 + 1000 },
      { id: "m2", from: "me", fromName: "Moi", text: "deux", at: t0 + 2000 },
      { id: "m3", from: lui, fromName: "Léa", text: "trois", at: t0 + 3000 },
    ];
    window.supaLoadMessages = async () => window.__serveur.map((m) => Object.assign({}, m));
    window.supaMarkRead = async () => {};
    window.supaLoadOtherRead = async () => true;
    const convs = getConversations();
    convs.push({ id: "c_x", userId: lui, userName: "Léa", userEmoji: "✨", userColor: "#888", lastAt: t0 + 3000, unread: 0,
      messages: window.__serveur.map((m) => Object.assign({}, m)), fromSupabase: true });
    saveConversationsNow();
  }, [UID_LUI, T0]);
}
const idsLocaux = (page) => page.evaluate(() => ((getConversations().find((c) => c.id === "c_x") || {}).messages || []).map((m) => m.id));
const rouvrir = (page) => page.evaluate(async () => { closeConversation(); await openConversation("c_x"); await new Promise((r) => setTimeout(r, 200)); });

test.describe("MSG-06 — les suppressions tiennent face au serveur", () => {
  test("① « supprimer pour moi » puis rouvrir : le message ne revient pas", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { await openConversation("c_x"); await new Promise((r) => setTimeout(r, 200)); _deleteMsgForMe("c_x", "m1"); });
    expect(await idsLocaux(page)).toEqual(["m2", "m3"]);
    await rouvrir(page);
    // RÉINJECTION : sur le code d'avant, m1 est réinjecté par supaLoadMessages.
    expect(await idsLocaux(page)).toEqual(["m2", "m3"]);
    expect(await page.evaluate(() => (document.getElementById("convFpThread") || {}).textContent || "")).not.toContain("message-un-xyz");
  });

  test("② « effacer le fil » puis rouvrir : rien ne revient", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { await openConversation("c_x"); await new Promise((r) => setTimeout(r, 200)); _clearConvMessages("c_x"); });
    expect(await idsLocaux(page)).toEqual([]);
    await rouvrir(page);
    // RÉINJECTION : sur le code d'avant, les trois messages reviennent.
    expect(await idsLocaux(page)).toEqual([]);
  });

  test("③ après « effacer le fil », un message POSTÉRIEUR s'affiche", async ({ page }) => {
    await banc(page);
    await page.evaluate(async () => { await openConversation("c_x"); await new Promise((r) => setTimeout(r, 200)); _clearConvMessages("c_x"); });
    await page.evaluate((lui) => { window.__serveur.push({ id: "m4", from: lui, fromName: "Léa", text: "quatre", at: Date.now() + 5000 }); }, UID_LUI);
    await rouvrir(page);
    expect(await idsLocaux(page)).toEqual(["m4"]);
  });

  test("④ « supprimer la conversation » : le boot ne la remet pas depuis le serveur", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { _deleteConv("c_x"); });
    expect(await page.evaluate(() => getConversations().some((c) => c.id === "c_x"))).toBe(false);
    // Le boot : `supaLoadMyConversations` rend la conversation ; `_filtrerConvsServeur` est ce que supaInit applique.
    const r = await page.evaluate(([lui, t0]) => {
      const serveur = [{ id: "c_x", userId: lui, userName: "Léa", lastAt: t0 + 3000, unread: 1, messages: [{ id: "m3", from: lui, text: "trois", at: t0 + 3000 }], fromSupabase: true },
        { id: "c_y", userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userName: "Sam", lastAt: t0, unread: 0, messages: [], fromSupabase: true }];
      // RÉINJECTION : `_filtrerConvsServeur` n'existe pas sur le code d'avant.
      return _filtrerConvsServeur(serveur).map((c) => c.id);
    }, [UID_LUI, T0]);
    expect(r).toEqual(["c_y"]);
    // Et la fusion locale non plus (ADR-008, inchangé).
    expect(await page.evaluate(() => _unionConvsById([{ id: "c_x", messages: [] }], []).length)).toBe(0);
  });

  test("⑤ un NOUVEAU message dans une conversation supprimée la fait réapparaître, avec ce seul message", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { _deleteConv("c_x"); });
    await page.evaluate(async ([lui]) => {
      // Le serveur confirme l'appartenance et la conversation ; l'historique reste effacé.
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: function (table) {
        const rep = table === "conv_members" ? [{ conv_id: "c_x", user_id: lui, profiles: { username: "Léa" } }] : [{ id: "c_x", is_group: false }];
        const b = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
          maybeSingle: () => Promise.resolve({ data: rep[0], error: null }), then: (a, c) => Promise.resolve({ data: rep, error: null }).then(a, c) };
        return b;
      } });
      window._fetchProfile = async () => ({ username: "Léa", emoji: "✨", color: "#888" });
      await _handleIncomingConvMessage({ id: "m5", conv_id: "c_x", from_id: lui, content: "cinq", created_at: new Date(Date.now() + 5000).toISOString() });
    }, [UID_LUI]);
    expect(await idsLocaux(page)).toEqual(["m5"]);
    // La pierre "conv" est levée (la conversation vit à nouveau), la marque "clr" tient.
    const j = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_conv_deleted_v1") || "{}"));
    expect(j["conv:c_x"]).toBeUndefined();
    expect(typeof j["clr:c_x"]).toBe("number");
    // À la réouverture, l'historique (m1..m3) ne revient pas ; m5 reste.
    await page.evaluate((lui) => { window.__serveur.push({ id: "m5", from: lui, text: "cinq", at: Date.now() + 5000 }); }, UID_LUI);
    await rouvrir(page);
    expect(await idsLocaux(page)).toEqual(["m5"]);
  });

  test("⑥ sans suppression, la réouverture garde tout (rien ne se volatilise)", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { getConversations().find((c) => c.id === "c_x").messages.pop(); saveConversationsNow(); });
    expect(await idsLocaux(page)).toEqual(["m1", "m2"]);
    await rouvrir(page);
    expect(await idsLocaux(page)).toEqual(["m1", "m2", "m3"]);
  });
});
