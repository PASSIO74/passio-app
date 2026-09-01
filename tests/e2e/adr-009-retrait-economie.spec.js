// ADR-009 — le Wallet, les points, les rangs, les quêtes et les Passia sont
// sortis du cœur produit. Cette suite verrouille le retrait sur les quatre
// points où il pouvait revenir sans qu'aucun autre test ne le voie :
//
//   ① la SURFACE — aucune destination, aucun solde, aucune promesse ;
//   ② le MOTEUR — les fonctions n'existent plus, et rien ne les appelle ;
//   ③ le 4ᵉ PROFIL — le défaut signalé : créer un profil au-delà de trois
//      ouvrait un paywall « 150 💎 » ; il doit être libre et gratuit ;
//   ④ l'ÉTAT LEGACY — un blob d'avant le retrait doit charger SANS lever et
//      SANS rien réafficher, et ne doit pas être re-propagé à la synchro.
//
// ⚠️ ④ ne peut pas passer par `bootOnboarded` : le helper pose un état
// canonique et refuse d'écraser un état existant. On écrit donc nous-mêmes le
// `localStorage` d'un ancien client AVANT la navigation.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { GATE_KEY, GATE_TOKEN } = require("./gate-helper");

// État tel que l'écrivait un client d'AVANT le retrait : score, solde Passia,
// likes reçus, Pass actif, journal de transactions, quêtes en cours, et un
// profil marqué « payé ».
const ETAT_LEGACY = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: {
    name: "Legacy QA", birthYear: 1990, isMinor: false,
    score: 1240, passia: 320, likesReceived: 47,
    activePass: { id: "pass_monthly", nextBillingAt: Date.now() + 30 * 86400000 },
    currentProfileId: "pp_0",
    profiles: [
      { id: "pp_0", name: "Legacy QA", passion: "musique", emoji: "🎵", bio: "b", color: "#7c3aed", createdAt: 1 },
      { id: "pp_1", name: "Legacy QA", passion: "sport", emoji: "⚽", bio: "b", color: "#7c3aed", createdAt: 2, paid: true },
    ],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: [], savedCarnets: [], general: { username: "Legacy QA" },
  },
  userPosts: [], userEvents: [], notifications: [],
  transactions: [
    { id: "t1", kind: "publish_text", pts: 10, passia: 0, label: "Post publié", at: Date.now() },
    { id: "t2", kind: "like_received", pts: 2, passia: 1, label: "Palier de likes reçus 💎", at: Date.now() },
  ],
  quests: [
    { id: "q1", emoji: "🎨", title: "Publie 1 post création", reward: 15, passia: 2, target: 1, progress: 0, kind: "daily", done: false },
  ],
  currentMood: "all", selectedFeedPassions: ["musique"], feedInterestsMigrated: true,
};

async function bootLegacy(page, errors) {
  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.console.push(m.text()); });
  }
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, ETAT_LEGACY]);
  await page.goto("/index.html");
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
  });
}

test.describe("ADR-009 — retrait de l'économie interne", () => {

  // ── ① la surface ────────────────────────────────────────────────────────
  test("aucune destination Wallet, aucun solde, aucun score public", async ({ page }) => {
    await bootOnboarded(page);

    for (const sel of ["#screen-wallet", "#topPassia", "#heroPassia", "#heroScore",
                       "#passiaBalance", "#mainProfileStars", "#profileStarsScore",
                       "#profilePassiaChip", "#leaderboard", "#questsBox", "#docViewer",
                       ".wallet-tab", ".wallet-pane", ".pack-card", ".pass-card",
                       ".quest-card", ".lb-row"]) {
      await expect(page.locator(sel), sel + " devrait avoir disparu").toHaveCount(0);
    }

    // Ni la landing, ni l'onglet IA ne promettent plus de monnaie.
    const texte = await page.evaluate(() => document.body.innerText);
    expect(texte).not.toMatch(/Passia/i);
  });

  test("un ancien deep link #wallet ne laisse jamais l'app sans écran actif", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      goTo("wallet");
      const actifs = Array.from(document.querySelectorAll(".screen.active")).map((e) => e.id);
      return { actifs };
    });
    // Exactement un écran actif, et c'est une destination qui existe.
    expect(r.actifs).toEqual(["screen-profiles"]);
  });

  // ── ② le moteur ─────────────────────────────────────────────────────────
  test("le moteur de récompenses n'existe plus, sous aucun de ses noms", async ({ page }) => {
    await bootOnboarded(page);
    const absents = await page.evaluate(() =>
      ["grantReward", "rewardToast", "awardLikeReceived", "checkRankUp", "rankOf",
       "renderWallet", "setWalletTab", "renderQuests", "bumpQuest", "claimQuest",
       "openProfilePaywall", "payForExtraProfile", "tipReel", "renderShop",
       "REWARDS", "RANKS", "LIKES_PER_PASSIA", "PASSIA_PACKS", "PASSIA_PASSES"]
        .filter((n) => typeof window[n] !== "undefined"));
    expect(absents).toEqual([]);
  });

  test("publier, commenter et aimer fonctionnent sans récompense ni erreur", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);

    // renderTopbar est rappelé par chacune de ces actions : c'est LUI qui
    // écrivait dans #topPassia sans garde. Une seule omission le ferait lever.
    await page.evaluate(() => { renderTopbar(); renderMainProfile && renderMainProfile(); });

    const post = await page.evaluate(() => {
      const p = (typeof allFeedPosts === "function" ? allFeedPosts() : [])[0];
      if (!p) return null;
      likePost(p.id, true, null);
      return { id: p.id, likes: p.likes };
    });
    expect(post).not.toBeNull();

    await page.waitForTimeout(400);
    expect(errors.js, "aucune erreur JS pendant like + rendu topbar").toEqual([]);
    // Aucun toast de récompense n'est émis.
    await expect(page.locator(".toast.reward")).toHaveCount(0);
  });

  // ── ③ le 4ᵉ profil (le défaut signalé) ──────────────────────────────────
  test("créer un 4ᵉ profil est libre : aucun paywall, aucun coût", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    // ⚠️ KILL SWITCH DU LOT `flat_passions_v1`, ET IL FAUT LIRE POURQUOI.
    // Depuis le 2026-09-01, sur demande explicite de Benjamin, un plafond de
    // trois passions s'applique : la quatrième ouvre une fenêtre annonçant que
    // la suite sera payante. Ce test observe donc la surface d'AVANT le plafond
    // et pose le kill switch, en gardant TOUTES ses assertions.
    //
    // ⚠️ CE N'EST PAS UN CONTOURNEMENT D'ADR-009. L'ADR interdit une monnaie
    // INTERMÉDIAIRE (Passia, points, étoiles, packs) et prévoit explicitement
    // qu'« un paiement futur devra être un paiement DIRECT en monnaie réelle ».
    // Ce que ce test protège vraiment — l'absence de 💎, de Passia, de « Payer »
    // — est REPRIS sur la surface neuve par le test ㉒ de
    // `passions-plates.spec.js`, qui exige la même absence dans la fenêtre du
    // plafond. Éteindre ici sans reprendre là-bas aurait fait disparaître la
    // garantie au lieu de la déplacer.
    await page.addInitScript(() => localStorage.setItem("flat_passions_v1", "0"));
    await bootOnboarded(page, errors, 3);   // déjà 3 profils = l'ancienne limite

    const avant = await page.evaluate(() => state.user.profiles.length);
    expect(avant).toBe(3);

    await page.evaluate(() => openCreateProfile());
    await page.waitForTimeout(300);

    // La modale ouverte est bien la CRÉATION, pas le paywall.
    const modale = await page.evaluate(() => document.getElementById("modalContent").innerText);
    // Ancre d'OUVERTURE de la modale, par sa grille de choix — un identifiant
    // stable, pas un libellé. L'assertion de ce test (aucun paywall, aucun coût)
    // suit juste en dessous et n'a jamais dépendu d'un texte.
    expect(await page.locator("#newProfileGrid").count()).toBe(1);
    expect(modale).not.toMatch(/💎|Passia|Pass Passion|Payer|Profil supplémentaire/i);

    // Et elle va jusqu'au bout.
    const apres = await page.evaluate(() => {
      const libre = allPassions().find((p) => !state.user.profiles.some((x) => x.passion === p.id));
      selectNewProfilePassion(libre.id);
      confirmCreateProfile();
      return state.user.profiles.length;
    });
    await page.waitForTimeout(400);
    expect(apres).toBe(4);
    expect(errors.js).toEqual([]);
  });

  // ── ④ l'état legacy ─────────────────────────────────────────────────────
  test("un état d'avant le retrait charge sans lever et sans rien réafficher", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootLegacy(page, errors);

    expect(errors.js, "un ancien blob ne doit JAMAIS faire lever le boot").toEqual([]);

    const r = await page.evaluate(() => ({
      score: state.user.score,
      passia: state.user.passia,
      likesReceived: state.user.likesReceived,
      activePass: state.user.activePass,
      transactions: state.transactions,
      quests: state.quests,
      paid: state.user.profiles.map((p) => p.paid),
      profils: state.user.profiles.length,
    }));

    // Les clés sont retirées de l'état canonique…
    expect(r.score).toBeUndefined();
    expect(r.passia).toBeUndefined();
    expect(r.likesReceived).toBeUndefined();
    expect(r.activePass).toBeUndefined();
    expect(r.transactions).toBeUndefined();
    expect(r.quests).toBeUndefined();
    expect(r.paid).toEqual([undefined, undefined]);
    // …sans rien perdre du reste du compte.
    expect(r.profils).toBe(2);

    // Et rien ne revient à l'écran.
    await expect(page.locator("#screen-wallet")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/Passia/i);
  });

  test("la synchronisation ne re-propage pas les clés d'un ancien client", async ({ page }) => {
    await bootOnboarded(page);

    // On simule ce qu'un ancien appareil pousse dans `user_state`, puis ce que
    // ce client renverrait à son tour. Sans les gardes des deux côtés, les clés
    // font l'aller-retour indéfiniment entre les deux versions.
    const r = await page.evaluate(() => {
      _applyUserState({
        user: { name: "Legacy", score: 999, passia: 42, profiles: [] },
        transactions: [{ id: "x", pts: 1 }],
        quests: [{ id: "q1", done: false }],
      });
      const apresHydratation = {
        score: state.user.score, passia: state.user.passia,
        transactions: state.transactions, quests: state.quests,
      };
      // Ce que ce client enverrait ensuite au serveur.
      const envoye = _syncableState();
      return {
        apresHydratation,
        envoye: {
          score: envoye.user.score, passia: envoye.user.passia,
          transactions: envoye.transactions, quests: envoye.quests,
        },
      };
    });

    expect(r.apresHydratation.score).toBeUndefined();
    expect(r.apresHydratation.passia).toBeUndefined();
    expect(r.apresHydratation.transactions).toBeUndefined();
    expect(r.apresHydratation.quests).toBeUndefined();

    expect(r.envoye.score).toBeUndefined();
    expect(r.envoye.passia).toBeUndefined();
    expect(r.envoye.transactions).toBeUndefined();
    expect(r.envoye.quests).toBeUndefined();
  });
});
