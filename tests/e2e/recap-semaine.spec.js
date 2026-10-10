// ═══════════════════════════════════════════════════════════════════════════
// RÉCAP DE LA SEMAINE (2026-10-06) — js/recap-semaine.js
//
// Une carte en tête du fil, au plus une fois par semaine et par compte, dans
// l'app seulement : ce qui s'est passé ces 7 derniers jours autour des passions
// du compte. Le client Supabase du module est REMPLACÉ par un faux qui note
// chaque appel et rend des réponses écrites ici : rien ne part vers la
// production, et la FORME des lectures est mesurée (colonnes, filtres, fenêtre).
// Le module est coupé pendant le démarrage (`passio_recap_semaine = "0"`) puis
// rallumé et lancé à la main : le banc décide du moment, pas une minuterie.
// MUTATIONS éprouvées, chacune rougit son cas : ne plus marquer la semaine
// (②③) ; compter une activité annulée (①) ; ne plus distinguer le compte dans
// la marque (④) ; ignorer le choix « Ne plus afficher » (⑤) ; ne plus
// journaliser un refus serveur (⑦) ; lire sans session ou pour un compte de
// moins de 3 jours (⑨ bis).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "3f1c2a4e-1111-4abc-8def-0123456789ab";
const AUTRE = "9e8d7c6b-2222-4abc-8def-0123456789ab";

async function compte(page, uid = UID) {
  // Coupé à CHAQUE chargement, rechargements compris : la reprise automatique du
  // module ne doit jamais lire avec le vrai client — seul le faux, posé ensuite.
  await page.addInitScript((u) => {
    if (u) localStorage.setItem("passio_uid", u);
    localStorage.setItem("passio_recap_semaine", "0");
  }, uid);
  await bootOnboarded(page);
}

/**
 * Remplace le client du module ; `rep[table]` = ce que rend la lecture de cette
 * table. Pose la session PERSISTÉE que lit `_sessionSdkPersistee()` (jamais le
 * SDK) : `rep.ageJours` = âge du compte (absent = 30 j, `null` = pas de
 * session), `rep.uidSession` = son titulaire (absent = le compte du banc).
 */
async function fauxClient(page, rep) {
  await page.evaluate(([r, uidBanc]) => {
    const ref = (String((window.PASSIO_SUPABASE && window.PASSIO_SUPABASE.url) || "").match(/https?:\/\/([^.]+)\./) || [])[1];
    const cle = "sb-" + ref + "-auth-token";
    if (r.ageJours === null) localStorage.removeItem(cle);
    // Session COMPLÈTE : le SDK efface une session sans `refresh_token` au premier
    // appel REST qui passe par lui (même piège que ecritures-identite-compte).
    else localStorage.setItem(cle, JSON.stringify({
      access_token: "jeton-de-banc", refresh_token: "jeton-de-banc-renouvellement", token_type: "bearer",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: r.uidSession || uidBanc, created_at: new Date(Date.now() - (r.ageJours === undefined ? 30 : r.ageJours) * 864e5).toISOString() },
    }));
    window.__appels = [];
    function requete(table) {
      const appel = { table, ops: [] };
      window.__appels.push(appel);
      const q = {};
      ["select", "in", "eq", "neq", "gte", "lte", "limit"].forEach((op) => {
        q[op] = (...args) => { appel.ops.push([op, ...args]); return q; };
      });
      q.then = (ok, ko) => Promise.resolve(r[table] || { data: [], count: 0, error: null }).then(ok, ko);
      return q;
    }
    window.supa = { from: requete };
    window._supaReal = true;
    window.__toasts = [];
    window.toast = (t) => window.__toasts.push(String(t));
    localStorage.removeItem("passio_recap_semaine");
  }, [rep, UID]);
}

const lancer = (page) => page.evaluate(() => PassioRecapSemaine.tenter());

/** Recharger comme `bootOnboarded` démarre : fil actif, puis la landing de secours retirée. */
async function recharger(page) {
  await page.reload();
  await page.waitForFunction(() => window.PassioRecapSemaine && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
}
const lignes = () => Array.from(document.querySelectorAll("#recapSemaine .recap-semaine-ligne")).map((b) => [b.getAttribute("data-recap"), b.querySelector(".recap-semaine-texte").textContent]);

const SEMAINE_PLEINE = {
  posts: { count: 5, data: null, error: null },
  notifications: { error: null, data: [
    { kind: "follow" }, { kind: "follow" }, { kind: "like" }, { kind: "like" }, { kind: "like" },
    { kind: "comment" }, { kind: "mention" }, { kind: "event_join" }, { kind: "message" },
  ] },
  events: { error: null, data: [
    { id: "e1", passion_id: "musique", date_at: "2026-10-08T18:00:00", status: "active" },
    { id: "e2", passion_id: "musique", date_at: "2026-10-09T18:00:00", status: "cancelled" },
  ] },
};

test("① une semaine qui a du contenu : la carte en tête du fil, une ligne par fait, des lectures bornées", async ({ page }) => {
  await compte(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await expect(page.locator("#recapSemaine")).toBeVisible();
  expect(await page.evaluate(lignes)).toEqual([
    ["fil", "5 nouvelles publications dans tes passions"],
    ["abonnes", "2 personnes se sont abonnées à toi"],
    ["commentaires", "2 commentaires et mentions pour toi"],
    ["jaime", "3 j'aime sur tes publications"],
    ["inscriptions", "1 inscription à tes activités"],
    ["irl", "1 activité dans tes passions ces 7 prochains jours"],
  ]);
  // En FRÈRE de #feedList, juste avant lui — jamais dedans.
  expect(await page.evaluate(() => document.getElementById("feedList").previousElementSibling.id)).toBe("recapSemaine");
  expect(await page.locator("#feedList #recapSemaine").count()).toBe(0);

  const appels = await page.evaluate(() => window.__appels);
  expect(appels.map((a) => a.table).sort()).toEqual(["events", "notifications", "posts"]);
  const op = (table, nom) => appels.find((a) => a.table === table).ops.find((o) => o[0] === nom);
  const passions = await page.evaluate(() => passionsPossedeesIds());
  expect(op("posts", "select")).toEqual(["select", "id", { count: "exact", head: true }]);
  expect(op("posts", "in")).toEqual(["in", "passion_id", passions]);
  expect(op("posts", "neq")).toEqual(["neq", "author_id", "3f1c2a4e-1111-4abc-8def-0123456789ab"]);
  expect(op("notifications", "eq")).toEqual(["eq", "user_id", "3f1c2a4e-1111-4abc-8def-0123456789ab"]);
  expect(op("notifications", "limit")).toEqual(["limit", 500]);
  expect(op("events", "select")[1]).toBe("id,passion_id,date_at,status");
  for (const [table, col] of [["posts", "created_at"], ["notifications", "created_at"]]) {
    const g = op(table, "gte");
    expect(g[1]).toBe(col);
    expect(Math.round((Date.now() - Date.parse(g[2])) / 864e5)).toBe(7);
  }
  const lte = op("events", "lte");
  expect(Math.round((Date.parse(lte[2]) - Date.now()) / 864e5)).toBe(7);
  // Aucun langage de pression : des faits.
  const texte = await page.locator("#recapSemaine").textContent();
  expect(texte).not.toMatch(/rat[ée]|perdre|série|reviens|vite|dépêche/i);
});

test("② une fois par semaine : la même semaine, ni carte ni lecture", async ({ page }) => {
  await compte(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await expect(page.locator("#recapSemaine")).toBeVisible();
  const marque = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_recap_semaine_v1")));
  expect(marque).toEqual({ uid: "3f1c2a4e-1111-4abc-8def-0123456789ab", semaine: await page.evaluate(() => PassioRecapSemaine.semaineIso(new Date())) });

  await recharger(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await page.waitForTimeout(500);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
});

test("③ une semaine vide n'est pas annoncée — et la semaine est quand même traitée", async ({ page }) => {
  await compte(page);
  await fauxClient(page, { posts: { count: 0, error: null }, notifications: { data: [{ kind: "message" }], error: null }, events: { data: [], error: null } });
  await lancer(page);
  await page.waitForTimeout(500);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("passio_recap_semaine_v1"))).toContain("semaine");
});

test("④ la marque est celle du COMPTE : un autre compte sur l'appareil a droit à son récap", async ({ page }) => {
  await compte(page);
  await page.evaluate(([autre]) => {
    localStorage.setItem("passio_recap_semaine_v1", JSON.stringify({ uid: autre, semaine: PassioRecapSemaine.semaineIso(new Date()) }));
  }, [AUTRE]);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await expect(page.locator("#recapSemaine")).toBeVisible();
  // Et la clé part avec le compte à la déconnexion.
  expect(await page.evaluate(() => ACCOUNT_SCOPED_KEYS.includes("passio_recap_semaine_v1"))).toBe(true);
});

test("⑤ « Ne plus afficher » coupe pour de bon, et Paramètres › Notifications le dit et le rend", async ({ page }) => {
  await compte(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await page.click("#recapSemaine .recap-semaine-couper");
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => getCurrentConfig().notifs.recap)).toBe(false);
  expect(await page.evaluate(() => window.__toasts.join(" "))).toMatch(/Paramètres › Personnalisation › Notifications/);
  // Coupé : même une semaine neuve ne lit rien.
  await page.evaluate(() => localStorage.removeItem("passio_recap_semaine_v1"));
  await recharger(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await page.waitForTimeout(500);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  // Les réglages montrent la case décochée ; la recocher rend le récap.
  await page.evaluate(() => openNotifSettings());
  await expect(page.locator("#notifRecap")).not.toBeChecked();
  await page.check("#notifRecap");
  await page.evaluate(() => saveNotifSettings());
  expect(await page.evaluate(() => getCurrentConfig().notifs.recap)).toBe(true);
  // Les cinq autres réglages n'ont pas bougé (défaut : tout coché).
  expect(await page.evaluate(() => { const n = getCurrentConfig().notifs; return [n.posts, n.messages, n.likes, n.events, n.system]; })).toEqual([true, true, true, true, true]);
});

test("⑥ chaque ligne mène là où ça se passe : Rencontrer, les notifications, le fil", async ({ page }) => {
  await compte(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await page.click('#recapSemaine [data-recap="irl"]');
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  await expect(page.locator("#screen-irl")).toHaveClass(/active/);

  await page.evaluate(() => { localStorage.removeItem("passio_recap_semaine_v1"); goTo("feed"); });
  await recharger(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await page.evaluate(() => { window.__notifs = 0; window.openNotifications = () => { window.__notifs++; }; });
  await lancer(page);
  await page.click('#recapSemaine [data-recap="abonnes"]');
  expect(await page.evaluate(() => window.__notifs)).toBe(1);
});

test("⑦ un refus serveur se tait (journalisé) : sa ligne manque, le reste parle", async ({ page }) => {
  await compte(page);
  await page.evaluate(() => { window.__diag = []; window.diagLog = (m) => window.__diag.push(String(m)); });
  await fauxClient(page, {
    posts: { count: 4, error: null },
    notifications: { data: null, error: { message: "permission denied for table notifications" } },
    events: { data: null, error: { message: "42501" } },
  });
  await lancer(page);
  await expect(page.locator("#recapSemaine")).toBeVisible();
  expect(await page.evaluate(lignes)).toEqual([["fil", "4 nouvelles publications dans tes passions"]]);
  const diag = await page.evaluate(() => window.__diag.join("\n"));
  expect(diag).toMatch(/recap-semaine: notifications — permission denied/);
  expect(diag).toMatch(/recap-semaine: activites — 42501/);
});

test("⑧ sans compte (visiteur ou identifiant local), et coupé par le drapeau : rien, aucune lecture", async ({ page }) => {
  await compte(page, null);
  await fauxClient(page, SEMAINE_PLEINE);
  await lancer(page);
  await page.waitForTimeout(400);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);

  await page.evaluate(([u]) => { localStorage.setItem("passio_uid", u); }, [UID]);
  await recharger(page);
  await fauxClient(page, SEMAINE_PLEINE);
  await page.evaluate(() => { window.PASSIO_RECAP_SEMAINE = false; });
  await lancer(page);
  await page.waitForTimeout(400);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
});

test("⑨ bis sans session, session d'un autre compte, ou compte de moins de 3 jours : aucune lecture, et la semaine reste à faire", async ({ page }) => {
  await compte(page);
  await fauxClient(page, { ...SEMAINE_PLEINE, ageJours: null });
  await lancer(page);
  await page.waitForTimeout(400);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("passio_recap_semaine_v1"))).toBeNull();

  await recharger(page);
  await fauxClient(page, { ...SEMAINE_PLEINE, ageJours: 1 });
  await lancer(page);
  await page.waitForTimeout(400);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("passio_recap_semaine_v1"))).toBeNull();

  // La session d'un AUTRE compte (identité divergente) : rien non plus.
  await recharger(page);
  await fauxClient(page, { ...SEMAINE_PLEINE, uidSession: AUTRE });
  await lancer(page);
  await page.waitForTimeout(400);
  await expect(page.locator("#recapSemaine")).toHaveCount(0);
  expect(await page.evaluate(() => window.__appels.length)).toBe(0);

  // Le même compte, quatre jours plus tard : le récap vient.
  await recharger(page);
  await fauxClient(page, { ...SEMAINE_PLEINE, ageJours: 4 });
  await lancer(page);
  await expect(page.locator("#recapSemaine")).toBeVisible();
});

test("⑨ la semaine est ISO (lundi) et LOCALE", async ({ page }) => {
  await compte(page);
  const s = await page.evaluate(() => [
    PassioRecapSemaine.semaineIso(new Date(2026, 9, 5)),   // lundi 5 octobre 2026
    PassioRecapSemaine.semaineIso(new Date(2026, 9, 11)),  // dimanche 11
    PassioRecapSemaine.semaineIso(new Date(2026, 9, 12)),  // lundi 12
    PassioRecapSemaine.semaineIso(new Date(2026, 0, 1)),   // jeudi 1er janvier 2026
    PassioRecapSemaine.semaineIso(new Date(2024, 11, 30)), // lundi 30 décembre 2024 → 2025
  ]);
  expect(s).toEqual(["2026-S41", "2026-S41", "2026-S42", "2026-S01", "2025-S01"]);
});
