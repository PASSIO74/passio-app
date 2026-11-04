// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT F — DÉRIVES LONGUES ET STOCKAGE LOCAL (stub)
//
// ⚠️ STUB LOCAL (serveur statique, réseau Supabase isolé par `bootOnboarded`) :
// ce qui est mesuré ici est le COMPORTEMENT du client, jamais la production.
//   ① une conversation de 500 messages dont 20 vocaux en base64 (~110 Ko chacun,
//      comme un vocal de 15 s en audio/webm) : `saveConversations()` doit
//      tenir TOUT dans IndexedDB même quand `localStorage.setItem` échoue sur
//      quota — sans perte silencieuse de message. Le quota est SIMULÉ (un
//      `setItem` qui lève `QuotaExceededError` dès que la valeur dépasse 4 Mo),
//      parce que le vrai quota de Chromium (10 Mo) n'est pas celui des WebKit
//      (5 Mo) et qu'un test qui attendrait le vrai quota serait lent et flou.
//   ② l'ouverture d'un fil de 500 messages ne pose pas de tâche longue > 200 ms
//      (fenêtrage existant, PERF-C05 du 09/26 mesurait 33 ms pour 504).
//   ③ session longue simulée : 40 allers-retours d'écran + 20 ouvertures de
//      conversation → le nombre de `setInterval` vivants et d'écouteurs
//      `document`/`window` n'augmente PAS d'un tour à l'autre (fuite = croissance
//      MONOTONE), et aucun canal temps réel n'est créé pour un visiteur.
// Les relevés chiffrés sont écrits dans PASSIO_AUDIT_DIR/derives.json pour le
// livrable F ; les assertions ne gardent que l'absence de régression franche.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const AUDIT_DIR = process.env.PASSIO_AUDIT_DIR || path.join(__dirname, "..", "..", "test-results", "audit-2026-11");
fs.mkdirSync(AUDIT_DIR, { recursive: true });
const SORTIE = path.join(AUDIT_DIR, "derives.json");
function ecrire(cle, valeur) {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(SORTIE, "utf8")); } catch (e) {}
  d[cle] = valeur;
  fs.writeFileSync(SORTIE, JSON.stringify(d, null, 1));
}

// Compteurs posés AVANT le boot : minuteurs, écouteurs, canaux.
const COMPTEURS = () => {
  window.__audit = { intervals: new Map(), listeners: 0, channels: 0, channelsLive: new Set() };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (fn, ms) { const id = si.apply(this, arguments); window.__audit.intervals.set(id, { ms, src: String(fn).slice(0, 50) }); return id; };
  window.clearInterval = function (id) { window.__audit.intervals.delete(id); return ci.apply(this, arguments); };
  for (const cible of [window, document]) {
    const add = cible.addEventListener.bind(cible), rm = cible.removeEventListener.bind(cible);
    cible.addEventListener = function () { window.__audit.listeners++; return add.apply(this, arguments); };
    cible.removeEventListener = function () { window.__audit.listeners--; return rm.apply(this, arguments); };
  }
  const wrapSupa = () => {
    const s = window.supa; if (!s || s.__wrapped || !s.channel) return false;
    const ch = s.channel.bind(s), rmc = s.removeChannel ? s.removeChannel.bind(s) : null;
    s.channel = function (name) { window.__audit.channels++; window.__audit.channelsLive.add(name); return ch.apply(this, arguments); };
    if (rmc) s.removeChannel = function (c) { try { window.__audit.channelsLive.delete(String(c && c.topic || "").replace(/^realtime:/, "")); } catch (e) {} return rmc.apply(this, arguments); };
    s.__wrapped = true; return true;
  };
  const iv = si(() => { if (wrapSupa()) ci(iv); }, 50);
};

test.describe("AUDIT F — dérives longues et stockage local (stub)", () => {
  test.setTimeout(240000);

  test("① 500 messages dont 20 vocaux base64 : quota localStorage dépassé → IndexedDB garde tout, aucun message perdu", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      // Un vocal de ~45 s en audio/webm (≈ 180 Ko) pèse ≈ 240 Ko en base64 : on
      // fabrique un data URL de cette taille (contenu arbitraire, le lecteur n'est
      // pas exercé). Vingt vocaux = 4,8 Mo : au-delà du quota WebKit RÉEL (~5 Mo
      // avec le reste de l'état) et du quota simulé ci-dessous.
      const vocal = "data:audio/webm;base64," + "QUJD".repeat(60000);
      const convId = "c_audit_f_" + Date.now();
      const convs = getConversations();
      const conv = { id: convId, userId: "88881111-2222-4333-8444-555566667777", name: "Audit F", emoji: "🎧", color: "#7c3aed", messages: [], lastAt: Date.now() };
      convs.push(conv);
      for (let i = 0; i < 500; i++) {
        const m = { id: "m_" + convId + "_" + i, from: i % 2 ? "me" : conv.userId, text: i % 25 === 0 ? "" : "Message " + i + " — " + "lorem ipsum ".repeat(1 + (i % 7)), at: Date.now() - (500 - i) * 60000 };
        if (i % 25 === 0) { m.voiceData = vocal; m.voiceDuration = 15; }
        conv.messages.push(m);
      }
      const octets = JSON.stringify(convs).length;
      // Quota SIMULÉ : setItem lève dès que la valeur dépasse 4 Mo (WebKit ≈ 5 Mo).
      const vraiSetItem = Storage.prototype.setItem;
      let refus = 0;
      Storage.prototype.setItem = function (k, v) {
        if (typeof v === "string" && v.length > 4 * 1024 * 1024) { refus++; const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
        return vraiSetItem.call(this, k, v);
      };
      let erreurSync = null;
      try { saveConversationsNow(); } catch (e) { erreurSync = String(e && e.message); }
      // L'écriture IndexedDB est asynchrone (best-effort) : on la laisse aboutir.
      await new Promise((res) => setTimeout(res, 1500));
      Storage.prototype.setItem = vraiSetItem;
      let lsOk = false, lsMessages = null;
      try { const brut = localStorage.getItem("passio_conversations_v1"); const p = brut ? JSON.parse(brut) : null; const c = p && p.find((x) => x.id === convId); lsOk = !!c; lsMessages = c ? c.messages.length : null; } catch (e) {}
      const idb = await window.idbConvLoad();
      const cIdb = Array.isArray(idb) ? idb.find((x) => x.id === convId) : null;
      return {
        octetsConversations: octets, refusLocalStorage: refus, erreurSync,
        localStorageAJoue: lsOk, localStorageMessages: lsMessages,
        idbLu: idb === undefined ? "LECTURE_IMPOSSIBLE" : (idb === null ? "VIDE" : "OK"),
        idbMessages: cIdb ? cIdb.messages.length : null,
        idbVocaux: cIdb ? cIdb.messages.filter((m) => m.voiceData).length : null,
        idbVocalIntact: cIdb ? cIdb.messages.filter((m) => m.voiceData).every((m) => m.voiceData === vocal) : null,
      };
    });
    ecrire("quotaLocalStorage", Object.assign({ note: "STUB — quota simulé à 4 Mo sur Storage.prototype.setItem ; vocal = 240 Ko base64 ×20" }, r));
    // Le quota a bien été dépassé (sinon le test ne prouve rien) et personne n'a levé.
    expect(r.octetsConversations).toBeGreaterThan(4 * 1024 * 1024);
    expect(r.refusLocalStorage).toBeGreaterThan(0);
    expect(r.erreurSync).toBeNull();
    // Le store durable a TOUT : 500 messages, 20 vocaux intacts.
    expect(r.idbLu).toBe("OK");
    expect(r.idbMessages).toBe(500);
    expect(r.idbVocaux).toBe(20);
    expect(r.idbVocalIntact).toBe(true);
  });

  test("② ouvrir un fil de 500 messages : pas de tâche longue > 200 ms, DOM borné", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const convId = "c_audit_f2_" + Date.now();
      const convs = getConversations();
      const conv = { id: convId, userId: "88881111-2222-4333-8444-555566667778", name: "Audit F2", emoji: "💬", color: "#7c3aed", messages: [], lastAt: Date.now() };
      for (let i = 0; i < 500; i++) conv.messages.push({ id: "m2_" + i, from: i % 2 ? "me" : conv.userId, text: "Message " + i + " " + "lorem ipsum dolor ".repeat(1 + (i % 5)), at: Date.now() - (500 - i) * 60000 });
      convs.push(conv);
      window.__lt = [];
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] }); } catch (e) {}
      goTo("messages");
      await new Promise((res) => setTimeout(res, 200));
      const t0 = performance.now();
      // Non attendue (lecture serveur sans délai, B-10) : on mesure le rendu local.
      openConversation(convId);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const ouverture = performance.now() - t0;
      await new Promise((res) => setTimeout(res, 800));
      const panneau = document.getElementById("conv-fullpage") || document.body;
      return { ouvertureMs: Math.round(ouverture), longtasks: window.__lt, pire: Math.max(0, ...window.__lt), noeudsPanneau: panneau.getElementsByTagName("*").length, bulles: panneau.querySelectorAll(".msg-bubble, .cfp-msg, .conv-msg, [data-msg-id]").length };
    });
    ecrire("fil500", Object.assign({ note: "STUB — ouverture d'une conversation de 500 messages texte, CPU non bridé" }, r));
    expect(r.pire).toBeLessThan(200);
  });

  test("③ session longue : minuteurs, écouteurs et canaux n'augmentent pas d'un tour à l'autre (visiteur : 0 canal)", async ({ page }) => {
    await page.addInitScript(COMPTEURS);
    await bootOnboarded(page);
    const releve = () => page.evaluate(() => ({ intervals: window.__audit.intervals.size, listeners: window.__audit.listeners, channels: window.__audit.channels, live: [...window.__audit.channelsLive], tasKo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024) : null }));
    const tours = [];
    tours.push(Object.assign({ etape: "après boot" }, await releve()));
    for (let tour = 1; tour <= 4; tour++) {
      await page.evaluate(async () => {
        const convs = getConversations();
        const cible = convs.find((c) => c && c.messages && c.messages.length) || convs[0];
        for (let i = 0; i < 10; i++) {
          for (const e of ["profiles", "studio", "explore", "irl", "messages", "feed"]) { goTo(e); await new Promise((r) => setTimeout(r, 15)); }
          // ⚠️ `openConversation` n'est PAS attendue : elle `await` une lecture
          // `conv_messages` SANS délai (B-10) qui, sans réseau, ne se règle jamais.
          // Le rendu local est synchrone jusqu'à ce premier `await`.
          if (cible) { goTo("messages"); openConversation(cible.id); await new Promise((r) => setTimeout(r, 40)); closeConversation(); await new Promise((r) => setTimeout(r, 20)); }
        }
        goTo("feed");
      });
      await page.waitForTimeout(400);
      tours.push(Object.assign({ etape: "tour " + tour + " (60 goTo + 10 conv)" }, await releve()));
    }
    ecrire("sessionLongue", { note: "STUB — visiteur onboardé sans compte Supabase, 4 tours de 60 navigations + 10 ouvertures/fermetures de conversation", tours });
    // Pas de croissance monotone entre les tours 1→4 (le tour 0 = boot peut armer des minuteurs légitimes).
    const t1 = tours[1], t4 = tours[4];
    expect(t4.intervals).toBeLessThanOrEqual(t1.intervals + 1);
    expect(t4.listeners).toBeLessThanOrEqual(t1.listeners + 10);
    expect(t4.channels).toBe(0);
  });
});
