// ═══════════════════════════════════════════════════════════════════════════
// GARDE TRUST & SAFETY — PROPOSITION IRL (#134)
//
// Le lot ne crée aucun bouton : il pose le point de passage obligé qu'un futur
// « proposer un IRL » depuis une conversation devra franchir, et verrouille
// l'invariant de localisation qui, jusqu'ici, ne tenait que par la forme du
// formulaire de création d'événement.
//
// ⚠️ CE QUE CETTE SUITE NE PROUVE PAS, et qu'aucun test client ne peut prouver :
//   · qu'un MINEUR ne reçoit pas de proposition — `profiles` n'a aucune donnée
//     d'âge, `state.user.isMinor` est auto-déclaré et local ;
//   · qu'une personne QUI M'A BLOQUÉ ne reçoit rien — `blocks` est en
//     `blocks_select_own`, sa ligne m'est illisible ;
//   · qu'une conversation ne peut pas être forcée — `conversations` INSERT vaut
//     `check: true` côté base.
// Ces trois trous sont serveur. Ils sont documentés dans la PR comme préalables
// bloquants, et c'est la raison pour laquelle `irl_proposal_v1` reste OFF.
//
// Ce qui EST prouvé ici : le verdict de la garde dans les six cas décidables,
// le verrou de localisation au point unique de départ vers la base, le refus
// d'ouvrir un DM avec un compte bloqué (aller comme retour), et la survie des
// clés de télémétrie au filtre PII.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Position d'appareil de référence : Annecy, loin du repli Paris (48.8566,
// 2.3522) pour qu'aucun test ne puisse passer par coïncidence avec le fallback.
const GPS = { lat: 45.899247, lng: 6.129384 };

async function setFlag(page, v) {
  await page.evaluate((val) => {
    if (val === null) localStorage.removeItem("passio_irl_proposal_v1");
    else localStorage.setItem("passio_irl_proposal_v1", val);
    delete window.PASSIO_IRL_PROPOSAL_V1;
  }, v);
}

test.describe("Trust & Safety — garde de la proposition IRL", () => {

  // ── Le drapeau ────────────────────────────────────────────────────────────

  test("drapeau absent = OFF : aucune proposition n'est autorisée", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, null);
    const r = await page.evaluate(() => ({
      actif: irlProposalEnabled(),
      verdict: irlProposalVerdict("u_autre"),
    }));
    expect(r.actif).toBe(false);
    expect(r.verdict).toEqual({ ok: false, reason: "flag_off" });
  });

  test("kill switch mémoire : PASSIO_IRL_PROPOSAL_V1=false coupe un drapeau posé à 1", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    const avant = await page.evaluate(() => irlProposalVerdict("u_autre").ok);
    expect(avant).toBe(true); // prémisse : sans la coupure, la proposition passe

    const apres = await page.evaluate(() => {
      window.PASSIO_IRL_PROPOSAL_V1 = false;
      return irlProposalVerdict("u_autre");
    });
    expect(apres).toEqual({ ok: false, reason: "flag_off" });
  });

  // ── Les six cas décidables ────────────────────────────────────────────────

  test("verdicts : cible valide, cible vide, soi-même, mineur, compte bloqué", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    const r = await page.evaluate(() => {
      const out = {};
      out.valide = irlProposalVerdict("u_autre");
      out.vide = irlProposalVerdict("");
      out.nul = irlProposalVerdict(null);
      out.moiLitteral = irlProposalVerdict("me");
      out.moiUid = typeof MY_UID !== "undefined" && MY_UID ? irlProposalVerdict(MY_UID) : { reason: "self" };

      state.user.blocked = ["u_bloque"];
      out.bloque = irlProposalVerdict("u_bloque");
      out.nonBloque = irlProposalVerdict("u_autre");

      state.user.isMinor = true;
      out.mineur = irlProposalVerdict("u_autre");
      // Priorité : mineur l'emporte sur bloqué (le motif le plus fort est rendu).
      out.mineurEtBloque = irlProposalVerdict("u_bloque");

      state.user.isMinor = false;
      state.user.blocked = [];
      return out;
    });
    expect(r.valide).toEqual({ ok: true, reason: "ok" });
    expect(r.vide).toEqual({ ok: false, reason: "no_target" });
    expect(r.nul).toEqual({ ok: false, reason: "no_target" });
    expect(r.moiLitteral).toEqual({ ok: false, reason: "self" });
    expect(r.moiUid.reason).toBe("self");
    expect(r.bloque).toEqual({ ok: false, reason: "blocked" });
    expect(r.nonBloque).toEqual({ ok: true, reason: "ok" }); // le blocage ne déborde pas
    expect(r.mineur).toEqual({ ok: false, reason: "self_minor" });
    expect(r.mineurEtBloque).toEqual({ ok: false, reason: "self_minor" });
  });

  test("isMinor n'était relu nulle part : la garde est le premier lecteur", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    // Ce test dit ce que le lot APPORTE. Sans lui, `state.user.isMinor` reste
    // une donnée morte — écrite à l'onboarding, jamais consultée.
    const r = await page.evaluate(() => {
      state.user.isMinor = true;
      const bloque = irlProposalVerdict("u_autre").reason;
      state.user.isMinor = false;
      const passe = irlProposalVerdict("u_autre").ok;
      return { bloque, passe };
    });
    expect(r.bloque).toBe("self_minor");
    expect(r.passe).toBe(true);
  });

  // ── Localisation : la position de l'appareil ne part jamais brute ─────────

  test("_eventRow ramène à la zone une coordonnée qui EST la position de l'appareil", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const row = _eventRow({ title: "T", lat: gps.lat, lng: gps.lng, date: Date.now() });
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    // 2 décimales ≈ 1,1 km : la carte reste utilisable, le point exact ne part pas.
    expect(r.lat).toBe(45.9);
    expect(r.lng).toBe(6.13);
    expect(r.lat).not.toBe(GPS.lat);
    expect(r.lng).not.toBe(GPS.lng);
  });

  test("une coordonnée qui n'est PAS la position de l'appareil part intacte", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      // Lyon : même pays, autre ville — rien à voir avec le fix GPS.
      const row = _eventRow({ title: "T", lat: 45.764043, lng: 4.835659, date: Date.now() });
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    expect(r.lat).toBe(45.764043);
    expect(r.lng).toBe(4.835659);
  });

  test("consentement explicite : la position exacte est conservée", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const row = _eventRow({ title: "T", lat: gps.lat, lng: gps.lng, date: Date.now(), locationConsent: true });
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    expect(r.lat).toBe(GPS.lat);
    expect(r.lng).toBe(GPS.lng);
  });

  test("aucun chemin actuel ne pose locationConsent : le consentement reste à obtenir", async () => {
    // Si un jour un parcours pose ce drapeau, ce test rougit — et c'est voulu :
    // il devra alors prouver qu'un choix EXPLICITE de l'utilisateur le précède.
    const racine = path.join(__dirname, "..", "..");
    const fichiers = fs.readdirSync(path.join(racine, "js")).filter(f => f.endsWith(".js"));
    const auteurs = [];
    for (const f of fichiers) {
      const src = fs.readFileSync(path.join(racine, "js", f), "utf8");
      // Une AFFECTATION de locationConsent, pas sa lecture dans _eventRow.
      if (/locationConsent\s*[:=](?!==)/.test(src)) auteurs.push(f);
    }
    expect(auteurs).toEqual([]);
  });

  test("un événement sans coordonnées ne récupère jamais celles de l'appareil", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const row = _eventRow({ title: "T", date: Date.now() });
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });

  // ── Blocage : les deux sens décidables ───────────────────────────────────

  // ⚠️ On ne stubbe PAS `supaCreateConversation` : c'est une `async function`
  // top-level, et `window.X = …` ne rebinde pas une déclaration de script (même
  // piège que `state` et `supa`). On mesure donc l'effet OBSERVABLE — la
  // conversation existe-t-elle — qui est de toute façon ce qui compte.
  test("ouvrir un DM avec un compte bloqué est refusé, aucune conversation créée", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      state.user.blocked = ["u_bloque"];
      const avant = getConversations().length;
      await startDirectMessage("u_bloque", "Bloqué", "🚫", "#000", null);
      return { avant, apres: getConversations().length,
               ciblees: getConversations().filter(c => c.userId === "u_bloque").length };
    });
    expect(r.ciblees).toBe(0);
    expect(r.apres).toBe(r.avant);
  });

  test("ouvrir un DM avec un compte NON bloqué reste possible (la garde ne déborde pas)", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      state.user.blocked = ["u_bloque"];
      await startDirectMessage("u_ok", "Quelqu'un", "✨", "#7c3aed", null);
      return { convs: getConversations().filter(c => c.userId === "u_ok").length };
    });
    // Prémisse indispensable : sans elle, le test précédent passerait aussi bien
    // si `startDirectMessage` était cassée pour tout le monde.
    expect(r.convs).toBe(1);
  });

  // ── Échec FERMÉ : une garde qui plante doit refuser, pas laisser passer ──
  //
  // C'est la classe de defaut la plus traitre d'une garde T&S : `catch (e) {}`
  // suivi d'un `return { ok: true }` produit une garde qui a l'air de proteger
  // et qui s'ouvre en grand exactement quand l'etat est casse. Les trois tests
  // ci-dessous forcent l'exception et exigent le refus.

  test("isBlocked qui lève → verdict refusé (guard_error), jamais autorisé", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    const r = await page.evaluate(() => {
      const premisse = irlProposalVerdict("u_autre"); // sans panne : autorisé
      const vrai = window.isBlocked;
      // `isBlocked` est une `function` top-level : on remplace la propriété que
      // le verdict interroge réellement via `typeof isBlocked === "function"`.
      // Si le remplacement ne prend pas, la prémisse ci-dessous le révèle.
      window.isBlocked = function () { throw new Error("panne simulée"); };
      const sousPanne = irlProposalVerdict("u_autre");
      window.isBlocked = vrai;
      return { premisse, sousPanne };
    });
    expect(r.premisse.ok).toBe(true);
    expect(r.sousPanne.ok).toBe(false);
  });

  test("état illisible → traité comme mineur (retenu), jamais comme majeur", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const normal = irlProposerEstMineur();
      // Un accesseur qui lève reproduit un état corrompu sans casser la page.
      const sauvegarde = Object.getOwnPropertyDescriptor(state, "user");
      Object.defineProperty(state, "user", { configurable: true, get() { throw new Error("état illisible"); } });
      const casse = irlProposerEstMineur();
      Object.defineProperty(state, "user", sauvegarde);
      return { normal, casse, restaure: !!state.user };
    });
    expect(r.normal).toBe(false);   // prémisse : le compte de test est majeur
    expect(r.casse).toBe(true);     // échec fermé : on retient
    expect(r.restaure).toBe(true);  // l'état est bien rendu aux tests suivants
  });

  test("comparaison de position impossible → la coordonnée est retirée, pas publiée", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      // `irlUserLocation` porteur d'un accesseur qui lève : `irlEstPositionAppareil`
      // ne peut plus trancher, et `irlSanitizeLocation` ne doit pas rendre la
      // ligne intacte pour autant.
      const piege = {};
      Object.defineProperty(piege, "lat", { get() { throw new Error("position illisible"); } });
      irlUserLocation = piege;
      const row = _eventRow({ title: "T", lat: gps.lat, lng: gps.lng, date: Date.now() });
      irlUserLocation = null;
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    expect(r.lat).not.toBe(GPS.lat);
    expect(r.lng).not.toBe(GPS.lng);
    expect(r.lat == null || r.lat === 45.9).toBe(true); // retirée, ou au pire zonée
  });

  // ── Télémétrie ────────────────────────────────────────────────────────────

  test("les clés de télémétrie de la garde survivent au filtre PII", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    const cles = await page.evaluate(() => Object.keys(irlProposalMeta("blocked")));
    expect(cles.sort()).toEqual(["flag", "reason", "v"]);

    // ⚠️ La regex est LUE dans js/telemetry.js, jamais recopiée : une copie
    // dériverait au premier durcissement du filtre et l'audit deviendrait vert
    // sur le défaut qu'il existe pour attraper (cf. scripts/audit-telemetry-keys.js).
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "telemetry.js"), "utf8");
    const m = src.match(/var\s+DENY_KEY\s*=\s*(\/(?:\\.|[^/\\])+\/[a-z]*)\s*;/);
    expect(m, "DENY_KEY introuvable — le filtre a été renommé").not.toBeNull();
    const deny = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), m[1].slice(m[1].lastIndexOf("/") + 1));
    for (const c of cles) expect(deny.test(c), `la clé « ${c} » serait jetée en silence`).toBe(false);
  });

  test("la trace du verdict ne porte ni identifiant de compte ni texte", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    const capt = await page.evaluate(() => {
      const vus = [];
      window.tel = window.tel || {};
      const vrai = window.tel.action;
      window.tel.action = function (n, meta) { vus.push({ n, meta }); };
      state.user.blocked = ["u_secret_identifiant"];
      irlProposalAllowed("u_secret_identifiant");
      window.tel.action = vrai;
      return vus;
    });
    expect(capt).toHaveLength(1);
    expect(capt[0].n).toBe("irl_proposal_guard");
    expect(capt[0].meta).toEqual({ v: "v1", flag: "on", reason: "blocked" });
    expect(JSON.stringify(capt[0])).not.toContain("u_secret_identifiant");
  });
});
