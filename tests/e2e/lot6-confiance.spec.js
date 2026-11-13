// ═══════════════════════════════════════════════════════════════════════════
// LOT-6 (audit UX/UI du 2026-11-10) — CONFIANCE : SUIVRE, BLOQUER, SIGNALER, CONFIRMER
//   ① TRA-C11 : plus aucun confirm()/prompt() natif ; les gestes passent par une
//        feuille de l'application qui dit les conséquences.
//   ② TRA-C10 : bloquer se confirme, avec ses effets, depuis toutes les portes.
//   ③ REC-C03 : une personne bloquée n'est ni suggérée ni proposée.
//   ④ REC-C01 : les boutons « Suivre » visibles sont repeints quand l'état arrive.
//   ⑤ PRO-C05 : les compteurs et listes d'abonnés ne lisent que les acceptés.
//   ⑥ PRO-C03 : un pseudo vide ou réservé est refusé, sous le champ.
//   ⑦ BOB-C04 : une bobine se signale depuis le lecteur.
//   ⑧ TRA-C17 : « Signaler cet événement » n'est plus sous le pied collant.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");

test("① TRA-C11 : aucune boîte native dans le code de l'application", async () => {
  const dossier = path.join(RACINE, "js");
  const restes = [];
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith(".js"))) {
    fs.readFileSync(path.join(dossier, f), "utf8").split("\n").forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, "");
      if (/(^|[^.\w$])(window\.)?(confirm|prompt)\s*\(/.test(code)) restes.push(f + ":" + (i + 1));
    });
  }
  expect(restes).toEqual([]);
});

test("① bis : quitter un groupe et sa description passent par la feuille ; Annuler ne fait rien", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    getConversations().push({ id: "grp_l6", isGroup: true, groupName: "Jam", userIds: ["aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01"], createdBy: MY_UID, messages: [], lastAt: Date.now(), unread: 0, groupDesc: "Avant" });
    saveConversationsNow();
    window.__natif = 0;
    window.confirm = () => { window.__natif++; return true; };
    window.prompt = () => { window.__natif++; return "x"; };
  });
  const feuille = page.locator("#feuilleConfirmation");
  page.evaluate(() => { leaveGroup("grp_l6"); });
  await expect(feuille).toContainText("Quitter ce groupe ?");
  await feuille.locator('[data-conf="annuler"]').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => getConversations().some((c) => c.id === "grp_l6")), "Annuler : le groupe reste").toBe(true);
  page.evaluate(() => { editGroupDescription("grp_l6"); });
  await expect(page.locator("#feuilleConfirmationChamp")).toHaveValue("Avant");
  await page.locator("#feuilleConfirmationChamp").fill("Après");
  await feuille.locator('[data-conf="ok"]').click();
  await expect.poll(() => page.evaluate(() => getConversations().find((c) => c.id === "grp_l6").groupDesc)).toBe("Après");
  expect(await page.evaluate(() => window.__natif), "aucune boîte native").toBe(0);
});

test("② TRA-C10 : bloquer dit ses effets et ne bloque qu'au choix", async ({ page }) => {
  await bootOnboarded(page);
  const CIBLE = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01";
  page.evaluate((c) => { demanderBlocage(c, "Léa Fontaine"); }, CIBLE);
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toContainText("Bloquer Léa Fontaine ?");
  await expect(feuille).toContainText("l'abonnement est retiré");
  await feuille.locator('[data-conf="annuler"]').click();
  expect(await page.evaluate((c) => isBlocked(c), CIBLE)).toBe(false);
  page.evaluate((c) => { demanderBlocage(c, "Léa Fontaine"); }, CIBLE);
  await feuille.locator('[data-conf="ok"]').click();
  await expect.poll(() => page.evaluate((c) => isBlocked(c), CIBLE)).toBe(true);
});

test("③ REC-C03 : une personne bloquée n'est ni dans « Créateurs à suivre » ni dans les créateurs d'une passion", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const u = state.seed.users[0];
    state.user.blocked = [u.id];
    goTo("explore"); renderExplorer();
    openPassionExplorer(u.passion);
    return {
      suggeres: !!document.querySelector('#suggestedCreators [data-follow-uid="' + u.id + '"]'),
      fiche: !!document.querySelector('#pexCreators [data-follow-uid="' + u.id + '"]'),
    };
  });
  expect(r).toEqual({ suggeres: false, fiche: false });
});

test("④ REC-C01 : les boutons « Suivre » déjà peints suivent l'état quand il arrive", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    state.seed.users.forEach((x) => { x.distant = true; });   // de vrais profils (LOT-5)
    state.user.following = [];
    goTo("explore"); renderExplorer();
    const b = document.querySelector("#suggestedCreators [data-follow-uid]");
    const uid = b.getAttribute("data-follow-uid");
    const avant = b.textContent.trim();
    state.user.following = [uid];          // l'état arrive du serveur…
    repeindreBoutonsSuiviVisibles();       // …et l'écran le suit
    return { avant, apres: b.textContent.trim() };
  });
  expect(r.avant).toBe("Suivre");
  expect(r.apres).toContain("Suivi");
});

test("⑤ PRO-C05 : une demande en attente n'est pas comptée comme abonné", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const appels = [];
    const q = { eq(col, v) { appels.push(col + "=" + v); return q; } };
    window._followsSansStatut = false;
    seulementAbonnementsAcceptes(q);
    const avecStatut = appels.slice();
    appels.length = 0;
    window._followsSansStatut = true;
    seulementAbonnementsAcceptes(q);
    return { avecStatut, sansStatut: appels.slice() };
  });
  expect(r.avecStatut).toEqual(["status=accepted"]);
  expect(r.sansStatut, "base ancienne sans colonne status : requête inchangée").toEqual([]);
  // Les lectures de compteurs et de listes passent toutes par lui.
  const sources = ["app-04-comments-shop.js", "app-05-config-profil.js", "app-06-reels-partage.js"].map((f) => fs.readFileSync(path.join(RACINE, "js", f), "utf8")).join("\n");
  const lectures = sources.split("\n").filter((l) => /from\("follows"\)\.select\(/.test(l) && /following_id|follower_id/.test(l));
  for (const l of lectures) expect(l, "lecture d'abonnés non filtrée").toContain("seulementAbonnementsAcceptes(");
});

test("⑥ PRO-C03 : pseudo vide ou réservé : refusé sous le champ, rien n'est enregistré", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.supaUsernameTaken = async () => null; window.supaSaveProfile = async () => { window.__save = (window.__save || 0) + 1; return true; }; openEditMainProfile(); });
  const champ = page.locator("#editUsername");
  await expect(champ).toBeVisible();
  const avant = await page.evaluate(() => state.user.general && state.user.general.username);
  for (const [saisie, attendu] of [["", "Choisis un pseudo"], ["Admin", "réservé"]]) {
    await champ.fill(saisie);
    await page.evaluate(() => saveMainProfile());
    await expect(page.locator("#editUsernameErreur")).toContainText(attendu);
    await expect(champ).toHaveAttribute("aria-invalid", "true");
    expect(await page.evaluate(() => state.user.general && state.user.general.username)).toBe(avant);
  }
});

test("⑦ BOB-C04 : « Plus » sur une bobine d'autrui propose « Signaler », qui passe par le signalement existant", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { window.__signale = null; window.reportPost = (id) => { window.__signale = id; }; openReels(); });
  const plus = page.locator(".reel-item .reel-plus-btn").first();
  await expect(plus).toBeVisible();
  const id = await page.locator(".reel-item").first().getAttribute("data-post-id");
  await plus.click();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille.locator('[data-conf="signaler"]')).toHaveText("Signaler cette bobine");
  await feuille.locator('[data-conf="signaler"]').click();
  expect(await page.evaluate(() => window.__signale)).toBe(id);
});

test("⑧ TRA-C17 : au bas de la fiche d'activité, « Signaler cet événement » est au-dessus du pied collant", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootOnboarded(page);
  const id = await page.evaluate(() => {
    const ev = (state.seed.events || []).find((e) => e.organizerId !== MY_UID && e.date > Date.now());
    // Comme dans la mesure de l'audit : en PARTICIPANT, le pied est le plus haut
    // (« ✓ Tu participes », la date, la suite proposée, le retrait).
    ev.id = "ev_l6_" + ev.id;   // une vraie activité, pas un exemple (LOT-5 n'y propose pas de participer)
    state.user.joinedEvents = [ev.id];
    state.user.eventRsvp = { [ev.id]: "going" };
    ev.attendees = (ev.attendees || []).concat([MY_UID]);
    openEventDetails(ev.id);
    return ev.id;
  });
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const page = document.getElementById("eventDetailPage");
    const sc = [page, ...page.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) || page;
    sc.scrollTop = sc.scrollHeight;
    const b = [...page.querySelectorAll("button")].find((x) => /Signaler cette activité/.test(x.textContent));
    if (!b) return { absent: true };
    // On mesure le bouton CONTRE LE PIED collant : c'est lui qui le recouvrait
    // (une bulle d'aide passagère peut aussi se poser là, elle n'est pas l'objet).
    const rb = b.getBoundingClientRect();
    const rc = document.getElementById("eventDetailCta").getBoundingClientRect();
    return { absent: false, piedHaut: Math.round(rc.height), basBouton: Math.round(rb.bottom), hautPied: Math.round(rc.top) };
  });
  expect(r.absent, "prémisse : le bouton existe").toBe(false);
  expect(r.piedHaut, "prémisse : pied d'un participant, plus haut que la marge fixe d'avant (100 px)").toBeGreaterThan(120);
  expect(r.basBouton, "le bouton finit au-dessus du pied collant").toBeLessThanOrEqual(r.hautPied);
});
