// ══════════════════════════════════════════════════════════════════════════
// LE RÉEL D'ABORD, LES EXEMPLES ENSUITE — ET DES EXEMPLES CRÉDIBLES (2026-11-01)
// ──────────────────────────────────────────────────────────────────────────
// Demande de Benjamin : « le contenu exemple PASSIO est là juste pour remplir le
// feed en attendant qu'il y ait beaucoup d'utilisateurs, il faut toujours
// afficher les contenus des vrais utilisateurs en priorité en haut et faire
// passer en second plan les exemples. Ensuite fais un gros travail sur ces
// exemples pour améliorer leur qualité et leur réalisme, et rajoutes-en. »
//
// Autorités : `ordonnerFil` / `poserSeparateurExemples` (app-02),
// `completerFilAvecLeReel` (app-08), `curerExemples` / `PASSIONS_EXEMPLES` /
// `exemplesPassionsPrecises` (app-01). Fiche : docs/journal/passions-fil.md.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const REFERENTIEL = require(path.join(__dirname, "..", "..", "data", "passions-v1.json"));

const REEL_1 = "5d0c1f7e-0000-4000-8000-0000000000a1";
const REEL_2 = "5d0c1f7e-0000-4000-8000-0000000000a2";

// Un fil où la démo est PLUS FRAÎCHE que les publications réelles : exactement
// le cas où l'ancien ordre chronologique noyait le réel.
async function poser(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(([R1, R2]) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window._feedServerMayHaveMore = false;
    const t = Date.now();
    state.seed.posts = [
      { id: "d_neuve", authorId: "u_lea", passion: "musique", mood: "creation", type: "text",
        text: "DEMO_NEUVE", createdAt: t - 5 * 60000, likes: 12, comments: [] },
      { id: "d_hier", authorId: "u_oussa", passion: "musique", mood: "learn", type: "text",
        text: "DEMO_HIER", createdAt: t - 20 * 3600000, likes: 30, comments: [] },
    ];
    state.supabasePosts = [
      { id: R1, authorId: "a1a1a1a1-0000-4000-8000-000000000001", authorName: "Réelle Une", passion: "musique",
        mood: "creation", type: "text", text: "REEL_AVANT_HIER", createdAt: t - 50 * 3600000, likes: 1,
        comments: [], fromSupabase: true },
      { id: R2, authorId: "a1a1a1a1-0000-4000-8000-000000000002", authorName: "Réelle Deux", passion: "musique",
        mood: "learn", type: "text", text: "REEL_TROIS_JOURS", createdAt: t - 75 * 3600000, likes: 0,
        comments: [], fromSupabase: true },
    ];
    state.userPosts = [];
    window._feedExtraPosts = [];
    state.user.following = [];
    state.feedFollowingOn = true;
    state.feedIntents = [];
    _activeFeedPassions = new Set(["musique"]);
    state.selectedFeedPassions = ["musique"];
  }, [REEL_1, REEL_2]);
}

async function lireFil(page) {
  await page.evaluate(() => { window._feedDomSig = null; goTo("feed"); renderFeed(); });
  await expect(page.locator("#feedList")).toContainText("DEMO_HIER");
  return page.evaluate(() => Array.from(document.querySelectorAll("#feedList > *")).map((n) => {
    if (n.classList.contains("feed-exemples-sep")) return "SEP:" + n.getAttribute("data-genre");
    return n.getAttribute("data-postid") || null;
  }).filter(Boolean));
}

test("① les publications réelles passent devant les exemples, même plus récents", async ({ page }) => {
  await poser(page);
  const ordre = await lireFil(page);
  expect(ordre.filter((x) => !x.startsWith("SEP:"))).toEqual([REEL_1, REEL_2, "d_neuve", "d_hier"]);
});

test("② le séparateur « Exemples PASSIO » se pose juste avant le premier exemple", async ({ page }) => {
  await poser(page);
  const ordre = await lireFil(page);
  const i = ordre.indexOf("SEP:apres-reel");
  expect(i, "séparateur présent").toBeGreaterThan(-1);
  expect(ordre[i + 1], "suivi du premier exemple").toBe("d_neuve");
  expect(ordre.filter((x) => x.startsWith("SEP:")).length, "un seul séparateur").toBe(1);
  await expect(page.locator(".feed-exemples-sep")).toContainText("Exemples PASSIO");
});

test("③ sans aucune publication réelle, le séparateur ouvre le fil et propose de publier", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { state.supabasePosts = []; });
  const ordre = await lireFil(page);
  expect(ordre[0]).toBe("SEP:seul");
  await expect(page.locator(".feed-exemples-sep .feed-exemples-sep-cta")).toBeVisible();
});

test("④ un fil entièrement réel ne porte aucun séparateur", async ({ page }) => {
  await poser(page);
  await page.evaluate(() => { state.seed.posts = []; window._feedDomSig = null; goTo("feed"); renderFeed(); });
  await expect(page.locator("#feedList")).toContainText("REEL_AVANT_HIER");
  await expect(page.locator(".feed-exemples-sep")).toHaveCount(0);
});

test("⑤ la coupure rend l'ordre chronologique du 2026-10-24 et retire le séparateur", async ({ page }) => {
  await poser(page);
  await lireFil(page);
  await page.evaluate(() => { localStorage.setItem("passio_fil_reel_dabord_v1", "0"); });
  const ordre = await lireFil(page);
  expect(ordre).toEqual(["d_neuve", "d_hier", REEL_1, REEL_2]);
  await page.evaluate(() => { localStorage.removeItem("passio_fil_reel_dabord_v1"); window.PASSIO_FIL_REEL_DABORD = false; });
  expect(await lireFil(page)).toEqual(["d_neuve", "d_hier", REEL_1, REEL_2]);
});

test("⑥ des exemples à l'écran vont chercher les publications réelles plus anciennes — borné", async ({ page }) => {
  await poser(page);
  const appels = await page.evaluate(async () => {
    const t = Date.now();
    let n = 0;
    window._feedServerMayHaveMore = true;
    window.supaLoadPosts = async () => {
      n++;
      // Page 2 : une vraie publication d'il y a une semaine. Le serveur ne dit
      // jamais « fin de liste » : seule la borne doit arrêter les lectures.
      return [{ id: "5d0c1f7e-0000-4000-8000-0000000000b" + n, authorId: "a1a1a1a1-0000-4000-8000-000000000003",
        authorName: "Réelle Ancienne", passion: "musique", mood: "creation", type: "text",
        text: "REEL_PAGE_" + n, createdAt: t - (160 + n) * 3600000, likes: 0, comments: [], fromSupabase: true }];
    };
    window._feedDomSig = null; goTo("feed"); renderFeed();
    for (let k = 0; k < 40 && n < 3; k++) await new Promise((r) => setTimeout(r, 150));
    await new Promise((r) => setTimeout(r, 900));
    window._feedDomSig = null; renderFeed();
    await new Promise((r) => setTimeout(r, 900));
    return n;
  });
  expect(appels, "au plus FIL_REEL_PAGES_MAX lectures automatiques").toBe(3);
  const ordre = await lireFil(page);
  const sep = ordre.indexOf("SEP:apres-reel");
  expect(ordre.indexOf("5d0c1f7e-0000-4000-8000-0000000000b1"), "la publication de la page 2 est peinte")
    .toBeGreaterThan(-1);
  expect(ordre.indexOf("5d0c1f7e-0000-4000-8000-0000000000b1"), "et AU-DESSUS des exemples").toBeLessThan(sep);
});

test("⑦ les passions précises des exemples sont nommées, et recopiées du référentiel", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  const r = await page.evaluate(() => {
    const table = PASSIONS_EXEMPLES;
    const posts = buildSeed().posts;
    const socle = new Set(PASSIONS.map((p) => p.id));
    return {
      table: table,
      anonymes: posts.filter((p) => !socle.has(p.passion) && !table[p.passion]).map((p) => p.id + "→" + p.passion),
      generiques: Object.keys(table).filter((id) => passionById(id).label === "Passion"),
    };
  });
  expect(r.anonymes, "chaque exemple porte une passion qu'on sait nommer sans réseau").toEqual([]);
  expect(r.generiques).toEqual([]);
  const ref = {};
  REFERENTIEL.passions.forEach((l) => { ref[l[0]] = { label: l[1], emoji: l[2], color: l[3] }; });
  const ecarts = [];
  Object.keys(r.table).forEach((id) => {
    const t = r.table[id];
    if (t.creeeParUnCompte) { if (ref[id]) ecarts.push(id + " : n'est plus une passion créée par un compte"); return; }
    if (!ref[id]) { ecarts.push(id + " : absente du référentiel"); return; }
    ["label", "emoji", "color"].forEach((k) => { if (ref[id][k] !== t[k]) ecarts.push(id + "." + k + " : " + t[k] + " ≠ " + ref[id][k]); });
  });
  expect(ecarts, "PASSIONS_EXEMPLES recopie data/passions-v1.json").toEqual([]);
});

test("⑧ les passions que les vrais comptes cochent ont des exemples", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  // Mesuré en production le 2026-11-01 (`user_state.selectedFeedPassions`).
  const COCHEES = ["running", "running-trail", "collectif-football", "collectif-foot-feminin", "collectif-basketball",
    "fitness", "fitness-musculation", "fitness-senior", "sport-escalade", "outdoor-randonnee", "outdoor-via-ferrata",
    "glisse-wakeboard", "combat", "sport-handisport", "sante-sport-sante", "parentalite-sport-famille",
    "voyage-backpacking", "voyage-road-trip", "cinema-anime", "moto-sportive", "auto-sport-auto",
    "musique-reggaeton", "metallerie", "dark-romance"];
  const manquantes = await page.evaluate((ids) => {
    const n = {};
    buildSeed().posts.forEach((p) => { n[p.passion] = (n[p.passion] || 0) + 1; });
    return ids.filter((id) => !n[id]);
  }, COCHEES);
  expect(manquantes).toEqual([]);
});

test("⑨ des exemples crédibles : étalés, sans rafale, compteurs d'une communauté qui démarre", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  const r = await page.evaluate(() => {
    const now = Date.now();
    const posts = buildSeed().posts.filter((p) => !p.isReel);
    const tri = posts.slice().sort((a, b) => b.createdAt - a.createdAt);
    const ages = tri.map((p) => (now - p.createdAt) / 3600000);
    let memeAuteur = 0, memePhoto = 0, precedente = null;
    for (let i = 1; i < tri.length; i++) if (tri[i].authorId === tri[i - 1].authorId) memeAuteur++;
    tri.forEach((p) => { if (!p.cover) return; if (p.cover === precedente) memePhoto++; precedente = p.cover; });
    const photos = {};
    posts.forEach((p) => { if (p.cover) photos[p.cover] = (photos[p.cover] || 0) + 1; });
    const commentairesHorsCadre = [];
    posts.forEach((p) => (p.comments || []).forEach((c) => {
      if (!(c.createdAt >= p.createdAt && c.createdAt <= now)) commentairesHorsCadre.push(p.id + "/" + c.id);
    }));
    // Déterminisme : un second `buildSeed` donne les mêmes âges (à la milliseconde
    // d'horloge près), donc le même fil à chaque ouverture.
    const now2 = Date.now();
    const bis = {};
    buildSeed().posts.forEach((p) => { bis[p.id] = now2 - p.createdAt; });
    const instables = posts.filter((p) => Math.abs((now - p.createdAt) - bis[p.id]) > 5000).length;
    return {
      n: posts.length, maxLikes: Math.max(...posts.map((p) => p.likes || 0)),
      plusVieuxJours: ages[ages.length - 1] / 24, dernieres24h: ages.filter((a) => a < 24).length,
      memeAuteur, memePhoto, avecPhoto: posts.filter((p) => p.cover).length,
      photoLaPlusVue: Math.max(...Object.values(photos)), commentairesHorsCadre, instables,
    };
  });
  expect(r.n, "le socle a été enrichi").toBeGreaterThanOrEqual(460);
  expect(r.maxLikes, "aucun exemple à plusieurs centaines de « j'aime »").toBeLessThanOrEqual(100);
  expect(r.plusVieuxJours, "étalés sur environ trois semaines").toBeGreaterThan(14);
  expect(r.dernieres24h, "pas un quart du socle dans les dernières 24 h").toBeLessThan(r.n * 0.12);
  expect(r.memeAuteur, "jamais deux exemples du même auteur à la suite").toBe(0);
  expect(r.memePhoto, "jamais la même photo deux cartes de suite").toBe(0);
  expect(r.avecPhoto, "une communauté publie aussi du texte").toBeLessThan(r.n * 0.65);
  expect(r.photoLaPlusVue, "plus de photo répétée trente fois").toBeLessThan(25);
  expect(r.commentairesHorsCadre, "un commentaire suit sa publication et ne vient pas du futur").toEqual([]);
  expect(r.instables, "le même fil à chaque ouverture").toBe(0);
});

// ⑩ Défaut trouvé par `capacite-fil-cache` en CI sur la première version du lot :
// la lecture automatique partage `_feedPageLoading` avec « Charger plus », et un
// geste qui tombait pendant elle ressortait SANS RIEN FAIRE. Il attend désormais
// qu'elle finisse, puis lit sa propre page — jamais deux lectures en même temps.
test("⑩ un « Charger plus » pendant une lecture automatique n'est pas perdu", async ({ page }) => {
  await poser(page);
  const r = await page.evaluate(async () => {
    const t = Date.now();
    let n = 0, enVol = 0, maxEnVol = 0, liberer = null;
    const lot = (k) => [{ id: "5d0c1f7e-0000-4000-8000-0000000000c" + k, authorId: "a1a1a1a1-0000-4000-8000-000000000004",
      authorName: "Réelle Retenue", passion: "musique", mood: "creation", type: "text", text: "REEL_LOT_" + k,
      createdAt: t - (200 + k) * 3600000, likes: 0, comments: [], fromSupabase: true }];
    window._feedServerMayHaveMore = true;
    window.supaLoadPosts = () => {
      const k = ++n;
      enVol++; maxEnVol = Math.max(maxEnVol, enVol);
      const fin = (v) => { enVol--; return v; };
      if (k === 1) return new Promise((res) => { liberer = () => res(fin(lot(1))); });
      return Promise.resolve(fin(lot(k)));
    };
    window._feedDomSig = null; goTo("feed"); renderFeed();   // lecture automatique, retenue
    const avant = n;
    const geste = loadMoreFeedPosts();                         // le geste tombe pendant elle
    await new Promise((res) => setTimeout(res, 80));
    const pendant = n;
    liberer();
    await geste;
    return { avant, pendant, apres: n, maxEnVol };
  });
  expect(r.avant, "la lecture automatique est partie").toBe(1);
  expect(r.pendant, "le geste attend, il ne double pas la lecture").toBe(1);
  expect(r.apres, "puis il lit sa propre page").toBeGreaterThanOrEqual(2);
  expect(r.maxEnVol, "jamais deux lectures en même temps").toBe(1);
});
