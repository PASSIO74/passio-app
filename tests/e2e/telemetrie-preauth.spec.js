// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE PRÉ-AUTH — que devient un événement émis AVANT toute connexion ?
//
// Question posée par l'analyse croisée du 2026-08-15 (incident TEL-IDENT-002).
// La policy réelle est :
//     INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid()::text)
// Or l'app se forge une identité locale « u_xxxx » avant toute authentification
// (getMyUserId dans app-08, puis emoji-misc 100 ms après le chargement). Un tel
// id n'est NI NULL NI auth.uid() : tout événement le portant devrait être rejeté.
//
// En base : 0 ligne « u_% ». Deux lectures possibles, indiscernables depuis la
// base seule — soit ces événements ne partent jamais, soit ils partent tous et
// sont tous rejetés. La différence compte : l'entonnoir « Visiteurs → compte »
// du centre de pilotage repose sur ces événements, et il est présenté comme réel.
//
// Ce test tranche par OBSERVATION RÉSEAU sur un navigateur vierge. Il n'assère
// pas un invariant : il MESURE et journalise. Il échoue seulement si l'app
// envoie effectivement un user_id fabriqué (le cas qu'on veut interdire).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY, poserGateSansPremiereVisite } = require("./gate-helper");

test.describe("Télémétrie — fenêtre pré-authentification", () => {
  test("aucun événement ne part sous une identité fabriquée", async ({ browser }) => {
    test.setTimeout(90000);
    const log = (m) => console.log(`[tel-preauth] ${m}`);

    // Contexte NEUF : ni passio_uid, ni session Supabase, ni backlog.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // On intercepte les POST vers telemetry_events pour lire le payload RÉEL
    // (et non ce que le code a l'intention d'envoyer).
    const envois = [];
    page.on("request", (req) => {
      if (req.method() !== "POST" || !req.url().includes("/rest/v1/telemetry_events")) return;
      let rows = [];
      try { rows = JSON.parse(req.postData() || "[]"); } catch (e) { rows = []; }
      const auth = req.headers()["authorization"] || "";
      envois.push({
        n: rows.length,
        userIds: [...new Set(rows.map((r) => r.user_id))],
        types: [...new Set(rows.map((r) => r.type))],
        jwt: auth ? (auth.length > 120 ? "session" : "anon") : "aucun",
      });
    });
    const reponses = [];
    page.on("response", (res) => {
      if (res.request().method() === "POST" && res.url().includes("/rest/v1/telemetry_events")) {
        reponses.push(res.status());
      }
    });

    await poserGateSansPremiereVisite(page);
    // `?telemetry=1` force la capture complète : sans ça, l'échantillonnage
    // pourrait masquer le phénomène et rendre le test non concluant.
    await page.goto("/index.html?telemetry=1");
    await page.waitForSelector("#landing.active", { timeout: 30000 });
    log("landing affichée, aucune session");

    // Laisser passer la fenêtre où emoji-misc fabrique window.MY_UID (100 ms)
    // ET le premier flush de la file de télémétrie.
    await page.waitForTimeout(8000);

    // État des DEUX identités : `let MY_UID` est un binding de script, PAS une
    // propriété de window. telemetry.js lit window.MY_UID — les deux peuvent
    // diverger, et c'est précisément l'hypothèse à tester.
    const ids = await page.evaluate(() => ({
      lexical: (typeof MY_UID !== "undefined") ? MY_UID : "(non défini)",
      surWindow: window.MY_UID === undefined ? "(undefined)" : String(window.MY_UID),
      stocke: localStorage.getItem("passio_uid"),
      session: !!localStorage.getItem("sb-njkiyoklssvefstljemx-auth-token"),
    }));
    log(`MY_UID lexical    : ${ids.lexical}`);
    log(`window.MY_UID     : ${ids.surWindow}`);
    log(`passio_uid stocké : ${ids.stocke}`);
    log(`session Supabase  : ${ids.session ? "oui" : "non"}`);
    log(`envois observés   : ${envois.length} — statuts : ${reponses.join(", ") || "aucun"}`);
    for (const e of envois) {
      log(`  lot de ${e.n} · user_id=${JSON.stringify(e.userIds)} · types=${e.types.join("/")} · jwt=${e.jwt}`);
    }

    // ── Le constat qui compte ──────────────────────────────────────────────
    // Un identifiant fabriqué localement ne satisfera JAMAIS la policy. S'il
    // part sur le réseau, chaque lot le portant est perdu — et avec lui la
    // mesure des visiteurs anonymes.
    const fabriques = envois.flatMap((e) => e.userIds).filter((u) => typeof u === "string" && /^u_/.test(u));
    expect(fabriques, `identités fabriquées envoyées : ${JSON.stringify(fabriques)}`).toEqual([]);

    // Et aucun lot ne doit être refusé pendant cette fenêtre.
    const refuses = reponses.filter((s) => s === 401 || s === 403);
    expect(refuses.length, `lots refusés en pré-auth (HTTP ${refuses.join(",")})`).toBe(0);

    await ctx.close();
  });

  test("sans forçage, localhost n'écrit RIEN dans la table de production", async ({ browser }) => {
    // Il n'existe qu'une seule base Supabase : ce qui part de localhost atterrit
    // en PRODUCTION. Les ~15 specs e2e chargent l'app à chaque exécution ; quand
    // la télémétrie y était active par défaut, elles remplissaient la table.
    // Mesuré le 2026-08-16 avant correctif : 40 625 événements `development`
    // contre 10 532 `production` — 79 % de bruit de test.
    //
    // Ce garde-fou est l'inverse du précédent : il vérifie qu'AUCUN envoi ne
    // part quand on n'a rien demandé. Sans lui, la pollution reviendrait au
    // premier qui rétablirait le défaut « actif en local ».
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const envois = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/rest/v1/telemetry_events")) {
        envois.push(req.url());
      }
    });

    await poserGateSansPremiereVisite(page);
    await page.goto("/index.html");            // ← pas de ?telemetry=1
    await page.waitForSelector("#landing.active", { timeout: 30000 });
    await page.waitForTimeout(8000);           // laisser passer les flushs éventuels

    expect(envois.length, `envois de télémétrie non sollicités depuis localhost : ${envois.length}`).toBe(0);
    await ctx.close();
  });
});
