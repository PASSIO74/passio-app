// ═══════════════════════════════════════════════════════════════════════════
// PROFIL — ERGONOMIE (2026-11-14)
// « Améliore la page de profil, je ne la trouve pas ergonomique et pratique »
// (Benjamin, capture de SON profil à l'appui). Fiche :
// docs/lots-ui/31-PROFIL-ERGONOMIE-2026-11-14.md.
//
// Mesuré sur son état réel (bio « Benjamin ladame⏎⏎Annecy⏎⏎37 ans », 7 passions,
// le bouton « Partager mon profil ») à 390 × 844 : la carte d'identité faisait
// 487 px, les onglets « Publications | Activité » passaient SOUS la barre du bas,
// aucune publication n'était visible sans défiler. La cause : la répartition
// `--espace-profil` (« tout doit tenir sur une page », 2026-09-10) comptait un
// corps de carte FIXE de 145 px — la bio réelle et le bouton Partager en
// faisaient 249. Le verrou ① ter de `profil-entete-passions` restait vert : sa
// fixture n'a pas de bio.
//
//   ① tout tient sur une page, avec SA bio et SES passions (844, 765, 693, 667),
//      ① ter aussi en PWA iPhone (zones sûres), ① bis quand la bio s'allonge
//   ② la bio en paragraphes : une ligne vide = un écart, pas une ligne blanche —
//      sur mon profil ET sur le profil visité ; texte intact à l'octet près
//   ③ plus de bouton « Partager » (retiré le 2026-11-14) ; le lien du profil
//      reste au menu du crayon, « Inviter des amis »
//   ④ le rail des passions va jusqu'au bord et laisse voir une 5e bulle entamée
//   ⑤ les onglets restent à portée quand on défile ; changer d'onglet ramène au
//      début de la section — ⑤ bis : re-toucher l'onglet actif ne remonte rien
//   ⑥ Entrée sur la bio ouvre l'éditeur UNE fois (il s'ouvrait deux fois)
//   ⑦ ordinateur (1440 × 900) : la barre collée au ras de l'en-tête
//   ⑧ coupure du lot UI-7 : rien de collant, rien ne casse
//   ⑨–⑮ le contenu d'abord (0 publication, comme le compte réel de Benjamin) :
//      formats TOUJOURS peints (2026-11-14), état vide compact,
//      « Activité » sans titre redondant, libellé du profil visité, coupure
//
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, onboardedState } = require("./app-helper");

const BIO_BENJAMIN = "Benjamin ladame\n\nAnnecy\n\n37 ans";
const SEPT = ["musique", "sport", "cuisine", "photo", "voyage", "danse", "art"];

function etatBenjamin(nbPosts = 0, media = false) {
  const st = onboardedState(1);
  st.user.profiles = SEPT.map((p, i) => ({
    id: "pp_" + i, name: "Ben", passion: p, emoji: "✨", bio: "", color: "#7c3aed", createdAt: i + 1,
  }));
  st.user.general = { username: "Ben test 1 sur portable", bio: BIO_BENJAMIN };
  st.user.following = ["a", "b", "c", "d", "e"];
  const t = Date.now();
  st.userPosts = Array.from({ length: nbPosts }, (_, i) => ({
    id: "up_erg_" + i, profileId: "pp_0", passion: "musique", type: "text",
    text: "Publication " + (i + 1) + " — un texte de test assez long pour faire une carte.",
    createdAt: t - i * 3600e3, likes: 0, comments: [],
  }));
  // Une photo : c'est elle qui fait exister la rangée de formats (⑨ et suivants).
  if (media) st.userPosts.push({ id: "up_erg_photo", profileId: "pp_0", passion: "musique", type: "photo", image: "icon-512.png", text: "Photo", createdAt: t - 99 * 3600e3, likes: 0, comments: [] });
  return st;
}

async function ouvrirProfil(page, opts = {}) {
  await bootOnboarded(page, null, 1, { state: etatBenjamin(opts.posts || 0, !!opts.media), ...(opts.boot || {}) });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaSavePublicProfile = async () => {};
    window.supaUpsertProfile = async () => {};
    goTo("profiles");
  });
  await page.waitForTimeout(700);
}

function mesurerPage() {
  const b = (s) => {
    const e = document.querySelector(s);
    if (!e || !e.offsetParent) return null;
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
  };
  const nav = document.getElementById("appNavV2");
  return {
    carte: b("#mainProfileCard"),
    couverture: b("#mainProfileCover"),
    pseudo: b("#mainProfileUsername"),
    avatar: b("#mainProfileAvatar"),
    rail: b("#v9ProfilePassions"),
    onglets: b("#v7ProfileTabs"),
    formats: b("#screen-profiles .v7-subfilters"),
    barre: nav && nav.offsetParent ? nav.getBoundingClientRect().top : null,
    zone: document.getElementById("appMain").clientHeight,
  };
}

// ── ① ────────────────────────────────────────────────────────────────────────
for (const [w, h] of [[390, 844], [390, 765], [390, 693], [375, 667]]) {
  test(`① ${w}×${h} — avec SA bio et SES 7 passions, tout tient sur une page (carte, rail, onglets, formats)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // Avec une photo : la rangée de formats existe (sans média, elle cède sa
    // place au contenu — cas ⑨).
    await ouvrirProfil(page, { media: true });
    const m = await page.evaluate(mesurerPage);
    expect(m.barre, "la barre du bas est là").not.toBeNull();
    expect(m.onglets, "les onglets sont peints").not.toBeNull();
    expect(m.formats, "la rangée de formats est peinte").not.toBeNull();
    // Avant : formats jusqu'à 848 pour une barre à 778 (844), onglets à moitié
    // sous la barre à 765 — la capture de Benjamin.
    expect(m.onglets.bottom, "les onglets sont au-dessus de la barre du bas").toBeLessThanOrEqual(m.barre);
    expect(m.formats.bottom, "la rangée de formats aussi : « tout doit tenir sur une page »").toBeLessThanOrEqual(m.barre);
    // Contre-mesure du 2026-08-31 (« le grand carré prend trop de place »),
    // cette fois AVEC une vraie bio.
    expect(m.carte.h / m.zone, "la carte d'identité reste sous les deux tiers").toBeLessThan(0.66);
    // Les trois nombres liés de l'avatar et la couverture jusqu'au pseudo.
    expect(m.avatar.top, "l'avatar tient sur la photo").toBeGreaterThanOrEqual(m.couverture.top - 1);
    expect(m.pseudo.top - m.couverture.bottom, "le pseudo juste sous la photo").toBeGreaterThanOrEqual(0);
    expect(m.pseudo.top - m.couverture.bottom).toBeLessThanOrEqual(12);
  });
}

test("① ter — iPhone en PWA (encoche 47 px, barre d'accueil 34 px) : tout tient encore", async ({ page, browserName }) => {
  // Les zones sûres ne s'émulent que par le protocole de Chromium.
  test.skip(browserName !== "chromium", "émulation des zones sûres : Chromium seulement");
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await ouvrirProfil(page, { media: true });
  const m = await page.evaluate(mesurerPage);
  // Avant la prise en compte des zones sûres : formats à 812 pour une barre à 744.
  expect(m.onglets.bottom, "onglets au-dessus de la barre (zone sûre comprise)").toBeLessThanOrEqual(m.barre);
  expect(m.formats.bottom, "formats aussi").toBeLessThanOrEqual(m.barre);
  expect(m.avatar.top, "l'avatar tient toujours sur la photo").toBeGreaterThanOrEqual(m.couverture.top - 1);
});

test("① bis — une bio qui s'allonge est MESURÉE : la répartition suit, rien ne passe sous la barre", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrirProfil(page, { media: true });
  const avant = await page.evaluate(() => getComputedStyle(document.getElementById("screen-profiles")).getPropertyValue("--corps-carte-profil").trim());
  await page.evaluate(() => {
    state.user.general.bio = "Une ligne\nDeux\nTrois\nQuatre\nCinq\nSix";
    renderMainProfile();
  });
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => getComputedStyle(document.getElementById("screen-profiles")).getPropertyValue("--corps-carte-profil").trim());
  expect(avant, "le corps de la carte est mesuré, pas supposé").toMatch(/^\d+px$/);
  expect(parseFloat(apres), "six lignes de bio : le corps mesuré grandit").toBeGreaterThan(parseFloat(avant) + 40);
  const m = await page.evaluate(mesurerPage);
  expect(m.formats.bottom, "et la rangée de formats reste au-dessus de la barre").toBeLessThanOrEqual(m.barre);
});

// ── ② ────────────────────────────────────────────────────────────────────────
test("② la bio en paragraphes : une ligne vide devient un écart, le texte reste intact", async ({ page }) => {
  await ouvrirProfil(page);
  const r = await page.evaluate(() => {
    const el = document.getElementById("mainProfileBio");
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    const paras = [...el.querySelectorAll(".bio-para")];
    const ecarts = paras.slice(1).map((p, i) => p.getBoundingClientRect().top - paras[i].getBoundingClientRect().bottom);
    return {
      lignes: el.getBoundingClientRect().height / lh,
      texte: el.textContent,
      ws: getComputedStyle(el).whiteSpace,
      paras: paras.map((p) => p.textContent),
      ecarts,
      lh,
    };
  });
  expect(r.texte, "textContent = la bio à l'octet près (copier-coller, verrou biographie ④)").toBe("Benjamin ladame\n\nAnnecy\n\n37 ans");
  expect(r.ws, "pre-line conservé (sauts simples)").toMatch(/pre-line|pre-wrap/);
  expect(r.paras).toEqual(["Benjamin ladame", "Annecy", "37 ans"]);
  // Avant : 5 lignes pleines (98 px), dont deux blanches.
  expect(r.lignes, "trois lignes de texte + deux petits écarts, plus deux lignes blanches").toBeLessThan(4);
  expect(r.lignes).toBeGreaterThanOrEqual(3);
  for (const e of r.ecarts) {
    expect(e, "la séparation reste VISIBLE (mise en forme voulue)").toBeGreaterThanOrEqual(4);
    expect(e, "mais ce n'est plus une ligne entière").toBeLessThan(r.lh);
  }
});

test("② bis — le profil VISITÉ rend la bio de la même façon, échappée", async ({ page }) => {
  await ouvrirProfil(page);
  const r = await page.evaluate(async () => {
    state.seed.users.push({ id: "u_bio_erg", name: "Camille", profileEmoji: "🎨", avatar: "#7c3aed", bio: "Peintre<img src=x onerror=window.__xssBio=1>\n\n\n\nLyon\nAtelier ouvert", passions: [] });
    await openUserProfile("u_bio_erg", "seed");
    await new Promise((ok) => setTimeout(ok, 300));
    const el = document.querySelector("#modalContent .main-profile-bio");
    if (!el) return null;
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return {
      paras: [...el.querySelectorAll(".bio-para")].map((p) => p.textContent),
      images: el.querySelectorAll("img").length,
      lignes: el.getBoundingClientRect().height / lh,
      curseur: getComputedStyle(el).cursor,
    };
  });
  expect(r, "la bio du profil visité est peinte").not.toBeNull();
  // Quatre sauts d'affilée (bio d'un autre compte, jamais garantie normalisée)
  // ne font qu'UN écart ; le saut simple reste un saut.
  expect(r.paras).toEqual(["Peintre<img src=x onerror=window.__xssBio=1>", "Lyon\nAtelier ouvert"]);
  expect(r.images, "aucune balise injectée").toBe(0);
  expect(await page.evaluate(() => window.__xssBio), "aucun script exécuté").toBeUndefined();
  expect(r.lignes, "3 lignes de texte et un écart, pas 6 lignes").toBeLessThan(4);
  expect(r.curseur, "la bio d'autrui n'ouvre rien : pas de curseur « main »").not.toBe("pointer");
});

// ── ③ ────────────────────────────────────────────────────────────────────────
test("③ plus de bouton « Partager » dans la carte ; le lien du profil reste au menu du crayon", async ({ page }) => {
  // Retiré le 2026-11-14 sur demande de Benjamin : « supprime "partager profil",
  // il sert à rien ». La fonction `partagerMonProfil` est partie avec lui.
  await ouvrirProfil(page);
  const r = await page.evaluate(() => ({
    bouton: document.querySelectorAll("#mainProfileCard .main-profile-partager").length,
    visibles: [...document.querySelectorAll("#mainProfileCard button")]
      .filter((b) => b.offsetParent && /partager/i.test(b.textContent + " " + (b.getAttribute("aria-label") || ""))).length,
    fonction: typeof window.partagerMonProfil,
  }));
  expect(r.bouton, "le bouton n'existe plus").toBe(0);
  expect(r.visibles, "aucun autre bouton « Partager » dans la carte").toBe(0);
  expect(r.fonction, "sa fonction est partie avec lui (cible supprimée)").toBe("undefined");
  // Le partage du profil ne disparaît pas : « Inviter des amis » est au menu du
  // crayon d'UI-6B, qui reste le point d'édition (décision du 2026-08-29).
  await page.locator("#v6bModifier").click();
  await expect(page.locator(".profile-dots-menu")).toContainText("Inviter des amis");
  // Et aucun bouton « Modifier » visible n'a été ajouté dans la carte.
  expect(await page.locator("#mainProfileCard button:visible", { hasText: /^Modifier/ }).count()).toBe(0);
});

// ── ④ ────────────────────────────────────────────────────────────────────────
test("④ sept passions : le rail va jusqu'au bord et laisse voir une 5e bulle ENTAMÉE", async ({ page }) => {
  await ouvrirProfil(page);
  const r = await page.evaluate(() => {
    const rail = document.getElementById("v9ProfilePassions");
    rail.scrollLeft = 0;
    const vign = [...rail.querySelectorAll(".profile-tile .profile-tile-avatar")].map((a) => a.getBoundingClientRect());
    const rr = rail.getBoundingClientRect();
    const st = getComputedStyle(rail);
    const tuiles = [...rail.querySelectorAll(".profile-tile")];
    return {
      n: vign.length,
      larg: innerWidth,
      railG: rr.left, railD: rr.right,
      entieres: vign.filter((v) => v.left >= rr.left && v.right <= rr.right).length,
      entamee: vign.some((v) => v.left < rr.right - 8 && v.right > rr.right),
      premiere: tuiles[0].getBoundingClientRect().left - (rr.left + parseFloat(st.paddingLeft)),
      largeurs: tuiles.map((t) => Math.round(t.getBoundingClientRect().width)),
      libelleMax: parseFloat(getComputedStyle(rail.querySelector(".profile-tile-label")).maxWidth),
    };
  });
  expect(r.n).toBe(7);
  expect(r.railG, "le rail part du bord gauche de l'écran").toBeLessThanOrEqual(1);
  expect(r.railD, "et va jusqu'au bord droit").toBeGreaterThanOrEqual(r.larg - 1);
  expect(r.railD).toBeLessThanOrEqual(r.larg + 1);
  expect(r.entieres, "quatre bulles entières").toBe(4);
  // Avant : la coupure tombait pile dans la marge de la 5e — aucune vignette
  // entamée, rien ne disait qu'il y en avait trois autres.
  expect(r.entamee, "une vignette dépasse du bord : la rangée se fait défiler").toBe(true);
  expect(r.premiere, "au débordement la rangée part de son vrai début").toBe(0);
  expect(new Set(r.largeurs).size, "toutes les bulles ont la même largeur").toBe(1);
  expect(r.libelleMax, "« Course à pied » tient en entier (10 px, 66 px)").toBeGreaterThanOrEqual(70);
});

// ── ⑤ ────────────────────────────────────────────────────────────────────────
test("⑤ les onglets restent à portée en défilant ; « Activité » ramène au début de la section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 765 });
  await ouvrirProfil(page, { posts: 8 });
  const depart = await page.evaluate(() => document.getElementById("v7ProfileTabs").getBoundingClientRect().top);
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 1400; });
  await page.waitForTimeout(250);
  const colle = await page.evaluate(() => {
    const b = document.getElementById("v7ProfileTabs").getBoundingClientRect();
    const main = document.getElementById("appMain").getBoundingClientRect();
    const act = document.querySelector('[data-v7-tab="activites"]').getBoundingClientRect();
    const cible = document.elementFromPoint(act.left + act.width / 2, act.top + act.height / 2);
    return {
      top: b.top, mainTop: main.top, defile: document.getElementById("appMain").scrollTop,
      touche: !!(cible && cible.closest('[data-v7-tab="activites"]')),
    };
  });
  expect(colle.defile, "on a bien défilé dans les publications").toBeGreaterThan(400);
  expect(depart, "au repos, la barre est à sa place dans la page").toBeGreaterThan(colle.mainTop + 200);
  // Avant : la barre partait avec la page.
  expect(Math.abs(colle.top - colle.mainTop), "la barre est collée en haut de la zone de contenu").toBeLessThanOrEqual(1);
  expect(colle.touche, "« Activité » est touchable, rien ne le recouvre").toBe(true);
  await page.locator('[data-v7-tab="activites"]').click();
  await page.waitForTimeout(250);
  const apres = await page.evaluate(() => {
    const b = document.getElementById("v7ProfileTabs").getBoundingClientRect();
    const p = document.getElementById("v7Pan-activites");
    return { visible: !p.hidden, panTop: p.getBoundingClientRect().top, barBas: b.bottom };
  });
  expect(apres.visible).toBe(true);
  expect(apres.panTop, "le début de « Activité » n'est pas caché sous la barre").toBeGreaterThanOrEqual(apres.barBas - 1);
  expect(apres.panTop - apres.barBas, "il est juste sous elle").toBeLessThanOrEqual(80);
});

test("⑤ bis — re-toucher l'onglet DÉJÀ actif ne fait pas perdre la position de lecture", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 765 });
  await ouvrirProfil(page, { posts: 8 });
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 1200; });
  await page.waitForTimeout(250);
  const avant = await page.evaluate(() => document.getElementById("appMain").scrollTop);
  await page.locator('[data-v7-tab="publications"]').click();
  await page.waitForTimeout(250);
  const apres = await page.evaluate(() => document.getElementById("appMain").scrollTop);
  expect(avant, "on est bien au milieu des publications").toBeGreaterThan(400);
  expect(Math.abs(apres - avant), "la barre collante est sous le pouce : un tap involontaire ne remonte rien").toBeLessThanOrEqual(1);
});

// ── ⑥ ────────────────────────────────────────────────────────────────────────
test("⑥ Entrée sur la bio ouvre l'éditeur UNE fois", async ({ page }) => {
  await ouvrirProfil(page);
  await page.evaluate(() => {
    window.__editions = 0;
    const orig = window.openEditMainProfile;
    window.openEditMainProfile = function () { window.__editions++; return orig.apply(this, arguments); };
  });
  await page.locator("#mainProfileBio").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  // Avant : le `onkeydown` en ligne ET le délégué clavier d'app-08 → 2.
  expect(await page.evaluate(() => window.__editions)).toBe(1);
});

// ── ⑦ ────────────────────────────────────────────────────────────────────────
test("⑦ ordinateur 1440 × 900 : la barre collée au ras de l'en-tête", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ouvrirProfil(page, { posts: 8 });
  await page.evaluate(() => { document.getElementById("appMain").scrollTop = 1400; });
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => ({
    top: document.getElementById("v7ProfileTabs").getBoundingClientRect().top,
    mainTop: document.getElementById("appMain").getBoundingClientRect().top,
    debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(Math.abs(r.top - r.mainTop), "padding de 28 px compensé").toBeLessThanOrEqual(1);
  expect(r.debord).toBeLessThanOrEqual(1);
});

// ── ⑧ ────────────────────────────────────────────────────────────────────────
test("⑧ coupure du lot UI-7 : pas de barre collante, le profil reste entier", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 1, { state: etatBenjamin(3) });
  await page.evaluate(() => {
    goTo("profiles");
    localStorage.setItem("passio_ui_7", "0");
    PassioUIV7.apply();
  });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    barre: !!document.getElementById("v7ProfileTabs"),
    posts: !!document.getElementById("myPosts"),
    bio: document.getElementById("mainProfileBio").textContent,
  }));
  expect(r.barre, "sans le lot UI-7, aucune barre d'onglets").toBe(false);
  expect(r.posts).toBe(true);
  expect(r.bio).toBe(BIO_BENJAMIN);
  expect(errors.js, "aucune erreur JS").toEqual([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE CONTENU D'ABORD — relu sur le compte RÉEL de Benjamin : 0 publication.
// Sur son écran, la rangée Tout · Photos · Vidéos · Bobines · Audio ne filtrait
// rien et occupait la dernière place visible ; « Publie ta première création »
// restait sous la barre du bas.
// ═══════════════════════════════════════════════════════════════════════════
function mesurerContenu() {
  const r = (e) => (e && e.offsetParent ? e.getBoundingClientRect() : null);
  const rangee = document.querySelector("#screen-profiles .profile-tabs");
  const vide = document.querySelector("#myPosts > .empty");
  const nav = document.getElementById("appNavV2");
  return {
    rangeePeinte: !!(rangee && rangee.offsetParent),
    libelles: [...document.querySelectorAll("#screen-profiles .profile-tab-lbl")].map((l) => l.textContent),
    onglets: r(document.getElementById("v7ProfileTabs")),
    titre: r(vide && vide.querySelector(".empty-title")),
    texte: r(vide && vide.querySelector(".empty-text")),
    vide: r(vide),
    premierPost: r(document.querySelector("#myPosts .post")),
    barre: nav && nav.offsetParent ? nav.getBoundingClientRect().top : innerHeight,
    espace: parseFloat(getComputedStyle(document.getElementById("v9ProfilePassions")).marginTop),
  };
}

// ⑨–⑪ (2026-11-14, demande de Benjamin : « je ne vois plus les onglets photo /
// vidéo à cocher ») : la rangée de formats est TOUJOURS peinte — le masquage
// « tant qu'elle ne filtre rien » est retiré. Ces cas verrouillent l'inverse.
for (const [w, h] of [[390, 844], [390, 765], [375, 667]]) {
  test(`⑨ ${w}×${h} — 0 publication : la rangée de formats reste à l'écran, et rien au-dessus ne bouge avec une photo`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await ouvrirProfil(page);
    const m = await page.evaluate(mesurerContenu);
    expect(m.rangeePeinte, "sans média, les formats restent cochables").toBe(true);
    expect(m.libelles).toEqual(["Tout", "Photos", "Vidéos", "Bobines", "Audio"]);
    await page.evaluate(() => {
      state.userPosts.push({ id: "up_erg_p9", profileId: "pp_0", passion: "musique", type: "photo", image: "icon-512.png", text: "", createdAt: Date.now(), likes: 0, comments: [] });
      renderProfilesScreen();
    });
    await page.waitForTimeout(200);
    const avecPhoto = await page.evaluate(mesurerContenu);
    expect(avecPhoto.rangeePeinte).toBe(true);
    expect(Math.abs(avecPhoto.onglets.bottom - m.onglets.bottom), "onglets au même endroit dans les deux cas").toBeLessThanOrEqual(1);
  });
}

test("⑩ que des textes : la rangée de formats reste peinte", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ouvrirProfil(page, { posts: 8 });
  const m = await page.evaluate(mesurerContenu);
  expect(m.rangeePeinte).toBe(true);
  expect(m.premierPost, "la 1re publication est rendue").not.toBeNull();
});

test("⑪ la rangée ne disparaît jamais : ni au toucher, ni à la prochaine entrée, ni sans média", async ({ page }) => {
  await ouvrirProfil(page);
  const peinte = () => page.evaluate(() => !!document.querySelector("#screen-profiles .profile-tabs").offsetParent);
  expect(await peinte(), "0 média : peinte").toBe(true);
  await page.locator('#screen-profiles .profile-tab[data-tab="photos"]').click();
  await page.locator('#screen-profiles .profile-tab[data-tab="videos"]').click();
  expect(await page.evaluate(() => [...profileTabSelection].sort()), "deux formats cochés").toEqual(["photos", "videos"]);
  await page.locator('#screen-profiles .profile-tab[data-tab="posts"]').click();
  expect(await peinte(), "après « Tout »").toBe(true);
  await page.evaluate(() => { goTo("feed"); goTo("profiles"); });
  await page.waitForTimeout(300);
  expect(await peinte(), "à la prochaine entrée").toBe(true);
});

test("⑫ l'état vide est compact : icône à gauche, bouton pleine largeur de 44 px, texte ≥ 12 px", async ({ page }) => {
  await ouvrirProfil(page);
  const r = await page.evaluate(() => {
    const v = document.querySelector("#myPosts > .empty");
    const b = v.querySelector(".btn").getBoundingClientRect();
    return {
      h: v.getBoundingClientRect().height,
      icone: v.querySelector(".empty-icon").getBoundingClientRect().right,
      titre: v.querySelector(".empty-title").getBoundingClientRect().left,
      boutonH: b.height, boutonW: b.width, videW: v.getBoundingClientRect().width,
      texte: parseFloat(getComputedStyle(v.querySelector(".empty-text")).fontSize),
      libelle: v.querySelector(".btn").textContent.trim(),
    };
  });
  expect(r.h, "avant : 168 px").toBeLessThanOrEqual(120);
  expect(r.icone, "icône à gauche du titre").toBeLessThan(r.titre);
  expect(r.boutonH).toBeGreaterThanOrEqual(44);
  expect(r.boutonW / r.videW).toBeGreaterThanOrEqual(0.9);
  expect(r.texte, "plancher de 12 px (LOT-53)").toBeGreaterThanOrEqual(12);
  expect(r.libelle).toBe("Créer une publication");
});

test("⑬ « Activité » : le titre qui répète l'onglet n'est plus peint, le contenu remonte", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 765 });
  await ouvrirProfil(page);
  await page.locator('[data-v7-tab="activites"]').click();
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const t = [...document.querySelectorAll("#v7Pan-activites .section-title")].find((e) => /Mes activités/.test(e.textContent));
    const ev = document.getElementById("profileEvents").getBoundingClientRect();
    return {
      texte: t && t.textContent,
      hauteur: t ? t.getBoundingClientRect().height : -1,
      ecart: ev.top - document.getElementById("v7ProfileTabs").getBoundingClientRect().bottom,
      espace: parseFloat(getComputedStyle(document.getElementById("v9ProfilePassions")).marginTop),
    };
  });
  expect(r.texte, "le titre reste dans le DOM (UI-7 le retrouve par son texte, un lecteur d'écran le lit)").toBe("Mes activités");
  expect(r.hauteur, "mais il n'est plus peint").toBeLessThanOrEqual(1);
  // Avant : 62 px entre les onglets et le contenu (titre + sa marge de 18 px).
  expect(r.ecart, "le contenu est à un espace des onglets").toBeLessThanOrEqual(r.espace + 2);
});

test("⑭ profil visité : la rangée des formats s'annonce comme un filtre", async ({ page }) => {
  await ouvrirProfil(page);
  const label = await page.evaluate(async () => {
    state.seed.users.push({ id: "u_fmt_erg", name: "Camille", profileEmoji: "🎨", avatar: "#7c3aed", bio: "", passions: [] });
    await openUserProfile("u_fmt_erg", "seed");
    await new Promise((ok) => setTimeout(ok, 300));
    const t = document.querySelector("#modalContent #visitedTabs");
    return t ? t.getAttribute("aria-label") : null;
  });
  expect(label).toBe("Filtrer par format de contenu");
});

test("⑮ coupure du lot UI-7 : la rangée de formats et « Mes activités » reviennent, même sans média", async ({ page }) => {
  await ouvrirProfil(page);
  await page.evaluate(() => { localStorage.setItem("passio_ui_7", "0"); PassioUIV7.apply(); });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    rangee: !!document.querySelector("#screen-profiles .profile-tabs").offsetParent,
    titre: [...document.querySelectorAll("#screen-profiles .section-title")].some((t) => /Mes activités/.test(t.textContent) && t.getBoundingClientRect().height > 1),
  }));
  expect(r.rangee).toBe(true);
  expect(r.titre).toBe(true);
});
