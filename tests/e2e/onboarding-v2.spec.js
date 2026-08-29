// Suite « Onboarding V2 — lot 1 : First Feed + intérêts persistants ».
//
// Le défaut corrigé, mesuré sur main le 2026-08-22 : un utilisateur qui choisit
// ses passions à l'inscription atterrissait sur un fil qui les IGNORE.
// `onbFinish()` faisait `_activeFeedPassions = new Set()` juste après la
// sélection, `state.selectedFeedPassions` n'était jamais écrit, et un profil
// passion était créé PAR passion cochée.
//
// Invariants vérifiés ici :
//   · setFeedPassions écrit les DEUX sources et déduplique en gardant l'ordre ;
//   · onbFinish V2 : un seul profil de départ, tous les intérêts dans le fil ;
//   · aucun Passia/score distribué en V2 (ADR-009) ;
//   · les intérêts survivent à un rechargement complet ;
//   · un compte antérieur sans selectedFeedPassions est migré depuis ses profils,
//     sans qu'aucun profil existant soit supprimé ;
//   · télémétrie d'activation émise avec des clés qui survivent au filtre PII ;
//   · drapeau à false → ancien comportement strictement rétabli.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

// Entre dans l'app AVANT onboarding, pour piloter onbFinish() nous-mêmes.
async function bootVierge(page, { v2 = true, etat = null } = {}) {
  await page.addInitScript(([k, t, st, flag]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.PASSIO_ONBOARDING_V2 = flag;
    if (st) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    // Capture la télémétrie AVANT tout envoi réseau.
    window.__tel = [];
  }, [GATE_KEY, GATE_TOKEN, etat, v2]);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof window.setFeedPassions === "function"
    || typeof setFeedPassions === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaInit = () => {};
    const vrai = (window.tel && window.tel.action) ? window.tel.action.bind(window.tel) : null;
    if (window.tel) {
      window.tel.action = (nom, meta) => { window.__tel.push({ nom, meta }); if (vrai) { try { vrai(nom, meta); } catch (e) {} } };
    }
  });
}

test("setFeedPassions écrit les deux sources, déduplique et garde l'ordre", async ({ page }) => {
  await bootVierge(page);
  await page.evaluate(() => setFeedPassions(["sport", "musique", "sport", "cuisine"]));
  // saveState() est débouncé à 250 ms : lire le stockage plus tôt renverrait null
  // et ferait croire à une non-persistance.
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    runtime: Array.from(_activeFeedPassions),
    persiste: state.selectedFeedPassions,
    stocke: JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "null"),
  }));
  expect(r.runtime).toEqual(["sport", "musique", "cuisine"]);
  expect(r.persiste).toEqual(["sport", "musique", "cuisine"]);
  // La persistance doit avoir atteint le stockage, pas seulement l'objet en mémoire.
  expect(r.stocke).not.toBeNull();
  expect(r.stocke.selectedFeedPassions).toEqual(["sport", "musique", "cuisine"]);
});

test("onbFinish V2 : un seul profil de départ, mais toutes les passions dans le fil", async ({ page }) => {
  await bootVierge(page);
  const r = await page.evaluate(() => {
    state.user.name = "QA";
    selectedPassions.length = 0;
    selectedPassions.push("sport", "musique", "cuisine");
    onbFinish();
    return {
      profils: state.user.profiles.map((p) => p.passion),
      interets: Array.from(_activeFeedPassions),
      persiste: state.selectedFeedPassions,
      // ADR-009 : ces clés ne doivent plus EXISTER dans l'état canonique, et
      // plus seulement valoir zéro — le moteur entier a été retiré.
      score: state.user.score,
      passia: state.user.passia,
      transactions: state.transactions,
      quests: state.quests,
      moteurRetire: typeof window.grantReward === "undefined"
                 && typeof window.rewardToast === "undefined"
                 && typeof window.awardLikeReceived === "undefined",
    };
  });
  // Trois passions cochées → UN profil (le primaire), trois intérêts de fil.
  expect(r.profils).toEqual(["sport"]);
  expect(r.interets).toEqual(["sport", "musique", "cuisine"]);
  expect(r.persiste).toEqual(["sport", "musique", "cuisine"]);
  // ADR-009 : aucune gamification monétaire — ni valeur, ni clé, ni moteur.
  expect(r.score).toBeUndefined();
  expect(r.passia).toBeUndefined();
  expect(r.transactions).toBeUndefined();
  expect(r.quests).toBeUndefined();
  expect(r.moteurRetire).toBe(true);
});

test("les intérêts choisis survivent à un rechargement complet", async ({ page }) => {
  await bootVierge(page);
  await page.evaluate(() => {
    state.user.name = "QA";
    selectedPassions.length = 0;
    selectedPassions.push("sport", "musique");
    onbFinish();
  });
  await page.reload();
  await page.waitForFunction(() => typeof restoreFeedPassions === "function", null, { timeout: 20000 });
  await page.waitForTimeout(2500); // boot async
  const apres = await page.evaluate(() => ({
    runtime: Array.from(_activeFeedPassions),
    persiste: state.selectedFeedPassions,
  }));
  expect(apres.persiste).toEqual(["sport", "musique"]);
  expect(apres.runtime).toEqual(["sport", "musique"]);
});

test("un compte antérieur est migré depuis ses profils, sans qu'aucun soit supprimé", async ({ page }) => {
  const ancien = {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Ancien", currentProfileId: "pp_0",
      profiles: [
        { id: "pp_0", passion: "sport", name: "Ancien", emoji: "🏃", bio: "", color: "#7c3aed", createdAt: 1 },
        { id: "pp_1", passion: "musique", name: "Ancien", emoji: "🎵", bio: "", color: "#7c3aed", createdAt: 2 },
      ],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], savedCarnets: [], general: {},
    },
    userPosts: [], userEvents: [], transactions: [], notifications: [], quests: [],
    currentMood: "all",
    // selectedFeedPassions VOLONTAIREMENT absent : c'est l'état d'avant le lot.
  };
  await bootVierge(page, { etat: ancien });
  const r = await page.evaluate(() => {
    const restaurees = restoreFeedPassions();
    return {
      restaurees,
      runtime: Array.from(_activeFeedPassions),
      profils: state.user.profiles.map((p) => p.id),
    };
  });
  // Spec §12 : sans amorçage, ce compte retomberait sur « Choisis une passion »,
  // fil VIDE — un Set vide ne veut PAS dire « tout le fil » (voir renderFeed,
  // `nothingSelected`). On amorce donc depuis les passions de ses profils.
  expect(r.restaurees).toEqual(["sport", "musique"]);
  expect(r.runtime).toEqual(["sport", "musique"]);
  // Ne rien supprimer : les profils auto-créés d'avant restent valides.
  expect(r.profils).toEqual(["pp_0", "pp_1"]);
});

test("la télémétrie d'activation part avec des clés qui survivent au filtre PII", async ({ page }) => {
  await bootVierge(page);
  const evts = await page.evaluate(() => {
    state.user.name = "QA";
    selectedPassions.length = 0;
    selectedPassions.push("sport", "musique");
    onbFinish();
    return window.__tel;
  });
  const noms = evts.map((e) => e.nom);
  expect(noms).toContain("signup_completed");
  expect(noms).toContain("passions_selected");
  expect(noms).toContain("personalized_feed_viewed");

  const sel = evts.find((e) => e.nom === "passions_selected");
  expect(sel.meta.n_interests).toBe(2);
  expect(sel.meta.primary_id).toBe("sport");
  expect(sel.meta.starter_profiles).toBe(1);

  // Le filtre PII de telemetry.js est une liste NOIRE : une clé qui la percute
  // est jetée en SILENCE. On rejoue ici le filtre réel sur les clés émises.
  const DENY = /(pass|pwd|token|secret|apikey|api_key|\bkey\b|auth|jwt|bearer|code|email|mail|phone|tel|iban|card|cvv|ssn|content|body|\btext\b|message|vocal|base64|password|name|pseudo|user|\btitle\b|titre|query|search|\bq\b|label|city|ville|address|adresse|\blat\b|\blng\b|location|bio)/i;
  for (const e of evts) {
    for (const k of Object.keys(e.meta || {})) {
      expect(DENY.test(k), `la clé « ${k} » de ${e.nom} serait jetée par le filtre PII`).toBe(false);
    }
  }
  // Aucune donnée personnelle : le nom saisi ne doit apparaître nulle part.
  expect(JSON.stringify(evts)).not.toContain("QA");
});

test("drapeau à false : l'ancien comportement est strictement rétabli", async ({ page }) => {
  await bootVierge(page, { v2: false });
  const r = await page.evaluate(() => {
    state.user.name = "QA";
    selectedPassions.length = 0;
    selectedPassions.push("sport", "musique", "cuisine");
    onbFinish();
    return {
      profils: state.user.profiles.map((p) => p.passion),
      interets: Array.from(_activeFeedPassions),
      score: state.user.score,
      transactions: state.transactions,
    };
  });
  // Ancien parcours : un profil PAR passion et aucun filtre de fil — c'est cela
  // que ce drapeau rétablit, et c'est inchangé.
  expect(r.profils).toEqual(["sport", "musique", "cuisine"]);
  expect(r.interets).toEqual([]);
  // ⚠️ Ce test exigeait `score > 0` : le chemin de repli conservait la
  // gamification que la V2 avait déjà abandonnée. L'ADR-009 l'a retirée des
  // DEUX chemins — le drapeau ne rétablit plus une économie qui n'existe nulle
  // part. L'assertion est retournée, pas supprimée : elle interdit désormais la
  // réapparition des points par cette porte restée entrouverte.
  expect(r.score).toBeUndefined();
  expect(r.transactions).toBeUndefined();
});
