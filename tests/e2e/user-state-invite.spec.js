// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UN VISITEUR NE PART PLUS DANS `user_state` — LA PORTE ÉTAIT FERMÉE
// EXPRÈS, ET LE CLIENT Y FRAPPAIT À CHAQUE `saveState()`
//
// Mesuré en production sur 14 jours (2026-09-13, `telemetry_events`) :
//
//     261 × POST /rest/v1/user_state → 401, 101 sessions, 0 uuid d'auth
//
// ⚠️ LE ZÉRO EST LA PREUVE, PAS UN DÉTAIL. `telemetry.js` ne transmet un
// `user_id` que si `MY_UID` est un uuid d'auth : 261 refus et 0 compte veut dire
// « 261 refus chez des clients SANS compte » — donc le chemin visiteur.
//
// CAUSE. `getMyUserId()` (app-08) FABRIQUE un `u_<aléatoire>` pour tout
// visiteur. Les gardes des chemins d'écriture d'état (`_scheduleStateSync`,
// `supaSaveUserState`, le beacon de `pagehide`, le rejeu de la file) testaient
// `!MY_UID` : le placeholder passait, et le client POSTait l'état d'un visiteur
// dans une table dont les quatre policies exigent `auth.uid()`.
// ⚠️ 401 ET NON 403 : PostgREST rend 403 sur un 42501 quand un compte est
// authentifié, 401 quand le rôle est ANONYME. La policy est juste ; c'est un
// appel client qui ne devait pas partir — même famille que le 401 sur `events`
// du 2026-09-12 (`evenements-cols-visiteur.spec.js`).
// ⚠️ ET LE DÉFAUT S'AMPLIFIAIT : le 401 mettait le blob en file
// (`passio_pending_user_state_u_xxx`), rejouée à CHAQUE démarrage par
// `_flushPendingUserState` — PATCH 200 (zéro ligne), SELECT, INSERT 401 — d'où
// 87 des 101 sessions avec ce rejeu. Aucune conséquence à l'écran : du bruit
// pur dans le tableau de bord qui sert à voir les vrais défauts.
//
// Ce que ce banc garde — et il ÉCHOUE sur le code d'avant (réinjection) :
//   ⓪ SOURCE : une seule autorité (`_uidEstUnCompte`, app-02), et les QUATRE
//      chemins passent par elle — plus aucun ne se contente de `!MY_UID` ;
//   ① sans compte → `saveState()` n'arme aucun envoi, et `supaSaveUserState()`
//      ne touche pas `user_state` ;
//   ② sans compte → le beacon n'émet rien et ne remplit AUCUNE file ;
//   ③ sans compte → une file laissée par l'ancien défaut n'est pas rejouée, et
//      elle est retirée de l'appareil ;
//   ④ compte réel → l'envoi part, l'upsert porte l'uuid, et le beacon émet :
//      le correctif ne ferme pas la porte à ceux qui y ont droit.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP02 = path.join(__dirname, "..", "..", "js", "app-02-state-utils.js");

// Un uuid Supabase : la SEULE forme qui prouve un compte. `getMyUserId()`
// fabrique un `u_<aléatoire>` pour tout visiteur — c'est ce que `bootOnboarded`
// laisse en place, donc le cas « sans compte » n'a rien à poser.
const UID_COMPTE = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

// Le corps d'une fonction top-level, bornée au prochain `\nfunction ` ou
// `\nasync function ` — assez pour distinguer « la garde est DANS la fonction »
// de « la garde existe quelque part dans le fichier ».
function corpsDeFonction(src, nom) {
  const i = src.search(new RegExp("\\n(?:async )?function " + nom + "\\("));
  if (i < 0) return "";
  const suite = src.slice(i + 1);
  const k = suite.search(/\n(?:async )?function /);
  return k < 0 ? suite : suite.slice(0, k);
}

/**
 * Démarre l'app puis REMPLACE `supa.from` par un faux client qui note chaque
 * opération sur chaque table, et `fetch` par une sonde qui note les URL.
 *
 * ⚠️ On MUTE `window.supa.from` : `supa` est un `let` de portée script, donc
 * `window.supa = x` créerait une propriété séparée que le code de l'app ne
 * regarde pas (piège déjà payé par `reprise-lectures-boot`).
 * ⚠️ `sansIsolationDesDonnees` : ce banc gère le réseau LUI-MÊME (tout Supabase
 * est coupé avant la navigation — un uuid de banc ne doit jamais atteindre la
 * production). Playwright évalue les routes dans l'ordre INVERSE de leur
 * enregistrement — sans cette porte, l'isolation par défaut de `bootOnboarded`
 * passerait devant la nôtre.
 */
async function banc(page, { compte }) {
  await page.route(/supabase\.co/, (route) => route.abort());
  if (compte) await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_COMPTE);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window.__ops = [];
    window.__fetchs = [];
    const requete = (table) => {
      const q = {};
      ["select", "eq", "lte", "maybeSingle", "single", "order", "limit", "in"]
        .forEach((m) => { q[m] = () => q; });
      ["upsert", "insert", "update", "delete"].forEach((op) => {
        q[op] = (payload) => { window.__ops.push({ table, op, payload }); return q; };
      });
      // Une réponse plausible : la relecture `updated_at` d'un upsert abouti.
      q.then = (ok, ko) => Promise.resolve({ data: { updated_at: "2026-09-13T10:00:00.000Z" }, error: null }).then(ok, ko);
      return q;
    };
    window.supa.from = (table) => requete(table);
    window._supaReal = true;
    window.fetch = (url, opts) => {
      window.__fetchs.push({ url: String(url), method: (opts && opts.method) || "GET" });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    };
  });
  // Un envoi de démarrage encore EN VOL compterait dans le relevé : on laisse la
  // poussière retomber, puis on remet les compteurs à zéro.
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__ops = []; window.__fetchs = []; });
}

const opsUserState = (page) => page.evaluate(() =>
  window.__ops.filter((o) => o.table === "user_state"));
const fetchsUserState = (page) => page.evaluate(() =>
  window.__fetchs.filter((f) => f.url.indexOf("/rest/v1/user_state") !== -1));
const clesFile = (page) => page.evaluate(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf("passio_pending_user_state") === 0) out.push(k);
  }
  return out;
});

test.describe("user_state : l'état ne part qu'avec un compte", () => {
  test("⓪ source — une seule autorité, et les quatre chemins d'écriture passent par elle", () => {
    const src = fs.readFileSync(SOURCE_APP02, "utf8");
    const autorite = corpsDeFonction(src, "_uidEstUnCompte");
    expect(autorite, "l'autorité existe").not.toBe("");
    expect(autorite.includes("RE_UID_COMPTE.test("),
      "elle exige un uuid Supabase, pas la simple présence d'un identifiant").toBe(true);

    for (const nom of ["_scheduleStateSync", "_supaSaveUserStateOnce", "supaSaveUserStateBeacon", "_flushPendingUserState"]) {
      const corps = corpsDeFonction(src, nom);
      expect(corps, `${nom} existe toujours`).not.toBe("");
      expect(corps.includes("_uidEstUnCompte("),
        `${nom} passe par l'autorité unique`).toBe(true);
      // La forme EXACTE du défaut : une garde qui se contente de « MY_UID est posé ».
      expect(corps.includes('typeof MY_UID === "undefined" || !MY_UID'),
        `${nom} ne se contente plus de la présence de MY_UID`).toBe(false);
    }
  });

  test("① sans compte — saveState n'arme rien, supaSaveUserState ne touche pas user_state", async ({ page }) => {
    await banc(page, { compte: false });
    const r = await page.evaluate(async () => {
      const uid = (typeof MY_UID === "string") ? MY_UID : null;
      state.currentMood = "mood_banc";
      saveState();
      // ⚠️ Lu par son NOM NU : `_stateSyncTimer` est un `let` de portée script.
      const arme = _stateSyncTimer !== null;
      await supaSaveUserState();
      return { uid, arme };
    });
    expect(r.uid, "le banc part bien d'un placeholder, pas d'un uuid").toMatch(/^u_/);
    expect(r.arme, "aucun envoi armé sans compte").toBe(false);
    expect(await opsUserState(page), "aucune écriture sur user_state").toEqual([]);
    expect(await fetchsUserState(page), "et aucune requête REST directe").toEqual([]);
  });

  test("② sans compte — le beacon n'émet rien et ne remplit aucune file", async ({ page }) => {
    await banc(page, { compte: false });
    await page.evaluate(() => {
      // Le drapeau « état sale » est ce qui, avec un compte, fait partir le
      // beacon : on le pose pour que seule la garde de compte décide.
      _stateDirty = true;
      supaSaveUserStateBeacon();
    });
    expect(await fetchsUserState(page), "le keepalive ne part pas sous le rôle anonyme").toEqual([]);
    expect(await clesFile(page), "et rien n'est mis en file pour un rejeu impossible").toEqual([]);
  });

  test("③ sans compte — une file laissée par l'ancien défaut n'est pas rejouée, et disparaît", async ({ page }) => {
    await banc(page, { compte: false });
    const r = await page.evaluate(async () => {
      const cle = "passio_pending_user_state_" + MY_UID;
      localStorage.setItem(cle, JSON.stringify({
        user_id: MY_UID, data: { currentMood: "fantome" }, updated_at: "2026-09-01T00:00:00.000Z",
      }));
      await _flushPendingUserState();
      return { cle, reste: localStorage.getItem(cle) };
    });
    expect(await opsUserState(page), "ni PATCH, ni SELECT, ni INSERT").toEqual([]);
    expect(r.reste, `la file ${r.cle} est retirée de l'appareil`).toBeNull();
  });

  test("④ compte réel — l'envoi part avec l'uuid, et le beacon émet", async ({ page }) => {
    await banc(page, { compte: true });
    const r = await page.evaluate(async () => {
      state.currentMood = "mood_banc";
      saveState();
      const arme = _stateSyncTimer !== null;
      await supaSaveUserState();
      _stateDirty = true;
      supaSaveUserStateBeacon();
      return { uid: MY_UID, arme };
    });
    expect(r.uid, "le banc part bien d'un uuid").toBe(UID_COMPTE);
    expect(r.arme, "un compte arme l'envoi différé").toBe(true);
    const ops = await opsUserState(page);
    expect(ops.length, "un upsert est parti").toBeGreaterThanOrEqual(1);
    expect(ops[0].op).toBe("upsert");
    expect(ops[0].payload && ops[0].payload.user_id, "et il porte l'uuid du compte").toBe(UID_COMPTE);
    const fetchs = await fetchsUserState(page);
    expect(fetchs.length, "le beacon émet pour un compte").toBe(1);
    expect(fetchs[0].method).toBe("POST");
  });
});
