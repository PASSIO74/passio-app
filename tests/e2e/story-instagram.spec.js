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

test("②bis 💬 sans table de commentaires (migration non appliquée) : le bouton ouvre le champ, le message part à l'auteur", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  await page.locator("#storyCommentBtn").click();
  const champ = page.locator("#storyReplyBar .story-reply-input");
  await expect(champ).toBeFocused();
  await champ.fill("Magnifique parcours");
  await champ.press("Enter");
  await page.waitForTimeout(300);
  const envois = await page.evaluate(() => window.__envois.map((e) => JSON.parse(e.contenu).text));
  expect(envois).toHaveLength(1);
  expect(envois[0]).toContain("Ta story");
  expect(envois[0]).toContain("Magnifique parcours");
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

test("⑦ un brouillon local périmé : le message va au fil que la base connaît, jamais à un second fil", async ({ page }) => {
  await banc(page);
  const r = await page.evaluate(async (lea) => {
    conversationsState = [{ id: "conv_brouillon_perime", userId: lea, userName: "Léa", messages: [], isGroup: false, _brouillon: true, lastAt: Date.now() }];
    window._supaReal = true;
    window._chercherConvDirecte = async () => ({ id: "conv_en_base", absenceProuvee: false });
    window.__ouvrir("reels");
    const v = await _envoyerALAuteurStory(storyGroups[0].stories[0], "Léa", "Coucou");
    return { v, vers: window.__envois.map((e) => e.convId), brouillons: getConversations().filter((c) => c._brouillon).length };
  }, LEA);
  expect(r.v).toBeTruthy();
  expect(r.vers).toEqual(["conv_en_base"]);
  expect(r.brouillons).toBe(0);
});

test("⑧ un commentaire en cours de saisie ne se perd pas d'un toucher sur la story", async ({ page }) => {
  await banc(page);
  await page.evaluate(() => window.__ouvrir("reels"));
  await page.locator("#storyReplyBar .story-reply-input").fill("Je tape un commentaire");
  await page.locator("#storyCard .story-tap-next").click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ i: storyItemIdx, g: storyGroupIdx, texte: document.querySelector("#storyReplyBar .story-reply-input").value }));
  expect(r).toEqual({ i: 0, g: 0, texte: "Je tape un commentaire" });
});


// ═══ Avec les tables story_likes / story_comments (migration du 2026-11-14) ═══
// La base est simulée : les fonctions `supaStory*` sont remplacées.
async function bancBase(page, opts) {
  await banc(page);
  await page.evaluate(({ moi, lea, sam, opts }) => {
    window._supaReal = true;
    window.supa = window.supa || {};
    window._compteAuthReel = () => true;
    window.__aimer = [];
    window.supaStoryAimer = async (id, aime) => { window.__aimer.push([id, aime]); return opts && opts.absente ? { ok: false, absente: true } : { ok: true }; };
    window.supaStoryMesJaime = async () => [];
    window.supaStoryNbCommentaires = async () => 2;
    window.__coms = [
      { id: "c1", authorId: sam, text: "<img src=x onerror=window.__xss=1>", at: Date.now() - 60000 },
      { id: "c2", authorId: moi, text: "Mon commentaire", at: Date.now() - 30000 },
    ];
    window.supaStoryCommentaires = async () => ({ liste: window.__coms.slice() });
    window.supaStoryCommenter = async (id, t) => ({ ok: true, id: "c_new", at: Date.now() });
    window.supaStorySupprimerCommentaire = async () => true;
    window.supaStoryActivite = async () => ({ vues: [{ userId: lea, at: Date.now() }, { userId: sam, at: Date.now() }], jaime: [sam] });
    window._resolveProfilesByIds = async (ids) => { const o = {}; ids.forEach((id) => { o[id] = { id, username: id === sam ? "Sam" : "Léa", emoji: "🙂", color: "#7c3aed" }; }); return o; };
    const reelle = (id, auteur, nom) => ({ id, authorId: auteur, authorName: nom, text: "Story " + id, createdAt: Date.now() - 600000, bg: "#7c3aed", fromSupabase: true });
    window.__ouvrirBase = (quoi) => {
      storyGroups = quoi === "mienne"
        ? [{ authorId: moi, stories: [reelle("sb_moi", moi, "Moi")] }]
        : [{ authorId: lea, stories: [reelle("sb_1", lea, "Léa")] }];
      openStoryViewerAt(0, 0);
    };
  }, { moi: MOI, lea: LEA, sam: SAM, opts: opts || {} });
}

test("⑨ ❤️ en base : le j'aime s'écrit dans story_likes, aucun message", async ({ page }) => {
  await bancBase(page);
  await page.evaluate(() => window.__ouvrirBase("reels"));
  await page.locator("#storyLikeBtn").click();
  await page.waitForTimeout(200);
  await page.locator("#storyLikeBtn").click();
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ aimer: window.__aimer, envois: window.__envois.length }));
  expect(r.aimer).toEqual([["sb_1", true], ["sb_1", false]]);
  expect(r.envois, "aucun message direct quand la table existe").toBe(0);
});

test("⑨bis table absente : le j'aime retombe sur le message direct", async ({ page }) => {
  await bancBase(page, { absente: true });
  await page.evaluate(() => window.__ouvrirBase("reels"));
  await page.locator("#storyLikeBtn").click();
  await page.waitForTimeout(300);
  const envois = await page.evaluate(() => window.__envois.map((e) => JSON.parse(e.contenu).text));
  expect(envois).toHaveLength(1);
  expect(envois[0]).toContain("J'ai aimé ta story");
});

test("⑩ 💬 commentaires publics : liste échappée, pastille, publier, supprimer le sien", async ({ page }) => {
  await bancBase(page);
  await page.evaluate(() => window.__ouvrirBase("reels"));
  await expect(page.locator("#storyCommentBtn .story-action-badge")).toHaveText("2");
  await page.locator("#storyCommentBtn").click();
  const liste = page.locator("#storyComList");
  await expect(liste.locator(".story-com-row")).toHaveCount(2);
  await expect(liste.locator(".story-com-texte").first()).toHaveText("<img src=x onerror=window.__xss=1>");
  expect(await page.evaluate(() => !!window.__xss || !!document.querySelector("#storyComList img"))).toBe(false);
  await expect(liste.locator(".story-com-row").first()).toContainText("Sam");
  // Seul MON commentaire a la corbeille (la story n'est pas à moi).
  await expect(liste.locator(".story-com-suppr")).toHaveCount(1);
  await page.locator("#storyComInput").fill("Superbe !");
  await page.locator("#storyComPublier").click();
  await expect(liste.locator(".story-com-row")).toHaveCount(3);
  await expect(page.locator("#storyCommentBtn .story-action-badge")).toHaveText("3");
  await liste.locator('.story-com-row[data-id="c2"] .story-com-suppr').click();
  await expect(liste.locator(".story-com-row")).toHaveCount(2);
  // La story est en pause tant que la feuille est ouverte.
  const w1 = await page.evaluate(() => parseFloat(document.getElementById("sp-0").style.width) || 0);
  await page.waitForTimeout(700);
  const w2 = await page.evaluate(() => parseFloat(document.getElementById("sp-0").style.width) || 0);
  expect(w2 - w1).toBeLessThan(3);
});

test("⑪ ma story : « Activité » compte vues et j'aime, la feuille liste qui a vu et qui a aimé", async ({ page }) => {
  await bancBase(page);
  await page.evaluate(() => window.__ouvrirBase("mienne"));
  const bouton = page.locator("#storyActiviteBtn");
  await expect(bouton).toHaveText(/👁 2\s+❤️ 1/);
  await bouton.click();
  await expect(page.locator("#storyActResume")).toContainText("Vu par 2");
  const lignes = page.locator("#storyActListe .story-feuille-ligne");
  await expect(lignes).toHaveCount(2);
  await expect(lignes.first()).toContainText("Sam");
  await expect(lignes.first().locator(".story-act-coeur")).toHaveCount(1);
  await expect(lignes.nth(1).locator(".story-act-coeur")).toHaveCount(0);
});
