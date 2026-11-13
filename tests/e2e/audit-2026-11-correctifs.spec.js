// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D — VERROUS DES CORRECTIFS (rouges sur le code
// d'avant, prouvés par exécution dans les deux sens)
//
//   D-02 cibles tactiles : « ⋯ » Paramètres, « ← » et actions d'une
//        conversation, bouton d'envoi, outil 😊 du composeur, « × » des bobines
//        et pastille 📷 d'une passion sont tapables sur 44 px (`elementFromPoint`,
//        jamais le seul `::after`) sans changer leur taille visible ;
//   D-03 champs < 16 px : les quatre (sept) liens réseaux de « Modifier le
//        profil » étaient à 12 px → zoom iOS à la saisie ;
//   D-04 noms accessibles : bouton d'envoi d'un message, pastille 📷, et les
//        « × » dupliqués des modales (span) portent un nom ;
//   D-05 `groupPhoto` d'un groupe dans la liste Messages passait dans `url(`
//        sans `_cssUrl` (voir audit-2026-11-xss.spec.js ③ pour l'exécution).
// Stub local (bootOnboarded) : aucune écriture en production.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Sonde du dépôt (accessibilite-cibles ⑤) : zone réellement tapable depuis le centre.
const SONDE = function () {
  window.__zoneTap = function (el) {
    el.scrollIntoView({ block: "center" });
    const b = el.getBoundingClientRect();
    const cx = Math.round(b.left + b.width / 2);
    const touche = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    let haut = Math.round(b.top + b.height / 2), bas = haut;
    while (haut > b.top - 30 && touche(cx, haut - 1)) haut--;
    while (bas < b.bottom + 30 && touche(cx, bas + 1)) bas++;
    const cy = Math.round((haut + bas) / 2);
    let g = cx, d = cx;
    while (g > b.left - 30 && touche(g - 1, cy)) g--;
    while (d < b.right + 30 && touche(d + 1, cy)) d++;
    return { w: d - g + 1, h: bas - haut + 1, visuelW: Math.round(b.width), visuelH: Math.round(b.height) };
  };
};

async function semerConv(page) {
  await page.evaluate(() => {
    const convs = getConversations();
    if (!convs.some((c) => c.id === "c_d02")) {
      convs.push({ id: "c_d02", userId: "11111111-2222-4333-8444-555555555555", userName: "Camille", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: [{ id: "m1", from: "11111111-2222-4333-8444-555555555555", text: "Salut", at: Date.now() - 1000 }] });
      saveConversationsNow();
    }
    goTo("messages"); renderMessages(); openConversation("c_d02");
  });
  await page.waitForTimeout(500);
}

test.describe("AUDIT D — correctifs D-02 à D-05", () => {
  test("D-02 ① « ⋯ » Paramètres : 44 px tapables, 34 px visibles", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    const z = await page.evaluate(() => window.__zoneTap(document.querySelector(".hamburger")));
    // RÉINJECTION : sur le code d'avant, 34×34.
    expect(z.w).toBeGreaterThanOrEqual(44);
    expect(z.h).toBeGreaterThanOrEqual(44);
    expect(z.visuelW).toBe(34);
  });

  test("D-02 ② conversation : « ← », actions, envoi — hauteur tapable ≥ 44 px, largeur ≥ 40 px, taille visible inchangée", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    await semerConv(page);
    // LOT-4 (MSG-C60) : champ vide, le bouton rond est le micro (le bouton GIF
    // séparé a disparu) ; avec du texte, c'est l'envoi.
    const z = await page.evaluate(() => {
      const micro = window.__zoneTap(document.getElementById("btnVoice"));
      const inp = document.getElementById("convFpInput");
      inp.value = "Bonjour";
      const r = {
        back: window.__zoneTap(document.querySelector(".conv-fp-back")),
        action: window.__zoneTap(document.querySelector(".conv-action-btn")),
        envoi: window.__zoneTap(document.getElementById("convFpSendBtn")),
        micro,
      };
      return r;
    });
    // RÉINJECTION : sur le code d'avant, back 36×36, action 34×34, envoi 40×40.
    // En largeur, les actions de l'en-tête sont à 4 px l'une de l'autre : on
    // n'y gagne que 2 px de chaque côté (38), la hauteur porte les 44 px.
    for (const [k, v] of Object.entries(z)) {
      expect(v.h, k + " : hauteur tapable").toBeGreaterThanOrEqual(44);
      expect(v.w, k + " : largeur tapable").toBeGreaterThanOrEqual(38);
    }
    // LOT-32 (audit UX/UI du 2026-11-10, MSG-C67) : « ← » et les actions de
    // l'en-tête sont DESSINÉS à 44 px (ils l'étaient à 36 et 34, agrandis par un
    // ::after) ; l'envoi garde sa taille.
    expect(z.back.visuelW).toBe(44);
    expect(z.action.visuelW).toBe(44);
    expect(z.envoi.visuelW).toBe(40);
    // Les voisins ne se volent pas leurs taps : le centre de chacun reste à lui.
    const centres = await page.evaluate(() => [".conv-fp-back", ".conv-action-btn", "#convFpSendBtn"].map((s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return t === e || e.contains(t); }));
    expect(centres).toEqual([true, true, true]);
  });

  test("D-02 ③ outil 😊 du composeur de commentaire et « × » des bobines : 44 px tapables", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    const id = await page.evaluate(() => (state.seed.posts || [])[0].id);
    await page.evaluate((pid) => openComments(pid), id);
    await page.waitForTimeout(300);
    const outil = await page.evaluate(() => { const b = document.querySelector("#modalContent .cmt-tool-btn"); return b ? window.__zoneTap(b) : null; });
    expect(outil).not.toBeNull();
    // RÉINJECTION : sur le code d'avant, 38×38.
    expect(outil.h).toBeGreaterThanOrEqual(44);
    expect(outil.visuelH).toBe(38);
    await page.evaluate(() => closeModal());
    await page.evaluate(() => { try { openReels(); } catch (e) {} });
    await page.waitForTimeout(600);
    const croix = await page.evaluate(() => { const b = document.querySelector(".reels-close"); return b ? window.__zoneTap(b) : null; });
    expect(croix).not.toBeNull();
    expect(croix.w).toBeGreaterThanOrEqual(44);
    expect(croix.h).toBeGreaterThanOrEqual(44);
    // LOT-14 (BOB-C14) : la croix du lecteur est désormais VISIBLEMENT de 44 px.
    expect(croix.visuelW).toBe(44);
    await page.evaluate(() => { try { closeReels(); } catch (e) {} });
  });

  test("D-02 ④ · D-04 pastille 📷 d'une passion : 44 px tapables, un nom, tabulable", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(SONDE);
    await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const b = document.querySelector("#passionManager .passion-photo-badge"); return b ? Object.assign(window.__zoneTap(b), { label: b.getAttribute("aria-label"), role: b.getAttribute("role"), tab: b.getAttribute("tabindex") }) : null; });
    expect(r, "la pastille est rendue dans « Mes passions »").not.toBeNull();
    // RÉINJECTION : sur le code d'avant, 20×20 et aucun nom.
    expect(r.w).toBeGreaterThanOrEqual(44);
    expect(r.h).toBeGreaterThanOrEqual(44);
    // LOT-16 (PRO-C13) : le badge passe à 28 px (zone de 44 px inchangée) ; 17 px dans la carte v8.
    expect(r.visuelW).toBeLessThanOrEqual(28);
    expect(r.label).toMatch(/photo/i);
    expect(r.role).toBe("button");
    expect(r.tab).toBe("0");
  });

  test("D-03 « Modifier le profil » : aucun champ sous 16 px (zoom iOS)", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { goTo("profiles"); openEditMainProfile(); });
    await page.waitForTimeout(400);
    const petits = await page.evaluate(() => [...document.querySelectorAll("#modalContent input, #modalContent textarea, #modalContent select")].filter((e) => e.type !== "file" && e.type !== "checkbox" && e.offsetParent !== null).map((e) => ({ el: e.className || e.id, fs: parseFloat(getComputedStyle(e).fontSize) })).filter((x) => x.fs < 16));
    // RÉINJECTION : sur le code d'avant, 7 champs `.rs-link-input` à 12 px.
    expect(petits).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll("#modalContent .rs-link-input").length)).toBeGreaterThanOrEqual(4);
  });

  test("D-04 noms accessibles : bouton d'envoi d'un message et « × » dupliqués des modales", async ({ page }) => {
    await bootOnboarded(page);
    expect(await page.evaluate(() => document.getElementById("convFpSendBtn").getAttribute("aria-label"))).toMatch(/Envoyer/);
    await page.evaluate(() => openNewMessage());
    await page.waitForTimeout(200);
    // LOT-17 (TRA-C22) : la croix en DOUBLE (`span.modal-close` des gabarits) est
    // retirée — il ne reste que celle d'`openModal`, un bouton nommé.
    const croix = await page.evaluate(() => [...document.querySelectorAll("#modalContent .modal-close")].map((s) => s.tagName + ":" + s.getAttribute("aria-label")));
    expect(croix).toEqual(["BUTTON:Fermer"]);
    // Et le source : plus aucun `<span class="modal-close"` sans nom dans les app-0*.
    const dossier = path.join(__dirname, "..", "..", "js");
    const sansNom = fs.readdirSync(dossier).filter((f) => /^app-0\d/.test(f)).flatMap((f) => (fs.readFileSync(path.join(dossier, f), "utf8").match(/<span class="modal-close" onclick=/g) || []).map(() => f));
    expect(sansNom).toEqual([]);
  });

  test("D-05 la photo de groupe dans la liste Messages passe par _cssUrl (source)", async () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-04-comments-shop.js"), "utf8");
    // RÉINJECTION : sur le code d'avant, `background:url(${passioThumb(c.groupPhoto, 192)})`.
    expect(src).not.toMatch(/background:url\(\$\{passioThumb\(c\.groupPhoto, 192\)\}\)/);
    expect(src).toMatch(/background:url\('\$\{_cssUrl\(passioThumb\(c\.groupPhoto, 192\)\)/);
  });
});
