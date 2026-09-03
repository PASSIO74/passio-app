// Ouvrir une conversation n'ouvre PAS le clavier — et le fil suit la géométrie.
//
// Défaut vécu (2026-09-02, deux essais réels de Benjamin sur téléphone) :
// « quand je clique sur une conversation les messages transmis n'apparaissent
// pas de suite », et il faut retoucher l'écran pour les faire apparaître.
//
// CAUSE MESURÉE, pas déduite. `openConversation` appelait `inp.focus()` DANS le
// geste de tap : Android ouvrait donc le clavier virtuel. Chaîne mesurée à
// 390 × 844 sur une conversation de 40 messages, viewport visible ramené à
// 500 px comme le fait le clavier :
//   · `syncAppViewportHeight` (app-09) refuse de rétrécir `--app-vh` pendant la
//     frappe (garde `typing && h < prev * 0.75`, posée pour ne pas figer une
//     hauteur amputée) → `--app-vh` RESTE à 844 px ;
//   · `.app-shell` garde 844 px alors que 500 seulement sont visibles ;
//   · le fil va de y=60 à y=782 et, scrollé en bas, met le message le plus
//     récent à y=699..761 : ENTIÈREMENT sous le clavier. Le champ de saisie
//     (y≈782..844) l'est aussi.
// À l'écran : le haut du fil, donc les vieux messages ou du vide. Un tap
// ailleurs ferme le clavier et « tout apparaît ».
//
// ⚠️ Une première tentative de correctif (ordre de rendu + retrait du
// `will-change`) a été déployée et N'A RIEN CHANGÉ : le défaut n'était pas un
// artefact de composition. Ces deux cas-là restent verrouillés par
// `conv-ouverture-fil.spec.js` ; ceux-ci verrouillent la vraie cause.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Appareil tactile : c'est le contexte où le focus ouvre un clavier.
test.use({ hasTouch: true, isMobile: true });

async function semerConv(page, nbMessages) {
  await page.evaluate((n) => {
    const convs = getConversations();
    convs.length = 0;
    const msgs = [];
    for (let i = 0; i < n; i++) {
      msgs.push({ id: "m" + i, from: i % 2 ? "me" : "u_lea",
        text: "Message numéro " + i, at: Date.now() - (n - i) * 600000 });
    }
    convs.push({ id: "c_lea", userId: "u_lea", userName: "Léa", userEmoji: "🔎",
      userColor: "#7c3aed", unread: 0, messages: msgs });
    saveConversationsNow();
    goTo("messages"); renderMessages();
  }, nbMessages);
  await page.waitForTimeout(400);
}

test.describe("Ouverture d'une conversation — clavier et géométrie", () => {
  test("ouvrir une conversation ne donne PAS le focus au champ (pas de clavier)", async ({ page }) => {
    await bootOnboarded(page);
    await semerConv(page, 40);

    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    const actif = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(actif, "le champ de saisie prend le focus → Android ouvre le clavier").not.toBe("convFpInput");
  });

  test("le champ garde le focus quand on le touche : écrire reste possible", async ({ page }) => {
    await bootOnboarded(page);
    await semerConv(page, 5);
    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    await page.locator("#convFpInput").click();
    const actif = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(actif, "toucher le champ doit bien l'activer").toBe("convFpInput");
  });

  test("clavier simulé : `--app-vh` suit, et le message le plus récent reste visible", async ({ page }) => {
    await bootOnboarded(page);
    await semerConv(page, 40);
    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    // Ce que fait le clavier virtuel : le viewport visible rétrécit.
    await page.setViewportSize({ width: 390, height: 500 });
    await page.waitForTimeout(600); // resize + ré-épinglage différé (250 ms)

    const m = await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      const der = t.querySelector(".conv-bubble-wrap:last-of-type");
      const r = der.getBoundingClientRect();
      return {
        appVh: parseFloat(document.documentElement.style.getPropertyValue("--app-vh")) || 0,
        shellH: document.querySelector(".app-shell").getBoundingClientRect().height,
        innerH: window.innerHeight,
        bulleTop: r.top, bulleBottom: r.bottom,
      };
    });

    expect(m.appVh, "`--app-vh` est resté figé sur l'ancienne hauteur").toBeLessThan(560);
    expect(m.shellH, "le shell dépasse la zone visible : le composer part sous le clavier")
      .toBeLessThanOrEqual(m.innerH + 1);
    expect(m.bulleBottom, "le message le plus récent est hors de l'écran").toBeLessThanOrEqual(m.innerH);
    expect(m.bulleTop).toBeGreaterThan(0);
  });

  test("remonté dans l'historique, un changement de géométrie ne ramène pas en bas", async ({ page }) => {
    await bootOnboarded(page);
    await semerConv(page, 40);
    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      t.scrollTop = 0;
      t.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(200);

    await page.setViewportSize({ width: 390, height: 500 });
    await page.waitForTimeout(600);

    const enBas = await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      return t.scrollTop + t.clientHeight >= t.scrollHeight - 80;
    });
    expect(enBas, "la lecture de l'historique a été arrachée vers le bas").toBe(false);
  });
});
