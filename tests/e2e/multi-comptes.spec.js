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

// Mode realtime à tester : PASSIO_E2E_RT = "v2" | "v3" (sinon v1 par défaut).
// Permet de valider le realtime scalable de bout en bout :
//   PASSIO_E2E_MULTI=1 PASSIO_E2E_RT=v3 npm test -- multi-comptes
const RT_MODE = process.env.PASSIO_E2E_RT || "";

test.describe("messagerie entre 2 comptes réels", () => {
  test.skip(!process.env.PASSIO_E2E_MULTI, "opt-in : PASSIO_E2E_MULTI=1 (écrit en base réelle)");

  test("inscription → conversation → texte + vocal dans les deux sens", async ({ browser }) => {
    test.setTimeout(180000);
    const t0 = Date.now();
    const log = (m) => console.log(`[multi ${(((Date.now() - t0) / 1000) | 0)}s] ${m}`);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    pageA.on("console", (msg) => { if (msg.type() === "error") log("A console.error: " + msg.text().slice(0, 200)); });
    pageB.on("console", (msg) => { if (msg.type() === "error") log("B console.error: " + msg.text().slice(0, 200)); });

    try {
      // ── 1. Inscription des deux comptes par le vrai parcours d'onboarding ──
      log("étape 1 : inscription A…");
      const uidA = await signupAnonymous(pageA, "Test Alice");
      log("A inscrit: " + uidA);
      const uidB = await signupAnonymous(pageB, "Test Bob");
      log("B inscrit: " + uidB);
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
      log("étape 2 OK : conv créée " + convId);

      // ── 3. A envoie un texte, B doit le recevoir (realtime, conv auto-créée) ──
      await pageA.fill("#convFpInput", "Bonjour de Alice [test auto]");
      await pageA.evaluate((id) => sendMessageFp(id), convId);
      log("étape 3 : message A envoyé, attente réception B…");

      await pageB.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("Bonjour de Alice") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      log("étape 3 OK : B a reçu le texte de A");

      // ── 4. B répond, A doit le recevoir ──
      await pageB.evaluate((id) => openConversation(id), convId);
      await pageB.fill("#convFpInput", "Bien reçu, réponse de Bob [test auto]");
      await pageB.evaluate((id) => sendMessageFp(id), convId);
      log("étape 4 : réponse B envoyée, attente réception A…");

      await pageA.waitForFunction(
        (id) => {
          const c = getConversations().find((x) => x.id === id);
          return !!(c && (c.messages || []).some((m) => (m.text || "").indexOf("réponse de Bob") !== -1));
        },
        convId,
        { timeout: 30000 }
      );

      log("étape 4 OK : A a reçu la réponse de B");

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
      log("étapes 5-6 OK : vocal reçu et rendu dans le lecteur intégré");

      // ── 7. Nettoyage des données de test (best-effort, RLS par propriétaire) ──
      await cleanup(pageA, convId);
      await cleanup(pageB, convId);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

// Parcours réel : landing → Créer un compte → (auth anonyme Supabase par l'API,
// le bouton « sans compte » ayant été retiré — compte obligatoire) → âge →
// prénom → 1 passion → Entrer sur PASSIO, puis reload pour que boot() refasse
// supaInit + supaSubscribe (realtime v2 par défaut) avec la session.
async function signupAnonymous(page, name) {
  const step = (m) => console.log(`[signup ${name}] ${m}`);
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
  // Active le mode realtime demandé (v2/v3) AVANT le boot, pour tester le scalable.
  if (RT_MODE === "v2" || RT_MODE === "v3") {
    await page.addInitScript((mode) => { try { localStorage.setItem("passio_realtime_" + mode, "1"); } catch (e) {} }, RT_MODE);
  }
  await page.goto("/index.html");
  // ⚠️ boot() est async et se termine par showLanding() : cliquer avant la fin du boot
  // déclenche une course (showLanding() ré-écrase l'onboarding en cours). On attend
  // donc que la landing soit réellement affichée avant de démarrer le parcours.
  await page.waitForSelector("#landing.active", { timeout: 20000 });
  step("landing affichée (boot terminé)");
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  step("clic Créer un compte");
  // Compte obligatoire : le bouton « Continuer sans compte » a été retiré de l'UI.
  // L'API signInAnonymously reste disponible — on crée la session par code puis on
  // avance l'onboarding (comme le faisait onbSkipAuth : signin + onbNext()).
  await page.waitForFunction(() => typeof supa !== "undefined" && !!supa && typeof onbNext === "function", null, { timeout: 20000 });
  await page.evaluate(async () => {
    try {
      const { data } = await supa.auth.signInAnonymously();
      if (data && data.session) { window.MY_UID = data.session.user.id; try { localStorage.setItem("passio_uid", window.MY_UID); } catch (e) {} }
    } catch (e) {}
    if (typeof onbNext === "function") onbNext();
  });
  step("auth anonyme (API) — attente MY_UID…");
  await page.waitForFunction(() => !!window.MY_UID, null, { timeout: 20000 });
  step("MY_UID obtenu");
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).click();
  step("âge validé");
  await page.locator("#userName").fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  step("prénom validé");
  await page.locator("#passionGrid .passion-tile[data-passion]").first().click();
  await page.getByRole("button", { name: "Entrer sur PASSIO" }).click();
  step("onboarding terminé");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.MY_UID && typeof supa !== "undefined" && !!supa, null, { timeout: 20000 });
  // Laisse le temps à supaInit/supaSubscribe de s'abonner au realtime
  await page.waitForTimeout(3000);
  // La ligne profiles est créée en DIFFÉRÉ par supaInit (~10 s après le boot), or
  // conv_members.user_id a une FK vers profiles. On force l'upsert maintenant (même
  // fonction que l'app) puis on vérifie la ligne — page.evaluate attend les promesses
  // (contrairement à waitForFunction avec un callback async, qui rend une promesse
  // toujours truthy et passait avant que la ligne existe).
  const profilOk = await page.evaluate(async () => {
    try {
      await supaUpsertProfile();
      const { data } = await supa.from("profiles").select("id").eq("id", MY_UID);
      return !!(data && data.length);
    } catch (e) { return "erreur: " + e.message; }
  });
  if (profilOk !== true) throw new Error("profil Supabase absent après upsert: " + profilOk);
  step("reboot avec session + profil Supabase OK");
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
