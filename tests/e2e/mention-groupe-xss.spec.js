// MSG-02 — @mentions de groupe : le pseudo d'un membre s'exécutait au survol.
//
// `_mentionDetect` (app-04) rendait chaque suggestion par une chaîne HTML :
//   '<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')">'
// Seule l'apostrophe était échappée. Un guillemet double FERME l'attribut, et
// la suite du pseudo devient un nouvel attribut — `onmouseover="…"` compris.
// Or le pseudo est celui d'un AUTRE compte (`_groupMemberName` → `userById` →
// `profiles.username`, posé sans contrainte de caractères, par l'appli ou par
// REST), et la CSP de production autorise `script-src 'unsafe-inline'` : le
// handler injecté s'exécute chez tout membre du groupe qui survole la ligne.
//
// La preuve est ACTIVE, comme dans `echappement.spec.js` : la charge appelle
// `window.__pwn()`, et le survol est un `page.hover` réel, pas un dispatchEvent.
// Chercher la chaîne dans le DOM ne prouverait rien — un pseudo correctement
// rendu y figure en clair, comme du texte, et reste inerte.
//
// Le second bloc garde le FONCTIONNEMENT : un correctif qui rendrait la boîte
// inerte en cassant la sélection (apostrophe, guillemet, `$'` interprété par
// `String.replace`) ne serait pas une correction.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Un guillemet double sort de l'attribut ; `data-x="` ré-absorbe la fin de
// l'ancienne chaîne (`')"`) pour que le HTML reste bien formé — c'est la forme
// qu'un attaquant choisirait, pas un cas d'école.
const PSEUDO_HOSTILE = 'x" onmouseover="window.__pwn()" data-x="';

async function ouvrirGroupe(page, membres) {
  await page.evaluate(async (membres) => {
    window.__xss = 0;
    window.__pwn = function () { window.__xss++; };
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    try { fermerHint(); } catch (e) {}
    // Les membres entrent par le chemin réel des profils distants : c'est
    // `cacheRemoteProfile` qui alimente `userById`, donc `_groupMemberName`.
    membres.forEach((m) => cacheRemoteProfile({ id: m.id, username: m.name, color: "#7c3aed", emoji: "✨" }));
    const convs = getConversations();
    const conv = {
      id: "conv_mention_xss", isGroup: true, groupName: "Groupe test",
      userIds: membres.map((m) => m.id), unread: 0, lastAt: Date.now(), messages: [],
    };
    const i = convs.findIndex((c) => c.id === conv.id);
    if (i >= 0) convs[i] = conv; else convs.unshift(conv);
    await openConversation(conv.id);
  }, membres);
  await expect(page.locator("#conv-fullpage #convFpInput")).toBeVisible();
}

// Tape dans le VRAI composeur : l'événement `input` passe par `onConvInputTyping`,
// qui appelle `_mentionDetect` — le chemin de production, pas un appel direct.
async function taperMention(page, texte) {
  const input = page.locator("#convFpInput");
  await input.click();
  await input.fill("");
  await page.keyboard.type(texte);
  await expect(page.locator("#convMentionBox")).toBeVisible();
  return page.locator("#convMentionBox > *");
}

test.describe("MSG-02 — @mentions de groupe, pseudo hostile", () => {
  test("un pseudo avec guillemet n'injecte ni attribut ni script, et reste affiché comme du texte", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirGroupe(page, [
      { id: "u_hostile", name: PSEUDO_HOSTILE },
      { id: "u_temoin", name: "Témoin" },
    ]);
    const lignes = await taperMention(page, "@");

    // Prémisse : les deux membres sont proposés, sinon le test ne prouve rien.
    await expect(lignes).toHaveCount(2);

    // Survol RÉEL de chaque suggestion : c'est là que la charge se déclenchait.
    const n = await lignes.count();
    for (let i = 0; i < n; i++) await lignes.nth(i).hover();
    expect(await page.evaluate(() => window.__xss), "aucune exécution au survol").toBe(0);

    // Aucun attribut de handler, aucun attribut parasite, nulle part dans la boîte.
    const attributs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#convMentionBox *"))
        .flatMap((el) => Array.from(el.attributes).map((a) => a.name))
        .filter((nom) => /^on|^data-x$/.test(nom)));
    expect(attributs, "pas d'attribut on* ni data-x injecté").toEqual([]);

    // Neutralisé, pas supprimé : le pseudo est affiché tel quel, comme du texte.
    await expect(lignes.first()).toContainText(PSEUDO_HOSTILE);
  });

  test("survol puis choix d'un pseudo hostile : il est inséré comme texte, sans exécution", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirGroupe(page, [{ id: "u_hostile", name: PSEUDO_HOSTILE }]);
    const lignes = await taperMention(page, "Salut @");
    await expect(lignes).toHaveCount(1);
    await lignes.first().hover();
    await lignes.first().click();
    expect(await page.evaluate(() => window.__xss)).toBe(0);
    await expect(page.locator("#convFpInput")).toHaveValue("Salut @" + PSEUDO_HOSTILE + " ");
    await expect(page.locator("#convMentionBox")).toHaveCount(0);
  });
});

test.describe("MSG-02 — @mentions de groupe, le fonctionnement est préservé", () => {
  test("le filtre et la sélection marchent, apostrophe et guillemet compris", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirGroupe(page, [
      { id: "u_benj", name: 'Ben\'j O"Neil' },
      { id: "u_lea", name: "Léa" },
    ]);

    // « @ » seul propose tout le monde ; « @ben » ne garde que Ben.
    await expect(await taperMention(page, "@")).toHaveCount(2);
    const lignes = await taperMention(page, "@ben");
    await expect(lignes).toHaveCount(1);
    await expect(lignes.first()).toHaveText(/Ben'j O"Neil/);

    await lignes.first().click();
    await expect(page.locator("#convFpInput")).toHaveValue('@Ben\'j O"Neil ');
    await expect(page.locator("#convMentionBox")).toHaveCount(0);
    // Le composeur garde le focus : on peut continuer à écrire.
    await expect(page.locator("#convFpInput")).toBeFocused();
  });

  test("un pseudo avec `$` est inséré tel quel (pas interprété par String.replace)", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirGroupe(page, [{ id: "u_jo", name: "Jo$$y $& $'" }]);
    const lignes = await taperMention(page, "Hello @jo");
    await expect(lignes).toHaveCount(1);
    await lignes.first().click();
    await expect(page.locator("#convFpInput")).toHaveValue("Hello @Jo$$y $& $' ");
  });

  test("la boîte disparaît quand le texte ne se termine plus par une mention", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirGroupe(page, [{ id: "u_lea", name: "Léa" }]);
    await taperMention(page, "@");
    await page.keyboard.type("zzz");
    await expect(page.locator("#convMentionBox")).toHaveCount(0);
  });
});
