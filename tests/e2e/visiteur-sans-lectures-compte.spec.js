// ═══════════════════════════════════════════════════════════════════════════
// UN VISITEUR NE LIT PAS LE COMPTE QU'IL N'A PAS (2026-10-11)
//
// Mesuré sur les journaux de production (24 h, `edge_logs`) : 15 491 requêtes
// REST sur 21 294 venues des bancs (73 %) étaient des lectures « de moi » sous
// un identifiant de VISITEUR — `user_state`, `profiles?id=eq.u_…`,
// `conv_members`, `blocks`, `follows`, `story_views` —, et le même motif chez
// les visiteurs réels : ~12 requêtes par visite, qui ne peuvent rendre qu'un
// 200 vide (`getMyUserId()` fabrique un `u_<aléatoire>` qui n'existe dans aucune
// table). Deux d'entre elles (`user_state`, puis le profil) étaient ATTENDUES
// en tête de `supaInit`, AVANT `supaLoadPosts()` : chaque visiteur payait deux
// allers-retours avant de voir une publication.
//
// Les ÉCRITURES étaient déjà gardées par l'autorité de compte (`_uidEstUnCompte`
// / `_compteAuthReel`, #367 et suites) ; les LECTURES non. Ce banc garde :
//   ① visiteur — `supaInit()` ne lit aucune table « de moi », et la PREMIÈRE
//      chose qu'il demande est le fil ;
//   ② compte réel — les mêmes lectures partent toutes, avec son uuid (une garde
//      trop large couperait la synchronisation d'un vrai compte, sans un bruit) ;
//   ③ visiteur — chaque lecteur, appelé seul, rend sa valeur vide habituelle,
//      sans requête, et `_etatCompteCharge` est posé (des modules l'attendent) ;
//   ④ SOURCE — la garde est DANS chaque lecteur, pas chez un seul appelant :
//      `supaLoadUserState` a trois appelants (boot, supaInit, le rejeu).
//
// ⚠️ AUCUN OCTET NE PART VERS LA PRODUCTION : tout `*.supabase.co` est coupé au
// réseau, et `window.supa.from` est MUTÉ (jamais remplacé : `supa` est un `let`
// de portée script) par un client factice qui note chaque opération.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP02 = path.join(__dirname, "..", "..", "js", "app-02-state-utils.js");
const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");
const UID_COMPTE = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

// Les lectures « de moi » : table → colonne qui porte l'identifiant du lecteur.
const LECTURES_DE_MOI = {
  user_state: "user_id",
  profiles: "id",
  conv_members: "user_id",
  notifications: "user_id",
  blocks: "blocker_id",
  story_views: "user_id",
  follows: "follower_id",
};

function corpsDeFonction(src, nom) {
  const i = src.search(new RegExp("\\n(?:async )?function " + nom + "\\("));
  if (i < 0) return "";
  const suite = src.slice(i + 1);
  const k = suite.search(/\n(?:async )?function /);
  return k < 0 ? suite : suite.slice(0, k);
}

async function banc(page, { uidLocal } = {}) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (uidLocal) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, uidLocal);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window.__ops = [];
    // Un maillon de requête factice : toute méthode de chaîne est acceptée et
    // notée (`eq` porte le filtre qui nous intéresse), `then` rend une réponse
    // vide. Un Proxy plutôt qu'une liste de méthodes : un lecteur qui passerait
    // par `.gte(` ou `.is(` ne doit pas lever et sortir AVANT d'être compté.
    const requete = (table) => {
      const op = { table, op: null, filtres: [] };
      window.__ops.push(op);
      const p = new Proxy({}, {
        get(_t, nom) {
          if (nom === "then") {
            return (ok, ko) => Promise.resolve({ data: null, error: null, status: 200, count: 0 }).then(ok, ko);
          }
          return (...args) => {
            if (["select", "insert", "upsert", "update", "delete"].includes(nom) && !op.op) op.op = nom;
            if (nom === "eq") op.filtres.push([String(args[0]), String(args[1])]);
            return p;
          };
        },
      });
      return p;
    };
    window.supa.from = (table) => requete(table);
    window._supaReal = true;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__ops = []; });
}

// Les lectures notées dont le filtre désigne le lecteur lui-même.
function lecturesDeMoi(ops, uid) {
  return ops.filter((o) => o.op === "select" && LECTURES_DE_MOI[o.table]
    && o.filtres.some(([col, val]) => col === LECTURES_DE_MOI[o.table] && val === uid));
}

test("① visiteur — le démarrage ne lit aucune table « de moi », et commence par le fil", async ({ page }) => {
  await banc(page);
  const uid = await page.evaluate(() => MY_UID);
  expect(uid, "le banc part bien d'un identifiant de visiteur").toMatch(/^u_/);
  await page.evaluate(async () => { try { await supaInit(); } catch (e) {} });
  // `supaInit` diffère de 2 s notifications, blocages, stories vues et abonnements.
  await page.waitForTimeout(2600);
  const ops = await page.evaluate(() => window.__ops);
  const fautives = lecturesDeMoi(ops, uid).map((o) => o.table);
  expect(fautives, "aucune lecture « de moi » sous un identifiant de visiteur").toEqual([]);
  // Non vide : le banc a bien parcouru `supaInit` jusqu'au fil.
  expect(ops.some((o) => o.table === "posts"), "le fil a bien été demandé").toBe(true);
  expect(ops[0] && ops[0].table, "et c'est la PREMIÈRE requête du démarrage").toBe("posts");
});

test("② compte réel — les lectures du compte partent toutes, avec son uuid", async ({ page }) => {
  await banc(page, { uidLocal: UID_COMPTE });
  expect(await page.evaluate(() => MY_UID), "le banc porte bien un compte").toBe(UID_COMPTE);
  await page.evaluate(async () => { try { await supaInit(); } catch (e) {} });
  await page.waitForTimeout(2600);
  const ops = await page.evaluate(() => window.__ops);
  const lues = new Set(lecturesDeMoi(ops, UID_COMPTE).map((o) => o.table));
  for (const table of Object.keys(LECTURES_DE_MOI)) {
    expect(lues.has(table), `${table} est lue pour le compte`).toBe(true);
  }
});

test("③ visiteur — chaque lecteur rend sa valeur vide habituelle, sans requête", async ({ page }) => {
  await banc(page);
  const r = await page.evaluate(async () => {
    window._etatCompteCharge = false;
    const out = {
      userState: await supaLoadUserState(),
      etatCharge: window._etatCompteCharge,
      conversations: await supaLoadMyConversations(),
      notifications: await supaLoadNotifications(),
      blocages: await supaLoadBlocks(),
      vues: await supaLoadStoryViews(),
      suivis: await supaLoadFollowing(),
    };
    out.requetes = window.__ops.length;
    return out;
  });
  expect(r.userState, "aucun état restauré").toBe(false);
  expect(r.etatCharge, "le verdict est quand même rendu (sortie par finally)").toBe(true);
  expect([r.conversations, r.notifications, r.blocages, r.vues, r.suivis]).toEqual([[], [], [], [], []]);
  expect(r.requetes, "et rien n'est parti").toBe(0);
});

test("④ source — la garde vit DANS chaque lecteur, avec l'autorité de compte", async () => {
  const app02 = fs.readFileSync(SOURCE_APP02, "utf8");
  const app08 = fs.readFileSync(SOURCE_APP08, "utf8");
  const etat = corpsDeFonction(app02, "supaLoadUserState");
  expect(etat, "supaLoadUserState existe toujours").not.toBe("");
  const iGarde = etat.indexOf("if (!_uidEstUnCompte()) return false;");
  expect(iGarde, "supaLoadUserState passe par l'autorité de compte").toBeGreaterThan(0);
  expect(iGarde < etat.indexOf('from("user_state")'), "AVANT sa lecture").toBe(true);
  for (const nom of ["supaLoadMyConversations", "supaLoadNotifications", "supaLoadBlocks",
                     "supaLoadStoryViews", "supaLoadFollowing"]) {
    const corps = corpsDeFonction(app08, nom);
    expect(corps, `${nom} existe toujours`).not.toBe("");
    const g = corps.indexOf("_compteAuthReel()");
    expect(g, `${nom} passe par l'autorité de compte`).toBeGreaterThan(0);
    expect(g < corps.indexOf("supa.from("), `${nom} : la garde précède la lecture`).toBe(true);
  }
  // Le profil « de moi » est lu dans le CORPS de supaInit : garde à cet endroit.
  const init = corpsDeFonction(app08, "supaInit");
  const iProfil = init.indexOf('.select("username,emoji,color,avatar_url,passion_id,bio").eq("id", MY_UID)');
  expect(iProfil, "la lecture du profil de démarrage existe toujours").toBeGreaterThan(0);
  const avant = init.slice(Math.max(0, iProfil - 300), iProfil);
  expect(avant.includes("if (_compteAuthReel()) { try {"),
    "elle est réservée à un compte").toBe(true);
});
