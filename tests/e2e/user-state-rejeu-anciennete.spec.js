// ═════════════════════════════════════════════════════════════════════
// UN INSTANTANÉ ANCIEN N'ÉCRASE PAS UN ÉTAT PLUS RÉCENT (ETAT-01, audit du 2026-11-10)
//
// La file de secours `passio_pending_user_state_<uid>` garde le dernier blob d'état
// qui n'a pas abouti. Le démarrage LIT d'abord la ligne serveur (et avance le repère
// `state._stateSyncedAt` jusqu'à elle), PUIS rejoue la file avec
// `UPDATE … WHERE updated_at <= <repère>`. Le repère venant d'être aligné sur la
// ligne elle-même, la garde était toujours vraie : un instantané de 09:00 resté sur
// le téléphone remplaçait l'état de 10:00 écrit depuis l'ordinateur — sur le serveur,
// puis sur les deux appareils.
//
// Ce que la suite garde :
//   ① ligne serveur plus récente que la BASE du blob → rien n'est écrit, la file
//      est jetée, l'état vivant n'est pas ramené à l'instantané ;
//   ② ligne serveur restée à la base du blob → le rejeu s'applique (contre-épreuve) ;
//   ③ une file écrite avant le correctif (sans `base`) se compare au repère que son
//      blob porte (`data._stateSyncedAt`) ;
//   ④ sans base du tout, le blob ne peut que CRÉER une ligne absente, jamais en
//      remplacer une ;
//   ⑤ la mise en file note la base au moment où elle est faite ;
//   ⑥ appareil SEUL (revue du 12/11) : un beacon a écrit la ligne sans avancer le
//      repère, puis une sauvegarde hors ligne a été mise en file — au démarrage, la
//      ligne est plus récente que la base MAIS c'est cet appareil qui l'a écrite :
//      le rejeu passe. Joué par les vraies fonctions d'envoi, pas posé à la main.
// ═════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "7b1e2c3d-4a5b-4c6d-8e7f-90a1b2c3d4e5";
const T1 = "2026-11-12T09:00:00.000000+00:00";
const T2 = "2026-11-12T10:00:00.000000+00:00";

async function banc(page, ligneServeur) {
  await page.addInitScript((uid) => { try { localStorage.setItem("passio_uid", uid); } catch (e) {} }, UID);
  await bootOnboarded(page);
  await page.evaluate(({ ligne }) => {
    window.__serveur = ligne;   // { data, updated_at } ou null : la ligne user_state du compte
    window.__ops = [];
    const avant = (a, b) => new Date(a).getTime() <= new Date(b).getTime();
    window.supabase = { createClient: () => ({
      from: (table) => {
        const q = { _f: {} };
        q.update = (corps) => { q._op = "update"; q._corps = corps; return q; };
        q.insert = (corps) => {
          window.__ops.push({ table, op: "insert", corps });
          if (!window.__serveur) window.__serveur = { data: corps.data, updated_at: "2026-11-12T12:00:00+00:00" };
          const rendu = { data: [{ updated_at: window.__serveur.updated_at }], error: null };
          return { select: () => Promise.resolve(rendu), then: (ok) => ok(rendu) };
        };
        // L'envoi direct (supaSaveUserState) : refusé quand le banc simule le hors-ligne.
        q.upsert = (corps) => {
          window.__ops.push({ table, op: "upsert" });
          const hl = window.__horsLigne;
          if (!hl) window.__serveur = { data: corps.data, updated_at: "2026-11-12T11:00:00+00:00" };
          const rendu = hl ? { data: null, error: { message: "Failed to fetch" } } : { data: { updated_at: window.__serveur.updated_at }, error: null };
          const c = { select: () => c, maybeSingle: async () => rendu };
          return c;
        };
        q.eq = () => q;
        q.lte = (col, v) => { q._lte = v; return q; };
        q.select = () => {
          if (q._op !== "update") { q._op = "select"; return q; }
          window.__ops.push({ table, op: "update", lte: q._lte, corps: q._corps });
          const s = window.__serveur;
          if (s && avant(s.updated_at, q._lte)) {
            s.data = q._corps.data; s.updated_at = "2026-11-12T12:00:00+00:00";
            return Promise.resolve({ data: [{ updated_at: s.updated_at }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        };
        q.maybeSingle = async () => {
          window.__ops.push({ table, op: "select" });
          const s = window.__serveur;
          return { data: s ? { user_id: "x", updated_at: s.updated_at, ecriture: (s.data && s.data._ecriture) || null } : null, error: null };
        };
        q.then = (ok) => ok({ data: null, error: null });
        return q;
      },
    }) };
    window._supaReal = false;
    _initRealSupa();
    window._supaReal = true;
  }, { ligne: ligneServeur });
}

// Pose une file et le repère vivant tels que le démarrage les laisse, puis rejoue.
async function rejouer(page, { file, repereVivant, moodVivant }) {
  return page.evaluate(async ({ file, repereVivant, moodVivant, uid }) => {
    const cle = "passio_pending_user_state_" + uid;
    localStorage.setItem(cle, JSON.stringify(Object.assign({ user_id: uid }, file)));
    state._stateSyncedAt = repereVivant;      // ce que `supaLoadUserState` vient de poser
    state.currentMood = moodVivant;           // l'état de 10:00, appliqué par la lecture
    await _flushPendingUserState();
    return {
      file: localStorage.getItem(cle),
      updates: window.__ops.filter((o) => o.op === "update"),
      inserts: window.__ops.filter((o) => o.op === "insert").length,
      serveur: window.__serveur && window.__serveur.data,
      moodVivant: state.currentMood,
    };
  }, { file, repereVivant, moodVivant, uid: UID });
}

test.describe("ETAT-01 : le rejeu de l'état compare à la base du blob, pas au repère vivant", () => {
  test("① ligne plus récente que la base du blob : rien n'est écrit, la file est jetée, l'état vivant reste", async ({ page }) => {
    await banc(page, { data: { currentMood: "etat_10h" }, updated_at: T2 });
    const r = await rejouer(page, {
      file: { base: T1, data: { currentMood: "instantane_9h" }, updated_at: "2026-11-12T09:00:01.000Z" },
      repereVivant: T2, moodVivant: "etat_10h",
    });
    expect(r.updates.length, "l'écriture conditionnelle est bien tentée").toBe(1);
    expect(r.updates[0].lte, "et comparée à la BASE du blob").toBe(T1);
    expect(r.serveur, "le serveur garde l'état de 10:00").toEqual({ currentMood: "etat_10h" });
    expect(r.file, "la file obsolète est retirée").toBeNull();
    expect(r.moodVivant, "l'état vivant n'est pas ramené à l'instantané").toBe("etat_10h");
    expect(r.inserts).toBe(0);
  });

  test("② ligne restée à la base du blob : le rejeu s'applique (contre-épreuve)", async ({ page }) => {
    await banc(page, { data: { currentMood: "etat_9h" }, updated_at: T1 });
    const r = await rejouer(page, {
      file: { base: T1, data: { currentMood: "fait_hors_ligne" }, updated_at: "2026-11-12T09:05:00.000Z" },
      repereVivant: T1, moodVivant: "etat_9h",
    });
    expect(r.serveur).toEqual({ currentMood: "fait_hors_ligne" });
    expect(r.file).toBeNull();
    expect(r.moodVivant, "l'état vivant reçoit ce qui vient d'être rejoué").toBe("fait_hors_ligne");
  });

  test("③ file d'avant le correctif (sans base) : comparée au repère que son blob porte", async ({ page }) => {
    await banc(page, { data: { currentMood: "etat_10h" }, updated_at: T2 });
    const r = await rejouer(page, {
      file: { data: { currentMood: "instantane_9h", _stateSyncedAt: T1 }, updated_at: "2026-11-12T09:00:01.000Z" },
      repereVivant: T2, moodVivant: "etat_10h",
    });
    expect(r.updates[0].lte).toBe(T1);
    expect(r.serveur).toEqual({ currentMood: "etat_10h" });
    expect(r.file).toBeNull();
  });

  test("④ aucune base : le blob crée une ligne absente, jamais n'en remplace une", async ({ page }) => {
    await banc(page, { data: { currentMood: "etat_10h" }, updated_at: T2 });
    const r = await rejouer(page, {
      file: { data: { currentMood: "orphelin" }, updated_at: "2026-11-12T11:00:00.000Z" },
      repereVivant: T2, moodVivant: "etat_10h",
    });
    expect(r.serveur, "une ligne existante n'est pas remplacée").toEqual({ currentMood: "etat_10h" });
    expect(r.file).toBeNull();

    // Même file, mais sans ligne serveur : le premier appareil du compte la crée.
    await page.evaluate(() => { window.__serveur = null; window.__ops = []; });
    const r2 = await rejouer(page, {
      file: { data: { currentMood: "premier_appareil" }, updated_at: "2026-11-12T11:00:00.000Z" },
      repereVivant: null, moodVivant: "x",
    });
    expect(r2.inserts, "la ligne absente est créée").toBe(1);
    expect(r2.serveur).toEqual({ currentMood: "premier_appareil" });
  });

  test("⑤ la mise en file note la base au moment où elle est faite", async ({ page }) => {
    await banc(page, null);
    const base = await page.evaluate((uid) => {
      state._stateSyncedAt = "2026-11-12T08:30:00+00:00";
      _queuePendingUserState({ user_id: uid, data: { currentMood: "m" }, updated_at: new Date().toISOString() });
      state._stateSyncedAt = "2026-11-12T10:00:00+00:00";   // une lecture ultérieure avance le repère vivant
      return JSON.parse(localStorage.getItem("passio_pending_user_state_" + uid)).base;
    }, UID);
    expect(base).toBe("2026-11-12T08:30:00+00:00");
  });

  test("⑥ appareil seul : beacon réussi, puis sauvegarde hors ligne — le rejeu passe", async ({ page }) => {
    await banc(page, { data: { currentMood: "etat_9h" }, updated_at: T1 });
    await page.route("**/rest/v1/user_state**", async (route) => {
      // Le beacon (fetch keepalive) : la base l'enregistre et horodate.
      const corps = JSON.parse(route.request().postData() || "{}");
      await page.evaluate((d) => { window.__serveur = { data: d, updated_at: "2026-11-12T10:30:00.123456+00:00" }; }, corps.data);
      await route.fulfill({ status: 201, body: "" });
    });
    const r = await page.evaluate(async (uid) => {
      state._stateSyncedAt = "2026-11-12T09:00:00.000000+00:00";   // = T1
      window.PASSIO_SUPABASE = window.PASSIO_SUPABASE || {};
      // ① passage en arrière-plan : le beacon part et réussit (le repère n'avance pas).
      state.currentMood = "avant_fermeture"; _stateDirty = true;
      supaSaveUserStateBeacon();
      for (let i = 0; i < 40 && !(window.__serveur && window.__serveur.data && window.__serveur.data.currentMood === "avant_fermeture"); i++) await new Promise((r) => setTimeout(r, 50));
      const beaconArrive = window.__serveur.data.currentMood === "avant_fermeture";
      // ② retour au premier plan, geste hors ligne : la sauvegarde échoue → file.
      window.__horsLigne = true;
      state.currentMood = "fait_hors_ligne"; _stateDirty = true;
      await supaSaveUserState();
      const file = JSON.parse(localStorage.getItem("passio_pending_user_state_" + uid) || "null");
      // ③ redémarrage : la lecture applique la ligne (celle du beacon) et avance le repère.
      window.__horsLigne = false;
      state._stateSyncedAt = window.__serveur.updated_at;
      state.currentMood = "avant_fermeture";
      await _flushPendingUserState();
      return { beaconArrive, base: file && file.base, serveur: window.__serveur.data.currentMood,
        reste: localStorage.getItem("passio_pending_user_state_" + uid), vivant: state.currentMood };
    }, UID);
    expect(r.beaconArrive, "le beacon a bien écrit la ligne").toBe(true);
    expect(r.base, "la file porte la base d'avant le beacon").toBe(T1);
    expect(r.serveur, "le geste hors ligne est rejoué").toBe("fait_hors_ligne");
    expect(r.vivant).toBe("fait_hors_ligne");
    expect(r.reste).toBeNull();
  });
});