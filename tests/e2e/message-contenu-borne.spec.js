// ═══════════════════════════════════════════════════════════════════════════
// LE CONTENU D'UN MESSAGE EST BORNÉ — et le client se tient sous les bornes de
// la base (CONTENU_MESSAGE_BORNE, 2026-11-07).
//
// L'invariant « jamais de base64 en base (→ Storage) » n'était tenu QUE par le
// client : `conv_messages.content` est un `text` sans contrainte. La migration
// `migration_conv_messages_contenu_borne_2026-11-07.sql` pose deux contraintes
// CHECK — 20 000 caractères au plus, et jamais une data-URL dans l'`url` d'une
// enveloppe. Avant qu'elle ne s'applique (`-- PREREQUIS-CLIENT:`), ce client
// doit ne plus rien écrire qu'elle refuserait. L'audit des chemins d'écriture a
// trouvé UN chemin légitime qui le faisait : transférer une photo, une vidéo ou
// un vocal qu'on vient d'envoyer — la copie de l'auteur garde sa data-URL, et
// `_forwardTo` l'écrivait entière dans la ligne.
//
// Ce que cette suite exige :
//   ① un texte de plus de MSG_TEXTE_MAX caractères ne part pas, reste dans le
//      champ, et c'est dit ;
//   ② à MSG_TEXTE_MAX caractères du PIRE genre (tous échappés en JSON), avec
//      une réponse et un profil d'envoi maximaux, l'enveloppe qui part reste
//      sous la borne de la base ;
//   ③ transférer un média encore local le TÉLÉVERSE dans le dossier de la cible :
//      l'enveloppe porte l'URL Storage, jamais la data-URL (RÉINJECTION : sur le
//      code d'avant, `url` est la data-URL et rien n'est téléversé) ;
//   ④ ⑤ téléversement refusé, ou client Supabase absent : le transfert est
//      refusé, dit, et rien n'est écrit — ni en base, ni dans la conversation ;
//   ⑥ dernier filet : une enveloppe dont l'`url` est une data-URL (un GIF d'une
//      ancienne version) ne part pas ;
//   ⑦ un texte reçu plus long que MSG_TEXTE_MAX ne se transfère pas ;
//   ⑧ un refus 23514 de la base est DÉFINITIF (hors de la file) et DIT ;
//   ⑨ la contrepartie : un autre refus 400 reste rejoué comme avant.
//
// Aucune requête ne part : `supa` est un faux client (membres MUTÉS par
// `defineProperty`, comme dans message-refus-definitif.spec.js — en CI le vrai
// SDK expose `from` et `storage` par son prototype).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// La borne de la base : `conv_messages_content_len_check`, en CARACTÈRES
// (`char_length`, des points de code — jamais plus que la longueur JavaScript).
const BORNE_BASE = 20000;
const UID = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
// Deux interlocuteurs au format d'un vrai compte : un `u_…` pourrait être un
// membre du socle de démonstration, et une conversation de démonstration n'envoie
// rien. DEUX, pas un : deux conversations 1-à-1 avec la même personne sont
// fusionnées (`deduplicateConversations`), et la cible disparaîtrait.
const AUTRE = "8d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";
const AUTRE2 = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
// Une image PNG d'un pixel : 70 octets une fois décodée.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// Faux client : chaque requête est chaînable et se résout vide ; une insertion
// est consignée et rend la réponse dictée par le test ; un téléversement aussi.
const FAUX_SUPA = `
window.__envois = [];
window.__televersements = [];
window.__toasts = [];
window._supaReal = true;
function __requete(table) {
  var q = {};
  ["select", "eq", "neq", "in", "is", "order", "limit", "range", "gte", "lte", "match"].forEach(function (k) {
    q[k] = function () { return q; };
  });
  q.maybeSingle = q.single = function () { return Promise.resolve({ data: null, error: null }); };
  q.then = function (ok, ko) { return Promise.resolve({ data: [], error: null }).then(ok, ko); };
  q.insert = function (row) {
    window.__envois.push({ table: table, row: row });
    var rep = typeof window.__reponse === "function" ? window.__reponse(table, row) : window.__reponse;
    return Promise.resolve(rep || { error: null });
  };
  return q;
}
Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: __requete });
Object.defineProperty(window.supa, "rpc", { configurable: true, writable: true,
  value: function () { return Promise.resolve({ data: null, error: null }); } });
Object.defineProperty(window.supa, "storage", { configurable: true, writable: true, value: {
  from: function (seau) { return {
    upload: function (chemin, blob, opts) {
      window.__televersements.push({ seau: seau, chemin: chemin, taille: blob && blob.size, type: blob && blob.type, opts: opts });
      return Promise.resolve(window.__reponseStockage || { data: { path: chemin }, error: null });
    },
    getPublicUrl: function (chemin) {
      return { data: { publicUrl: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/" + seau + "/" + chemin } };
    },
  }; },
} });
var __vraiToast = window.toast;
window.toast = function (m) {
  window.__toasts.push(String(m));
  try { return __vraiToast.apply(this, arguments); } catch (e) {}
};
`;

async function preparer(page) {
  await bootOnboarded(page);
  await page.waitForFunction(
    () => typeof _forwardTo === "function" && typeof sendMessageFp === "function"
       && typeof _sendTextToSupa === "function" && typeof MSG_TEXTE_MAX === "number"
       && typeof openConversation === "function" && !!window.supa,
    null, { timeout: 20000 },
  );
  await page.evaluate((code) => { (0, eval)(code); }, FAUX_SUPA);
  await page.evaluate(([uid, autre, autre2]) => {
    MY_UID = uid; window.MY_UID = uid;
    try { localStorage.removeItem("passio_outbox_v1"); } catch (e) {}
    conversationsState = [
      { id: "conv_src", userId: autre, userName: "Alix", unread: 0, messages: [] },
      { id: "conv_cible", userId: autre2, userName: "Bao", unread: 0, messages: [] },
    ];
    saveConversationsNow();
  }, [UID, AUTRE, AUTRE2]);
}

const envoisConv = (page) => page.evaluate(() => window.__envois.filter((e) => e.table === "conv_messages"));

// Pose le message à transférer dans la conversation source, puis transfère.
async function transferer(page, message) {
  return page.evaluate(async (m) => {
    var src = getConversations().find((c) => c.id === "conv_src");
    src.messages = [Object.assign({ id: "m_src", at: Date.now() }, m)];
    saveConversationsNow();
    window._forwardSrc = { convId: "conv_src", msgId: "m_src" };
    await _forwardTo("conv_cible");
    await new Promise((r) => setTimeout(r, 150));
    var cible = getConversations().find((c) => c.id === "conv_cible");
    return {
      envois: window.__envois.filter((e) => e.table === "conv_messages").map((e) => e.row.content),
      televersements: window.__televersements,
      cible: (cible.messages || []).map((x) => ({ img: x.img, gif: x.gif, text: x.text })),
      toasts: window.__toasts,
    };
  }, message);
}

test.describe("Contenu d'un message — les bornes de la base, tenues par le client", () => {
  test("① un texte de plus de MSG_TEXTE_MAX caractères ne part pas, reste dans le champ, et c'est dit", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      openConversation("conv_cible");
      var inp = document.getElementById("convFpInput");
      inp.value = "a".repeat(MSG_TEXTE_MAX + 1);
      sendMessageFp("conv_cible", "Bao");
      await new Promise((res) => setTimeout(res, 200));
      return {
        max: MSG_TEXTE_MAX,
        envois: window.__envois.filter((e) => e.table === "conv_messages").length,
        champ: inp.value.length,
        messages: getConversations().find((c) => c.id === "conv_cible").messages.length,
        toasts: window.__toasts,
      };
    });
    expect(r.max).toBe(5000);
    expect(r.envois, "rien ne part").toBe(0);
    expect(r.messages, "rien n'est posé dans la conversation").toBe(0);
    expect(r.champ, "le texte reste dans le champ, à raccourcir").toBe(5001);
    expect(r.toasts.join(" | ")).toMatch(/trop long/);
  });

  test("② à MSG_TEXTE_MAX caractères du pire genre, avec réponse et profil d'envoi maximaux, l'enveloppe reste sous la borne de la base", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      // Le profil d'envoi le plus lourd que l'app pose (`_msgSenderMeta`) : un nom
      // de 40 caractères (maxlength du champ) fait de guillemets, une photo https longue.
      state.user.general = state.user.general || {};
      state.user.general.username = '"'.repeat(40);
      state.user.general.avatarPhoto = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/" + "p".repeat(400) + ".jpg";
      openConversation("conv_cible");
      // La réponse la plus lourde que `_setReplyTo` pose : un aperçu de 80 caractères.
      window._replyTo = { convId: "conv_cible", id: "msg_" + "x".repeat(40), t: "\\".repeat(80), n: '"'.repeat(40) };
      var inp = document.getElementById("convFpInput");
      // Le guillemet double s'échappe en DEUX caractères : le pire cas d'un texte saisi.
      inp.value = '"'.repeat(MSG_TEXTE_MAX);
      sendMessageFp("conv_cible", "Bao");
      await new Promise((res) => setTimeout(res, 300));
      var e = window.__envois.filter((x) => x.table === "conv_messages");
      var contenu = e.length ? e[0].row.content : "";
      var d = null; try { d = JSON.parse(contenu); } catch (err) {}
      return {
        n: e.length,
        unites: contenu.length,
        points: Array.from(contenu).length,
        texte: d && d.text ? d.text.length : -1,
        reponse: !!(d && d.rt),
        profil: !!(d && d.sp && d.sp.ph),
        donnees: /data:/i.test(contenu),
      };
    });
    expect(r.n).toBe(1);
    expect(r.texte, "le texte part entier").toBe(5000);
    expect(r.reponse && r.profil, "réponse et profil d'envoi sont bien dans l'enveloppe").toBe(true);
    expect(r.points, "char_length en base, contre la borne de la base").toBeLessThanOrEqual(BORNE_BASE);
    // La marge est réelle, pas un hasard d'arrondi : moins de 11 000 caractères.
    expect(r.unites).toBeLessThan(11000);
    expect(r.donnees).toBe(false);
  });

  test("③ transférer un média encore local le TÉLÉVERSE dans le dossier de la cible — jamais la data-URL en base", async ({ page }) => {
    await preparer(page);
    const r = await transferer(page, { from: "me", img: PNG, text: "" });
    expect(r.televersements, "un téléversement, et un seul").toHaveLength(1);
    const t = r.televersements[0];
    expect(t.seau).toBe("attachments");
    expect(t.chemin).toMatch(/^attachments\/conv_cible\/\d+_[a-z0-9]+_transfert\.png$/);
    expect(t.taille, "le fichier DÉCODÉ, pas sa data-URL").toBe(70);
    expect(t.type).toBe("image/png");
    expect(t.opts).toMatchObject({ upsert: false, contentType: "image/png" });
    expect(r.envois).toHaveLength(1);
    expect(r.envois[0], "RÉINJECTION : sur le code d'avant, l'enveloppe porte la data-URL").not.toMatch(/data:/i);
    const d = JSON.parse(r.envois[0]);
    expect(d.type).toBe("media");
    expect(d.url).toContain("/attachments/" + t.chemin);
    expect(r.cible).toHaveLength(1);
    expect(r.cible[0].img, "la copie locale du transfert pointe Storage, elle aussi").toBe(d.url);
  });

  test("④ téléversement refusé : le transfert est refusé, dit, et rien n'est écrit", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => {
      window.__reponseStockage = { data: null, error: { message: "new row violates row-level security policy" } };
    });
    const r = await transferer(page, { from: "me", img: PNG, text: "" });
    expect(r.televersements).toHaveLength(1);
    expect(r.envois, "aucune écriture en base").toHaveLength(0);
    expect(r.cible, "rien dans la conversation cible").toHaveLength(0);
    expect(r.toasts.join(" | ")).toMatch(/Transfert impossible/);
  });

  test("⑤ sans client Supabase réel : un média local ne se transfère pas — il ne part jamais en base64", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window._supaReal = false; });
    const r = await transferer(page, { from: "me", img: PNG, text: "" });
    expect(r.televersements).toHaveLength(0);
    expect(r.envois).toHaveLength(0);
    expect(r.cible).toHaveLength(0);
    expect(r.toasts.join(" | ")).toMatch(/Transfert impossible/);
  });

  test("⑤ bis un vocal encore local ne se TÉLÉVERSE pas : `_forwardTo` n'en fait aucune enveloppe — l'objet serait orphelin", async ({ page }) => {
    await preparer(page);
    // RÉINJECTION : avec `m.voiceData` parmi les champs téléversés (#751), un
    // téléversement part ici, pour un transfert qui n'écrit aucune url.
    const r = await transferer(page, { from: "me", text: "", voiceData: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYEC", voiceDuration: 3 });
    expect(r.televersements, "aucun objet Storage sans enveloppe qui le porte").toHaveLength(0);
    expect(r.envois.join(" "), "et jamais de data-URL en base").not.toMatch(/data:/i);
  });

  test("⑥ dernier filet : une enveloppe dont l'url est une data-URL (un GIF d'une ancienne version) ne part pas", async ({ page }) => {
    await preparer(page);
    const r = await transferer(page, { from: "them", gif: "  DATA:image/gif;base64,R0lGODlhAQABAAAAACw=", text: "🎞 GIF" });
    expect(r.televersements).toHaveLength(0);
    expect(r.envois).toHaveLength(0);
    expect(r.cible).toHaveLength(0);
    expect(r.toasts.join(" | ")).toMatch(/Transfert impossible/);
  });

  test("⑦ un texte reçu plus long que MSG_TEXTE_MAX ne se transfère pas ; à la borne, si", async ({ page }) => {
    await preparer(page);
    const trop = await transferer(page, { from: "them", text: "b".repeat(5001) });
    expect(trop.envois).toHaveLength(0);
    expect(trop.cible).toHaveLength(0);
    expect(trop.toasts.join(" | ")).toMatch(/trop long/);
    const juste = await transferer(page, { from: "them", text: "b".repeat(5000) });
    expect(juste.envois).toHaveLength(1);
    expect(JSON.parse(juste.envois[0]).text).toHaveLength(5000);
  });

  test("⑧ un refus 23514 est DÉFINITIF — hors de la file, message en échec — et il est DIT", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      var c = getConversations().find((x) => x.id === "conv_cible");
      c.messages = [{ id: "msg_l", from: "me", text: "long", at: Date.now() }, { id: "msg_d", from: "me", text: "", at: Date.now() }];
      saveConversationsNow();
      var lu = function () {
        var cc = getConversations().find((x) => x.id === "conv_cible");
        return {
          statuts: cc.messages.map((m) => m.status),
          file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").map((x) => x.msgId),
        };
      };
      window.__reponse = { status: 400, error: { code: "23514", message: 'new row for relation "conv_messages" violates check constraint "conv_messages_content_len_check"' } };
      _sendTextToSupa("conv_cible", "msg_l", '{"type":"text","text":"long"}');
      await new Promise((res) => setTimeout(res, 150));
      window.__reponse = { status: 400, error: { code: "23514", message: 'new row for relation "conv_messages" violates check constraint "conv_messages_content_url_data_check"' } };
      _sendTextToSupa("conv_cible", "msg_d", '{"type":"media","url":"data:image/png;base64,AAAA"}');
      await new Promise((res) => setTimeout(res, 150));
      return Object.assign(lu(), {
        envois: window.__envois.filter((e) => e.table === "conv_messages").length,
        toasts: window.__toasts,
        definitif: _refusDefinitif({ code: "23514" }, 400),
      });
    });
    expect(r.definitif).toBe(true);
    expect(r.envois, "un envoi chacun, aucune « réparation » d'appartenance").toBe(2);
    expect(r.statuts).toEqual(["failed", "failed"]);
    expect(r.file, "RÉINJECTION : sur le code d'avant, les deux restent en file").toEqual([]);
    expect(r.toasts.join(" | ")).toMatch(/trop long/);
    expect(r.toasts.join(" | ")).toMatch(/téléversée/);
  });

  test("⑨ la contrepartie : un autre refus 400 reste rejoué, comme avant", async ({ page }) => {
    await preparer(page);
    const r = await page.evaluate(async () => {
      var c = getConversations().find((x) => x.id === "conv_cible");
      c.messages = [{ id: "msg_x", from: "me", text: "x", at: Date.now() }];
      saveConversationsNow();
      window.__reponse = { status: 400, error: { code: "22P02", message: "invalid input syntax" } };
      _sendTextToSupa("conv_cible", "msg_x", '{"type":"text","text":"x"}');
      await new Promise((res) => setTimeout(res, 150));
      return {
        file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").map((x) => x.msgId),
        definitif: _refusDefinitif({ code: "22P02" }, 400),
      };
    });
    expect(r.definitif).toBe(false);
    expect(r.file).toEqual(["msg_x"]);
  });
});
