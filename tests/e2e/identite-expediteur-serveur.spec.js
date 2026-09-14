// PRO-02 — l'identité d'un expéditeur vient du serveur, jamais de la charge utile.
//
// LE DÉFAUT. `_withSenderMeta` (app-02) attache au `content` de chaque message
// un objet `sp` — nom, emoji, couleur, photo du persona d'envoi. À la réception,
// `applyMsgContentData` (app-04) le faisait PRIMER sur la ligne `profiles` de
// `from_id` : `m.fromName = sp.n`, et en 1:1 `_handleIncomingConvMessage`
// (app-08) réécrivait `conv.userName` et `conv.userPhoto` avec lui. Or `content`
// est écrit par l'ÉMETTEUR, librement : un membre d'un groupe se faisait nommer
// « Benjamin » sur la ligne d'expéditeur, et en 1:1 l'en-tête prenait le nom et
// la photo que le dernier message dictait.
//
// Ce que cette suite exige : le nom et la photo sont ceux du profil de
// `from_id` (① ② ③, RÉINJECTION — ils rougissent sur le code d'avant) ; le
// persona ne fournit qu'un décor BORNÉ — emoji court sans caractère HTML,
// couleur hexadécimale (④ ⑤) ; et le chargement des conversations ne lit plus
// `n`/`ph` du persona, mesuré à la SOURCE (⑥).
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APP08 = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");

// Une charge utile telle qu'un membre hostile la poserait dans `conv_messages.content`.
function charge(sp, texte) {
  return JSON.stringify({ type: "text", text: texte || "salut", sp: sp });
}

async function preparer(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    try { fermerHint(); } catch (e) {}
    // Le profil SERVEUR de u_lea, tel que `_fetchProfile` le rend : « Léa », sans photo.
    cacheRemoteProfile({ id: "u_lea", username: "Léa", emoji: "🌿", color: "#22c55e", avatar_url: null });
    const convs = getConversations();
    convs.push({ id: "dm_lea", isGroup: false, userId: "u_lea", userName: "Léa", userEmoji: "🌿",
      userColor: "#22c55e", userPhoto: null, unread: 0, lastAt: Date.now(), messages: [] });
    convs.push({ id: "grp_1", isGroup: true, groupName: "Rando", userIds: ["u_lea", "u_tom"],
      unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
    _primeProfileCache(getConversations()); // « Léa » entre dans le cache de _fetchProfile, sans requête
  });
}

async function recevoir(page, convId, content) {
  return page.evaluate(async ([convId, content]) => {
    await _handleIncomingConvMessage({ id: "m_" + Math.random().toString(36).slice(2, 8), conv_id: convId,
      from_id: "u_lea", content: content, created_at: new Date().toISOString() });
    const c = getConversations().find((x) => x.id === convId);
    const m = c.messages[c.messages.length - 1];
    return { userName: c.userName, userPhoto: c.userPhoto || null, userEmoji: c.userEmoji, userColor: c.userColor,
      fromName: m.fromName, fromEmoji: m.fromEmoji, senderProfile: m.senderProfile || null };
  }, [convId, content]);
}

test.describe("PRO-02 — identité d'expéditeur issue du serveur", () => {
  test("① groupe : la ligne d'expéditeur porte le nom du profil, jamais celui de la charge utile", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => openConversation("grp_1"));
    const r = await recevoir(page, "grp_1", charge({ n: "Benjamin", e: "🌿", c: "#22c55e" }));
    // RÉINJECTION : sur le code d'avant, fromName vaut « Benjamin ».
    expect(r.fromName).toBe("Léa");
    const ligne = page.locator("#convFpThread .conv-sender-name").last();
    await expect(ligne).toHaveText("Léa");
    await expect(page.locator("#convFpThread")).not.toContainText("Benjamin");
  });

  test("② 1:1 : le nom de l'en-tête ne suit pas la charge utile", async ({ page }) => {
    await preparer(page);
    const r = await recevoir(page, "dm_lea", charge({ n: "Admin PASSIO", e: "🌿", c: "#22c55e" }));
    expect(r.fromName).toBe("Léa");
    expect(r.userName, "l'en-tête de la conversation garde le nom du profil").toBe("Léa");
  });

  test("③ 1:1 : la photo de l'en-tête ne vient jamais de la charge utile", async ({ page }) => {
    await preparer(page);
    const r = await recevoir(page, "dm_lea", charge({ ph: "https://exemple.invalid/avatar-de-quelqu-un-d-autre.png" }));
    // RÉINJECTION : sur le code d'avant, userPhoto prend l'URL de la charge.
    expect(r.userPhoto).toBeNull();
    expect(r.senderProfile && r.senderProfile.ph, "la photo n'est même pas conservée sur le message").toBeUndefined();
  });

  test("④ le persona garde son décor légitime : emoji court et couleur hexadécimale", async ({ page }) => {
    await preparer(page);
    const r = await recevoir(page, "dm_lea", charge({ e: "🎸", c: "#ff0000" }));
    expect(r.fromEmoji).toBe("🎸");
    expect(r.userEmoji).toBe("🎸");
    expect(r.userColor).toBe("#ff0000");
  });

  test("⑤ un décor hostile est jeté : emoji avec balise, couleur qui n'est pas un hex", async ({ page }) => {
    await preparer(page);
    await page.evaluate(() => { window.__xss = 0; window.__pwn = function () { window.__xss++; }; });
    await page.evaluate(() => openConversation("dm_lea"));
    const r = await recevoir(page, "dm_lea", charge({
      e: '<img src=x onerror="window.__pwn()">',
      c: "#fff;background:url(x)",
    }));
    expect(r.fromEmoji, "emoji du profil, pas celui de la charge").toBe("🌿");
    expect(r.userEmoji).toBe("🌿");
    expect(r.userColor, "couleur du profil, pas celle de la charge").toBe("#22c55e");
    expect(await page.evaluate(() => window.__xss)).toBe(0);
    expect(await page.locator("#convFpThread img[src='x']").count()).toBe(0);
  });

  test("⑥ à la SOURCE : le chargement des conversations ne lit plus le nom ni la photo du persona", async () => {
    // Le chemin `supaLoadMyConversations` ne se rejoue pas hors réseau : on
    // mesure le code lui-même, comme la maison le fait pour un câblage.
    expect(APP08.includes("lastSp?.n"), "userName depuis le persona").toBe(false);
    expect(APP08.includes("lastSp?.ph"), "userPhoto depuis le persona").toBe(false);
    expect(APP08.includes("senderProfile.n"), "renommage de la conversation depuis un message").toBe(false);
    expect(APP08.includes("senderProfile.ph"), "photo de la conversation depuis un message").toBe(false);
  });
});
