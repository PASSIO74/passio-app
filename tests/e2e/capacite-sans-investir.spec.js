// ════════════════════════════════════════════════════════════════════════════
// CAPACITÉ SANS INVESTIR (2026-09-19) — les verrous des cinq gestes.
//
// Contexte mesuré le jour même (docs/CAPACITE_SANS_INVESTIR_2026-09-19.md) :
// 9 vidéos = 68 Mo = 85 % de tout le Storage ; 300 e-mails/jour chez Brevo, seul
// plafond d'ACQUISITION ; 43 % de la base en télémétrie ; 568 ko de référentiel
// retéléchargés à chaque session.
//
// ⚠️ CHAQUE CAS MESURE LE CÂBLAGE, PAS LA FONCTION. Le dépôt a déjà payé
// `_notifierMessage` : douze verrous appelaient la fonction à la main pendant
// qu'aucun appelant vivant ne l'atteignait.
// ════════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");
const { poserGateSansPremiereVisite } = require("./gate-helper");

// ── ① LA VIDÉO ─────────────────────────────────────────────────────────────

test("① la porte du Studio APPELLE `passioVideoPourEnvoi` — le CÂBLAGE, pas la fonction", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ La première rédaction de ce cas se contentait de
  // `typeof window.passioVideoPourEnvoi === "function"` : elle restait VERTE en
  // remettant le Studio au `FileReader` brut, c'est-à-dire sur le défaut même
  // que le lot ferme. C'est la faute `_notifierMessage` — douze verrous
  // appelaient la fonction à la main pendant qu'aucun appelant vivant ne
  // l'atteignait. On déclenche donc le VRAI geste : un fichier choisi dans la
  // galerie, l'événement `change` que le navigateur émet, et on regarde qui est
  // appelé.
  const r = await page.evaluate(async () => {
    const vus = [];
    window.passioVideoPourEnvoi = function (f) { vus.push(f.size); return Promise.resolve("data:video/mp4;base64," + "A".repeat(3000)); };
    const input = document.getElementById("videoInput");
    if (!input) return { absent: true };
    const fichier = new File([new Uint8Array(12 * 1024 * 1024)], "galerie.mp4", { type: "video/mp4" });
    const dt = new DataTransfer(); dt.items.add(fichier);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r2) => setTimeout(r2, 400));
    return { vus, valeurRemise: input.value };
  });
  expect(r.absent, "#videoInput doit exister").toBeFalsy();
  expect(r.vus, "le fichier de la galerie DOIT traverser l'autorité de préparation").toEqual([12 * 1024 * 1024]);
  // Sans cette remise à zéro, rechoisir LE MÊME fichier n'émet plus d'événement
  // et le Studio a l'air de ne pas répondre.
  expect(r.valeurRemise, "l'input doit être remis à zéro").toBe("");
});

test("① bis un petit fichier passe tel quel, un gros passe par la compression", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const appels = [];
    window.passioCompressVideo = function (f) { appels.push(f.size); return Promise.resolve("data:video/mp4;base64," + "A".repeat(2000)); };
    const petit = new File([new Uint8Array(1024)], "p.mp4", { type: "video/mp4" });
    const gros = new File([new Uint8Array(12 * 1024 * 1024)], "g.mp4", { type: "video/mp4" });
    const rp = await window.passioVideoPourEnvoi(petit);
    const rg = await window.passioVideoPourEnvoi(gros);
    return { appels, petitEstData: rp.indexOf("data:") === 0, grosEstData: rg.indexOf("data:") === 0 };
  });
  expect(r.appels, "sous 8 Mo : aucune compression (transcodage inutile)").toEqual([12 * 1024 * 1024]);
  expect(r.petitEstData).toBe(true);
  expect(r.grosEstData).toBe(true);
});

test("① ter compression indisponible → repli BRUT sous 25 Mo, refus NOMMÉ au-delà", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    window.passioCompressVideo = function () { return Promise.reject(new Error("unsupported")); };
    const out = { repli: null, refus: null };
    // 12 Mo : compression impossible mais encore envoyable → on garde le brut.
    try { out.repli = (await window.passioVideoPourEnvoi(new File([new Uint8Array(12 * 1024 * 1024)], "a.mp4", { type: "video/mp4" }))).indexOf("data:") === 0; }
    catch (e) { out.repli = "LEVE:" + (e.motifUtilisateur || e.message); }
    // 40 Mo : au-delà du repli brut → refus, avec le message à afficher.
    try { await window.passioVideoPourEnvoi(new File([new Uint8Array(40 * 1024 * 1024)], "b.mp4", { type: "video/mp4" })); out.refus = "AUCUN REFUS"; }
    catch (e) { out.refus = e.motifUtilisateur || null; }
    return out;
  });
  expect(r.repli, "sous 25 Mo, un échec de compression ne doit pas refuser la vidéo").toBe(true);
  expect(r.refus, "un refus DOIT porter son message utilisateur").toMatch(/trop lourde/i);
});

// ── ② GOOGLE EN PREMIER ────────────────────────────────────────────────────

// Gabarit iPhone 12 : 390 × 664 est la hauteur UTILE sous Safari, pas les 844
// du gabarit Playwright. C'est la mesure qui a démasqué `#authResendLink` le
// 2026-09-18 — on réutilise la même, sinon on mesure un écran qui n'existe pas.
test.describe("② le bouton Google", () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test("② il est AU-DESSUS DU PLI en mode inscription — c'est tout l'objet du geste", async ({ page }) => {
    await poserGateSansPremiereVisite(page);
    await sansDonneesDistantes(page);
  await page.goto("/");
    await page.evaluate(() => { try { PassioFirstRun.allerConnexion(); } catch (e) {} });
    await page.evaluate(() => switchAuthTab("signup"));
    const m = await page.evaluate(() => {
      const b = document.getElementById("authGoogleBtn");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { haut: Math.round(r.top), bas: Math.round(r.bottom), h: Math.round(r.height), vue: window.innerHeight };
    });
    expect(m, "#authGoogleBtn doit exister").not.toBeNull();
    expect(m.bas, `le bouton finit à ${m.bas} px pour ${m.vue} px d'écran — sous le pli`).toBeLessThanOrEqual(m.vue);
    expect(m.h, "cible tactile Apple : 44 px").toBeGreaterThanOrEqual(44);
  });

  test("② bis UN SEUL nœud pour les deux onglets, et le séparateur NOMME l'alternative", async ({ page }) => {
    await poserGateSansPremiereVisite(page);
    await sansDonneesDistantes(page);
  await page.goto("/");
    await page.evaluate(() => { try { PassioFirstRun.allerConnexion(); } catch (e) {} });
    const n = await page.evaluate(() => document.querySelectorAll("#authGoogleBtn").length);
    expect(n, "deux emplacements = deux états qui divergent").toBe(1);

    const signup = await page.evaluate(() => { switchAuthTab("signup"); return document.getElementById("authGoogleOu").textContent; });
    const signin = await page.evaluate(() => { switchAuthTab("signin"); return document.getElementById("authGoogleOu").textContent; });
    expect(signup).toMatch(/inscris-toi/i);
    expect(signin).toMatch(/connecte-toi/i);
    expect(signup).not.toBe(signin);
  });

  test("② ter le refus de consentement AMÈNE la case à l'écran — un refus muet est une panne", async ({ page }) => {
    await poserGateSansPremiereVisite(page);
    await sansDonneesDistantes(page);
  await page.goto("/");
    await page.evaluate(() => { try { PassioFirstRun.allerConnexion(); } catch (e) {} });
    const r = await page.evaluate(async () => {
      switchAuthTab("signup");
      const vus = [];
      const wrap = document.getElementById("authConsentWrap");
      wrap.scrollIntoView = function (o) { vus.push(o && o.block || "sans-options"); };
      document.getElementById("authConsent").checked = false;
      await window.onbGoogleAuth();
      return { vus, msg: (document.getElementById("authMsg").textContent || "") };
    });
    expect(r.msg, "le refus doit se prononcer").toMatch(/accepte les conditions/i);
    expect(r.vus, "la case désignée par le refus doit être amenée sous les yeux").toContain("center");
  });
});

// ── ④ L'ÉCHANTILLONNAGE ────────────────────────────────────────────────────

test("④ seul le 200 est échantillonné : 201, 204 et les échecs passent ENTIERS", async ({ page }) => {
  await bootOnboarded(page, undefined, 1, { query: "?telemetry=1" });
  const r = await page.evaluate(() => {
    const t = window.PassioTelemetry;
    if (!t || typeof t._tauxEchantillon !== "function") return { absent: true };
    return {
      lecture200: t._tauxEchantillon("api", "GET x", { http_status: 200 }),
      ecriture201: t._tauxEchantillon("api", "POST x", { http_status: 201 }),
      ecriture204: t._tauxEchantillon("api", "DELETE x", { http_status: 204 }),
      refus401: t._tauxEchantillon("api", "POST x", { http_status: 401 }),
      coupure0: t._tauxEchantillon("api", "GET x", { http_status: 0 }),
      sansStatut: t._tauxEchantillon("api", "GET x", {}),
      perf: t._tauxEchantillon("perf", "boot", {}),
      erreur: t._tauxEchantillon("error", "boom", {}),
      action: t._tauxEchantillon("action", "publish_post", {}),
    };
  });
  expect(r.absent, "PassioTelemetry._tauxEchantillon doit être exposé pour être mesurable").toBeFalsy();
  expect(r.lecture200, "les lectures réussies sont le volume : 1 sur 10").toBeCloseTo(0.1, 5);
  expect(r.perf).toBeCloseTo(0.1, 5);
  // ⚠️ LE CŒUR DU CAS : `store.js` compte publications, messages et commentaires
  // sur `http_status === 201`. Les échantillonner diviserait par dix l'activité
  // affichée au pilotage, SANS une erreur.
  expect(r.ecriture201, "un 201 est un compteur d'activité du pilotage").toBe(1);
  expect(r.ecriture204).toBe(1);
  expect(r.refus401, "un 401 est un `api`, donc hors CRITICAL_TYPE : à garder entier").toBe(1);
  expect(r.coupure0, "http 0 = requête morte, c'est un signal").toBe(1);
  expect(r.sansStatut).toBe(1);
  expect(r.erreur).toBe(1);
  expect(r.action).toBe(1);
});

test("④ bis la ligne gardée PORTE SON POIDS — sans lui le taux d'erreur mentirait par dix", async ({ page }) => {
  await bootOnboarded(page, undefined, 1, { query: "?telemetry=1" });
  const r = await page.evaluate(() => {
    const t = window.PassioTelemetry;
    if (!t) return null;
    const vus = [];
    // On force le tirage à « garder » pour observer l'estampille.
    const vraiRandom = Math.random;
    Math.random = () => 0;
    try {
      t.api && t.api({ action: "GET /rest/v1/posts", endpoint: "/rest/v1/posts", http_status: 200, duration_ms: 42 });
      t.api && t.api({ action: "POST /rest/v1/posts", endpoint: "/rest/v1/posts", http_status: 201, duration_ms: 90 });
    } finally { Math.random = vraiRandom; }
    (t._queue ? t._queue() : []).forEach((e) => vus.push({ st: e.http_status, ech: e.meta && e.meta.ech }));
    return vus;
  });
  expect(r, "PassioTelemetry doit être chargé (?telemetry=1)").not.toBeNull();
  const l200 = r.find((e) => e.st === 200);
  const l201 = r.find((e) => e.st === 201);
  expect(l200 && l200.ech, "une lecture gardée en représente 10").toBe(10);
  expect(l201 && l201.ech, "une écriture n'est pas échantillonnée, donc sans poids").toBeUndefined();
});

// ── ⑤ LE CACHE DU RÉFÉRENTIEL ──────────────────────────────────────────────

test("⑤ même release servie → le référentiel vient du cache, ZÉRO octet de réseau", async ({ page }) => {
  let telechargements = 0;
  await page.route("**/data/passions-v1.json", (route) => { telechargements++; route.continue(); });
  await poserGateSansPremiereVisite(page);
  // Hors artefact il n'y a pas de release : sans elle le cache est INACTIF et on
  // mesurerait le comportement d'avant. On pose donc la release avant le boot.
  await page.addInitScript(() => { window.PASSIO_RELEASE = { commit: "abcdef1234567890" }; });

  await sansDonneesDistantes(page);
  await page.goto("/");
  await page.evaluate(() => window.PassioPassions && window.PassioPassions.charger());
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
  const apres1 = telechargements;

  await sansDonneesDistantes(page);
  await page.goto("/");
  await page.evaluate(() => window.PassioPassions && window.PassioPassions.charger());
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });

  expect(apres1, "la première visite télécharge").toBeGreaterThanOrEqual(1);
  expect(telechargements, "la seconde visite ne doit RIEN retélécharger").toBe(apres1);
  const taille = await page.evaluate(() => window.PassioPassions.taille());
  expect(taille, "et le référentiel servi depuis le cache est ENTIER, pas le socle de 19").toBeGreaterThan(1000);
});

test("⑤ bis un repli HORS LIGNE n'est JAMAIS mis en cache — sinon 19 passions pour toujours", async ({ page }) => {
  await poserGateSansPremiereVisite(page);
  await page.addInitScript(() => { window.PASSIO_RELEASE = { commit: "beefbeefbeefbeef" }; });
  await page.route("**/data/passions-v1.json", (route) => route.abort());
  await sansDonneesDistantes(page);
  await page.goto("/");
  await page.evaluate(() => window.PassioPassions && window.PassioPassions.charger());
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });

  const enCache = await page.evaluate(async () => {
    const pq = await window.idbPassionsLoad();
    return pq ? pq.passions.length : null;
  });
  expect(enCache, "le repli au socle ne doit pas s'installer comme référentiel de la session suivante").toBeNull();
});
