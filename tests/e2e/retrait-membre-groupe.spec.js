// ═══════════════════════════════════════════════════════════════════════════
// RV-44 (2026-11-06) — RETIRER UN MEMBRE D'UN GROUPE : L'ÉCRAN NE DIT QUE CE
// QUE LE SERVEUR A RENDU
//
// LE DÉFAUT. `removeGroupMember` (app-05) ôtait le membre de l'état local,
// écrivait « a quitté le groupe », annonçait « retiré·e du groupe »… et envoyait
// le DELETE sans jamais en lire le résultat. Or le SDK ne LÈVE PAS sur un refus
// RLS, et un DELETE que la RLS filtre touche 0 ligne SANS erreur — le cas exact
// de RV-44 : depuis C-04, la policy de lecture de conv_members cachait au
// CRÉATEUR d'une discussion d'activité le membre qu'il avait bloqué ; « Suppression
// admin » touchait 0 ligne, le membre restait (il lisait et écrivait), et l'écran
// affirmait le contraire. Un refus ou une panne réseau étaient avalés de même
// (préexistant). La base est corrigée par
// `migrations/migration_discussions_activite_2026-11-06.sql` (banc
// `tests/sql/migration-discussions-activite.test.sh`).
//
// LA REVUE DU MÊME JOUR : la première version de ce correctif prenait TOUT
// « 0 ligne » pour « toujours membre », partait au serveur pour un visiteur, une
// ébauche de groupe restée locale ou un personnage de démonstration (que la clé
// étrangère refuse : il n'est jamais en base) — le retrait devenait impossible là
// où il marchait —, et repeignait au succès, APRÈS l'aller-retour, une modale
// fermée entre-temps et le fil du groupe dans le panneau d'une autre conversation.
//
// CE BANC EXIGE DU CLIENT :
//   ① un REFUS du serveur (`{ error }`, 42501) → « le serveur a refusé », le
//      membre reste dans l'état local, aucun message système ;
//   ② 0 LIGNE sans erreur → une RELECTURE de sa ligne et de la mienne ; lui
//      présent → « toujours membre » (lu, pas supposé), trace sans donnée
//      personnelle ; ②b lui absent, moi visible → il n'y était déjà plus :
//      retrait local ; ②c même absence dans une discussion d'activité (`evgrp_`,
//      où C-04 cache au créateur un membre bloqué tant que la migration n'est pas
//      appliquée) → « pas confirmé », rien ne change ; ②d je ne me vois pas,
//      ②e relecture en panne → « pas confirmé » ; ②f je ne me vois pas ET la
//      session est morte (le DELETE est parti sous la clé anon : 200 []) →
//      « reconnecte-toi », et le mode « session expirée » est posé ;
//   ③ une PANNE réseau qui LÈVE, ③bis la panne telle que postgrest-js la REND
//      (`status: 0`, `error.message` « TypeError: Failed to fetch », `code` vide)
//      → « pas de connexion : … pas confirmé », rien ne change ; ③ter une réponse
//      5xx → « pas confirmé » (le DELETE a pu être validé), ③quater un 401 →
//      « reconnecte-toi », ③quinquies un 429 → « pas confirmé » — jamais « le
//      serveur a refusé » (contre-revue du 06/11) ;
//   ④ le SUCCÈS (une ligne rendue), modale des membres ouverte → le comportement
//      d'avant : membre ôté, « a quitté le groupe », « retiré·e », modale rendue ;
//   ⑤ les requêtes sont celles qu'il faut : DELETE filtré sur la conversation ET
//      le membre avec `select("user_id")` (RETURNING), et la relecture ;
//   ⑥ un double toucher pendant l'aller-retour n'envoie qu'UN DELETE ;
//   ⑦ un VRAI visiteur (`passio_uid = u_…`, `_supaReal` vrai) → retrait local,
//      aucune requête ;
//   ⑧ un personnage de démonstration (identifiant non uuid) dans un groupe
//      serveur, compte réel → retrait local, aucun DELETE, aucun toast d'échec ;
//   ⑨ une ébauche de groupe restée locale (`conv_grp_…`) → retrait local ;
//   ⑩ session expirée, ⑪ SDK non chargé (`_supaReal` faux) — compte réel, membre
//      en base → aucun DELETE, rien ne change, et l'écran le dit (« recharge
//      l'application » : le SDK ne revient pas seul avec le réseau) ;
//   ⑫ B : la modale fermée pendant l'aller-retour ne revient pas au succès ;
//   ⑬ D : la conversation changée pendant l'aller-retour garde SON fil (de vrais
//      touchers : carte, bouton « Membres », « Retirer », croix, retour) ;
//   ⑭ un groupe créé SANS SDK n'obtient pas d'identifiant serveur fantôme
//      (`supaCreateGroup` rend null : l'ébauche garde `conv_grp_`, ⑨) ;
//   ⑮ un succès arrivé tard garde l'onglet « Ajouter », sa recherche ET son
//      filtre, ne rend pas le focus à un champ quitté (pas de clavier sans geste)
//      et garde la position de défilement de la liste.
// RÉINJECTIONS (mesurées le 2026-11-06) : voir `docs/journal/serveur-securite-base.md`
// (fiche C-02 / R41, RV-44) — le code d'avant le lot, puis la première version du
// correctif, remis en place l'un après l'autre.
//
// ⚠️ ISOLATION (projet local) : réseau Supabase COUPÉ (`route.abort`) AVANT le
// démarrage, `supa.from` MUTÉ par `defineProperty` (en CI le vrai SDK se charge,
// ses membres sont des getters de prototype qu'une affectation ne masque pas).
// Aucune écriture ne quitte le navigateur ; aucun `page.goto` propre à ce banc.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const VISITEUR = "u_visit7x2a";
const LEA = "7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5";
const AUTRE = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const CONV = "grp_banc_retrait";
const CONV2 = "conv_banc_autre";

// Formes RÉELLES rendues par postgrest-js (il ne lève pas) :
const REFUS = { status: 403, data: null, error: { code: "42501", message: "permission denied for table conv_members" } };
const ZERO_LIGNE = { status: 200, data: [], error: null };
const SUCCES = { status: 200, data: [{ user_id: LEA }], error: null };
const PANNE_POSTGREST = { status: 0, data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" } };
const relu = (...ids) => ({ status: 200, data: ids.map((u) => ({ user_id: u })), error: null });

/**
 * Démarre l'app (compte réel par défaut, uuid local), coupe Supabase au réseau,
 * remplace `supa.from` par un faux client qui NOTE chaque requête (table,
 * opération, filtres, colonnes) et rend la réponse programmée : `__delete` pour
 * `conv_members.delete`, `__relecture` pour la relecture `conv_members` filtrée
 * par `in("user_id", …)` ; les autres rendent vide. Pose le groupe `conv` avec
 * `membre` (Léa par défaut) et, pour les scénarios d'écran, une conversation 1-à-1
 * avec « Autre ».
 */
async function banc(page, { uid = MOI, conv = CONV, membre = LEA } = {}) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, uid);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(([lea, autre, conv, conv2, membre]) => {
    window.__ops = [];
    window.__delete = {};                 // réponse du DELETE ; `__lever` : une panne qui LÈVE
    window.__relecture = { data: [] };    // réponse de la relecture de conv_members
    window.__retenir = null;              // une promesse à attendre avant de répondre au DELETE
    const requete = (table) => {
      const q = { _op: "select", _filtres: [], _colonnes: null };
      q.eq = (col, val) => { q._filtres.push(["eq", col, val]); return q; };
      q.in = (col, val) => { q._filtres.push(["in", col, Array.isArray(val) ? val.slice() : val]); return q; };
      q.select = (cols) => { q._colonnes = cols === undefined ? "*" : cols; return q; };
      ["neq", "lte", "gte", "lt", "gt", "maybeSingle", "single", "order", "limit", "range", "is", "or", "not", "match", "filter"]
        .forEach((m) => { q[m] = () => q; });
      ["upsert", "insert", "update", "delete"].forEach((op) => {
        q[op] = (payload) => { q._op = op; q._payload = payload; return q; };
      });
      q.then = (ok, ko) => {
        window.__ops.push({ table, op: q._op, filtres: q._filtres.slice(), colonnes: q._colonnes });
        let r = {};
        let attendre = Promise.resolve();
        if (table === "conv_members" && q._op === "delete") {
          r = window.__delete;
          if (window.__retenir) attendre = window.__retenir;
        } else if (table === "conv_members" && q._op === "select" && q._filtres.some((f) => f[0] === "in")) {
          r = window.__relecture;
        }
        return attendre.then(() => {
          if (r && r.__lever) throw new TypeError(r.__lever);
          return Object.assign({ data: null, error: null, status: 200 }, r);
        }).then(ok, ko);
      };
      return q;
    };
    Object.defineProperty(window.supa, "from", { configurable: true, writable: true, value: requete });
    window._supaReal = true;
    // La session : VIVANTE par défaut (un compte réel du banc), sans toucher au SDK
    // (d'autres modules lisent `supa.auth.getSession`) ; ②f rend la vraie lecture.
    window.__sessionVivanteReelle = window._sessionVivante;
    window._sessionVivante = () => Promise.resolve(true);
    window.__toasts = [];
    window.toast = (t, k) => { window.__toasts.push({ t: String(t), k: k || "" }); };
    if (!state.seed.users.some((u) => u.id === lea)) state.seed.users.push({ id: lea, name: "Léa", profileEmoji: "🌿", avatar: "#22c55e", distant: true });
    state.seed.users.push({ id: autre, name: "Autre", profileEmoji: "🙂", avatar: "#0ea5e9", distant: true });
    const t = Date.now();
    const convs = getConversations();
    // LOT-4 (MSG-C08) : « Retirer » et « Ajouter » ne sont proposés qu'au créateur — ici, moi.
    convs.push({ id: conv, isGroup: true, groupName: "Rando du dimanche", userIds: [membre], userId: membre, createdBy: MY_UID, _otherRead: true,
      messages: [{ id: "m0", from: "me", text: "Bienvenue dans la rando", at: t - 60000 }], lastAt: t - 30000 });
    convs.push({ id: conv2, isGroup: false, userId: autre, userName: "Autre", userIds: [autre], _otherRead: true,
      messages: [{ id: "x1", from: autre, text: "Message du fil de l'AUTRE", at: t - 50000 }], lastAt: t - 40000 });
    saveConversationsNow();
  }, [LEA, AUTRE, conv, CONV2, membre]);
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__ops = []; window.__toasts = []; });
}

/** L'état PERSISTÉ du membre (`saveConversations` diffère son écriture) : true, false, null (pas de groupe) ou « illisible ». */
const persiste = (page, conv = CONV, membre = LEA) => page.evaluate(([c0, m0]) => {
  try {
    const brut = JSON.parse(localStorage.getItem("passio_conversations_v1") || "[]");
    const cp = (Array.isArray(brut) ? brut : []).find((x) => x && x.id === c0);
    return cp ? (cp.userIds || []).includes(m0) : null;
  } catch (e) { return "illisible"; }
}, [conv, membre]);

/** Ce que le banc observe après un retrait : requêtes, toasts, état local. */
const observer = (page, conv = CONV, membre = LEA) => page.evaluate(([c0, m0]) => {
  const c = getConversations().find((x) => x.id === c0);
  return {
    retraits: window.__ops.filter((o) => o.table === "conv_members" && o.op === "delete"),
    relectures: window.__ops.filter((o) => o.table === "conv_members" && o.op === "select" && o.filtres.some((f) => f[0] === "in")),
    toutes: window.__ops.length,
    toasts: window.__toasts.slice(),
    membre: !!(c && (c.userIds || []).includes(m0)),
    messagesSysteme: c ? c.messages.filter((m) => /a quitté le groupe/.test(m.text || "")).length : -1,
  };
}, [conv, membre]);

const retirer = (page, conv = CONV, membre = LEA) =>
  page.evaluate(([c0, m0]) => Promise.resolve(removeGroupMember(c0, m0)), [conv, membre]);
const erreurs = (o) => o.toasts.filter((t) => t.k === "error").map((t) => t.t);
const succes = (o) => o.toasts.some((t) => /retiré·e du groupe/.test(t.t));

/** Un échec : rien ne change, ni à l'écran ni dans l'état persisté, et le toast d'erreur dit `motif`. */
async function exigerEchec(page, o, motif, { requetes = 1 } = {}) {
  expect(o.retraits, "DELETE envoyés").toHaveLength(requetes);
  expect(o.membre, "le membre est TOUJOURS dans l'état local").toBe(true);
  await expect.poll(() => persiste(page), { message: "…et dans l'état persisté" }).toBe(true);
  expect(o.messagesSysteme, "aucun « a quitté le groupe »").toBe(0);
  expect(succes(o), "aucun toast de succès").toBe(false);
  expect(erreurs(o), "un toast d'échec, et un seul").toHaveLength(1);
  expect(erreurs(o)[0]).toMatch(motif);
}

/** Un retrait : membre ôté (écran et état persisté), « a quitté le groupe », « retiré·e ». */
async function exigerRetrait(page, o, { conv = CONV, membre = LEA } = {}) {
  expect(o.membre, "le membre est ôté de l'état local").toBe(false);
  await expect.poll(() => persiste(page, conv, membre), { message: "…et de l'état persisté" }).toBe(false);
  expect(o.messagesSysteme, "« … a quitté le groupe. »").toBe(1);
  expect(succes(o), "le toast de succès").toBe(true);
  expect(erreurs(o), "aucun toast d'échec").toHaveLength(0);
}

test.describe("RV-44 — retirer un membre d'un groupe : l'écran ne dit que ce que le serveur a rendu", () => {
  test("① refus du serveur (42501) : « le serveur a refusé », le membre reste, aucun message système", async ({ page }) => {
    await banc(page);
    await page.evaluate((r) => { window.__delete = r; }, REFUS);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu, "removeGroupMember rend false sur un refus").toBe(false);
    await exigerEchec(page, o, /^Le serveur a refusé le retrait de Léa\.$/);
    expect(o.relectures, "un refus n'appelle pas de relecture").toHaveLength(0);
  });

  test("② 0 ligne, la relecture le montre ENCORE là : « toujours membre » (lu, pas supposé) — trace sans donnée personnelle", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, relu(MOI, LEA)]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Léa est toujours membre du groupe : le serveur n'a pas accepté le retrait\.$/);
    const traces = await page.evaluate(() => (window._diagLogs || []).filter((l) => /conv_members retrait/.test(l)));
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.join(" ")).not.toMatch(/Léa|7c1d2e3f|3f2a9c64|grp_banc_retrait/);
  });

  test("②b 0 ligne, la relecture montre qu'il n'y est DÉJÀ plus (et que je me vois) : retrait local, idempotent", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, relu(MOI)]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu, "le retrait est acquis : le serveur ne l'a plus").toBe(true);
    expect(o.retraits).toHaveLength(1);
    expect(o.relectures).toHaveLength(1);
    await exigerRetrait(page, o);
  });

  test("②c 0 ligne dans une discussion d'activité (`evgrp_`) : son absence ne prouve rien (C-04 cache un membre bloqué) — « pas confirmé »", async ({ page }) => {
    const ACT = "evgrp_banc_activite";
    await banc(page, { conv: ACT });
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, relu(MOI)]);
    const rendu = await page.evaluate(([c0, m0]) => Promise.resolve(removeGroupMember(c0, m0)), [ACT, LEA]);
    const o = await observer(page, ACT);
    expect(rendu).toBe(false);
    expect(o.retraits).toHaveLength(1);
    expect(o.membre, "le membre reste").toBe(true);
    await expect.poll(() => persiste(page, ACT)).toBe(true);
    expect(o.messagesSysteme).toBe(0);
    expect(succes(o)).toBe(false);
    expect(erreurs(o)).toEqual(["Le retrait de Léa n'a pas été confirmé par le serveur."]);
  });

  test("②d 0 ligne, je ne me vois pas moi-même : rien à conclure — « pas confirmé »", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, relu()]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Le retrait de Léa n'a pas été confirmé par le serveur\.$/);
  });

  test("②e 0 ligne, la relecture échoue : « pas confirmé »", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, REFUS]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Le retrait de Léa n'a pas été confirmé par le serveur\.$/);
  });

  test("②f 0 ligne, relecture vide, SANS session (le DELETE est parti sous la clé anon) : « reconnecte-toi », et le mode « session expirée » est posé", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => {
      window.__delete = z;
      window.__relecture = r;
      // La VRAIE lecture de session, sur un SDK qui n'en a plus.
      window._sessionVivante = window.__sessionVivanteReelle;
      const auth = window.supa.auth || (window.supa.auth = {});
      Object.defineProperty(auth, "getSession", { configurable: true, writable: true, value: async () => ({ data: { session: null }, error: null }) });
    }, [ZERO_LIGNE, relu()]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Ta session a expiré — reconnecte-toi pour retirer Léa du groupe\.$/);
    expect(await page.evaluate(() => window._sessionExpiree === true), "le mode « session expirée » est posé (comme la publication)").toBe(true);
  });

  test("③ panne réseau (le fetch LÈVE) : « pas de connexion », le retrait n'est pas affirmé — rien ne change", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { window.__delete = { __lever: "Failed to fetch" }; });
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Pas de connexion : le retrait de Léa n'a pas été confirmé\. Réessaie quand le réseau revient\.$/);
  });

  test("③bis panne réseau telle que postgrest-js la REND (status 0, « TypeError: Failed to fetch », code vide) : même attendu que ③", async ({ page }) => {
    await banc(page);
    await page.evaluate((r) => { window.__delete = r; }, PANNE_POSTGREST);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Pas de connexion : le retrait de Léa n'a pas été confirmé\. Réessaie quand le réseau revient\.$/);
  });

  test("③ter réponse 5xx (passerelle, délai : le DELETE a pu être validé) : « pas confirmé », jamais « le serveur a refusé »", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { window.__delete = { status: 504, data: null, error: { code: "", message: "upstream request timeout" } }; });
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Le retrait de Léa n'a pas été confirmé par le serveur\.$/);
  });

  test("③quater réponse 401 hors du mode « session expirée » : « reconnecte-toi », jamais « le serveur a refusé »", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { window.__delete = { status: 401, data: null, error: { code: "PGRST301", message: "JWT expired" } }; });
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Ta session a expiré — reconnecte-toi pour retirer Léa du groupe\.$/);
  });

  test("③quinquies réponse 429 (limiteur) : « pas confirmé », jamais « le serveur a refusé »", async ({ page }) => {
    await banc(page);
    await page.evaluate(() => { window.__delete = { status: 429, data: null, error: { code: "", message: "Too Many Requests" } }; });
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Le retrait de Léa n'a pas été confirmé par le serveur\.$/);
  });

  test("④ succès (une ligne rendue), modale des membres ouverte : le comportement d'avant — membre ôté, message système, toast, modale rendue", async ({ page }) => {
    await banc(page);
    await page.evaluate(([r, conv]) => { window.__delete = r; showGroupMembers(conv); }, [SUCCES, CONV]);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu, "removeGroupMember rend true").toBe(true);
    expect(o.retraits).toHaveLength(1);
    expect(o.relectures, "un succès n'appelle pas de relecture").toHaveLength(0);
    await exigerRetrait(page, o);
    expect(o.toasts.map((t) => t.t)).toContain("🗑 Léa retiré·e du groupe");
    const modale = await page.evaluate(() => {
      const m = document.getElementById("modalContent");
      const b = document.getElementById("modalBackdrop");
      const membres = document.getElementById("grpPanel_members");
      return { texte: m ? m.textContent : "", ouverte: !!(b && b.classList.contains("active")), membres: membres ? membres.textContent : null };
    });
    expect(modale.ouverte, "la modale des membres, ouverte, est rendue de nouveau").toBe(true);
    expect(modale.texte).toContain("Rando du dimanche");
    expect(modale.membres, "…et Léa n'est plus dans l'onglet Membres").not.toContain("Léa");
  });

  test("⑤ les requêtes sont celles qu'il faut : DELETE (conversation ET membre, select(\"user_id\")) puis, sur 0 ligne, la relecture", async ({ page }) => {
    await banc(page);
    await page.evaluate(([z, r]) => { window.__delete = z; window.__relecture = r; }, [ZERO_LIGNE, relu(MOI)]);
    await retirer(page);
    const o = await observer(page);
    expect(o.retraits).toHaveLength(1);
    expect(o.retraits[0].filtres).toEqual([["eq", "conv_id", CONV], ["eq", "user_id", LEA]]);
    expect(o.retraits[0].colonnes, "RETURNING user_id : le nombre de lignes rendues prouve le retrait").toBe("user_id");
    expect(o.relectures).toHaveLength(1);
    expect(o.relectures[0].colonnes).toBe("user_id");
    expect(o.relectures[0].filtres, "sa ligne ET la mienne (témoin), dans CETTE conversation").toEqual([["eq", "conv_id", CONV], ["in", "user_id", [MOI, LEA]]]);
  });

  test("⑥ double toucher pendant l'aller-retour : UN seul DELETE, un seul toast", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async ([lea, conv, succes]) => {
      let liberer;
      window.__retenir = new Promise((res) => { liberer = res; });
      window.__delete = succes;
      const p1 = removeGroupMember(conv, lea);
      const p2 = removeGroupMember(conv, lea);
      liberer();
      return { r1: await p1, r2: await p2 };
    }, [LEA, CONV, SUCCES]);
    const o = await observer(page);
    expect(r).toEqual({ r1: true, r2: true });
    expect(o.retraits, "un seul DELETE").toHaveLength(1);
    expect(o.messagesSysteme).toBe(1);
    expect(o.toasts.filter((t) => /retiré·e du groupe/.test(t.t))).toHaveLength(1);
  });

  test("⑦ un VRAI visiteur (passio_uid = u_…, _supaReal vrai) : retrait local, aucune requête", async ({ page }) => {
    await banc(page, { uid: VISITEUR });
    const prem = await page.evaluate(() => ({ uid: MY_UID, compte: _compteAuthReel(), sdk: window._supaReal === true }));
    expect(prem, "la prémisse : un visiteur EN LIGNE").toEqual({ uid: VISITEUR, compte: false, sdk: true });
    await page.evaluate((r) => { window.__delete = r; }, ZERO_LIGNE);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu, "aucune promesse : le chemin local est synchrone").toBeUndefined();
    expect(o.toutes, "aucune requête").toBe(0);
    await exigerRetrait(page, o);
  });

  test("⑧ un personnage de démonstration (identifiant non uuid) dans un groupe serveur, compte réel : retrait local, aucun DELETE, aucun toast d'échec", async ({ page }) => {
    const PERSONA = "u_lea";
    await banc(page, { membre: PERSONA });
    const prem = await page.evaluate((p) => ({ compte: _compteAuthReel(), persona: (state.seed.users || []).some((u) => u.id === p && !u.distant) }), PERSONA);
    expect(prem, "la prémisse : compte réel, personnage de buildSeed").toEqual({ compte: true, persona: true });
    await page.evaluate((r) => { window.__delete = r; }, ZERO_LIGNE);
    const rendu = await retirer(page, CONV, PERSONA);
    const o = await observer(page, CONV, PERSONA);
    expect(rendu).toBeUndefined();
    expect(o.retraits, "aucun DELETE : la clé étrangère l'a toujours tenu hors de la base").toHaveLength(0);
    await exigerRetrait(page, o, { membre: PERSONA });
  });

  test("⑨ une ébauche de groupe restée locale (`conv_grp_…`), membre uuid, compte réel : retrait local, aucun DELETE", async ({ page }) => {
    const EBAUCHE = "conv_grp_banc123";
    await banc(page, { conv: EBAUCHE });
    await page.evaluate((r) => { window.__delete = r; }, ZERO_LIGNE);
    const rendu = await page.evaluate(([c0, m0]) => Promise.resolve(removeGroupMember(c0, m0)), [EBAUCHE, LEA]);
    const o = await observer(page, EBAUCHE);
    expect(rendu).toBeUndefined();
    expect(o.toutes, "aucune requête").toBe(0);
    await exigerRetrait(page, o, { conv: EBAUCHE });
  });

  test("⑩ session expirée, compte réel, membre en base : aucun DELETE, rien ne change, « reconnecte-toi »", async ({ page }) => {
    await banc(page);
    await page.evaluate((r) => { window.__delete = r; window._sessionExpiree = true; }, SUCCES);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    await exigerEchec(page, o, /^Ta session a expiré — reconnecte-toi pour retirer Léa du groupe\.$/, { requetes: 0 });
    expect(o.toutes, "aucune requête").toBe(0);
  });

  test("⑪ SDK non chargé (`_supaReal` faux), compte réel, membre en base : aucun DELETE, rien ne change, « recharge l'application »", async ({ page }) => {
    await banc(page);
    await page.evaluate((r) => { window.__delete = r; window._supaReal = false; }, SUCCES);
    const rendu = await retirer(page);
    const o = await observer(page);
    expect(rendu).toBe(false);
    // Le SDK ne se recharge pas seul quand le réseau revient : « réessaie quand le
    // réseau revient » ne menait à rien (revue du 06/11).
    await exigerEchec(page, o, /^Le service n'a pas pu se charger : recharge l'application pour retirer Léa du groupe\.$/, { requetes: 0 });
  });

  test("⑭ un groupe créé SANS SDK n'a pas d'identifiant serveur : supaCreateGroup rend null sans rien envoyer — l'ébauche garde `conv_grp_` (⑨)", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async (lea) => {
      window._supaReal = false;
      const id = await supaCreateGroup("Rando sans SDK", [lea], null);
      return { id, ops: window.__ops.length };
    }, LEA);
    expect(r.id, "aucun `grp_…` fantôme : le client de repli aurait tout « accepté »").toBe(null);
    expect(r.ops, "aucune requête").toBe(0);
  });

  test("⑮ un succès arrivé tard, onglet « Ajouter » ouvert avec une recherche : l'onglet et la recherche restent", async ({ page }) => {
    await banc(page);
    const vu = await page.evaluate(async ([lea, conv, succes]) => {
      let liberer;
      window.__retenir = new Promise((res) => { liberer = res; });
      window.__delete = succes;
      showGroupMembers(conv);
      switchGroupTab("add");
      const champ = document.getElementById("grpSearchInput");
      champ.value = "Au";
      filterGroupAddList("Au");
      // La personne a quitté le champ, et fait défiler la liste.
      champ.blur();
      const liste = document.getElementById("grpAddList");
      liste.style.maxHeight = "60px";
      liste.scrollTop = 30;
      const defilementAvant = liste.scrollTop;
      const p = removeGroupMember(conv, lea);
      liberer();
      const ok = await p;
      const ajout = document.getElementById("grpPanel_add");
      const membres = document.getElementById("grpPanel_members");
      const liste2 = document.getElementById("grpAddList");
      const noms = liste2 ? [...liste2.querySelectorAll("span")].map((s) => s.textContent || "") : [];
      return {
        ok,
        ajoutVisible: ajout ? ajout.style.display : null,
        membresVisible: membres ? membres.style.display : null,
        recherche: (document.getElementById("grpSearchInput") || {}).value,
        leaDansMembres: membres ? /Léa/.test(membres.textContent || "") : null,
        noms,
        focusDansLeChamp: document.activeElement === document.getElementById("grpSearchInput"),
        defilementAvant,
        defilementApres: liste2 ? liste2.scrollTop : null,
      };
    }, [LEA, CONV, SUCCES]);
    expect(vu.ok).toBe(true);
    expect(vu.ajoutVisible, "l'onglet « Ajouter » reste ouvert").not.toBe("none");
    expect(vu.membresVisible, "…et l'onglet « Membres » reste masqué").toBe("none");
    expect(vu.recherche, "la recherche tapée est rendue").toBe("Au");
    expect(vu.leaDansMembres, "la liste des membres, repeinte, n'a plus Léa").toBe(false);
    expect(vu.noms.length, "la liste « Ajouter » n'est pas vide").toBeGreaterThan(0);
    expect(vu.noms.every((n) => /au/i.test(n)), "…et elle est FILTRÉE par la recherche rendue : " + vu.noms.join(", ")).toBe(true);
    expect(vu.focusDansLeChamp, "le focus n'est pas rendu au champ qu'on avait quitté (pas de clavier sans geste)").toBe(false);
    expect(vu.defilementAvant, "la prémisse : la liste défilait").toBeGreaterThan(0);
    expect(vu.defilementApres, "la liste garde sa position").toBe(vu.defilementAvant);
  });
});

// ── L'ÉCRAN APRÈS L'ALLER-RETOUR — par de VRAIS touchers sur les VRAIS nœuds ──
const ecran = (page) => page.evaluate(() => {
  const th = document.getElementById("convFpThread");
  const fp = document.getElementById("conv-fullpage");
  const bd = document.getElementById("modalBackdrop");
  const txt = th ? th.textContent : "";
  return {
    convOuverte: window._openedConvId,
    panneauActif: !!(fp && fp.classList.contains("active")),
    filDuGroupe: /Bienvenue dans la rando|a quitté le groupe/.test(txt),
    filDeLAutre: /Message du fil de l'AUTRE/.test(txt),
    defilementBrancheSur: th ? th._curConvId : null,
    modaleOuverte: !!(bd && bd.classList.contains("active")),
    membresModale: ((document.getElementById("grpPanel_members") || {}).textContent || ""),
  };
});
const carte = (page, nom) => page.locator("#messageList .msg-card", { hasText: nom }).first().click();
const boutonMembres = (page) => page.locator('#convFpHead .conv-action-btn[title="Membres"]').click();
// LOT-4 (MSG-C09) : « Retirer » se confirme dans une feuille.
const toucherRetirer = async (page) => { await page.locator("#grpPanel_members button", { hasText: "Retirer" }).first().click(); await page.locator('#feuilleConfirmation [data-conf="retirer"]').click(); };
const croix = (page) => page.locator("#modalContent .modal-close").click();
const retourConv = (page) => page.locator("#convFpHead .conv-fp-back").click();
const liberer = (page) => page.evaluate(() => window.__libererDelete && window.__libererDelete());

async function ouvrirGroupeEtSesMembres(page) {
  await page.evaluate((r) => {
    window.__delete = r;
    window.__retenir = new Promise((res) => { window.__libererDelete = res; });
    goTo("messages");
  }, SUCCES);
  await page.waitForTimeout(300);
  await carte(page, "Rando du dimanche");
  await page.waitForTimeout(350);
  await boutonMembres(page);
  await page.waitForTimeout(150);
  const e = await ecran(page);
  expect(e.modaleOuverte, "la modale des membres est ouverte").toBe(true);
  expect(e.membresModale).toContain("Léa");
}

test.describe("RV-44 — le succès, arrivé APRÈS l'aller-retour, ne repeint que ce qui montre encore ce groupe", () => {
  test("⑫ B : la modale fermée pendant l'aller-retour ne revient pas ; rouverte, elle n'a plus Léa", async ({ page }) => {
    await banc(page);
    await ouvrirGroupeEtSesMembres(page);
    await toucherRetirer(page);
    await croix(page);
    await page.waitForTimeout(150);
    expect((await ecran(page)).modaleOuverte).toBe(false);
    await liberer(page);
    await expect.poll(() => persiste(page), { message: "le retrait a bien eu lieu" }).toBe(false);
    const apres = await ecran(page);
    // RÉINJECTION : sans la garde, la modale « 👥 Rando du dimanche » revient par-dessus la conversation.
    expect(apres.modaleOuverte, "la modale fermée ne revient pas").toBe(false);
    await boutonMembres(page);
    await page.waitForTimeout(150);
    const rouverte = await ecran(page);
    expect(rouverte.modaleOuverte).toBe(true);
    expect(rouverte.membresModale, "rouverte : Léa n'y est plus").not.toContain("Léa");
  });

  test("⑬ D : la conversation changée pendant l'aller-retour garde SON fil ; le groupe est à jour quand on y revient", async ({ page }) => {
    await banc(page);
    await ouvrirGroupeEtSesMembres(page);
    await toucherRetirer(page);
    await croix(page);
    await retourConv(page);
    await page.waitForTimeout(250);
    await carte(page, "Autre");
    await page.waitForTimeout(500);
    const avant = await ecran(page);
    expect(avant.convOuverte).toBe(CONV2);
    expect(avant.filDeLAutre).toBe(true);
    await liberer(page);
    await expect.poll(() => persiste(page), { message: "le retrait a bien eu lieu" }).toBe(false);
    const apres = await ecran(page);
    // RÉINJECTION : sans la garde, le fil du GROUPE s'affiche sous l'en-tête « Autre »
    // (dont le bouton d'envoi reste lié à l'autre destinataire), et la modale revient.
    expect(apres.convOuverte, "la conversation ouverte reste « Autre »").toBe(CONV2);
    expect(apres.filDuGroupe, "le fil du groupe n'est PAS peint dans le panneau de l'autre").toBe(false);
    expect(apres.filDeLAutre, "…qui garde son fil").toBe(true);
    expect(apres.defilementBrancheSur, "…et son défilement").toBe(CONV2);
    expect(apres.modaleOuverte, "la modale du groupe ne surgit pas").toBe(false);
    await retourConv(page);
    await page.waitForTimeout(250);
    await carte(page, "Rando du dimanche");
    await page.waitForTimeout(400);
    const fil = await page.evaluate(() => document.getElementById("convFpThread").textContent);
    expect(fil, "rouvert, le groupe montre le retrait").toContain("a quitté le groupe");
  });
});
