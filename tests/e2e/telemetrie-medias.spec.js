// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — UNE PHOTO OU UNE VIDÉO QUI NE S'AFFICHE PAS LAISSE UNE TRACE
// (2026-11-21, audit de surveillance, trou T5)
//
// Avant ce lot, si toutes les photos cessaient de s'afficher, rien ne partait :
// les `onerror` du produit écrivent « Image indisponible » et se taisent.
// `js/telemetry.js` compte désormais, par capture au niveau du document, les
// emplacements de média affichés et ceux qui échouent, puis envoie UN bilan
// par période et par famille EN ÉCHEC : `media` / `bilan`, meta
// `{famille, ko, vus, ko_av, vus_av}` — des nombres et un mot d'une liste
// fermée, jamais une adresse.
//
// Ce banc garde :
//   ①  la surface réelle : trois images du stockage mortes, une servie → un
//      bilan `stockage`, `warn`, les cinq clés et rien d'autre, aucune adresse ;
//      le `onerror` du produit a toujours la main ;
//   ②  le dénominateur (`vus`) et ce qui n'est PAS un média : image `data:`,
//      `src` vide, script et feuille de style en erreur ; rien sans échec ;
//   ③  les cinq familles, dont le faux `*.supabase.co` → `externe` ; une ligne
//      par famille en échec, aucune pour une famille sans échec ;
//   ④  le seuil « notable » : `warn` seulement pour `stockage` et `demo`, à
//      partir de trois échecs et d'autant d'échecs que d'affichages ;
//   ⑤  hors ligne, bascule réseau, fermeture : jugés AU VERDICT, pas comptés ;
//   ⑥  page masquée, occultation dans la fenêtre, retour au premier plan : pas
//      comptés ;
//   ⑦  la cadence : rien avant 20 s, puis une ligne ; plancher de 5 min ; la
//      seconde ligne est un DELTA ;
//   ⑧  la fenêtre du dénominateur (60 s) ;
//   ⑨  sous pression ou sous délestage, le bruit de fond attend et la panne
//      part ; un bilan retenu ne réveille pas l'appareil toutes les 20 s ; le
//      délestage allonge la période ;
//   ⑩  le bilan part AVEC le lot de fermeture et avec celui du masquage ;
//   ⑪  `setEnabled(false)` remet les compteurs à zéro et plus rien ne se compte ;
//   ⑫  vidéo et son : `loadedmetadata`, `error` sur l'élément et sur <source> ;
//      une vidéo vidée par `src=""` n'est pas un échec ;
//   ⑬  chaque nombre est borné.
//
// ⚠️ AUCUN OCTET NE PART VERS LA PRODUCTION : les POST vers `telemetry_events`
// sont interceptés, le démarrage vise le projet Supabase VIDE, et chaque média
// du banc est servi ou refusé par une route de page. L'horloge est simulée
// (`page.clock`) : aucun délai réel de 2 s, 20 s ou 5 min.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { projetSupabaseVide } = require("./app-helper");

const MOTIF_TEL = "**/rest/v1/telemetry_events*";
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
// Un son PCM d'un dixième de seconde : le seul média audio ou vidéo que tout
// Chromium sait lire sans codec.
function sonWav() {
  const n = 800, b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write("data", 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
const WAV = sonWav();
const FAUX_PROJET = "https://autreprojetxxxxxxxxxx.supabase.co";
const TIERS = "https://medias-banc.invalid";

async function intercepter(page) {
  await projetSupabaseVide(page);
  const etat = { lots: [] };
  await page.route(MOTIF_TEL, (route) => {
    let rows = [];
    try { rows = JSON.parse(route.request().postData() || "[]"); } catch (e) { rows = []; }
    etat.lots.push(Array.isArray(rows) ? rows : []);
    return route.fulfill({ status: 201, body: "" });
  });
  // Les médias du banc, quel que soit l'hôte : `…/banc/ko-…` est refusé,
  // `…/banc/ok-…` est servi. Routes de PAGE : elles passent avant le projet vide.
  await page.route("**/banc/ko-*", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/banc/ok-*", (route) => (/\.wav(\?|$)/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: "audio/wav", body: WAV })
    : route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX })));
  return etat;
}

// Posé par `page.evaluate` (jamais une balise <script> en ligne). `poser` crée
// les éléments dans un conteneur VISIBLE et rend une promesse réglée quand
// chacun a reçu son événement de ressource.
function installerBanc(wavB64) {
  const boite = document.createElement("div");
  boite.id = "bancMedias";
  boite.style.cssText = "position:fixed;left:0;top:0;width:200px;height:200px;z-index:99999;overflow:hidden";
  document.body.appendChild(boite);
  const hote = new URL(window.PASSIO_SUPABASE.url).host;
  window.__banc = {
    stockage: (nom) => "https://" + hote + "/storage/v1/object/public/content/banc/" + nom,
    blobWav: () => {
      const brut = atob(wavB64), octets = new Uint8Array(brut.length);
      for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
      return URL.createObjectURL(new Blob([octets], { type: "audio/wav" }));
    },
    poser: (specs) => Promise.all(specs.map((s) => new Promise((ok) => {
      const el = document.createElement(s.tag || "img");
      let cible = el;
      ["load", "error", "loadedmetadata"].forEach((n) => el.addEventListener(n, () => ok(n)));
      if (s.onerror) el.setAttribute("onerror", s.onerror);
      if (s.tag === "video" || s.tag === "audio") { el.preload = "auto"; el.muted = true; }
      if (s.tag === "link") el.rel = "stylesheet";
      if (s.source) {
        cible = document.createElement("source");
        cible.addEventListener("error", () => ok("error"));
        cible.setAttribute("src", s.src);
        el.appendChild(cible);
      } else if (s.tag === "link") el.setAttribute("href", s.src);
      else el.setAttribute("src", s.src);
      if (s.id) el.id = s.id;
      boite.appendChild(el);
    }))),
  };
  window.__masque = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__masque ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__masque });
  window.__occulter = (masque) => { window.__masque = !!masque; document.dispatchEvent(new Event("visibilitychange")); };
  window.__horsLigne = false;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => !window.__horsLigne });
}

// Charge la page d'accueil, mesure active, horloge simulée ; puis part de
// compteurs VIDES (l'opposition suivie de la reprise les remet à zéro — c'est
// le cas ⑪ qui le prouve).
async function charger(page) {
  const etat = await intercepter(page);
  await poserGateSansPremiereVisite(page);
  await page.clock.install();
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 30000 });
  expect(await page.evaluate(() => !!(window.tel && window.tel.enabled)), "télémétrie active").toBe(true);
  await page.evaluate(installerBanc, WAV.toString("base64"));
  await page.clock.fastForward(3000);
  await page.evaluate(() => { window.tel.setEnabled(false); window.tel.setEnabled(true); });
  expect(await medias(page), "le banc part de compteurs vides").toEqual({});
  return etat;
}

const medias = (page) => page.evaluate(() => window.tel._medias());
const verdict = (page) => page.clock.fastForward(2100);
const C = (ko, vus, koAv, vusAv) => ({ ko, vus, ko_av: koAv || 0, vus_av: vusAv || 0 });

// `n` images du stockage refusées (nom unique à chaque appel).
let _serie = 0;
async function echecs(page, n, famille) {
  const serie = ++_serie;
  await page.evaluate(([nb, fam, k, tiers]) => {
    const specs = [];
    for (let i = 0; i < nb; i++) {
      const nom = "ko-" + k + "-" + i + ".jpg";
      specs.push({ src: fam === "demo" ? "/demo/u/banc/" + nom : fam === "externe" ? tiers + "/banc/" + nom : window.__banc.stockage(nom) });
    }
    return window.__banc.poser(specs);
  }, [n, famille || "stockage", serie, TIERS]);
}
async function succes(page, n, famille) {
  const serie = ++_serie;
  await page.evaluate(([nb, fam, k]) => {
    const specs = [];
    for (let i = 0; i < nb; i++) {
      const nom = "ok-" + k + "-" + i + ".png";
      specs.push({ src: fam === "demo" ? "/demo/u/banc/" + nom : window.__banc.stockage(nom) });
    }
    return window.__banc.poser(specs);
  }, [n, famille || "stockage", serie]);
}
// Tous les bilans émis : ceux déjà partis (routes) et ceux encore en file.
async function bilans(page, etat) {
  const file = await page.evaluate(() => window.tel._queue());
  const vus = new Map();
  for (const r of etat.lots.flat().concat(file)) if (r && r.type === "media") vus.set(r.event_id, r);
  return [...vus.values()].sort((a, b) => String(a.client_ts).localeCompare(String(b.client_ts)));
}
// Demande un bilan et rend les lignes qu'il vient de poser, dans l'ordre de la file.
const bilan = (page, raison) => page.evaluate((r) => {
  const n = window.tel._mediaBilan(r);
  const file = window.tel._queue().filter((e) => e.type === "media");
  return { n, lignes: n ? file.slice(-n) : [] };
}, raison);
const metaNue = (ligne) => {
  const m = Object.assign({}, ligne.meta);
  delete m.mode; delete m.trafic;   // posés par `track` sur toute ligne
  return m;
};

test.describe("Télémétrie — médias qui ne s'affichent pas (T5)", () => {
  // ⚠️ SANS SERVICE WORKER : une fois la page contrôlée, c'est le worker qui
  // demande les images de même origine, et une requête émise par un worker
  // échappe à `page.route` (mesuré dans couverture-image-detachee.spec.js).
  test.use({ serviceWorkers: "block" });

  test("T5-① trois images du stockage mortes et une servie : un bilan stockage, cinq clés, aucune adresse", async ({ page }) => {
    await charger(page);
    await page.evaluate(() => window.__banc.poser([
      { src: window.__banc.stockage("ko-a.jpg"), onerror: "imageFilIndisponible(this)" },
      { src: window.__banc.stockage("ko-b.jpg"), onerror: "imageFilIndisponible(this)" },
      { src: window.__banc.stockage("ko-c.jpg"), onerror: "imageFilIndisponible(this)" },
      { src: window.__banc.stockage("ok-a.png") },
    ]));
    // La capture n'a pas volé le gestionnaire du produit.
    await expect(page.locator("#bancMedias .post-image-indisponible")).toHaveCount(3);
    // Avant le verdict, un échec n'est pas encore compté ; un affichage, si.
    expect(await medias(page)).toEqual({ stockage: C(0, 1) });
    await verdict(page);
    expect(await medias(page)).toEqual({ stockage: C(3, 1) });
    expect((await page.evaluate(() => window.tel._queue().filter((e) => e.type === "media"))).length, "rien en file avant le bilan").toBe(0);

    const r = await bilan(page, "banc");
    expect(r.n).toBe(1);
    const l = r.lignes[0];
    expect([l.type, l.action, l.severity, l.status]).toEqual(["media", "bilan", "warn", "ok"]);
    expect(metaNue(l)).toEqual({ famille: "stockage", ko: 3, vus: 1, ko_av: 0, vus_av: 0 });
    expect(Object.keys(l.meta).filter((k) => !["famille", "ko", "vus", "ko_av", "vus_av", "mode", "trafic"].includes(k))).toEqual([]);
    const hote = await page.evaluate(() => new URL(window.PASSIO_SUPABASE.url).host);
    const texte = JSON.stringify(l);
    for (const interdit of [hote, "supabase", "storage", "banc", ".jpg", ".png", "https:"]) {
      expect(texte.includes(interdit), "la ligne ne porte pas « " + interdit + " »").toBe(false);
    }
    expect(l.endpoint, "aucun endpoint").toBeNull();
    expect(l.message, "aucun message").toBeNull();
    // Le bilan a remis les compteurs à zéro.
    expect(await medias(page)).toEqual({});
  });

  test("T5-② les images vues sont comptées ; data:, src vide, script et feuille de style ne sont pas des médias ; rien sans échec", async ({ page }) => {
    const etat = await charger(page);
    await succes(page, 4);
    await page.evaluate(() => window.__banc.poser([
      { src: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" },
      { src: "" },
      { src: "   " },
      { tag: "script", src: "/banc/ko-script.js" },
      { tag: "link", src: "/banc/ko-style.css" },
    ]));
    // Le geste du produit (`img.src = ""`) sur une image DÉJÀ affichée.
    await page.evaluate(() => new Promise((ok) => {
      const img = document.querySelector("#bancMedias img");
      img.addEventListener("error", ok);
      img.src = "";
    }));
    await verdict(page);
    expect(await medias(page)).toEqual({ stockage: C(0, 4) });
    expect((await bilan(page, "periode")).n).toBe(0);
    expect((await bilan(page, "sortie")).n, "aucune ligne sans échec, même à la sortie").toBe(0);
    await page.clock.fastForward(25000);
    expect((await bilans(page, etat)).length).toBe(0);
  });

  test("T5-③ cinq familles : le faux supabase.co est externe, une ligne par famille en échec, aucune sans échec", async ({ page }) => {
    await charger(page);
    const table = await page.evaluate(([faux, tiers]) => {
      const f = window.tel._familleMedia, h = new URL(window.PASSIO_SUPABASE.url).host;
      return [
        f("https://" + h + "/storage/v1/object/public/content/u1/photo.jpg"),
        f("https://" + h + "/storage/v1/object/sign/attachments/a%40b.fr/x.webp?token=eyJhbGciOiJIUzI1NiJ9.e30.abc"),
        f(faux + "/storage/v1/object/public/content/u1/photo.jpg"),
        f("https://" + h + ".evil.example/storage/v1/object/public/content/x.jpg"),
        f("https://evil.example/" + h + "/storage/v1/object/public/x.jpg"),
        f("https://" + h + "/rest/v1/posts"),
        f("/demo/u/photo-1.jpg"),
        f(location.origin + "/demo/u/photo-2.jpg"),
        f("/icons/icon-192.png"),
        f("#"),
        f(tiers + "/demo/u/photo-1.jpg"),
        f("blob:" + location.origin + "/0000-1111"),
        f("data:image/png;base64,AAAA"),
        f("DATA:audio/wav;base64,AAAA"),
        f("javascript:alert(1)"),
        f(""),
        f(null),
      ];
    }, [FAUX_PROJET, TIERS]);
    expect(table).toEqual([
      "stockage", "stockage", "externe", "externe", "externe", "externe",
      "demo", "demo", "app", "app", "externe", "local", null, null, "externe", null, null,
    ]);

    await echecs(page, 3, "stockage");
    await echecs(page, 1, "demo");
    await succes(page, 2, "demo");
    await page.evaluate(([faux, tiers]) => window.__banc.poser([
      { src: faux + "/storage/v1/object/public/content/banc/ko-faux.jpg" },
      { tag: "video", src: tiers + "/banc/ko-film.mp4" },
      { tag: "audio", src: "data:audio/wav;base64,AAAA" },
      { tag: "audio", src: window.__banc.blobWav() },
      { src: "/banc/ok-meme-origine.png" },
    ]), [FAUX_PROJET, TIERS]);
    await verdict(page);
    expect(await medias(page)).toEqual({
      stockage: C(3, 0), demo: C(1, 2), app: C(0, 1), local: C(1, 1, 1, 1), externe: C(2, 0, 1, 0),
    });

    const r = await bilan(page, "sortie");
    expect(r.lignes.map((l) => [l.meta.famille, l.severity, l.meta.ko, l.meta.vus, l.meta.ko_av, l.meta.vus_av])).toEqual([
      ["stockage", "warn", 3, 0, 0, 0],
      ["demo", "info", 1, 2, 0, 0],
      ["local", "info", 1, 1, 1, 1],
      ["externe", "info", 2, 0, 1, 0],
    ]);
    expect(await medias(page)).toEqual({});
  });

  test("T5-④ notable (warn, prioritaire) seulement pour stockage et demo, à trois échecs et autant d'échecs que d'affichages", async ({ page }) => {
    await charger(page);
    const tour = async (fam, ko, vus) => {
      if (vus) await succes(page, vus, fam);
      await echecs(page, ko, fam);
      await verdict(page);
      const r = await bilan(page, "sortie");
      expect(r.n, fam + " ko " + ko + " vus " + vus).toBe(1);
      const l = r.lignes[0];
      expect([l.meta.famille, l.meta.ko, l.meta.vus]).toEqual([fam, ko, vus]);
      return [l.severity, await page.evaluate((e) => window.tel._estPrioritaire(e), l)];
    };
    expect(await tour("stockage", 2, 0), "(a) deux échecs : sous le seuil").toEqual(["info", false]);
    expect(await tour("stockage", 3, 4), "(b) moins d'échecs que d'affichages").toEqual(["info", false]);
    expect(await tour("stockage", 3, 3), "(c) notable").toEqual(["warn", true]);
    expect(await tour("demo", 3, 0), "(d) demo est une famille de panne").toEqual(["warn", true]);
    expect(await tour("externe", 3, 0), "(e) une famille bruyante reste un bruit de fond").toEqual(["info", false]);
  });

  test("T5-⑤ hors ligne, bascule réseau et fermeture se jugent au verdict : pas comptés", async ({ page }) => {
    await charger(page);
    // (a) l'appareil se dit hors ligne (sans événement : seule la lecture au verdict peut écarter).
    await page.evaluate(() => { window.__horsLigne = true; });
    await echecs(page, 3);
    await verdict(page);
    expect(await medias(page), "(a) hors ligne au verdict").toEqual({});
    await page.evaluate(() => { window.__horsLigne = false; });

    // (b) une bascule réseau survient dans la fenêtre du verdict.
    await echecs(page, 3);
    await page.clock.fastForward(500);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await verdict(page);
    expect(await medias(page), "(b) bascule pendant la fenêtre").toEqual({});

    // (c) des échecs tombent juste APRÈS un retour en ligne.
    await page.clock.fastForward(5000);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.clock.fastForward(300);
    await echecs(page, 3);
    await verdict(page);
    expect(await medias(page), "(c) fenêtre après le retour en ligne").toEqual({});

    // (d) un rechargement décidé par l'application est annoncé avant le verdict.
    await page.clock.fastForward(5000);
    await echecs(page, 3);
    await page.evaluate(() => { window._rechargementImminent = true; });
    await verdict(page);
    expect(await medias(page), "(d) fermeture au verdict").toEqual({});
    await page.evaluate(() => { window._rechargementImminent = false; });

    // Témoin : les mêmes échecs, au calme, sont comptés.
    await page.clock.fastForward(5000);
    await echecs(page, 3);
    await verdict(page);
    expect(await medias(page), "témoin").toEqual({ stockage: C(3, 0) });
  });

  test("T5-⑥ page masquée, occultation dans la fenêtre, retour au premier plan : pas comptés", async ({ page }) => {
    await charger(page);
    // (a) page masquée depuis plus longtemps que la fenêtre.
    await page.evaluate(() => window.__occulter(true));
    await page.clock.fastForward(3000);
    await echecs(page, 3);
    await page.clock.fastForward(3000);
    expect(await medias(page), "(a) page masquée").toEqual({});

    // (c) retour au premier plan, puis des échecs 300 ms après (chargements coupés en arrière-plan).
    await page.evaluate(() => window.__occulter(false));
    await page.clock.fastForward(300);
    await echecs(page, 3);
    await verdict(page);
    expect(await medias(page), "(c) fenêtre après le retour").toEqual({});

    // (b) des échecs, puis la page est masquée moins de 2 s après (iOS coupe AVANT d'annoncer).
    await page.clock.fastForward(5000);
    await echecs(page, 3);
    await page.clock.fastForward(500);
    await page.evaluate(() => window.__occulter(true));
    await page.evaluate(() => { window.__masque = false; });   // redevenue visible SANS événement : seul l'instant d'occultation peut écarter
    await verdict(page);
    expect(await medias(page), "(b) occultation dans la fenêtre du verdict").toEqual({});

    // Témoin : page visible, au calme.
    await page.clock.fastForward(5000);
    await echecs(page, 3);
    await verdict(page);
    expect(await medias(page), "témoin").toEqual({ stockage: C(3, 0) });
  });

  test("T5-⑦ cadence : rien avant 20 s, puis une ligne ; plancher de 5 min ; la seconde ligne est un delta", async ({ page }) => {
    const etat = await charger(page);
    await echecs(page, 3);
    await verdict(page);
    await page.clock.fastForward(9000);
    expect((await bilans(page, etat)).length, "rien 11 s après le premier échec").toBe(0);
    await page.clock.fastForward(11500);
    let b = await bilans(page, etat);
    expect(b.length, "le premier bilan part à 20 s").toBe(1);
    expect(metaNue(b[0])).toEqual({ famille: "stockage", ko: 3, vus: 0, ko_av: 0, vus_av: 0 });

    await echecs(page, 3);
    await verdict(page);
    await page.clock.fastForward(58000);
    expect((await bilan(page, "masque")).n, "plancher : un masquage à 1 min ne pose rien").toBe(0);
    await page.clock.fastForward(180000);
    expect((await bilans(page, etat)).length, "toujours une ligne à 4 min").toBe(1);
    await page.clock.fastForward(65000);
    b = await bilans(page, etat);
    expect(b.length, "la seconde ligne part à la période").toBe(2);
    expect(metaNue(b[1]), "un delta, pas un cumul").toEqual({ famille: "stockage", ko: 3, vus: 0, ko_av: 0, vus_av: 0 });
  });

  test("T5-⑧ fenêtre du dénominateur : sans échec en attente, les affichages de plus d'une minute ne diluent pas la panne", async ({ page }) => {
    await charger(page);
    await succes(page, 10);
    expect(await medias(page)).toEqual({ stockage: C(0, 10) });
    await page.clock.fastForward(61000);
    await succes(page, 1);
    await echecs(page, 3);
    await verdict(page);
    const r = await bilan(page, "periode");
    expect(r.n).toBe(1);
    expect([r.lignes[0].severity, metaNue(r.lignes[0])]).toEqual(["warn", { famille: "stockage", ko: 3, vus: 1, ko_av: 0, vus_av: 0 }]);
  });

  test("T5-⑨ sous pression le bruit de fond attend et la panne part ; un bilan retenu ne réveille pas toutes les 20 s", async ({ page }) => {
    const etat = await charger(page);
    await page.evaluate(() => { window.__pression = true; window.tel.sousPression = () => !!window.__pression; });
    await echecs(page, 1, "demo");
    await echecs(page, 3, "stockage");
    await verdict(page);
    let r = await bilan(page, "periode");
    expect(r.lignes.map((l) => [l.meta.famille, l.severity]), "seule la panne part").toEqual([["stockage", "warn"]]);
    expect(await medias(page), "le bruit de fond reste compté").toEqual({ demo: C(1, 0) });
    r = await bilan(page, "sortie");
    expect(r.lignes.map((l) => [l.meta.famille, l.severity]), "à la sortie, tout part").toEqual([["demo", "info"]]);

    // Bilan retenu : le réveil suivant est à une PÉRIODE, pas 20 s plus tard.
    await page.clock.fastForward(310000);                    // passe le plancher du bilan précédent
    const avant = (await bilans(page, etat)).length;
    await echecs(page, 1, "demo");
    await verdict(page);
    await page.clock.fastForward(21000);                     // premier réveil : retenu
    expect((await bilans(page, etat)).length, "retenu sous pression").toBe(avant);
    expect(await medias(page)).toEqual({ demo: C(1, 0) });
    await page.evaluate(() => { window.__pression = false; });
    await page.clock.fastForward(60000);
    expect((await bilans(page, etat)).length, "aucun réveil dans la minute qui suit").toBe(avant);
    await page.clock.fastForward(250000);
    const b = await bilans(page, etat);
    expect(b.length, "le bilan retenu part au réveil suivant").toBe(avant + 1);
    expect(metaNue(b[b.length - 1])).toEqual({ famille: "demo", ko: 1, vus: 0, ko_av: 0, vus_av: 0 });
  });

  test("T5-⑨b sous délestage le bruit de fond attend aussi, et la période des répétitions s'allonge", async ({ page }) => {
    const etat = await charger(page);
    await page.evaluate(() => { window.__delestageNiveau = () => 1; });
    expect(await page.evaluate(() => delestageFacteur())).toBe(2);
    await echecs(page, 1, "demo");
    await echecs(page, 3, "stockage");
    await verdict(page);
    await page.clock.fastForward(20500);
    let b = await bilans(page, etat);
    expect(b.map((l) => [l.meta.famille, l.severity]), "le premier bilan de panne garde ses 20 s").toEqual([["stockage", "warn"]]);
    expect(await medias(page), "le bruit de fond attend sous délestage").toEqual({ demo: C(1, 0) });

    await echecs(page, 3, "stockage");
    await verdict(page);
    await page.clock.fastForward(320000);
    expect((await bilans(page, etat)).length, "sous délestage ×2, rien à 5 min").toBe(1);
    await page.clock.fastForward(290000);
    b = await bilans(page, etat);
    expect(b.map((l) => [l.meta.famille, l.meta.ko]), "la répétition part à 10 min").toEqual([["stockage", 3], ["stockage", 3]]);
  });

  test("T5-⑩ le bilan part avec le lot de fermeture, et avec celui du masquage", async ({ page }) => {
    const etat = await charger(page);
    await echecs(page, 3);
    await verdict(page);
    await page.evaluate(() => window.__occulter(true));
    await expect.poll(() => etat.lots.flat().filter((r) => r.type === "media").length, { message: "le bilan n'est pas parti au masquage" }).toBe(1);
    expect(etat.lots.flat().some((r) => r.type === "lifecycle" && r.action === "hidden")).toBe(true);

    await page.evaluate(() => window.__occulter(false));
    await page.clock.fastForward(5000);
    await echecs(page, 3);
    await verdict(page);
    await page.clock.fastForward(5000);   // encore sous le plancher de 5 min : seul le départ fait partir
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect.poll(() => etat.lots.flat().filter((r) => r.type === "media").length, { message: "le bilan n'est pas parti à la fermeture" }).toBe(2);
    expect(etat.lots.flat().some((r) => r.type === "session" && r.action === "end")).toBe(true);
    const lot = etat.lots.filter((rows) => rows.some((r) => r.type === "media")).pop();
    const iBilan = lot.findIndex((r) => r.type === "media"), iFin = lot.findIndex((r) => r.type === "session" && r.action === "end");
    expect(iFin, "le bilan et la fin de session partent dans le MÊME lot").toBeGreaterThan(-1);
    expect(iBilan, "le bilan de panne passe avant la fin de session").toBeLessThan(iFin);
  });

  test("T5-⑪ setEnabled(false) remet les compteurs à zéro, annule le minuteur, et plus rien ne se compte", async ({ page }) => {
    const etat = await charger(page);
    await echecs(page, 3);
    await succes(page, 2);
    await verdict(page);                                     // minuteur armé pour dans 20 s
    expect(await medias(page)).toEqual({ stockage: C(3, 2) });
    await page.clock.fastForward(13000);
    await page.evaluate(() => window.tel.setEnabled(false));
    expect(await medias(page), "remise à zéro").toEqual({});
    await echecs(page, 3);
    await succes(page, 2);
    await verdict(page);
    expect(await medias(page), "rien ne se compte pendant le refus").toEqual({});

    // Reprise : le minuteur d'AVANT le refus ne doit pas faire partir le bilan plus tôt.
    await page.evaluate(() => window.tel.setEnabled(true));
    await echecs(page, 3);
    await verdict(page);
    await page.clock.fastForward(9000);                      // l'ancien minuteur aurait sonné ici
    expect((await bilans(page, etat)).length, "le minuteur d'avant le refus est annulé").toBe(0);
    await page.clock.fastForward(12000);
    expect((await bilans(page, etat)).length).toBe(1);
  });

  test("T5-⑫ vidéo et son : loadedmetadata compte un affichage, error un échec (élément et source), une vidéo vidée n'est pas un échec", async ({ page }) => {
    await charger(page);
    await page.evaluate(() => window.__banc.poser([
      { tag: "video", src: window.__banc.stockage("ko-film.mp4") },
      { tag: "video", source: true, src: window.__banc.stockage("ko-film-2.mp4") },
      { tag: "video", src: window.__banc.stockage("ok-son.wav"), id: "bancFilm" },
      { tag: "audio", src: window.__banc.stockage("ok-son-2.wav") },
    ]));
    await verdict(page);
    expect(await medias(page)).toEqual({ stockage: C(2, 2, 2, 2) });
    // Le geste « vider le lecteur » : `src = ""` puis `load()` lève `error` avec l'ANCIENNE adresse dans currentSrc.
    await page.evaluate(() => new Promise((ok) => {
      const v = document.getElementById("bancFilm");
      v.addEventListener("error", ok);
      v.src = ""; v.load();
    }));
    await verdict(page);
    expect(await medias(page), "une vidéo vidée n'est pas un échec").toEqual({ stockage: C(2, 2, 2, 2) });
  });

  test("T5-⑬ chaque nombre d'un bilan est borné à 9 999", async ({ page }) => {
    await charger(page);
    await succes(page, 1);
    // Des événements synthétiques sur une image réelle du stockage : la capture
    // les voit comme les vrais, sans dix mille requêtes.
    await page.evaluate(() => {
      const img = document.querySelector("#bancMedias img");
      for (let i = 0; i < 10050; i++) img.dispatchEvent(new Event("load"));
      for (let i = 0; i < 3; i++) img.dispatchEvent(new Event("error"));
    });
    await verdict(page);
    expect(await medias(page)).toEqual({ stockage: C(3, 10051) });
    const r = await bilan(page, "sortie");
    expect(metaNue(r.lignes[0])).toEqual({ famille: "stockage", ko: 3, vus: 9999, ko_av: 0, vus_av: 0 });
  });
});
