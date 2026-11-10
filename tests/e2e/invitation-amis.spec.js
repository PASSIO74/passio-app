// ══════════════════════════════════════════════════════════════════════════
// INVITER DES AMIS — un lien qui porte MON nom, et des portes qu'on trouve
// (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// Le seul bouton « Inviter des amis » vivait dans Paramètres → Support
// (`shareBeta`) et diffusait l'accueil NU : sans `?inv=`, l'invité n'était ni
// accueilli par le nom de l'invitant ni abonné à lui en créant son compte. Le
// texte parlait avec la voix du fondateur (« la beta… que je prépare ») et
// promettait « leurs données restent sur leur appareil », faux depuis les
// comptes Supabase. Ce que cette suite prouve :
//   ① Support : un VRAI compte partage le lien de SON profil signé `?inv=`,
//      suivi (`link_create` puis `link_share` au geste), texte à la première
//      personne, sans la promesse fausse ;
//   ② un visiteur partage le lien de l'app SANS `?inv=` (repli presse-papiers) ;
//   ③ le menu ⋯ de mon profil porte « Inviter des amis », et le geste partage ;
//   ④ le séparateur « Exemples PASSIO » porte « Inviter quelqu'un » pour un
//      compte, jamais pour un visiteur.
// Autorités : `inviterDesAmis` / `lienInvitationAmis` (app-06), `shareBeta`
// (app-08), `poserSeparateurExemples` (app-02).
// Fiche : docs/journal/partage-liens-invitation.md.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Identifiant FICTIF : jamais celui d'un vrai compte (leçon d'`invitation-arrivee`
// ③ ter — en CI le vrai SDK lirait son vrai nom).
const MOI = "7b1e5c00-0000-4000-8000-00000000a417";

// Banc : partage natif ou presse-papiers ESPIONNÉS, télémétrie des liens
// espionnée (elle reste appelée : on vérifie le contrat, pas un faux).
async function poser(page, { compte = false, natif = true } = {}) {
  await bootOnboarded(page);
  await page.evaluate(([moi, compte, natif]) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    if (compte) {
      MY_UID = moi;
      // Un compte SANS session au banc : les refus 401 du projet vide feraient
      // conclure la sonde à une session morte, et son bandeau (`#serveurBanner`,
      // fixe en haut) recouvrirait les portes qu'on touche. Mesuré : 2 sur 6.
      _sondeServeur.muetJusqua = Date.now() + 3600000;
    }
    window.__partages = [];
    window.__copies = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: natif ? (d) => { window.__partages.push(d); return Promise.resolve(); } : undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t) => { window.__copies.push(t); return Promise.resolve(); } },
    });
    window.__liens = [];
    const lc = tel.linkCreate, ls = tel.linkShare;
    tel.linkCreate = function (k, c) { const id = lc.call(this, k, c); window.__liens.push(["link_create", k, c, id]); return id; };
    tel.linkShare = function (id, canal) { window.__liens.push(["link_share", id, canal]); return ls.call(this, id, canal); };
  }, [MOI, compte, natif]);
}

async function ouvrirSupport(page) {
  await page.locator(".hamburger").click();
  await expect(page.locator("#devPanel")).toHaveClass(/active/);
  const bouton = page.locator("#devPanel button", { hasText: "Inviter des amis" });
  if (!(await bouton.isVisible())) {
    await page.locator(".settings-section-header", { hasText: "Support" }).click();
  }
  await expect(bouton).toBeVisible();
  return bouton;
}

const lire = (page) => page.evaluate(() => ({
  partages: window.__partages, copies: window.__copies, liens: window.__liens,
}));

test("① Support : un compte invite avec SON profil signé ?inv=, suivi, à la première personne", async ({ page }) => {
  await poser(page, { compte: true });
  await (await ouvrirSupport(page)).click();
  const r = await lire(page);
  expect(r.partages, "un partage natif, parti du clic").toHaveLength(1);
  const p = r.partages[0];
  const u = new URL(p.url);
  expect(u.searchParams.get("inv"), "le lien porte l'invitant").toBe(MOI);
  // En local, la forme en hash (la forme courte `/u/` n'existe qu'en production).
  expect(u.hash, "c'est le lien de MON profil").toBe("#user-" + MOI);
  expect(u.searchParams.get("plk"), "et il est suivi").toMatch(/^lk_/);
  expect(p.text).toContain("Je suis sur PASSIO");
  expect(p.text).not.toMatch(/restent sur leur appareil/i);
  expect(p.text).not.toMatch(/que je prépare|bêta|beta/i);
  // Les signaux de l'entonnoir, émis au geste, pour CE lien.
  const creation = r.liens.find((l) => l[0] === "link_create");
  expect(creation && creation.slice(1, 3)).toEqual(["beta", "invite"]);
  expect(r.liens.find((l) => l[0] === "link_share")).toEqual(["link_share", u.searchParams.get("plk"), "native"]);
  expect(creation[3]).toBe(u.searchParams.get("plk"));
  // Plus de fenêtre « Partager la beta » : le partage EST le geste.
  await expect(page.locator(".modal-backdrop.active")).toHaveCount(0);
});

test("② un visiteur invite avec le lien de l'app, SANS ?inv= (repli presse-papiers)", async ({ page }) => {
  await poser(page, { compte: false, natif: false });
  expect(await page.evaluate(() => _uidEstUnCompte()), "prémisse : pas de compte").toBe(false);
  await (await ouvrirSupport(page)).click();
  const r = await lire(page);
  expect(r.partages).toHaveLength(0);
  expect(r.copies, "copié faute de partage natif").toHaveLength(1);
  const [texte, url] = r.copies[0].split("\n");
  expect(texte).toContain("Je suis sur PASSIO");
  const u = new URL(url);
  expect(u.searchParams.has("inv"), "aucun invitant pour un visiteur").toBe(false);
  expect(u.hash, "ni profil").toBe("");
  expect(u.searchParams.get("plk")).toMatch(/^lk_/);
  expect(r.liens.find((l) => l[0] === "link_share")[2]).toBe("clipboard");
  await expect(page.locator("#toastStack .toast", { hasText: "Lien d'invitation copié" })).toHaveCount(1);
});

test("③ le menu ⋯ de mon profil porte « Inviter des amis », et le geste partage le lien signé", async ({ page }) => {
  await poser(page, { compte: true });
  await page.evaluate(() => { goTo("profiles"); renderProfilesScreen(); });
  await page.locator("#v6bModifier").click();
  const entree = page.locator("#profileDotsMenu .profile-dots-item", { hasText: "Inviter des amis" });
  await expect(entree).toBeVisible();
  await entree.click();
  const r = await lire(page);
  expect(r.partages).toHaveLength(1);
  expect(new URL(r.partages[0].url).searchParams.get("inv")).toBe(MOI);
  expect(r.liens.find((l) => l[0] === "link_create").slice(1, 3)).toEqual(["beta", "invite_profil"]);
});

test("④ le séparateur « Exemples PASSIO » invite pour un compte, jamais pour un visiteur", async ({ page }) => {
  await poser(page, { compte: false });
  await page.evaluate(() => {
    state.supabasePosts = [];
    window._feedExtraPosts = [];
    window._feedDomSig = null; goTo("feed"); renderFeed();
  });
  const sep = page.locator("#feedList > .feed-exemples-sep");
  await expect(sep, "prémisse : des exemples à l'écran, donc un séparateur").toHaveCount(1);
  await expect(sep.locator(".feed-exemples-sep-invite"), "visiteur : pas d'invitation").toHaveCount(0);

  // Le même fil, une fois le compte connu : le séparateur se repose (no-op compris).
  await page.evaluate((moi) => { MY_UID = moi; renderFeed(); }, MOI);
  const bouton = sep.locator(".feed-exemples-sep-invite");
  await expect(bouton).toBeVisible();
  await expect(bouton).toHaveText("Inviter quelqu'un");
  await expect(sep.locator(".feed-exemples-sep-cta"), "le geste principal reste là").toBeVisible();
  await bouton.click();
  const r = await lire(page);
  expect(r.partages).toHaveLength(1);
  expect(new URL(r.partages[0].url).searchParams.get("inv")).toBe(MOI);
  expect(r.liens.find((l) => l[0] === "link_create").slice(1, 3)).toEqual(["beta", "invite_fil"]);
});
