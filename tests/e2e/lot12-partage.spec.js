// ═══════════════════════════════════════════════════════════════════════════
// LOT-12 (audit UX/UI du 2026-11-10) — LE PARTAGE
//   ① PAR-C07 : une feuille unique pour publication, bobine, activité, profil.
//   ② PAR-C10 / C11 : le message dit de qui est le contenu ; un lien signé le dit.
//   ③ PAR-C13 : « Inviter mes abonnements » — un ×, 44 px, déjà invités, 5 s pour annuler.
//   ④ PAR-C16 : le souvenir rattaché à l'album se voit, se retire, ne survit pas au Studio.
//   ⑤ PAR-C14 : « Partager mon profil » — bouton RETIRÉ le 2026-11-14 (demande de
//      Benjamin) ; voir profil-ergonomie.spec.js ③.
//   ⑥ PAR-C12 : deux portes de partage sur la fiche d'activité, une icône.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① PAR-C07 : publication, bobine, activité et profil ouvrent la même feuille", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const out = {};
    const lire = () => {
      const m = document.getElementById("modalContent");
      return {
        titre: (m.querySelector(".modal-title") || {}).textContent || "",
        envoyer: !!m.querySelector(".partage-btn") && /Envoyer à quelqu'un/.test(m.textContent),
        copier: !!document.getElementById("_partageCopier"),
        republier: /Republier dans mon fil/.test(m.textContent),
        inviter: /Inviter mes abonnements/.test(m.textContent),
        feed: /feed/i.test(m.textContent),
      };
    };
    const post = (state.seed.posts || []).find((p) => !p.isReel);
    sharePost(post.id); out.publication = lire(); closeModal();
    const reel = (state.seed.posts || []).find((p) => p.isReel) || buildReels()[0];
    openReelShareModal(reel.id); out.bobine = lire(); closeModal();
    const ev = (state.seed.events || [])[0];
    shareEvent(ev.id); out.activite = lire(); closeModal();
    shareUserProfile("u_lea", "Léa Moreau"); out.profil = lire(); closeModal();
    return out;
  });
  expect(r.publication).toMatchObject({ titre: expect.stringContaining("Partager cette publication"), envoyer: true, copier: true, republier: true, feed: false });
  expect(r.bobine).toMatchObject({ titre: expect.stringContaining("Partager cette bobine"), envoyer: true, copier: true, republier: true, feed: false });
  expect(r.activite).toMatchObject({ titre: expect.stringContaining("Partager cette activité"), envoyer: true, copier: true, republier: true, inviter: true });
  expect(r.profil).toMatchObject({ titre: expect.stringContaining("Partager ce profil"), envoyer: true, copier: true, republier: false });
});

test("② PAR-C10 / C11 : le message nomme l'auteur ; un lien qui porte mon nom le dit", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    window.__envoye = null;
    window.partagerOuCopier = (d) => { window.__envoye = d; };
    state.supabasePosts = [{ id: "pa_l12", authorName: "Léa Fontaine", authorId: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", type: "text", text: "Chevalet recollé, cordes neuves.", passion: "musique", createdAt: Date.now() }];
    sharePost("pa_l12");
    document.getElementById("_shareOutBtn").click();
    const sansSigne = !document.querySelector("#modalContent .partage-signe");
    ouvrirFeuillePartage({ quoi: "publication", url: "https://passio-app.netlify.app/p/x?inv=abc" });
    const signe = (document.querySelector("#modalContent .partage-signe") || {}).textContent || "";
    return { message: window.__envoye && window.__envoye.text, sansSigne, signe };
  });
  expect(r.message).toBe("Une publication de Léa Fontaine sur PASSIO : « Chevalet recollé, cordes neuves. »");
  expect(r.sansSigne, "un lien sans invitation ne dit rien").toBe(true);
  expect(r.signe).toContain("Le lien porte ton nom");
});

test("③ PAR-C13 : inviter mes abonnements — un seul ×, 44 px, 5 s pour annuler, déjà invités, sortie lien", async ({ page }) => {
  await bootOnboarded(page);
  const AMI = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01";
  await page.evaluate((ami) => {
    window.__notifs = [];
    window.supaInsertNotif = (to) => { window.__notifs.push(to); };
    state.seed.users.push({ id: ami, name: "Léa Fontaine au nom vraiment très long pour la ligne", distant: true });
    state.user.following = [ami];
    const ev = { id: "ev_l12", title: "Jam", passion: "musique", organizerId: MY_UID, date: Date.now() + 86400000, attendees: [MY_UID], maybes: [], waitlist: [] };
    state.seed.events = [ev];
    openEventInvite("ev_l12");
  }, AMI);
  const m = page.locator("#modalContent");
  await expect(m.locator(".modal-title")).toHaveText("Inviter mes abonnements");
  expect(await m.locator(".modal-close").count(), "un seul ×").toBe(1);
  const bouton = m.locator(".event-invite-btn").first();
  expect((await bouton.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await bouton.click();
  await expect(m.locator(".event-invite-btn").first()).toHaveText("Annuler");
  await m.locator(".event-invite-btn").first().click();
  await page.waitForTimeout(5500);
  expect(await page.evaluate(() => window.__notifs.length), "annulée : rien n'est parti").toBe(0);
  await m.locator(".event-invite-btn").first().click();
  await page.waitForTimeout(5500);
  expect(await page.evaluate(() => window.__notifs.length), "l'invitation part après 5 s").toBe(1);
  await expect(m.locator(".event-invite-section")).toHaveText("Déjà invités");
  await expect(m.locator(".event-invite-fait")).toHaveText("✓ Invité");
  await expect(m.locator(".event-invite-lien")).toBeVisible();
});

test("④ PAR-C16 : le souvenir d'une activité se voit, se retire, et ne survit pas au Studio", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    const ev = (state.seed.events || [])[0];
    shareEventExperience(ev.id);
  });
  const bandeau = page.locator("#studioSouvenir");
  await expect(bandeau).toContainText("ira dans l'album");
  await page.evaluate(() => goTo("feed"));
  expect(await page.evaluate(() => window._pendingEventPost), "quitter le Studio efface le rattachement").toBeNull();
  await page.evaluate(() => { shareEventExperience((state.seed.events || [])[0].id); });
  await expect(bandeau).toBeVisible();
  await bandeau.locator(".studio-souvenir-retirer").click();
  await expect(bandeau).toHaveCount(0);
  expect(await page.evaluate(() => window._pendingEventPost)).toBeNull();
});

// ⑤ PAR-C14 (« Partager mon profil » visible dans la carte d'identité) : RETIRÉ le
// 2026-11-14 sur demande de Benjamin — « supprime "partager profil", il sert à
// rien ». Le bouton et `partagerMonProfil` sont partis ; leur ABSENCE est
// verrouillée par `profil-ergonomie.spec.js` ③, avec la porte qui reste
// (« Inviter des amis », menu du crayon).

test("⑥ PAR-C12 : deux portes de partage sur la fiche d'activité, la même icône en haut", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const ev = (state.seed.events || []).find((e) => e.date > Date.now());
    openEventDetails(ev.id);
    const p = document.getElementById("eventDetailPage");
    const portes = [...p.querySelectorAll('[onclick*="shareEvent("]')].length + (document.getElementById("eventDetailShareBtn") ? 1 : 0);
    return { portes, iconeHaut: !!document.querySelector("#eventDetailShareBtn svg.share-ico") };
  });
  expect(r.portes).toBe(2);
  expect(r.iconeHaut).toBe(true);
});
