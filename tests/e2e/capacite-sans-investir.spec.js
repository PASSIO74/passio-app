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
  // ⚠️ Le message ne parle plus SEULEMENT de mégaoctets : `passioCompressVideo`
  // refuse au-delà de 65 secondes, et c'est le motif le plus fréquent — un refus
  // qui ne citerait que la taille enverrait chercher la mauvaise cause.
  expect(r.refus, "un refus DOIT porter son message utilisateur").toMatch(/impossible à optimiser|trop lourde/i);
  expect(r.refus, "…et nommer les DEUX motifs possibles, durée comprise").toMatch(/minute/i);
});

test("① quater LA TROISIÈME PORTE : une vidéo jointe à une conversation y passe aussi", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ CE CAS EXISTE PARCE QUE LE LOT A ÉCRIT « LES DEUX PORTES » ALORS QU'IL Y
  // EN AVAIT TROIS. `#attachImageFile` porte `accept="image/*,video/*"` : une
  // vidéo jointe en messagerie tombait dans `handleAttachFile` → `_processAttach`
  // en FileReader brut, et le contrôle de 40 Mo juste au-dessus est
  // IMAGE-SEULEMENT — donc aucune borne du tout, plus permissif que l'ancien
  // Studio. Relevé par `audit-passio`, pas par les dix cas précédents.
  const r = await page.evaluate(async () => {
    const vus = [];
    window.passioVideoPourEnvoi = function (f) { vus.push(f.size); return Promise.resolve("data:video/mp4;base64," + "A".repeat(3000)); };
    const traites = [];
    window._processAttach = function (input, kind, file) {
      traites.push({ kind, taille: file && file.size, type: file && file.type, nom: file && file.name });
    };
    const input = document.getElementById("attachImageFile");
    if (!input) return { absent: true };
    const accept = input.getAttribute("accept") || "";
    const fichier = new File([new Uint8Array(9 * 1024 * 1024)], "clip.mp4", { type: "video/mp4" });
    const dt = new DataTransfer(); dt.items.add(fichier);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r2) => setTimeout(r2, 500));
    return { accept, vus, traites };
  });
  expect(r.absent, "#attachImageFile doit exister").toBeFalsy();
  expect(r.accept, "cette porte accepte bien des vidéos — c'est ce qui en fait une porte vidéo").toContain("video/");
  expect(r.vus, "la vidéo jointe DOIT traverser l'autorité de préparation").toEqual([9 * 1024 * 1024]);
  // Et ce qui part vers le seau est la version PRÉPARÉE, pas le fichier d'origine.
  expect(r.traites.length, "un seul envoi").toBe(1);
  expect(r.traites[0].taille, "le fichier transmis n'est plus l'original de 9 Mo").toBeLessThan(9 * 1024 * 1024);
  // ⚠️ CE CAS NE MESURAIT QUE LA TAILLE, ET IL ÉTAIT VERT SUR UNE RÉGRESSION
  // COMPLÈTE (contre-revue adversariale du 2026-09-19). `_passioDataUrlToFile`
  // forçait `image/jpeg` + `.jpg` EN DUR — c'était juste tant qu'elle ne servait
  // qu'aux images. Branchée sur la vidéo, elle faisait que `_processAttach` voyait
  // un type image (`file.type.startsWith("video/")` faux) → `msg.img`, blob
  // déposé en `image/jpeg` avec un cache d'un an, et `content.fileType` annonçant
  // « image » au destinataire, qui recevait une image cassée POUR TOUJOURS.
  // **Un verrou qui mesure la taille ne mesure pas le type.**
  expect(r.traites[0].type, "le type doit rester une VIDÉO — sinon le destinataire reçoit une image cassée").toMatch(/^video\//);
  expect(r.traites[0].nom, "…et l'extension doit suivre le contenu, pas une constante").toMatch(/\.mp4$/);
});

test("① quinquies une vidéo SANS type MIME passe quand même par l'autorité (sélecteurs Android)", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ Certains sélecteurs Android rendent `file.type === ""`. Gardée sur le seul
  // type, la porte laissait alors repasser le fichier BRUT — le contrôle de 40 Mo
  // juste au-dessus étant IMAGE-SEULEMENT, il n'y avait aucune borne du tout.
  // Ce n'est pas une régression du lot, mais le lot AFFIRME que cette porte est
  // bornée : une affirmation qu'un cas dément est pire qu'un trou connu.
  const r = await page.evaluate(async () => {
    const vus = [];
    window.passioVideoPourEnvoi = function (f) { vus.push(f.name); return Promise.resolve("data:video/mp4;base64," + "A".repeat(3000)); };
    const traites = [];
    window._processAttach = function (input, kind, file) { traites.push({ type: file && file.type }); };
    const input = document.getElementById("attachImageFile");
    if (!input) return { absent: true };
    const fichier = new File([new Uint8Array(9 * 1024 * 1024)], "sansmime.mov", { type: "" });
    const dt = new DataTransfer(); dt.items.add(fichier);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r2) => setTimeout(r2, 500));
    return { vus, traites };
  });
  expect(r.absent).toBeFalsy();
  expect(r.vus, "l'extension doit suffire quand le type MIME manque").toEqual(["sansmime.mov"]);
  expect(r.traites[0] && r.traites[0].type, "et le type reconstruit vient du contenu préparé").toMatch(/^video\//);
});

test("① sexies une compression qui ne rend JAMAIS son verdict ne verrouille pas l'écran", async ({ page }) => {
  await bootOnboarded(page);
  // ⚠️ `passioCompressVideo` ne conclut que sur `video.onended`, et sa boucle de
  // dessin est un `requestAnimationFrame` : une page passée en arrière-plan
  // pendant l'encodage suspend la lecture, `onended` ne part jamais, la promesse
  // reste EN VOL — et `#meProgressOv` (position:fixed, inset:0, z-index 5200,
  // sans croix ni Échap) reste posé : l'application est MORTE jusqu'au
  // rechargement. Le mode d'échec préexistait à l'éditeur média ; ce lot l'a
  // branché sur le Studio ET la messagerie, donc il a TRIPLÉ sa surface.
  const r = await page.evaluate(async () => {
    window.VIDEO_COMPRESSION_DELAI_MAX = 300;   // on n'attend pas 90 s au banc
    window.passioCompressVideo = function () { return new Promise(function () {}); };  // ne se règle JAMAIS
    const t0 = Date.now();
    let sortie = null;
    try { sortie = (await window.passioVideoPourEnvoi(new File([new Uint8Array(12 * 1024 * 1024)], "fige.mp4", { type: "video/mp4" }))).slice(0, 5); }
    catch (e) { sortie = "LEVE:" + (e.motifUtilisateur || e.message); }
    return { sortie, ms: Date.now() - t0, overlay: !!document.getElementById("meProgressOv") };
  });
  expect(r.overlay, "l'overlay plein écran NE DOIT PAS survivre — sans croix ni Échap, c'est l'app qui est morte").toBe(false);
  expect(r.sortie, "sous 25 Mo, l'expiration retombe sur le repli brut").toBe("data:");
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

  // ⚠️ LES DEUX PORTES, ET C'EST TOUT L'OBJET DU CAS. La première rédaction
  // n'exerçait que `onbGoogleAuth` : retirer `_amenerConsentementAuxYeux()` de
  // `onbDoAuth` laissait les dix cas VERTS — alors que le commentaire d'app-02
  // cite précisément « posée à une seule porte, l'autre l'aurait oubliée » comme
  // la faute à ne pas commettre. Un verrou qui n'exerce qu'une porte ne garde
  // qu'une porte (relevé par `audit-passio`).
  for (const porte of ["onbGoogleAuth", "onbDoAuth"]) {
    test(`② ter (${porte}) le refus de consentement AMÈNE la case à l'écran — un refus muet est une panne`, async ({ page }) => {
      await sansDonneesDistantes(page);
      await page.goto("/");
      await page.evaluate(() => { try { PassioFirstRun.allerConnexion(); } catch (e) {} });
      const r = await page.evaluate(async (nom) => {
        switchAuthTab("signup");
        // ⚠️ ON NE REMPLACE PLUS `scrollIntoView` PAR UN MOUCHARD. La première
        // rédaction vérifiait qu'on avait DEMANDÉ `block: "center"` — jamais que
        // le refus restait lisible après le défilement RÉEL. C'est « on mesure
        // l'appel, pas le résultat », dans le lot même qui cite le défaut du
        // 2026-09-18. La contre-revue adversariale a calculé qu'à 390 × 664
        // centrer la case pouvait renvoyer `#authMsg` à ~−100 px : la cible
        // visible, le motif hors champ — le défaut réparé, en miroir.
        // On laisse donc défiler pour de vrai et on mesure ce qu'on VOIT.
        const wrap = document.getElementById("authConsentWrap");
        document.getElementById("authConsent").checked = false;
        // `onbDoAuth` va plus loin que la garde : on lui donne de quoi ne pas
        // buter avant elle, et on ne mesure QUE le comportement de la garde.
        const mail = document.getElementById("authEmail"); if (mail) mail.value = "essai@exemple.com";
        const mdp = document.getElementById("authPassword"); if (mdp) mdp.value = "lavande-colibri-4917";
        const nomChamp = document.getElementById("authName"); if (nomChamp) nomChamp.value = "Essai Capacite";
        // ⚠️ `onbDoAuth` valide la confirmation du mot de passe AVANT la garde de
        // consentement : sans ce champ, on mesurerait « les mots de passe ne
        // correspondent pas » au lieu du refus visé. Une prémisse non posée fait
        // rougir un cas sur autre chose que son sujet.
        const conf = document.getElementById("authPasswordConfirm"); if (conf) conf.value = "lavande-colibri-4917";
        try { await window[nom](); } catch (e) {}
        // Le défilement est `smooth` : on lui laisse le temps d'aboutir, sinon on
        // mesure la géométrie d'avant — un cas vert sur une prémisse non tenue.
        await new Promise((r2) => setTimeout(r2, 900));
        const geo = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { haut: Math.round(b.top), bas: Math.round(b.bottom) }; };
        const echo = document.getElementById("authConsentRefus");
        return {
          msg: (document.getElementById("authMsg").textContent || ""),
          echoTexte: (echo && echo.textContent) || "",
          echoAffiche: !!(echo && getComputedStyle(echo).display !== "none"),
          echoGeo: geo(echo),
          caseGeo: geo(wrap),
          vue: window.innerHeight,
        };
      }, porte);
      expect(r.msg, "le refus doit se prononcer").toMatch(/accepte les conditions/i);
      // ⚠️ LE RÉSULTAT, PAS L'APPEL : après le défilement réel, la case ET le
      // motif doivent être À L'ÉCRAN. C'est ce qui rend la réparation robuste
      // sans être réglée au pixel — l'écho vit à côté de la case, donc la
      // position exacte du défilement n'a plus à être parfaite.
      expect(r.caseGeo.haut, "la case doit être dans l'écran").toBeGreaterThanOrEqual(0);
      expect(r.caseGeo.bas, "…entièrement").toBeLessThanOrEqual(r.vue);
      expect(r.echoAffiche, "un refus doit se prononcer LÀ OÙ L'ON AGIT, pas seulement en haut").toBe(true);
      expect(r.echoTexte, "…et dire quoi faire").toMatch(/coche/i);
      expect(r.echoGeo.haut, "le motif doit être visible après le défilement").toBeGreaterThanOrEqual(0);
      expect(r.echoGeo.bas, "…entièrement").toBeLessThanOrEqual(r.vue);
    });
  }

  test("② quater cocher EFFACE le refus, et une bascule d'onglet aussi", async ({ page }) => {
    await sansDonneesDistantes(page);
    await page.goto("/");
    await page.evaluate(() => { try { PassioFirstRun.allerConnexion(); } catch (e) {} });
    // Un refus qui survit à la réponse est un refus qui ment ; et en connexion la
    // case n'est même plus à l'écran — un refus orphelin y désignerait le vide.
    const r = await page.evaluate(async () => {
      switchAuthTab("signup");
      document.getElementById("authConsent").checked = false;
      try { await window.onbGoogleAuth(); } catch (e) {}
      const apresRefus = getComputedStyle(document.getElementById("authConsentRefus")).display !== "none";
      const boite = document.getElementById("authConsent");
      boite.checked = true;
      boite.dispatchEvent(new Event("change", { bubbles: true }));
      const apresCoche = getComputedStyle(document.getElementById("authConsentRefus")).display !== "none";
      boite.checked = false;
      try { await window.onbGoogleAuth(); } catch (e) {}
      switchAuthTab("signin");
      const apresBascule = getComputedStyle(document.getElementById("authConsentRefus")).display !== "none";
      return { apresRefus, apresCoche, apresBascule };
    });
    expect(r.apresRefus, "prémisse : le refus est bien posé").toBe(true);
    expect(r.apresCoche, "répondre, c'est répondre").toBe(false);
    expect(r.apresBascule, "un refus ne survit pas à une bascule d'onglet").toBe(false);
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
  // ⚠️ `perf` N'EST PAS ÉCHANTILLONNÉ, et ce cas garde la leçon : le premier jet
  // du lot le tirait à 10 %, ce qui détruisait l'instrumentation PERF-IOS —
  // `ios_stat_*` sont DÉJÀ des agrégats (p50/p95/p99 par instantané) et
  // `page_load`/`ios_context` sont une ligne par SESSION. C'est le banc
  // `perf-ios.spec.js` ⑧ qui l'a arrêté, pas la relecture.
  expect(r.perf, "un agrégat ne s'échantillonne pas : on le perdrait, on ne le résumerait pas").toBe(1);
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
  // ⚠️ LE MOTIF DOIT COUVRIR LA QUERY. L'URL porte désormais `?r=<release>` (le
  // service worker sert `data/*.json` en stale-while-revalidate : sans clé de
  // release, la copie du déploiement PRÉCÉDENT répondait 200 et se rangeait sous
  // la clé du NOUVEAU, figeant un référentiel périmé pour toute la release).
  // Un `**/data/passions-v1.json` sans `*` final n'intercepte alors PLUS RIEN —
  // et les deux cas ⑤ mesuraient le vide en se croyant verts.
  await page.route("**/data/passions-v1.json*", (route) => { telechargements++; route.continue(); });
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
  await page.route("**/data/passions-v1.json*", (route) => route.abort());   // `*` final : l'URL porte `?r=<release>`
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

test("⑤ ter l'URL du référentiel PORTE la release — sans quoi le SW peut figer une copie périmée", async ({ page }) => {
  // ⚠️ CE CAS EXISTE PARCE QUE LES DEUX PRÉCÉDENTS SONT VERTS AVEC *OU SANS* LA
  // CLÉ DE RELEASE : ils mesurent le cache, pas la fraîcheur de ce qu'on y met.
  // `data/passions-v1.json` n'est ni `/`, ni `/media/*`, ni un `.js` : il tombe
  // dans la DERNIÈRE branche de `sw.js`, en stale-while-revalidate
  // (`return cached || network`). Au premier démarrage qui suit un déploiement,
  // l'ancien service worker contrôle encore la page et rend la copie de la
  // release PRÉCÉDENTE avec un HTTP 200 parfaitement valide — que le cache
  // durable rangeait alors sous la clé de la release COURANTE, gelant un
  // référentiel périmé jusqu'au déploiement suivant. La query change la clé de
  // cache du SW, donc l'ancienne entrée ne peut plus répondre.
  const urls = [];
  await page.route("**/data/passions-v1.json*", (route) => { urls.push(route.request().url()); route.continue(); });
  await poserGateSansPremiereVisite(page);
  await page.addInitScript(() => { window.PASSIO_RELEASE = { commit: "0123456789abcdef" }; });
  await sansDonneesDistantes(page);
  await page.goto("/");
  await page.evaluate(() => window.PassioPassions && window.PassioPassions.charger());
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
  expect(urls.length, "prémisse : le référentiel est bien demandé au réseau").toBeGreaterThanOrEqual(1);
  expect(urls[0], "l'URL doit porter la release servie").toContain("r=01234567");
});

test("⑤ quater HORS ARTEFACT, l'URL est INCHANGÉE — le comportement d'avant tient à l'octet près", async ({ page }) => {
  // Pas de `window.PASSIO_RELEASE` (serve local, bancs) → ni cache, ni query.
  // Une optimisation qui changerait le comportement là où elle est inactive
  // n'est pas inactive.
  const urls = [];
  await page.route("**/data/passions-v1.json*", (route) => { urls.push(route.request().url()); route.continue(); });
  await poserGateSansPremiereVisite(page);
  await sansDonneesDistantes(page);
  await page.goto("/");
  await page.evaluate(() => window.PassioPassions && window.PassioPassions.charger());
  await page.waitForFunction(() => window.PassioPassions && window.PassioPassions.pret(), null, { timeout: 15000 });
  expect(urls.length).toBeGreaterThanOrEqual(1);
  expect(urls[0], "sans release, aucune query ne doit être ajoutée").not.toContain("?");
});
