// ═══════════════════════════════════════════════════════════════════════════
// QUATRE TABLES REFUSAIENT LES ÉCRITURES D'UN CLIENT QUI N'ÉTAIT PAS CELUI
// QU'IL CROYAIT — LA SUITE DIRECTE DE #367, ET SON SECOND ÉTAGE
//
// Mesuré en production le 2026-09-13 (`telemetry_events`, `type='api'`) :
//
//     POST /rest/v1/profiles           → 401 × 104, 101 sessions, 0 compte   (07:16)
//     POST /rest/v1/story_views        → 401 ×  17,   3 sessions, 0 compte
//     POST /rest/v1/conv_reads         → 401 ×  13,   5 sessions, 0 compte
//     POST /rest/v1/push_subscriptions → 403 ×  17,  12 sessions, 3 COMPTES   (05:51)
//     POST /rest/v1/conv_reads         → 403 ×   2,                 1 compte  (05:29)
//
// ⚠️ IL Y A DEUX CAUSES, ET C'EST LE CODE HTTP QUI LES SÉPARE — pas le libellé.
//
// ① 401, 0 compte : le rôle est ANONYME. `getMyUserId()` fabrique un
//    `u_<aléatoire>` pour tout visiteur et les gardes testaient `!MY_UID` : le
//    placeholder passait. Cause identique à `user_state` (#367), trois tables de
//    plus. Aucune conséquence à l'écran — du bruit pur dans le tableau de bord
//    qui sert à voir les vrais défauts, et qui masquait sa propre famille.
//
// ② 403, AVEC un compte : le jeton est joint et valide (sinon ce serait un 401),
//    donc la session existe — c'est l'IDENTITÉ ÉCRITE qui n'est pas la sienne.
//    `_compteAuthReel()` ne regarde que la FORME de `MY_UID` ; les policies
//    comparent à `auth.uid()`. **Un uuid de la bonne forme peut être celui du
//    mauvais compte**, et aucune garde de forme ne le verra jamais.
//
// ⚠️ ET POUR `push_subscriptions`, LA CAUSE DU 403 N'EST PAS L'IDENTITÉ : c'est
// la PROPRIÉTÉ DE L'ENDPOINT. La clé primaire est l'`endpoint`, qui appartient au
// NAVIGATEUR ; quand un second compte se connecte sur le même appareil,
// `getSubscription()` rend le même endpoint et l'upsert tente de réassigner la
// ligne du premier — refusée par `push_update_own`. Le remède ne peut pas être
// une policy plus permissive (elle laisserait revendiquer la ligne d'autrui) :
// on demande au navigateur un endpoint NEUF, une seule fois par session.
//
// ⚠️ ET L'ÉCHEC ÉTAIT DEUX FOIS MUET : l'`await` de l'upsert ne lisait pas
// `{ error }` (le SDK ne LÈVE PAS sur un refus RLS) et `_callPushReady = true`
// était posé quand même. L'appareil se croyait abonné sans l'être — donc aucune
// notification d'appel ni de message application fermée. Un abonnement qui
// échoue en silence est pire qu'une absence d'abonnement.
//
// Ce que ce banc garde :
//   ⓪ SOURCE — une seule lecture du jeton de session dans le dépôt, et les
//      quatre points d'écriture passent par une autorité (plus de `!MY_UID` nu) ;
//   ① sans compte → `supaEnsureProfileExists` ne touche pas `profiles` ;
//   ② sans compte → ni `conv_reads`, ni `story_views` ;
//   ③ sans compte → aucun abonnement push tenté ;
//   ④ identité PROUVÉE divergente → l'accusé de lecture ne part pas, et il le DIT ;
//   ⑤ session ILLISIBLE → on ne durcit pas : l'écriture part comme avant ;
//   ⑥ compte réel → les trois écritures partent, avec son uuid ;
//   ⑦ push refusé une fois → endpoint reprisIS, upsert réussi, `_callPushReady` vrai ;
//   ⑧ push refusé deux fois → `_callPushReady` reste FAUX (plus de mensonge),
//      et la reprise n'est pas rejouée en boucle.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");
const SOURCE_APP05 = path.join(__dirname, "..", "..", "js", "app-05-config-profil.js");

const UID_COMPTE = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_AUTRE = "88881111-2222-4333-8444-555566667777";

// Le corps d'une fonction top-level, borné au prochain `\nfunction ` ou
// `\nasync function ` — assez pour distinguer « la garde est DANS la fonction »
// de « la garde existe quelque part dans le fichier ».
function corpsDeFonction(src, nom) {
  const i = src.search(new RegExp("\\n(?:async )?function " + nom + "\\("));
  if (i < 0) return "";
  const suite = src.slice(i + 1);
  const k = suite.search(/\n(?:async )?function /);
  return k < 0 ? suite : suite.slice(0, k);
}

/**
 * Démarre l'app, coupe tout Supabase au réseau, et MUTE `window.supa.from` par
 * un faux client qui note chaque opération et sert des réponses programmables.
 *
 * ⚠️ On MUTE `window.supa.from` : `supa` est un `let` de portée script, donc
 * `window.supa = x` créerait une propriété séparée que l'app ne regarde pas.
 * ⚠️ `sansIsolationDesDonnees` : ce banc gère le réseau lui-même — un uuid de
 * banc ne doit jamais atteindre la production, et Playwright évalue les routes
 * dans l'ordre INVERSE de leur enregistrement.
 */
async function banc(page, { uidLocal, uidSession }) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (uidLocal) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, uidLocal);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  // ⚠️ LE JETON SE POSE APRÈS LE BOOT, ET CE N'EST PAS UNE COMMODITÉ DE BANC.
  // Mesuré : posé en `addInitScript`, il a DISPARU une fois l'app démarrée
  // (`localStorage` ne porte plus aucune clé `sb-…`) — un appareil qui porte un
  // compte sans session retrouvée passe par `purgerJetonAuthLocal()`, geste
  // délibéré du produit (fiche « se connecter à un compte déjà créé »). Le poser
  // avant, c'est mesurer une fenêtre que le produit referme ; et un cas écrit
  // ainsi reste VERT sur le défaut, puisque « pas de jeton » = fail-open.
  // `_identiteDivergeDeLaSession` lit le stockage À CHAQUE APPEL : c'est donc à
  // l'instant de l'écriture qu'il faut le poser, ce qui est son contrat réel.
  if (uidSession) {
    await page.evaluate((u) => {
      const ref = (String((window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.url) || "")
        .match(/https?:\/\/([^.]+)\./) || [])[1];
      localStorage.setItem("sb-" + ref + "-auth-token", JSON.stringify({
        access_token: "jeton-de-banc",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: u },
      }));
    }, uidSession);
  }
  await page.evaluate(() => {
    window.__ops = [];
    window.__reponses = {};           // { table: [{error}, …] } — consommées dans l'ordre
    const requete = (table) => {
      const q = {};
      ["select", "eq", "lte", "maybeSingle", "single", "order", "limit", "in", "neq"]
        .forEach((m) => { q[m] = () => q; });
      ["upsert", "insert", "update", "delete"].forEach((op) => {
        q[op] = (payload) => { window.__ops.push({ table, op, payload }); return q; };
      });
      q.then = (ok, ko) => {
        const file = window.__reponses[table];
        const r = (file && file.length) ? file.shift() : { data: null, error: null };
        return Promise.resolve(Object.assign({ data: null, error: null, status: r.error ? 403 : 200 }, r)).then(ok, ko);
      };
      return q;
    };
    window.supa.from = (table) => requete(table);
    window._supaReal = true;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__ops = []; });
}

const ops = (page, table) => page.evaluate((t) =>
  window.__ops.filter((o) => o.table === t), table);

/** Pose un faux service worker + PushManager pour exercer l'abonnement push. */
async function poserFauxPush(page) {
  await page.evaluate(() => {
    window.__push = { subscribe: 0, unsubscribe: 0 };
    const faireSub = (n) => ({
      endpoint: "https://push.exemple/endpoint-" + n,
      toJSON: () => ({ endpoint: "https://push.exemple/endpoint-" + n, keys: {} }),
      unsubscribe: () => { window.__push.unsubscribe++; return Promise.resolve(true); },
    });
    let courant = faireSub(1);
    const reg = {
      pushManager: {
        getSubscription: () => Promise.resolve(courant),
        subscribe: () => { window.__push.subscribe++; courant = faireSub(1 + window.__push.subscribe); return Promise.resolve(courant); },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", { value: { ready: Promise.resolve(reg) }, configurable: true });
    window.PushManager = function () {};
    Object.defineProperty(window, "Notification", { value: { permission: "granted" }, configurable: true });
    window._callPushReady = false;
    window._pushEndpointRepris = false;
  });
}

test.describe("écritures Supabase : l'identité écrite est celle de la session", () => {
  test("⓪ source — une seule lecture du jeton, et quatre points d'écriture gardés", () => {
    const app08 = fs.readFileSync(SOURCE_APP08, "utf8");
    const app05 = fs.readFileSync(SOURCE_APP05, "utf8");

    // Une SEULE lecture du jeton de session dans tout le fichier : deux copies
    // du parsing (v1 vs v2, marge d'horloge) finiraient par diverger.
    const lectures = (app08.match(/localStorage\.getItem\("sb-" \+ ref/g) || []).length;
    expect(lectures, "le jeton `sb-<ref>-auth-token` n'est lu qu'à un seul endroit").toBe(1);

    const lecteur = corpsDeFonction(app08, "_sessionSdkPersistee");
    expect(lecteur, "l'autorité de lecture existe").not.toBe("");
    expect(corpsDeFonction(app08, "_analyticsSessionUtilisable").includes("_sessionSdkPersistee("),
      "les analytics passent par elle, ils n'ont pas gardé leur copie").toBe(true);

    const diverge = corpsDeFonction(app08, "_identiteDivergeDeLaSession");
    expect(diverge, "l'autorité d'identité existe").not.toBe("");
    // Elle ne répond `true` que sur une divergence PROUVÉE : sans `suid`, rien.
    expect(diverge.includes("!!(suid && uid &&"),
      "elle exige les DEUX identités avant de conclure").toBe(true);

    for (const nom of ["supaMarkRead", "supaMarkStoryView"]) {
      const corps = corpsDeFonction(app08, nom);
      expect(corps, `${nom} existe toujours`).not.toBe("");
      expect(corps.includes("_compteAuthReel("), `${nom} passe par l'autorité de compte`).toBe(true);
    }
    // ⚠️ LA GARDE DE `profiles` N'EST PAS DANS `supaEnsureProfileExists`, ET C'EST
    // VOULU : cette fonction a seize appelants, presque tous déclenchés par un
    // geste d'un compte réel, et son contrat (« la ligne existe ») est exigé par
    // dix cas de `hotfix-profil-passion-custom`. Le défaut mesuré ne vient que
    // d'UN appelant — le démarrage — donc c'est LUI qui est gardé. On le mesure
    // à la source, sur le seul endroit du fichier qui crée la ligne sans qu'un
    // geste l'ait demandé.
    expect(app08.includes("} else if (_compteAuthReel()) {"),
      "le démarrage ne crée la ligne profiles que pour un compte").toBe(true);
    expect(app08.includes("catch(e) { if (_compteAuthReel()) { try { await supaEnsureProfileExists(); }"),
      "et sa branche d'échec est gardée de la même façon — sinon le refus repart par là").toBe(true);
    // La forme EXACTE du défaut : une garde qui se contente de « MY_UID est posé ».
    expect(corpsDeFonction(app08, "supaMarkRead").includes("!MY_UID"),
      "supaMarkRead ne se contente plus de la présence de MY_UID").toBe(false);
    expect(corpsDeFonction(app08, "supaMarkStoryView").includes("!MY_UID"),
      "supaMarkStoryView non plus").toBe(false);

    const push = corpsDeFonction(app05, "ensureCallPushSubscription");
    expect(push, "ensureCallPushSubscription existe toujours").not.toBe("");
    expect(push.includes("_uidEstUnCompte"), "le push exige un compte").toBe(true);
    expect(push.includes("r.error"), "et il LIT le verdict de l'upsert").toBe(true);
    // `_callPushReady` ne doit plus être posé sans avoir lu l'erreur.
    const avantDrapeau = push.slice(0, push.indexOf("window._callPushReady = true"));
    expect(avantDrapeau.includes("if (r && r.error)"),
      "le drapeau n'est posé qu'APRÈS le verdict").toBe(true);
  });

  test("① sans compte — le DÉMARRAGE ne crée pas de ligne profiles", async ({ page }) => {
    // ⚠️ On exerce `supaInit()`, pas `supaEnsureProfileExists()` : le défaut n'est
    // pas dans la fonction (son contrat reste « crée la ligne de MY_UID ») mais
    // dans l'appelant qui la déclenche sans qu'un geste l'ait demandée. Un cas qui
    // appellerait la fonction à la main resterait vert le jour où la garde
    // disparaîtrait du démarrage — le défaut exact vécu avec `_notifierMessage`.
    await banc(page, {});
    const uid = await page.evaluate(() => MY_UID);
    expect(uid, "le banc part bien d'un placeholder").toMatch(/^u_/);
    await page.evaluate(async () => { try { await supaInit(); } catch (e) {} });
    await page.waitForTimeout(400);
    const ecritures = (await ops(page, "profiles")).filter((o) => o.op !== "select");
    expect(ecritures, "aucune écriture sur profiles au démarrage d'un visiteur").toEqual([]);
  });

  test("② sans compte — ni conv_reads, ni story_views", async ({ page }) => {
    await banc(page, {});
    await page.evaluate(async () => {
      await supaMarkRead("conv_banc");
      await supaMarkStoryView("s1");
    });
    expect(await ops(page, "conv_reads"), "aucun accusé de lecture").toEqual([]);
    expect(await ops(page, "story_views"), "aucune vue de story").toEqual([]);
  });

  test("③ sans compte — aucun abonnement push tenté", async ({ page }) => {
    await banc(page, {});
    await poserFauxPush(page);
    const r = await page.evaluate(async () => {
      await ensureCallPushSubscription();
      return { push: window.__push, pret: !!window._callPushReady };
    });
    expect(await ops(page, "push_subscriptions"), "rien n'est écrit").toEqual([]);
    expect(r.push.subscribe, "et on n'abonne même pas le navigateur").toBe(0);
    expect(r.pret, "le drapeau reste faux").toBe(false);
  });

  test("④ identité prouvée divergente — l'accusé de lecture ne part pas", async ({ page }) => {
    await banc(page, { uidLocal: UID_COMPTE, uidSession: UID_AUTRE });
    const r = await page.evaluate(async () => {
      const diverge = _identiteDivergeDeLaSession(MY_UID);
      await supaMarkRead("conv_banc");
      return { uid: MY_UID, diverge };
    });
    expect(r.uid, "le client se croit ce compte").toBe(UID_COMPTE);
    expect(r.diverge, "mais la session en nomme un autre, et on le sait").toBe(true);
    expect(await ops(page, "conv_reads"), "donc rien n'est écrit sous une identité qui n'est pas la sienne").toEqual([]);
  });

  test("⑤ session illisible — on ne durcit pas : l'écriture part comme avant", async ({ page }) => {
    // Aucun jeton posé : `_sessionSdkPersistee()` rend null. La garde doit
    // s'abstenir de conclure — sinon un stockage bloqué couperait les écritures
    // de tous les comptes légitimes.
    await banc(page, { uidLocal: UID_COMPTE });
    const r = await page.evaluate(async () => {
      const diverge = _identiteDivergeDeLaSession(MY_UID);
      await supaMarkRead("conv_banc");
      return { diverge };
    });
    expect(r.diverge, "sans session lisible, aucune divergence n'est prouvée").toBe(false);
    const w = await ops(page, "conv_reads");
    expect(w.length, "et l'accusé de lecture part").toBe(1);
    expect(w[0].payload.user_id).toBe(UID_COMPTE);
  });

  test("⑥ compte réel — les trois écritures partent avec son uuid", async ({ page }) => {
    await banc(page, { uidLocal: UID_COMPTE, uidSession: UID_COMPTE });
    // Le jeton est bien LU : sans cette assertion, le cas passerait aussi avec
    // une session absente (fail-open) et ne prouverait rien de l'identité.
    expect(await page.evaluate(() => {
      const s = _sessionSdkPersistee();
      return s && s.user && s.user.id;
    }), "la session du banc est lisible, et c'est bien ce compte").toBe(UID_COMPTE);
    await page.evaluate(async () => {
      await supaMarkRead("conv_banc");
      await supaMarkStoryView("s1");
      try { await supaInit(); } catch (e) {}
    });
    await page.waitForTimeout(400);
    const reads = await ops(page, "conv_reads");
    const vues = await ops(page, "story_views");
    const profils = await ops(page, "profiles");
    expect(reads.length, "accusé de lecture").toBe(1);
    expect(reads[0].payload.user_id).toBe(UID_COMPTE);
    expect(vues.length, "vue de story").toBe(1);
    expect(vues[0].payload.user_id).toBe(UID_COMPTE);
    const creations = profils.filter((o) => o.op === "insert");
    expect(creations.length, "le démarrage d'un compte crée bien sa ligne").toBeGreaterThanOrEqual(1);
    expect(creations[0].payload.id, "et elle porte son uuid").toBe(UID_COMPTE);
  });

  test("⑦ push refusé une fois — l'endpoint est repris, l'upsert réussit", async ({ page }) => {
    await banc(page, { uidLocal: UID_COMPTE, uidSession: UID_COMPTE });
    await poserFauxPush(page);
    const r = await page.evaluate(async () => {
      // Premier upsert refusé (l'endpoint appartient à un autre compte), second OK.
      window.__reponses.push_subscriptions = [{ error: { code: "42501", message: "row-level security" } }, { error: null }];
      await ensureCallPushSubscription();
      return { push: window.__push, pret: !!window._callPushReady };
    });
    const w = await ops(page, "push_subscriptions");
    expect(w.length, "deux tentatives : la refusée, puis celle de l'endpoint neuf").toBe(2);
    expect(r.push.unsubscribe, "l'ancien abonnement est rendu au navigateur").toBe(1);
    expect(r.push.subscribe, "et un endpoint NEUF est demandé").toBe(1);
    expect(w[1].payload.endpoint, "le second upsert porte le nouvel endpoint").not.toBe(w[0].payload.endpoint);
    expect(r.pret, "l'appareil est réellement abonné, le drapeau peut le dire").toBe(true);
  });

  test("⑧ push refusé deux fois — le drapeau reste FAUX, et la reprise ne boucle pas", async ({ page }) => {
    await banc(page, { uidLocal: UID_COMPTE, uidSession: UID_COMPTE });
    await poserFauxPush(page);
    const r = await page.evaluate(async () => {
      const refus = { error: { code: "42501", message: "row-level security" } };
      window.__reponses.push_subscriptions = [refus, refus, refus, refus];
      await ensureCallPushSubscription();
      const apres1 = window.__ops.filter((o) => o.table === "push_subscriptions").length;
      await ensureCallPushSubscription();          // second appel : plus de reprise
      return { push: window.__push, pret: !!window._callPushReady, apres1,
               total: window.__ops.filter((o) => o.table === "push_subscriptions").length };
    });
    expect(r.apres1, "premier appel : la tentative et sa reprise").toBe(2);
    expect(r.push.subscribe, "une seule reprise, jamais deux").toBe(1);
    expect(r.total, "le second appel retente, mais sans reprendre l'endpoint").toBe(3);
    expect(r.pret, "et surtout : le drapeau ne ment pas").toBe(false);
  });
});
