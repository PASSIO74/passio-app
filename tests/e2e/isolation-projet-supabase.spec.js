// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UNE SUITE LOCALE NE PARLE PLUS AU PROJET SUPABASE DE PRODUCTION
//
// CE QUE ÇA COÛTAIT. Mesuré le 2026-11-09 dans les journaux de la passerelle
// Supabase (`edge_logs`, 24 h) : 37 159 des 54 563 requêtes reçues par la
// production — 68 % — venaient des runners GitHub. L'annuaire des lives, les
// compteurs d'abonnés, les profils, la messagerie, l'état de compte : tout ce
// que `sansDonneesDistantes` ne couvrait pas partait en production, et lui
// coûtait la sortie, la CPU et les connexions de ses vrais utilisateurs — pour
// des listes VIDES (une suite locale n'a ni vraie session, ni vrais identifiants).
//
// LE REMÈDE (`projetSupabaseVide`, app-helper.js) répond À LA PLACE du projet ce
// qu'un projet VIDE répond à un visiteur SANS session. Ce fichier prouve :
//   · le CÂBLAGE (bootOnboarded le pose, pour les ~2 400 cas qui l'appellent) ;
//   · la FIDÉLITÉ des réponses au contrat de PostgREST / GoTrue / Storage, par
//     le VRAI SDK 2.116 — un faux serveur interrogé par un `fetch` maison ne
//     prouverait que lui-même (la leçon du référentiel des passions, ③ bis) ;
//   · la PRIORITÉ : une route de page posée par une suite garde la main ;
//   · le RÉSULTAT : un démarrage complet, cinq écrans parcourus, ZÉRO requête
//     vers `*.supabase.co` arrivée au réseau.
//
// ⚠️ « ARRIVÉE AU RÉSEAU » SE MESURE PAR `serverAddr()`, et c'est le seul
// discriminant qui tient dans les DEUX environnements. En CI (avec réseau), une
// requête non interceptée aboutit — 200, des lignes réelles ou vides — et rien
// dans le corps ne la distingue d'une réponse locale ; seule l'adresse du serveur
// le fait (nulle pour `route.fulfill`). Sans réseau, elle échoue en
// `ERR_NAME_NOT_RESOLVED` / `ERR_TUNNEL_CONNECTION_FAILED` : un échec qui n'est
// pas `ERR_FAILED` (abandon par une route) est donc, lui aussi, une requête partie.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, projetSupabaseVide, miroirPassions } = require("./app-helper");
const { GATE_KEY, GATE_TOKEN } = require("./gate-helper");

const SUPABASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co\//;

/** Journalise toute requête vers un projet Supabase qui a ATTEINT le réseau. */
function espionnerReseau(page) {
  const partis = [];
  const servis = [];
  let enCours = 0;
  page.on("requestfinished", async (req) => {
    if (!SUPABASE.test(req.url())) return;
    // ⚠️ L'ÉCOUTE EST ASYNCHRONE (`response()`, `serverAddr()`) : une requête
    // finie juste avant une assertion peut n'être pas encore rangée. D'où
    // `calme()`, qu'on attend avant de juger — sans lui, une requête PARTIE à la
    // dernière seconde passerait inaperçue, et le cas serait vert à tort.
    enCours++;
    let adresse = null;
    try {
      const rep = await req.response();
      adresse = rep ? await rep.serverAddr() : null;
    } catch (e) {}
    const ligne = req.method() + " " + new URL(req.url()).pathname;
    (adresse ? partis : servis).push(ligne);
    enCours--;
  });
  page.on("requestfailed", (req) => {
    if (!SUPABASE.test(req.url())) return;
    const echec = (req.failure() || {}).errorText || "";
    // `ERR_FAILED` / `ERR_ABORTED` : abandonnée par une route ou par la page.
    // Tout autre libellé dit qu'elle est allée jusqu'au DNS ou au proxy.
    if (/ERR_FAILED|ERR_ABORTED/.test(echec)) return;
    partis.push(req.method() + " " + new URL(req.url()).pathname + " (" + echec + ")");
  });
  // Un court délai d'abord : l'événement `requestfinished` d'une réponse déjà
  // lue par la page peut n'être pas encore parvenu au processus du test.
  const calme = async () => {
    await page.waitForTimeout(300);
    await expect.poll(() => enCours, { timeout: 5000 }).toBe(0);
  };
  return { partis, servis, calme };
}

/** Une requête par le VRAI client de l'application, réduite à ce qu'on compare. */
function parLeClient(page, fn, arg) {
  return page.evaluate(
    async ([source, a]) => {
      // eslint-disable-next-line no-new-func
      const f = new Function("supa", "a", "return (" + source + ")(supa, a);");
      try {
        const r = await f(window.supa, a);
        return {
          status: r.status,
          data: r.data === undefined ? "undefined" : r.data,
          count: r.count === undefined ? "undefined" : r.count,
          code: r.error ? r.error.code || r.error.error_code || r.error.name || "" : null,
          message: r.error ? String(r.error.message || r.error.msg || "") : null,
        };
      } catch (e) {
        return { exception: String((e && e.message) || e) };
      }
    },
    [fn.toString(), arg === undefined ? null : arg],
  );
}

test.describe("Isolation — le projet Supabase vide des suites locales", () => {
  test("① câblage : bootOnboarded pose le projet vide — l'annuaire des lives est servi vide, localement", async ({
    page,
  }) => {
    // ⚠️ `video_lives` : la PREMIÈRE source du trafic de la CI (7 873 requêtes en
    // 24 h, mesuré le 2026-11-09), et une table hors des quatre que la route de
    // page isole. Si `bootOnboarded` cessait d'appeler le filet, elle repartirait.
    const espion = espionnerReseau(page);
    await bootOnboarded(page);
    const r = await parLeClient(page, (supa) =>
      supa.from("video_lives").select("*").eq("status", "live").order("started_at", { ascending: false }).limit(20),
    );
    expect(r.exception).toBeUndefined();
    expect(r.code).toBeNull();
    expect(r.status).toBe(200);
    expect(r.data).toEqual([]);
    await expect.poll(() => espion.servis.join("|"), { timeout: 5000 }).toContain("/rest/v1/video_lives");
    await espion.calme();
    expect(espion.partis, "une requête vers le projet a atteint le réseau").toEqual([]);
  });

  test("② un comptage (HEAD) rend 0, et le SDK le LIT — `content-range` est exposé", async ({ page }) => {
    // ⚠️ Sans `access-control-expose-headers`, le SDK lit `count: null` en
    // silence : un compteur d'abonnés afficherait « 0 » par accident, et ce cas
    // passerait au vert pour une mauvaise raison. On exige le NOMBRE 0.
    await bootOnboarded(page);
    const r = await parLeClient(page, (supa) =>
      supa.from("follows").select("*", { count: "exact", head: true }).eq("following_id", "u_banc"),
    );
    expect(r.code).toBeNull();
    expect(r.count).toBe(0);
  });

  test("③ `.single()` rend 406 PGRST116 sur zéro ligne ; `.maybeSingle()` rend null", async ({ page }) => {
    await bootOnboarded(page);
    const un = await parLeClient(page, (supa) => supa.from("profiles").select("id").eq("id", "u_banc").single());
    expect(un.status).toBe(406);
    expect(un.code).toBe("PGRST116");
    const peutEtre = await parLeClient(page, (supa) =>
      supa.from("profiles").select("id").eq("id", "u_banc").maybeSingle(),
    );
    expect(peutEtre.code).toBeNull();
    expect(peutEtre.data).toBeNull();
  });

  test("④ les privilèges de LECTURE d'`anon` sont ceux de la production", async ({ page }) => {
    await bootOnboarded(page);
    // `event_attendees` : aucun privilège de lecture pour un visiteur → 42501 en 401
    // (215 refus de ce genre par jour en CI, mesurés avant ce lot).
    const inscrits = await parLeClient(page, (supa) =>
      supa.from("event_attendees").select("event_id,rsvp").eq("user_id", "u_banc"),
    );
    expect(inscrits.status).toBe(401);
    expect(inscrits.code).toBe("42501");
    // `reglages_distants` : lisible COLONNE PAR COLONNE — `select=*` est refusé en
    // entier (PostgREST lève 42501 dès qu'UNE colonne manque au rôle)…
    // ⚠️ PAS `events`, qui suit la même règle en production : ses LECTURES sont
    // servies `[]` par la route de PAGE de `sansDonneesDistantes` (les quatre
    // tables du 2026-09-02), qui passe avant le projet vide du contexte.
    const tout = await parLeClient(page, (supa) => supa.from("reglages_distants").select("*").limit(1));
    expect(tout.status).toBe(401);
    expect(tout.code).toBe("42501");
    // …une liste de colonnes passe, et la table est vide.
    const colonnes = await parLeClient(page, (supa) => supa.from("reglages_distants").select("cle,valeur").limit(1));
    expect(colonnes.code).toBeNull();
    expect(colonnes.data).toEqual([]);
  });

  test("⑤ les ÉCRITURES sont jugées comme en production, et aucune ne part", async ({ page }) => {
    const espion = espionnerReseau(page);
    await bootOnboarded(page);
    // Insertion sous RLS sans compte → refus 401 42501 (1 112 refus de ce genre
    // par jour envoyés à la production par la CI, avant ce lot).
    const etat = await parLeClient(page, (supa) => supa.from("user_state").insert({ user_id: "u_banc", data: {} }));
    expect(etat.status).toBe(401);
    expect(etat.code).toBe("42501");
    expect(etat.message).toMatch(/row-level security/);
    // `telemetry_events` sans compte : la production l'ACCEPTE d'un visiteur.
    const tel = await parLeClient(page, (supa) =>
      supa.from("telemetry_events").insert({ event_type: "banc", user_id: null }),
    );
    expect(tel.code).toBeNull();
    expect(tel.status).toBe(201);
    // Mise à jour sous RLS : réussie, ZÉRO ligne touchée.
    const profil = await parLeClient(page, (supa) =>
      supa.from("profiles").update({ bio: "x" }).eq("id", "u_banc").select("id"),
    );
    expect(profil.code).toBeNull();
    expect(profil.data).toEqual([]);
    // `notifications` : aucun privilège d'écriture pour un visiteur.
    const notif = await parLeClient(page, (supa) => supa.from("notifications").update({ seen: true }).eq("id", "n_banc"));
    expect(notif.status).toBe(401);
    // Une écriture sur une des QUATRE tables de la route de page traverse cette
    // route (`fallback`) jusqu'au projet vide — elle ne part plus au réseau.
    // ⚠️ `.select()` EST NÉCESSAIRE : il ajoute `?select=…` à l'URL, sans quoi le
    // motif de la route de page (qui exige le `?`) ne la verrait même pas, et ce
    // cas mesurerait le projet vide seul au lieu du relais `fallback`.
    const post = await parLeClient(page, (supa) =>
      supa.from("posts").insert({ id: "p_banc", author_id: "u_banc" }).select("id"),
    );
    expect(post.status).toBe(401);
    expect(post.code).toBe("42501");
    await espion.calme();
    expect(espion.partis, "une écriture a atteint le réseau").toEqual([]);
  });

  test("⑥ RPC : les deux qu'un visiteur peut exécuter rendent des lignes vides, les autres 401", async ({ page }) => {
    await bootOnboarded(page);
    const recherche = await parLeClient(page, (supa) => supa.rpc("rechercher_passions", { q: "guitare", lim: 5 }));
    expect(recherche.code).toBeNull();
    expect(recherche.data).toEqual([]);
    const majeur = await parLeClient(page, (supa) => supa.rpc("adult_access_status"));
    expect(majeur.status).toBe(401);
    expect(majeur.code).toBe("42501");
  });

  test("⑦ un jeton d'utilisateur FICTIF est rejeté comme en production : 401 PGRST301, 403 bad_jwt", async ({
    page,
  }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const cfg = window.PASSIO_SUPABASE;
      const faux = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1X2JhbmMiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature";
      const h = { apikey: cfg.anon, Authorization: "Bearer " + faux };
      const rest = await fetch(cfg.url + "/rest/v1/user_state?select=data&user_id=eq.u_banc", { headers: h });
      const user = await fetch(cfg.url + "/auth/v1/user", { headers: h });
      return { rest: rest.status, restCorps: await rest.json(), user: user.status, userCorps: await user.json() };
    });
    expect(r.rest).toBe(401);
    expect(r.restCorps.code).toBe("PGRST301");
    expect(r.user).toBe(403);
    expect(r.userCorps.error_code).toBe("bad_jwt");
  });

  test("⑧ ni compte, ni courriel : inscription et lien magique sont refusés sans rien envoyer", async ({ page }) => {
    // ⚠️ En production, une inscription non routée CRÉE un compte (un MAU de
    // plus) et un lien magique ENVOIE un courriel. Depuis une suite locale :
    // jamais, quoi que fasse le code.
    const espion = espionnerReseau(page);
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const a = await window.supa.auth.signUp({ email: "banc@passio-e2e.test", password: "MotDePasseBanc!123" });
      const b = await window.supa.auth.signInWithOtp({ email: "banc@passio-e2e.test" });
      const c = await window.supa.auth.signInWithPassword({ email: "banc@passio-e2e.test", password: "x".repeat(12) });
      return {
        inscription: !!a.error, lien: !!b.error,
        connexion: c.error ? c.error.code || c.error.message : null,
        session: !!(a.data && a.data.session) || !!(c.data && c.data.session),
      };
    });
    expect(r.inscription).toBe(true);
    expect(r.lien).toBe(true);
    expect(r.connexion).toBeTruthy();
    expect(r.session).toBe(false);
    await espion.calme();
    expect(espion.partis).toEqual([]);
  });

  test("⑨ priorité : une route de PAGE posée par la suite garde la main, avant comme après bootOnboarded", async ({
    page,
  }) => {
    // ⚠️ LE POURQUOI DU NIVEAU CONTEXTE. Une route de page posée AVANT
    // `bootOnboarded` aurait été écrasée par un filet de page (Playwright donne
    // la main à la dernière enregistrée) — le piège de `sansMiroirPassions`.
    await page.route(/\/rest\/v1\/profiles\?/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "u_avant" }]) }),
    );
    await bootOnboarded(page);
    const avant = await parLeClient(page, (supa) => supa.from("profiles").select("id").eq("id", "u_avant"));
    expect(avant.data).toEqual([{ id: "u_avant" }]);

    await page.route(/\/rest\/v1\/blocks\?/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ blocked_id: "u_apres" }]) }),
    );
    const apres = await parLeClient(page, (supa) => supa.from("blocks").select("blocked_id").eq("blocker_id", "u_moi"));
    expect(apres.data).toEqual([{ blocked_id: "u_apres" }]);
  });

  test("⑩ le RÉSULTAT : un démarrage et cinq écrans parcourus, zéro requête au projet de production", async ({
    page,
  }) => {
    // ⚠️ LE CAS QUI MESURE CE QUE LA PRODUCTION RECEVAIT. Les cas ① à ⑨ jugent
    // des requêtes choisies ; celui-ci laisse l'application faire les siennes —
    // annuaire des lives, compteurs, profils, conversations, état de compte,
    // référentiel — et exige qu'AUCUNE n'ait quitté le navigateur.
    test.setTimeout(60000);
    const espion = espionnerReseau(page);
    await bootOnboarded(page);
    for (const ecran of ["feed", "profiles", "explore", "irl", "messages", "feed"]) {
      await page.evaluate((e) => window.goTo(e), ecran);
      await page.waitForTimeout(800);
    }
    await espion.calme();
    expect(espion.partis, "requêtes arrivées à la production :\n" + espion.partis.join("\n")).toEqual([]);
    // Et le cas n'est pas vert parce que l'application n'a rien demandé.
    expect(espion.servis.length).toBeGreaterThan(3);
  });

  test("⑪ `projetSupabaseVide` seul couvre une page qui navigue elle-même, sans bootOnboarded", async ({ page }) => {
    // Pour les suites qui démarrent l'application par leur propre `goto` (la
    // vitrine, le rideau, la télémétrie) : le filet se pose AVANT la navigation.
    const espion = espionnerReseau(page);
    await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    expect(await projetSupabaseVide(page)).toBe(true);
    // Idempotent par contexte : un second appel ne double pas la route.
    expect(await projetSupabaseVide(page)).toBe(true);
    await page.goto("/index.html");
    await page.waitForFunction(() => !!window.supa && !!window._supaReal, null, { timeout: 20000 });
    const r = await parLeClient(page, (supa) => supa.from("video_lives").select("*").limit(1));
    expect(r.data).toEqual([]);
    // ⚠️ Le référentiel des passions reste COMPLET : le projet vide sert le miroir,
    // pas une table vide — une suite qui ne pose que lui lisait le vrai
    // référentiel avant ce lot, et le plancher des 19 passions en changerait le sujet.
    await page.waitForFunction(
      () => typeof window._referentielEtat === "function" && window._referentielEtat().complet,
      null,
      { timeout: 15000 },
    );
    expect(await page.evaluate(() => window._referentielEtat().taille)).toBe(miroirPassions().length);
    await espion.calme();
    expect(espion.partis).toEqual([]);
  });
});
