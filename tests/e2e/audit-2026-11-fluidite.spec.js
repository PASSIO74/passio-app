// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2026-11-02 — AGENT D — FLUIDITÉ RESSENTIE (mesures locales, stub)
//
// ⚠️ CE SONT DES MESURES SUR UN STUB LOCAL (serveur statique, faux réseau),
// avec CPU ralenti ×4 et réseau lent par le CDP : des ordres de grandeur pour
// comparer d'une version à l'autre, JAMAIS des chiffres de production.
//   ① temps jusqu'au premier rendu du fil (navigation → première carte peinte) ;
//   ② temps d'ouverture de chaque écran (`performance.now()` autour de `goTo`) ;
//   ③ tâches longues (PerformanceObserver longtask) pendant le défilement de
//      200 publications stubbées ;
//   ④ mémoire (`performance.memory.usedJSHeapSize`) après 30 allers-retours
//      entre écrans et 20 ouvertures/fermetures de conversation : une fuite est
//      une croissance MONOTONE entre les paliers, pas un pic ;
//   ⑤ minuteurs `setInterval` et abonnements temps réel vivants (compte par wrap).
// Le rapport (`PASSIO_AUDIT_DIR/fluidite.json`) est lu par le livrable D.
// Les seuils assertés sont larges : ils ne gardent que l'ABSENCE de régression
// grossière (écran > 2 s à CPU ×4, fuite > ×2 entre paliers).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes, onboardedState } = require("./app-helper");

const AUDIT_DIR = process.env.PASSIO_AUDIT_DIR || path.join(__dirname, "..", "..", "test-results", "audit-2026-11");
fs.mkdirSync(AUDIT_DIR, { recursive: true });

// 200 publications d'autrui, variées (texte, photo, commentaires), servies par le stub.
function posts200() {
  const out = [];
  for (let i = 0; i < 200; i++) {
    out.push({ id: "pf_" + i, authorId: "88881111-2222-4333-8444-5555666677" + String(i % 50).padStart(2, "0"), authorName: "Auteur " + i, authorEmoji: "🎸", authorColor: "#7c3aed", passion: "musique", mood: ["all", "learn", "creation"][i % 3], type: i % 4 === 0 ? "photo" : "text",
      image: i % 4 === 0 ? "https://passio-app.netlify.app/media/content/photos/p" + i + ".jpg" : null,
      text: "Publication " + i + " — " + "lorem ipsum dolor sit amet ".repeat(1 + (i % 6)), createdAt: Date.now() - i * 60000, timestamp: Date.now() - i * 60000, likes: i % 17, liked: false, fromSupabase: true,
      comments: i % 3 === 0 ? [{ id: "cf_" + i, authorId: "88881111-2222-4333-8444-555566667700", authorName: "Com", authorEmoji: "✨", text: "Commentaire " + i, createdAt: Date.now() - i * 1000, fromSupabase: true }] : [] });
  }
  return out;
}

// Wrap des minuteurs et des canaux AVANT le boot : on compte ce qui est vivant.
const WRAP = () => {
  window.__timers = { intervals: new Map(), nextId: 0 };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (fn, ms) { const id = si.apply(this, arguments); window.__timers.intervals.set(id, { ms, src: String(fn).slice(0, 60), t: Date.now() }); return id; };
  window.clearInterval = function (id) { window.__timers.intervals.delete(id); return ci.apply(this, arguments); };
  window.__channels = { created: 0, removed: 0, live: new Set() };
  // Le client Supabase est construit après le boot : on enveloppe `channel` dès qu'il existe.
  const wrapSupa = () => {
    const s = window.supa; if (!s || s.__wrapped || !s.channel) return false;
    const ch = s.channel.bind(s), rm = s.removeChannel ? s.removeChannel.bind(s) : null;
    s.channel = function (name) { const c = ch.apply(this, arguments); window.__channels.created++; window.__channels.live.add(name); return c; };
    if (rm) s.removeChannel = function (c) { window.__channels.removed++; try { window.__channels.live.delete(c && c.topic ? String(c.topic).replace(/^realtime:/, "") : null); } catch (e) {} return rm.apply(this, arguments); };
    s.__wrapped = true; return true;
  };
  const iv = si(() => { if (wrapSupa()) ci(iv); }, 50);
};

async function cdpLent(page, cpu = 4) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await cdp.send("Network.enable");
  // « Slow 4G » approximatif : 400 ms de latence, 1,6 Mb/s descendant.
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  return cdp;
}

test.describe("AUDIT D — fluidité (stub local, CPU ×4, réseau lent)", () => {
  test.setTimeout(240000);

  test("① premier rendu du fil · ② temps par écran · ③ tâches longues sur 200 publications · ⑤ minuteurs vivants", async ({ page }) => {
    const mesures = { note: "STUB LOCAL — CPU ×4 (CDP), latence 400 ms, 1,6 Mb/s. Pas la production." };
    await page.addInitScript(WRAP);
    await page.addInitScript(() => {
      window.__longtasks = [];
      try { new PerformanceObserver((l) => { l.getEntries().forEach((e) => window.__longtasks.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })); }).observe({ entryTypes: ["longtask"] }); } catch (e) {}
      // Premier rendu du fil : première carte peinte dans #feedList.
      window.__premiereCarte = null;
      const mo = new MutationObserver(() => { if (!window.__premiereCarte && document.querySelector("#feedList article.post")) { window.__premiereCarte = performance.now(); mo.disconnect(); } });
      document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true }));
    });
    const cdp = await cdpLent(page, 4);
    const t0 = Date.now();
    await bootOnboarded(page);
    const boot = await page.evaluate(() => ({
      premiereCarteMs: window.__premiereCarte && Math.round(window.__premiereCarte),
      nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), responseEnd: Math.round(n.responseEnd) } : null; })(),
      fcp: (() => { const p = performance.getEntriesByName("first-contentful-paint")[0]; return p ? Math.round(p.startTime) : null; })(),
      longtasksBoot: window.__longtasks.length, longtasksBootMs: window.__longtasks.reduce((a, e) => a + e.d, 0), pire: Math.max(0, ...window.__longtasks.map((e) => e.d)),
      scripts: performance.getEntriesByType("resource").filter((r) => /\.js(\?|$)/.test(r.name)).length,
      poidsJsKo: Math.round(performance.getEntriesByType("resource").filter((r) => /\.js(\?|$)/.test(r.name)).reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
    }));
    mesures.demarrage = Object.assign({ wallMs: Date.now() - t0 }, boot);

    // ② Temps d'ouverture par écran, 3 passages, médiane.
    const ecrans = ["profiles", "studio", "explore", "irl", "messages", "feed"];
    const parEcran = {};
    for (const e of ecrans) parEcran[e] = [];
    for (let k = 0; k < 3; k++) {
      for (const e of ecrans) {
        const ms = await page.evaluate(async (ec) => {
          const t = performance.now(); goTo(ec);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return performance.now() - t;
        }, e);
        parEcran[e].push(Math.round(ms));
        await page.waitForTimeout(80);
      }
    }
    mesures.ecrans = Object.fromEntries(Object.entries(parEcran).map(([e, v]) => [e, { mediane: v.slice().sort((a, b) => a - b)[1], passages: v }]));

    // ③ 200 publications stubbées, défilement, tâches longues.
    await page.evaluate((lot) => { state.supabasePosts = lot; window.__longtasks = []; goTo("feed"); const t = performance.now(); renderFeed(); window.__renderMs = performance.now() - t; }, posts200());
    await page.waitForTimeout(300);
    const rendu = await page.evaluate(() => ({ renderMs: Math.round(window.__renderMs), cartes: document.querySelectorAll("#feedList article.post").length }));
    await page.evaluate(() => { window.__longtasks = []; window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__scrolling) requestAnimationFrame(tick); }; window.__scrolling = true; requestAnimationFrame(tick); });
    const t1 = Date.now();
    // Le conteneur qui défile est #appMain (pas la page) : on y descend par pas,
    // en cliquant « Charger plus » (20 cartes par lot, pas de chargement
    // automatique hors fenêtrage) jusqu'aux 200 cartes.
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => { const m = document.getElementById("appMain"); m.scrollTop += 700; const b = document.getElementById("feedLoadMoreBtn"); if (b && !b.disabled && m.scrollTop + m.clientHeight >= m.scrollHeight - 900) b.click(); });
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(400);
    const scroll = await page.evaluate(() => {
      window.__scrolling = false;
      const f = window.__frames.slice(1);
      const sorted = f.slice().sort((a, b) => a - b);
      return { cartesApres: document.querySelectorAll("#feedList article.post").length, scrollTop: Math.round(document.getElementById("appMain").scrollTop),
        longtasks: window.__longtasks.length, longtasksMs: window.__longtasks.reduce((a, e) => a + e.d, 0), pireLongtaskMs: Math.max(0, ...window.__longtasks.map((e) => e.d)),
        frames: f.length, frameP50: Math.round(sorted[Math.floor(sorted.length * 0.5)] || 0), frameP95: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), framesSup50ms: f.filter((x) => x > 50).length };
    });
    mesures.defilement200 = Object.assign({ renduInitial: rendu, dureeMs: Date.now() - t1 }, scroll);

    // ⑤ Minuteurs et canaux vivants, et combien tournent même onglet caché.
    mesures.minuteurs = await page.evaluate(() => ({
      intervalsVivants: window.__timers.intervals.size,
      liste: [...window.__timers.intervals.values()].map((v) => v.ms + "ms " + v.src.replace(/\s+/g, " ").slice(0, 40)),
      canauxCrees: window.__channels.created, canauxRetires: window.__channels.removed, canauxVivants: [...window.__channels.live].filter(Boolean),
    }));

    fs.writeFileSync(path.join(AUDIT_DIR, "fluidite.json"), JSON.stringify(mesures, null, 1));
    await cdp.detach().catch(() => {});
    // Seuils larges : absence de régression grossière, pas une cible produit.
    for (const [e, v] of Object.entries(mesures.ecrans)) expect(v.mediane, "ouverture de " + e + " (médiane) sous 2 s à CPU ×4").toBeLessThan(2000);
    expect(mesures.defilement200.renduInitial.cartes).toBeGreaterThan(0);
  });

  test("④ mémoire : 30 allers-retours d'écrans + 20 ouvertures/fermetures de conversation — pas de croissance monotone", async ({ page }) => {
    test.skip(!process.env.PASSIO_CHROMIUM && false, "");
    await page.addInitScript(WRAP);
    await bootOnboarded(page);
    const dispo = await page.evaluate(() => !!(performance.memory && performance.memory.usedJSHeapSize));
    test.skip(!dispo, "performance.memory indisponible sur ce navigateur");
    await page.evaluate(() => {
      const convs = getConversations();
      for (let i = 0; i < 5; i++) convs.push({ id: "cm_" + i, userId: "11111111-2222-4333-8444-55555555555" + i, userName: "Membre " + i, userEmoji: "🎨", userColor: "#7c3aed", unread: 0, messages: Array.from({ length: 60 }, (_, k) => ({ id: "m" + i + "_" + k, from: k % 2 ? "me" : "11111111-2222-4333-8444-55555555555" + i, text: "Message " + k + " de la conversation " + i, at: Date.now() - (60 - k) * 60000 })) });
      saveConversationsNow();
    });
    const cdp = await page.context().newCDPSession(page);
    const gc = async () => { try { await cdp.send("HeapProfiler.collectGarbage"); } catch (e) {} await page.waitForTimeout(200); };
    const heap = async () => { await gc(); return page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1024)); };
    const paliers = [{ etape: "après boot", ko: await heap() }];
    const ecrans = ["profiles", "studio", "explore", "irl", "messages", "feed"];
    for (let tour = 1; tour <= 3; tour++) {
      for (let i = 0; i < 10; i++) for (const e of ecrans) { await page.evaluate((ec) => goTo(ec), e); await page.waitForTimeout(15); }
      paliers.push({ etape: "écrans ×" + (tour * 10) + " (60 goTo/tour)", ko: await heap() });
    }
    for (let tour = 1; tour <= 2; tour++) {
      for (let i = 0; i < 10; i++) {
        await page.evaluate((k) => { goTo("messages"); openConversation("cm_" + (k % 5)); }, i);
        await page.waitForTimeout(80);
        await page.evaluate(() => closeConversation());
        await page.waitForTimeout(30);
      }
      paliers.push({ etape: "conversations ×" + (tour * 10), ko: await heap() });
    }
    const minuteurs = await page.evaluate(() => ({ intervalsVivants: window.__timers.intervals.size, canauxVivants: [...window.__channels.live].filter(Boolean).length }));
    const rapport = { note: "STUB LOCAL, Chromium, après GC forcé (HeapProfiler.collectGarbage). Pas la production.", paliers, minuteurs };
    let prev = null; try { prev = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, "fluidite.json"), "utf8")); } catch (e) {}
    fs.writeFileSync(path.join(AUDIT_DIR, "fluidite.json"), JSON.stringify(Object.assign(prev || {}, { memoire: rapport }), null, 1));
    // Fuite = chaque palier plus haut que le précédent ET dernier > 2× le premier.
    const monotone = paliers.every((p, i) => i === 0 || p.ko > paliers[i - 1].ko);
    const ratio = paliers[paliers.length - 1].ko / paliers[0].ko;
    test.info().annotations.push({ type: "mesure", description: paliers.map((p) => p.etape + "=" + p.ko + "Ko").join(" · ") + " · monotone=" + monotone + " ratio=" + ratio.toFixed(2) });
    expect(monotone && ratio > 2, "croissance monotone ×2 = fuite").toBe(false);
    await cdp.detach().catch(() => {});
  });
});
