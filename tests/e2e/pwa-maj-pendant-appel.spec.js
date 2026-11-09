// ═══════════════════════════════════════════════════════════════════════════
// PWA — UNE MISE À JOUR NE COUPE NI UN APPEL, NI UN LIVE, NI UNE SAISIE (2026-11-04)
//
// Chaque build qui change réinstalle le worker, et `reloadOnce` (js/pwa-detect.js)
// rechargeait aussitôt toute page contrôlée. Mesuré avec le vrai worker et deux
// vrais artefacts, Chromium et WebKit : appel, sonnerie et Live tombaient en moins
// d'une seconde ; dans une conversation, 24 caractères tapés, 0 relu.
// Fiche : docs/journal/social-messagerie.md.
//
// ⚠️ DEUX VRAIS ARTEFACTS, LE VRAI WORKER. `scripts/build.js` tourne deux fois sur
// une copie de l'arbre, la seconde avec un script modifié : `buildId`, `sw.js`,
// `app/app-09-….js?v=` changent comme dans un vrai déploiement. Le serveur de cette suite
// bascule de A à B. Un faux conteneur (pwa-maj-silencieuse.spec.js) ne mesurerait
// ni `activate`, ni `clients.claim`, ni `controllerchange`.
//
// ⚠️ LA CIBLE SUPABASE DES ARTEFACTS N'EXISTE PAS, ET LE PROXY EST MORT. Sous WebKit,
// une page contrôlée par un worker échappe à `page.route` : la route seule ne suffit
// pas à garantir qu'aucune requête de banc n'atteint la production.
//
// ⚠️ LE TÉMOIN ① PROUVE LA SONDE. Sans lui, un banc qui ne verrait plus aucun
// rechargement rendrait tous les autres cas verts. Chaque cas vérifie aussi sa
// prémisse : `SW_UPDATED` reçu, donc le worker B a bien pris la main.
//
// ⑭ à ㉛ : ni un enregistrement, ni un média en attente, ni un envoi. Sous Chromium,
// les vrais `MediaRecorder` tournent sur le micro et la caméra factices du navigateur ;
// le WebKit de Playwright n'a ni l'un ni l'autre, d'où un double, et seuls les
// gestionnaires y sont éprouvés. Sur un iPhone, ils existent.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const { onboardedState, sansDonneesDistantes } = require("./app-helper");

test.use({
  serviceWorkers: "allow",
  proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" },
  // Ces drapeaux n'ont de sens que pour Chromium, et cette suite tourne aussi sous WebKit.
  launchOptions: [async ({ browserName, launchOptions }, use) => {
    await use(browserName !== "chromium" ? launchOptions : {
      ...launchOptions,
      args: [...(launchOptions.args || []), "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
  }, { scope: "worker" }],
});

const RACINE = path.join(__dirname, "..", "..");
const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOAST_MAJ = "✨ Mise à jour disponible — recharge pour l'appliquer";

// Une page libre recharge dès `controllerchange`, avant même `SW_UPDATED` : si rien
// ne la retenait, elle serait partie dans ce délai.
const MARGE_MS = 800;
// Une fois le report armé, la page ne part qu'après son calme (`CALME_AVANT_RECHARGE_MS`,
// 3,5 s, par pas de 500 ms) : c'est la durée qui prouve qu'un état la retient encore.
const ATTENTE_REPORT_ARME_MS = 5000;
// Le calme mesuré entre la fin d'un appel et `pagehide`, moins la marge d'un pas. Mesuré
// dans la page : une attente de Playwright rougirait au moindre ralentissement de la CI.
const CALME_MIN_MS = 3000;

// ── Les deux artefacts ─────────────────────────────────────────────────────
let artefacts = null;
let serveur = null;
const etat = { dossier: null, sansApp: false };

function construire(arbre, sortie, commit) {
  const env = {
    ...process.env, COMMIT_REF: commit,
    PASSIO_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    PASSIO_SUPABASE_ANON: "cle-de-banc",
  };
  delete env.GITHUB_SHA;
  delete env.PASSIO_BUILD_TIME;
  execFileSync(process.execPath, ["scripts/build.js", path.join(sortie, "index.html")], { cwd: arbre, env, stdio: "pipe" });
  for (const f of ["manifest.json", "icon-192.png", "icon-512.png"]) fs.copyFileSync(path.join(arbre, f), path.join(sortie, f));
  return JSON.parse(fs.readFileSync(path.join(sortie, "release.json"), "utf8"));
}

function deuxArtefacts() {
  const arbre = fs.mkdtempSync(path.join(os.tmpdir(), "passio-maj-appel-"));
  fs.mkdirSync(path.join(arbre, "scripts"));
  for (const d of ["js", "data"]) fs.cpSync(path.join(RACINE, d), path.join(arbre, d), { recursive: true });
  for (const f of ["index.html", "styles.css", "sw.js", "manifest.json", "icon-192.png", "icon-512.png", "scripts/build.js"]) {
    fs.copyFileSync(path.join(RACINE, f), path.join(arbre, f));
  }
  const a = path.join(arbre, "dist-a");
  const b = path.join(arbre, "dist-b");
  const relA = construire(arbre, a, "a".repeat(40));
  fs.appendFileSync(path.join(arbre, "js", "app-09-boot-pwa.js"), '\nwindow.__versionServie = "B";\n');
  const relB = construire(arbre, b, "b".repeat(40));
  if (relA.buildId === relB.buildId) throw new Error("buildId identique : B n'est pas une nouvelle version");
  return { arbre, a, b, relB };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png" };

function servir() {
  const srv = http.createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const rel = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
    const f = path.join(etat.dossier, rel);
    // Le bloc app : les 9 scripts de dist/app/ (un seul app.js avant le 2026-11-09).
    const scriptApp = rel.startsWith("app/");
    if ((etat.sansApp && scriptApp) || !f.startsWith(etat.dossier) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(scriptApp ? 503 : 404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

test.beforeAll(async () => {
  test.setTimeout(180000);
  artefacts = deuxArtefacts();
  serveur = await servir();
});

test.afterAll(async () => {
  if (serveur) await new Promise((ok) => serveur.close(ok));
  if (artefacts) fs.rmSync(artefacts.arbre, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  etat.dossier = artefacts.a;
  etat.sansApp = false;
  await sansDonneesDistantes(page);
  await page.addInitScript(({ local, uid }) => {
    const n = Number(sessionStorage.getItem("__docs") || 0) + 1;
    sessionStorage.setItem("__docs", String(n));
    const pousser = (cle, v) => {
      const l = JSON.parse(sessionStorage.getItem(cle) || "[]");
      l.push(v);
      sessionStorage.setItem(cle, JSON.stringify(l));
    };
    navigator.serviceWorker.addEventListener("message", (e) => pousser("__msgs", e.data && e.data.type));
    // Compte les toasts au vol : un toast vit 3 s, l'écran seul ne dirait rien.
    new MutationObserver((lots) => {
      for (const lot of lots) for (const nd of lot.addedNodes) {
        if (nd.classList && nd.classList.contains("toast")) pousser("__toasts", nd.textContent);
      }
    }).observe(document, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => sessionStorage.setItem("__pagehide", String(Date.now())));
    window.addEventListener("error", (e) => {
      const l = JSON.parse(sessionStorage.getItem("__err") || "[]");
      l.push(String(e.message));
      sessionStorage.setItem("__err", JSON.stringify(l));
    });
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_uid", uid);
    localStorage.setItem("passio_appels_actifs", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(local));
  }, { local: onboardedState(1), uid: UID_MOI });
});

const adresse = (query = "") => "http://127.0.0.1:" + serveur.address().port + "/index.html" + query;

const controleur = () => !!navigator.serviceWorker.controller;

// L'application DÉJÀ INSTALLÉE : le worker A contrôle la page dès son ouverture.
async function ouvrirInstallee(page) {
  await page.goto(adresse());
  await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
  await page.reload();
  await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active") && window._supaReal === true;
  }, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    window.__memeDocument = true;
  });
}

// Le client du serveur, seule chose simulée : tous les gestionnaires d'appel et de
// Live qui s'en servent sont les vrais. `__tenue` garde une réponse en suspens, comme
// une demande de permission ou un réseau lent.
// ⚠️ LA LECTURE TENUE NE VISE QUE `video_lives` : d'autres lectures passent par
// `maybeSingle` au même moment, et `relacherLecture` libérerait la mauvaise.
// `depot` et `insertion` tiennent un envoi de la même façon ; une écriture aboutie
// s'inscrit dans `sessionStorage`, seule preuve qui survive au rechargement.
// `vraisMedias` garde le vrai micro là où il existe (voir l'en-tête).
async function clientSimule(page, opts = {}) {
  await page.evaluate(({ lea, vraisMedias }) => {
    window.__tenue = {
      media: false, lecture: false, relacherMedia: null, relacherLecture: null,
      depot: false, depotEchoue: false, depotsTenus: 0, relacherDepot: null,
      insertion: false, insertionsTenues: 0, relacherInsertion: null,
    };
    const noterEcriture = (texte) => {
      const l = JSON.parse(sessionStorage.getItem("__ecritures") || "[]");
      l.push(texte);
      sessionStorage.setItem("__ecritures", JSON.stringify(l));
    };
    const liveVivant = () => ({ data: { id: "vl_lea", author_id: lea, author_name: "Léa", status: "live", started_at: new Date().toISOString(), last_seen: new Date().toISOString() }, error: null });
    const chaine = (table) => {
      let inseree = null;
      const rep = () => Promise.resolve(table === "video_lives" ? liveVivant() : { data: [], error: null });
      // ⚠️ SEUL CE QU'ON MESURE EST TENU : une notification ou un événement qui passe
      // au même moment ne doit pas prendre la place de l'écriture attendue.
      const inserer = () => {
        const aboutir = () => {
          if (window.__tenue.insertionRefusee) return Promise.resolve({ data: null, error: { message: "refus de banc", code: "XX000" }, status: 500 });
          noterEcriture(table + ":" + inseree);
          return rep().then((r) => ({ ...r, status: 201 }));
        };
        if (!window.__tenue.insertion || !["conv_messages", "posts", "stories"].includes(table)) return aboutir();
        window.__tenue.insertionsTenues++;
        return new Promise((res) => { window.__tenue.relacherInsertion = () => { window.__tenue.insertion = false; res(aboutir()); }; });
      };
      const b = {
        then: (a, c) => (inseree ? inserer() : rep()).then(a, c),
        maybeSingle: () => ((window.__tenue.lecture && table === "video_lives")
          ? new Promise((res) => { window.__tenue.relacherLecture = () => res(liveVivant()); })
          : rep()),
      };
      for (const m of ["select", "eq", "neq", "in", "is", "gte", "gt", "lte", "lt", "or", "not", "order", "limit", "range", "update", "upsert", "delete"]) b[m] = () => b;
      b.insert = (ligne) => { inseree = String((Array.isArray(ligne) ? ligne[0] : ligne).id); return b; };
      return b;
    };
    const depots = [];
    const seau = (nom) => ({
      upload: (chemin) => {
        const aboutit = { data: { path: chemin }, error: null };
        if (window.__tenue.depotEchoue) return Promise.resolve({ data: null, error: { message: "panne de banc" } });
        if (!window.__tenue.depot) return Promise.resolve(aboutit);
        window.__tenue.depotsTenus++;
        return new Promise((res) => {
          depots.push(() => res(aboutit));
          window.__tenue.relacherDepot = () => { window.__tenue.depot = false; depots.splice(0).forEach((f) => f()); };
        });
      },
      getPublicUrl: (chemin) => ({ data: { publicUrl: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/" + nom + "/" + chemin } }),
      remove: () => Promise.resolve({ data: [], error: null }),
    });
    const canal = () => {
      const c = {
        on: () => c,
        subscribe: (cb) => { setTimeout(() => { try { cb && cb("SUBSCRIBED"); } catch (e) {} }, 0); return c; },
        send: () => Promise.resolve("ok"),
        httpSend: () => Promise.resolve({ success: true }),
        track: () => Promise.resolve("ok"),
        untrack: () => Promise.resolve("ok"),
        unsubscribe: () => Promise.resolve("ok"),
        presenceState: () => ({}),
      };
      return c;
    };
    const proprietes = { from: chaine, channel: canal, removeChannel: () => Promise.resolve("ok"), functions: { invoke: () => Promise.resolve({ data: {} }) }, storage: { from: seau } };
    for (const nom of Object.keys(proprietes)) {
      Object.defineProperty(window.supa, nom, { configurable: true, writable: true, value: proprietes[nom] });
    }
    // Le WebKit de Playwright n'a ni WebRTC ni `mediaDevices` : un double, pour que
    // les vrais gestionnaires tournent quand même. Sur un iPhone, ils existent.
    if (typeof RTCPeerConnection === "undefined") {
      window.RTCPeerConnection = function () {
        this.connectionState = "new";
        this.signalingState = "stable";
        this.addTrack = () => {};
        this.getSenders = () => [];
        this.getTransceivers = () => [];
        this.close = () => { this.connectionState = "closed"; };
      };
    }
    if (typeof MediaStream !== "function") {
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, get: () => null, set: () => {} });
    }
    const fluxVide = () => (typeof MediaStream === "function"
      ? new MediaStream()
      : { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] });
    const getUserMedia = () => {
      if (!window.__tenue.media) return Promise.resolve(fluxVide());
      return new Promise((res) => { window.__tenue.relacherMedia = () => res(fluxVide()); });
    };
    const microReel = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!vraisMedias || !microReel) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    if (vraisMedias && !microReel) {
      window.MediaRecorder = class {
        constructor(flux, reglages) { this.state = "inactive"; this.mimeType = (reglages && reglages.mimeType) || "video/mp4"; }
        static isTypeSupported() { return true; }
        start() { this.state = "recording"; }
        stop() {
          if (this.state === "inactive") return;
          this.state = "inactive";
          setTimeout(() => {
            this.ondataavailable({ data: new Blob([new Uint8Array(4096)], { type: "video/mp4" }) });
            this.onstop();
          }, 0);
        }
      };
    }
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e", avatar_url: null });
    const convs = getConversations();
    convs.length = 0;
    convs.push({ id: "dm_lea", isGroup: false, userId: lea, userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversationsNow();
  }, { lea: UID_LEA, vraisMedias: !!opts.vraisMedias });
}

const lireSonde = (page) => page.evaluate(() => ({
  docs: Number(sessionStorage.getItem("__docs") || 0),
  msgs: JSON.parse(sessionStorage.getItem("__msgs") || "[]"),
  toasts: JSON.parse(sessionStorage.getItem("__toasts") || "[]"),
  ecritures: JSON.parse(sessionStorage.getItem("__ecritures") || "[]"),
  erreurs: JSON.parse(sessionStorage.getItem("__err") || "[]"),
  memeDocument: !!window.__memeDocument,
  nav: (performance.getEntriesByType("navigation")[0] || {}).type,
  buildId: window.PASSIO_RELEASE && window.PASSIO_RELEASE.buildId,
  version: window.__versionServie || null,
  calmeMs: Number(sessionStorage.getItem("__pagehide")) - Number(sessionStorage.getItem("__fin")),
}));

// Une évaluation peut tomber pile sur le rechargement : on relit, sans conclure.
async function lireApresNavigation(page) {
  try { return await lireSonde(page); } catch (e) { return null; }
}

// Le déploiement, puis ce que fait `majSilencieuse` toutes les 60 s.
async function deployerB(page) {
  etat.dossier = artefacts.b;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()).catch(() => {})).catch(() => {});
}

// Prémisse de tous les cas occupés : le worker B a pris la main et l'a annoncé. Sinon
// l'absence de rechargement ne prouverait rien.
async function workerBAuxCommandes(page) {
  await expect.poll(async () => {
    const s = await lireApresNavigation(page);
    return s ? s.msgs.filter((m) => m === "SW_UPDATED").length : 0;
  }, { timeout: 20000, intervals: [100] }).toBeGreaterThanOrEqual(1);
  const cles = await page.evaluate(() => caches.keys());
  expect(cles).toContain("passio-v" + artefacts.relB.buildId);
}

async function restePourLinstant(page, docsAttendus) {
  await page.waitForTimeout(MARGE_MS);
  const s = await lireSonde(page);
  expect(s.memeDocument, "la page n'a pas été rechargée").toBe(true);
  expect(s.docs).toBe(docsAttendus);
  return s;
}

// Un appel dure plus que la borne du geste (`PREPARATION_APPEL_MS`, 60 s) : on la
// fait passer. Sans ça, la marque du geste couvrirait tout le test, et retirer la
// lecture de `_call` ou de `_vliveHost` ne ferait rougir aucun cas : à la 61ᵉ seconde
// d'un vrai appel, la page aurait pourtant rechargé.
const gesteDepasse = (page) => page.evaluate(() => { window._appelLanceA = performance.now() - 61000; });

// Fin d'activité : la page recharge, UNE fois, et tourne sur le code de B.
async function rechargeSurB(page, docsAvant) {
  await expect.poll(async () => {
    const s = await lireApresNavigation(page);
    return s ? s.docs : -1;
  }, { timeout: 20000, intervals: [100] }).toBe(docsAvant + 1);
  await expect.poll(async () => {
    const s = await lireApresNavigation(page);
    return s ? s.version : null;
  }, { timeout: 20000, intervals: [100] }).toBe("B");
  const s = await lireSonde(page);
  expect(s.nav).toBe("reload");
  expect(s.buildId).toBe(artefacts.relB.buildId);
  await page.waitForTimeout(MARGE_MS);
  const ensuite = await lireSonde(page);
  expect(ensuite.docs, "aucune boucle de rechargement").toBe(docsAvant + 1);
  return ensuite;
}

test.describe("PWA — le rechargement d'une mise à jour attend la fin de ce qu'on fait", () => {
  test("① TÉMOIN — page sans activité : elle recharge aussitôt, une fois, sur la nouvelle version", async ({ page }) => {
    await ouvrirInstallee(page);
    const avant = await lireSonde(page);
    expect(avant.docs).toBe(2);
    expect(await page.evaluate(() => !!(window._call || window._callIncoming || window._vliveHost || window._vliveView))).toBe(false);

    await deployerB(page);
    await rechargeSurB(page, avant.docs);
  });

  test("② appel connecté : l'appel continue, pas d'invitation à recharger, et la page recharge après", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    const { docs } = await lireSonde(page);

    // Le geste, et la demande de permission du micro encore ouverte.
    await page.evaluate(() => { window.__tenue.media = true; window.__depart = startCall("dm_lea", "voice"); });
    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);
    expect(await page.evaluate(() => !!window._call)).toBe(false);

    await page.evaluate(async () => { window.__tenue.relacherMedia(); await window.__depart; });
    await page.evaluate(() => _callMarkConnected());
    expect(await page.evaluate(() => window._call && window._call.status)).toBe("connected");
    await gesteDepasse(page);
    await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
    const pendant = await restePourLinstant(page, docs);
    expect(await page.evaluate(() => window._call.status + "/" + window._call.pc.connectionState)).not.toContain("closed");
    expect(pendant.toasts, "« recharge pour l'appliquer » ferait couper l'appel").not.toContain(TOAST_MAJ);

    await page.evaluate(() => { sessionStorage.setItem("__fin", String(Date.now())); endCall(); });
    const apres = await rechargeSurB(page, docs);
    expect(apres.calmeMs, "le toast de fin a le temps d'être lu").toBeGreaterThanOrEqual(CALME_MIN_MS);
  });

  test("③ sonnerie puis réponse : le trou de la permission du micro ne recharge pas la page", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await page.evaluate((lea) => _callOnInvite({ callId: "appel-3", from: lea, to: "moi", kind: "voice" }), UID_LEA);
    expect(await page.evaluate(() => !!window._callIncoming)).toBe(true);
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);

    // Réponse : la sonnerie s'efface AVANT que le micro ne soit obtenu.
    await page.evaluate(() => { window.__tenue.media = true; acceptIncomingCall(); });
    expect(await page.evaluate(() => [!!window._call, !!window._callIncoming])).toEqual([false, false]);
    await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
    expect((await lireSonde(page)).memeDocument, "un appel accepté n'est pas coupé").toBe(true);

    await page.evaluate(() => window.__tenue.relacherMedia());
    await page.waitForFunction(() => window._call && window._call.status === "connecting", null, { polling: 50, timeout: 5000 });
    await gesteDepasse(page);
    await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
    await restePourLinstant(page, docs);

    await page.evaluate(() => endCall());
    await rechargeSurB(page, docs);
  });

  test("④ ouverte depuis la notification d'appel : l'attente du client ne perd pas la sonnerie", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    // `_checkIncomingCallFromUrl` nettoie l'URL puis attend que le client soit prêt :
    // recharger à cet instant perdrait l'appel, le lien ayant déjà disparu de l'URL.
    await page.evaluate((lea) => {
      window._supaReal = false;
      history.replaceState(null, "", "?call=appel-4&from=" + lea + "&kind=voice");
      _checkIncomingCallFromUrl();
    }, UID_LEA);
    const { docs } = await lireSonde(page);
    expect(await page.evaluate(() => [location.search, !!window._callIncoming])).toEqual(["", false]);

    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);

    await page.evaluate(() => { window._supaReal = true; });
    await page.waitForFunction(() => !!window._callIncoming, null, { polling: 50, timeout: 5000 });
    await page.evaluate(() => declineIncomingCall());
    await rechargeSurB(page, docs);
  });

  test("⑤ je diffuse un Live : du titre à la fin du direct, la page ne recharge pas", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    const { docs } = await lireSonde(page);

    // Le titre, puis la permission de la caméra : aucun état n'existe encore.
    await page.evaluate(() => { window.__tenue.media = true; window.__depart = startVideoLive(); });
    await page.waitForSelector("#vlivePretitleGo", { timeout: 5000 });

    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);
    await page.evaluate(() => document.getElementById("vlivePretitleGo").click());
    await page.waitForFunction(() => !!window.__tenue.relacherMedia, null, { polling: 50, timeout: 5000 });
    expect(await page.evaluate(() => !!window._vliveHost)).toBe(false);

    await page.evaluate(async () => { window.__tenue.relacherMedia(); await window.__depart; });
    expect(await page.evaluate(() => !!window._vliveHost)).toBe(true);
    await gesteDepasse(page);
    await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
    const pendant = await restePourLinstant(page, docs);
    expect(pendant.toasts).not.toContain(TOAST_MAJ);

    await page.evaluate(() => { sessionStorage.setItem("__fin", String(Date.now())); return endVideoLive(); });
    const apres = await rechargeSurB(page, docs);
    expect(apres.toasts.some((t) => t.startsWith("Live terminé"))).toBe(true);
    expect(apres.calmeMs, "« Live terminé · … » a le temps d'être lu").toBeGreaterThanOrEqual(CALME_MIN_MS);
  });

  test("⑥ je regarde un Live : la page attend aussi pendant que je le rejoins", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    const { docs } = await lireSonde(page);

    await page.evaluate(() => { window.__tenue.lecture = true; window.__depart = joinVideoLive("vl_lea"); });
    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);
    expect(await page.evaluate(() => !!window._vliveView)).toBe(false);

    await page.evaluate(async () => { window.__tenue.relacherLecture(); await window.__depart; });
    expect(await page.evaluate(() => !!window._vliveView)).toBe(true);
    await gesteDepasse(page);
    await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
    await restePourLinstant(page, docs);

    await page.evaluate(() => leaveVideoLive());
    await rechargeSurB(page, docs);
  });

  test("⑦ ouverte depuis un lien de Live : l'attente du client ne perd pas le lien", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await page.evaluate(() => {
      window._supaReal = false;
      history.replaceState(null, "", "?live=vl_lea");
      _checkLiveFromUrl();
    });
    const { docs } = await lireSonde(page);
    expect(await page.evaluate(() => location.search)).toBe("");

    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);

    await page.evaluate(() => { window._supaReal = true; });
    await page.waitForFunction(() => !!window._vliveView, null, { polling: 50, timeout: 5000 });
    await page.evaluate(() => leaveVideoLive());
    await rechargeSurB(page, docs);
  });

  test("⑧ saisie dans une conversation : rien n'est perdu, et la page recharge en la quittant", async ({ page }) => {
    // Sur un grand écran, `.app-shell` ne fait que 440 px : le panneau refermé reste dans
    // la fenêtre, découpé seulement par le cadre, et son texte ne doit plus rien retenir.
    await page.setViewportSize({ width: 1280, height: 800 });
    await ouvrirInstallee(page);
    await clientSimule(page);
    await page.evaluate(() => { goTo("messages"); renderMessages(); openConversation("dm_lea"); });
    await page.waitForFunction(() => {
      const f = document.getElementById("conv-fullpage");
      return f && f.classList.contains("active");
    }, null, { polling: 50, timeout: 8000 });
    await page.click("#convFpInput");
    await page.keyboard.type("Bonjour Léa", { delay: 10 });
    const { docs } = await lireSonde(page);

    await deployerB(page);
    // On continue de taper pendant la prise de contrôle : c'est le cas qui perdait tout.
    await page.keyboard.type(" je voulais te dire", { delay: 10 });
    await workerBAuxCommandes(page);
    const pendant = await restePourLinstant(page, docs);
    expect(pendant.toasts).not.toContain(TOAST_MAJ);
    expect(await page.inputValue("#convFpInput")).toBe("Bonjour Léa je voulais te dire");

    // Le brouillon part dans le stockage avant la fin de l'attente.
    await page.waitForTimeout(MARGE_MS);
    await page.evaluate(() => closeConversation());
    await rechargeSurB(page, docs);

    await page.waitForFunction(() => typeof openConversation === "function" && !!document.getElementById("convFpInput"), null, { polling: 100, timeout: 20000 });
    const relu = await page.evaluate(() => {
      const l = document.getElementById("landing");
      if (l) l.classList.remove("active");
      openConversation("dm_lea");
      return document.getElementById("convFpInput").value;
    });
    expect(relu).toBe("Bonjour Léa je voulais te dire");
  });

  test("⑨ saisie au Studio : le champ rempli retient la page, même sans le focus", async ({ page }) => {
    await ouvrirInstallee(page);
    await page.evaluate(() => goTo("studio"));
    await page.waitForSelector("#postText", { state: "visible", timeout: 8000 });
    await page.click("#postText");
    await page.keyboard.type("Ma publication", { delay: 10 });
    await page.evaluate(() => document.getElementById("postText").blur());
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await workerBAuxCommandes(page);
    await restePourLinstant(page, docs);
    expect(await page.inputValue("#postText")).toBe("Ma publication");

    // L'écran quitté (le champ n'est plus visible) : le rechargement n'est pas perdu.
    await page.evaluate(() => goTo("feed"));
    await rechargeSurB(page, docs);
  });

  test("⑩ un champ que l'application a rempli seule ne retient pas la page", async ({ page }) => {
    await ouvrirInstallee(page);
    await page.evaluate(() => goTo("studio"));
    await page.waitForSelector("#postText", { state: "visible", timeout: 8000 });
    // Comme un brouillon restauré ou un formulaire prérempli : aucun événement de confiance.
    await page.evaluate(() => {
      const c = document.getElementById("postText");
      c.value = "Rempli par l'application";
      c.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
  });

  test("⑪ page sans contrôleur, occupée : ni rechargement, et le toast reste sa seule annonce (UXO-11)", async ({ page }) => {
    await page.addInitScript(() => {
      window._vliveView = { id: "vl_lea" };
      caches.open("passio-vANCIENNE");
    });
    await page.goto(adresse());
    await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
    await expect.poll(async () => (await lireSonde(page)).toasts, { timeout: 15000, intervals: [100] }).toContain(TOAST_MAJ);
    const s = await lireSonde(page);
    expect(s.msgs).toContain("SW_UPDATED");
    expect(s.docs).toBe(1);
    expect(s.nav).toBe("navigate");
  });

  test("⑫ le bloc app n'a pas chargé : la lecture de l'état ne lève rien, la mise à jour s'applique", async ({ page }) => {
    etat.sansApp = true;
    await page.goto(adresse());
    await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
    await page.reload();
    await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
    // Prémisse : l'application est absente, aucun état d'appel n'a été initialisé.
    expect(await page.evaluate(() => [typeof startCall, typeof window._call])).toEqual(["undefined", "undefined"]);
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await expect.poll(async () => {
      const s = await lireApresNavigation(page);
      return s ? s.buildId : null;
    }, { timeout: 20000, intervals: [100] }).toBe(artefacts.relB.buildId);
    const s = await lireSonde(page);
    expect(s.docs).toBe(docs + 1);
    expect(s.erreurs.filter((m) => /_call|_vlive|_appelLanceA/.test(m))).toEqual([]);
  });

  test("⑬ un geste abandonné ne retient pas la page au-delà de sa borne", async ({ page }) => {
    await ouvrirInstallee(page);
    await gesteDepasse(page);
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
  });
});

// ── Enregistrements, médias en attente, envois ─────────────────────────────
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const VIDEO_COURTE = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28y";

async function ouvrirConversationLea(page) {
  await page.evaluate(() => { goTo("messages"); renderMessages(); openConversation("dm_lea"); });
  await page.waitForFunction(() => {
    const f = document.getElementById("conv-fullpage");
    return f && f.classList.contains("active");
  }, null, { polling: 50, timeout: 8000 });
}

async function ouvrirStudio(page) {
  await page.evaluate(() => goTo("studio"));
  await page.waitForSelector("#postText", { state: "visible", timeout: 8000 });
}

async function ouvrirCapture(page, mode) {
  await page.evaluate((m) => meOpen(m), mode);
  await page.waitForFunction(() => {
    const e = document.getElementById("mediaEditor");
    return e && e.classList.contains("me-cam-on");
  }, null, { polling: 50, timeout: 15000 });
}

// Le déploiement, et la preuve que la page en a tenu compte tout de suite.
async function miseAJourPendant(page, docs) {
  await deployerB(page);
  await workerBAuxCommandes(page);
  return restePourLinstant(page, docs);
}

// La minuterie du report tourne : sans état pour retenir la page, elle partirait.
async function toujoursRetenue(page, docs) {
  await page.waitForTimeout(ATTENTE_REPORT_ARME_MS);
  return restePourLinstant(page, docs);
}

// Tient toute lecture de fichier : c'est le trou entre l'arrêt d'un enregistrement et
// ce qui en prend la suite, où plus aucun état n'existe.
const tenirLectures = (page) => page.evaluate(() => {
  const lire = FileReader.prototype.readAsDataURL;
  const attente = [];
  FileReader.prototype.readAsDataURL = function (blob) { attente.push(() => lire.call(this, blob)); };
  window.__relacherLectures = () => {
    FileReader.prototype.readAsDataURL = lire;
    attente.splice(0).forEach((f) => f());
  };
});

// Comme `gesteDepasse` : sans ça, la marque de préparation couvrirait la suite du cas,
// et retirer la lecture de l'état suivant ne ferait rougir personne.
const preparationDepassee = (page) => page.evaluate(() => { window._mediaPrepareA = performance.now() - 16000; });

const depotTenu = (page) => page.waitForFunction(() => window.__tenue.depotsTenus > 0, null, { polling: 50, timeout: 10000 });
const insertionTenue = (page) => page.waitForFunction(() => window.__tenue.insertionsTenues > 0, null, { polling: 50, timeout: 10000 });

// La publication telle qu'elle revient après le rechargement.
async function publicationRelue(page, id) {
  await page.waitForFunction(() => typeof state !== "undefined" && !!state.userPosts, null, { polling: 100, timeout: 20000 });
  return page.evaluate((i) => {
    const p = state.userPosts.find((x) => x.id === i);
    return p ? { statut: p.syncStatus || null, texte: p.text, image: p.image || null, video: p.video || null } : null;
  }, id);
}

// La conversation telle qu'elle revient après le rechargement.
async function messagesRelus(page) {
  await page.waitForFunction(() => typeof getConversations === "function" && (getConversations() || []).some((c) => c.id === "dm_lea"), null, { polling: 100, timeout: 20000 });
  return page.evaluate(() => getConversations().find((c) => c.id === "dm_lea").messages.map((m) => ({
    id: m.id, statut: m.status || null, vocal: !!m.voiceData, image: !!m.img, video: !!m.video,
  })));
}

test.describe("PWA — le rechargement d'une mise à jour attend un enregistrement, un média, un envoi", () => {
  test("⑭ vocal : l'enregistrement continue, puis le dépôt et l'insertion aboutissent avant le rechargement", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirConversationLea(page);
    await page.evaluate(() => startVoiceRecord());
    expect(await page.evaluate(() => window._isRecording)).toBe(true);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    const pendant = await toujoursRetenue(page, docs);
    expect(pendant.toasts, "« recharge pour l'appliquer » couperait le vocal").not.toContain(TOAST_MAJ);
    expect(await page.evaluate(() => _voiceRecorder.state)).toBe("recording");
    expect(await page.textContent("#voiceRecordTimer")).not.toBe("0:00");

    // Arrêté : la lecture du fichier tient, et aucun état ne dit plus rien du vocal.
    await tenirLectures(page);
    await page.evaluate(() => { window.__tenue.depot = true; stopVoiceRecord(); });
    await page.waitForFunction(() => window._isRecording === false, null, { polling: 50, timeout: 5000 });
    await toujoursRetenue(page, docs);

    await page.evaluate(() => window.__relacherLectures());
    await depotTenu(page);
    await preparationDepassee(page);
    await toujoursRetenue(page, docs);

    // Le dépôt a réussi, l'insertion part : une coupure ici perdrait encore le message.
    await page.evaluate(() => { window.__tenue.insertion = true; window.__tenue.relacherDepot(); });
    await insertionTenue(page);
    await toujoursRetenue(page, docs);
    const [{ id }] = await messagesRelus(page);

    await page.evaluate(() => window.__tenue.relacherInsertion());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("conv_messages:" + id);
    expect(await messagesRelus(page)).toEqual([{ id, statut: "sent", vocal: true, image: false, video: false }]);
  });

  test("⑮ vocal oublié : il ne retient pas la page au-delà de sa borne", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirConversationLea(page);
    await page.evaluate(() => startVoiceRecord());
    expect(await page.evaluate(() => window._isRecording)).toBe(true);
    await page.evaluate(() => { _voiceStartAt = Date.now() - 16 * 60000; });
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
  });

  test("⑯ capture d'une bobine : la page attend l'enregistrement, puis l'aperçu, et recharge en le quittant", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirCapture(page, "bobine");
    await page.evaluate(() => meStartRecording());
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    const pendant = await toujoursRetenue(page, docs);
    expect(pendant.toasts).not.toContain(TOAST_MAJ);
    expect(await page.evaluate(() => meCam.recorder.state)).toBe("recording");

    await tenirLectures(page);
    await page.evaluate(() => meStopRecording());
    await toujoursRetenue(page, docs);
    expect(await page.evaluate(() => [meCam.recording, !!meState.media])).toEqual([false, false]);

    await page.evaluate(() => window.__relacherLectures());
    await page.waitForFunction(() => document.getElementById("mediaEditor").classList.contains("phase-edit"), null, { polling: 50, timeout: 10000 });
    await preparationDepassee(page);
    await toujoursRetenue(page, docs);
    expect(await page.evaluate(() => meState.mediaType)).toBe("video");

    await page.evaluate(() => meClose());
    await rechargeSurB(page, docs);
  });

  test("⑰ caméra ouverte, rien de filmé : rien à perdre, la page recharge aussitôt", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirCapture(page, "story");
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
  });

  test("⑱ audio du Studio : l'enregistrement puis l'audio prêt retiennent la page, et la quitter recharge", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirStudio(page);
    await page.evaluate(() => toggleRecording());
    await page.waitForFunction(() => document.getElementById("recBtn").classList.contains("recording"), null, { polling: 50, timeout: 8000 });
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);
    expect(await page.evaluate(() => mediaRecorder.state)).toBe("recording");

    await tenirLectures(page);
    await page.evaluate(() => toggleRecording());
    await toujoursRetenue(page, docs);
    expect(await page.evaluate(() => !!audioDataUrl)).toBe(false);

    await page.evaluate(() => window.__relacherLectures());
    await page.waitForFunction(() => !!audioDataUrl, null, { polling: 50, timeout: 8000 });
    await preparationDepassee(page);
    await toujoursRetenue(page, docs);

    // L'écran quitté, comme un champ rempli : le rechargement n'est pas perdu.
    await page.evaluate(() => goTo("feed"));
    await rechargeSurB(page, docs);
  });

  test("⑲ photo puis vidéo choisies au Studio : chacune retient la page tant qu'elle attend", async ({ page }) => {
    await ouvrirInstallee(page);
    await ouvrirStudio(page);
    await page.evaluate((png) => { photoDataUrl = png; renderPhotoPreview(); }, PNG_1PX);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    await page.evaluate((video) => { clearPhoto(); videoDataUrl = video; renderVideoPreview(); }, VIDEO_COURTE);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => clearVideo());
    await rechargeSurB(page, docs);
  });

  test("⑳ vidéo jointe en cours d'optimisation : le choix du fichier ne se perd pas", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirConversationLea(page);
    // Comme une optimisation d'une minute, qui rend finalement la main au repli brut.
    await page.evaluate(() => {
      window.passioCompressVideo = () => new Promise((res, rej) => { window.__finOptimisation = () => rej(new Error("banc")); });
      const fichier = new File([new Uint8Array(2200000)], "balade.mp4", { type: "video/mp4" });
      handleAttachFile({ files: [fichier], value: "x" }, "media");
    });
    await page.waitForSelector("#meProgressOv", { state: "attached", timeout: 5000 });
    await preparationDepassee(page);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => window.__finOptimisation());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures.some((e) => e.startsWith("conv_messages:")), "la vidéo est partie avant le rechargement").toBe(true);
  });

  test("㉑ photo publiée : le dépôt dure plus que l'affichage, la page attend, et rien n'est perdu", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirStudio(page);
    await page.evaluate((png) => {
      window.__tenue.depot = true;
      studioType = "photo";
      photoDataUrl = png;
      document.getElementById("postText").value = "Ma photo";
      window.__publication = publishPost();
    }, PNG_1PX);
    await depotTenu(page);
    const id = await page.evaluate(() => state.userPosts[0].id);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    // `publishPost` rend la main au bout de 5 s (« Post en local ») : l'envoi continue.
    await page.evaluate(() => window.__publication);
    expect(await page.evaluate(() => _publishInProgress)).toBe(false);
    const pendant = await toujoursRetenue(page, docs);
    expect(pendant.toasts).not.toContain(TOAST_MAJ);

    await page.evaluate(() => window.__tenue.relacherDepot());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("posts:" + id);
    const relue = await publicationRelue(page, id);
    expect(relue.statut).toBe("synced");
    expect(relue.image, "le média n'est pas revenu « perdu »").toMatch(/^https?:/);
  });

  test("㉒ bobine publiée : la page attend le dépôt de la vidéo", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirCapture(page, "bobine");
    await page.evaluate((video) => {
      window.__tenue.depot = true;
      meSetMedia(video, "video");
      meState._enteredEditAt = 0;
      window.__publication = mePublish();
    }, VIDEO_COURTE);
    await depotTenu(page);
    expect(await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("open"))).toBe(false);
    const id = await page.evaluate(() => state.userPosts[0].id);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => window.__tenue.relacherDepot());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("posts:" + id);
    const relue = await publicationRelue(page, id);
    expect(relue.statut).toBe("synced");
    expect(relue.video).toMatch(/^https?:/);
  });

  test("㉓ story publiée : la page attend, puis la story est bien partie", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page, { vraisMedias: true });
    await ouvrirCapture(page, "story");
    await page.evaluate((png) => {
      window.__tenue.depot = true;
      meSetMedia(png, "photo");
      meState._enteredEditAt = 0;
      window.__publication = mePublish();
    }, PNG_1PX);
    await depotTenu(page);
    expect(await page.evaluate(() => document.getElementById("mediaEditor").classList.contains("open"))).toBe(false);
    const id = await page.evaluate(() => state.seed.stories[0].id);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => window.__tenue.relacherDepot());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("stories:" + id);
  });

  test("㉔ publication de texte en cours : elle survit au rechargement, la page n'attend pas", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirStudio(page);
    await page.evaluate(() => {
      window.__tenue.insertion = true;
      studioType = "text";
      document.getElementById("postText").value = "Mon texte";
      window.__publication = publishPost();
    });
    await insertionTenue(page);
    const id = await page.evaluate(() => state.userPosts[0].id);
    // Ce qui retient la page, c'est le média en mémoire : pas une URL déjà déposée.
    expect(await page.evaluate(() => [
      _publicationPorteUnMedia({ audio: "data:audio/mp4;base64,AAAA" }),
      _publicationPorteUnMedia({ audio: "https://exemple.test/a.m4a", image: null, text: "data:" }),
    ])).toEqual([true, false]);
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
    const relue = await publicationRelue(page, id);
    expect(relue.texte).toBe("Mon texte");
    expect(["syncing", "offline"], "elle repart au démarrage (_rejouerPublicationsEnAttente)").toContain(relue.statut);
  });

  test("㉕ pièce jointe : de la compression à l'insertion, rien ne part sous l'utilisateur", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirConversationLea(page);
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      c.getContext("2d").fillRect(0, 0, 16, 16);
      const png = await new Promise((r) => c.toBlob(r, "image/png"));
      const compresser = window.passioCompressImage;
      window.passioCompressImage = (...a) => new Promise((res) => {
        window.__relacherCompression = () => { window.passioCompressImage = compresser; res(compresser(...a)); };
      });
      window.__tenue.depot = true;
      handleAttachFile({ files: [new File([png], "photo.png", { type: "image/png" })], value: "x" }, "media");
    });
    const { docs } = await lireSonde(page);

    // La compression tient : aucun message, aucun dépôt, seule la marque retient la page.
    await miseAJourPendant(page, docs);
    // La marque dure 15 s, et une CI chargée peut en passer une bonne part à installer B.
    await page.evaluate(() => _mediaEnPreparation());
    await toujoursRetenue(page, docs);
    expect(await messagesRelus(page)).toEqual([]);

    await page.evaluate(() => window.__relacherCompression());
    await depotTenu(page);
    await preparationDepassee(page);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => { window.__tenue.insertion = true; window.__tenue.relacherDepot(); });
    await insertionTenue(page);
    await toujoursRetenue(page, docs);
    const [{ id }] = await messagesRelus(page);

    await page.evaluate(() => window.__tenue.relacherInsertion());
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("conv_messages:" + id);
    expect(await messagesRelus(page)).toEqual([{ id, statut: "sent", vocal: false, image: true, video: false }]);
  });

  test("㉖ dépôt échoué, renvoi prévu : le média attend l'essai suivant au lieu de se perdre", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirStudio(page);
    await page.evaluate((png) => {
      window.__tenue.depotEchoue = true;
      studioType = "photo";
      photoDataUrl = png;
      document.getElementById("postText").value = "Ma photo";
      window.__publication = publishPost();
    }, PNG_1PX);
    await page.waitForFunction(() => state.userPosts[0].syncStatus === "offline" && !!window._reelRetryTimer, null, { polling: 50, timeout: 20000 });
    const id = await page.evaluate(() => state.userPosts[0].id);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    // Le réseau revient, et l'essai suivant part sans attendre ses 45 s.
    await page.evaluate(() => {
      window.__tenue.depotEchoue = false;
      clearTimeout(window._reelRetryTimer);
      window.__renvoi = _rejouerPublicationsEnAttente();
    });
    const apres = await rechargeSurB(page, docs);
    expect(apres.ecritures).toContain("posts:" + id);
    const relue = await publicationRelue(page, id);
    expect(relue.statut).toBe("synced");
    expect(relue.image).toMatch(/^https?:/);
  });

  test("㉗ dernier essai passé : plus rien à attendre, le rechargement n'est pas perdu", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirStudio(page);
    await page.evaluate((png) => {
      window.__tenue.depotEchoue = true;
      window._reelRetryCount = 8;
      studioType = "photo";
      photoDataUrl = png;
      document.getElementById("postText").value = "Ma photo";
      window.__publication = publishPost();
    }, PNG_1PX);
    await page.waitForFunction(() => state.userPosts[0].syncStatus === "offline", null, { polling: 50, timeout: 20000 });
    expect(await page.evaluate(() => [!!window._reelRetryTimer, window._envoisEnCours])).toEqual([false, 0]);
    await page.evaluate(() => { goTo("feed"); });
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
  });

  test("㉘ la marque de préparation ne retient pas la page au-delà de sa borne", async ({ page }) => {
    await ouvrirInstallee(page);
    await page.evaluate(() => _mediaEnPreparation());
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await preparationDepassee(page);
    await rechargeSurB(page, docs);
  });

  test("㉙ un envoi qui ne rend jamais la main ne retient pas la page au-delà de sa borne", async ({ page }) => {
    await ouvrirInstallee(page);
    // Une fin rappelée ne doit pas libérer l'envoi d'à côté.
    expect(await page.evaluate(() => {
      const voisin = _envoiCommence();
      const fin = _envoiCommence();
      fin();
      fin();
      const restants = window._envoisEnCours;
      voisin();
      return [restants, window._envoisEnCours];
    })).toEqual([1, 0]);
    await page.evaluate(() => { window.__sansFin = _envoiCommence(); });
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);
    await page.evaluate(() => { window._envoiLanceA = performance.now() - 16 * 60000; });
    await rechargeSurB(page, docs);
  });

  test("㉚ insertion refusée : le verdict rend la main, et le message reste renvoyable", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirConversationLea(page);
    await page.evaluate(() => {
      window.__tenue.insertion = true;
      handleAttachFile({ files: [new File([new Uint8Array(4096)], "note.pdf", { type: "application/pdf" })], value: "x" }, "doc");
    });
    await insertionTenue(page);
    await preparationDepassee(page);
    const [{ id }] = await messagesRelus(page);
    const { docs } = await lireSonde(page);

    await miseAJourPendant(page, docs);
    await toujoursRetenue(page, docs);

    await page.evaluate(() => { window.__tenue.insertionRefusee = true; window.__tenue.relacherInsertion(); });
    await rechargeSurB(page, docs);
    expect(await messagesRelus(page)).toEqual([{ id, statut: "failed", vocal: false, image: false, video: false }]);
    expect(await page.evaluate((i) => JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").some((x) => x.msgId === i), id)).toBe(true);
  });

  test("㉛ publication de texte en échec, renvoi prévu : rien à protéger, la page n'attend pas", async ({ page }) => {
    await ouvrirInstallee(page);
    await clientSimule(page);
    await ouvrirStudio(page);
    // ⚠️ APRÈS LA REPRISE DU DÉMARRAGE (6 s, `_rejouerPublicationsEnAttente`) : elle remet
    // `_reelRetryTimer` à zéro le temps de son essai, et le renvoi prévu ne se verrait plus.
    await page.waitForFunction(() => performance.now() > 7000, null, { polling: 100, timeout: 15000 });
    await page.evaluate(() => {
      window.__tenue.insertionRefusee = true;
      studioType = "text";
      document.getElementById("postText").value = "Mon texte";
      window.__publication = publishPost();
    });
    await page.waitForFunction(() => state.userPosts[0].syncStatus === "offline" && !!window._reelRetryTimer, null, { polling: 50, timeout: 15000 });
    const id = await page.evaluate(() => state.userPosts[0].id);
    await page.evaluate(() => window.__publication);
    await page.evaluate(() => goTo("feed"));
    const { docs } = await lireSonde(page);

    await deployerB(page);
    await rechargeSurB(page, docs);
    const relue = await publicationRelue(page, id);
    expect(relue.texte).toBe("Mon texte");
    expect(relue.statut).toBe("offline");
  });
});
