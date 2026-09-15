// ASTRA-23 — le canal `call:<id>` appartient à SES DEUX PARTIES.
//
// LE DÉFAUT, MESURÉ EN PRODUCTION LE 2026-09-15 (canal ① d'ADR-012) :
// `passio_rt_emettre` et `passio_rt_recevoir` portaient toutes deux
// « realtime.topic() like 'call:%' » SANS AUCUNE CONDITION. Tout compte
// authentifié connaissant un callId pouvait donc LIRE l'offre SDP (adresses IP
// dans les candidats ICE) et ÉMETTRE sur le canal (`hangup` pour couper,
// `offer` pour se substituer).
//
// ⚠️ CE LOT NE DÉCOUVRE RIEN : il fait le « lot suivant » que la migration du
// 14/09 avait NOMMÉ (« Le lier aux participants demanderait une table d'appels
// — autre lot »). Cette table existe depuis le 15/09 et elle est en production.
//
// ⚠️ ET LA PROPRIÉTÉ DE CE LOT EST UN ORDRE, PAS UNE PRÉSENCE. `call:<id>`
// n'est autorisé qu'aux parties nommées par la ligne `call_invites` : s'abonner
// AVANT de l'avoir déposée, c'est se faire refuser son propre appel. Un banc
// qui vérifierait seulement « l'invitation est déposée » et « le canal est
// écouté » reste VERT sur le défaut — les deux faits sont vrais dans les deux
// ordres. Le cas ① tient donc l'upsert EN VOL et regarde ce qui existe pendant
// ce temps-là.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";
const UID_LEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAUX_RT = `
window.__canaux = {};
window._supaReal = true;
Object.defineProperty(window.supa, "channel", {
  configurable: true, writable: true,
  value: function (topic, opts) {
    var c = window.__canaux[topic] || (window.__canaux[topic] = {
      topic: topic, opts: opts, subscribed: 0, httpSent: [], sent: [], handlers: [],
      on: function () { this.handlers.push(Array.from(arguments)); return this; },
      subscribe: function (cb) { this.subscribed++; try { cb && cb("SUBSCRIBED"); } catch (e) {} return this; },
      httpSend: function (ev, payload) { this.httpSent.push({ event: ev, payload: payload }); return Promise.resolve({ success: true }); },
      send: function (m) { this.sent.push(m); return Promise.resolve("ok"); },
      unsubscribe: function () { return Promise.resolve("ok"); },
    });
    return c;
  },
});
Object.defineProperty(window.supa, "removeChannel", { configurable: true, writable: true, value: function () { return Promise.resolve("ok"); } });
Object.defineProperty(window.supa, "functions", { configurable: true, writable: true, value: { invoke: function () { return Promise.resolve({ data: {} }); } } });
window._callGetMedia = async function () { return { getTracks: function () { return []; } }; };
`;

// Le faux \`supa.from\` : il peut RETENIR sa réponse, pour qu'on regarde l'état
// du monde pendant que l'invitation est en vol. Sans cette retenue, l'ordre est
// inobservable — tout est fini quand on mesure.
const FAUX_TABLE = `
window.__upserts = [];
window.__inviteReponse = { error: null };
window.__tenir = false;
window.__relacher = null;
Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
  value: function (table) {
    var b = {
      upsert: function (ligne, opts) {
        window.__upserts.push({ table: table, ligne: ligne, opts: opts });
        if (!window.__tenir) return Promise.resolve(window.__inviteReponse);
        return new Promise(function (res) { window.__relacher = function () { res(window.__inviteReponse); }; });
      },
      select: function () { return b; }, eq: function () { return b; },
      maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
      then: function (a, c) { return Promise.resolve({ data: [], error: null }).then(a, c); },
    };
    return b;
  } });
`;

const canauxAppel = () => Object.keys(window.__canaux).filter((t) => t.indexOf("call:") === 0);

async function banc(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript((u) => { localStorage.setItem("passio_uid", u); }, UID_MOI);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((s) => { eval(s); }, FAUX_RT);
  await page.evaluate((lea) => {
    cacheRemoteProfile({ id: lea, username: "Léa", emoji: "🌿", color: "#22c55e", avatar_url: null });
    const convs = getConversations();
    convs.push({ id: "dm_lea", isGroup: false, userId: lea, userName: "Léa", userEmoji: "🌿", userColor: "#22c55e", unread: 0, lastAt: Date.now(), messages: [] });
    saveConversations();
  }, UID_LEA);
}

test.describe("ASTRA-23 — le canal d'appel est lié à ses deux parties", () => {
  test("① AUCUN canal `call:` n'existe tant que l'invitation n'a pas abouti", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async ([faux, src]) => {
      eval(faux);
      const filtre = eval("(" + src + ")");
      window.__tenir = true;
      const p = startCall("dm_lea", "voice");
      // Laisse l'appel aller jusqu'à l'upsert, qui ne se résout pas.
      for (let i = 0; i < 20 && !window.__relacher; i++) await new Promise((r) => setTimeout(r, 10));
      const pendant = { canaux: filtre(), upserts: window.__upserts.length, callId: window._call && window._call.id };
      window.__relacher();
      await p;
      const apres = { canaux: filtre(), abonne: 0 };
      if (apres.canaux.length) apres.abonne = window.__canaux[apres.canaux[0]].subscribed;
      try { endCall(); } catch (e) {}
      return { pendant, apres };
    }, [FAUX_TABLE, canauxAppel.toString()]);

    expect(r.pendant.upserts, "l'invitation est bien partie").toBeGreaterThanOrEqual(1);
    // ⚠️ LE CŒUR DU LOT. Sur le code d'avant, le canal était créé et abonné AVANT
    // que l'invitation soit déposée — donc avant que la ligne qui l'autorise
    // existe : sous la nouvelle policy, l'appelant se faisait refuser son
    // propre appel. RÉINJECTION faite : ce cas rougit.
    expect(r.pendant.canaux, "aucun canal d'appel tant que la ligne n'existe pas").toEqual([]);
    expect(r.apres.canaux, "…et il apparaît une fois l'invitation acceptée").toEqual(["call:" + r.pendant.callId]);
    expect(r.apres.abonne, "il est bien écouté (réponse SDP)").toBe(1);
  });

  test("② un REFUS du serveur n'ouvre aucun canal et le dit à l'utilisateur", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async ([faux, src]) => {
      eval(faux);
      const filtre = eval("(" + src + ")");
      window.__traces = []; window.diagLog = (m) => window.__traces.push(String(m));
      window.__inviteReponse = { error: { code: "42501", message: "new row violates row-level security policy for table call_invites" } };
      await startCall("dm_lea", "voice");
      await new Promise((r) => setTimeout(r, 120));
      const out = { canaux: filtre(), appel: !!window._call, traces: window.__traces.filter((t) => /call_invites refus/.test(t)).length };
      try { endCall(); } catch (e) {}
      return out;
    }, [FAUX_TABLE, canauxAppel.toString()]);
    expect(r.canaux, "un appel refusé n'ouvre pas de canal").toEqual([]);
    // ⚠️ Avant, l'appel restait « en cours » et mourait au bout de 60 s sur
    // « Pas de réponse » : le refus du serveur se lisait comme un silence du
    // destinataire. Un refus qui ne se prononce pas est indiscernable d'une panne.
    expect(r.appel, "l'appel est abandonné, pas laissé à sonner dans le vide").toBe(false);
    expect(r.traces, "…et le refus est tracé").toBeGreaterThanOrEqual(1);
  });

  test("③ un échec qui n'est PAS un refus laisse l'appel partir (table absente, réseau)", async ({ page }) => {
    await banc(page);
    const r = await page.evaluate(async ([faux, src]) => {
      eval(faux);
      const filtre = eval("(" + src + ")");
      // a) migration non appliquée → repli sur le broadcast d'avant.
      window.__inviteReponse = { error: { code: "PGRST205", message: "Could not find the table 'public.call_invites' in the schema cache" } };
      await startCall("dm_lea", "voice");
      await new Promise((r) => setTimeout(r, 120));
      const absente = { canaux: filtre().length, appel: !!window._call };
      try { endCall(); } catch (e) {}
      // b) panne réseau : l'upsert REJETTE. La répétition doit avoir sa chance.
      window.__canaux = {}; window._callInvitesAbsente = false;
      Object.defineProperty(window.supa, "from", { configurable: true, writable: true,
        value: function () { return { upsert: function () { return Promise.reject(new Error("Failed to fetch")); } }; } });
      await startCall("dm_lea", "voice");
      await new Promise((r) => setTimeout(r, 120));
      const panne = { canaux: filtre().length, appel: !!window._call };
      try { endCall(); } catch (e) {}
      return { absente, panne };
    }, [FAUX_TABLE, canauxAppel.toString()]);
    // ⚠️ Traiter tout échec comme un refus rendrait une coupure d'une seconde
    // indiscernable d'un blocage, et couperait des appels parfaitement légitimes.
    expect(r.absente.canaux, "table absente : l'appel part quand même").toBe(1);
    expect(r.absente.appel).toBe(true);
    expect(r.panne.canaux, "panne réseau : la répétition garde sa chance").toBe(1);
    expect(r.panne.appel).toBe(true);
  });

  test("④ à la SOURCE : l'invitation précède le canal, et la migration garde les DEUX sens", async () => {
    const app05 = lire("js/app-05-config-profil.js");
    const i = app05.indexOf("async function startCall(");
    const corps = app05.slice(i, app05.indexOf("\nfunction ", i + 10));
    const iInvite = corps.indexOf("await fire()");
    const iCanal = corps.indexOf('_callChannel("call:"');
    expect(iInvite, "le dépôt de l'invitation est attendu").toBeGreaterThan(0);
    expect(iCanal, "le canal d'appel est créé").toBeGreaterThan(0);
    // ⚠️ MESURÉ À LA SOURCE parce que c'est un ORDRE : les deux gestes existent
    // dans les deux versions, seule leur SUITE distingue le défaut du correctif.
    expect(iInvite, "l'invitation doit précéder le canal").toBeLessThan(iCanal);

    const mig = lire("migrations/migration_canal_appel_lie_2026-09-15.sql");
    // Les DEUX policies, pas une : lire l'offre SDP et émettre un hangup sont
    // deux abus distincts du même topic sans propriétaire.
    expect(mig).toMatch(/passio_rt_emettre[\s\S]*call:%' and public\.call_partie_prenante/);
    expect(mig).toMatch(/passio_rt_recevoir[\s\S]*call:%' and public\.call_partie_prenante/);
    // Le prédicat ne répond que sur l'APPELANT — aucun oracle.
    expect(mig).toMatch(/\(select auth\.uid\(\)\)::text in \(ci\.from_id, ci\.to_id\)/);
    expect(mig).toMatch(/revoke all on function public\.call_partie_prenante\(text\) from anon/);
    // ⚠️ `authenticated` GARDE EXECUTE : les policies l'appellent au rôle courant.
    expect(mig).toMatch(/grant execute on function public\.call_partie_prenante\(text\) to authenticated/);
    // Le reste de chaque policy est repris à l'identique : ring: reste interdit
    // au client en émission, et borné à son destinataire en réception.
    expect(mig).not.toMatch(/with check \([\s\S]{0,400}ring:%/);
    expect(mig).toMatch(/ring:%'\s*\n\s*and substr\(realtime\.topic\(\), 6\) = \(select auth\.uid\(\)\)::text/);

    // ⚠️ LE BANC DOIT TOURNER, ET CE N'EST PAS `deploy.yml` QUI LE DIT. Depuis
    // `scripts/bancs-sql-restants.sh`, un banc NON nommé dans le workflow est
    // ramassé par le balayeur — c'est la convention de la maison (« une
    // migration neuve ne touche plus `.github/` »). Exiger une ligne de YAML
    // ferait donc échouer un lot qui respecte la règle, et pousserait à
    // déclencher la gouvernance critique pour rien. Ce qu'on mesure, c'est la
    // COUVERTURE : nommé, ou balayé — et que le balayeur soit bien branché.
    const banc = "tests/sql/migration-canal-appel-lie.test.sh";
    expect(fs.existsSync(path.join(RACINE, banc)), "le banc SQL existe").toBe(true);
    const wf = lire(".github/workflows/deploy.yml");
    const nomme = wf.includes("bash " + banc);
    const balaye = /bash scripts\/bancs-sql-restants\.sh/.test(wf);
    expect(nomme || balaye, "le banc tourne en CI : nommé, ou ramassé par le balayeur").toBe(true);
  });
});
