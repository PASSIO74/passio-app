// ═══════════════════════════════════════════════════════════════════════════
// GARDE TRUST & SAFETY — PROPOSITION IRL (#134)
//
// #136 a fermé côté serveur l'âge prudent des deux comptes, le blocage dans les
// deux sens et les conversations forçables. Ce lot branche enfin le CTA, mais
// seulement après `irl_interaction_allowed = true` et avec une revalidation au
// clic. Le flag reste OFF par défaut et sert uniquement à l'exposition canari.
//
// Ce qui EST prouvé ici : le verdict de la garde dans les six cas décidables,
// son échec FERMÉ quand elle ne peut plus juger, l'invariant de localisation
// (le fix GPS n'entre pas dans un payload d'événement, ET un lieu choisi à
// quelques centaines de mètres reste exact), le refus d'ouvrir un DM avec un
// compte bloqué, et la survie des clés de télémétrie au filtre PII.
//
// ⚠️ L'invariant de localisation est tenu par TEST, pas par une réécriture des
// coordonnées. Une première version arrondissait dans `_eventRow` tout point
// tombant dans la même cellule de 0,01° que le fix GPS : elle déplaçait donc
// les lieux légitimement choisis à moins d'un kilomètre de chez soi. La
// proximité n'est pas la provenance — la contre-revue l'a arrêté avant fusion.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");

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

async function installIrlRpc(page, interactionResults) {
  await page.evaluate((results) => {
    window._supaReal = true;
    window.__irlRpcCalls = [];
    window.__irlInteractionResults = Array.isArray(results) ? results.slice() : [results];
    window.supa.auth.getSession = async () => ({
      data: { session: { user: { id: "u_auth_qa" } } }, error: null,
    });
    window.supa.rpc = async (name, args) => {
      window.__irlRpcCalls.push({ name, args });
      if (name === "declare_birth_year") return { data: true, error: null };
      if (name === "irl_interaction_allowed") {
        const next = window.__irlInteractionResults.length > 1
          ? window.__irlInteractionResults.shift()
          : window.__irlInteractionResults[0];
        if (next === "error") return { data: null, error: { message: "panne simulée" } };
        return { data: next, error: null };
      }
      return { data: null, error: { message: "RPC inattendu" } };
    };
  }, interactionResults);
}

async function openIrlDirectConversation(page, id = "conv_irl_qa", target = "u_target_secret") {
  await page.evaluate(async ({ convId, targetId }) => {
    state.hintsVus = { feed_auteur: true, profil_visite: true, second_profil: true };
    fermerHint();
    const convs = getConversations();
    if (!convs.some(c => c.id === convId)) convs.unshift({
      id: convId, userId: targetId, userName: "Autre passionné", userEmoji: "✨",
      userColor: "#7c3aed", passion: "musique", unread: 0, lastAt: Date.now(),
      messages: [], isGroup: false,
    });
    await openConversation(convId);
  }, { convId: id, targetId: target });
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

  test("le lien canari active l'aperçu sans persister le drapeau", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.removeItem("passio_irl_proposal_v1"));
    // ⚠️ ISOLATION DES DONNÉES DISTANTES — POSÉE ICI PARCE QUE CETTE SUITE
    // NAVIGUE ELLE-MÊME. `bootOnboarded` la pose par défaut, mais sa portée est
    // L'APPEL, pas le fichier : un `page.goto` maison garde son chemin exposé, et
    // le verdict du test dépend alors du CONTENU DE LA PRODUCTION. C'est ce qui a
    // rendu `main` rouge six fois en quatre jours et fait sauter autant de
    // déploiements. Verrou mécanique : `scripts/audit-tests-isolation.js`.
    await sansDonneesDistantes(page);
    await page.goto("/index.html?passio_preview=irl-proposal-v1");
    await page.waitForFunction(() => typeof irlProposalEnabled === "function", null, { timeout: 20000 });
    expect(await page.evaluate(() => irlProposalEnabled())).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("passio_irl_proposal_v1"))).toBeNull();
    await page.evaluate(() => localStorage.setItem("passio_irl_proposal_v1", "0"));
    expect(await page.evaluate(() => irlProposalEnabled())).toBe(false);
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

  test("un lieu choisi à quelques centaines de mètres du GPS reste EXACT", async ({ page }) => {
    await bootOnboarded(page);
    // ⚠️ LE TEST DE NON-RÉGRESSION DE LA CONTRE-REVUE. Une première version du
    // lot arrondissait dans `_eventRow` toute coordonnée tombant dans la même
    // cellule de 0,01° que le fix GPS — soit ~1,1 km. Un café choisi à
    // l'autocomplétion à 300 m de chez soi partageait donc cette cellule et se
    // faisait déplacer au centre. La proximité n'est PAS la provenance.
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const lieu = { lat: 45.897900, lng: 6.128100 }; // ~300 m, MÊME cellule 0,01°
      const row = _eventRow({ title: "Café", lat: lieu.lat, lng: lieu.lng, date: Date.now() });
      const p = 100;
      return {
        lat: row.lat, lng: row.lng,
        memeCellule: Math.round(gps.lat * p) === Math.round(lieu.lat * p)
                  && Math.round(gps.lng * p) === Math.round(lieu.lng * p),
      };
    }, GPS);
    // Prémisse : sans elle, le test passerait sur un lieu trop éloigné pour que
    // l'ancien défaut se déclenche, et ne garderait donc rien.
    expect(r.memeCellule).toBe(true);
    expect(r.lat).toBe(45.8979);
    expect(r.lng).toBe(6.1281);
  });

  test("le lieu part intact même quand il EST exactement la position de l'appareil", async ({ page }) => {
    await bootOnboarded(page);
    // Corollaire assumé de la règle ci-dessus : aucune coordonnée n'est réécrite
    // dans ce lot. Le jour où un parcours publiera la position de l'appareil, il
    // portera une provenance explicite (`locationSource: "device"`) et c'est CE
    // chemin-là, et lui seul, qui sera zoné — pas une coïncidence géographique.
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const row = _eventRow({ title: "T", lat: gps.lat, lng: gps.lng, date: Date.now() });
      return { lat: row.lat, lng: row.lng };
    }, GPS);
    expect(r.lat).toBe(GPS.lat);
    expect(r.lng).toBe(GPS.lng);
  });

  test("un événement sans coordonnées ne récupère jamais celles de l'appareil", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate((gps) => {
      irlUserLocation = { lat: gps.lat, lng: gps.lng };
      const row = _eventRow({ title: "T", date: Date.now() });
      return { lat: row.lat, lng: row.lng, gpsBienPose: !!irlUserLocation };
    }, GPS);
    expect(r.gpsBienPose).toBe(true); // prémisse : le fix GPS est bien en mémoire
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });

  test("aucun code ne recopie irlUserLocation dans un payload d'événement", async () => {
    // Verrou STATIQUE, complément du test dynamique ci-dessus : celui-là ne
    // couvre qu'un appel de `_eventRow`, celui-ci couvre tous les chemins qui
    // construisent un événement. Si un jour l'un d'eux injecte le fix GPS, ce
    // test rougit — et son auteur devra porter une provenance explicite.
    const racine = path.join(__dirname, "..", "..");
    const coupables = [];
    for (const f of fs.readdirSync(path.join(racine, "js")).filter(x => x.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(racine, "js", f), "utf8");
      src.split("\n").forEach((ligne, n) => {
        if (!/irlUserLocation/.test(ligne)) return;
        // Une AFFECTATION vers un porteur de coordonnées d'événement.
        if (/_evPickedCoords\s*=|\bev\.lat\s*=|\bev\.lng\s*=|\brow\.lat\s*=|\brow\.lng\s*=/.test(ligne)) {
          coupables.push(`${f}:${n + 1} — ${ligne.trim()}`);
        }
      });
    }
    expect(coupables).toEqual([]);
  });

  test("le drapeau est documenté comme n'étant PAS une frontière de sécurité", async () => {
    // Le drapeau vit dans le localStorage : n'importe qui le pose à "1". Tant
    // que #136 n'a pas fermé âge + blocage bidirectionnel + conversation
    // forçable cote serveur, aucun CTA produit ne doit s'y fier comme a une
    // permission. Ce test garde l'avertissement dans le code : le supprimer,
    // c'est perdre la seule chose qui empêche le prochain lecteur de s'y fier.
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-07-ia-explore-irl.js"), "utf8");
    expect(src).toContain("N'EST PAS UNE FRONTIÈRE DE SÉCURITÉ");
    expect(src).toContain("#136");
  });

  // ── CTA conversation : verdict serveur obligatoire ──────────────────────

  test("serveur true : CTA accessible de 44 px et quatrième aide, sans PII télémétrique", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await installIrlRpc(page, true);
    await page.evaluate(() => {
      window.__irlTelemetry = [];
      window.tel = window.tel || {};
      window.__irlTelOriginal = window.tel.action;
      window.tel.action = (name, meta) => window.__irlTelemetry.push({ name, meta });
    });
    await openIrlDirectConversation(page);

    const cta = page.locator("[data-irl-proposal-action]");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("aria-label", "Proposer un moment IRL");
    const box = await cta.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.passio-hint[data-hint="conversation_irl"]')).toBeVisible();
    await expect(page.locator('.passio-hint[data-hint="conversation_irl"]')).toContainText("moment IRL");

    const proof = await page.evaluate(() => ({ calls: window.__irlRpcCalls, telemetry: window.__irlTelemetry }));
    expect(proof.calls.map(c => c.name)).toEqual(["declare_birth_year", "irl_interaction_allowed"]);
    expect(proof.telemetry.some(e => e.name === "irl_proposal_cta_shown")).toBe(true);
    expect(JSON.stringify(proof.telemetry)).not.toContain("u_target_secret");
    expect(JSON.stringify(proof.telemetry)).not.toContain("Autre passionné");
  });

  for (const denied of [false, null, "error"]) {
    test(`serveur ${String(denied)} : aucun CTA ni aide n'est révélé`, async ({ page }) => {
      await bootOnboarded(page);
      await setFlag(page, "1");
      await installIrlRpc(page, denied);
      await openIrlDirectConversation(page);
      await page.waitForTimeout(250);
      await expect(page.locator("[data-irl-proposal-action]")).toHaveCount(0);
      await expect(page.locator('.passio-hint[data-hint="conversation_irl"]')).toHaveCount(0);
    });
  }

  test("OFF par défaut et conversation de groupe : aucun RPC d'éligibilité", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, null);
    await installIrlRpc(page, true);
    await openIrlDirectConversation(page, "conv_off", "u_target_off");
    expect(await page.evaluate(() => window.__irlRpcCalls)).toEqual([]);
    await expect(page.locator("[data-irl-proposal-action]")).toHaveCount(0);

    await setFlag(page, "1");
    await page.evaluate(async () => {
      const convs = getConversations();
      convs.unshift({ id: "conv_group_irl", groupName: "Groupe", userIds: ["u_a", "u_b"],
        unread: 0, lastAt: Date.now(), messages: [], isGroup: true });
      await openConversation("conv_group_irl");
    });
    // La synchronisation prudente de l'année peut démarrer en arrière-plan dès
    // l'activation du canari ; le groupe, lui, ne doit jamais demander le
    // verdict d'interaction qui cible un autre compte.
    expect(await page.evaluate(() => window.__irlRpcCalls.filter(c => c.name === "irl_interaction_allowed"))).toEqual([]);
    await expect(page.locator("[data-irl-proposal-action]")).toHaveCount(0);
  });

  test("le clic revalide : un refus tardif retire le CTA sans ouvrir le formulaire", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await installIrlRpc(page, [true, false]);
    await openIrlDirectConversation(page);
    const cta = page.locator("[data-irl-proposal-action]");
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(cta).toHaveCount(0);
    await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);
    const names = await page.evaluate(() => window.__irlRpcCalls.map(c => c.name));
    expect(names).toEqual([
      "declare_birth_year", "irl_interaction_allowed",
      "declare_birth_year", "irl_interaction_allowed",
    ]);
  });

  test("le clic autorisé ouvre le formulaire IRL existant et reste sans identifiant dans les traces", async ({ page }) => {
    await bootOnboarded(page);
    await setFlag(page, "1");
    await installIrlRpc(page, [true, true]);
    await page.evaluate(() => {
      window.__irlTelemetry = [];
      window.tel = window.tel || {};
      window.tel.action = (name, meta) => window.__irlTelemetry.push({ name, meta });
    });
    await openIrlDirectConversation(page);
    await page.locator("[data-irl-proposal-action]").click();
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Créer un événement IRL");
    const events = await page.evaluate(() => window.__irlTelemetry);
    expect(events.some(e => e.name === "irl_proposal_cta_clicked")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("u_target_secret");
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
