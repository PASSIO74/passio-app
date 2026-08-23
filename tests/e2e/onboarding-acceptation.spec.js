// Tests d'acceptation ONB du lot « Onboarding → premier moment de valeur »
// (docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md §13).
//
// La spec énumère onze critères. Ceux-ci étaient tenus par le code sans être
// verrouillés nulle part : ils reposaient sur la bonne volonté du prochain
// changement. Cette suite les transforme en non-régressions.
//
// NON COUVERTS ICI, et il faut le dire plutôt que le laisser croire :
//   · ONB-05 (cross-device via user_state) — exige deux vrais comptes Supabase ;
//     c'est le périmètre de la suite opt-in tests/e2e/multi-comptes.spec.js.
//   · ONB-09 (Google OAuth) — exige un fournisseur réel.
// ONB-04 (reload) est déjà couvert par onboarding-v2.spec.js.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

async function boot(page, { etat = null, espionnerGeoloc = false } = {}) {
  await page.addInitScript(([k, t, st, geo]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.PASSIO_ONBOARDING_V2 = true;
    // addInitScript se rejoue à chaque navigation : sans ce jeton, un reload
    // réécrirait l'état par-dessus ce que l'app vient d'enregistrer.
    if (st && !sessionStorage.getItem("__etat_injecte")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      sessionStorage.setItem("__etat_injecte", "1");
    }
    if (geo) {
      // Espionner AVANT le chargement des scripts : une demande de position
      // partie pendant le boot serait invisible d'un espion posé après.
      window.__geo = [];
      const g = navigator.geolocation;
      if (g) {
        ["getCurrentPosition", "watchPosition"].forEach((m) => {
          const vrai = g[m] && g[m].bind(g);
          g[m] = function () { window.__geo.push(m); return vrai ? vrai.apply(g, arguments) : undefined; };
        });
      }
    }
  }, [GATE_KEY, GATE_TOKEN, etat, espionnerGeoloc]);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof onbFinish === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
  });
}

async function inscrire(page, passions) {
  await page.evaluate((liste) => {
    state.user.name = "Testeur";
    state.user.birthYear = 1990;
    selectedPassions.length = 0;
    liste.forEach((p) => selectedPassions.push(p));
    onbFinish();
  }, passions);
}

const bilan = (page) => page.evaluate(() => ({
  interets: Array.from(_activeFeedPassions),
  profils: (state.user.profiles || []).map((p) => p.passion),
  profilCourant: (() => {
    const p = (state.user.profiles || []).find((x) => x.id === state.user.currentProfileId);
    return p ? p.passion : null;
  })(),
  feedActif: !!document.querySelector("#screen-feed.active"),
  cartes: document.querySelectorAll("#feedList .post").length,
  titreVide: (() => {
    const e = document.querySelector("#feedEmpty");
    if (!e || e.style.display === "none") return null;
    const t = e.querySelector(".empty-title");
    return t ? t.textContent : null;
  })(),
}));

test("ONB-01 — un compte neuf avec une passion arrive sur un Fil peuplé", async ({ page }) => {
  await boot(page);
  await inscrire(page, ["musique"]);
  const r = await bilan(page);
  expect(r.profils).toEqual(["musique"]);
  expect(r.interets).toEqual(["musique"]);
  expect(r.feedActif).toBe(true);
  expect(r.cartes).toBeGreaterThan(0);
  // « jamais Choisis une passion » (§13 ONB-01)
  expect(r.titreVide).toBeNull();
});

test("ONB-02 — trois passions : trois intérêts, UN profil, primaire identifié", async ({ page }) => {
  await boot(page);
  await inscrire(page, ["musique", "photo", "voyage"]);
  const r = await bilan(page);
  expect(r.interets).toEqual(["musique", "photo", "voyage"]);
  expect(r.profils).toEqual(["musique"]);
  expect(r.profilCourant).toBe("musique");
});

test("ONB-03 — sept passions possibles sans créer sept profils", async ({ page }) => {
  await boot(page);
  const sept = await page.evaluate(() => allPassions().slice(0, 7).map((p) => p.id));
  await inscrire(page, sept);
  const r = await bilan(page);
  expect(r.interets).toEqual(sept);
  expect(r.profils.length).toBe(1);
  expect(r.profils[0]).toBe(sept[0]);
});

test("ONB-06 — un compte historique à trois profils les garde tous", async ({ page }) => {
  await boot(page, {
    etat: {
      onboarded: true, landingSeen: true,
      user: {
        name: "Ancien", birthYear: 1990,
        profiles: [
          { id: "p1", name: "Ancien", passion: "musique", emoji: "🎸" },
          { id: "p2", name: "Ancien", passion: "photo", emoji: "📷" },
          { id: "p3", name: "Ancien", passion: "voyage", emoji: "🌍" },
        ],
        currentProfileId: "p2",
      },
    },
  });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    profils: (state.user.profiles || []).map((p) => p.passion),
    ids: (state.user.profiles || []).map((p) => p.id),
    courant: state.user.currentProfileId,
    interets: Array.from(_activeFeedPassions),
  }));
  // « Ne rien supprimer. Les profils existants restent valides. » (§12)
  expect(r.profils).toEqual(["musique", "photo", "voyage"]);
  expect(r.ids).toEqual(["p1", "p2", "p3"]);
  expect(r.courant).toBe("p2");
  // « la migration initialise les intérêts sans perte » (§13 ONB-06)
  expect(r.interets).toEqual(["musique", "photo", "voyage"]);
});

test("ONB-07 — moins de 13 ans : refus propre, avant d'entrer dans l'app", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const avantEtape = onbStepIdx;
    document.querySelector("#birthYear").value = String(new Date().getFullYear() - 10);
    onbValidateAge();
    return {
      avantEtape,
      apresEtape: onbStepIdx,
      birthYear: state.user.birthYear,
      onboarded: state.onboarded,
      // ⚠️ `#screen-feed` porte déjà .active au chargement, SOUS la landing :
      // ce n'est donc pas le témoin de « l'utilisateur est entré dans l'app ».
      // Le bon témoin est la landing, qui recouvre tout tant qu'il n'est pas entré.
      landingActive: !!document.querySelector("#landing.active"),
    };
  });
  expect(r.apresEtape).toBe(r.avantEtape);   // l'onboarding n'avance pas
  expect(r.birthYear).toBeFalsy();           // rien n'est enregistré
  expect(r.onboarded).toBeFalsy();
  expect(r.landingActive).toBe(true);        // il n'est pas entré
});

test("ONB-08 — 13 à 17 ans : compte marqué mineur ; 18 et plus : non", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const an = new Date().getFullYear();
    const essai = (age) => {
      state.user.isMinor = undefined;
      state.user.birthYear = null;
      onbStepIdx = onbSteps.indexOf("age");
      document.querySelector("#birthYear").value = String(an - age);
      onbValidateAge();
      return { age, mineur: state.user.isMinor, enregistre: state.user.birthYear === an - age };
    };
    return [essai(13), essai(17), essai(18), essai(40)];
  });
  expect(r[0]).toEqual({ age: 13, mineur: true, enregistre: true });
  expect(r[1]).toEqual({ age: 17, mineur: true, enregistre: true });
  expect(r[2]).toEqual({ age: 18, mineur: false, enregistre: true });
  expect(r[3]).toEqual({ age: 40, mineur: false, enregistre: true });
});

// ONB-10 se lit en deux moitiés. « L'onboarding n'est pas rejoué » est
// vérifiable ici. « Connexion → Feed direct » ne l'est pas : boot() termine par
// showLanding() dès qu'aucune session Supabase n'est retrouvée — comportement
// correct, et non le défaut que ce critère surveille. Cette moitié-là relève de
// la suite opt-in multi-comptes, qui dispose de vrais comptes.
test("ONB-10 — un compte existant ne rejoue pas l'onboarding et retrouve ses intérêts", async ({ page }) => {
  await boot(page, {
    etat: {
      onboarded: true, landingSeen: true,
      // Un compte de RETOUR a déjà vu le tour. Sans ce drapeau, launchTourSafe
      // part au boot et showTour change l'écran actif (mesuré : l'app se
      // retrouvait sur « profiles ») — le test mesurerait le tour, pas le
      // parcours de reconnexion qu'il prétend vérifier.
      tourSeen: true,
      selectedFeedPassions: ["musique"], feedInterestsMigrated: true,
      user: {
        name: "Habitué", birthYear: 1990,
        profiles: [{ id: "p1", name: "Habitué", passion: "musique", emoji: "🎸" }],
        currentProfileId: "p1",
      },
    },
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    onbActif: !!document.querySelector("#onboarding.active"),
    etapeOnb: onbStepIdx,
    onboarded: state.onboarded,
    interets: Array.from(_activeFeedPassions),
    profils: (state.user.profiles || []).length,
  }));
  expect(r.onbActif).toBe(false);   // l'onboarding n'est pas réaffiché
  expect(r.etapeOnb).toBe(0);       // ni redémarré
  expect(r.onboarded).toBe(true);
  expect(r.interets).toEqual(["musique"]);
  expect(r.profils).toBe(1);        // aucun profil re-créé au passage
});

test("ONB-11 — aucune permission de localisation demandée pendant l'onboarding", async ({ page }) => {
  await boot(page, { espionnerGeoloc: true });
  // Parcours complet : âge → prénom → passions → entrée.
  await page.evaluate(() => {
    onbStepIdx = onbSteps.indexOf("age");
    document.querySelector("#birthYear").value = "1990";
    onbValidateAge();
    document.querySelector("#userName").value = "Testeur";
    onbValidateName();
    togglePassion("musique");
    onbFinish();
  });
  await page.waitForTimeout(2500);   // laisser passer tout appel différé
  const appels = await page.evaluate(() => window.__geo);
  expect(appels).toEqual([]);
});
