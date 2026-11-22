// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-03 — E-08 (signaler UN message) ET IDENTIFIANTS DE MESSAGE
// ÉCHAPPÉS DANS LE MENU D'ACTIONS
//
// DEUX DÉFAUTS, UN MÊME MENU (`_openMsgActions`, app-04) :
//   · les identifiants (`conv_messages.id`, `conversations.id`) sont posés par
//     l'EXPÉDITEUR, sans forme imposée par le serveur, et entraient BRUTS dans
//     les onclick du menu : un identifiant forgé `x'),alert(1),('` s'exécutait
//     chez quiconque appuyait longuement sur le message (XSS stockée) ;
//   · un message reçu n'avait AUCUNE porte de signalement (DSA art. 16 : un
//     contenu se signale, pas seulement son auteur).
// Et deux sélecteurs voisins (`_jumpToMsg`, `_setMsgStatus`) concaténaient le
// même identifiant dans un `[data-…="…"]` : un guillemet double le rendait
// INVALIDE (SyntaxError) — la citation ne menait plus nulle part, le statut
// d'envoi ne se mettait plus à jour.
//
// Ce que cette suite exige :
//   ① menu d'un message reçu à identifiant forgé (' " ),( ] \) : toutes les
//      actions sont rendues ET visent le bon message ; aucun code injecté ne
//      tourne (piège `window.__pwn`, boîtes natives) ;
//   ② « Signaler ce message » : sur un message reçu, jamais sur le mien ni sur
//      un message système (et `reportMessage` refuse ces deux-là d'elle-même) ;
//   ③ le signalement demande un motif (3 caractères au moins, E-05), puis
//      appelle `supaReport("message", <identifiant exact>, motif)` ; annuler
//      n'envoie rien ; succès et échec sont DITS ; l'accusé de réception ne
//      suit que le succès ; sans compte, rien ne part ;
//   ④ de bout en bout : la ligne POSTée à `reports` porte
//      `target_type = message` et l'identifiant exact (refus serveur = dit) ;
//   ⑤ les deux sélecteurs `CSS.escape` : citation → message cité, statut
//      d'envoi patché EN PLACE, avec un identifiant qui porte un guillemet.
//
// ISOLATION (projet local) : `supa` est un VRAI client en local et `_supaReal`
// vaut vrai — un clic mal stubé écrirait en production. Toute requête REST
// autre que GET est donc interceptée APRÈS le boot (fulfill, jamais continue),
// les lectures de messagerie rendent [], `supaReport` et `_sendReaction` sont
// remplacés. Aucune écriture ne quitte le navigateur.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// Conversation forgée : apostrophe et `),(` — sous concaténation brute, le
// premier argument de chaque onclick deviendrait du code.
const CID = "c_lea'),(window.__pwn='conv'),('";
// S'EXÉCUTERAIT sous concaténation brute (pas de guillemet double : l'attribut
// onclick reste entier, l'injection tourne).
const MID_A = "m_a'),(window.__pwn='a'),('";
// Apostrophe, guillemet double, `),(`, crochet, antislash : casse AUSSI un
// sélecteur `[data-mid="…"]` non échappé.
const MID_B = "m_b\"'),(window.__pwn='b'),('\"]\\";
// Mon message (statut d'envoi), lui aussi avec un guillemet double.
const MID_MOI = "m_moi\"'),(window.__pwn='moi'),('";
const MID_SYS = "m_sys";
const MID_CITE = "m_cite";

const TEXTE_A = "Message A de Léa";
const TEXTE_B = "Message B de Léa";

// Pièges posés AVANT le boot : une boîte native ou une affectation de
// `window.__pwn` prouve qu'un identifiant est devenu du code.
const PIEGES = () => {
  window.__alerts = [];
  ["alert", "confirm", "prompt"].forEach((f) => {
    window[f] = function (m) { window.__alerts.push(f + ":" + String(m)); return f === "confirm"; };
  });
};

async function banc(page) {
  await page.addInitScript(PIEGES);
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // ⚠️ APRÈS `bootOnboarded`, ET C'EST VOULU : Playwright évalue la DERNIÈRE
  // route enregistrée en premier, et celle de l'isolation (`sansDonneesDistantes`)
  // laisse partir les écritures (`route.continue()`). Celle-ci les arrête
  // toutes et garde la trace de celles qui visent `reports`.
  const ecritures = [];
  const signalements = [];
  const reponseReports = { status: 201, body: "" };
  await page.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const m = req.method();
    const url = req.url();
    if (m === "GET" || m === "HEAD") {
      if (/\/rest\/v1\/(conv_messages|conv_members|conversations)\?/.test(url)) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    }
    ecritures.push(m + " " + url.replace(/^.*\/rest\/v1\//, ""));
    if (/\/rest\/v1\/reports(\?|$)/.test(url)) {
      let corps = null;
      try { corps = req.postDataJSON(); } catch (e) { corps = req.postData(); }
      signalements.push(corps);
      return route.fulfill({ status: reponseReports.status, contentType: "application/json", body: reponseReports.body });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });

  await page.evaluate(async ([lea, cid, ids, textes]) => {
    const [mA, mB, mMoi, mSys, mCite] = ids;
    window.__pwn = undefined;
    window.__toasts = [];
    window.toast = (t, k) => { window.__toasts.push({ t: String(t), k: k || "" }); };
    window.__reports = []; window.__ok = true;
    window.__vraiSupaReport = window.supaReport;
    window.supaReport = async (type, id, motif) => { window.__reports.push({ type, id, motif }); return window.__ok; };
    window.requireAuthentication = () => true;
    // La réaction emoji part en base par `_sendReaction` : on garde l'intention.
    window.__reactions = [];
    window._sendReaction = (c, m, e, op) => { window.__reactions.push({ c, m, e, op }); };
    try {
      Object.defineProperty(navigator, "clipboard", { configurable: true,
        value: { writeText: (t) => { window.__copie = t; return Promise.resolve(); } } });
    } catch (e) {}
    state.notifications = [];
    try { cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e" }); } catch (e) {}

    const now = Date.now();
    const convs = getConversations();
    convs.length = 0;
    convs.push({
      id: cid, userId: lea, userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: now,
      messages: [
        { id: mSys, text: "Léa a rejoint la conversation", system: true, at: now - 60000 },
        { id: mA, from: lea, fromName: "Léa", text: textes[0], at: now - 50000 },
        { id: mB, from: lea, fromName: "Léa", text: textes[1], at: now - 40000 },
        { id: mMoi, from: "me", text: "Ma réponse", at: now - 30000 },
        { id: mCite, from: lea, fromName: "Léa", text: "Je cite B", replyTo: { id: mB, n: "Léa", t: textes[1] }, at: now - 20000 },
      ],
    });
    saveConversationsNow();
    goTo("messages");
    renderMessages();
    await openConversation(cid);

    // Outils du banc. On retrouve une bulle par la VALEUR de son attribut, jamais
    // par un sélecteur : le sélecteur est précisément ce qu'on éprouve.
    window.__banc = {
      bulle(mid) {
        return [...document.querySelectorAll("#convFpThread .conv-bubble-wrap")]
          .find((w) => w.getAttribute("data-mid") === mid) || null;
      },
      // Le VRAI chemin : clic droit sur la bulle → délégation de `_wireMsgActions`.
      ouvrirMenu(mid) {
        const w = this.bulle(mid);
        if (!w) return false;
        (w.querySelector(".conv-bubble") || w).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        return document.getElementById("modalBackdrop").classList.contains("active");
      },
      libelles() {
        return [...document.querySelectorAll("#modalContent .csetting-item .csetting-label")].map((e) => e.textContent.trim());
      },
      cliquer(libelle) {
        const it = [...document.querySelectorAll("#modalContent .csetting-item")]
          .find((i) => i.querySelector(".csetting-label").textContent.trim() === libelle);
        if (!it) return false;
        it.click();
        return true;
      },
      modaleOuverte() { return document.getElementById("modalBackdrop").classList.contains("active"); },
      msg(mid) {
        const c = getConversations().find((x) => x.id === window.__banc.cid);
        return c ? (c.messages || []).find((m) => m.id === mid) || null : null;
      },
      cid,
    };
  }, [UID_LEA, CID, [MID_A, MID_B, MID_MOI, MID_SYS, MID_CITE], [TEXTE_A, TEXTE_B]]);

  return { errors, ecritures, signalements, reponseReports };
}

// Rien d'injecté n'a tourné, aucune exception de page.
async function aucuneInjection(page, errors, ou) {
  const s = await page.evaluate(() => ({ pwn: window.__pwn, alerts: window.__alerts || [] }));
  expect(s.pwn, ou + " : un identifiant forgé est devenu du code").toBeUndefined();
  expect(s.alerts, ou + " : aucune boîte native").toEqual([]);
  expect(errors.js, ou + " : aucune exception de page").toEqual([]);
}

test.describe("Audit 2026-11 — signaler un message (E-08) et identifiants échappés du menu", () => {
  test.setTimeout(90000);

  test("① menu d'un message reçu à identifiant forgé : chaque action vise le bon message, rien ne s'exécute", async ({ page }) => {
    const { errors } = await banc(page);
    for (const [mid, texte] of [[MID_A, TEXTE_A], [MID_B, TEXTE_B]]) {
      const r = await page.evaluate(([mid, autres]) => {
        const B = window.__banc, out = {};
        out.ouvert = B.ouvrirMenu(mid);
        out.libelles = B.libelles();
        out.reactions = document.querySelectorAll('#modalContent [onclick^="_reactAndClose"]').length;

        out.cliqueRepondre = B.cliquer("Répondre");
        out.reponse = window._replyTo ? { convId: window._replyTo.convId, id: window._replyTo.id } : null;
        out.barre = !!document.getElementById("convReplyBar");
        out.fermeApresReponse = !B.modaleOuverte();
        try { _cancelReply(); } catch (e) {}

        window.__copie = undefined;
        B.ouvrirMenu(mid);
        out.cliqueCopier = B.cliquer("Copier le texte");
        out.copie = window.__copie;

        window._forwardSrc = null;
        B.ouvrirMenu(mid);
        out.cliqueTransferer = B.cliquer("Transférer");
        out.transfert = window._forwardSrc ? { convId: window._forwardSrc.convId, msgId: window._forwardSrc.msgId } : null;
        out.titreTransfert = ((document.querySelector("#modalContent .modal-title") || {}).textContent || "").trim();
        closeModal();

        window.__reactions = [];
        B.ouvrirMenu(mid);
        const coeur = document.querySelector('#modalContent [onclick^="_reactAndClose"]');
        if (coeur) coeur.click();
        out.reaction = window.__reactions.slice();
        out.maReaction = !!((B.msg(mid) || {}).myReact || {})["❤️"];

        B.ouvrirMenu(mid);
        // LOT-4 (MSG-C58) : « Supprimer… » ouvre une confirmation qui porte la portée.
        out.cliqueSupprimer = B.cliquer("Supprimer…");
        const _moi = document.querySelector('#feuilleConfirmation [data-conf="moi"]');
        if (_moi) _moi.click(); else out.cliqueSupprimer = false;
        out.encorePresent = !!B.msg(mid);
        out.tombe = convTombLoad()["msg:" + mid] !== undefined;
        out.autresIntacts = autres.every((id) => !!B.msg(id));
        return out;
      }, [mid, [MID_SYS, MID_MOI, MID_CITE]]);

      expect(r.ouvert, "le clic droit sur la bulle ouvre le menu").toBe(true);
      expect(r.libelles).toEqual(["Répondre", "Copier le texte", "Transférer", "Signaler ce message", "Supprimer…"]);
      expect(r.reactions, "la rangée des six réactions").toBe(6);
      expect(r.cliqueRepondre && r.cliqueCopier && r.cliqueTransferer && r.cliqueSupprimer).toBe(true);
      // Répondre vise CE message, dans CETTE conversation.
      expect(r.reponse).toEqual({ convId: CID, id: mid });
      expect(r.barre, "la barre « Réponse à » s'affiche").toBe(true);
      expect(r.fermeApresReponse).toBe(true);
      expect(r.copie, "Copier copie le texte de CE message").toBe(texte);
      expect(r.transfert).toEqual({ convId: CID, msgId: mid });
      expect(r.titreTransfert).toBe("Transférer vers…");
      expect(r.reaction).toEqual([{ c: CID, m: mid, e: "❤️", op: "add" }]);
      expect(r.maReaction).toBe(true);
      expect(r.encorePresent, "Supprimer pour moi retire CE message").toBe(false);
      expect(r.tombe, "et pose sa pierre tombale (ADR-008)").toBe(true);
      expect(r.autresIntacts, "les autres messages restent").toBe(true);
      await aucuneInjection(page, errors, "menu de " + mid);
    }
  });

  test("② « Signaler ce message » : sur un message reçu, jamais sur le mien ni sur un message système", async ({ page }) => {
    const { errors } = await banc(page);
    const r = await page.evaluate(async ([cid, ids]) => {
      const [mB, mMoi, mSys] = ids, B = window.__banc, out = {};
      B.ouvrirMenu(mB); out.recu = B.libelles(); closeModal();
      B.ouvrirMenu(mMoi); out.moi = B.libelles(); closeModal();
      // Le message système n'a pas toujours de bulle cliquable : le menu s'ouvre
      // alors par la fonction elle-même, comme l'appui long le ferait.
      if (!B.ouvrirMenu(mSys)) _openMsgActions(cid, mSys);
      out.sys = B.libelles(); closeModal();
      // Défense en profondeur : appelée directement (onclick forgé, console),
      // `reportMessage` refuse d'elle-même le mien et le système.
      await reportMessage(cid, mMoi);
      await reportMessage(cid, mSys);
      await reportMessage(cid, "m_inexistant");
      out.fenetreMotif = !!document.getElementById("signalementMotif");
      out.reports = window.__reports.slice();
      out.typeHandler = typeof reportMessage;
      return out;
    }, [CID, [MID_B, MID_MOI, MID_SYS]]);
    expect(r.typeHandler, "le handler inline référence une fonction globale existante").toBe("function");
    expect(r.recu).toContain("Signaler ce message");
    expect(r.moi).not.toContain("Signaler ce message");
    // LOT-4 (MSG-C58) : la portée « pour tout le monde » se choisit dans la confirmation.
    expect(r.moi, "le mien garde « Supprimer… »").toContain("Supprimer…");
    expect(r.sys).not.toContain("Signaler ce message");
    expect(r.fenetreMotif, "aucune fenêtre de motif pour le mien, le système, l'inexistant").toBe(false);
    expect(r.reports).toEqual([]);
    await aucuneInjection(page, errors, "portes de signalement");
  });

  test("③ signaler : motif obligatoire (3 caractères), puis supaReport(\"message\", identifiant exact, motif), accusé de réception", async ({ page }) => {
    const { errors } = await banc(page);
    await page.evaluate((mid) => { window.__banc.ouvrirMenu(mid); window.__banc.cliquer("Signaler ce message"); }, MID_B);
    await page.waitForSelector("#signalementMotif");
    expect((await page.locator("#modalContent .modal-title").textContent()).trim()).toBe("Signaler ce message");
    const envoyer = page.locator("#modalContent button", { hasText: "Envoyer le signalement" });

    // Motif trop court, puis blancs autour de deux lettres : refusé, la fenêtre reste.
    for (const motifCourt of ["ab", "   ab   "]) {
      await page.evaluate(() => { window.__toasts = []; });
      await page.fill("#signalementMotif", motifCourt);
      await envoyer.click();
      const s = await page.evaluate(() => ({ toasts: window.__toasts.slice(), reports: window.__reports.length, ouverte: !!document.getElementById("signalementMotif") }));
      expect(s.reports, "motif « " + motifCourt + " » : rien n'est envoyé").toBe(0);
      expect(s.ouverte, "la fenêtre reste ouverte").toBe(true);
      expect(s.toasts.some((t) => /3 caractères/.test(t.t) && t.k === "warning"), "le refus est DIT").toBe(true);
    }

    await page.fill("#signalementMotif", "harcèlement répété");
    await envoyer.click();
    await page.waitForFunction(() => window.__reports.length === 1);
    await page.waitForFunction(() => window.__toasts.some((t) => /^Signalement envoyé/.test(t.t)));
    const r = await page.evaluate(() => ({
      reports: window.__reports.slice(),
      toasts: window.__toasts.slice(),
      accuses: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || "")).length,
      ouverte: document.getElementById("modalBackdrop").classList.contains("active"),
    }));
    expect(r.reports).toEqual([{ type: "message", id: MID_B, motif: "harcèlement répété" }]);
    expect(r.toasts.some((t) => /^Signalement envoyé/.test(t.t) && t.k === "success")).toBe(true);
    expect(r.accuses, "un accusé de réception dans la cloche").toBe(1);
    expect(r.ouverte, "la fenêtre est refermée").toBe(false);
    await aucuneInjection(page, errors, "signalement");
  });

  test("③ bis annuler (bouton, ×, fond, Échap, poignée) rend la main SUR-LE-CHAMP et n'envoie rien ; un refus est dit, sans accusé ; sans compte, rien ne part", async ({ page }) => {
    const { errors } = await banc(page);
    // ⚠️ LA FERMETURE REND LA MAIN TOUT DE SUITE (revue du 2026-11-03). `closeModal`
    // ne retire que `.active` du fond et laisse `#signalementMotif` dans le DOM :
    // le guetteur, qui n'attendait que la disparition du champ, ne se prononçait
    // qu'à l'ouverture de la modale SUIVANTE — `reportMessage` (comme
    // `reportPost`, `reportUser`, `reportStory`) restait suspendu jusque-là. Ce
    // banc EXIGE désormais la résolution « annulé » sans qu'aucune autre modale
    // ne s'ouvre, par chacun des chemins de fermeture : nos deux boutons, le ×
    // injecté par `openModal`, un clic sur le fond, Échap, la poignée.
    const fermetures = {
      "bouton Annuler": async () => { await page.locator("#modalContent .btn.ghost").first().click(); },
      "×": async () => { await page.locator("#modalContent .modal-close").first().click(); },
      "fond": async () => {
        // Un point du FOND hors de la fenêtre : on le vérifie avant de cliquer.
        const pt = await page.evaluate(() => {
          const fond = document.getElementById("modalBackdrop");
          for (const [x, y] of [[4, 4], [window.innerWidth - 4, 4], [4, 60], [window.innerWidth / 2, 4]]) {
            if (document.elementFromPoint(x, y) === fond) return { x, y };
          }
          return null;
        });
        expect(pt, "prémisse : un point du fond est cliquable hors de la fenêtre").not.toBeNull();
        await page.mouse.click(pt.x, pt.y);
      },
      "Échap": async () => { await page.locator("#signalementMotif").press("Escape"); },
      "poignée": async () => { await page.locator("#modalContent .modal-handle").first().click(); },
    };
    for (const [nom, fermer] of Object.entries(fermetures)) {
      await page.evaluate(([cid, mid]) => {
        window.__fini = false; window.__resultat = "pendante"; window.__toasts = [];
        window.__ouvertures = 0;
        reportMessage(cid, mid).then((v) => { window.__fini = true; window.__resultat = v; });
      }, [CID, MID_B]);
      await page.waitForSelector("#signalementMotif");
      await page.fill("#signalementMotif", "un motif saisi puis abandonné");
      // Toute ouverture de modale APRÈS la fermeture serait ce qui dénouait la
      // promesse avant le correctif : on les compte, il n'y en a aucune.
      await page.evaluate(() => {
        const vrai = window.openModal;
        window.__vraiOpenModal = vrai;
        window.openModal = function () { window.__ouvertures++; return vrai.apply(this, arguments); };
      });
      await fermer();
      await page.waitForFunction(() => window.__fini === true, null, { timeout: 1500 }).catch(() => {});
      const s = await page.evaluate(() => {
        const out = {
          fini: window.__fini, resultat: window.__resultat === undefined ? "undefined" : String(window.__resultat),
          ouvertures: window.__ouvertures,
          fenetre: document.getElementById("modalBackdrop").classList.contains("active"),
          reports: window.__reports.length, toasts: window.__toasts.map((t) => t.t),
          accuses: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || "")).length,
        };
        window.openModal = window.__vraiOpenModal;
        return out;
      });
      expect(s.fenetre, nom + " : la fenêtre est fermée").toBe(false);
      expect(s.fini, nom + " : reportMessage a rendu la main sans attendre une autre modale").toBe(true);
      expect(s.resultat, nom + " : abandon = sortie sans verdict").toBe("undefined");
      expect(s.ouvertures, nom + " : aucune autre modale n'a été nécessaire").toBe(0);
      expect(s.reports, nom + " : rien n'est envoyé").toBe(0);
      expect(s.toasts.filter((t) => /Signalement|signalé|réessaie|impossible/i.test(t)), nom + " : aucun verdict annoncé").toEqual([]);
      expect(s.accuses).toBe(0);
      // Et une modale ouverte ENSUITE ne réveille rien : la promesse est déjà dénouée.
      await page.evaluate(() => { openModal('<div class="modal-title">suivante</div>'); closeModal(); });
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.__reports.length), nom + " : la modale suivante n'envoie rien").toBe(0);
    }

    // « Envoyer » appelle `fini` AVANT `closeModal` : la perte de `.active` qui
    // suit ne doit pas produire une SECONDE résolution (le guetteur de classe
    // est retiré à la première).
    const double = await page.evaluate(async ([cid, mid]) => {
      window.__reports = []; window.__resolutions = [];
      const p = _demanderMotifSignalement("ce message").then((v) => { window.__resolutions.push(v); return v; });
      document.getElementById("signalementMotif").value = "motif valable";
      _signalementValider();
      const v = await p;
      await new Promise((r) => setTimeout(r, 100));
      return { v, resolutions: window.__resolutions.slice(), fenetre: document.getElementById("modalBackdrop").classList.contains("active") };
    }, [CID, MID_B]);
    expect(double.v, "« Envoyer » rend le motif saisi").toBe("motif valable");
    expect(double.resolutions, "une seule résolution").toEqual(["motif valable"]);
    expect(double.fenetre).toBe(false);

    // Refus serveur (verdict faux) : dit, sans accusé de réception.
    const refus = await page.evaluate(async ([cid, mid]) => {
      window.__ok = false; window.__toasts = [];
      window._demanderMotifSignalement = async () => "spam répété";
      await reportMessage(cid, mid);
      return {
        reports: window.__reports.slice(), toasts: window.__toasts.slice(),
        accuses: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || "")).length,
      };
    }, [CID, MID_B]);
    expect(refus.reports).toEqual([{ type: "message", id: MID_B, motif: "spam répété" }]);
    expect(refus.toasts.some((t) => /non envoyé — réessaie/.test(t.t) && t.k === "warning")).toBe(true);
    expect(refus.toasts.some((t) => /^Signalement envoyé/.test(t.t))).toBe(false);
    expect(refus.accuses).toBe(0);

    // Sans compte : la porte d'authentification arrête tout, AVANT le motif.
    const visiteur = await page.evaluate(async ([cid, mid]) => {
      window.__reports = []; window.__motifDemande = false;
      window._demanderMotifSignalement = async () => { window.__motifDemande = true; return "x"; };
      window.requireAuthentication = () => false;
      await reportMessage(cid, mid);
      return { reports: window.__reports.length, motif: window.__motifDemande };
    }, [CID, MID_B]);
    expect(visiteur.motif, "aucun motif demandé à un visiteur").toBe(false);
    expect(visiteur.reports).toBe(0);
    await aucuneInjection(page, errors, "annulation et refus");
  });

  test("④ de bout en bout : la ligne POSTée à reports porte target_type=message et l'identifiant exact", async ({ page }) => {
    const { errors, signalements, reponseReports } = await banc(page);
    await page.evaluate(() => {
      window.supaReport = window.__vraiSupaReport;   // le VRAI chemin, jusqu'au client Supabase
      window._demanderMotifSignalement = async () => "contenu haineux";
    });
    await page.evaluate(([cid, mid]) => reportMessage(cid, mid), [CID, MID_B]);
    const ok = await page.evaluate(() => ({
      toasts: window.__toasts.slice(), uid: MY_UID,
      accuses: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || "")).length,
    }));
    expect(signalements.length, "une seule insertion dans reports").toBe(1);
    const ligne = signalements[0];
    expect(ligne.target_type).toBe("message");
    expect(ligne.target_id, "l'identifiant EXACT, guillemets et antislash compris").toBe(MID_B);
    expect(ligne.reason).toBe("contenu haineux");
    expect(ligne.reporter_id).toBe(ok.uid);
    expect(ok.toasts.some((t) => /^Signalement envoyé/.test(t.t) && t.k === "success")).toBe(true);
    expect(ok.accuses).toBe(1);

    // Refus RLS : le SDK ne lève pas, `supaReport` doit LIRE { error }.
    reponseReports.status = 403;
    reponseReports.body = JSON.stringify({ code: "42501", message: "new row violates row-level security policy for table \"reports\"" });
    await page.evaluate(([cid, mid]) => { window.__toasts = []; return reportMessage(cid, mid); }, [CID, MID_B]);
    const ko = await page.evaluate(() => ({
      toasts: window.__toasts.slice(),
      accuses: (state.notifications || []).filter((n) => /Signalement reçu/.test(n.text || "")).length,
    }));
    expect(signalements.length).toBe(2);
    expect(ko.toasts.some((t) => /non envoyé — réessaie/.test(t.t))).toBe(true);
    expect(ko.toasts.some((t) => /^Signalement envoyé/.test(t.t))).toBe(false);
    expect(ko.accuses, "pas de second accusé sur un refus").toBe(1);
    await aucuneInjection(page, errors, "bout en bout");
  });

  test("⑤ CSS.escape : la citation mène au message cité, le statut d'envoi se patche en place (identifiant avec guillemet)", async ({ page }) => {
    const { errors } = await banc(page);
    const r = await page.evaluate(([cid, mB, mMoi]) => {
      const B = window.__banc, out = {};
      // ── _jumpToMsg, par le clic sur la citation (onclick + escapeJsArg) ──
      window.__defile = [];
      const vraiDefile = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (o) {
        window.__defile.push(this.getAttribute ? this.getAttribute("data-mid") : null);
        return vraiDefile.call(this, o);
      };
      window.__toasts = [];
      const citation = B.bulle("m_cite").querySelector(".conv-reply-quote");
      out.citation = !!citation;
      if (citation) citation.click();
      out.defile = window.__defile.slice();
      const cible = B.bulle(mB).querySelector(".conv-bubble");
      out.surbrillance = String(cible && cible.style.boxShadow || "");
      out.introuvable = window.__toasts.some((t) => /introuvable/.test(t.t));
      // Un identifiant absent ET hostile : le sélecteur reste valide, le refus est dit.
      window.__toasts = [];
      try { _jumpToMsg('absent"]x'); out.absentErreur = null; } catch (e) { out.absentErreur = String(e && e.message); }
      out.absentDit = window.__toasts.some((t) => /introuvable|plus disponible/.test(t.t)); // LOT-40 (MSG-C86)
      Element.prototype.scrollIntoView = vraiDefile;

      // ── _setMsgStatus : patch EN PLACE du holder [data-msgst] ──
      const holder = () => [...document.querySelectorAll("#convFpThread [data-msgst]")].find((h) => h.getAttribute("data-msgst") === mMoi) || null;
      const h0 = holder();
      out.holder = !!h0;
      window.__rendus = 0;
      const vraiRendu = window.renderConvFpThread;
      window.renderConvFpThread = function () { window.__rendus++; return vraiRendu.apply(this, arguments); };
      window.__relances = [];
      window._retryMsg = (c, m) => { window.__relances.push([c, m]); };
      try { _setMsgStatus(cid, mMoi, "failed"); out.statutErreur = null; } catch (e) { out.statutErreur = String(e && e.message); }
      out.memeNoeud = holder() === h0;
      out.texteEchec = h0 ? h0.textContent.trim() : "";
      const relancer = h0 && h0.querySelector("span[onclick]");
      if (relancer) relancer.click();
      out.relances = window.__relances.slice();
      try { _setMsgStatus(cid, mMoi, "sending"); } catch (e) { out.statutErreur = out.statutErreur || String(e && e.message); }
      out.texteEnvoi = h0 ? h0.textContent.trim() : "";
      out.rendus = window.__rendus;
      out.statut = (B.msg(mMoi) || {}).status;
      window.renderConvFpThread = vraiRendu;
      return out;
    }, [CID, MID_B, MID_MOI]);

    expect(r.citation, "la citation est rendue").toBe(true);
    expect(r.defile, "le clic sur la citation fait défiler jusqu'au message cité").toEqual([MID_B]);
    expect(r.surbrillance).toContain("var(--accent)");
    expect(r.introuvable, "le message cité est TROUVÉ").toBe(false);
    expect(r.absentErreur, "un identifiant hostile absent ne lève pas").toBeNull();
    expect(r.absentDit).toBe(true);

    expect(r.holder, "mon message porte son holder de statut").toBe(true);
    expect(r.statutErreur, "_setMsgStatus ne lève pas sur un guillemet").toBeNull();
    expect(r.texteEchec).toContain("réessayer");
    expect(r.memeNoeud, "patch EN PLACE, pas de re-rendu du fil").toBe(true);
    expect(r.relances, "« réessayer » vise CE message").toEqual([[CID, MID_MOI]]);
    expect(r.texteEnvoi).toContain("🕓");
    expect(r.rendus, "aucun re-rendu complet (le repli ne sert qu'au holder absent)").toBe(0);
    expect(r.statut).toBe("sending");
    await aucuneInjection(page, errors, "sélecteurs échappés");
  });
});
