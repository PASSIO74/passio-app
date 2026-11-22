// ═══════════════════════════════════════════════════════════════════════════
// LOT-20 (audit UX/UI du 2026-11-10) — MESSAGERIE
//   ① MSG-C61 : séparateurs de jour en jours CALENDAIRES (un seul « Aujourd'hui »,
//      « Hier » = hier).
//   ② MSG-C62 : pas de « ✓ » sur un message non parti ; « Non envoyé · réessayer »
//      est une cible de 44 px nommée.
//   ③ MSG-C12 / C66 : aperçus et citations par TYPE, jamais l'étiquette
//      technique ; « Copier le texte » seulement sur du texte.
//   ④ MSG-C67 / C51 / C83 : liens cliquables (http(s) seulement, échappés),
//      fichier audio local en carte, tailles en Ko.
//   ⑤ MSG-C19 / C32 : état vide juste, avec une action ; une lecture lente
//      n'est pas « Aucune conversation ».
//   ⑥ MSG-C59 / C11 : Entrée sur clavier tactile ne part pas ; photo de groupe
//      sans erreur JavaScript.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window._convNetLoaded = true;
    window.__t = [];
    const t0 = window.toast;
    window.toast = function (m) { window.__t.push(String(m)); try { return t0.apply(this, arguments); } catch (e) { return null; } };
  });
}

async function ouvrir(page, conv) {
  await page.evaluate(async (c) => {
    conversationsState = [c];
    goTo("messages");
    await openConversation(c.id);
  }, conv);
  await page.waitForSelector("#convFpThread");
}

const minuit = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

test("① MSG-C61 : un seul « Aujourd'hui », et « Hier » est hier", async ({ page }) => {
  await boot(page);
  const m0 = await page.evaluate(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); });
  await ouvrir(page, {
    id: "c_l20_jours", userId: "a1b2c3d4-0000-4000-8000-00000000c0a1", userName: "Léa", lastAt: Date.now(), unread: 0,
    messages: [
      { id: "j1", from: "u_lea", text: "le jour d'avant", at: m0 - 864e5 - 6 * 3600e3 },
      { id: "j2", from: "u_lea", text: "hier soir", at: m0 - 2 * 3600e3 },
      { id: "j3", from: "u_lea", text: "ce matin", at: m0 + 60e3 },
    ],
  });
  const seps = await page.evaluate(() => {
    const t = document.getElementById("convFpThread").innerText;
    return { aujourdhui: (t.match(/Aujourd'hui/g) || []).length, hier: (t.match(/\bHier\b/g) || []).length, texte: t };
  });
  expect(seps.aujourdhui, "un seul « Aujourd'hui »").toBe(1);
  expect(seps.hier).toBe(1);
  const ordre = seps.texte.indexOf("Hier") < seps.texte.indexOf("hier soir") && seps.texte.indexOf("hier soir") < seps.texte.indexOf("Aujourd'hui");
  expect(ordre, "« hier soir » est rangé sous « Hier »").toBe(true);
});

test("② MSG-C62 : pas de « ✓ » sur un message non parti ; « réessayer » est une cible nommée de 44 px", async ({ page }) => {
  await boot(page);
  await ouvrir(page, {
    id: "c_l20_echec", userId: "a1b2c3d4-0000-4000-8000-00000000c0a1", userName: "Léa", lastAt: Date.now(), unread: 0,
    messages: [{ id: "e1", from: "me", text: "bonjour", at: Date.now() - 1000, status: "failed" }],
  });
  const r = await page.evaluate(() => {
    const st = document.querySelector('#convFpThread [data-msgst="e1"] .msg-st-echec');
    const heure = st && st.closest(".conv-bubble-time");
    const b = st && st.getBoundingClientRect();
    return { nom: st && st.getAttribute("aria-label"), texte: st && st.textContent, h: b && b.height, coche: heure ? /✓/.test(heure.textContent) : null };
  });
  expect(r.texte).toBe("Non envoyé · réessayer");
  expect(r.nom).toBe("Message non envoyé — réessayer");
  expect(r.h).toBeGreaterThanOrEqual(44);
  expect(r.coche, "aucune coche d'envoi sur un échec").toBe(false);
});

test("③ MSG-C12 / C66 : aperçus et citations par type ; « Copier le texte » seulement sur du texte", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    doc: _msgPreviewText({ text: "[DOC] topo-falaise.pdf" }),
    audio: _msgPreviewText({ text: "[AUDIO] maquette-refrain.mp3" }),
    vocal: _msgPreviewText({ text: "[AUDIO] Message vocal (14s)" }),
    photo: _msgPreviewText({ text: "[MEDIA] atelier.jpg" }),
    position: _msgPreviewText({ text: "📍 Ma position : https://maps.google.com/?q=45.75,4.85" }),
    texte: _msgPreviewText({ text: "On part à 9h" }),
    copiePhoto: _msgEstTexte({ text: "[MEDIA] atelier.jpg" }),
    copieTexte: _msgEstTexte({ text: "On part à 9h" }),
  }));
  expect(r.doc).toBe("Document · topo-falaise.pdf");
  expect(r.audio).toBe("Fichier audio · maquette-refrain.mp3");
  expect(r.vocal).toBe("Message vocal (14s)");
  expect(r.photo).toBe("Photo");
  expect(r.position).toBe("Position");
  expect(r.texte).toBe("On part à 9h");
  expect(r.copiePhoto).toBe(false);
  expect(r.copieTexte).toBe(true);
  // La liste passe par la même autorité.
  await page.evaluate(() => {
    conversationsState = [{ id: "c_l20_liste", userId: "a1b2c3d4-0000-4000-8000-00000000c0a1", userName: "Léa", lastAt: Date.now(), unread: 0,
      messages: [{ id: "l1", from: "u_lea", text: "[DOC] topo-falaise.pdf", at: Date.now() }] }];
    goTo("messages");
    renderMessages();
  });
  await expect(page.locator("#messageList")).toContainText("Document · topo-falaise.pdf");
  await expect(page.locator("#messageList")).not.toContainText("[DOC]");
});

test("④ MSG-C67 / C51 / C83 : liens cliquables et sûrs, fichier audio en carte, tailles en Ko", async ({ page }) => {
  await boot(page);
  await ouvrir(page, {
    id: "c_l20_liens", userId: "a1b2c3d4-0000-4000-8000-00000000c0a1", userName: "Léa", lastAt: Date.now(), unread: 0,
    messages: [
      { id: "k1", from: "u_lea", text: "Billets : https://exemple.passio.test/billet?id=4. À jeudi", at: Date.now() - 3000 },
      { id: "k2", from: "u_lea", text: "piège javascript:alert(1) et <img src=x onerror=alert(2)>", at: Date.now() - 2000 },
      { id: "k3", from: "me", voiceData: "data:audio/wav;base64,AAAA", isFile: true, fileName: "repetition-jeudi.wav", fileSize: "moins de 1 Ko", at: Date.now() - 1000, status: "sent" },
    ],
  });
  const r = await page.evaluate(() => {
    const th = document.getElementById("convFpThread");
    const liens = Array.from(th.querySelectorAll("a.msg-lien")).map((a) => ({ href: a.getAttribute("href"), cible: a.getAttribute("target"), rel: a.getAttribute("rel") }));
    return {
      liens, img: th.querySelectorAll("img[src='x']").length,
      audio: (th.querySelector('[data-mid="k3"]') || th).innerText,
      tailles: [tailleFichierLisible(300), tailleFichierLisible(240 * 1024), tailleFichierLisible(3.2 * 1024 * 1024)],
    };
  });
  expect(r.liens).toEqual([{ href: "https://exemple.passio.test/billet?id=4", cible: "_blank", rel: "noopener noreferrer nofollow" }]);
  expect(r.img, "le HTML d'un message reste du texte").toBe(0);
  expect(r.audio).toContain("repetition-jeudi.wav");
  expect(r.audio).toContain("Fichier audio");
  expect(r.tailles).toEqual(["moins de 1 Ko", "240 Ko", "3,2 Mo"]);
});

test("⑤ MSG-C19 / C32 : état vide juste avec une action ; une lecture lente n'est pas « Aucune conversation »", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    conversationsState = [];
    window._convChargementLent = false;
    goTo("messages");
    renderMessages();
    const e = document.getElementById("messagesEmpty");
    const vide = { titre: e.querySelector(".empty-title").textContent, texte: e.querySelector(".empty-text").textContent, action: (e.querySelector("[data-msg-vide-action]") || {}).textContent };
    window._convChargementLent = true;
    renderMessages();
    const lent = { titre: e.querySelector(".empty-title").textContent, action: (e.querySelector("[data-msg-vide-action]") || {}).textContent };
    window._convChargementLent = false;
    return { vide, lent };
  });
  expect(r.vide.texte).not.toContain("Recherche un utilisateur");
  expect(r.vide.action).toBe("Nouveau message");
  expect(r.lent.titre).toBe("Chargement plus long que prévu…");
  expect(r.lent.action).toBe("Réessayer");
});

test("⑥ MSG-C59 / C11 : Entrée au doigt saute une ligne ; la photo de groupe se pose sans erreur", async ({ page }) => {
  await page.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/pointer:\s*fine/.test(q) ? { matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
  });
  await boot(page);
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e && e.message)));
  await ouvrir(page, { id: "c_l20_tactile", userId: "a1b2c3d4-0000-4000-8000-00000000c0a1", userName: "Léa", lastAt: Date.now(), unread: 0, messages: [] });
  const champ = page.locator("#convFpInput");
  await champ.click();
  await champ.type("ligne un");
  await page.keyboard.press("Enter");
  await champ.type("ligne deux");
  const r = await page.evaluate(() => ({
    valeur: document.getElementById("convFpInput").value,
    indice: document.getElementById("convFpInput").getAttribute("enterkeyhint"),
    envoyes: (conversationsState[0].messages || []).length,
  }));
  expect(r.envoyes, "Entrée n'envoie pas au doigt").toBe(0);
  expect(r.valeur).toBe("ligne un\nligne deux");
  expect(r.indice).toBe("enter");
  // Photo de groupe : plus de ReferenceError (`renderConvList`), et le message dit la portée.
  await page.evaluate(() => {
    conversationsState = [{ id: "g_l20", isGroup: true, groupName: "Groupe", userIds: ["u_lea"], lastAt: Date.now(), unread: 0, messages: [] }];
  });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.evaluate(() => pickGroupPhoto("g_l20"))]);
  await chooser.setFiles({ name: "groupe.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") });
  await page.waitForFunction(() => window.__t.some((t) => /Photo du groupe/.test(t)));
  expect(erreurs.filter((e) => /renderConvList/.test(e))).toEqual([]);
  expect(await page.evaluate(() => window.__t.filter((t) => /Photo du groupe/.test(t)))).toEqual(["Photo du groupe mise à jour sur cet appareil"]);
});
