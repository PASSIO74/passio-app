// Suite « Aides contextuelles » — spec §8 du lot Onboarding → premier moment de
// valeur.
//
// Le §8 remplace le tour long (fermé par ailleurs) par des aides contextuelles,
// mais sous des conditions strictes. Ce ne sont pas des détails de confort :
// ce sont exactement ce qui sépare une aide d'un tour déguisé.
//
//   ① UNE SEULE à la fois — « Maximum une aide à la fois » ;
//   ② dismissible ;
//   ③ « Aucun carrousel de sept écrans avant de pouvoir utiliser PASSIO » :
//      jamais modale, jamais bloquante, jamais remontrée.
//
// La suite vérifie surtout les INTERDITS. Qu'une bulle s'affiche est facile ;
// qu'elle ne revienne jamais, ne s'empile pas et ne bloque rien est ce qui
// pourrait se casser sans qu'on le voie.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansPublicationsDistantes } = require("./app-helper");

async function boot(page, etat) {
  // ⚠️ Helper maison avec son propre `goto` : l'isolation par défaut de
  // `bootOnboarded` ne s'applique pas ici. Cette suite lit
  // `#feedList .post .post-author`, c'est-à-dire la PREMIÈRE carte du fil —
  // exactement la forme de l'incident du 2026-09-02 (run 2413), où une vraie
  // publication de production tenait la place attendue.
  await sansPublicationsDistantes(page);
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.PASSIO_ONBOARDING_V2 = true;
    // addInitScript se rejoue à chaque navigation : sans jeton, un reload
    // réécrirait l'état par-dessus ce que l'app vient d'enregistrer.
    if (st && !sessionStorage.getItem("__etat_injecte")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
      sessionStorage.setItem("__etat_injecte", "1");
    }
  }, [GATE_KEY, GATE_TOKEN, etat || null]);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof montrerHint === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
  });
}

async function inscrire(page, passion) {
  await page.evaluate((pa) => {
    state.user.name = "Testeur";
    state.user.birthYear = 1990;
    selectedPassions.length = 0;
    selectedPassions.push(pa);
    onbFinish();
  }, passion);
}

const bulles = (page) => page.locator(".passio-hint");

test("§8 — la première carte du Fil explique comment ouvrir une Passio", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);
  await expect(bulles(page)).toHaveAttribute("data-hint", "feed_auteur");
  await expect(bulles(page)).toContainText("Appuie sur l'auteur");
});

test("§8 — une aide est dismissible, et ne revient jamais", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);

  await page.click(".passio-hint .passio-hint-ok");
  await expect(bulles(page)).toHaveCount(0);

  // Re-rendre le fil ne doit pas la ressusciter.
  await page.evaluate(() => { window._feedDomSig = null; renderFeed(); });
  await page.waitForTimeout(900);
  await expect(bulles(page)).toHaveCount(0);

  // Ni un rechargement complet.
  await page.reload();
  await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await expect(bulles(page)).toHaveCount(0);
});

test("§8 — jamais deux aides à l'écran", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);   // feed_auteur est affichée

  // ⚠️ L'ancre doit être VISIBLE, sinon montrerHint refuse pour cette raison-là
  // et le test passe sans jamais éprouver « une seule à la fois ». Première
  // version de ce test : elle visait #nouveauProfilLien, sur un écran masqué —
  // la mutation qui retirait la garde restait verte.
  const r = await page.evaluate(() => {
    const ancre = document.querySelector("#feedList .post .post-author");
    return {
      ancreVisible: !!(ancre && ancre.offsetParent),
      rendu: montrerHint("second_profil", ancre),
      bulles: document.querySelectorAll(".passio-hint").length,
      vue: !!(state.hintsVus && state.hintsVus.second_profil),
    };
  });
  expect(r.ancreVisible).toBe(true);   // prémisse : le refus ne vient pas de là
  expect(r.rendu).toBe(false);
  expect(r.bulles).toBe(1);
  // Refusée ⇒ non marquée vue : elle doit pouvoir s'afficher plus tard.
  expect(r.vue).toBeFalsy();
});

// La garde « déjà vue » est doublée : renderFeed ne rappelle même pas
// montrerHint pour feed_auteur. Ce doublon est volontaire, mais il MASQUE la
// garde interne dans un test de bout en bout — la mutation qui la retirait
// restait verte. On l'éprouve donc directement, sur une aide dont le point
// d'appel n'a pas de pré-garde.
test("§8 — montrerHint refuse lui-même une aide déjà vue", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await page.click(".passio-hint .passio-hint-ok");
  await expect(bulles(page)).toHaveCount(0);

  const r = await page.evaluate(() => {
    const ancre = document.querySelector("#feedList .post .post-author");
    return {
      marqueeVue: !!(state.hintsVus && state.hintsVus.feed_auteur),
      ancreVisible: !!(ancre && ancre.offsetParent),
      rendu: montrerHint("feed_auteur", ancre),
      bulles: document.querySelectorAll(".passio-hint").length,
    };
  });
  expect(r.marqueeVue).toBe(true);     // marquée à l'AFFICHAGE, pas au rejet
  expect(r.ancreVisible).toBe(true);   // prémisse
  expect(r.rendu).toBe(false);
  expect(r.bulles).toBe(0);
});

test("§8 — une aide ne bloque rien : pas de modale, pas de voile", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);

  const r = await page.evaluate(() => {
    const b = document.querySelector(".passio-hint");
    const st = getComputedStyle(b);
    const r0 = b.getBoundingClientRect();
    // Le point juste SOUS la bulle doit rester atteignable : rien ne recouvre
    // l'écran.
    const dessous = document.elementFromPoint(
      Math.min(window.innerWidth - 5, r0.left + r0.width / 2),
      Math.min(window.innerHeight - 5, r0.bottom + 40)
    );
    return {
      modaleOuverte: !!document.querySelector("#modalBackdrop.active"),
      position: st.position,
      couvreTout: r0.width >= window.innerWidth && r0.height >= window.innerHeight,
      dessousEstLaBulle: !!(dessous && dessous.closest(".passio-hint")),
      largeurTenue: r0.right <= window.innerWidth + 1 && r0.left >= 0,
    };
  });
  expect(r.modaleOuverte).toBe(false);
  expect(r.position).toBe("fixed");
  expect(r.couvreTout).toBe(false);
  expect(r.dessousEstLaBulle).toBe(false);
  expect(r.largeurTenue).toBe(true);
});

test("§8 — changer d'écran retire l'aide au lieu de la laisser flotter", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);
  await page.evaluate(() => goTo("messages"));
  await expect(bulles(page)).toHaveCount(0);
});

test("§8 — l'aide « second profil » ne s'affiche que si l'utilisateur n'en a qu'un", async ({ page }) => {
  await boot(page, {
    onboarded: true, landingSeen: true, tourSeen: true,
    selectedFeedPassions: ["musique"], feedInterestsMigrated: true,
    // Deux profils : l'utilisateur sait déjà en créer, l'expliquer serait du bruit.
    hintsVus: { feed_auteur: true },
    userPosts: [],
    user: {
      name: "Deux", birthYear: 1990,
      profiles: [
        { id: "p1", name: "Deux", passion: "musique", emoji: "🎸" },
        { id: "p2", name: "Deux", passion: "photo", emoji: "📷" },
      ],
      currentProfileId: "p1",
    },
  });
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(900);
  await expect(bulles(page)).toHaveCount(0);
});

test("§8 — avec un seul profil, l'aide « second profil » s'affiche", async ({ page }) => {
  await boot(page, {
    onboarded: true, landingSeen: true, tourSeen: true,
    selectedFeedPassions: ["musique"], feedInterestsMigrated: true,
    hintsVus: { feed_auteur: true },
    userPosts: [],
    user: {
      name: "Seul", birthYear: 1990,
      profiles: [{ id: "p1", name: "Seul", passion: "musique", emoji: "🎸" }],
      currentProfileId: "p1",
    },
  });
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(900);
  await expect(bulles(page)).toHaveCount(1);
  await expect(bulles(page)).toHaveAttribute("data-hint", "second_profil");
});

test("§8 — le texte affiché est celui de HINTS, sans contenu utilisateur", async ({ page }) => {
  await boot(page);
  await inscrire(page, "musique");
  await expect(bulles(page)).toHaveCount(1);
  const r = await page.evaluate(() => ({
    attendu: HINTS.feed_auteur,
    affiche: document.querySelector(".passio-hint .passio-hint-texte").textContent,
    clefs: Object.keys(HINTS),
  }));
  expect(r.affiche).toBe(r.attendu);
  // #136 ayant rendu T&S serveur autoritaire, la quatrième aide est maintenant
  // disponible — mais son affichage reste conditionné au verdict RPC strict.
  expect(r.clefs.sort()).toEqual(["conversation_irl", "feed_auteur", "profil_visite", "second_profil"]);
});
