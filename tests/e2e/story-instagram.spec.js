// ═══════════════════════════════════════════════════════════════════════════
// STORY FAÇON INSTAGRAM (2026-11-14) — interagir sans quitter la story
//   ① ❤️ : bascule, reste rouge à la réouverture ; le PREMIER j'aime d'une
//      story d'un compte réel prévient l'auteur (un message), jamais deux ;
//   ② réaction rapide : un message vers l'auteur, la story reste ouverte ;
//   ③ story d'exemple : ❤️ local et partager, aucun champ, aucun message ;
//   ④ ma story : « Nouvelle story » et partager, pas de ❤️ ;
//   ⑤ partager : la feuille « Partager cette story » s'ouvre et la story se
//      met en pause tant qu'elle est ouverte ;
//   ⑥ gestes : balayer à gauche passe à l'auteur suivant, vers le bas ferme.
// Compte local simulé ; l'envoi réseau est remplacé par un compteur.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "a1b2c3d4-0000-4000-8000-00000000c860";
const LEA = "a1b2c3d4-0000-4000-8000-00000000c861";
const SAM = "a1b2c3d4-0000-4000-8000-00000000c862";

async function banc(page) {
  await bootOnboarded(page);
  await page.evaluate(({ moi, lea, sam }) => {
    MY_UID = moi;
    window._uidEstUnCompte = () => true;
    window.requireAuthentication = () => true;
    window.__envois = [];
    window._sendTextToSupa = (convId, msgId, contenu) => { window.__envois.push({ convId, contenu }); };
    const st = (id, auteur, nom, texte) => ({ id, authorId: auteur, authorName: nom, text: texte, createdAt: Date.now() - 600000, bg: "#7c3aed" });
    window.__ouvrir = (quoi) => {
      const groupes = {
        reels: [
          { authorId: lea, stories: [st("s_ig_1", lea, "Léa", "Sortie vélo dimanche"), st("s_ig_2", lea, "Léa", "Le parcours")] },
          { authorId: sam, stories: [st("s_ig_3", sam, "Sam", "Atelier poterie")] },
        ],
        exemple: [{ authorId: "u_lea", stories: [st("s_ig_ex", "u_lea", "Léa Moreau", "Exemple")] }],
        mienne: [{ authorId: moi, stories: [st("s_ig_moi", moi, "Moi", "Ma story")] }],
      };
      storyGroups = groupes[quoi];
      openStoryViewerAt(0, 0);
    };
  }, { moi: MOI, lea: LEA, sam: SAM });
}

const actif = (page) => page.evaluate(() => document.getElementById("storyViewer").classList.contains("active"));

test("① ❤️ bascule, persiste, et ne prévient l'auteur qu'une fois", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  const coeur = page.locator("#storyLikeBtn");
  await expect(coeur).toHaveAttribute("aria-pressed", "false");
  await coeur.click();
  await expect(coeur).toHaveAttribute("aria-pressed", "true");
  await expect(coeur).toHaveClass(/aimee/);
  await coeur.click(); // je n'aime plus
  await expect(coeur).toHaveAttribute("aria-pressed", "false");
  await coeur.click(); // j'aime de nouveau
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    aimees: state.user.likedStories.slice(),
    envois: window.__envois.map((e) => JSON.parse(e.contenu).text),
  }));
  expect(r.aimees).toEqual(["s_ig_1"]);
  expect(r.envois.length, "un seul message, au premier j'aime").toBe(1);
  expect(r.envois[0]).toContain("J'ai aimé ta story");
  expect(r.envois[0]).toContain("Sortie vélo dimanche");
  // Réouverture : le cœur est toujours rouge.
  await page.evaluate(() => { closeStoryViewer(); window.__ouvrir("reels"); });
  await expect(page.locator("#storyLikeBtn")).toHaveAttribute("aria-pressed", "true");
});

test("② réaction rapide : un message vers l'auteur, la story reste ouverte", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  await page.locator("#storyReplyBar .story-reply-input").click();
  const rangee = page.locator("#storyReactions");
  await expect(rangee).toBeVisible();
  await rangee.locator(".story-reaction-btn", { hasText: "🔥" }).click();
  await page.waitForTimeout(300);
  const r = await page.evaluate((lea) => ({
    envois: window.__envois.map((e) => JSON.parse(e.contenu).text),
    conv: (getConversations().find((c) => c && !c.isGroup && c.userId === lea) || {}).id || null,
  }), LEA);
  expect(r.envois).toHaveLength(1);
  expect(r.envois[0].startsWith("🔥")).toBe(true);
  expect(r.conv, "le message est rangé dans le fil direct de l'auteur").not.toBeNull();
  expect(await actif(page)).toBe(true);
});

test("③ story d'exemple : ❤️ local et partager, ni champ ni message", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("exemple"));
  await expect(page.locator("#storyReplyBar")).toHaveCount(0);
  await expect(page.locator("#storyShareBtn")).toBeVisible();
  await page.locator("#storyLikeBtn").click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ aimees: state.user.likedStories.slice(), envois: window.__envois.length }));
  expect(r.aimees).toEqual(["s_ig_ex"]);
  expect(r.envois).toBe(0);
});

test("④ ma story : « Nouvelle story » et partager, pas de ❤️", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("mienne"));
  await expect(page.locator("#storyNouvelleBtn")).toBeVisible();
  await expect(page.locator("#storyShareBtn")).toBeVisible();
  await expect(page.locator("#storyLikeBtn")).toHaveCount(0);
  await expect(page.locator("#storyReplyBar")).toHaveCount(0);
});

test("⑤ partager ouvre la feuille de la story et met la lecture en pause", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  await page.locator("#storyShareBtn").click();
  await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Partager cette story");
  const largeur = () => page.evaluate(() => parseFloat(document.getElementById("sp-" + storyItemIdx).style.width) || 0);
  const avant = await largeur();
  await page.waitForTimeout(900);
  expect(await largeur() - avant, "la barre ne progresse pas sous la feuille").toBeLessThan(3);
  await page.evaluate(() => closeModal());
  await page.waitForTimeout(900);
  expect(await largeur(), "elle reprend à la fermeture").toBeGreaterThan(avant + 5);
});

test("⑥ gestes : balayer à gauche change d'auteur, vers le bas ferme", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  const b = await page.locator("#storyCard").boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.move(cx + 80, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.move(cx - 80, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const apres = await page.evaluate(() => ({ g: storyGroupIdx, auteur: storyGroups[storyGroupIdx].authorId }));
  expect(apres.auteur, "auteur suivant").toBe(SAM);

  await page.mouse.move(cx, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 20, { steps: 4 });
  await page.mouse.move(cx, cy + 120, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await actif(page), "balayer vers le bas ferme").toBe(false);
});
