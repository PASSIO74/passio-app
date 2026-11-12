// ═══════════════════════════════════════════════════════════════════════════
// LOT-10 (audit UX/UI du 2026-11-10) — LES SEPT CONSTATS GRAVES RESTÉS HORS LOTS
//   ① BOB-C01 : écrire un commentaire de bobine ne fait plus défiler les bobines.
//   ② BOB-C02 : une bobine photo s'ouvre avec sa photo.
//   ③ CRE-C01 : après un média retiré, le Studio publie un texte seul.
//   ④ IRL-C51 : en ligne, la discussion non ouverte ne dit plus « hors connexion ».
//   ⑤ PAR-C04 : un lien qu'on n'a pas pu copier reste dans un champ, sélectionné.
//   ⑥ PAR-C06 : un repartage montre l'originale et y mène.
//   ⑦ PRO-C02 : le recadreur passe au-dessus de la modale.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① BOB-C01 : l'Espace tapé dans le commentaire d'une bobine reste dans le texte", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => openReels());
  await page.waitForSelector(".reel-item");
  const avant = await page.evaluate(() => reelsState.current);
  const id = await page.locator(".reel-item").first().getAttribute("data-post-id");
  await page.evaluate((i) => openReelComments(i), id);
  const champ = page.locator("#reelCommentsPanel input, #reelCommentsPanel textarea").first();
  await expect(champ).toBeVisible();
  await champ.click();
  await page.keyboard.type("Bonjour à tous");
  await expect(champ).toHaveValue("Bonjour à tous");
  expect(await page.evaluate(() => reelsState.current), "la bobine n'a pas changé").toBe(avant);
});

test("② BOB-C02 : une bobine photo (champ `image`) s'ouvre avec sa photo", async ({ page }) => {
  await bootOnboarded(page);
  const html = await page.evaluate(() => reelMediaHTML({ id: "r_photo", isReel: true, type: "photo", image: "https://example.com/photo-bobine.jpg", passion: "musique" }));
  expect(html).toContain("<img");
  expect(html).toContain("photo-bobine.jpg");
});

test("③ CRE-C01 : photo ajoutée puis retirée, le texte seul se publie", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window.supaPublishPostWithRetry = async () => true;
    goTo("studio");
    studioType = "photo";           // le format du dernier média resté en mémoire
    photoDataUrl = null;            // …mais la photo a été retirée
    document.getElementById("postText").value = "Ce soir on joue au parc, venez !";
    const avant = (state.userPosts || []).length;
    await publishPost();
    return { toasts: window.__toasts, publies: (state.userPosts || []).length - avant, type: studioType };
  });
  expect(r.toasts.join(" | ")).not.toContain("Ajoute une photo");
  expect(r.publies, "le texte est publié").toBe(1);
});

test("④ IRL-C51 : en ligne, une discussion pas encore ouverte le dit — jamais « hors connexion »", async ({ page }) => {
  await bootOnboarded(page);
  const t = await page.evaluate(async () => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (x) { window.__toasts.push(String(x)); try { return vrai.apply(this, arguments); } catch (e) {} };
    const ev = { id: "ev_l10", title: "Jam", passion: "musique", organizerId: "u_lea", date: Date.now() + 86400000, attendees: [MY_UID], maybes: [], waitlist: [], convId: null };
    state.seed.events = [ev];
    state.user.joinedEvents = ["ev_l10"];
    state.user.eventRsvp = { ev_l10: "going" };
    window._joinEventConversation = async () => {};   // le serveur n'a pas de discussion
    await openEventChat("ev_l10");
    return window.__toasts;
  });
  expect(t.join(" | ")).not.toContain("hors connexion");
  expect(t.join(" | ")).toContain("pas encore ouverte");
});

test("⑤ PAR-C04 : copie refusée — le lien est dans un champ sélectionné, avec « Copier »", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("Write permission denied")) } });
    copyReelLink("r1", encodeURIComponent("https://passio-app.netlify.app/?plk=abc#reel=r1"));
  });
  const champ = page.locator("#feuilleConfirmation #feuilleConfirmationChamp");
  await expect(champ).toHaveValue("https://passio-app.netlify.app/?plk=abc#reel=r1");
  expect(await champ.evaluate((el) => el.readOnly)).toBe(true);
  await expect(page.locator('#feuilleConfirmation [data-conf="copier"]')).toBeVisible();
});

test("⑥ PAR-C06 : un repartage montre l'originale (vignette, auteur) et y mène", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const orig = { id: "pa_orig", authorId: "u_lea", authorName: "Léa Fontaine", authorEmoji: "🎸", passion: "musique", type: "photo", image: "https://example.com/concert.jpg", text: "Le concert de samedi était incroyable", createdAt: Date.now() - 5000, likes: 0, comments: [] };
    state.supabasePosts = [orig];
    const rep = { id: "pa_rep", authorId: MY_UID, authorName: "Moi", passion: "musique", type: "text", text: "📤 A partagé un post\n\n🎸 Léa Fontaine – Musique\n\n\"Le concert…\"", sharedReel: "pa_orig", sharedReelData: { id: "pa_orig", authorName: "Léa Fontaine", authorEmoji: "🎸", passion: "musique", text: "Le concert de samedi était incroyable" }, createdAt: Date.now(), likes: 0, comments: [] };
    const div = document.createElement("div");
    div.innerHTML = renderPostHTML(rep);
    document.body.appendChild(div);
    const c = div.querySelector(".post-citee");
    window.__ouvert = null;
    window.openPost = (id) => { window.__ouvert = id; };
    window.openFeedPost = (id) => { window.__ouvert = id; };
    if (c) c.click();
    return { citee: !!c, image: !!(c && c.querySelector("img.post-citee-media")), auteur: c ? c.textContent : "", emojiBrut: div.textContent.includes("📤"), ouvert: window.__ouvert };
  });
  expect(r.citee).toBe(true);
  expect(r.image, "la photo de l'originale").toBe(true);
  expect(r.auteur).toContain("Léa Fontaine");
  expect(r.emojiBrut, "plus de « 📤 A partagé » en clair").toBe(false);
  expect(r.ouvert, "toucher la carte ouvre l'ORIGINALE").toBe("pa_orig");
});

test("⑦ PRO-C02 : le recadreur s'ouvre au-dessus de « Modifier le profil »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    openEditMainProfile();
    passioOpenCropper("data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"/>'), { aspect: 3, title: "Recadrer la couverture" }).catch(() => {});
    const ov = document.querySelector(".passio-cropper-ov");
    const b = ov.getBoundingClientRect();
    const sous = document.elementFromPoint(b.left + b.width / 2, b.top + 30);
    return { auDessus: !!(sous && ov.contains(sous)), modaleOuverte: !!document.querySelector("#modalBackdrop.active") };
  });
  expect(r.modaleOuverte, "prémisse : la modale est ouverte").toBe(true);
  expect(r.auDessus, "le recadreur est au premier plan").toBe(true);
});
