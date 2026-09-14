// MSG-03 / ASTRA-01 — une pièce jointe suit le cycle de vie de son message.
//
// MSG-03. « Supprimer pour tous » retirait la ligne `conv_messages`, jamais
// l'objet Storage : photo, vidéo, fichier restaient lisibles par tout membre de
// la conversation (URL signée), pour toujours. La policy DELETE du seau exige
// `owner = auth.uid()` — c'est l'auteur qui supprime, donc l'uploader : la
// purge est possible, elle n'était simplement jamais tentée.
//
// ASTRA-01. Le transfert réutilisait l'URL d'origine `attachments/<conv
// source>/…`. Le seau est privé et la lecture exige d'être membre de la
// conversation DU CHEMIN : le destinataire du transfert ne pouvait ni signer
// ni lire. L'objet est désormais COPIÉ dans le dossier de la cible ; copie
// refusée = transfert refusé, dit.
//
// ① ② ③ sont éprouvés par RÉINJECTION. Aucune requête ne part : `supa.from`
// et `supa.storage` sont MUTÉS.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const URL_SRC = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/attachments/attachments/conv_src/1787_photo.jpg";

const FAUX_SUPA = `
window.__inserts = []; window.__removes = []; window.__copies = []; window.__toasts = [];
window._supaReal = true;
window.toast = function (t) { window.__toasts.push(String(t)); };
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function (table) { var b = {
    insert: function (row) { window.__inserts.push({ table: table, row: row }); return Promise.resolve({ error: null }); },
    delete: function () { return b; }, eq: function () { return b; },
    then: function (a, c) { return Promise.resolve({ error: null }).then(a, c); } }; return b; } });
Object.defineProperty(window.supa, "storage", { configurable: true, writable: true,
  value: { from: function (seau) { return {
    remove: function (chemins) { window.__removes.push({ seau: seau, chemins: chemins }); return Promise.resolve({ data: chemins, error: null }); },
    copy: function (src, dst) { window.__copies.push({ seau: seau, src: src, dst: dst }); return Promise.resolve(window.__copieRefusee ? { data: null, error: { message: "refus" } } : { data: { path: dst }, error: null }); },
    getPublicUrl: function (chemin) { return { data: { publicUrl: "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/" + seau + "/" + chemin } }; },
    createSignedUrl: function (chemin) { return Promise.resolve({ data: { signedUrl: "https://signee/" + chemin }, error: null }); },
  }; } } });
`;

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_SUPA);
  await page.evaluate((urlSrc) => {
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    try { fermerHint(); } catch (e) {}
    const convs = getConversations();
    convs.push({ id: "conv_src", isGroup: false, userId: "u_lea", userName: "Léa", unread: 0, lastAt: Date.now(),
      messages: [{ id: "m_photo", from: "me", img: urlSrc, text: "📷 Photo", at: Date.now() - 1000 },
                 { id: "m_txt", from: "me", text: "juste du texte", at: Date.now() }] });
    convs.push({ id: "conv_dst", isGroup: false, userId: "u_tom", userName: "Tom", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
  }, URL_SRC);
}

test.describe("MSG-03 / ASTRA-01 — cycle de vie d'une pièce jointe", () => {
  test("① supprimer pour tous retire aussi l'objet Storage, sous son chemin exact", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      _deleteMsgForAll("conv_src", "m_photo");
      await new Promise((r) => setTimeout(r, 80));
      return { removes: window.__removes, reste: getConversations().find((c) => c.id === "conv_src").messages.map((m) => m.id) };
    });
    // RÉINJECTION : sur le code d'avant, aucun remove.
    expect(r.removes).toEqual([{ seau: "attachments", chemins: ["attachments/conv_src/1787_photo.jpg"] }]);
    expect(r.reste).toEqual(["m_txt"]);
  });

  test("② transférer une photo COPIE l'objet dans le dossier de la cible, et le message porte la copie", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._forwardSrc = { convId: "conv_src", msgId: "m_photo" };
      await _forwardTo("conv_dst");
      const dst = getConversations().find((c) => c.id === "conv_dst");
      return { copies: window.__copies, inserts: window.__inserts.filter((i) => i.table === "conv_messages"), local: dst.messages.map((m) => m.img) };
    });
    expect(r.copies).toHaveLength(1);
    expect(r.copies[0].src).toBe("attachments/conv_src/1787_photo.jpg");
    expect(r.copies[0].dst).toMatch(/^attachments\/conv_dst\/\d+_1787_photo\.jpg$/);
    expect(r.inserts).toHaveLength(1);
    const contenu = JSON.parse(r.inserts[0].row.content);
    // RÉINJECTION : sur le code d'avant, l'URL insérée est celle de conv_src.
    expect(contenu.url).toContain("/attachments/" + r.copies[0].dst);
    expect(contenu.url).not.toContain("conv_src/");
    expect(r.local[0]).toContain(r.copies[0].dst);
  });

  test("③ copie refusée : pas de message transféré, et c'est dit", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__copieRefusee = true;
      window._forwardSrc = { convId: "conv_src", msgId: "m_photo" };
      await _forwardTo("conv_dst");
      const dst = getConversations().find((c) => c.id === "conv_dst");
      return { inserts: window.__inserts.length, local: dst.messages.length, toasts: window.__toasts };
    });
    expect(r.inserts).toBe(0);
    expect(r.local).toBe(0);
    expect(r.toasts.some((t) => /Transfert impossible/.test(t))).toBe(true);
    expect(r.toasts.some((t) => /^Transféré$/.test(t))).toBe(false);
  });

  test("④ transférer du texte ne copie rien", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window._forwardSrc = { convId: "conv_src", msgId: "m_txt" };
      await _forwardTo("conv_dst");
      return { copies: window.__copies.length, inserts: window.__inserts.length };
    });
    expect(r.copies).toBe(0);
    expect(r.inserts).toBe(1);
  });
});
