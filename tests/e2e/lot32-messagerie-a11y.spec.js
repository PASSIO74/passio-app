// ═══════════════════════════════════════════════════════════════════════════
// LOT-32 (audit UX/UI du 2026-11-10) — MESSAGERIE : CIBLES ET NOMS
//   ① MSG-C10 / C75 : à 360 px, le retour et les boutons d'icône de l'en-tête
//      mesurent 44 × 44 (mesure par elementFromPoint) et portent un nom.
//   ② MSG-C75 : le champ de saisie dit à qui l'on écrit.
//   ③ MSG-C28 : recherches nommées, onglets du groupe annoncés, panneau
//      Paramètres annoncé comme une fenêtre.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LEA = "a1b2c3d4-0000-4000-8000-00000000c5a1";
const MALIK = "a1b2c3d4-0000-4000-8000-00000000c5a2";

test("① ② en-tête à 44 px, commandes nommées, champ étiqueté", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await bootOnboarded(page);
  const r = await page.evaluate(async ([lea, malik]) => {
    conversationsState = [
      { id: "c_dm", userId: lea, userName: "Léa Fontaine", lastAt: Date.now(), messages: [{ id: "m", from: lea, text: "salut", at: Date.now() }] },
      { id: "c_grp", isGroup: true, groupName: "Rando", userIds: [lea, malik], userId: lea, lastAt: Date.now(), messages: [{ id: "g", from: lea, text: "yo", at: Date.now() }] },
    ];
    const zone = (n) => {
      // Zone de 44 × 44 centrée : les milieux des quatre bords touchent la commande
      // (les coins tombent dans l'arrondi, que le test de contact respecte).
      const q = n.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      const touche = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && (e === n || n.contains(e))); };
      return touche(cx - 21, cy) && touche(cx + 21, cy) && touche(cx, cy - 21) && touche(cx, cy + 21);
    };
    const mesurer = async (id) => {
      openConversation(id);
      await new Promise((res) => setTimeout(res, 450));
      const cmds = Array.from(document.querySelectorAll("#convFpHead .conv-fp-back, #convFpHead .conv-action-btn"));
      return cmds.map((n) => ({ nom: n.getAttribute("aria-label") || "", zone44: zone(n) }));
    };
    const dm = await mesurer("c_dm");
    const champ = document.getElementById("convFpInput").getAttribute("aria-label");
    closeConversation();
    await new Promise((res) => setTimeout(res, 300));
    const grp = await mesurer("c_grp");
    return { dm, grp, champ };
  }, [LEA, MALIK]);
  for (const c of r.dm.concat(r.grp)) {
    expect(c.nom, "chaque commande a un nom").not.toBe("");
    expect(c.zone44, `« ${c.nom} » touchable sur 44 × 44`).toBe(true);
  }
  expect(r.grp.map((c) => c.nom)).toContain("Membres du groupe");
  expect(r.dm.map((c) => c.nom)).toContain("Paramètres de la conversation");
  expect(r.champ).toBe("Message à Léa Fontaine");
});

test("③ MSG-C28 : recherches nommées, onglets annoncés, Paramètres en fenêtre", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async ([lea, malik]) => {
    const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
    conversationsState = [{ id: "c_grp", isGroup: true, groupName: "Rando", createdBy: MY_UID, userIds: [lea, malik], userId: lea, lastAt: Date.now(), messages: [] }];
    openNewMessage();
    await attendre(150);
    const nm = document.getElementById("_nmSearch").getAttribute("aria-label");
    closeModal();
    showGroupMembers("c_grp");
    await attendre(80);
    const tabs = () => Array.from(document.querySelectorAll('#modalContent [role="tab"]')).map((t) => t.id + ":" + t.getAttribute("aria-selected"));
    const avant = tabs();
    switchGroupTab("add", true);
    const apres = tabs();
    const grp = document.getElementById("grpSearchInput").getAttribute("aria-label");
    closeModal();
    const p = document.getElementById("convSettingsPanel");
    return { nm, grp, avant, apres, role: p.getAttribute("role"), nomPanneau: p.getAttribute("aria-label") };
  }, [LEA, MALIK]);
  expect(r.nm).toBeTruthy();
  expect(r.grp).toBeTruthy();
  expect(r.avant).toEqual(["grpTab_members:true", "grpTab_add:false"]);
  expect(r.apres).toEqual(["grpTab_members:false", "grpTab_add:true"]);
  expect(r.role).toBe("dialog");
  expect(r.nomPanneau).toBe("Paramètres de la conversation");
});
