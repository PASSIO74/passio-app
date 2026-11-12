// ═══════════════════════════════════════════════════════════════════════════
// LOT-4 (audit UX/UI du 2026-11-10) — UNE MESSAGERIE FIABLE ET CONFORTABLE
//   ① MSG-C01 : épingle, archive, sourdine, fond, description survivent au
//        remplacement par le serveur au démarrage, et à un vrai rechargement.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUTRE = "11111111-2222-4333-8444-555555555555";

async function poserConv(page, cid, extra) {
  await page.evaluate(([id, autre, ex]) => {
    const maintenant = Date.now();
    const convs = getConversations();
    convs.push(Object.assign({
      id, userId: autre, userName: "Camille",
      messages: [{ id: id + "_m1", from: "them", text: "Salut", at: maintenant - 60000, status: "sent" }],
      lastAt: maintenant - 60000, unread: 0,
    }, ex || {}));
    saveConversationsNow();
  }, [cid, AUTRE, extra]);
}

test.describe("① MSG-C01 : les réglages d'une conversation tiennent", () => {
  const CID = "conv_lot4_reglages";
  const REGLAGES = { pinned: true, archived: true, _muted: true, bg: "linear-gradient(#fff,#eee)", groupDesc: "Les jams du jeudi" };

  test("le remplacement par le serveur au démarrage ne les efface pas", async ({ page }) => {
    await bootOnboarded(page);
    await poserConv(page, CID, REGLAGES);
    await page.evaluate(([id, autre]) => {
      window.supaLoadMyConversations = async () => [{
        id, userId: autre, userName: "Camille",
        messages: [{ id: id + "_m1", from: "them", text: "Salut", at: Date.now() - 60000, status: "sent" }],
        lastAt: Date.now() - 60000, unread: 0, fromSupabase: true,
      }];
    }, [CID, AUTRE]);
    await page.evaluate(() => _rafraichirConversationsServeur());
    const c = await page.evaluate((id) => {
      const x = getConversations().find((y) => y.id === id) || {};
      return { pinned: x.pinned, archived: x.archived, _muted: x._muted, bg: x.bg, groupDesc: x.groupDesc };
    }, CID);
    expect(c).toEqual(REGLAGES);
  });

  test("la coupure rend l'ancien comportement (retour arrière)", async ({ page }) => {
    await bootOnboarded(page);
    await poserConv(page, CID, REGLAGES);
    await page.evaluate(([id, autre]) => {
      localStorage.setItem("passio_conv_prefs_boot", "0");
      window.supaLoadMyConversations = async () => [{ id, userId: autre, userName: "Camille", messages: [], lastAt: Date.now(), unread: 0 }];
    }, [CID, AUTRE]);
    await page.evaluate(() => _rafraichirConversationsServeur());
    expect(await page.evaluate((id) => !!(getConversations().find((y) => y.id === id) || {}).pinned, CID)).toBe(false);
  });

  test("un vrai rechargement les rend", async ({ page }) => {
    await bootOnboarded(page);
    await poserConv(page, CID, REGLAGES);
    await page.reload();
    await page.waitForFunction(() => typeof getConversations === "function" && getConversations().length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const c = await page.evaluate((id) => {
      const x = getConversations().find((y) => y.id === id) || {};
      return { pinned: x.pinned, archived: x.archived, _muted: x._muted, bg: x.bg, groupDesc: x.groupDesc };
    }, CID);
    expect(c).toEqual(REGLAGES);
  });
});

// ─── Une conversation de banc, ouverte pleine page ─────────────────────────
async function ouvrirConv(page, cid, messages) {
  await page.evaluate(([id, autre, msgs]) => {
    const convs = getConversations();
    const i = convs.findIndex((x) => x.id === id); if (i >= 0) convs.splice(i, 1);
    convs.push({ id, userId: autre, userName: "Camille", userEmoji: "🎸", userColor: "#7c3aed", unread: 0, messages: msgs, lastAt: Date.now() });
    saveConversationsNow();
  }, [cid, AUTRE, messages]);
  await page.evaluate((id) => openConversation(id), cid);
  await expect(page.locator("#conv-fullpage.active")).toBeVisible();
  await page.waitForTimeout(450);
}

function contraste(c1, c2) {
  const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const a = lum(c1), b = lum(c2); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("② MSG-C50 : mon vocal, mon document et ma position restent lisibles dans ma bulle", async ({ page }) => {
  await bootOnboarded(page);
  const t = Date.now();
  await ouvrirConv(page, "conv_lot4_media", [
    { id: "v1", from: "me", text: "", voiceData: "data:audio/webm;base64,AAAA", voiceDuration: 7, at: t - 3000, status: "sent" },
    { id: "d1", from: "me", text: "", docData: "data:application/pdf;base64,AAAA", fileName: "programme.pdf", fileType: "PDF", fileSize: "12 Ko", at: t - 2000, status: "sent" },
    { id: "l1", from: "me", text: "", location: { lat: 45.7485, lng: 4.8467, url: "https://maps.google.com/?q=45.7485,4.8467" }, at: t - 1000, status: "sent" },
  ]);
  const r = await page.evaluate(() => ["v1", "d1", "l1"].map((id) => {
    const b = document.querySelector('#convFpThread .conv-bubble-wrap[data-mid="' + id + '"] .conv-bubble');
    // Fond effectif : on remonte jusqu'au premier fond posé.
    let el = b, fond = "rgba(0, 0, 0, 0)";
    while (el) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage !== "none") { fond = "img:" + cs.backgroundImage; break; }
      if (!/rgba\(.*,\s*0\)$/.test(cs.backgroundColor) && cs.backgroundColor !== "transparent") { fond = cs.backgroundColor; break; }
      el = el.parentElement;
    }
    return { id, fond, couleur: getComputedStyle(b).color };
  }));
  for (const x of r) {
    if (x.fond.startsWith("img:")) {
      // Fond en dégradé : celui de MA bulle violette, sur lequel le blanc est lisible.
      expect(x.fond, x.id).toMatch(/gradient/);
    } else {
      expect(contraste(x.couleur, x.fond), x.id + " " + x.couleur + " sur " + x.fond).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test.describe("③ MSG-C52", () => {
  // Service worker bloqué : sinon il sert l'image hors des routes du banc, et la
  // route lente ne s'applique pas.
  test.use({ serviceWorkers: "block" });
test("③ MSG-C52 : un média qui finit de charger ne laisse pas le dernier message sous le pli", async ({ page }) => {
  await bootOnboarded(page);
  // Une image servie en 900 ms : elle arrive APRÈS les recalages de l'ouverture
  // (immédiat, puis 320 ms) — le cas d'une photo sur un réseau mobile.
  await page.route("**/lot4-photo-lente.svg", async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><rect width="200" height="400" fill="#7c3aed"/></svg>' });
  });
  const svg = (await page.evaluate(() => location.origin)) + "/lot4-photo-lente.svg";
  const t = Date.now();
  const msgs = [];
  for (let i = 0; i < 14; i++) msgs.push({ id: "t" + i, from: i % 2 ? "me" : "them", text: "Message " + i, at: t - 100000 + i * 1000, status: "sent" });
  msgs.push({ id: "p1", from: "them", text: "", gif: svg, at: t - 5000, status: "sent" });
  msgs.push({ id: "fin", from: "them", text: "Dernier message", at: t - 1000, status: "sent" });
  await ouvrirConv(page, "conv_lot4_pli", msgs);
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => {
    const th = document.getElementById("convFpThread");
    const img = document.querySelector('#convFpThread .conv-bubble-wrap[data-mid="p1"] img');
    const d = document.querySelector('#convFpThread .conv-bubble-wrap[data-mid="fin"]').getBoundingClientRect();
    return { chargee: !!(img && img.complete && img.naturalHeight > 0), reste: Math.round(th.scrollHeight - th.scrollTop - th.clientHeight), finVisible: d.bottom <= th.getBoundingClientRect().bottom + 1 };
  });
  expect(r.chargee, "prémisse : l'image a fini de charger après l'ouverture").toBe(true);
  expect(r.reste, "reste sous le bas").toBeLessThanOrEqual(2);
  expect(r.finVisible).toBe(true);
});
});

test("④ MSG-C55 : un message reçu pendant la relecture ne ramène pas en bas ; une pastille le dit et y ramène", async ({ page }) => {
  await bootOnboarded(page);
  const t = Date.now();
  const msgs = [];
  for (let i = 0; i < 38; i++) msgs.push({ id: "h" + i, from: i % 2 ? "me" : "them", text: "Historique " + i + " — une ligne assez longue pour remplir le fil", at: t - 400000 + i * 1000, status: "sent" });
  await ouvrirConv(page, "conv_lot4_relecture", msgs);
  // Je remonte relire : bien plus d'un écran.
  await page.evaluate(() => { const th = document.getElementById("convFpThread"); th.scrollTop = 80; th.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(150);
  await expect(page.locator("#convFpBas"), "remonté de plus d'un écran : un retour rapide").toBeVisible();
  const avant = await page.evaluate(() => document.getElementById("convFpThread").scrollTop);
  await page.evaluate(([autre]) => _handleIncomingConvMessage({
    id: "entrant_1", conv_id: "conv_lot4_relecture", from_id: autre, content: "Tu viens jeudi ?",
    created_at: new Date().toISOString().replace("Z", ""),
  }), [AUTRE]);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (getConversations().find((c) => c.id === "conv_lot4_relecture").messages || []).some((m) => m.id === "entrant_1")), "prémisse : le message est arrivé").toBe(true);
  const apres = await page.evaluate(() => document.getElementById("convFpThread").scrollTop);
  expect(Math.abs(apres - avant), "la lecture n'est pas arrachée").toBeLessThanOrEqual(4);
  await expect(page.locator("#convFpBas")).toHaveText("1 nouveau message ↓");
  const b = await page.locator("#convFpBas").boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(44);
  await page.locator("#convFpBas").click();
  const r = await page.evaluate(() => { const th = document.getElementById("convFpThread"); return Math.round(th.scrollHeight - th.scrollTop - th.clientHeight); });
  expect(r).toBeLessThanOrEqual(2);
  await expect(page.locator("#convFpBas")).toBeHidden();
});

test("⑤ MSG-C56 : ma position ne part qu'après « Envoyer ma position »", async ({ page }) => {
  await bootOnboarded(page);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 45.7485, longitude: 4.8467 });
  await ouvrirConv(page, "conv_lot4_pos", []);
  await page.evaluate(() => { window.__envois = []; window._sendTextToSupa = (cid, mid) => { window.__envois.push(mid); }; });
  const nb = () => page.evaluate(() => (getConversations().find((c) => c.id === "conv_lot4_pos").messages || []).length);
  await page.evaluate(() => shareLocation());
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toBeVisible();
  await expect(feuille).toContainText("Camille");
  await expect(feuille).toContainText("45.74850, 4.84670");
  expect(await nb(), "rien ne part avant la confirmation").toBe(0);
  await feuille.locator('[data-conf="annuler"]').click();
  await expect(feuille).toHaveCount(0);
  expect(await nb(), "Annuler : rien ne part").toBe(0);
  await page.evaluate(() => shareLocation());
  await page.locator('#feuilleConfirmation [data-conf="envoyer"]').click();
  expect(await nb()).toBe(1);
  expect(await page.evaluate(() => window.__envois.length), "l'envoi suit le chemin commun").toBe(1);
});

test("⑥ MSG-C58 : « Supprimer… » explique les deux portées et ne supprime qu'au choix", async ({ page }) => {
  await bootOnboarded(page);
  const t = Date.now();
  await ouvrirConv(page, "conv_lot4_suppr", [
    { id: "s_moi", from: "me", text: "Mon message", at: t - 2000, status: "sent" },
    { id: "s_eux", from: AUTRE, text: "Son message", at: t - 1000, status: "sent" },
  ]);
  const ids = () => page.evaluate(() => getConversations().find((c) => c.id === "conv_lot4_suppr").messages.map((m) => m.id));
  // Le menu n'a plus qu'UNE entrée de suppression.
  await page.evaluate(() => _openMsgActions("conv_lot4_suppr", "s_moi"));
  const libelles = await page.evaluate(() => [...document.querySelectorAll("#modalContent .csetting-label")].map((e) => e.textContent.trim()));
  expect(libelles.filter((l) => /^Supprimer/.test(l))).toEqual(["Supprimer…"]);
  await page.evaluate(() => _demanderSuppressionMsg("conv_lot4_suppr", "s_moi"));
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toContainText("reste visible chez Camille");
  await expect(feuille).toContainText("disparaît aussi chez Camille");
  await expect(feuille.locator('[data-conf="tous"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(feuille).toHaveCount(0);
  expect(await ids(), "Échap : rien n'est supprimé").toEqual(["s_moi", "s_eux"]);
  // Un message reçu : seulement « pour moi ».
  await page.evaluate(() => _demanderSuppressionMsg("conv_lot4_suppr", "s_eux"));
  await expect(feuille.locator('[data-conf="tous"]')).toHaveCount(0);
  await feuille.locator('[data-conf="moi"]').click();
  expect(await ids()).toEqual(["s_moi"]);
});

test("⑦ MSG-C08 / MSG-C09 : la fenêtre des membres dit vrai ; « Retirer » se confirme, en 44 px", async ({ page }) => {
  await bootOnboarded(page);
  const moi = await page.evaluate(() => MY_UID);
  const LEA = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", MALIK = "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbb02", NINA = "cccccccc-3333-4ccc-8ccc-cccccccccc03";
  await page.evaluate(([me, lea, malik, nina]) => {
    _profileCache.set(lea, { username: "Léa", emoji: "🎻", color: "#7c3aed" });
    _profileCache.set(malik, { username: "Malik", emoji: "🥁", color: "#0f766e" });
    _profileCache.set(nina, { username: "Nina", emoji: "🎨", color: "#b45309" });
    const cs = getConversations();
    // Comme le serveur la rend : `userIds` m'inclut.
    cs.push({ id: "grp_lot4", isGroup: true, groupName: "Jam du jeudi", userIds: [me, lea, malik, nina], createdBy: me, messages: [], lastAt: Date.now(), unread: 0 });
    cs.push({ id: "grp_lot4_autre", isGroup: true, groupName: "Atelier", userIds: [me, lea, malik], createdBy: lea, messages: [], lastAt: Date.now(), unread: 0 });
    saveConversationsNow();
  }, [moi, LEA, MALIK, NINA]);
  await page.evaluate(() => showGroupMembers("grp_lot4"));
  const m = page.locator("#modalContent");
  await expect(m).toContainText("4 membres");
  await expect(m.locator("#grpTab_members")).toHaveText("Membres (4)");
  await expect(m).not.toContainText("En ligne");
  await expect(m).not.toContainText("Admin");
  expect(await m.locator(".grp-membre").count(), "tous les membres listés, même hors du socle de démonstration").toBe(3);
  await expect(m).toContainText("A créé le groupe");
  const retirer = m.locator('.grp-membre[data-membre="' + MALIK + '"] .grp-retirer');
  expect((await retirer.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => { window.__retraits = []; window.removeGroupMember = (c, u) => { window.__retraits.push(u); return Promise.resolve(true); }; });
  await retirer.click();
  await expect(page.locator("#feuilleConfirmation")).toContainText("Retirer Malik du groupe ?");
  expect(await page.evaluate(() => window.__retraits.length), "rien avant la confirmation").toBe(0);
  await page.locator('#feuilleConfirmation [data-conf="retirer"]').click();
  expect(await page.evaluate(() => window.__retraits)).toEqual([MALIK]);
  // Un groupe que je n'ai pas créé : ni « Retirer », ni « Ajouter » ; la créatrice est nommée.
  await page.evaluate(() => { closeModal(); showGroupMembers("grp_lot4_autre"); });
  await expect(m).toContainText("3 membres");
  await expect(m.locator(".grp-retirer")).toHaveCount(0);
  await expect(m.locator("#grpTab_add")).toHaveCount(0);
  await expect(m.locator('.grp-membre[data-membre="' + LEA + '"]')).toContainText("A créé le groupe");
});

test("⑧ MSG-C06 : « lea » trouve « Léa », « ines » trouve « Inès » (liste et nouveau message)", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    const cs = getConversations();
    cs.push({ id: "c_lea", userId: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", userName: "Léa Fontaine", messages: [{ id: "x1", from: "them", text: "À jeudi au café", at: Date.now() - 1000 }], lastAt: Date.now(), unread: 0 });
    cs.push({ id: "c_ines", userId: "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbb02", userName: "Inès", messages: [], lastAt: Date.now() - 5000, unread: 0 });
    saveConversationsNow();
    goTo("messages");
  });
  const liste = (q) => page.evaluate((qq) => {
    window._msgSearchQuery = qq; renderMessages();
    return [...document.querySelectorAll(".msg-card .msg-name")].map((e) => e.textContent).join(" | ");
  }, q);
  expect(await liste("lea f")).toContain("Léa Fontaine");
  expect(await liste("ines")).toContain("Inès");
  expect(await liste("a jeudi au cafe"), "le texte d'un message aussi").toContain("Léa Fontaine");
  await page.evaluate(() => { window._msgSearchQuery = ""; window.supaSearchUsers = async () => []; });
  // Nouveau message : les contacts récents.
  const nm = await page.evaluate(() => { openNewMessage(); _nmDoSearch("lea"); return document.getElementById("_nmResults").textContent; });
  expect(nm).toContain("Léa Fontaine");
});

// ─── Le micro : un faux flux, un vrai MediaRecorder ────────────────────────
async function poserMicro(page, delaiMs) {
  await page.evaluate((d) => {
    window.__vocaux = [];
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window._sendVoiceMessage = (url, dur) => { window.__vocaux.push(dur); };
    window._pjEnvoiPermis = () => true;
    navigator.mediaDevices.getUserMedia = () => new Promise((ok) => setTimeout(() => {
      const ac = new AudioContext(); const o = ac.createOscillator(); const dst = ac.createMediaStreamDestination();
      o.connect(dst); o.start(); ok(dst.stream);
    }, d));
  }, delaiMs);
}

test("⑨ MSG-C53 : un toucher bref sur le micro ne capte rien et dit quoi faire", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrirConv(page, "conv_lot4_micro", []);
  await poserMicro(page, 500);
  const b = await page.locator("#btnVoice").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window._isRecording), "aucun enregistrement sans doigt posé").toBe(false);
  await expect(page.locator("#voiceRecordBar")).not.toHaveClass(/active/);
  expect(await page.evaluate(() => window.__toasts.some((t) => /Maintiens le micro/.test(t)))).toBe(true);
  // Le toucher suivant n'envoie rien d'un enregistrement fantôme.
  await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__vocaux)).toEqual([]);
});

test("⑩ MSG-C54 : maintenir puis relâcher envoie ; glisser à gauche puis relâcher annule, et la barre le dit", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrirConv(page, "conv_lot4_micro2", []);
  await poserMicro(page, 50);
  const b = await page.locator("#btnVoice").boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  // Maintenir 1,3 s puis relâcher sur place : envoyé.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await expect(page.locator("#voiceRecordBar")).toHaveClass(/active/);
  await expect(page.locator("#voiceRecordConsigne")).toHaveText(/Relâche pour envoyer/);
  await expect(page.locator("#btnVoice")).toHaveClass(/record-active/);
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__vocaux.length), "relâcher envoie").toBe(1);
  // Maintenir, glisser de 150 px vers la gauche, relâcher : annulé.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.move(cx - 150, cy, { steps: 6 });
  await expect(page.locator("#voiceRecordConsigne")).toHaveText("Relâche pour annuler");
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__vocaux.length), "glisser puis relâcher n'envoie rien").toBe(1);
  expect(await page.evaluate(() => window._isRecording)).toBe(false);
  const annuler = await page.evaluate(() => { const bar = document.getElementById("voiceRecordBar"); bar.classList.add("active"); const r = bar.querySelector(".voice-annuler").getBoundingClientRect(); bar.classList.remove("active"); return { h: r.height, w: r.width }; });
  expect(annuler.h).toBeGreaterThanOrEqual(44);
});

for (const largeur of [390, 360]) {
  test(`⑪ MSG-C60 ${largeur} px : le champ de saisie s'élargit ; un seul bouton rond, micro vide / envoi avec texte`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 800 });
    await bootOnboarded(page);
    await ouvrirConv(page, "conv_lot4_champ", []);
    const mesure = () => page.evaluate(() => ({
      champ: Math.round(document.getElementById("convFpInput").getBoundingClientRect().width),
      micro: getComputedStyle(document.getElementById("btnVoice")).display !== "none",
      envoi: getComputedStyle(document.getElementById("convFpSendBtn")).display !== "none",
      gif: !!document.querySelector('#conv-fullpage .conv-toolbar [aria-label="Ajouter un GIF"]'),
    }));
    const vide = await mesure();
    expect(vide.gif, "le bouton GIF séparé a disparu").toBe(false);
    expect([vide.micro, vide.envoi], "champ vide : le micro").toEqual([true, false]);
    expect(vide.champ).toBeGreaterThanOrEqual(largeur === 390 ? 220 : 190);
    await page.locator("#convFpInput").fill("Bonjour");
    const plein = await mesure();
    expect([plein.micro, plein.envoi], "avec du texte : l'envoi").toEqual([false, true]);
  });
}
