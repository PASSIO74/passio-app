// ═══════════════════════════════════════════════════════════════════════════
// PRÉVENIR LES INSCRITS : LA BASE ÉCRIT, L'ÉCRAN DIT LE COMPTE (2026-11-22)
//
// Village à 100 (`npm run village:100`, contrôle A3) : l'organisatrice annule
// une activité de 99 inscrits, 60 sont prévenus (39 refus 400 du plafond
// `trg_rate_limit`, 60/min par émetteur), et l'écran dit « inscrits prévenus ».
// Le client demande désormais à la base (`prevenir_inscrits_activite`, via
// `supaPrevenirInscrits`, app-08) et affiche le COMPTE rendu. Ce banc mesure le
// câblage côté client, réseau coupé (aucune écriture réelle) :
//   ① annulation : UN appel serveur (genre, clé), aucune écriture par personne,
//      la push `event_cancelled` aux 20 premiers (gabarit depuis le 22/11),
//      « 99 personnes prévenues » ;
//   ② compte partiel ou nul → dit, en avertissement ; un REFUS ne retombe pas
//      sur l'ancien chemin (il rendrait 60 sur 99 en se croyant utile) ;
//   ③ fonction absente (PGRST202) → repli compté, une écriture par personne ;
//   ④ `supaPrevenirInscrits` : un seul réessai sur panne réseau, avec la MÊME
//      clé (la base en dérive les identifiants : le rejeu ne double rien) ;
//      PGRST202 → `absente` ; refus → pas de réessai ;
//   ⑤ message groupé : texte BRUT (la base échappe) ; modification : un appel ;
//      suppression : plus aucune écriture du client (la base prévient avant
//      l'effacement).
// Le chemin serveur lui-même : tests/sql/migration-prevenir-inscrits-serveur.test.sh.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate(() => {
    window._supaReal = true;
    window.__toasts = []; window.__notifs = []; window.__appels = []; window.__push = [];
    window.toast = (t, type) => window.__toasts.push(String(t) + (type ? " [" + type + "]" : ""));
    window.confirmerAction = async () => true;
    window.confirm = () => true;
    window.supaInsertNotif = async (to, kind) => { window.__notifs.push(kind + ":" + to); return true; };
    window._pousserPushNotif = (to, kind) => { window.__push.push(kind + ":" + to); };
    window.supaCancelEvent = async () => true;
    window.supaDeleteEvent = async () => true;
    window.supaUpdateEvent = async () => true;
    window.requireAdmission = async () => true;
    window.__verdict = null;
    // La vraie (app-08), gardée AVANT le remplacement : une déclaration de fonction
    // globale ne se supprime pas, elle s'écrase.
    window.__vraiePrevenir = window.supaPrevenirInscrits;
    window.supaPrevenirInscrits = async (id, genre, cle, message) => {
      window.__appels.push({ id, genre, cle, message });
      return window.__verdict || { ok: true, destinataires: 99, prevenues: 99 };
    };
    const inscrits = [];
    for (let i = 1; i <= 99; i++) inscrits.push("u_" + i);
    state.userEvents = [{ id: "ev_village", title: "Rando du village", passion: "musique", emoji: "🎸", city: "Paris", lat: 48.85, lng: 2.35,
      date: Date.now() + 3 * 86400000, time: "10:00", desc: "", organizerId: MY_UID, status: "active", maxAttendees: 20,
      attendees: [MY_UID].concat(inscrits.slice(0, 19)), maybes: [], waitlist: inscrits.slice(19), checkedIn: [] }];
    renderIRL();
  });
}

test.describe("Prévenir les inscrits — la base écrit, l'écran dit le compte", () => {
  test("① annulation : un appel serveur, aucune écriture par personne, 99 prévenues", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      await toggleCancelEvent("ev_village");
      return { statut: _findCanonicalEvent("ev_village").status, appels: window.__appels, notifs: window.__notifs.length, push: window.__push, toasts: window.__toasts };
    });
    expect(r.statut).toBe("cancelled");
    expect(r.appels).toHaveLength(1);
    expect(r.appels[0].genre).toBe("event_cancelled");
    expect(r.appels[0].message).toBeNull();
    expect(r.appels[0].cle, "une clé tirée au hasard, au format exigé par la base").toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    // RÉINJECTION : sur le code d'avant, 99 écritures `supaInsertNotif` partaient du navigateur.
    expect(r.notifs, "plus aucune écriture par personne depuis le navigateur").toBe(0);
    // `event_cancelled` a son gabarit de push depuis le 22/11 (lien-metier.js) : l'annulation
    // réveille aussi les inscrits app fermée — les 20 premiers (plafond de notify-call), venants d'abord.
    const attendus = [];
    for (let i = 1; i <= 20; i++) attendus.push("event_cancelled:u_" + i);
    expect(r.push, "push d'annulation : les 20 premiers inscrits, venants d'abord").toEqual(attendus);
    expect(r.toasts).toContain("Activité annulée — 99 personnes prévenues");
  });

  test("② compte partiel, nul, ou refus : l'écran le dit, et un refus ne retombe pas sur l'ancien chemin", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const essai = async (verdict) => {
        const ev = _findCanonicalEvent("ev_village"); ev.status = "active";
        window.__verdict = verdict; window.__toasts = []; window.__notifs = [];
        await toggleCancelEvent("ev_village");
        return { toasts: window.__toasts.slice(), notifs: window.__notifs.length };
      };
      return {
        partiel: await essai({ ok: true, destinataires: 99, prevenues: 60 }),
        nul: await essai({ ok: true, destinataires: 99, prevenues: 0 }),
        refus: await essai({ ok: false, motif: "refus_42501" }),
        personne: await essai({ ok: true, destinataires: 0, prevenues: 0 }),
        // Appareil pas encore synchronisé : la liste locale est vide, la base connaît 5 inscrits.
        listeVide: await (async () => {
          const ev = _findCanonicalEvent("ev_village"); ev.attendees = [MY_UID]; ev.waitlist = [];
          window.__appels = [];
          const r = await essai({ ok: true, destinataires: 5, prevenues: 5 });
          return Object.assign(r, { appels: window.__appels.length });
        })(),
      };
    });
    // RÉINJECTION (relecture red team) : sans appel serveur sur liste vide, « Activité annulée » sans rien dire.
    expect(r.listeVide.appels, "la base est appelée même si la liste locale est vide").toBe(1);
    expect(r.listeVide.toasts).toContain("Activité annulée — 5 personnes prévenues");
    // RÉINJECTION : sur le code d'avant, « Activité annulée — inscrits prévenus » dans les trois cas.
    expect(r.partiel.toasts).toContain("⚠️ Activité annulée, mais seulement 60 personnes sur 99 prévenues [warning]");
    expect(r.nul.toasts).toContain("⚠️ Activité annulée, mais les inscrits n'ont pas pu être prévenus [warning]");
    expect(r.refus.toasts).toContain("⚠️ Activité annulée, mais les inscrits n'ont pas pu être prévenus [warning]");
    expect(r.refus.notifs, "un refus serveur n'est PAS rejoué par l'ancien chemin").toBe(0);
    expect(r.personne.toasts).toContain("Activité annulée");
    for (const cas of [r.partiel, r.nul, r.refus, r.personne]) expect(cas.toasts.some((t) => /inscrits prévenus/.test(t))).toBe(false);
  });

  test("③ fonction absente : repli sur l'ancien chemin, COMPTÉ (60 sur 99 se dit)", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      window.__verdict = { ok: false, absente: true };
      let n = 0;
      window.supaInsertNotif = async (to, kind) => { window.__notifs.push(kind + ":" + to); return n++ < 60; };
      await toggleCancelEvent("ev_village");
      return { notifs: window.__notifs, toasts: window.__toasts };
    });
    expect(r.notifs).toHaveLength(99);
    expect(new Set(r.notifs).size).toBe(99);
    expect(r.notifs.every((x) => x.startsWith("event_cancelled:"))).toBe(true);
    expect(r.toasts).toContain("⚠️ Activité annulée, mais seulement 60 personnes sur 99 prévenues [warning]");
  });

  test("④ supaPrevenirInscrits : un réessai réseau avec la MÊME clé ; PGRST202 = absente ; un refus ne se rejoue pas", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const vraie = window.__vraiePrevenir; // la fonction d'app-08
      if (typeof vraie !== "function" || /__appels/.test(String(vraie))) throw new Error("la vraie supaPrevenirInscrits n'a pas été gardée");
      const appels = [];
      const avant = supa;
      const fauxRpc = (reponses) => {
        let i = 0;
        supa = { rpc: async (nom, params) => { appels.push({ nom, params }); const x = reponses[Math.min(i++, reponses.length - 1)]; if (x instanceof Error) throw x; return x; } };
      };
      const sorties = {};
      fauxRpc([new TypeError("Failed to fetch"), { data: { ok: true, destinataires: 99, prevenues: 99 }, error: null }]);
      sorties.reseau = await vraie("ev_village", "event_cancelled", "cleTest1234", null);
      sorties.appelsReseau = appels.splice(0);
      fauxRpc([{ data: null, error: { code: "PGRST202", message: "Could not find the function" } }]);
      sorties.absente = await vraie("ev_village", "event_cancelled", "cleTest1234", null);
      fauxRpc([{ data: null, error: { code: "42501", message: "refus" } }, { data: { ok: true, destinataires: 1, prevenues: 1 }, error: null }]);
      sorties.refus = await vraie("ev_village", "event_cancelled", "cleTest1234", null);
      sorties.appelsRefus = appels.splice(0).length - 1; // l'appel PGRST202 était dans le lot
      fauxRpc([{ data: { ok: false, motif: "pas_annulee" }, error: null }]);
      sorties.motif = await vraie("ev_village", "event_cancelled", "cleTest1234", null);
      // 42883 peut venir de l'INTÉRIEUR du corps : c'est un refus, pas une fonction absente.
      fauxRpc([{ data: null, error: { code: "42883", message: "function x does not exist" } }]);
      sorties.interne = await vraie("ev_village", "event_cancelled", "cleTest1234", null);
      supa = avant;
      return sorties;
    });
    expect(r.reseau).toEqual({ ok: true, destinataires: 99, prevenues: 99 });
    expect(r.appelsReseau).toHaveLength(2);
    expect(r.appelsReseau[0].nom).toBe("prevenir_inscrits_activite");
    expect(r.appelsReseau[1].params, "le réessai porte la MÊME clé : la base ne double rien").toEqual(r.appelsReseau[0].params);
    expect(r.appelsReseau[0].params).toEqual({ p_event_id: "ev_village", p_genre: "event_cancelled", p_cle: "cleTest1234", p_message: null });
    expect(r.absente).toEqual({ ok: false, absente: true });
    expect(r.refus).toEqual({ ok: false, motif: "refus_42501" });
    expect(r.appelsRefus, "un refus n'est pas rejoué").toBe(1);
    expect(r.motif).toEqual({ ok: false, motif: "pas_annulee", destinataires: null });
    expect(r.interne, "42883 n'est pas « absente » : pas de repli vers l'ancien chemin").toEqual({ ok: false, motif: "refus_42883" });
  });

  test("⑤ message groupé brut, modification en un appel avec push bornée, suppression sans écriture du client", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async () => {
      const out = {};
      openModal('<textarea id="evBroadcast">RDV <b>entrée</b> nord</textarea>');
      await _sendEventBroadcast("ev_village");
      out.message = window.__appels.slice(-1)[0];
      out.toastMessage = window.__toasts.slice(-1)[0];
      // La base refuse un message trop long une fois échappé : l'écran dit pourquoi.
      window.__verdict = { ok: false, motif: "message_trop_long" };
      openModal('<textarea id="evBroadcast">' + '"'.repeat(200) + '</textarea>');
      await _sendEventBroadcast("ev_village");
      out.toastTropLong = window.__toasts.slice(-1)[0];
      window.__verdict = null;
      window.__appels = []; window.__push = [];
      const v = await _prevenirInscrits(_findCanonicalEvent("ev_village"), "event_update");
      out.maj = { appels: window.__appels.slice(), push: window.__push.slice(), v };
      window.__appels = []; window.__notifs = [];
      out.suppression = { rendu: _prevenirSuppressionActivite(_findCanonicalEvent("ev_village")), appels: window.__appels.length, notifs: window.__notifs.length };
      return out;
    });
    expect(r.message.genre).toBe("event_update");
    expect(r.message.message, "le texte part BRUT : c'est la base qui échappe").toBe("RDV <b>entrée</b> nord");
    expect(r.toastMessage).toBe("Message envoyé à 99 personnes");
    expect(r.toastTropLong).toMatch(/^⚠️ Message trop long une fois mis en forme/);
    expect(r.maj.appels).toHaveLength(1);
    expect(r.maj.appels[0].genre).toBe("event_update");
    expect(r.maj.v).toEqual({ total: 99, prevenues: 99 });
    expect(r.maj.push, "notify-call sert 20 pushes par minute : les 20 premiers, venants d'abord").toHaveLength(20);
    expect(r.maj.push[0]).toBe("event_update:u_1");
    expect(r.suppression).toEqual({ rendu: 99, appels: 0, notifs: 0 });
  });
});
