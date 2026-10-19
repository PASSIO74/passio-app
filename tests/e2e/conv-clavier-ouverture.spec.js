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

  // La lecture serveur de la conversation part à l'ouverture et revient quand
  // elle revient. Mesuré le 2026-10-18 (CI de #605 rouge trois fois de suite sur
  // le test précédent) : quand elle revenait APRÈS que la personne avait remonté
  // le fil, le re-rendu remettait le bas. Ici la lecture est retardée exprès —
  // c'est un réseau mobile ordinaire.
  async function lectureServeurLente(page, lignes) {
    let servie = false;
    await page.route(/\/rest\/v1\/conv_messages\?/, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await new Promise((r) => setTimeout(r, 900));
      servie = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lignes) });
    });
    return () => servie;
  }

  test("une lecture serveur qui revient tard ne ramène pas en bas une relecture de l'historique", async ({ page }) => {
    await bootOnboarded(page);
    const servie = await lectureServeurLente(page, []);
    await semerConv(page, 40);
    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      t.scrollTop = 0;
      t.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(servie, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(300);

    const haut = await page.evaluate(() => document.getElementById("convFpThread").scrollTop);
    expect(haut, "la relecture de l'historique a été arrachée par la lecture serveur").toBeLessThan(80);
  });

  test("collé en bas, le message apporté par la lecture serveur s'affiche en bas", async ({ page }) => {
    await bootOnboarded(page);
    const servie = await lectureServeurLente(page, [{
      id: "m_serveur", conv_id: "c_lea", from_id: "u_lea", content: "Arrivé du serveur",
      created_at: new Date().toISOString(), profiles: null,
    }]);
    await semerConv(page, 40);
    await page.locator(".msg-card").first().click();
    await expect.poll(servie, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      const der = [...t.querySelectorAll(".conv-bubble-wrap")].pop();
      // Le VRAI bas : une tolérance de 80 px laissait passer une bulle à moitié
      // cachée (contre-revue du 2026-10-19 : mutant « ne revient jamais en bas »).
      return { enBas: t.scrollHeight - t.scrollTop - t.clientHeight <= 2, texte: der ? der.textContent : "" };
    });
    expect(m.texte, "le message du serveur n'est pas le dernier du fil").toContain("Arrivé du serveur");
    expect(m.enBas, "collé en bas, on doit y rester quand le serveur apporte un message").toBe(true);
  });

  test("une lecture serveur qui AJOUTE des messages garde le même message en haut d'une relecture", async ({ page }) => {
    await bootOnboarded(page);
    const maintenant = Date.now();
    const servie = await lectureServeurLente(page, [1, 2, 3].map((i) => ({
      id: "m_srv" + i, conv_id: "c_lea", from_id: "u_lea", content: "Nouveau " + i,
      created_at: new Date(maintenant + i * 1000).toISOString(), profiles: null,
    })));
    await semerConv(page, 60);
    await page.locator(".msg-card").first().click();
    await page.waitForTimeout(300);

    const premierVisible = () => page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      const h = t.getBoundingClientRect().top;
      const b = [...t.querySelectorAll(".conv-bubble-wrap[data-mid]")].find((x) => x.getBoundingClientRect().bottom > h);
      return b ? b.getAttribute("data-mid") : null;
    });
    await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      t.scrollTop = 900;
      t.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(100);
    const avant = await premierVisible();
    expect(avant).toBeTruthy();
    await expect.poll(servie, { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(300);
    expect(await premierVisible(), "la fusion a déplacé la lecture vers d'autres messages").toBe(avant);
  });
});
