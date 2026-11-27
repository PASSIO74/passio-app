// ═══════════════════════════════════════════════════════════════════════════
// BOBINES : « SUIVRE » — ET LE RETOUR APRÈS « CRÉER → PUBLICATION » (2026-11-27)
// Suite du lot story/bobine (« Ok fait tout », Benjamin). Verrous :
//   ① « Suivre » sur la bobine d'un compte réel que je ne suis pas ; pas de
//      bouton sur MA bobine, sur un personnage d'exemple, ni sur un compte
//      déjà suivi ;
//   ② un toucher suit le compte par l'AUTORITÉ commune (`toggleFollowUser`) :
//      toutes les bobines de cet auteur se repeignent, le lecteur reste ouvert
//      (le toucher ne remonte pas jusqu'à l'ouverture du profil) ; « ✓ Suivi »
//      y est un ACCUSÉ — un second toucher ne désabonne pas — qui s'efface une
//      fois le verdict tombé ; un refus du serveur rend « Suivre », et il reste ;
//   ③ compte privé : « Demande envoyée », lisible et distincte ; la demande
//      acceptée se voit tout de suite sur le bouton ; une lecture de la liste
//      partie AVANT un geste (demander, suivre, ne plus suivre) ne le défait
//      pas en répondant après — jugé au moment d'APPLIQUER la réponse ;
//   ④ le bouton reçoit son toucher sur 44 px et la légende ne passe pas sous
//      la colonne d'actions, à 320 comme à 390 px ;
//   ⑤ « Créer → Publication » : UN geste retour ramène à l'écran d'origine
//      (il en fallait deux : une entrée d'historique orpheline restait sous le
//      Studio et affichait le Fil).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000c880";
const LEA = "a1b2c3d4-0000-4000-8000-00000000c881";
const SAM = "a1b2c3d4-0000-4000-8000-00000000c882";
const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

// Un banc sans aucune bobine d'exemple : deux bobines de Léa (compte réel), une de
// Sam (compte réel), une de moi, une d'un personnage d'exemple.
async function banc(page, serveur) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea, sam, image, serveur }) => {
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window.requireAuthentication = () => true;
    window.__vraiSupaLoadFollowing = window.__vraiSupaLoadFollowing || window.supaLoadFollowing;
    window.invitationGesteManuel = window.invitationGesteManuel || (() => {});
    window.__suivis = []; window.__desabonnes = [];
    window.supaFollowUser = async (id) => { window.__suivis.push(id); return serveur === "refus" ? { ok: false } : { ok: true, status: serveur === "prive" ? "pending" : "accepted" }; };
    window.supaUnfollowUser = async (id) => { window.__desabonnes.push(id); return { ok: true }; };
    // Les écritures sont factices : la base du banc ne les connaît pas. Une relecture de
    // la liste (démarrage différé de l'application) y répondrait « aucune demande » et
    // effacerait l'état que le test vient de poser — `null` = lecture sans verdict.
    window.supaLoadFollowing = async () => null;
    window.supaSaveUserState = async () => {};
    window.__toasts = [];
    const t = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
    state.user.following = []; state.user.followingPending = [];
    // Léa et Sam sont de VRAIES personnes (profil distant) ; « u_exemple » est un personnage d'exemple.
    state.seed.users = (state.seed.users || []).filter((u) => ![lea, sam, "u_exemple"].includes(u.id));
    state.seed.users.push({ id: lea, name: "Léa Martin", profileEmoji: "🎸", avatar: "#8b5cf6", distant: true });
    state.seed.users.push({ id: sam, name: "Sam", profileEmoji: "🍳", avatar: "#0ea5e9", distant: true });
    state.seed.users.push({ id: "u_exemple", name: "Exemple Démo", profileEmoji: "✨", avatar: "#ec4899" });
    const bobine = (id, auteur, nom, il_y_a) => ({ id, authorId: auteur, userId: auteur, authorName: nom, isReel: true, type: "photo", image, passion: "cuisine", mood: "all", text: "Bobine " + id, fromSupabase: auteur !== "u_exemple", createdAt: Date.now() - il_y_a, likes: 0, comments: [] });
    state.seed.posts = [bobine("reel_exemple", "u_exemple", "Exemple Démo", 9000)];
    state.supabasePosts = [bobine("reel_lea_1", lea, "Léa Martin", 1000), bobine("reel_sam", sam, "Sam", 2000), bobine("reel_lea_2", lea, "Léa Martin", 3000)];
    state.userPosts = [bobine("reel_moi", moi, "Moi", 4000)];
    window._feedExtraPosts = [];
    openReels();
  }, { moi: MOI, lea: LEA, sam: SAM, image: IMAGE, serveur: serveur || "ok" });
  await expect(page.locator("#reelsViewer")).toHaveClass(/open/);
}
const bouton = (page, id) => page.locator(`#reelsList .reel-item[data-post-id="${id}"] .reel-suivre`);

test("① « Suivre » sur un compte réel non suivi — ni sur ma bobine, ni sur un exemple, ni sur un compte déjà suivi", async ({ page }) => {
  await banc(page);
  await expect(bouton(page, "reel_lea_1")).toHaveText("Suivre");
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("aria-label", "Suivre ce compte");
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("data-follow-uid", LEA);
  await expect(bouton(page, "reel_lea_2")).toHaveText("Suivre");
  await expect(bouton(page, "reel_sam")).toHaveText("Suivre");
  await expect(bouton(page, "reel_moi"), "pas sur ma propre bobine").toHaveCount(0);
  await expect(bouton(page, "reel_exemple"), "pas sur un personnage d'exemple").toHaveCount(0);
  // Aucun gestionnaire inline ne porte le nom ou l'identifiant d'un autre compte.
  expect(await bouton(page, "reel_lea_1").getAttribute("onclick")).toBeNull();
  // Déjà suivi : au rendu suivant, plus de bouton (on se désabonne depuis le profil).
  await page.evaluate((sam) => { closeReels(); state.user.following = [sam]; openReels(); }, SAM);
  await expect(bouton(page, "reel_sam")).toHaveCount(0);
  await expect(bouton(page, "reel_lea_1")).toHaveText("Suivre");
});

test("② un toucher suit le compte : toutes ses bobines se repeignent, le lecteur reste ouvert ; refus serveur = retour à « Suivre »", async ({ page }) => {
  await banc(page);
  await bouton(page, "reel_lea_1").tap();
  await expect(bouton(page, "reel_lea_1")).toHaveText("✓ Suivi");
  // L'étiquette ne promet pas un désabonnement que ce toucher ne fait pas.
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("aria-label", "Suivi");
  await expect(bouton(page, "reel_lea_2"), "l'autre bobine du même auteur suit").toHaveText("✓ Suivi");
  await expect(bouton(page, "reel_sam")).toHaveText("Suivre");
  const r = await page.evaluate((lea) => ({ suivi: state.user.following.includes(lea), appels: window.__suivis.slice(), lecteur: document.getElementById("reelsViewer").classList.contains("open"), profil: !!document.querySelector("#modalBackdrop.active"), toasts: window.__toasts.join("|") }), LEA);
  expect(r.suivi).toBe(true);
  expect(r.appels, "une seule écriture, vers le bon compte").toEqual([LEA]);
  expect(r.lecteur, "le lecteur reste ouvert").toBe(true);
  expect(r.profil, "le toucher n'ouvre pas le profil").toBe(false);
  expect(r.toasts).toContain("Tu suis Léa Martin");
  // Le nom reste cliquable pour ouvrir le profil (le bouton n'a pas mangé sa ligne).
  expect(await page.locator('#reelsList .reel-item[data-post-id="reel_lea_1"] .reel-author').getAttribute("onclick")).toContain("_openReelAuthor");
  // Suivi ACQUIS : l'accusé s'efface de lui-même, sur toutes les bobines de l'auteur.
  await expect(bouton(page, "reel_lea_1")).toHaveCount(0, { timeout: 8000 });
  await expect(bouton(page, "reel_lea_2")).toHaveCount(0);
  await expect(bouton(page, "reel_sam")).toHaveText("Suivre");
  // « ✓ Suivi » est un ACCUSÉ, pas un bouton de désabonnement : un second toucher (le
  // reste d'un double toucher) pendant l'écriture ne fait rien ; après le verdict, il
  // efface l'accusé. Dans les deux cas, AUCUN désabonnement ne part.
  const double = await page.evaluate(async (sam) => {
    const b = () => document.querySelector('#reelsList .reel-item[data-post-id="reel_sam"] .reel-suivre');
    b().click();
    b().click();                                    // écriture en vol : ignoré, rien n'est retiré
    const pendant = { present: !!b(), texte: b() && b().textContent };
    await new Promise((res) => setTimeout(res, 50)); // le verdict tombe
    b().click();                                    // verdict tombé : l'accusé s'efface
    return { pendant, apres: !!b(), suivis: window.__suivis.filter((x) => x === sam).length, desabonnes: window.__desabonnes.length, suivi: state.user.following.includes(sam) };
  }, SAM);
  expect(double).toEqual({ pendant: { present: true, texte: "✓ Suivi" }, apres: false, suivis: 1, desabonnes: 0, suivi: true });

  // Refus du serveur : l'affichage optimiste est annulé.
  await banc(page, "refus");
  await bouton(page, "reel_lea_1").tap();
  await expect.poll(() => page.evaluate(() => window.__suivis.length)).toBe(1);
  await expect(bouton(page, "reel_lea_1")).toHaveText("Suivre");
  expect(await page.evaluate((lea) => state.user.following.includes(lea) || state.user.followingPending.includes(lea), LEA)).toBe(false);
  // … et le bouton RESTE (le retrait différé ne vaut que pour un suivi acquis) : on peut réessayer.
  await page.waitForTimeout(2300);
  await expect(bouton(page, "reel_lea_1")).toHaveText("Suivre");
  await expect(bouton(page, "reel_lea_2")).toHaveText("Suivre");
});

test("③ compte privé : « Demande envoyée », lisible sur la vidéo ; acceptée, elle devient « ✓ Suivi » sans attendre", async ({ page }) => {
  await banc(page, "prive");
  await bouton(page, "reel_lea_1").tap();
  await expect(bouton(page, "reel_lea_1")).toHaveText("Demande envoyée");
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("data-suivi-attente", "1");
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("aria-label", "Demande envoyée — appuie pour l'annuler");
  const style = await bouton(page, "reel_lea_1").evaluate((b) => { const c = getComputedStyle(b); return { couleur: c.color, bord: c.borderTopStyle }; });
  expect(style, "blanc en tirets sur la vidéo — pas le violet accent, illisible sur fond sombre").toEqual({ couleur: "rgb(255, 255, 255)", bord: "dashed" });
  expect(await page.evaluate((lea) => ({ att: state.user.followingPending.includes(lea), suivi: state.user.following.includes(lea) }), LEA)).toEqual({ att: true, suivi: false });
  // Premier RENDU avec une demande déjà en vol : le gabarit la peint (pas seulement la repeinte).
  await page.evaluate(() => { closeReels(); openReels(); });
  await expect(bouton(page, "reel_lea_1")).toHaveText("Demande envoyée");
  await expect(bouton(page, "reel_lea_1")).toHaveAttribute("data-suivi-attente", "1");
  // La demande est acceptée (notification du serveur) : le bouton à l'écran suit.
  await page.evaluate((lea) => mergeSupaNotifs([{ id: "n_accept", kind: "follow", fromId: lea, text: "Léa a accepté ta demande d'abonnement", fromSupabase: true, createdAt: Date.now() }]), LEA);
  await expect(bouton(page, "reel_lea_1")).toHaveText("✓ Suivi");
  await expect(bouton(page, "reel_lea_1")).not.toHaveAttribute("data-suivi-attente", "1");
  // Une demande en attente n'avait pas été retirée entre-temps (seul un suivi acquis l'est),
  // et toucher l'accusé ne désabonne pas.
  await bouton(page, "reel_lea_1").tap();
  await expect(bouton(page, "reel_lea_1")).toHaveCount(0);
  expect(await page.evaluate((lea) => ({ suivi: state.user.following.includes(lea), desabonnes: window.__desabonnes.length }), LEA)).toEqual({ suivi: true, desabonnes: 0 });
});

// La vraie `supaLoadFollowing`, sur un faux client dont la réponse est RETENUE : la
// lecture part à l'appel et ne répond qu'à `__repondre(lignes)`. Seule cette lecture de
// `follows` est retenue ; tout autre appel du client (télémétrie, notifications…) passe
// au vrai, sinon il volerait le déclencheur.
async function lectureRetenue(page) {
  await page.evaluate(() => {
    window.supaLoadFollowing = window.__vraiSupaLoadFollowing;
    window._compteAuthReel = () => true;
    window._followsSansStatut = false;
    const vrai = supa;
    const retenue = { select: () => ({ eq: () => new Promise((res) => { window.__repondre = (lignes) => res({ data: lignes || [], error: null }); }) }) };
    let prise = false;
    supa = new Proxy(vrai, { get(cible, cle) {
      if (cle !== "from") { const v = cible[cle]; return typeof v === "function" ? v.bind(cible) : v; }
      return (table) => { if (table === "follows" && !prise) { prise = true; return retenue; } return cible.from(table); };
    } });
    window.__lecture = supaLoadFollowing();
    supa = vrai;
  });
}

test("③bis une lecture de la liste partie AVANT le toucher ne l'efface pas en répondant après", async ({ page }) => {
  await banc(page, "prive");
  // Elle part maintenant, et répondra « aucune ligne » (l'état d'avant le toucher).
  await lectureRetenue(page);
  await bouton(page, "reel_lea_1").tap();
  await expect(bouton(page, "reel_lea_1")).toHaveText("Demande envoyée");
  // Sam, lui, a été suivi AVANT la lecture et le serveur ne le rend pas : la base fait foi.
  const r = await page.evaluate(async ({ lea, sam }) => {
    state.user.following.push(sam);
    window.__repondre([]);
    const acceptes = await window.__lecture;
    repeindreBoutonsSuiviVisibles();
    return { attente: state.user.followingPending.slice(), acceptes: acceptes.slice() };
  }, { lea: LEA, sam: SAM });
  expect(r.attente, "la demande faite pendant la lecture est gardée").toEqual([LEA]);
  expect(r.acceptes, "la lecture rend la liste BRUTE du serveur").toEqual([]);
  await expect(bouton(page, "reel_lea_1")).toHaveText("Demande envoyée");
});

test("③ter suivre ou ne plus suivre pendant la lecture : la fusion, faite PLUS TARD, ne défait ni l'un ni l'autre", async ({ page }) => {
  await banc(page, "ok");
  // Sam est suivi d'avant (aucune écriture récente) ; le serveur, lui, ne le connaît pas.
  await page.evaluate((sam) => { state.user.following = [sam]; }, SAM);
  await lectureRetenue(page);
  // SUIVRE pendant la lecture (compte public : accepté tout de suite).
  await bouton(page, "reel_lea_1").tap();
  await expect(bouton(page, "reel_lea_1")).toHaveText("✓ Suivi");
  await expect.poll(() => page.evaluate(() => window.__suivis.length)).toBe(1);
  const suivre = await page.evaluate(async ({ lea, sam }) => {
    window.__repondre([]);                                  // la réponse date d'avant le toucher
    const ids = await window.__lecture;
    await new Promise((res) => setTimeout(res, 30));       // l'attente de `_sessionEstMoi`, dans l'application
    _fusionnerSuivisServeur(ids, true);                    // la base fait foi… sauf pour ce qui est plus frais ici
    return { lea: state.user.following.includes(lea), sam: state.user.following.includes(sam) };
  }, { lea: LEA, sam: SAM });
  expect(suivre, "le suivi posé pendant la lecture est gardé ; l'ancien, inconnu de la base, part").toEqual({ lea: true, sam: false });

  // NE PLUS SUIVRE pendant la lecture : la réponse, plus ancienne, liste encore le compte.
  await lectureRetenue(page);
  const quitter = await page.evaluate(async (lea) => {
    // Une surface qui porte le bouton de ce compte (l'accusé de la bobine a pu s'effacer).
    const b = document.createElement("button"); b.setAttribute("data-follow-uid", lea); b.hidden = true; document.body.appendChild(b);
    toggleFollowUser(lea, "Léa Martin");                    // « suivi » → on se désabonne
    await new Promise((res) => setTimeout(res, 30));       // l'écriture aboutit APRÈS le départ de la lecture
    window.__repondre([{ following_id: lea, status: "accepted" }]);
    const ids = await window.__lecture;
    const brute = ids.slice();
    const avantFusion = state.user.following.includes(lea);
    _fusionnerSuivisServeur(ids, true);
    const remplace = state.user.following.includes(lea);
    _fusionnerSuivisServeur(ids, false);                    // l'union (session non vérifiée) ne le réintroduit pas non plus
    b.remove();
    return { desabonnes: window.__desabonnes.slice(), brute, avantFusion, remplace, union: state.user.following.includes(lea) };
  }, LEA);
  expect(quitter).toEqual({ desabonnes: [LEA], brute: [LEA], avantFusion: false, remplace: false, union: false });
  // Une lecture partie APRÈS l'écriture, elle, fait foi : la base dit « suivi », l'appareil suit.
  await page.waitForTimeout(20);
  await lectureRetenue(page);
  const apres = await page.evaluate(async (lea) => {
    window.__repondre([{ following_id: lea, status: "accepted" }]);
    _fusionnerSuivisServeur(await window.__lecture, true);
    return state.user.following.includes(lea);
  }, LEA);
  expect(apres, "sans geste plus récent que la lecture, la base fait foi").toBe(true);
});

for (const largeur of [320, 390]) {
  test(`④ ${largeur} px : le bouton reçoit son toucher sur 44 px, la légende ne passe pas sous la colonne d'actions`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 700 });
    await banc(page, "prive");
    const mesurer = () => page.evaluate(() => {
      const it = document.querySelector('#reelsList .reel-item[data-post-id="reel_lea_1"]');
      const b = it.querySelector(".reel-suivre"), r = b.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const info = it.querySelector(".reel-info").getBoundingClientRect(), col = it.querySelector(".reel-actions").getBoundingClientRect();
      const nom = it.querySelector(".reel-author-name").getBoundingClientRect();
      return { atteint: t === b, h: Math.round(r.height), droite: r.right, infoDroite: info.right, colGauche: col.left, colLargeur: Math.round(col.width), nom: Math.round(nom.width), vw: document.documentElement.clientWidth, deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    let m = await mesurer();
    expect(m.atteint).toBe(true);
    expect(m.h).toBeGreaterThanOrEqual(44);
    expect(m.droite, "le bouton reste dans la zone de texte").toBeLessThanOrEqual(m.infoDroite + 0.5);
    expect(m.infoDroite).toBeLessThanOrEqual(m.colGauche);
    expect(m.colLargeur, "la colonne d'actions garde sa largeur fixe").toBe(80);
    expect(m.nom, "le nom de l'auteur reste lisible").toBeGreaterThan(40);
    expect(m.deborde).toBe(false);
    // Libellé le plus long (« Demande envoyée ») : mêmes garanties.
    await bouton(page, "reel_lea_1").tap();
    await expect(bouton(page, "reel_lea_1")).toHaveText("Demande envoyée");
    m = await mesurer();
    expect(m.atteint).toBe(true);
    expect(m.droite).toBeLessThanOrEqual(m.infoDroite + 0.5);
    expect(m.infoDroite).toBeLessThanOrEqual(m.colGauche);
    expect(m.nom).toBeGreaterThan(40);
    expect(m.deborde).toBe(false);
  });
}

test("⑤ « Créer → Publication » : un seul geste retour ramène à l'écran d'origine", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.requireAuthentication = () => true; goTo("explore"); });
  await page.waitForFunction(() => document.getElementById("screen-explore").classList.contains("active"));
  await page.click('#appNavV2 [data-v2-action="create"]');
  await page.locator('#v2CreateSheet [data-v2-create="post"]').click();
  await page.waitForFunction(() => document.getElementById("screen-studio").classList.contains("active"), null, { timeout: 8000 });
  await expect(page.locator("#v2CreateSheet")).toBeHidden();
  // L'entrée d'historique courante est celle du Studio (la feuille « Créer » a rendu la sienne).
  await expect.poll(() => page.evaluate(() => (history.state || {}).screen)).toBe("studio");
  await page.goBack();
  await page.waitForFunction(() => document.getElementById("screen-explore").classList.contains("active"), null, { timeout: 8000 });
  expect(await page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, etat: (history.state || {}).overlay || null }))).toEqual({ ecran: "screen-explore", etat: null });
  // Les choix qui ouvrent un PANNEAU restent immédiats et se referment d'un retour.
  await page.click('#appNavV2 [data-v2-action="create"]');
  await page.locator('#v2CreateSheet [data-v2-create="irl"]').click();
  await page.waitForFunction(() => !!document.querySelector("#modalBackdrop.active #evTitle"), null, { timeout: 8000 });
  await page.goBack();
  await expect.poll(() => page.evaluate(() => !!document.querySelector("#modalBackdrop.active"))).toBe(false);
  expect(await page.evaluate(() => (document.querySelector(".screen.active") || {}).id)).toBe("screen-explore");
});
