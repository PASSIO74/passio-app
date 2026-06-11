// Test multi-comptes PASSIO — backlog #1 : deux vrais comptes (auth anonyme
// Supabase), création de conversation, échange de messages texte + message
// vocal, vérification de la réception realtime et du lecteur vocal intégré.
//
// ⚠️ ÉCRIT EN BASE RÉELLE (2 utilisateurs anonymes, 1 conversation, ~3 messages,
// nettoyés à la fin sauf les entrées auth.users anonymes — suppression service_role
// seulement). C'est pourquoi il est OPT-IN : il ne tourne pas en CI.
//
//   PowerShell :  $env:PASSIO_E2E_MULTI = "1"; npm test -- multi-comptes
//   bash :        PASSIO_E2E_MULTI=1 npm test -- multi-comptes
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

test.describe("messagerie entre 2 comptes réels", () => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "opt-in : PASSIO_E2E_MULTI=1 (écrit en base réelle)");

  test("inscription → conversation → texte + vocal dans les deux sens", async ({ browser }) => {
    test.setTimeout(180000);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // ── 1. Inscription des deux comptes par le vrai parcours d'onboarding ──
      const uidA = await signupAnonymous(pageA, "Test Alice");
      const uidB = await signupAnonymous(pageB, "Test Bob");
      expect(uidA, "compte A créé").toBeTruthy();
      expect(uidB, "compte B créé").toBeTruthy();
      expect(uidA).not.toBe(uidB);

      // ── 2. A crée une conversation avec B et l'ouvre ──
      const convId = await pageA.evaluate(async (buid) => {
        const id = await supaCreateConversation(buid);
        if (!id) return null;
        const convs = getConversations();
        convs.unshift({ id, userId: buid, userName: "Test Bob", userEmoji: "✨", userColor: "#8b5cf6", passion: null, unread: 0, lastAt: Date.now(), messages: [], isGroup: false });
        conversationsState = convs;
        saveConversationsNow();
        openConversation(id);
        return id;
      }, uidB);
      expect(convId, "conversation créée dans Supabase").toBeTruthy();

      // ── 3. A envoie un texte, B doit le recevoir (realtime, conv auto-créée) ──
      await pageA.fill("#convFpInput", "Bonjour de Alice [test auto]");
      await pageA.evaluate((id) => sendMessageFp(id), convId);

      await pageB.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("Bonjour de Alice") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      // ── 4. B répond, A doit le recevoir ──
      await pageB.evaluate((id) => openConversation(id), convId);
      await pageB.fill("#convFpInput", "Bien reçu, réponse de Bob [test auto]");
      await pageB.evaluate((id) => sendMessageFp(id), convId);

      await pageA.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("réponse de Bob") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      // ── 5. A envoie un message vocal (même format que _sendVoiceMessage) ──
      const voiceMsgId = await pageA.evaluate((id) => {
        const msgId = "msg_" + uid();
        // mini webm silencieux en data URL (le fallback sans Storage de _sendVoiceMessage)
        const dataUrl = "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////";
        sendMessageToSupabase(msgId, id, dataUrl, "audio/webm", "Message vocal (3s)", "audio");
        return msgId;
      }, convId);

      // ── 6. B reçoit le vocal et le rend dans le lecteur intégré (backlog #2) ──
      await pageB.waitForFunction(
        ([id, mid]) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => m.id === mid));
        },
        [convId, voiceMsgId],
        { timeout: 30000 }
      );
      await pageB.evaluate((id) => openConversation(id), convId);
      const voiceRender = await pageB.evaluate((mid) => {
        const aid = "aud_" + mid.replace(/[^a-z0-9]/gi, "");
        const thread = document.getElementById("convFpThread");
        return {
          lecteur: !!document.getElementById("pb_" + aid),
          duree: (document.getElementById("dur_" + aid) || {}).textContent || null,
          source: !!window["_vd_" + aid],
          jsonBrut: thread ? thread.textContent.indexOf('{"type"') !== -1 : null,
          carteTelechargement: thread ? thread.innerHTML.indexOf("Télécharger") !== -1 : null,
        };
      }, voiceMsgId);
      expect(voiceRender.lecteur, "lecteur vocal intégré rendu chez B").toBe(true);
      expect(voiceRender.source, "source audio enregistrée").toBe(true);
      expect(voiceRender.duree).toBe("0:03");
      expect(voiceRender.jsonBrut, "pas de JSON brut affiché").toBe(false);
      expect(voiceRender.carteTelechargement, "pas de carte téléchargement pour un vocal").toBe(false);

      // ── 7. Nettoyage des données de test (best-effort, RLS par propriétaire) ──
      await cleanup(pageA, convId);
      await cleanup(pageB, convId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// Parcours réel : landing → Créer un compte → Continuer sans compte (auth
// anonyme Supabase) → âge → prénom → 1 passion → Entrer sur PASSIO, puis
// reload pour que boot() refasse supaInit + supaSubscribe avec la session.
async function signupAnonymous(page, name) {
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.getByRole("button", { name: /Continuer sans compte/ }).click();
  await page.waitForFunction(() => !!window.MY_UID, null, { timeout: 20000 });
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).click();
  await page.locator("#userName").fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#passionGrid .passion-tile[data-passion]").first().click();
  await page.getByRole("button", { name: "Entrer sur PASSIO" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.MY_UID && typeof supa !== "undefined" && !!supa, null, { timeout: 20000 });
  // Laisse le temps à supaInit/supaSubscribe de s'abonner au realtime
  await page.waitForTimeout(3000);
  return page.evaluate(() => window.MY_UID);
}

async function cleanup(page, convId) {
  await page.evaluate(async (id) => {
    try { await supa.from("conv_messages").delete().eq("conv_id", id); } catch (e) {}
    try { await supa.from("conv_members").delete().eq("user_id", MY_UID); } catch (e) {}
    try { await supa.from("conversations").delete().eq("id", id); } catch (e) {}
    try { await supa.from("profiles").delete().eq("id", MY_UID); } catch (e) {}
    try { await supa.auth.signOut(); } catch (e) {}
  }, convId);
}
