// Ouverture d'une conversation — le fil est PEINT AVANT que le panneau n'entre.
//
// Défaut vécu (2026-09-02, essai réel sur téléphone) : « quand je clique sur la
// conversation tu ouvres la conversation mais tu n'affiches pas directement les
// messages déjà envoyés, je suis obligé de recliquer sur l'écran pour faire tout
// apparaître ».
//
// Cause : `openConversation` posait `.active` sur `#conv-fullpage` AVANT
// d'appeler `renderConvFpThread`. La transition `translateX(100%) → 0` démarrait
// donc sur un fil vide (ou sur celui de la conversation précédente), et le
// contenu arrivait dans la foulée — alors que la couche composée du panneau,
// promue en permanence par `will-change` et entièrement découpée par
// l'`overflow:hidden` de `.app-shell`, venait d'être demandée vide. Sur Android
// ces tuiles revenaient blanches jusqu'à la première invalidation, c'est-à-dire
// au premier toucher.
//
// ⚠️ CE QUI EST MESURABLE ICI. Le blanchiment des tuiles est un artefact de
// COMPOSITION que le headless ne reproduit pas. Ce qui se mesure — et ce qui
// suffit à faire rougir l'ancien code — c'est l'ORDRE : au moment où `.active`
// est posé, le fil doit déjà contenir les bulles de LA conversation ouverte.
// On l'observe en instrumentant `classList.add` sur le panneau, seul point où
// l'ordre est décidé. Éprouvé par mutation : remettre `.active` avant le rendu
// fait rougir les deux cas.
const { test, expect } = require("@playwright/test");
const { bootOnboarded, serviceWorkersHorsWebkit } = require("./app-helper");

// WebKit : le service worker soustrait la page aux routes (voir app-helper.js).
test.use({ serviceWorkers: serviceWorkersHorsWebkit });

// Pose une sonde qui capture l'état du fil À L'INSTANT où `.active` est ajouté.
async function sonderOrdre(page) {
  await page.evaluate(() => {
    const fp = document.getElementById("conv-fullpage");
    window.__sonde = null;
    const add = fp.classList.add.bind(fp.classList);
    fp.classList.add = function (...cls) {
      if (cls.includes("active") && !window.__sonde) {
        const t = document.getElementById("convFpThread");
        window.__sonde = {
          bulles: t ? t.querySelectorAll(".conv-bubble-wrap").length : -1,
          textes: t
            ? Array.from(t.querySelectorAll(".conv-bubble")).map((b) => b.textContent.trim())
            : [],
        };
      }
      return add(...cls);
    };
  });
}

async function semerConvs(page) {
  await page.evaluate(() => {
    const convs = getConversations();
    convs.length = 0;
    const now = Date.now();
    convs.push(
      {
        id: "c_a", userId: "u_a", userName: "Alice", userEmoji: "🎨", userColor: "#7c3aed",
        unread: 0,
        messages: [
          { id: "a1", from: "u_a", text: "Message de Alice un", at: now - 7200000 },
          { id: "a2", from: "me", text: "Message de Alice deux", at: now - 3600000 },
        ],
      },
      {
        id: "c_b", userId: "u_b", userName: "Bruno", userEmoji: "🎸", userColor: "#7c3aed",
        unread: 0,
        messages: [{ id: "b1", from: "u_b", text: "Message de Bruno un", at: now - 1800000 }],
      }
    );
    saveConversationsNow();
    goTo("messages");
    renderMessages();
  });
  await page.waitForTimeout(300);
}

test.describe("Ouverture d'une conversation", () => {
  test("le fil porte déjà ses messages quand le panneau entre à l'écran", async ({ page }) => {
    await bootOnboarded(page);
    await semerConvs(page);
    await sonderOrdre(page);

    await page.evaluate(() => openConversation("c_a"));

    const sonde = await page.evaluate(() => window.__sonde);
    expect(sonde, "`.active` n'a jamais été posé").not.toBeNull();
    expect(sonde.bulles, "le panneau entre à l'écran avec un fil VIDE").toBe(2);
    expect(sonde.textes.join(" | ")).toContain("Message de Alice un");
    expect(sonde.textes.join(" | ")).toContain("Message de Alice deux");
  });

  test("ouvrir une seconde conversation ne montre jamais le fil de la première", async ({ page }) => {
    await bootOnboarded(page);
    await semerConvs(page);

    await page.evaluate(() => openConversation("c_a"));
    await page.waitForTimeout(400);
    await page.evaluate(() => closeConversation());
    await page.waitForTimeout(200);

    await sonderOrdre(page);
    await page.evaluate(() => openConversation("c_b"));

    const sonde = await page.evaluate(() => window.__sonde);
    expect(sonde).not.toBeNull();
    expect(sonde.bulles).toBe(1);
    const joint = sonde.textes.join(" | ");
    expect(joint).toContain("Message de Bruno un");
    expect(joint, "le fil d'Alice était encore affiché à l'entrée du panneau").not.toContain("Alice");
  });

  test("le fil est ouvert en bas, et le reste après la transition", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      const convs = getConversations();
      convs.length = 0;
      const msgs = [];
      for (let i = 0; i < 60; i++) {
        msgs.push({ id: "m" + i, from: i % 2 ? "me" : "u_a", text: "Message numéro " + i, at: Date.now() - (60 - i) * 60000 });
      }
      convs.push({ id: "c_long", userId: "u_a", userName: "Alice", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: msgs });
      saveConversationsNow();
      goTo("messages");
      renderMessages();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => openConversation("c_long"));
    await page.waitForTimeout(600); // au-delà de la transition (280 ms) et du ré-épinglage (320 ms)

    const bas = await page.evaluate(() => {
      const t = document.getElementById("convFpThread");
      return t.scrollHeight - (t.scrollTop + t.clientHeight);
    });
    expect(bas, "le fil ne s'ouvre pas sur le message le plus récent").toBeLessThan(20);
  });

  // Défaut vécu le 2026-11-22 sur Android : « quand j'ouvre une conversation,
  // le dernier message est coupé ». Le fil grandit APRÈS l'ouverture sans
  // aucun événement (police ou emoji chargés tard, réaction, bandeau) : rien ne
  // ré-épinglait le bas. Éprouvé par mutation : sans l'observateur de taille
  // de `_wireConvScroll`, les deux premiers cas rougissent.
  async function ouvrirFilLong(page) {
    await bootOnboarded(page);
    await page.evaluate(() => {
      const convs = getConversations();
      convs.length = 0;
      const msgs = [];
      for (let i = 0; i < 40; i++) {
        msgs.push({ id: "g" + i, from: i % 2 ? "me" : "u_a", text: "Message numéro " + i, at: Date.now() - (40 - i) * 60000 });
      }
      convs.push({ id: "c_grandit", userId: "u_a", userName: "Alice", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: msgs });
      saveConversationsNow();
      goTo("messages");
      renderMessages();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => openConversation("c_grandit"));
    await page.waitForTimeout(600);
  }
  const ecartAuBas = (page) => page.evaluate(() => {
    const t = document.getElementById("convFpThread");
    return t.scrollHeight - (t.scrollTop + t.clientHeight);
  });

  test("une bulle qui grandit sans événement après l'ouverture ne coupe pas le dernier message", async ({ page }) => {
    await ouvrirFilLong(page);
    await page.evaluate(() => {
      const b = document.querySelectorAll("#convFpThread .conv-bubble");
      b[b.length - 1].style.paddingBottom = "180px"; // police / emoji arrivés tard
    });
    await page.waitForTimeout(150);
    expect(await ecartAuBas(page), "le dernier message reste sous la saisie").toBeLessThan(20);
  });

  test("à l'ouverture, un `_auBas` retombé à faux sans geste ne laisse pas le fil au-dessus du bas", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      const convs = getConversations();
      convs.length = 0;
      const msgs = [];
      for (let i = 0; i < 40; i++) msgs.push({ id: "h" + i, from: i % 2 ? "me" : "u_a", text: "Message " + i, at: Date.now() - (40 - i) * 60000 });
      convs.push({ id: "c_h", userId: "u_a", userName: "Alice", userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: msgs });
      saveConversationsNow();
      goTo("messages");
      renderMessages();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      openConversation("c_h");
      // Après le ré-épinglage différé (320 ms), toujours dans la fenêtre d'ouverture.
      setTimeout(() => {
        const t = document.getElementById("convFpThread");
        t._auBas = false; // défilement intermédiaire pendant l'entrée du panneau
        const b = t.querySelectorAll(".conv-bubble");
        b[b.length - 1].style.paddingBottom = "200px";
      }, 500);
    });
    await page.waitForTimeout(900);
    expect(await ecartAuBas(page)).toBeLessThan(20);
  });

  test("quelqu'un qui a remonté l'historique n'est pas ramené en bas", async ({ page }) => {
    await ouvrirFilLong(page);
    await page.waitForTimeout(1500); // fin de la fenêtre d'ouverture
    const haut = await page.evaluate(async () => {
      const t = document.getElementById("convFpThread");
      t.dispatchEvent(new Event("touchstart"));
      t.scrollTop = 300;
      await new Promise((r) => setTimeout(r, 100));
      const b = t.querySelectorAll(".conv-bubble");
      b[b.length - 1].style.paddingBottom = "180px";
      await new Promise((r) => setTimeout(r, 150));
      return t.scrollTop;
    });
    expect(haut).toBe(300);
  });

  test("le panneau ne garde pas de couche composée permanente (will-change)", async ({ page }) => {
    await bootOnboarded(page);
    const wc = await page.evaluate(() =>
      getComputedStyle(document.getElementById("conv-fullpage")).willChange
    );
    expect(wc).toBe("auto");
  });
});
