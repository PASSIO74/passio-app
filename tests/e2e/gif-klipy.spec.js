// ═══════════════════════════════════════════════════════════════════════════
// GIF : KLIPY À LA PLACE DE GIPHY (2026-11-09)
//
// Tenor a fermé son API le 2026-06-30 ; la clé Giphy « beta » plafonnait à 100
// appels par heure pour TOUTE l'app, et sa clé de production est devenue payante.
// KLIPY reprend l'API de Tenor à l'identique sur api.klipy.com (clé de production
// gratuite, sur demande). Le vrai `passioFetchGifs`, le réseau tenu par
// `page.route` : aucun appel ne part vers KLIPY.
//
// ① une recherche part vers api.klipy.com/v2/search avec la clé, la langue et le filtre ;
// ② sans requête : les tendances, /v2/featured ;
// ③ les résultats gardent l'ordre rendu, sans rien y mêler (exigence de KLIPY) ;
// ④ API en échec ou vide : la liste locale, et l'échec n'est pas gardé en cache ;
// ⑤ le champ de recherche dit « Rechercher sur KLIPY » (exigence de KLIPY), partout ;
// ⑥ une URL de média KLIPY s'affiche en image dans un commentaire ;
// ⑦ la configuration et la CSP : KLIPY appelé, Tenor parti, Giphy en réserve.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

// Une réponse de la forme réelle (mesurée le 2026-11-09 sur /v2/search) : `results`,
// `next`, et pour chaque GIF `media_formats.{gif,tinygif}.url` sur static.klipy.com.
function reponse(n, prefixe) {
  return {
    results: Array.from({ length: n }, (_, i) => ({
      id: String(1000 + i),
      media_formats: {
        gif: { url: `https://static.klipy.com/ii/${prefixe}${i}/gros.gif`, dims: [498, 498] },
        tinygif: { url: `https://static.klipy.com/ii/${prefixe}${i}/petit.gif`, dims: [220, 220] },
      },
    })),
    next: "Mg==",
  };
}

async function brancher(page, repondre) {
  const demandes = [];
  await page.route("https://api.klipy.com/**", async (route) => {
    demandes.push(route.request().url());
    await repondre(route);
  });
  return demandes;
}

test("① une recherche part vers api.klipy.com/v2/search, avec la clé, la langue et le filtre", async ({ page }) => {
  await bootOnboarded(page);
  const demandes = await brancher(page, (route) => route.fulfill({ json: reponse(3, "chat") }));
  const r = await page.evaluate(async () => ({ urls: await passioFetchGifs("chat noir", 3), cle: window.PASSIO_GIF_API.key }));
  expect(demandes.length).toBe(1);
  const u = new URL(demandes[0]);
  expect(u.origin + u.pathname).toBe("https://api.klipy.com/v2/search");
  expect(u.searchParams.get("key")).toBe(r.cle);
  expect(u.searchParams.get("q")).toBe("chat noir");
  expect(u.searchParams.get("limit")).toBe("3");
  expect(u.searchParams.get("media_filter")).toBe("tinygif,gif");
  expect(u.searchParams.get("locale")).toBe("fr_FR");
  expect(u.searchParams.get("country")).toBe("FR");
  expect(u.searchParams.get("contentfilter")).toBe("medium");
  // La petite version, telle que l'API la rend (URL gardée intacte).
  expect(r.urls).toEqual([0, 1, 2].map((i) => `https://static.klipy.com/ii/chat${i}/petit.gif`));
});

test("② sans requête : les tendances, /v2/featured, sans paramètre de recherche", async ({ page }) => {
  await bootOnboarded(page);
  const demandes = await brancher(page, (route) => route.fulfill({ json: reponse(2, "tendance") }));
  const urls = await page.evaluate(() => passioFetchGifs("", 2));
  expect(demandes.length).toBe(1);
  const u = new URL(demandes[0]);
  expect(u.origin + u.pathname).toBe("https://api.klipy.com/v2/featured");
  expect(u.searchParams.has("q")).toBe(false);
  expect(urls).toEqual(["https://static.klipy.com/ii/tendance0/petit.gif", "https://static.klipy.com/ii/tendance1/petit.gif"]);
});

test("③ les résultats gardent l'ordre rendu, sans rien y mêler ; sans `tinygif`, la grande version", async ({ page }) => {
  await bootOnboarded(page);
  const corps = reponse(4, "ordre");
  corps.results.reverse();
  delete corps.results[1].media_formats.tinygif;
  await brancher(page, (route) => route.fulfill({ json: corps }));
  const r = await page.evaluate(async () => ({ urls: await passioFetchGifs("ordre", 4), locale: PASSIO_DEFAULT_GIFS }));
  expect(r.urls).toEqual([
    "https://static.klipy.com/ii/ordre3/petit.gif",
    "https://static.klipy.com/ii/ordre2/gros.gif",
    "https://static.klipy.com/ii/ordre1/petit.gif",
    "https://static.klipy.com/ii/ordre0/petit.gif",
  ]);
  // Aucun GIF de la liste locale (Giphy) dans une grille KLIPY.
  for (const u of r.urls) expect(r.locale).not.toContain(u);
});

test("④ API en échec ou vide : la liste locale ; un échec n'est pas gardé en cache", async ({ page }) => {
  await bootOnboarded(page);
  let mode = "429";
  const demandes = await brancher(page, (route) => {
    if (mode === "429") return route.fulfill({ status: 429, json: { error: "rate limit" } });
    if (mode === "coupe") return route.abort("internetdisconnected");
    if (mode === "vide") return route.fulfill({ json: { results: [], next: "" } });
    return route.fulfill({ json: reponse(2, "retour") });
  });
  const r = await page.evaluate(async () => {
    const out = {};
    out.locale = PASSIO_DEFAULT_GIFS.slice(0, 5);
    out.refus = await passioFetchGifs("refus", 5);
    return out;
  });
  expect(r.refus).toEqual(r.locale);
  mode = "coupe";
  expect(await page.evaluate(() => passioFetchGifs("coupe", 5))).toEqual(r.locale);
  mode = "vide";
  expect(await page.evaluate(() => passioFetchGifs("vide", 5))).toEqual(r.locale);
  // La même recherche que le refus, l'API revenue : elle repart, et rend KLIPY.
  mode = "ok";
  const apres = await page.evaluate(() => passioFetchGifs("refus", 5));
  expect(apres).toEqual(["https://static.klipy.com/ii/retour0/petit.gif", "https://static.klipy.com/ii/retour1/petit.gif"]);
  expect(demandes.filter((d) => d.includes("q=refus")).length).toBe(2);
});

test("⑤ le champ de recherche dit « Rechercher sur KLIPY » — le panneau générique, celui de la messagerie, et partout dans le code", async ({ page }) => {
  await bootOnboarded(page);
  await brancher(page, (route) => route.fulfill({ json: reponse(1, "champ") }));
  const r = await page.evaluate(() => {
    const out = { fonction: passioGifPlaceholder() };
    const p = passioGifPanel({ id: "banc-gif", onPick: () => {} });
    out.panneau = p && p.querySelector("input[type=search]").placeholder;
    if (p) p.remove();
    const champ = document.getElementById("gifSearchInput");
    const panneauConv = document.getElementById("convEmojiPanel");
    if (champ && panneauConv) {
      panneauConv._gifFilled = false;
      panneauConv.classList.remove("open");
      toggleEmojiPanel();
      out.messagerie = champ.placeholder;
      toggleEmojiPanel();
    }
    // Sans clé, on ne prétend pas chercher sur KLIPY.
    const cle = window.PASSIO_GIF_API.key;
    window.PASSIO_GIF_API.key = "";
    out.sansCle = passioGifPlaceholder();
    window.PASSIO_GIF_API.key = cle;
    return out;
  });
  expect(r.fonction).toBe("Rechercher sur KLIPY");
  expect(r.panneau).toBe("Rechercher sur KLIPY");
  expect(r.messagerie).toBe("Rechercher sur KLIPY");
  expect(r.sansCle).toBe("Rechercher un GIF…");
  // Les trois autres champs (commentaires ×2, réaction GIF d'une bobine) lisent la même fonction.
  const app04 = lire("js/app-04-comments-shop.js");
  expect((app04.match(/search\.placeholder = \(typeof passioGifPlaceholder === "function"\) \? passioGifPlaceholder\(\)/g) || []).length).toBe(2);
  expect(lire("js/app-05-config-profil.js")).toMatch(/placeholder="\$\{escapeHtml\(typeof passioGifPlaceholder === "function" \? passioGifPlaceholder\(\)/);
  for (const f of ["js/app-04-comments-shop.js", "js/app-05-config-profil.js", "js/emoji-misc.js"]) {
    expect(lire(f), f).not.toMatch(/placeholder\s*=\s*"Rechercher un GIF…"|placeholder="Rechercher un GIF…"/);
  }
});

test("⑥ une URL de média KLIPY s'affiche en image dans un commentaire", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => ({
    gif: _looksLikeMediaUrl("https://static.klipy.com/ii/0db853ad/c3/0d/Nyw5JNwc.gif"),
    sansExtension: _looksLikeMediaUrl("https://static2.klipy.com/ii/0db853ad/c3/0d/Nyw5JNwc"),
    page: _looksLikeMediaUrl("https://klipy.com/gifs/chat"),
  }));
  expect(r.gif).toBe(true);
  expect(r.sansExtension).toBe(true);
  // Une page du site n'est pas un média : seul l'hôte des médias compte.
  expect(r.page).toBe(false);
});

test("⑦ configuration et CSP : KLIPY appelé, Tenor parti, Giphy en réserve", async () => {
  const src = lire("js/emoji-misc.js");
  expect(src).toMatch(/provider: "klipy",/);
  expect(src).toMatch(/key: "[A-Za-z0-9]{64}", \/\/ clé Web KLIPY/);
  expect(src).not.toMatch(/tenor\.googleapis\.com/);
  for (const f of ["netlify.toml", "_headers"]) {
    const csp = lire(f);
    expect(csp, f).toMatch(/connect-src[^;"]*https:\/\/api\.klipy\.com/);
    expect(csp, f).not.toMatch(/tenor\.googleapis\.com/);
    expect(csp, f).toMatch(/connect-src[^;"]*https:\/\/api\.giphy\.com/);
  }
});
