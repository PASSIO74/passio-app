// ═══════════════════════════════════════════════════════════════════════════
// LOT-5 (audit UX/UI du 2026-11-10) — LES EXEMPLES NE SE FONT PLUS PASSER POUR
// DE VRAIES PERSONNES
//   ① MSG-C03 : « Nouveau message » ne propose à un compte que de vraies personnes.
//   ② MSG-C04 : « Nouveau groupe » cherche de vraies personnes, garde la sélection,
//        et dit qui n'a pas pu être ajouté.
//   ③ REC-C02 : un personnage d'exemple ne se suit pas — ni en local, ni en base ;
//        son bouton dit « Exemple ».
//   ④ IRL-C01 : une activité d'exemple n'offre pas « Je participe ».
//   ⑤ BOB-C22 : bobines réelles d'abord, exemples marqués, carte de fin.
//   ⑥ PCS-006 : les vraies conversations avant les conversations d'exemple.
// Faux serveur local : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a";
const LEA = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01";
const MALIK = "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbb02";

// Un COMPTE réel (forme d'un uuid), comme les suites de verdicts.
async function bootCompte(page) {
  await page.addInitScript((moi) => { try { localStorage.setItem("passio_uid", moi); } catch (e) {} }, MOI);
  await bootOnboarded(page);
  expect(await page.evaluate(() => _compteAuthReel()), "prémisse : un compte").toBe(true);
}

const exemples = (page) => page.evaluate(() => (state.seed.users || []).filter((u) => !u.distant).map((u) => u.id));

test("① MSG-C03 : « Nouveau message » ne propose que de vraies personnes, et une consigne sans contact", async ({ page }) => {
  await bootCompte(page);
  const ex = await exemples(page);
  expect(ex.length, "prémisse : le socle a des personnages d'exemple").toBeGreaterThan(5);
  await page.evaluate(() => { window.supaSearchUsers = async () => []; openNewMessage(); _nmDoSearch(""); });
  const vide = await page.evaluate(() => document.getElementById("_nmResults").textContent);
  expect(vide).toContain("Écris le nom d'une personne");
  // Un vrai contact : il est proposé ; un exemple tapé par son nom, non.
  await page.evaluate(([lea]) => {
    getConversations().push({ id: "c_lea_l5", userId: lea, userName: "Léa Fontaine", messages: [], lastAt: Date.now(), unread: 0 });
    _nmDoSearch("");
  }, [LEA]);
  const ids = () => page.evaluate(() => [...document.querySelectorAll("#_nmResults [data-uid]")].map((e) => e.getAttribute("data-uid")).join(" "));
  expect(await ids()).toContain(LEA);
  const nomExemple = await page.evaluate((id) => state.seed.users.find((u) => u.id === id).name, ex[1]);
  await page.evaluate((q) => _nmDoSearch(q), nomExemple.split(" ")[0]);
  for (const id of ex) expect(await ids(), "aucun personnage d'exemple : " + id).not.toContain(id);
});

test("② MSG-C04 : « Nouveau groupe » cherche de vraies personnes, garde la sélection, dit qui manque", async ({ page }) => {
  await bootCompte(page);
  const ex = await exemples(page);
  await page.evaluate(([lea, malik]) => {
    window.supaSearchUsers = async (q) => [{ id: lea, username: "Léa Fontaine" }, { id: malik, username: "Malik Haddad" }]
      .filter((u) => plierRecherche(u.username).includes(plierRecherche(q)));
    openCreateGroup();
  }, [LEA, MALIK]);
  const m = page.locator("#modalContent");
  await expect(m.locator("#grpNewSearch")).toBeVisible();
  for (const id of ex) await expect(m.locator('.group-user-option[data-uid="' + id + '"]'), "aucun exemple proposé").toHaveCount(0);
  await m.locator("#grpNewSearch").fill("lea");
  await m.locator('.group-user-option[data-uid="' + LEA + '"]').click();
  await m.locator("#grpNewSearch").fill("malik");
  await expect(m.locator('.group-user-option[data-uid="' + LEA + '"].selected'), "la sélection survit à une nouvelle recherche").toHaveCount(1);
  await m.locator('.group-user-option[data-uid="' + MALIK + '"]').click();
  // La base refuse Malik : l'écran le dit, et le groupe ne le compte pas.
  await page.evaluate(([malik]) => {
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); try { return vrai.apply(this, arguments); } catch (e) {} };
    window.supaCreateGroup = async (nom, membres, passion, rapport) => { if (rapport) rapport.refuses = [malik]; return "grp_l5_test"; };
    document.getElementById("groupName").value = "Jam du jeudi";
    const p = document.querySelector(".group-passion-option"); if (p && !p.classList.contains("selected")) p.click();
  }, [MALIK]);
  await page.evaluate(() => confirmCreateGroup());
  const r = await page.evaluate(() => ({ toasts: window.__toasts, c: (getConversations().find((x) => x.groupName === "Jam du jeudi") || {}).userIds }));
  expect(r.toasts.join(" | ")).toContain("pas pu ajouter : Malik Haddad");
  expect(r.c).toEqual([LEA]);
});

test("③ REC-C02 : un personnage d'exemple ne se suit pas, et son bouton le dit", async ({ page }) => {
  await bootCompte(page);
  const ex = await exemples(page);
  const cible = ex[0];
  const r = await page.evaluate(async (id) => {
    window.__ecritures = [];
    window.__toasts = [];
    const vrai = window.toast;
    window.toast = function (t) { window.__toasts.push(String(t)); try { return vrai.apply(this, arguments); } catch (e) {} };
    const avant = (state.user.following || []).slice();
    toggleFollowUser(id, "Exemple");
    const ecrit = await supaFollowUser(id);
    return { libelle: libelleBoutonSuivi(id), attrs: attrsBoutonSuivi(id), suivi: (state.user.following || []).includes(id), avant: avant.includes(id), ecrit, toasts: window.__toasts };
  }, cible);
  expect(r.libelle).toBe("Exemple");
  expect(r.attrs).toContain("disabled");
  expect(r.suivi, "rien n'est suivi en local").toBe(false);
  expect(r.ecrit, "rien ne part en base").toEqual({ ok: false, exemple: true });
  expect(r.toasts.join(" ")).toContain("profil d'exemple");
  // Un vrai compte garde son bouton « Suivre ».
  expect(await page.evaluate((lea) => libelleBoutonSuivi(lea), LEA)).toBe("Suivre");
});

test("④ IRL-C01 : une activité d'exemple montre « Exemple », pas « Je participe »", async ({ page }) => {
  await page.addInitScript(() => {
    try { const g = navigator.geolocation; if (g) Object.defineProperty(g, "getCurrentPosition", { configurable: true, value: function () {} }); } catch (e) {}
  });
  await bootOnboarded(page, null, 1);
  await page.evaluate(() => { window.supaLoadPosts = async () => []; goTo("irl"); });
  await page.waitForTimeout(700);
  const carte = page.locator("#eventList .event-card").first();
  await expect(carte).toBeVisible();
  const id = await carte.getAttribute("data-evid");
  expect(await page.evaluate((i) => PassioFirstRun.masquerChiffresDemo(state.seed.events.find((e) => e.id === i)), id), "prémisse : une activité d'exemple").toBe(true);
  await expect(carte.locator('[data-v4a2-act="exemple"]')).toHaveText("Exemple");
  await expect(carte.locator('[data-v4a2-act="go"]')).toHaveCount(0);
  await expect(carte).toContainText("Activité d'exemple · pas d'inscription");
});

test("⑤ BOB-C22 : les vraies bobines d'abord, les exemples marqués, et une fin qui le dit", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => {
    state.supabasePosts = [{ id: "reel_vrai_l5", isReel: true, type: "video", video: "data:video/mp4;base64,AAAA", authorId: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaa01", authorName: "Léa", passion: "musique", mood: "creation", text: "Ma vraie bobine", createdAt: Date.now() - 86400000 * 30, fromSupabase: true }];
    openReels();
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const items = [...document.querySelectorAll("#reelsList .reel-item")];
    return {
      premier: items[0] && items[0].getAttribute("data-post-id"),
      premierMarque: !!(items[0] && items[0].querySelector(".reel-exemple")),
      exemplesMarques: items.slice(1).filter((x) => x.querySelector(".reel-exemple .fr-demo-tag")).length,
      autres: items.length - 1,
      fin: (document.querySelector("#reelsList > :last-child") || {}).className,
      finTexte: (document.querySelector("#reelsList .reels-fin") || {}).textContent || "",
    };
  });
  expect(r.autres, "prémisse : des bobines d'exemple").toBeGreaterThan(3);
  expect(r.premier, "la vraie bobine passe devant, même plus ancienne").toBe("reel_vrai_l5");
  expect(r.premierMarque).toBe(false);
  expect(r.exemplesMarques, "chaque exemple porte l'étiquette").toBe(r.autres);
  expect(r.fin).toContain("reels-fin");
  expect(r.finTexte).toContain("Tu as tout vu");
});

test("⑥ PCS-006 : les vraies conversations passent devant les conversations d'exemple", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((lea) => {
    const ex = state.seed.users.find((u) => !u.distant);
    const cs = getConversations();
    cs.push({ id: "c_ex_l5", userId: ex.id, userName: ex.name, messages: [], lastAt: Date.now(), unread: 0 });
    cs.push({ id: "c_vrai_l5", userId: lea, userName: "Léa Fontaine", messages: [], lastAt: Date.now() - 86400000, unread: 0 });
    saveConversationsNow();
    goTo("messages"); renderMessages();
    const noms = [...document.querySelectorAll(".msg-card .msg-name")].map((e) => e.textContent.trim());
    return { iVrai: noms.indexOf("Léa Fontaine"), iEx: noms.indexOf(ex.name) };
  }, LEA);
  expect(r.iVrai).toBeGreaterThanOrEqual(0);
  expect(r.iEx).toBeGreaterThanOrEqual(0);
  expect(r.iVrai, "la vraie, plus ancienne, avant l'exemple").toBeLessThan(r.iEx);
});
