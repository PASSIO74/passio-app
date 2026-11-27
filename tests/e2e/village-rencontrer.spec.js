// ═══════════════════════════════════════════════════════════════════════════
// LE VILLAGE, CÔTÉ « RENCONTRER » — dix comptes RÉELS, sur le STAGING, qui
// créent, demandent, valident, attendent, invitent, pointent, annulent — et un
// fâcheux qui attaque l'API en direct.
//
// `village-10-comptes` fait vivre le groupe autour du contenu ET d'UNE activité.
// Cette suite ne fait que Rencontrer, et va là où la première ne va pas :
//   P · la DEMANDE et sa validation par l'organisation (adresse, discussion),
//       la file d'attente, la promotion, les gestes croisés, les refus du serveur ;
//   A · les écritures DIRECTES qu'un compte peut tenter (ligne d'autrui, ordre de
//       la file, pointage, note, validation, notification forgée) ;
//   V · l'activité PRIVÉE : invité, inconnu, visiteur, lien, lien renouvelé, retrait ;
//   C · le pointage par code ;
//   S · la série, la modification, l'annulation, la suppression.
//
// Même cadre que le village : chaque personnage = un BrowserContext, on pilote
// les VRAIS handlers, et on juge sur l'écran, sur la base (clé de service), sur
// ce que la base REFUSE. EXIGÉ = un contrat écrit dans le code ou la doc ;
// OBSERVATION = ce qu'un testeur noterait, rapporté, jamais bloquant.
//
// ⚠️ STAGING SEULEMENT, OPT-IN : `npm run village:rencontrer` (scripts/village.mjs
// pose la cible et les clés). Les dix personnages sont ceux du couloir « village »
// du jeu PERSISTANT (repris neufs, contenus purgés en fin de séance, jamais
// supprimés) : le bail du couloir empêche les deux villages de tourner ensemble.
//
// Rapport : test-results/village-rencontrer/rapport.md (+ rapport.json).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { signupUser } = require("./qa-helper");
const { configAdmin } = require("./compte-e2e");
const jeu = require("./comptes-persistants");
const { cibleSupabase } = require("./cible-supabase");

const STAGING_REF = "fcksxofaelcdmmifnwjo";
const SORTIE = path.resolve(__dirname, "..", "..", "test-results", "village-rencontrer");

const PERSONAS = [
  { nom: "Léa",   role: "organisatrice" },
  { nom: "Marc",  role: "entre par le lien d'invitation" },
  { nom: "Inès",  role: "demande, est validée, pointe" },
  { nom: "Hugo",  role: "demande, se désiste, est retiré d'une activité privée" },
  { nom: "Chloé", role: "première de la file d'attente" },
  { nom: "Tom",   role: "second de la file, non invité de l'activité privée" },
  { nom: "Sarah", role: "gestes croisés, lien périmé" },
  { nom: "Nina",  role: "compte privé" },
  { nom: "Kevin", role: "le fâcheux : attaque l'API en direct" },
  { nom: "Jade",  role: "regarde une fiche pendant qu'elle change", mobile: true },
];
const [LEA, MARC, INES, HUGO, CHLOE, TOM, SARAH, NINA, KEVIN, JADE] = PERSONAS.map((_, i) => i);
const COULOIR = "village";
const BAIL_SEANCE_MS = 40 * 60 * 1000;
const emailPersonnage = (i) => jeu.emailPersistant(COULOIR, 0, i);

function refDeLaCle(cle) {
  try { return JSON.parse(Buffer.from(String(cle).split(".")[1], "base64url").toString("utf8")).ref || null; }
  catch (e) { return null; }
}
function cibleEstLeStaging() {
  const url = `https://${STAGING_REF}.supabase.co`;
  const navigateur = cibleSupabase();
  const cfg = configAdmin();
  return (!process.env.PASSIO_STAGING_REF || process.env.PASSIO_STAGING_REF === STAGING_REF)
    && !!navigateur && navigateur.url === url
    && !!cfg && cfg.url === url && refDeLaCle(cfg.cle) === STAGING_REF;
}
function admin() {
  const cfg = configAdmin();
  const h = { apikey: cfg.cle, Authorization: `Bearer ${cfg.cle}`, "Content-Type": "application/json" };
  return {
    async lire(table, query) {
      const r = await fetch(`${cfg.url}/rest/v1/${table}?${query}`, { headers: h });
      if (!r.ok) throw new Error(`${table} : HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r.json();
    },
  };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendre(fn, { delai = 15000, pas = 1000 } = {}) {
  const fin = Date.now() + delai;
  let v;
  for (;;) {
    v = await fn();
    if (v) return v;
    if (Date.now() > fin) return v;
    await pause(pas);
  }
}

test.describe("Le village — Rencontrer, dix comptes réels", () => {
  test.skip(!process.env.PASSIO_E2E_VILLAGE_RENCONTRER, "opt-in : npm run village:rencontrer (staging seulement)");
  test.skip(!!(process.env.CI || process.env.GITHUB_ACTIONS), "jamais en CI : dix navigateurs");

  test("Rencontrer, de la demande à la suppression", async ({ browser }) => {
    test.setTimeout(30 * 60 * 1000);
    if (!cibleEstLeStaging()) throw new Error("CIBLE_HORS_STAGING : ce village n'écrit que sur le staging (npm run village:rencontrer pose la cible).");

    const db = admin();
    const t0 = Date.now();
    const log = (m) => console.log(`[rencontrer ${String(((Date.now() - t0) / 1000) | 0).padStart(4)}s] ${m}`);
    fs.mkdirSync(path.join(SORTIE, "captures"), { recursive: true });
    const rapport = { date: new Date().toISOString(), cible: `staging ${STAGING_REF}`, personas: [], controles: [], erreursConsole: {}, erreursHttp: {}, captures: [], dureeS: 0, purge: null };
    let acteCourant = "Installation";
    async function verifier(code, libelle, fn, { exige = true } = {}) {
      const debut = Date.now();
      let ok = false, detail = "";
      try { const r = await fn(); ok = !!(r && r.ok); detail = (r && r.detail) || ""; }
      catch (e) { ok = false; detail = "exception : " + String((e && e.message) || e).slice(0, 300); }
      const statut = ok ? "OK" : (exige ? "ÉCHEC" : "À REGARDER");
      rapport.controles.push({ acte: acteCourant, code, libelle, exige, statut, detail, ms: Date.now() - debut });
      log(`${ok ? "✅" : exige ? "❌" : "👀"} [${code}] ${libelle}${detail ? " — " + detail : ""}`);
      return ok;
    }
    const contexts = [], pages = [], uids = [];
    // ⚠️ Un geste qui attend un humain (feuille de confirmation) FIGERAIT la séance
    // jusqu'à son délai de 30 min, bail des dix comptes compris : il échoue en 60 s.
    const ev = (i, fn, arg) => {
      let minuteur;
      const borne = new Promise((_, ko) => { minuteur = setTimeout(() => ko(new Error("geste figé (60 s) chez " + PERSONAS[i].nom)), 60000); });
      return Promise.race([pages[i].evaluate(fn, arg), borne]).finally(() => clearTimeout(minuteur));
    };
    const nom = (i) => PERSONAS[i].nom;
    async function capturer(etiquette, qui) {
      for (const i of qui) {
        const f = `${etiquette}-${i + 1}-${nom(i).normalize("NFD").replace(/[^a-zA-Z]/g, "")}.png`;
        try { await pages[i].screenshot({ path: path.join(SORTIE, "captures", f) }); rapport.captures.push(f); } catch (e) {}
      }
    }
    // ── Petits gestes réutilisés ───────────────────────────────────────────
    const dansJours = (j, h = 19) => { const d = new Date(Date.now() + j * 86400000); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const creer = (i, champs) => ev(i, async (c) => {
      const id = "evt_" + uid();
      const ok = await supaPublishEvent(Object.assign({ id, passion: "musique", emoji: "🎯" }, c));
      if (!ok) return null;
      await supaJoinEvent(id);
      return id;
    }, champs);
    // L'activité entre dans la mémoire du personnage comme après une lecture de Rencontrer.
    const charger = (i, id) => ev(i, async (id) => {
      let e = null;
      try { e = ((await supaLoadEvents(null, id)) || [])[0] || null; } catch (x) { return false; }
      if (!e) return false;
      fusionnerEvenementsServeur([e]);
      return true;
    }, id);
    const lignes = (id) => db.lire("event_attendees", `select=user_id,rsvp,created_at,checked_in_at,rating&event_id=eq.${id}`);
    const ligneDe = async (id, i) => (await lignes(id)).find((a) => a.user_id === uids[i]) || null;
    const rsvpDe = async (id, i) => { const l = await ligneDe(id, i); return l ? l.rsvp : null; };
    const ecran = (i, id) => ev(i, (id) => myRsvp(id), id);
    const poserToasts = (i) => ev(i, () => { window.__toasts = []; if (!window.__toastPose) { window.__toastPose = true; const t = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); }; } });
    const toasts = (i) => ev(i, () => (window.__toasts || []).slice());
    const repondre = (i, id, r) => ev(i, ([id, r]) => setEventRsvp(id, r), [id, r]);
    const valider = (id, i, accepter) => ev(LEA, async ([id, u, a]) => { const r = await supa.rpc("valider_participant", { p_event_id: id, p_user_id: u, p_accepter: a }); return { data: r.data, erreur: r.error ? String(r.error.code || r.error.message) : null }; }, [id, uids[i], accepter]);
    const vient = (i, id) => ev(i, async (id) => { const r = await supa.rpc("vient_a_activite", { p_event_id: id }); return r.error ? "erreur " + (r.error.code || r.error.message) : r.data; }, id);
    const adresse = (i, id) => ev(i, async (id) => { const r = await supaLireAdresses([id]); return r.lu ? ((r.adresses[id] || {}).address || "") : "(illisible)"; }, id);

    try {
      // ═══ INSTALLATION ═══════════════════════════════════════════════════
      for (let i = 0; i < PERSONAS.length; i++) {
        const p = PERSONAS[i];
        const ctx = await browser.newContext(p.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {});
        const page = await ctx.newPage();
        rapport.erreursConsole[p.nom] = []; rapport.erreursHttp[p.nom] = [];
        page.on("console", (m) => { if (m.type() === "error") rapport.erreursConsole[p.nom].push(m.text().replace(/apikey=[^&\s"']+/gi, "apikey=…").slice(0, 200)); });
        page.on("pageerror", (e) => rapport.erreursConsole[p.nom].push("pageerror: " + String(e.message).slice(0, 180)));
        page.on("response", (resp) => { if (resp.status() >= 400 && resp.url().includes("supabase.co")) rapport.erreursHttp[p.nom].push(`${resp.status()} ${resp.request().method()} ${resp.url().split("?")[0].slice(-70)}`); });
        contexts.push(ctx); pages.push(page); uids.push(null);
      }
      log("inscription des 10 personnages (par lots de 5)…");
      for (const lot of [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]) {
        await Promise.all(lot.map(async (i) => {
          try { uids[i] = await signupUser(pages[i], `${nom(i)} Village`, i, "village", { couloir: COULOIR, parallele: 0, rang: i, dureeBail: BAIL_SEANCE_MS }); }
          catch (e) { log(`❌ inscription de ${nom(i)} : ${String(e.message).slice(0, 200)}`); }
        }));
      }
      rapport.personas = PERSONAS.map((p, i) => ({ nom: p.nom, role: p.role, inscrit: !!uids[i] }));
      expect(uids.filter(Boolean).length, "les 10 personnages doivent être inscrits").toBe(10);
      const cibles = await Promise.all(pages.map((p) => p.evaluate(() => (typeof SUPABASE_URL === "string" ? SUPABASE_URL : null))));
      expect(cibles.every((u) => u === `https://${STAGING_REF}.supabase.co`), `les 10 navigateurs visent le staging (lu : ${[...new Set(cibles)].join(", ")})`).toBe(true);
      // La feuille « Avant de continuer » (comptes nés par l'API d'administration).
      await Promise.all(pages.map(async (page) => {
        const c = page.locator("#consentRequisCase");
        await page.waitForSelector("#consentRequisCase", { state: "visible", timeout: 15000 }).catch(() => {});
        if (await c.isVisible().catch(() => false)) {
          await c.check();
          await page.locator(".consent-requis-btn:not(.consent-requis-refus)").click();
          await page.waitForSelector("#consentRequisCase", { state: "detached", timeout: 10000 }).catch(() => {});
        }
      }));
      for (let i = 0; i < 10; i++) {
        await ev(i, async (prive) => {
          state.user.general = state.user.general || {};
          state.user.general.isPrivate = prive; state.user.general.privacyChoisi = true;
          saveState();
          await supaUpsertProfile();
          await supa.from("profiles").update({ is_private: prive }).eq("id", MY_UID);
        }, i === NINA);
      }
      for (const i of [MARC, INES, HUGO, CHLOE, TOM, SARAH, KEVIN, JADE]) await ev(i, (t) => supaFollowUser(t), uids[LEA]);
      for (let i = 0; i < 10; i++) await poserToasts(i);
      // Les feuilles « Annuler cette activité ? » / « Supprimer… ? » : acceptées, comme le ferait un humain.
      for (let i = 0; i < 10; i++) await ev(i, () => { window.confirmerAction = async () => true; });
      await verifier("I1", "dix comptes, neuf publics et Nina privée", async () => {
        const rows = await db.lire("profiles", `select=id,is_private&id=in.(${uids.join(",")})`);
        return { ok: rows.length === 10 && rows.filter((r) => r.is_private).length === 1, detail: `${rows.length} profils` };
      });

      // ═══ ACTE P — DEMANDER, ÊTRE VALIDÉ·E, ATTENDRE ═══════════════════════
      acteCourant = "P · Demande, validation, file d'attente";
      log("── ACTE P : demande, validation, file d'attente ──");
      const ADRESSE = "12 rue du Village, 69001 Lyon";
      const evP = await creer(LEA, { title: "Atelier à trois places [rencontrer]", city: "Lyon", address: ADRESSE, date: dansJours(4), maxAttendees: 3 });
      await verifier("P1", "Léa crée l'activité (3 places) et en occupe une", async () => {
        const r = evP ? await lignes(evP) : [];
        return { ok: !!evP && r.length === 1 && r[0].user_id === uids[LEA] && r[0].rsvp === "going", detail: evP ? `${r.length} ligne(s)` : "publication refusée" };
      });
      for (const i of [INES, HUGO, CHLOE, TOM, SARAH, KEVIN, JADE]) await attendre(() => charger(i, evP), { delai: 10000, pas: 1500 });

      await repondre(INES, evP, "going");
      await verifier("P2", "Inès demande à participer : la demande est en base", async () => {
        const r = await attendre(async () => (await rsvpDe(evP, INES)) === "going", { delai: 10000 });
        return { ok: !!r, detail: `base : ${await rsvpDe(evP, INES)}` };
      });
      await verifier("P3", "tant que Léa n'a pas validé, Inès n'est PAS « venante » et ne lit pas l'adresse", async () => {
        const v = await vient(INES, evP), a = await adresse(INES, evP);
        return { ok: v === false && a === "", detail: `vient_a_activite : ${v} · adresse lue : « ${a} »` };
      });
      await verifier("P4", "Léa est prévenue de la demande (cloche event_join, écrite par la base)", async () => {
        const r = await attendre(async () => { const x = await db.lire("notifications", `select=id,kind,origine&user_id=eq.${uids[LEA]}&from_id=eq.${uids[INES]}&kind=eq.event_join`); return x.length ? x : null; }, { delai: 10000 }) || [];
        return { ok: r.length === 1, detail: `${r.length} notification(s)` };
      });
      const accord = await valider(evP, INES, true);
      await verifier("P5", "Léa valide Inès : elle « vient », lit l'adresse, et en est prévenue", async () => {
        const v = await attendre(async () => (await vient(INES, evP)) === true, { delai: 8000 });
        const a = await adresse(INES, evP);
        const n = await db.lire("notifications", `select=id&user_id=eq.${uids[INES]}&kind=eq.event_accepted`);
        return { ok: accord.data === true && !!v && a === ADRESSE && n.length >= 1, detail: `RPC : ${JSON.stringify(accord)} · adresse : « ${a} » · notification : ${n.length}` };
      });
      await verifier("P6", "à l'écran d'Inès (sans recharger), la fiche montre l'adresse après la validation", async () => {
        await ev(INES, (id) => { goTo("irl"); openEventDetails(id); }, evP);
        const vu = await attendre(() => ev(INES, (a) => ((document.getElementById("eventDetailPage") || {}).innerText || "").includes(a), "12 rue du Village"), { delai: 20000, pas: 2000 });
        await capturer("P6-fiche-validee", [INES]);
        return { ok: !!vu };
      }, { exige: false });

      await repondre(HUGO, evP, "going");
      await attendre(async () => (await rsvpDe(evP, HUGO)) === "going", { delai: 10000 });
      // Complet (Léa, Inès, Hugo) : Chloé puis Tom entrent en file.
      for (const i of [CHLOE, TOM]) { await charger(i, evP); await repondre(i, evP, "going"); await pause(1200); }
      await verifier("P7", "complet : Chloé puis Tom sont en LISTE D'ATTENTE (jamais 4 venants pour 3 places)", async () => {
        const r = await attendre(async () => { const x = await lignes(evP); return x.filter((a) => a.rsvp === "waitlist").length === 2 ? x : null; }, { delai: 10000 }) || await lignes(evP);
        const g = r.filter((a) => a.rsvp === "going").length, w = r.filter((a) => a.rsvp === "waitlist").map((a) => a.user_id);
        return { ok: g === 3 && w.length === 2 && w.includes(uids[CHLOE]) && w.includes(uids[TOM]), detail: `going ${g}, file ${w.length}` };
      });

      // Hugo se désiste : la place va à la PREMIÈRE de la file.
      await repondre(HUGO, evP, null);
      await verifier("P8", "Hugo se désiste : Chloé (première arrivée) reçoit la place, Tom attend toujours", async () => {
        const ok = await attendre(async () => (await rsvpDe(evP, CHLOE)) === "going", { delai: 15000 });
        return { ok: !!ok && (await rsvpDe(evP, TOM)) === "waitlist" && (await rsvpDe(evP, HUGO)) === null, detail: `Chloé ${await rsvpDe(evP, CHLOE)}, Tom ${await rsvpDe(evP, TOM)}, Hugo ${await rsvpDe(evP, HUGO)}` };
      });
      await verifier("P9", "Chloé est prévenue de sa promotion", async () => {
        const r = await attendre(async () => { const x = await db.lire("notifications", `select=id,kind&user_id=eq.${uids[CHLOE]}&ref_id=eq.${evP}`); return x.length ? x : null; }, { delai: 10000 }) || [];
        return { ok: r.length >= 1, detail: r.map((n) => n.kind).join(", ") || "aucune" };
      });
      await verifier("P10", "l'écran de Chloé (sans recharger) sait qu'elle n'est plus en file", async () => {
        const e = await attendre(async () => (await ecran(CHLOE, evP)) === "going", { delai: 20000, pas: 2000 });
        return { ok: !!e, detail: `écran : ${await ecran(CHLOE, evP)} · base : ${await rsvpDe(evP, CHLOE)}` };
      }, { exige: false });
      // Chloé, promue, se retire. Tom doit recevoir la place — quel que soit ce que l'écran de Chloé croyait.
      await repondre(CHLOE, evP, null);
      await verifier("P11", "Chloé (promue) se retire : Tom reçoit la place à son tour", async () => {
        const ok = await attendre(async () => (await rsvpDe(evP, TOM)) === "going", { delai: 15000 });
        return { ok: !!ok, detail: `Tom ${await rsvpDe(evP, TOM)}, Chloé ${await rsvpDe(evP, CHLOE)}` };
      });

      // Gestes croisés, sur le vrai réseau : « Je participe » puis « Retirer » aussitôt.
      const evG = await creer(LEA, { title: "Gestes croisés [rencontrer]", city: "Lyon", date: dansJours(5) });
      await attendre(() => charger(SARAH, evG), { delai: 10000, pas: 1500 });
      await ev(SARAH, async (id) => { const a = setEventRsvp(id, "going"); await new Promise((r) => setTimeout(r, 80)); const b = setEventRsvp(id, null); await Promise.all([a, b]); }, evG);
      await pause(2500);
      await verifier("P12", "« Je participe » puis « Retirer » avant le verdict : l'écran de Sarah et la base disent la même chose", async () => {
        const b = await rsvpDe(evG, SARAH), e = await ecran(SARAH, evG);
        return { ok: (b || null) === (e || null), detail: `écran ${e} · base ${b}` };
      });
      await ev(SARAH, async (id) => { const a = setEventRsvp(id, "going"); await new Promise((r) => setTimeout(r, 80)); const b = setEventRsvp(id, "maybe"); await Promise.all([a, b]); }, evG);
      await pause(2500);
      await verifier("P13", "« Je participe » puis « Peut-être » aussitôt : la DERNIÈRE réponse est gardée des deux côtés", async () => {
        const b = await rsvpDe(evG, SARAH), e = await ecran(SARAH, evG);
        return { ok: b === "maybe" && e === "maybe", detail: `écran ${e} · base ${b}` };
      });

      // La fiche change sous les yeux de Jade.
      const evX = await creer(LEA, { title: "Annulée sous les yeux [rencontrer]", city: "Lyon", date: dansJours(6) });
      const evD = await creer(LEA, { title: "Supprimée sous les yeux [rencontrer]", city: "Lyon", date: dansJours(6) });
      for (const id of [evX, evD]) await attendre(() => charger(JADE, id), { delai: 10000, pas: 1500 });
      await ev(JADE, (id) => { goTo("irl"); openEventDetails(id); }, evX);
      await ev(LEA, (id) => supaCancelEvent(id, true), evX);
      await poserToasts(JADE);
      await repondre(JADE, evX, "going");
      await verifier("P14", "Léa annule pendant que Jade regarde : Jade lit « annulée », et sa fiche le montre aussitôt", async () => {
        const t = await toasts(JADE);
        const s = await ev(JADE, (id) => (_findCanonicalEvent(id) || {}).status, evX);
        await capturer("P14-annulee", [JADE]);
        return { ok: /annulée/i.test(t.join(" ")) && s === "cancelled" && (await rsvpDe(evX, JADE)) === null, detail: `message « ${t.join(" | ").slice(0, 90)} » · statut à l'écran ${s}` };
      });
      await ev(JADE, (id) => { try { closeEventDetail(); } catch (e) {} openEventDetails(id); }, evD);
      await ev(LEA, (id) => supaDeleteEvent(id), evD);
      await poserToasts(JADE);
      await repondre(JADE, evD, "going");
      await verifier("P15", "Léa supprime pendant que Jade regarde : « plus disponible », l'activité quitte l'écran de Jade", async () => {
        const t = await toasts(JADE);
        const la = await ev(JADE, (id) => !!_findCanonicalEvent(id), evD);
        return { ok: /plus disponible/i.test(t.join(" ")) && !la, detail: `message « ${t.join(" | ").slice(0, 90)} » · encore en mémoire : ${la}` };
      });

      // ═══ ACTE A — CE QUE LA BASE REFUSE (Kevin, en direct sur l'API) ═════
      acteCourant = "A · Écritures directes sur l'API";
      log("── ACTE A : écritures directes ──");
      await charger(KEVIN, evP);
      const k = (fn, arg) => ev(KEVIN, fn, arg);
      await verifier("A1", "Kevin ne peut pas inscrire quelqu'un d'autre (ligne au nom d'Inès)", async () => {
        const r = await k(async ([id, autre]) => { const w = await supa.from("event_attendees").insert({ event_id: id, user_id: autre, rsvp: "maybe" }); return w.error ? String(w.error.code) : "ACCEPTÉ"; }, [evG, uids[INES]]);
        return { ok: r !== "ACCEPTÉ" && (await rsvpDe(evG, INES)) === null, detail: `réponse : ${r}` };
      });
      await verifier("A2", "Kevin, non organisateur, ne peut ni valider ni refuser un participant", async () => {
        const r = await k(async ([id, u]) => { const w = await supa.rpc("valider_participant", { p_event_id: id, p_user_id: u, p_accepter: false }); return { data: w.data, e: w.error ? String(w.error.code) : null }; }, [evP, uids[INES]]);
        return { ok: r.data !== true && (await rsvpDe(evP, INES)) === "going", detail: JSON.stringify(r) };
      });
      await verifier("A3", "Kevin ne peut pas se promouvoir lui-même depuis la file (personne désignée = organisation seule)", async () => {
        await repondre(KEVIN, evP, "waitlist");
        await attendre(async () => (await rsvpDe(evP, KEVIN)) === "waitlist", { delai: 8000 });
        const r = await k(async ([id, moi]) => { const w = await supa.rpc("promouvoir_attente", { p_event_id: id, p_user_id: moi }); return w.error ? String(w.error.code) : JSON.stringify(w.data); }, [evP, uids[KEVIN]]);
        return { ok: (await rsvpDe(evP, KEVIN)) === "waitlist", detail: `RPC : ${r} · Kevin : ${await rsvpDe(evP, KEVIN)}` };
      });
      await verifier("A4", "l'ordre de la file ne se réécrit pas : Kevin ne peut pas antidater sa ligne", async () => {
        const avant = (await ligneDe(evP, KEVIN) || {}).created_at;
        const r = await k(async (id) => { const w = await supa.from("event_attendees").update({ created_at: "2020-01-01T00:00:00Z" }).eq("event_id", id).eq("user_id", MY_UID).select("event_id"); return w.error ? String(w.error.code) : String((w.data || []).length) + " ligne"; }, evP);
        const apres = (await ligneDe(evP, KEVIN) || {}).created_at;
        return { ok: !!avant && avant === apres, detail: `réponse : ${r} · created_at inchangé : ${avant === apres}` };
      });
      await verifier("A5", "pointage hors fenêtre (activité dans 4 jours) : refusé", async () => {
        const r = await k(async (id) => { const w = await supa.from("event_attendees").update({ checked_in_at: new Date().toISOString() }).eq("event_id", id).eq("user_id", MY_UID).select("event_id"); return w.error ? String(w.error.message).slice(0, 40) : "ACCEPTÉ"; }, evP);
        return { ok: r !== "ACCEPTÉ" && !((await ligneDe(evP, KEVIN)) || {}).checked_in_at, detail: `réponse : ${r}` };
      });
      await verifier("A6", "une note ne s'écrit pas avant l'activité, ni sans y avoir participé", async () => {
        const r = await k(async (id) => { const w = await supa.from("event_attendees").update({ rating: 1, feedback: "nul [rencontrer]" }).eq("event_id", id).eq("user_id", MY_UID).select("event_id"); return w.error ? String(w.error.code) : "ACCEPTÉ"; }, evP);
        const l = await ligneDe(evP, KEVIN);
        return { ok: r !== "ACCEPTÉ" && !(l && l.rating), detail: `réponse : ${r} · note en base : ${l ? l.rating : "—"}` };
      }, { exige: false });
      await verifier("A7", "Kevin ne peut pas modifier l'activité de Léa (places, titre)", async () => {
        const r = await k(async (id) => { const w = await supa.from("events").update({ max_attendees: 999, title: "piraté" }).eq("id", id).select("id"); return (w.data || []).length; }, evP);
        const e = await db.lire("events", `select=title,max_attendees&id=eq.${evP}`);
        return { ok: r === 0 && e[0].max_attendees === 3, detail: `${r} ligne(s) · places ${e[0].max_attendees}` };
      });
      await verifier("A8", "Kevin ne lit ni l'adresse, ni la liste nominative, ni la liste de validation", async () => {
        const a = await adresse(KEVIN, evP);
        const l = await k(async (id) => { const w = await supa.from("event_attendees").select("user_id").eq("event_id", id).neq("user_id", MY_UID); return (w.data || []).length; }, evP);
        const v = await k(async (id) => { const w = await supa.rpc("participants_validation", { p_event_id: id }); return w.error ? "refus " + w.error.code : (w.data || []).length; }, evP);
        return { ok: a === "" && l === 0 && (v === 0 || /^refus/.test(String(v))), detail: `adresse « ${a} » · autres inscrits lus : ${l} · liste de validation : ${v}` };
      });
      await verifier("A9", "Kevin ne peut pas forger « ta participation est validée » dans la cloche d'Inès", async () => {
        const r = await k(async ([cible, id]) => { const w = await supa.from("notifications").insert({ id: "n_faux_" + Date.now(), user_id: cible, from_id: MY_UID, kind: "event_accepted", ref_id: id, content: "a validé ta participation" }); return w.error ? String(w.error.code) : "ACCEPTÉ"; }, [uids[INES], evP]);
        const n = await db.lire("notifications", `select=id&user_id=eq.${uids[INES]}&from_id=eq.${uids[KEVIN]}&kind=eq.event_accepted`);
        return { ok: r !== "ACCEPTÉ" && n.length === 0, detail: `réponse : ${r} · en base : ${n.length}` };
      });
      await verifier("A10", "Kevin ne peut pas entrer dans la discussion des participants sans être validé", async () => {
        const conv = "evgrp_" + evP;
        const r = await k(async (c) => { const w = await supa.from("conv_members").insert({ conv_id: c, user_id: MY_UID }); return w.error ? String(w.error.code) : "ACCEPTÉ"; }, conv);
        const m = await db.lire("conv_members", `select=user_id&conv_id=eq.${conv}&user_id=eq.${uids[KEVIN]}`);
        return { ok: m.length === 0, detail: `réponse : ${r} · membre : ${m.length}` };
      });
      await repondre(KEVIN, evP, null);

      // ═══ ACTE V — L'ACTIVITÉ PRIVÉE ══════════════════════════════════════
      acteCourant = "V · Activité privée, sur invitation";
      log("── ACTE V : activité privée ──");
      const evV = await creer(LEA, { title: "Dîner privé [rencontrer]", city: "Lyon", address: "3 quai Secret, Lyon", date: dansJours(7), visibilite: "privee" });
      const invites = await ev(LEA, ([id, a, b]) => supaInviterActivite(id, [a, b]), [evV, uids[INES], uids[HUGO]]);
      await verifier("V1", "Léa crée une activité PRIVÉE et invite Inès et Hugo", async () => {
        const e = await db.lire("events", `select=visibilite&id=eq.${evV}`);
        const i = await db.lire("event_invites", `select=user_id&event_id=eq.${evV}`);
        return { ok: invites === true && e[0] && e[0].visibilite === "privee" && i.length === 2, detail: `visibilité ${e[0] && e[0].visibilite} · ${i.length} invité(s)` };
      });
      await verifier("V2", "Inès (invitée) la lit ; Tom (inconnu) ne la lit pas, ni par l'app ni par l'API", async () => {
        const i = await charger(INES, evV), t = await charger(TOM, evV);
        const api = await ev(TOM, async (id) => { const w = await supa.from("events").select("id,title").eq("id", id); return (w.data || []).length; }, evV);
        return { ok: i === true && t === false && api === 0, detail: `Inès ${i} · Tom ${t} · API ${api} ligne(s)` };
      });
      await verifier("V3", "sans compte (clé publique seule), l'activité privée n'existe pas", async () => {
        const c = cibleSupabase();
        const r = await fetch(`${c.url}/rest/v1/events?select=id,title&id=eq.${evV}`, { headers: { apikey: c.anon, Authorization: `Bearer ${c.anon}` } });
        const j = await r.json().catch(() => null);
        return { ok: Array.isArray(j) && j.length === 0, detail: `HTTP ${r.status} · ${Array.isArray(j) ? j.length + " ligne(s)" : "réponse illisible"}` };
      });
      await verifier("V4", "Tom ne peut ni s'y inscrire, ni la commenter, ni y réagir, ni compter ses participants", async () => {
        const r = await ev(TOM, async (id) => {
          const a = await supa.from("event_attendees").insert({ event_id: id, user_id: MY_UID, rsvp: "going" });
          const c = await supa.from("event_comments").insert({ id: "ec_" + Date.now(), event_id: id, author_id: MY_UID, content: "coucou" });
          const x = await supa.from("event_reactions").insert({ event_id: id, user_id: MY_UID, emoji: "❤️" });
          const n = await supa.rpc("participants_compte", { p_event_ids: [id] });
          return { inscr: a.error ? "refus" : "ACCEPTÉ", com: c.error ? "refus" : "ACCEPTÉ", reac: x.error ? "refus" : "ACCEPTÉ", compte: (n.data || []).length };
        }, evV);
        return { ok: r.inscr === "refus" && r.com === "refus" && r.reac === "refus" && r.compte === 0 && (await rsvpDe(evV, TOM)) === null, detail: JSON.stringify(r) };
      });
      await verifier("V5", "personne ne lit la liste des AUTRES invités : Inès ne voit que sa propre invitation", async () => {
        const r = await ev(INES, async (id) => { const w = await supa.from("event_invites").select("user_id").eq("event_id", id); return (w.data || []).map((l) => l.user_id); }, evV);
        return { ok: r.length === 1 && r[0] === uids[INES], detail: `${r.length} ligne(s) lue(s)` };
      });
      const code1 = await ev(LEA, (id) => supaCodeInvitationActivite(id, false), evV);
      await verifier("V6", "lien d'invitation : Marc entre avec le bon code, pas avec un faux", async () => {
        const faux = await ev(MARC, ([id, c]) => supaRejoindreParCode(id, c), [evV, "0".repeat(64)]);
        const avant = await charger(MARC, evV);
        const vrai = await ev(MARC, ([id, c]) => supaRejoindreParCode(id, c), [evV, code1]);
        const apres = await charger(MARC, evV);
        return { ok: !!code1 && faux === false && avant === false && vrai === true && apres === true, detail: `code rendu : ${!!code1} · faux ${faux} · avant ${avant} · vrai ${vrai} · lit ensuite ${apres}` };
      });
      const code2 = await ev(LEA, (id) => supaCodeInvitationActivite(id, true), evV);
      await verifier("V7", "« Renouveler » : l'ancien lien ne vaut plus rien pour Sarah, le nouveau l'admet", async () => {
        const vieux = await ev(SARAH, ([id, c]) => supaRejoindreParCode(id, c), [evV, code1]);
        const neuf = await ev(SARAH, ([id, c]) => supaRejoindreParCode(id, c), [evV, code2]);
        return { ok: !!code2 && code2 !== code1 && vieux === false && neuf === true, detail: `ancien ${vieux} · nouveau ${neuf}` };
      });
      await charger(HUGO, evV);
      await repondre(HUGO, evV, "going");
      await attendre(async () => (await rsvpDe(evV, HUGO)) === "going", { delai: 10000 });
      const retrait = await ev(LEA, ([id, u]) => supaRetirerInviteActivite(id, u), [evV, uids[HUGO]]);
      await verifier("V8", "Léa retire Hugo : invitation ET inscription partent, il ne lit plus l'activité, le lien ne le ramène pas", async () => {
        const l = await rsvpDe(evV, HUGO);
        const lit = await charger(HUGO, evV);
        const retour = await ev(HUGO, ([id, c]) => supaRejoindreParCode(id, c), [evV, code2]);
        return { ok: retrait === true && l === null && lit === false && retour === false, detail: `RPC ${retrait} · inscription ${l} · lit ${lit} · revient par le lien ${retour}` };
      });
      await verifier("V9", "l'écran de Hugo (resté ouvert) : s'il réessaie de s'inscrire, l'activité disparaît au lieu de « réessaie »", async () => {
        await poserToasts(HUGO);
        await ev(HUGO, (id) => { if (!_findCanonicalEvent(id)) return; _setMyRsvpLocal(id, null); }, evV);
        await repondre(HUGO, evV, "going");
        const t = await toasts(HUGO);
        const la = await ev(HUGO, (id) => !!_findCanonicalEvent(id), evV);
        return { ok: !la && /plus disponible/i.test(t.join(" ")), detail: `message « ${t.join(" | ").slice(0, 80)} » · encore en mémoire : ${la}` };
      }, { exige: false });
      await verifier("V10", "une invitation EXPLICITE de Léa rouvre l'activité à Hugo", async () => {
        const ok = await ev(LEA, ([id, u]) => supaInviterActivite(id, [u]), [evV, uids[HUGO]]);
        const lit = await attendre(() => charger(HUGO, evV), { delai: 8000 });
        return { ok: ok === true && lit === true, detail: `invitation ${ok} · lit ${lit}` };
      });

      // ═══ ACTE C — LE POINTAGE PAR CODE ═══════════════════════════════════
      acteCourant = "C · Pointage";
      log("── ACTE C : pointage ──");
      // Début dans 30 minutes : la fenêtre de pointage (H-1 → fin) est ouverte.
      const evC = await creer(LEA, { title: "Pointage [rencontrer]", city: "Lyon", date: Date.now() + 30 * 60 * 1000, maxAttendees: 5 });
      for (const i of [INES, TOM, CHLOE]) await attendre(() => charger(i, evC), { delai: 10000, pas: 1500 });
      await repondre(INES, evC, "going");
      await attendre(async () => (await rsvpDe(evC, INES)) === "going", { delai: 10000 });
      await valider(evC, INES, true);
      const secret = await ev(LEA, (id) => supaEventCheckinSecret(id), evC);
      await verifier("C1", "Léa lit le code d'accueil de son activité ; Inès (participante) ne le lit pas", async () => {
        const i = await ev(INES, (id) => supaEventCheckinSecret(id), evC);
        return { ok: !!secret && i === null, detail: `organisatrice : ${secret ? "code rendu" : "aucun code"} · participante : ${i === null ? "rien" : "CODE LU"}` };
      });
      await verifier("C2", "code faux refusé, bon code accepté, second pointage reconnu", async () => {
        const faux = await ev(INES, (id) => supaPointerParCode(id, "000000"), evC);
        const bon = await ev(INES, ([id, c]) => supaPointerParCode(id, c), [evC, secret]);
        const encore = await ev(INES, ([id, c]) => supaPointerParCode(id, c), [evC, secret]);
        const l = await ligneDe(evC, INES);
        return { ok: faux === "code_incorrect" && bon === "ok" && encore === "deja_pointe" && !!(l && l.checked_in_at), detail: `faux : ${faux} · bon : ${bon} · encore : ${encore}` };
      });
      await verifier("C3", "Tom, non inscrit, ne pointe pas même avec le bon code", async () => {
        const r = await ev(TOM, ([id, c]) => supaPointerParCode(id, c), [evC, secret]);
        return { ok: r === "non_inscrit" && (await ligneDe(evC, TOM)) === null, detail: `verdict : ${r}` };
      });
      await verifier("C4", "une réponse « je ne peux pas » ne se pointe pas en écrivant la ligne en direct", async () => {
        await repondre(CHLOE, evC, "declined");
        await attendre(async () => (await rsvpDe(evC, CHLOE)) === "declined", { delai: 8000 });
        const r = await ev(CHLOE, async (id) => { const w = await supa.from("event_attendees").update({ checked_in_at: new Date().toISOString() }).eq("event_id", id).eq("user_id", MY_UID).select("event_id"); return w.error ? String(w.error.message).slice(0, 40) : "ACCEPTÉ"; }, evC);
        const l = await ligneDe(evC, CHLOE);
        return { ok: r !== "ACCEPTÉ" && !(l && l.checked_in_at), detail: `réponse : ${r} · pointée en base : ${!!(l && l.checked_in_at)}` };
      }, { exige: false });

      // ═══ ACTE S — SÉRIE, MODIFICATION, ANNULATION, SUPPRESSION ═══════════
      acteCourant = "S · Série, modification, annulation, suppression";
      log("── ACTE S : série, modification, annulation, suppression ──");
      // Par le VRAI formulaire (ville du dictionnaire : aucun géocodage).
      await ev(LEA, () => {
        goTo("irl"); openCreateEvent();
        document.getElementById("evTitle").value = "Club du mardi [rencontrer]";
        document.getElementById("evTime").value = "19:00";
        document.getElementById("evCity").value = "Lyon";
        const pub = document.getElementById("evVisPublique"); if (pub) pub.checked = true;
        const fil = document.getElementById("evAuFil"); if (fil) fil.checked = false;
        document.getElementById("evRecurrence").value = "weekly";
        _evSyncRecurrenceUi();
        document.getElementById("evOccurrences").value = "3";
      });
      await ev(LEA, () => submitEvent());
      let serie = [];
      await verifier("S1", "une série hebdomadaire de 3 dates : 3 vraies activités en base, à 7 jours d'écart, même heure", async () => {
        serie = await attendre(async () => { const x = await db.lire("events", `select=id,date_at,series_id,status&author_id=eq.${uids[LEA]}&title=eq.${encodeURIComponent("Club du mardi [rencontrer]")}&order=date_at.asc`); return x.length === 3 ? x : null; }, { delai: 25000, pas: 2000 }) || [];
        const ecarts = serie.slice(1).map((e, i) => (Date.parse(e.date_at + "Z") - Date.parse(serie[i].date_at + "Z")) / 86400000);
        const memeSerie = new Set(serie.map((e) => e.series_id)).size === 1 && !!(serie[0] && serie[0].series_id);
        return { ok: serie.length === 3 && memeSerie && ecarts.every((d) => Math.abs(d - 7) < 0.05), detail: `${serie.length} date(s) · écarts ${ecarts.map((d) => d.toFixed(2)).join(", ")} j · même série : ${memeSerie}` };
      });
      await verifier("S2", "Léa (organisatrice) occupe une place à CHAQUE date de sa série", async () => {
        if (!serie.length) return { ok: false, detail: "pas de série" };
        const lire = () => db.lire("event_attendees", `select=event_id&user_id=eq.${uids[LEA]}&event_id=in.(${serie.map((e) => e.id).join(",")})`);
        const r = await attendre(async () => { const x = await lire(); return x.length === serie.length ? x : null; }, { delai: 12000, pas: 1500 }) || await lire();
        return { ok: r.length === serie.length, detail: `${r.length}/${serie.length} date(s)` };
      }, { exige: false });

      // Modification : les inscrits sont prévenus, et relisent le changement.
      await attendre(() => charger(TOM, evP), { delai: 8000 });
      const modif = await ev(LEA, async (id) => {
        const e = ((await supaLoadEvents(null, id)) || [])[0];
        if (!e) return false;
        const maj = Object.assign({}, e, { city: "Villeurbanne", maxAttendees: 4 });
        const ok = await supaUpdateEvent(maj);
        if (ok) await _prevenirInscrits(maj, "event_update", "a modifié une activité à laquelle tu participes");
        return ok;
      }, evP);
      await verifier("S3", "Léa déplace l'activité et ajoute une place : écrit en base, Inès (validée) est prévenue", async () => {
        const e = await db.lire("events", `select=city,max_attendees&id=eq.${evP}`);
        const n = await attendre(async () => { const x = await db.lire("notifications", `select=id&user_id=eq.${uids[INES]}&kind=eq.event_update&ref_id=eq.${evP}`); return x.length ? x : null; }, { delai: 10000 }) || [];
        return { ok: modif === true && e[0].city === "Villeurbanne" && e[0].max_attendees === 4 && n.length >= 1, detail: `ville ${e[0].city} · places ${e[0].max_attendees} · notification : ${n.length}` };
      });
      await verifier("S4", "une place ajoutée par l'organisation profite à la file d'attente (quelqu'un y attendait)", async () => {
        const avant = await lignes(evP);
        const file = avant.filter((a) => a.rsvp === "waitlist");
        if (!file.length) return { ok: true, detail: "personne en file à ce moment : sans objet" };
        const promu = await attendre(async () => { const x = await lignes(evP); return x.filter((a) => a.rsvp === "waitlist").length < file.length ? x : null; }, { delai: 12000 });
        return { ok: !!promu, detail: `file avant : ${file.length} · going : ${avant.filter((a) => a.rsvp === "going").length}/4` };
      }, { exige: false });

      const annul = await ev(LEA, (id) => toggleCancelEvent(id), evP).then(() => true).catch(() => false);
      await verifier("S5", "Léa annule : statut « annulée » en base, Inès prévenue, plus personne ne peut s'inscrire", async () => {
        const e = await attendre(async () => { const x = await db.lire("events", `select=status&id=eq.${evP}`); return x[0] && x[0].status === "cancelled" ? x : null; }, { delai: 10000 });
        const n = await attendre(async () => { const x = await db.lire("notifications", `select=id,kind&user_id=eq.${uids[INES]}&ref_id=eq.${evP}`); return x.some((y) => /cancel/.test(y.kind || "")) ? x : null; }, { delai: 10000 }) || [];
        const tard = await ev(SARAH, async (id) => { const w = await supa.from("event_attendees").insert({ event_id: id, user_id: MY_UID, rsvp: "going" }); return w.error ? String(w.error.message).slice(0, 30) : "ACCEPTÉ"; }, evP);
        return { ok: annul && !!e && n.length >= 1 && tard !== "ACCEPTÉ", detail: `statut ${e ? "cancelled" : "inchangé"} · notification d'annulation : ${n.some((y) => /cancel/.test(y.kind || ""))} · inscription tardive : ${tard}` };
      });

      const suppr = await ev(LEA, (id) => supaDeleteEvent(id), evG);
      await verifier("S6", "Léa supprime une activité : la ligne et ses inscriptions partent ensemble", async () => {
        const e = await db.lire("events", `select=id&id=eq.${evG}`);
        const a = await db.lire("event_attendees", `select=user_id&event_id=eq.${evG}`);
        return { ok: suppr === true && e.length === 0 && a.length === 0, detail: `activité ${e.length} · inscriptions ${a.length}` };
      });
      await verifier("S7", "Sarah, qui y avait répondu, ne garde pas une réponse à une activité qui n'existe plus (après relecture)", async () => {
        await pages[SARAH].reload();
        await pages[SARAH].waitForFunction(() => !!window.MY_UID && window._supaInitTerminee === true, null, { timeout: 40000 }).catch(() => {});
        await pause(4000);
        const r = await ecran(SARAH, evG);
        return { ok: !r, detail: `réponse locale après redémarrage : ${r}` };
      }, { exige: false });

      await verifier("Z1", "aucune erreur JavaScript chez les 10 personnages", async () => {
        const avec = Object.entries(rapport.erreursConsole).filter(([, l]) => l.some((m) => !/Failed to load resource/i.test(m)));
        return { ok: avec.length === 0, detail: avec.map(([n, l]) => `${n} : ${[...new Set(l.filter((m) => !/Failed to load resource/i.test(m)))].slice(0, 2).join(" ; ").slice(0, 160)}`).join(" · ") };
      }, { exige: false });
    } finally {
      // ═══ PURGE — les CONTENUS des dix personnages, jamais les comptes ═════
      const purge = { comptes: 0, erreurs: [], restants: [] };
      let ids = [];
      try {
        const cfgP = configAdmin();
        const attendus = new Set(PERSONAS.map((_, i) => emailPersonnage(i)));
        ids = (await jeu.comptesDuJeu(cfgP)).filter((u) => attendus.has(String(u.email).toLowerCase())).map((u) => u.id);
        await jeu.purgerContenusComptes(cfgP, ids);
        purge.restants = await jeu.profilsRestants(cfgP, ids);
        purge.comptes = ids.length - purge.restants.length;
      } catch (e) { purge.erreurs.push(String((e && e.message) || e)); }
      rapport.purge = purge;
      log(`purge : contenus de ${purge.comptes}/${ids.length} personnages purgés (comptes gardés), ${purge.restants.length} profil(s) restant(s)${purge.erreurs.length ? " — erreurs : " + purge.erreurs.join(" ; ") : ""}`);
      for (const c of contexts) { try { await c.close(); } catch (e) {} }
      rapport.dureeS = Math.round((Date.now() - t0) / 1000);
      ecrireRapport(rapport);
      log("rapport : test-results/village-rencontrer/rapport.md");
    }

    const echecs = rapport.controles.filter((c) => c.statut === "ÉCHEC").map((c) => `[${c.code}] ${c.libelle} — ${c.detail}`);
    expect(echecs, "contrôles EXIGÉS en échec (détail : test-results/village-rencontrer/rapport.md)").toEqual([]);
    expect({ erreurs: rapport.purge.erreurs, restants: rapport.purge.restants.length }, "purge de la séance complète").toEqual({ erreurs: [], restants: 0 });
  });
});

function ecrireRapport(r) {
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, "rapport.json"), JSON.stringify(r, null, 2));
  const n = (s) => r.controles.filter((c) => c.statut === s).length;
  const icone = { "OK": "✅", "ÉCHEC": "❌", "À REGARDER": "👀" };
  let md = `# Le village, côté Rencontrer — rapport de simulation\n\n`;
  md += `- Date : ${r.date} · cible : ${r.cible} · durée : ${r.dureeS} s\n`;
  md += `- Contrôles : **${n("OK")} OK · ${n("ÉCHEC")} échec(s) exigé(s) · ${n("À REGARDER")} observation(s)**\n`;
  md += `- Purge : ${r.purge ? `contenus de ${r.purge.comptes} personnages purgés (comptes du jeu gardés), **${r.purge.restants.length} profil(s) restant(s)**${r.purge.erreurs.length ? " — ⚠️ " + r.purge.erreurs.join(" ; ") : ""}` : "non faite"}\n\n`;
  md += `## Les personnages\n\n| # | Personnage | Rôle | Inscrit |\n|--|--|--|--|\n`;
  r.personas.forEach((p, i) => { md += `| ${i + 1} | ${p.nom} | ${p.role} | ${p.inscrit ? "oui" : "**non**"} |\n`; });
  let acte = null;
  for (const c of r.controles) {
    if (c.acte !== acte) { acte = c.acte; md += `\n## ${acte}\n\n| | Code | Contrôle | Niveau | Détail |\n|--|--|--|--|--|\n`; }
    md += `| ${icone[c.statut]} | ${c.code} | ${c.libelle} | ${c.exige ? "exigé" : "observation"} | ${String(c.detail || "").replace(/\|/g, "/")} |\n`;
  }
  const cons = Object.entries(r.erreursConsole).filter(([, l]) => l.length);
  if (cons.length) {
    md += `\n## Erreurs console\n\n`;
    for (const [nom, l] of cons) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 4).map((x) => "`" + x.replace(/`/g, "'").slice(0, 140) + "`").join(" · ")}\n`;
  }
  const http = Object.entries(r.erreursHttp).filter(([, l]) => l.length);
  if (http.length) {
    md += `\n## Réponses HTTP ≥ 400 (Supabase)\n\n`;
    for (const [nom, l] of http) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 8).map((x) => "`" + x + "`").join(" · ")}\n`;
  }
  if (r.captures.length) md += `\n## Captures\n\n${r.captures.map((f) => `- captures/${f}`).join("\n")}\n`;
  fs.writeFileSync(path.join(SORTIE, "rapport.md"), md);
}
