const { test, expect } = require("@playwright/test");
const { GATE_KEY, GATE_TOKEN } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

test.use({ serviceWorkers: "block" });

function publication(index, passion = "musique", extra = {}) {
  return {
    id: "ee12ba2a-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
    author_id: "22222222-0000-4000-8000-000000000001",
    passion_id: passion, mood: "creation", content: passion + " " + index,
    created_at: new Date(Date.UTC(2026, 0, 10) - index * 60000).toISOString(),
    profiles: { username: "Camille", is_private: false },
    ...extra,
  };
}

function suspendre() {
  let liberer;
  const attente = new Promise(resolve => { liberer = resolve; });
  return { attente, liberer };
}

// Vraies requêtes du SDK vers un projet simulé. La tête générale et la
// recherche peuvent répondre dans les deux ordres.
async function ouvrir(page, lignes, options = {}) {
  await sansDonneesDistantes(page);
  await page.addInitScript(([cle, jeton]) => {
    sessionStorage.setItem(cle, jeton);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
  }, [GATE_KEY, GATE_TOKEN]);
  const lectures = [];
  await page.route(/\/rest\/v1\/posts\?/, async route => {
    const q = new URL(route.request().url()).searchParams;
    if (!(q.get("select") || "").includes("profiles!author_id")) return route.fallback();
    const filtre = q.get("passion_id");
    const ids = filtre ? filtre.slice(4, -1).split(",").map(id => id.replaceAll('"', "")) : [];
    const curseur = (q.get("or") || "").split('"')[1];
    const reponse = lignes.filter(p => (!filtre || ids.includes(p.passion_id))
        && (!curseur || p.created_at < curseur));
    lectures.push({ ids, curseur: !!curseur });
    if (filtre && options.cible) await options.cible.attente;
    if (!filtre && options.tete) await options.tete.attente;
    if (!filtre && options.panneTete) return route.fulfill({ status: 503, body: "Indisponible" });
    if (filtre && options.panne) return route.fulfill({ status: 400, json: { message: "Lecture indisponible" } });
    return route.fulfill({ json: reponse.slice(0, Number(q.get("limit")) || 20) });
  });
  await page.goto("/index.html");
  await page.locator("#frWelcome .fr-welcome-cta").click();
  await page.locator('#frGrid [data-fr-passion="photo"]').click();
  if (!options.exemples) await page.evaluate(() => {
    state.seed.posts = state.seed.posts.filter(post => post.passion !== "photo");
  });
  return lectures;
}

const premiereCarte = page => page.locator("#feedList > article.post").first();
const teteMusique = () => Array.from({ length: 20 }, (_, i) => publication(i));

test("Voir mon fil retrouve Photo en page 2 avant les exemples et conserve la pagination générale", async ({ page }) => {
  const photo = publication(20, "photo"), tete = suspendre();
  const lectures = await ouvrir(page, [...teteMusique(), photo], { tete, exemples: true });
  try {
    await page.locator("#frValider").click();
    await expect(premiereCarte(page)).toHaveAttribute("data-postid", photo.id);
    expect(lectures.filter(l => l.ids.includes("photo"))).toHaveLength(1);
  } finally { tete.liberer(); }
  await expect.poll(() => page.evaluate(() => (state.supabasePosts || []).some(p => p.passion === "musique"))).toBe(true);
  await expect(premiereCarte(page)).toHaveAttribute("data-postid", photo.id);
  await expect(page.locator("#feedList > .feed-exemples-sep")).toContainText("Exemples PASSIO");
  expect(await page.evaluate(() => [_feedPagination.offset, !!window._feedServerMayHaveMore])).toEqual([20, true]);
});

test("le repli attend la réponse qui confirme que Photo est vide", async ({ page }) => {
  const cible = suspendre();
  await ouvrir(page, teteMusique(), { cible });
  try {
    await page.locator("#frValider").click();
    await expect(page.locator("#feedRecherchePassions")).toContainText("Recherche");
    await expect(page.locator(".feed-repli-tete")).toHaveCount(0);
  } finally { cible.liberer(); }
  await expect(page.locator(".feed-repli-tete")).toContainText("Pas encore de publication pour « Photo »");
  await expect(page.locator("#feedRecherchePassions")).toHaveCount(0);
});

test("avec une vraie Photo en mémoire le fil conserve sa complétion générale avant les exemples", async ({ page }) => {
  const ancienne = publication(20, "photo"), recente = publication(0, "photo"), tete = suspendre();
  const lectures = await ouvrir(page, [recente, ...teteMusique().slice(1), ancienne], { tete, exemples: true });
  try {
    await page.evaluate(row => feedAddRealtimePost({
      id: row.id, authorId: row.author_id, authorName: "Camille", text: row.content,
      passion: row.passion_id, createdAt: Date.parse(row.created_at), type: "text", mood: row.mood, fromSupabase: true,
    }), recente);
    await page.locator("#frValider").click();
    await expect(premiereCarte(page)).toHaveAttribute("data-postid", recente.id);
  } finally { tete.liberer(); }
  await expect(page.locator('#feedList > [data-postid="' + ancienne.id + '"]')).toBeVisible();
  expect(lectures.some(l => !l.ids.length && l.curseur)).toBe(true);
  expect(lectures.filter(l => l.ids.length)).toHaveLength(0);
});

test("Photo réellement vide conserve ses exemples étiquetés et ouvre Explorer au geste", async ({ page }) => {
  await ouvrir(page, teteMusique(), { exemples: true });
  await page.locator("#frValider").click();
  const note = page.locator("#feedRecherchePassions");
  await expect(note).toContainText("Pas encore de publication pour « Photo »");
  await expect(page.locator("#feedList > .feed-exemples-sep")).toContainText("Exemples PASSIO");
  await expect(premiereCarte(page).locator(".fr-demo-tag")).toHaveText("Exemple PASSIO");
  await note.getByRole("button", { name: "Explorer d’autres passions" }).click();
  await expect(page.locator("#screen-explore")).toBeVisible();
});

test("plusieurs passions choisies demandent leurs publications dans la même lecture", async ({ page }) => {
  const cuisine = publication(20, "cuisine");
  const lectures = await ouvrir(page, [...teteMusique(), cuisine]);
  await page.locator('#frGrid [data-fr-passion="cuisine"]').click();
  await page.locator("#frValider").click();
  await expect(premiereCarte(page)).toHaveAttribute("data-postid", cuisine.id);
  expect(lectures.filter(l => l.ids.length).map(l => l.ids.sort())).toEqual([["cuisine", "photo"]]);
});

test("une erreur permet de réessayer sans annoncer un fil vide", async ({ page }) => {
  const photo = publication(20, "photo"), options = { panne: true };
  await ouvrir(page, [...teteMusique(), photo], options);
  await page.locator("#frValider").click();
  const relancer = page.locator("#feedRecherchePassions").getByRole("button", { name: "Réessayer" });
  await expect(relancer).toBeVisible();
  await expect(page.locator(".feed-repli-tete")).toHaveCount(0);
  options.panne = false;
  await relancer.click();
  await expect(premiereCarte(page)).toHaveAttribute("data-postid", photo.id);
});

test("tête et recherche en panne avec exemples : une seule reprise, ciblée sur Photo", async ({ page }) => {
  const photo = publication(20, "photo"), options = { panne: true, panneTete: true, exemples: true };
  const lectures = await ouvrir(page, [...teteMusique(), photo], options);
  await page.locator("#frValider").click();
  await page.waitForFunction(() => filCommunauteInjoignable());
  const relancer = page.locator("#screen-feed").getByRole("button", { name: "Réessayer", exact: true });
  await expect(relancer).toHaveCount(1);
  await expect(page.locator("#feedList > .feed-exemples-sep")).toContainText("Exemples PASSIO");
  options.panne = false;
  await relancer.click();
  await expect(premiereCarte(page)).toHaveAttribute("data-postid", photo.id);
  expect(lectures.filter(l => l.ids.includes("photo"))).toHaveLength(2);
});

test("une réponse Photo devenue obsolète ne remplace pas le choix Musique", async ({ page }) => {
  const photo = publication(20, "photo"), cible = suspendre();
  const lectures = await ouvrir(page, [...teteMusique(), photo], { cible });
  // Observer la FIN de l'hydratation de la vraie réponse avant l'assertion.
  await page.evaluate(() => {
    const lire = window.supaLoadPosts;
    window.supaLoadPosts = async function (...args) {
      const posts = await lire(...args);
      if (args[2]?.pagePassions?.ids.includes("photo")) window.__photoRelue = true;
      return posts;
    };
  });
  try {
    await page.locator("#frValider").click();
    await expect.poll(() => lectures.some(l => l.ids.includes("photo"))).toBe(true);
    await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("reglages"));
    await page.locator('#frGrid [data-fr-passion="photo"]').click();
    await page.locator('#frGrid [data-fr-passion="musique"]').click();
    await page.locator("#frValider").click();
    await expect(premiereCarte(page)).toContainText("musique 0");
  } finally { cible.liberer(); }
  await page.waitForFunction(() => window.__photoRelue);
  expect(await page.evaluate(id => state.supabasePosts.some(p => p.id === id), photo.id)).toBe(false);
  await expect(premiereCarte(page)).toContainText("musique 0");
  expect(lectures.filter(l => l.ids.includes("musique"))).toHaveLength(0);
});

test("la lecture reprend après trois pages ciblées masquées sans déclarer de vide", async ({ page }) => {
  const bobines = Array.from({ length: 60 }, (_, i) => publication(i + 20, "photo", { is_reel: true }));
  const photo = publication(80, "photo");
  const lectures = await ouvrir(page, [...teteMusique(), ...bobines, photo]);
  await page.locator("#frValider").click();
  const suite = page.locator("#feedRecherchePassions").getByRole("button", { name: "Continuer la recherche" });
  await expect(suite).toBeVisible();
  expect(lectures.filter(l => l.ids.includes("photo"))).toHaveLength(3);
  await expect(page.locator(".feed-repli-tete")).toHaveCount(0);
  await suite.click();
  await expect(premiereCarte(page)).toHaveAttribute("data-postid", photo.id);
  expect(lectures.filter(l => l.ids.includes("photo") && l.curseur)).toHaveLength(3);
});
