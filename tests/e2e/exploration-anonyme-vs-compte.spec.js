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
    // ⚠️ LA PRÉMISSE SE POSE AVANT LA NAVIGATION, ET C'EST TOUT LE SUJET.
    // « L'appareil connaît déjà ce compte » veut dire que la page s'OUVRE avec
    // cette identité — c'est l'instantané que prend `adopterCompteConnecte`.
    // La version précédente de ce cas écrivait `passio_uid` APRÈS le
    // chargement : elle simulait donc la réécriture que le correctif du
    // 2026-09-02 doit justement ignorer (le handler `onAuthStateChange` fait
    // exactement ça), et elle serait restée verte sur le code défectueux.
    await page.addInitScript(() => {
      localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");
    });
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      state.user.name = "Écriture locale pas encore synchronisée";
      saveStateNow();
      const purge = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      const brut = localStorage.getItem("passio_mvp_state_v1") || "";
      return { purge, garde: brut.indexOf("pas encore synchronis") !== -1 };
    });
    expect(r.purge).toBe(false);
    expect(r.garde).toBe(true);   // ses écritures locales lui restent
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LE DISCRIMINANT NE SE RELIT PAS, IL SE SOUVIENT  (2026-09-02)
  //
  // ⚠️ CE CAS EST LE VERROU DU DÉFAUT QUI A FAILLI PARTIR EN PRODUCTION, et il
  // dit exactement ce que la première version des tests ne pouvait pas voir :
  // ils appelaient `adopterCompteConnecte` directement, sur un appareil où rien
  // n'avait touché `passio_uid` entre-temps. Le stub Supabase hors ligne n'émet
  // aucun événement d'auth, donc la course réelle n'existait pas dans le test.
  //
  // Dans la vraie vie, TROIS points écrivent `passio_uid`, et supabase-js
  // notifie ses abonnés PENDANT `signInWithPassword`, avant d'en résoudre la
  // promesse. L'ordre réel est donc : le handler `onAuthStateChange` écrit
  // `passio_uid = <uuid>`, PUIS `onbDoAuth` interroge la garde — qui relisait
  // cette clé, y trouvait l'uuid, concluait « c'est déjà le sien » et ne
  // purgeait RIEN. Le défaut d'origine, intact, sur le chemin exact qui l'avait
  // fait remonter.
  //
  // On reproduit cette réécriture ici. Éprouvé par mutation : revenir à une
  // relecture de `localStorage` dans `adopterCompteConnecte` fait rougir ce cas.
  // ══════════════════════════════════════════════════════════════════════════
  test("la garde purge même si `passio_uid` a déjà été réécrit par le handler d'auth", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);

    const r = await page.evaluate(async () => {
      setFeedPassions(["moto", "photo", "cuisine"]);
      saveStateNow();
      const avait = (localStorage.getItem("passio_mvp_state_v1") || "").indexOf("moto") !== -1;

      // ⚠️ LA COURSE, REPRODUITE : c'est ce que fait `onAuthStateChange`
      // (app-08) à la réception de SIGNED_IN, AVANT que la promesse de
      // `signInWithPassword` ne résolve et que `onbDoAuth` n'appelle la garde.
      localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");

      const purge = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");

      // Puis la suite du chemin réel, telle quelle.
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      try { state.onboarded = true; saveState(); saveStateNow(); } catch (e) {}
      supaSaveUserStateBeacon();

      return {
        avait, purge,
        etatApres: localStorage.getItem("passio_mvp_state_v1"),
        posts: window.__postsUserState.map(function (p) { return p.body; }),
      };
    });

    expect(r.avait).toBe(true);                 // prémisse vérifiée, pas supposée
    expect(r.purge).toBe(true);                 // ⚠️ valait `false` avant le correctif
    expect(r.etatApres === null || r.etatApres.indexOf("moto") === -1).toBe(true);
    expect(r.posts).toEqual([]);                // et rien n'est parti sous l'identité du compte
  });

  // La contrepartie : il existe des chemins où l'état local DOIT suivre
  // l'identité qui vient de naître — une inscription qui rend une session, et
  // `onbSkipAuth` (session anonyme, qui rend un VRAI uuid). Là, l'état porte
  // l'onboarding qu'on vient de saisir. Le purger jetterait le travail de la
  // personne au milieu de son inscription.
  test("une identité DÉCLARÉE délibérément ne purge rien (inscription, session anonyme)", async ({ page }) => {
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      state.user.name = "Prénom saisi pendant l'onboarding";
      saveStateNow();
      // Ce que font `onbSkipAuth` et la branche inscription d'`onbDoAuth`.
      const declare = attribuerEtatLocalAuCompte("11111111-2222-4333-8444-555555555555");
      // Ce que ferait ensuite le handler `onAuthStateChange` sur la même session.
      const purge = await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      const brut = localStorage.getItem("passio_mvp_state_v1") || "";
      return { declare, purge, garde: brut.indexOf("pendant l'onboarding") !== -1,
               uid: localStorage.getItem("passio_uid") };
    });
    expect(r.declare).toBe(true);
    expect(r.purge).toBe(false);      // ⚠️ l'onboarding en cours n'est PAS jeté
    expect(r.garde).toBe(true);
    expect(r.uid).toBe(UID_COMPTE);
  });

  // La sonde d'écriture ne doit jamais se servir de la clé qu'elle garde :
  // sonder avec `passio_uid` ouvrait une fenêtre où l'appareil « connaissait »
  // le compte tout en portant encore l'état anonyme — et une interruption là
  // désarmait la garde à vie.
  test("un refus ne laisse aucune trace : ni `passio_uid` touché, ni clé de sonde abandonnée", async ({ page }) => {
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      const uidAvant = localStorage.getItem("passio_uid");
      await adopterCompteConnecte("u_ab12cd34");     // pas un uuid → refus
      await adopterCompteConnecte("");
      const cles = [];
      for (let i = 0; i < localStorage.length; i++) cles.push(localStorage.key(i));
      return { intact: localStorage.getItem("passio_uid") === uidAvant,
               sonde: cles.filter((k) => k && k.indexOf("probe") !== -1) };
    });
    expect(r.intact).toBe(true);
    expect(r.sonde).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // UN APPAREIL VIDÉ N'ÉCRASE JAMAIS LE COMPTE QU'IL VIENT D'ADOPTER
  //
  // ⚠️ SECOND CONSTAT BLOQUANT DE LA REVUE, ET IL VENAIT DE LA PURGE ELLE-MÊME.
  // Avant la purge, l'état local n'était jamais vide, donc ce chemin n'existait
  // pas ; la garde a créé sa propre façon de détruire des données :
  //   ① adoption → purge → rechargement ;
  //   ② `supaLoadUserState` échoue (réseau coupé, 5xx, jeton pas encore frais) ;
  //   ③ `boot()` continue, `state.onboarded = true` ;
  //   ④ la première sauvegarde POSTe l'état VIDE — le compte est effacé partout.
  // ══════════════════════════════════════════════════════════════════════════
  test("après une purge, aucune écriture ne part tant que le compte n'a pas été relu", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);

    const r = await page.evaluate(async () => {
      setFeedPassions(["moto", "photo"]);
      saveStateNow();
      await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");

      // Ce que fait le rechargement : l'appareil repart avec un état VIDE, une
      // session valide, et `onboarded` posé par `boot()`.
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      state.onboarded = true;

      // ② la lecture du compte a ÉCHOUÉ — on ne la simule pas, on constate
      // simplement qu'elle n'a pas eu lieu : le drapeau posé par l'adoption est
      // toujours là.
      const exigence = localStorage.getItem("passio_restauration_requise");

      // ④ toute écriture d'état, par les DEUX chemins.
      saveState(); saveStateNow();
      await supaSaveUserState();
      supaSaveUserStateBeacon();

      return { exigence, peut: _peutPousserEtat(),
               posts: window.__postsUserState.map(function (p) { return p.body; }) };
    });

    expect(r.exigence).toBe(UID_COMPTE);   // l'exigence a survécu à la purge
    expect(r.peut).toBe(false);
    expect(r.posts).toEqual([]);           // ⚠️ le compte n'est PAS écrasé
  });

  test("une fois le compte relu, l'appareil réécrit normalement", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    const r = await page.evaluate(async () => {
      await adopterCompteConnecte("11111111-2222-4333-8444-555555555555");
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      const bloqueAvant = !_peutPousserEtat();
      // Ce que fait `supaLoadUserState` dès qu'un verdict serveur est rendu —
      // y compris « ce compte n'a pas encore de ligne », qui est une réponse.
      localStorage.removeItem("passio_restauration_requise");
      return { bloqueAvant, peutApres: _peutPousserEtat() };
    });
    expect(r.bloqueAvant).toBe(true);
    expect(r.peutApres).toBe(true);   // sinon un compte neuf ne pourrait plus jamais écrire
  });

  // Le parcours « mot de passe oublié » : l'adoption y est volontairement
  // différée (recharger détruirait un lien à usage unique), donc c'est la
  // seconde condition qui protège le compte — l'état local appartient encore à
  // quelqu'un d'autre, il ne doit pas partir.
  test("état d'un AUTRE compte : rien ne part, même sans purge", async ({ page }) => {
    // La page s'ouvre en portant l'état d'un autre compte — c'est l'instantané
    // qui fait foi, donc il se pose AVANT la navigation.
    await page.addInitScript(() => {
      localStorage.setItem("passio_uid", "99999999-8888-4777-8666-555555555555");
    });
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);
    const r = await page.evaluate(async () => {
      setFeedPassions(["moto", "photo"]);
      state.onboarded = true;
      saveStateNow();
      // Une session d'un AUTRE compte est arrivée sans passer par l'adoption.
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      const peut = _peutPousserEtat();
      await supaSaveUserState();
      supaSaveUserStateBeacon();
      return { peut, posts: window.__postsUserState.map(function (p) { return p.body; }) };
    });
    expect(r.peut).toBe(false);
    expect(r.posts).toEqual([]);
  });

  // Le parcours « mot de passe oublié » : l'adoption y est volontairement
  // différée (recharger détruirait un lien à usage unique), donc c'est `boot()`
  // qui arme l'exigence — sinon `supaLoadUserState`, jugeant le local plus
  // récent, pousserait l'état du propriétaire précédent dans le compte récupéré.
  test("récupération de mot de passe : l'exigence armée par boot() bloque toute écriture", async ({ page }) => {
    await bootVisiteur(page, { prefs: prefsInvite });
    await poserSondeUserState(page);
    const r = await page.evaluate(async () => {
      setFeedPassions(["moto", "photo"]);
      state.onboarded = true;
      saveStateNow();
      MY_UID = "11111111-2222-4333-8444-555555555555";
      window.MY_UID = MY_UID;
      const avant = _peutPousserEtat();          // propriétaire inconnu : permissif
      // Ce que fait `boot()` quand le fragment porte `type=recovery`.
      _exigerRestaurationAvantEcriture(MY_UID);
      const apres = _peutPousserEtat();
      await supaSaveUserState();
      supaSaveUserStateBeacon();
      return { avant, apres, posts: window.__postsUserState.map(function (p) { return p.body; }) };
    });
    expect(r.avant).toBe(true);    // sans l'armement, l'état partait : c'était le défaut
    expect(r.apres).toBe(false);
    expect(r.posts).toEqual([]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LE CÂBLAGE, PAS SEULEMENT LA FONCTION  (2026-09-02)
  //
  // ⚠️ CONSTAT BLOQUANT DE LA REVUE, ET IL EXPLIQUE COMMENT LE PREMIER DÉFAUT
  // AVAIT SURVÉCU : les douze cas ci-dessus appellent `adopterCompteConnecte`
  // DIRECTEMENT. Aucun ne fait passer un parcours par `onbDoAuth` — or c'est
  // exactement le chemin rapporté (« J'ai déjà un compte » → `ouvrirAuth("signin")`
  // → `onbDoAuth`). Mutation mesurée par la revue : supprimer le bloc
  // `if (_authMode === "signin" && await adopterCompteConnecte(...))` laissait
  // `npm run verif` ET les 897 suites locales VERTES, avec le défaut d'origine
  // intact. Un correctif dont on peut retirer le branchement sans un seul rouge
  // n'est pas verrouillé.
  //
  // On double donc `signInWithPassword` et `location.reload`, et on pilote le
  // VRAI `onbDoAuth`.
  // ══════════════════════════════════════════════════════════════════════════
  test("onbDoAuth branche `signin` : le câblage purge et recharge pour de vrai", async ({ page }) => {
    // ⚠️ ON NE DOUBLE PAS `location.reload`, ON LE LAISSE FAIRE. Chromium refuse
    // de le redéfinir (`Execution context was destroyed`), et surtout le
    // rechargement EST le chemin réel : c'est lui qui déclenche `pagehide`, donc
    // le beacon, donc le défaut d'origine. On observe depuis l'EXTÉRIEUR de la
    // page — la sonde réseau de Playwright survit à la navigation, contrairement
    // à une sonde posée sur `window.fetch`.
    const envois = [];
    page.on("request", (req) => {
      if (req.url().indexOf("/rest/v1/user_state") !== -1 && req.method() === "POST") {
        envois.push(req.postData() || "");
      }
    });

    await bootVisiteur(page, { prefs: prefsInvite });

    const avait = await page.evaluate(() => {
      setFeedPassions(["moto", "photo", "cuisine"]);
      saveStateNow();
      return (localStorage.getItem("passio_mvp_state_v1") || "").indexOf("moto") !== -1;
    });
    expect(avait).toBe(true);          // prémisse vérifiée, jamais supposée

    // Le formulaire tel que `ouvrirAuth("signin")` le laisse, puis le VRAI
    // `onbDoAuth`. La navigation détruit le contexte au milieu de l'appel : on
    // l'attend au lieu de la subir.
    await page.evaluate(() => {
      document.getElementById("authEmail").value = "compte@exemple.test";
      document.getElementById("authPassword").value = "motdepasse";
      _authMode = "signin";
      // ⚠️ Le handler `onAuthStateChange` écrit `passio_uid` PENDANT cet appel
      // dans la vraie vie — supabase-js notifie ses abonnés avant de résoudre.
      // On reproduit la course : c'est elle qui avait désarmé la garde.
      supa.auth.signInWithPassword = async function () {
        localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");
        return { data: { session: { user: { id: "11111111-2222-4333-8444-555555555555" } } }, error: null };
      };
    });
    await Promise.all([
      page.waitForLoadState("load"),
      page.evaluate(() => { onbDoAuth(); }).catch(() => {}),
    ]);
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => ({
      etat: localStorage.getItem("passio_mvp_state_v1"),
      uid: localStorage.getItem("passio_uid"),
      exigence: localStorage.getItem("passio_restauration_requise"),
    }));

    // ⚠️ LE POINT CENTRAL : l'état de l'exploration a disparu de l'appareil, et
    // RIEN n'est parti sous l'identité du compte — beacon de `pagehide` compris.
    expect(r.etat === null || r.etat.indexOf("moto") === -1).toBe(true);
    expect(r.uid).toBe(UID_COMPTE);
    expect(r.exigence).toBe(UID_COMPTE);   // écriture interdite jusqu'à relecture
    expect(envois.filter((b) => b && b.indexOf("moto") !== -1)).toEqual([]);
  });

  // La contrepartie sur le même câblage : une INSCRIPTION qui rend une session
  // ne purge pas — elle DÉCLARE la propriété, sinon l'onboarding en cours
  // (âge, prénom) serait jeté au milieu de la saisie.
  test("onbDoAuth branche `signup` : le câblage déclare la propriété sans purger", async ({ page }) => {
    await bootVisiteur(page);
    const r = await page.evaluate(async () => {
      state.user.name = "Prénom saisi pendant l'onboarding";
      saveStateNow();
      document.getElementById("authEmail").value = "neuf@exemple.test";
      document.getElementById("authPassword").value = "motdepasse";
      const c = document.getElementById("authPasswordConfirm");
      if (c) c.value = "motdepasse";
      const t = document.getElementById("authPhone");
      if (t) t.value = "0612345678";
      _authMode = "signup";

      window.__marqueurAvantAuth = "vivant";   // disparaîtrait à un rechargement
      supa.auth.signUp = async function () {
        return { data: { user: { identities: [{}] }, session: { user: { id: "11111111-2222-4333-8444-555555555555" } } }, error: null };
      };

      await onbDoAuth();
      await new Promise((r2) => setTimeout(r2, 300));
      const brut = localStorage.getItem("passio_mvp_state_v1") || "";
      return { vivant: window.__marqueurAvantAuth === "vivant",
               garde: brut.indexOf("pendant l'onboarding") !== -1,
               uid: localStorage.getItem("passio_uid") };
    });
    expect(r.vivant).toBe(true);      // l'inscription CONTINUE, elle ne recharge pas
    expect(r.garde).toBe(true);       // et ce que la personne vient de saisir survit
    expect(r.uid).toBe(UID_COMPTE);
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
