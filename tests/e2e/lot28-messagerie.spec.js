// ═══════════════════════════════════════════════════════════════════════════
// LOT-28 (audit UX/UI du 2026-11-10) — MESSAGERIE (SUITE)
//   ① MSG-C21 : un groupe n'a qu'une sortie, « Quitter le groupe » ; en 1:1,
//      « Supprimer pour moi ».
//   ② MSG-C29 : débloquer fait revenir la conversation dans la liste, sans geste.
//   ③ MSG-C23 / C22 : une panne de recherche dit « Pas de connexion », jamais
//      « Aucun utilisateur trouvé » ; mon propre compte n'est jamais proposé.
//   ④ MSG-C23 : un compte dont le groupe n'a pas été créé en base ne lit pas
//      « Groupe créé ».
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau —
// les appels serveur sont remplacés dans la page.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c2a1";
const MALIK = "a1b2c3d4-0000-4000-8000-00000000c2a2";

test("① MSG-C21 : « Quitter le groupe » pour un groupe, « Supprimer pour moi » en 1:1", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(([lea, malik]) => {
    conversationsState = [
      { id: "c_dm", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "m1", from: lea, text: "salut", at: Date.now() }] },
      { id: "c_grp", isGroup: true, groupName: "Rando", userIds: [lea, malik], userId: lea, lastAt: Date.now(), messages: [] },
    ];
    const libelles = (id) => { openConvSettings(id); return Array.from(document.querySelectorAll("#convSettingsPanel .csetting-label, .conv-settings-panel .csetting-label")).map((x) => x.textContent); };
    const groupe = libelles("c_grp");
    try { closeConvSettings(); } catch (e) {}
    const dm = libelles("c_dm");
    try { closeConvSettings(); } catch (e) {}
    return { groupe, dm };
  }, [LEA, MALIK]);
  expect(r.groupe.length, "le panneau s'est peint").toBeGreaterThan(3);
  expect(r.groupe).toContain("Quitter le groupe");
  expect(r.groupe.join("|")).not.toMatch(/Supprimer/);
  expect(r.dm).toContain("Supprimer pour moi");
  expect(r.dm).not.toContain("Quitter le groupe");
});

test("② MSG-C29 : après un déblocage, la conversation revient dans la liste", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    window._convNetLoaded = true;
    state.user.blocked = [lea];
    conversationsState = [{ id: "c_lea", userId: lea, userName: "Léa", lastAt: Date.now(), messages: [{ id: "m", from: lea, text: "hé", at: Date.now() }] }];
    goTo("messages");
    renderMessages();
    const avant = document.querySelectorAll(".msg-card").length;
    await unblockUser(lea, "Léa");
    const apres = document.querySelectorAll(".msg-card").length;
    return { avant, apres };
  }, LEA);
  expect(r.avant, "bloquée : absente").toBe(0);
  expect(r.apres, "débloquée : présente, sans autre rendu").toBe(1);
});

test("③ MSG-C23 / C22 : la panne se dit, mon compte n'est jamais proposé", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (malik) => {
    const attendre = () => new Promise((res) => setTimeout(res, 60));
    window.supaSearchUsers = async () => { const v = []; v.echec = true; return v; };
    openNewMessage();
    await new Promise((res) => setTimeout(res, 150));
    const champ = document.getElementById("_nmSearch");
    champ.value = "zzqx";
    _nmDoSearch("zzqx");
    await attendre();
    const panne = document.getElementById("_nmResults").textContent.trim();
    window.supaSearchUsers = async () => [
      { id: MY_UID, username: "Moi-même zzqx" },
      { id: malik, username: "Malik zzqx" },
    ];
    _nmDoSearch("zzqx");
    await attendre();
    const noms = Array.from(document.querySelectorAll("#_nmResults ._nm-row")).map((x) => x.getAttribute("data-uid"));
    return { panne, noms, moi: MY_UID };
  }, MALIK);
  expect(r.panne).toMatch(/Pas de connexion/);
  expect(r.panne).not.toMatch(/Aucun utilisateur/);
  expect(r.noms).toEqual([MALIK]);
});

test("④ MSG-C23 : un groupe que le serveur n'a pas créé n'est pas annoncé « créé »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async (lea) => {
    const toasts = [];
    window.toast = (t) => { toasts.push(String(t)); };
    window._supaReal = true;
    window._compteAuthReel = () => true;
    window.supaCreateGroup = async () => null;
    conversationsState = [];
    const zone = document.createElement("div");
    zone.innerHTML = '<input id="groupName" value="Rando"><label class="group-passion-option selected"><input value="randonnee"></label>';
    document.body.appendChild(zone);
    window._grpSel = new Map([[lea, "Léa"]]);
    await confirmCreateGroup();
    zone.remove();
    return { toasts, convs: (getConversations() || []).filter((c) => c && c.isGroup).length };
  }, LEA);
  expect(r.toasts.join("|")).not.toMatch(/créé$|» créé/);
  expect(r.toasts.join("|")).toMatch(/pas pu être créé|pas créé/);
  expect(r.convs, "aucune ébauche locale annoncée").toBe(0);
});
