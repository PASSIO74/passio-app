// ══════════════════════════════════════════════════════════════════════════
// SE CONNECTER À UN COMPTE DÉJÀ CRÉÉ  (2026-09-02)
//
// Défaut vécu : le parcours de première visite fait entrer un appareil SANS
// compte directement dans le fil — donc sans landing, donc sans formulaire de
// connexion. Le seul chemin vers ce formulaire était le gate d'action
// engageante (« J'ai déjà un compte »), qui suppose d'avoir d'abord tenté un
// like ou un commentaire. Et la déconnexion n'était pas une sortie de secours :
// elle efface l'état du compte, donc le rechargement retombait dans le parcours
// invité, sans jamais montrer l'écran demandé.
//
// Trois portes doivent exister, et ce fichier les tient :
//   ① la carte de bienvenue du fil invité,
//   ② l'entrée « Compte » des Paramètres (libellé adapté à l'état réel),
//   ③ toute déconnexion volontaire, qui ouvre la connexion après rechargement.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");
const { bootVisiteur, couperReseauSupabase, etatOnboarde, GATE_TOKEN, GATE_KEY } = require("./first-run-helper");

const CLE_INTENTION = "passio_auth_intent_v1";

// Démarre sur un COMPTE EXISTANT (état onboardé local, aucune session Supabase).
// ⚠️ L'état n'est injecté qu'au PREMIER chargement : le sujet du test est
// justement ce qui reste après une déconnexion, et `addInitScript` rejoue à
// chaque navigation — le réinjecter ressusciterait le compte qu'on vient de
// purger, et le cas ne mesurerait plus rien.
async function bootCompteExistant(page) {
  await couperReseauSupabase(page);
  await page.addInitScript(
    ([k, t, st]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      if (!sessionStorage.getItem("__cce_etat_pose")) {
        sessionStorage.setItem("__cce_etat_pose", "1");
        localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      }
    },
    [GATE_KEY, GATE_TOKEN, etatOnboarde()]
  );
  // ⚠️ ISOLATION DES DONNÉES DISTANTES — POSÉE ICI PARCE QUE CETTE SUITE
  // NAVIGUE ELLE-MÊME. `bootOnboarded` la pose par défaut, mais sa portée est
  // L'APPEL, pas le fichier : un `page.goto` maison garde son chemin exposé, et
  // le verdict du test dépend alors du CONTENU DE LA PRODUCTION. C'est ce qui a
  // rendu `main` rouge six fois en quatre jours et fait sauter autant de
  // déploiements. Verrou mécanique : `scripts/audit-tests-isolation.js`.
  await sansDonneesDistantes(page);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof window.doLogout === "function", null, { timeout: 20000 });
  await page.waitForTimeout(3200);
  // Prémisse VÉRIFIÉE, jamais supposée — même exigence que `first-run-helper` :
  // si un VRAI client Supabase s'était construit, ces cas mesureraient la
  // production au lieu du programme.
  const reel = await page.evaluate(() => window._supaReal);
  if (reel) throw new Error("prémisse cassée : un VRAI client Supabase s'est construit");
}

// Ouvre le panneau Paramètres et déplie la section « Compte ».
async function ouvrirSectionCompte(page) {
  await page.evaluate(() => toggleDevPanel());
  await page.locator("#devPanel .settings-section").first().click();
  await expect(page.locator("#settingsAuthSwitch")).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────
// ① LA CARTE DE BIENVENUE
// ─────────────────────────────────────────────────────────────────────────
test.describe("Carte de bienvenue", () => {
  test("propose une connexion au compte déjà créé, sans geste préalable", async ({ page }) => {
    await bootVisiteur(page);
    const lien = page.locator("#frWelcome .fr-welcome-signin");
    await expect(lien).toBeVisible();
    // Cible tactile : c'est une action essentielle, pas une mention légale.
    const h = await lien.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);

    await lien.click();
    await page.waitForTimeout(400);
    // Le formulaire EXISTANT s'ouvre, sur son onglet « Se connecter ».
    await expect(page.locator("#onboarding.active")).toHaveCount(1);
    await expect(page.locator('.onb-step.active[data-onb-step="splash"]')).toHaveCount(1);
    await expect(page.locator("#authTabSignin.active")).toHaveCount(1);
    await expect(page.locator("#authSubmitBtn")).toHaveText("Se connecter");
    // Et la porte de retour existe : l'onboarding est un écran plein.
    await expect(page.locator("#frBackToExplore")).toBeVisible();
  });

  test("« Continuer à explorer » ramène au fil, sans compte créé", async ({ page }) => {
    await bootVisiteur(page);
    await page.locator("#frWelcome .fr-welcome-signin").click();
    await page.waitForTimeout(300);
    await page.locator("#frBackToExplore").click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
    expect(await page.evaluate(() => PassioFirstRun.estVisiteur())).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ② L'ENTRÉE « COMPTE » DES PARAMÈTRES
// ─────────────────────────────────────────────────────────────────────────
test.describe("Paramètres → Compte", () => {
  test("un visiteur y lit « J'ai déjà un compte » — et pas « Se déconnecter »", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    await ouvrirSectionCompte(page);

    await expect(page.locator("#settingsAuthSwitch")).toHaveText("J'ai déjà un compte — me connecter");
    // Rien à déconnecter : proposer la sortie enverrait sur une purge sans effet.
    // Et tout ce qui suppose un compte part avec — sinon « Changer mon mot de
    // passe » appellerait `supa.auth.updateUser` sans session, et « Supprimer
    // mon compte » proposerait d'effacer ce qui n'existe pas.
    await expect(page.locator("#settingsLogout")).toBeHidden();
    await expect(page.locator("#settingsChangePassword")).toBeHidden();
    await expect(page.locator("#settingsDeleteAccount")).toBeHidden();

    await page.locator("#settingsAuthSwitch").click();
    await page.waitForTimeout(500);
    await expect(page.locator("#onboarding.active")).toHaveCount(1);
    await expect(page.locator("#authTabSignin.active")).toHaveCount(1);
    await expect(page.locator("#devPanel.active")).toHaveCount(0);
  });

  test("un compte connecté y lit « Se connecter avec un autre compte »", async ({ page }) => {
    await bootCompteExistant(page);
    // ⚠️ ON EMPOISONNE LE PANNEAU AVANT DE L'OUVRIR, sinon ce cas ne mesure
    // RIEN : le libellé attendu pour un compte connecté est exactement celui du
    // balisage statique d'`index.html`, donc l'assertion resterait verte avec
    // `majSectionCompte` neutralisée. En partant d'un libellé faux et d'une
    // sortie masquée, seule l'exécution réelle de la fonction peut les rétablir.
    await page.evaluate(() => {
      document.getElementById("settingsAuthSwitch").textContent = "…";
      document.getElementById("settingsLogout").style.display = "none";
    });
    await ouvrirSectionCompte(page);

    await expect(page.locator("#settingsAuthSwitch")).toHaveText("Se connecter avec un autre compte");
    await expect(page.locator("#settingsLogout")).toBeVisible();

    await page.locator("#settingsAuthSwitch").click();
    await page.waitForTimeout(400);
    // Changer de compte déconnecte : on l'annonce avant de le faire.
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Se connecter avec un autre compte");
    expect(await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("#modalContent .btn"))
        .map((x) => x.getAttribute("onclick") || "").join(" ");
      return /doLogout\(\s*'signin'\s*\)/.test(b);
    })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ③ LA DÉCONNEXION MÈNE À LA CONNEXION
// ─────────────────────────────────────────────────────────────────────────
test.describe("Déconnexion", () => {
  test("l'intention de reconnexion SURVIT à la purge des clés de compte", async ({ page }) => {
    await bootCompteExistant(page);
    // ⚠️ On lit la clé AVANT le `location.reload()` différé de doLogout : ce
    // qu'on mesure ici, c'est l'ORDRE (intention posée après la purge), pas le
    // rechargement — qui est vérifié par le cas suivant.
    const pose = await page.evaluate(async () => {
      await window.doLogout("signin");
      let intention = null;
      try { intention = JSON.parse(localStorage.getItem("passio_auth_intent_v1")); } catch (e) {}
      return {
        intention,
        etat: localStorage.getItem("passio_mvp_state_v1"),
        uid: localStorage.getItem("passio_uid"),
      };
    });
    expect(pose.intention && pose.intention.mode).toBe("signin");
    // Horodatée : une intention oubliée sur l'appareil (application fermée entre
    // la pose et le rechargement) doit se périmer, jamais s'appliquer un jour plus tard.
    expect(typeof (pose.intention || {}).t).toBe("number");
    // La purge a bien eu lieu : l'intention n'a pas été emportée avec elle.
    expect(pose.etat).toBeNull();
    expect(pose.uid).toBeNull();
  });

  test("après la déconnexion, l'écran de connexion s'ouvre — pas le fil invité", async ({ page }) => {
    await bootCompteExistant(page);
    await page.evaluate(() => { window.doLogout("signin"); });
    // doLogout : drain télémétrie (≤ 2,8 s) + purge + rechargement différé de
    // 1,2 s. On attend l'ÉCRAN, jamais une durée : `waitForSelector` traverse la
    // navigation, un `waitForTimeout` calibré à la main serait un flake de plus.
    await page.waitForSelector("#onboarding.active", { timeout: 30000 });
    await page.waitForSelector("#authTabSignin.active", { timeout: 10000 });
    await expect(page.locator("#landing.active")).toHaveCount(0);
    await expect(page.locator("#authSubmitBtn")).toHaveText("Se connecter");
    // L'intention ne sert QU'UNE FOIS : la garder rouvrirait le formulaire à
    // chaque rechargement, longtemps après la reconnexion.
    expect(await page.evaluate(() => localStorage.getItem("passio_auth_intent_v1"))).toBeNull();
  });

  test("l'intention consommée ne rouvre pas la connexion au rechargement suivant", async ({ page }) => {
    test.setTimeout(90000);
    await bootCompteExistant(page);
    await page.evaluate(() => { window.doLogout("signin"); });
    await page.waitForSelector("#onboarding.active", { timeout: 30000 });

    await page.reload();
    await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined", null, { timeout: 20000 });
    await page.waitForTimeout(3200);
    // L'appareil n'a plus de compte : c'est le parcours invité qui reprend, et
    // le formulaire ne s'impose plus.
    expect(await page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
  });

  test("« Continuer à explorer » depuis cet écran rend un fil INVITÉ complet", async ({ page }) => {
    test.setTimeout(90000);
    await bootCompteExistant(page);
    await page.evaluate(() => { window.doLogout("signin"); });
    await page.waitForSelector("#onboarding.active", { timeout: 30000 });

    await page.locator("#frBackToExplore").click();
    await page.waitForTimeout(1500);
    // ⚠️ CE N'EST PAS UN SIMPLE `goTo("feed")` QU'ON MESURE ICI. Ouvrir le
    // formulaire SANS avoir laissé `entreeDirecte()` construire le mode invité
    // laissait un fil à moitié bâti : pas de classe racine, donc `.fr-only`
    // masquait « Mes passions » et « Revoir les repères » dans les Paramètres,
    // et aucun contenu public n'était chargé. Aucune erreur JS ne l'aurait dit.
    expect(await page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains("passio-first-run"))).toBe(true);
    expect(await page.evaluate(() => PassioFirstRun.estVisiteur())).toBe(true);
    await expect(page.locator("#onboarding.active")).toHaveCount(0);

    await page.evaluate(() => toggleDevPanel());
    await page.locator("#devPanel .settings-section").nth(1).click(); // Personnalisation
    await expect(page.locator("#devPanel .fr-only").first()).toBeVisible();
  });

  test("drapeau coupé : la landing historique reprend la main, pas l'écran d'auth", async ({ page }) => {
    await couperReseauSupabase(page);
    await page.addInitScript(
      ([k, t, st]) => {
        sessionStorage.setItem(k, t);
        sessionStorage.setItem("passio_pwa_dismissed", "1");
        localStorage.setItem("passio_first_run_experience_v1", "0"); // COUPURE
        if (!sessionStorage.getItem("__cce_etat_pose")) {
          sessionStorage.setItem("__cce_etat_pose", "1");
          localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
          localStorage.setItem("passio_auth_intent_v1", JSON.stringify({ mode: "signin", t: Date.now() }));
        }
      },
      [GATE_KEY, GATE_TOKEN, etatOnboarde()]
    );
    await sansDonneesDistantes(page);
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined", null, { timeout: 20000 });
    await page.waitForTimeout(3200);
    // La landing porte déjà « Se connecter » : rien à défaire, et la coupure
    // promet le parcours historique « à l'octet près ».
    await expect(page.locator("#landing.active")).toHaveCount(1);
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
    // L'intention est consommée quand même : elle ne doit pas s'appliquer plus tard.
    expect(await page.evaluate(() => localStorage.getItem("passio_auth_intent_v1"))).toBeNull();
  });

  test("une intention PÉRIMÉE est ignorée : le fil invité, pas un mur de connexion", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    await page.evaluate(() => {
      // Intention oubliée sur l'appareil il y a une heure (application fermée
      // entre la pose et le rechargement).
      localStorage.setItem("passio_auth_intent_v1", JSON.stringify({ mode: "signin", t: Date.now() - 3600000 }));
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined", null, { timeout: 20000 });
    await page.waitForTimeout(3200);
    expect(await page.evaluate(() => document.getElementById("screen-feed").classList.contains("active"))).toBe(true);
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("passio_auth_intent_v1"))).toBeNull();
  });

  test("doLogout() SANS argument ne pose aucune intention", async ({ page }) => {
    await bootCompteExistant(page);
    // L'intention suit le paramètre : un appelant futur non volontaire (session
    // expirée, suppression de compte) ne doit pas hériter de l'écran de connexion.
    const intention = await page.evaluate(async () => {
      await window.doLogout();
      return localStorage.getItem("passio_auth_intent_v1");
    });
    expect(intention).toBeNull();
  });

  test("un signOut qui ÉCHOUE ne laisse pas la session ouverte pour autant", async ({ page }) => {
    await bootCompteExistant(page);
    // ⚠️ LE SDK NE LÈVE PAS SUR UN REFUS : il rend `{ error }`. Une déconnexion
    // hors ligne passait donc pour réussie, le jeton restait sur l'appareil, et
    // le démarrage suivant rouvrait le compte quitté — cache local déjà purgé.
    const apres = await page.evaluate(async () => {
      localStorage.setItem("sb-njkiyoklssvefstljemx-auth-token", JSON.stringify({ access_token: "faux" }));
      window.supa.auth.signOut = async () => ({ error: { message: "offline" } });
      await window.doLogout("signin");
      return Object.keys(localStorage).filter((k) => /^sb-.+-auth-token$/.test(k));
    });
    expect(apres).toEqual([]);
  });

  test("purgerJetonAuthLocal ne touche QUE les jetons du SDK", async ({ page }) => {
    await bootCompteExistant(page);
    const bilan = await page.evaluate(() => {
      localStorage.setItem("sb-projetA-auth-token", "1");
      localStorage.setItem("sb-projetB-auth-token", "2");
      localStorage.setItem("passio_device_id", "garde-moi");
      localStorage.setItem("passio_parental_code", "garde-moi-aussi");
      const n = window.purgerJetonAuthLocal();
      return {
        n,
        jetons: Object.keys(localStorage).filter((k) => /^sb-.+-auth-token$/.test(k)),
        device: localStorage.getItem("passio_device_id"),
        parental: localStorage.getItem("passio_parental_code"),
      };
    });
    expect(bilan.n).toBeGreaterThanOrEqual(2);
    expect(bilan.jetons).toEqual([]);
    // Les clés d'APPAREIL ne sont pas des sessions : le contrôle parental posé
    // par un parent ne doit jamais partir avec une déconnexion.
    expect(bilan.device).toBe("garde-moi");
    expect(bilan.parental).toBe("garde-moi-aussi");
  });

  test("le bouton « Se déconnecter » des Paramètres passe bien par la confirmation", async ({ page }) => {
    await bootCompteExistant(page);
    await ouvrirSectionCompte(page);
    // ⚠️ ON SUIT LA PORTE JUSQU'AU BOUT. S'arrêter à la modale laisserait
    // passer un bouton qui appelle `doLogout()` sans argument : la confirmation
    // s'afficherait, la déconnexion aurait lieu, et l'écran de connexion promis
    // ne s'ouvrirait jamais — le défaut d'origine, à un argument près.
    await page.evaluate(() => {
      window.__logoutArgs = null;
      const vrai = window.doLogout;
      window.doLogout = function () { window.__logoutArgs = Array.from(arguments); return Promise.resolve(); };
      window.doLogout.__vrai = vrai;
    });
    await page.locator("#settingsLogout").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Se déconnecter");
    expect(await page.evaluate(() => localStorage.getItem("passio_auth_intent_v1"))).toBeNull();

    await page.locator("#modalBackdrop.active .btn.primary").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__logoutArgs)).toEqual(["signin"]);
  });

  test("« Changer de compte » va lui aussi jusqu'à doLogout('signin')", async ({ page }) => {
    await bootCompteExistant(page);
    await ouvrirSectionCompte(page);
    await page.evaluate(() => {
      window.__logoutArgs = null;
      window.doLogout = function () { window.__logoutArgs = Array.from(arguments); return Promise.resolve(); };
    });
    await page.locator("#settingsAuthSwitch").click();
    await page.waitForTimeout(400);
    await page.locator("#modalBackdrop.active .btn.primary").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__logoutArgs)).toEqual(["signin"]);
  });
});
