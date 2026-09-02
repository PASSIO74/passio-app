// ══════════════════════════════════════════════════════════════════════════
// L'ÉTAT LOCAL APPARTIENT À UN COMPTE, JAMAIS À L'APPAREIL  (2026-09-02)
//
// Défaut rapporté par Benjamin après essai réel : « j'étais dans l'app sans
// compte pour découvrir, j'ai mis plein de passions pour voir, ensuite je me
// suis connecté à mon vrai compte et tu as mélangé les infos de la page de
// découverte avec mon compte… les infos enregistrées dans un compte doivent
// être enregistrées au compte. »
//
// ⚠️ CE N'ÉTAIT PAS UNE FUSION D'AFFICHAGE : L'EXPLORATION ÉCRASAIT LE SERVEUR.
// Le chemin tenait en quatre lignes de `onbDoAuth` (app-02) :
//     MY_UID = data.session.user.id;   // ① l'identité devient celle du compte
//     state.onboarded = true;          // ② l'état ANONYME devient « onboardé »
//     saveState();                     // ③ _stateDirty = true
//     window.location.reload();        // ④ pagehide → supaSaveUserStateBeacon
// Les trois gardes du beacon passent, et il POSTe `_syncableState()` — l'état de
// l'EXPLORATION — dans `user_state` du vrai compte, en
// `resolution=merge-duplicates`, donc en REMPLAÇANT la ligne.
//
// Ce fichier mesure le programme, pas l'affichage : il exerce les fonctions
// RÉELLES (`supaSaveUserStateBeacon`, `adopterCompteConnecte`) et regarde ce qui
// part sur le réseau. Le premier cas REPRODUIT le défaut (sans la garde, le POST
// contient les passions de l'exploration) ; le second prouve qu'il ne part plus.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

// Un uuid Supabase — le SEUL identifiant qui prouve un compte. Le placeholder
// local `u_xxxxxxxx` fabriqué par `getMyUserId` n'en a ni la forme ni le rôle.
const UID_COMPTE = "11111111-2222-4333-8444-555555555555";

const prefsInvite = {
  v: 1, passions: ["moto", "photo", "cuisine"], specialites: [], intents: [],
  tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1,
};

// Pose une sonde sur `fetch` et rend ce qui a été envoyé à `user_state`.
// ⚠️ La sonde est posée DANS la page, après le boot : le réseau Supabase est
// déjà coupé par le helper, donc rien ne peut atteindre la production quoi
// qu'il arrive — on mesure l'INTENTION d'écriture, pas son aboutissement.
async function poserSondeUserState(page) {
  await page.evaluate(() => {
    window.__postsUserState = [];
    const vrai = window.fetch;
    window.fetch = function (url, opts) {
      try {
        const u = String((url && url.url) || url || "");
        if (u.indexOf("/rest/v1/user_state") !== -1) {
          window.__postsUserState.push({ url: u, body: (opts && opts.body) || "" });
        }
      } catch (e) {}
      return vrai.apply(this, arguments);
    };
  });
}

test.describe("Exploration anonyme puis connexion à un vrai compte", () => {
  test("SANS la garde, le beacon posterait l'état de l'exploration sous l'identité du compte", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);

    const r = await page.evaluate(() => {
      // L'exploration a personnalisé le fil : c'est le geste normal du visiteur.
      setFeedPassions(["moto", "photo", "cuisine"]);
      // Puis les trois lignes que `onbDoAuth` exécutait avant le rechargement,
      // SANS la garde d'adoption — c'est la reproduction du défaut.
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      state.onboarded = true;
      saveState();
      saveStateNow();
      supaSaveUserStateBeacon();
      return window.__postsUserState.map(function (p) { return p.body; });
    });

    // Le défaut, mesuré : un POST part, et il porte les passions de l'exploration.
    expect(r.length).toBe(1);
    expect(r[0]).toContain(UID_COMPTE);
    expect(r[0]).toContain("moto");
    expect(r[0]).toContain("cuisine");
  });

  test("AVEC la garde, plus rien ne part — l'état de l'exploration est purgé", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);

    const r = await page.evaluate(async () => {
      setFeedPassions(["moto", "photo", "cuisine"]);
      saveStateNow();
      const avant = localStorage.getItem("passio_mvp_state_v1");
      const uidAvant = localStorage.getItem("passio_uid");
      // La garde, appelée exactement là où `onbDoAuth` et `boot` l'appellent :
      // AVANT que `MY_UID` et `passio_uid` prennent la valeur du compte.
      const purge = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      // Puis la suite du chemin réel, telle quelle.
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      try { state.onboarded = true; saveState(); saveStateNow(); } catch (e) {}
      supaSaveUserStateBeacon();
      return {
        purge, uidAvant,
        avaitUnEtat: !!avant && avant.indexOf("moto") !== -1,
        etatApres: localStorage.getItem("passio_mvp_state_v1"),
        uidApres: localStorage.getItem("passio_uid"),
        posts: window.__postsUserState.map(function (p) { return p.body; }),
      };
    });

    // Prémisse VÉRIFIÉE, jamais supposée : l'appareil portait bien l'exploration.
    expect(r.avaitUnEtat).toBe(true);
    expect(r.uidAvant).not.toBe(UID_COMPTE);   // placeholder local `u_xxxxxxxx`
    expect(r.purge).toBe(true);
    // L'état d'exploration a disparu de l'appareil : le serveur fera foi.
    expect(r.etatApres === null || r.etatApres.indexOf("moto") === -1).toBe(true);
    // ⚠️ ET RIEN N'EST PARTI. C'est le point central : `_accountPurged` fige le
    // beacon, la file et la synchronisation débouncée jusqu'au rechargement.
    expect(r.posts).toEqual([]);
  });

  test("l'identifiant du compte est réécrit aussitôt : pas de boucle de purge", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const r = await page.evaluate(async () => {
      const premier = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      const uid = localStorage.getItem("passio_uid");
      // Le rechargement retrouve un appareil qui connaît DÉJÀ ce compte.
      const second = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      return { premier, second, uid };
    });
    expect(r.premier).toBe(true);
    // ⚠️ `purgeAccountScopedData` retire `passio_uid` : sans la réécriture qui
    // suit, le boot suivant re-purgerait et rechargerait, indéfiniment.
    expect(r.uid).toBe(UID_COMPTE);
    expect(r.second).toBe(false);
  });

  test("un retour sur SON PROPRE compte ne purge rien", async ({ page }) => {
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      // L'appareil connaît déjà ce compte (session expirée, reconnexion).
      localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");
      state.user.name = "Écriture locale pas encore synchronisée";
      saveStateNow();
      const purge = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      const brut = localStorage.getItem("passio_mvp_state_v1") || "";
      return { purge, garde: brut.indexOf("pas encore synchronis") !== -1 };
    });
    expect(r.purge).toBe(false);
    expect(r.garde).toBe(true);   // ses écritures locales lui restent
  });

  test("un identifiant qui n'est pas un uuid ne déclenche jamais de purge", async ({ page }) => {
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      const avant = localStorage.getItem("passio_mvp_state_v1");
      // ⚠️ `MY_UID` NE PROUVE PAS UN COMPTE : `getMyUserId` fabrique
      // `u_xxxxxxxx` pour tout le monde, au chargement du script.
      const placeholder = await adopterCompteConnecte("u_ab12cd34");
      const vide = await adopterCompteConnecte("");
      const nul = await adopterCompteConnecte(null);
      return { placeholder, vide, nul, intact: localStorage.getItem("passio_mvp_state_v1") === avant };
    });
    expect(r.placeholder).toBe(false);
    expect(r.vide).toBe(false);
    expect(r.nul).toBe(false);
    expect(r.intact).toBe(true);
  });
});
