const { test, expect } = require("@playwright/test");

// Ces tests visent l'ARTEFACT de production. En suite dev ils sont volontairement
// ignorés ; la CI les relance explicitement avec PASSIO_CIBLE=dist.
test.describe("RELEASE-INTEGRITY — contrat de release et transition d'identité", () => {
  test.skip(process.env.PASSIO_CIBLE !== "dist", "contrat vérifiable uniquement sur dist construit");

  test("release.json, HTML et service worker désignent exactement le même build", async ({ page, request }) => {
    await page.goto("/index.html");

    const embedded = await page.evaluate(() => window.PASSIO_RELEASE || null);
    expect(embedded, "identité de release embarquée dans le HTML").toBeTruthy();
    expect(embedded.schema).toBe(1);
    expect(embedded.buildId).toMatch(/^[a-f0-9]{12}$/);
    expect(embedded.appHash).toMatch(/^[a-f0-9]{10}$/);
    expect(embedded.cssHash).toMatch(/^[a-f0-9]{10}$/);

    const res = await request.get("/release.json", { headers: { "cache-control": "no-cache" } });
    expect(res.ok(), "release.json servi avec l'artefact").toBeTruthy();
    const published = await res.json();
    expect(published).toEqual(embedded);

    const sw = await (await request.get("/sw.js", { headers: { "cache-control": "no-cache" } })).text();
    expect(sw, "le cache SW utilise le même buildId").toContain(`passio-v${embedded.buildId}`);
  });

  // Le service worker de PASSIO fait skipWaiting() + clients.claim() : il prend
  // le controle immediatement. Or une requete RE-EMISE par un service worker
  // echappe a page.route(). Ce test perdait donc une course : quand le SW
  // gagnait, /release.json revenait du reseau reel, le buildId etait identique
  // a celui embarque, et le skew n'etait jamais « detecte ». Mesure le
  // 2026-08-22 : rouge trois fois de suite en CI (Chromium 1234), vert en local
  // (Chromium 1194) — une difference de vitesse de prise de controle, pas de
  // comportement produit.
  //
  // On bloque le service worker pour CE test uniquement. L'assertion est
  // inchangee et le test verifie toujours exactement la meme chose : seule
  // l'interception devient deterministe. L'accord service worker / buildId
  // reste couvert par le premier test du fichier, qui garde son SW.
  test.describe("sans service worker", () => {
    test.use({ serviceWorkers: "block" });

    test("un onglet N détecte N+1 sans forcer le rechargement", async ({ page }) => {
      await page.route("**/release.json*", async (route) => {
        const current = await page.evaluate(() => window.PASSIO_RELEASE).catch(() => null);
        const body = {
          schema: 1,
          buildId: current && current.buildId ? current.buildId.replace(/.$/, current.buildId.endsWith("0") ? "1" : "0") : "ffffffffffff",
          appHash: "aaaaaaaaaa",
          cssHash: "bbbbbbbbbb",
          commit: "future-release",
          builtAt: null,
        };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });

      await page.goto("/index.html");
      await page.waitForFunction(() => !!window.PassioReleaseGuard && !!window.PASSIO_RELEASE);
      const beforeHref = page.url();
      const skew = await page.evaluate(() => window.PassioReleaseGuard.check());

      expect(skew.active, "version skew explicitement détecté").toBe(true);
      expect(skew.currentBuildId).not.toBe(skew.latestBuildId);
      expect(page.url(), "aucun reload/navigation forcé").toBe(beforeHref);
    });
  });

  test("le drain attend les POST telemetry_events avant de rendre la main", async ({ page }) => {
    let started = 0;
    let finished = 0;

    await page.addInitScript(() => {
      window.PASSIO_SUPABASE = {
        url: "https://telemetry.test",
        anon: "anon-test-key",
      };
    });

    await page.route("https://telemetry.test/rest/v1/telemetry_events", async (route) => {
      started++;
      await new Promise((r) => setTimeout(r, 140));
      finished++;
      await route.fulfill({ status: 201, contentType: "application/json", body: "" });
    });

    await page.goto("/index.html?telemetry=1");
    await page.waitForFunction(() => !!window.tel && !!window.PassioIdentityTransition);

    const result = await page.evaluate(async () => {
      window.tel.track("action", "release_integrity_probe", { status: "ok" });
      return window.PassioIdentityTransition.drain(2500);
    });

    expect(result.ok, `drain terminé sans timeout (${JSON.stringify(result)})`).toBe(true);
    expect(started, "au moins un lot a réellement été envoyé").toBeGreaterThan(0);
    expect(finished, "aucun POST encore actif au retour de drain").toBe(started);
    const state = await page.evaluate(() => window.PassioIdentityTransition.state());
    expect(state.inFlight).toBe(0);
  });
});
