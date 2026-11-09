// ═══════════════════════════════════════════════════════════════════════════
// RELAIS TURN DES APPELS ET DES LIVES — CLOUDFLARE, FABRIQUÉ PAR LE SERVEUR (2026-11-09)
//
// Le TURN public « Open Relay » est mort (`openrelay.metered.ca` → 192.0.2.1 /
// 100::1, mesuré le 2026-11-09) : sans relais, un live ou un appel entre deux
// réseaux à NAT strict échoue. `notify-call` fabrique, sur `{ type: "ice" }`, des
// identifiants Cloudflare de 6 h ; `assurerServeursIce` (app-05) les AJOUTE au
// tableau que lisent les cinq `new RTCPeerConnection`. Le vrai code client, un
// faux `supa.functions.invoke` qui COMPTE les demandes.
//
// ① une réponse valide ajoute le relais, une seule demande ;
// ② gardés tant qu'il leur reste plus de 3 h (sur 6) : pas de seconde demande ;
// ③ relais coupé (secrets absents) : les identifiants déjà posés sont RETIRÉS, pas
//    de nouvelle demande avant une heure ;
// ④ réponse hostile, hors forme ou refusée : rien d'ajouté ;
// ⑤ fonction muette : la promesse se règle en 2,5 s au plus, l'app continue en STUN,
//    et la panne n'est pas redemandée à chaque entrée ;
// ⑥ un renouvellement REMPLACE les anciens identifiants (le tableau ne grossit pas) ;
// ⑦ un visiteur ne demande rien ;
// ⑧ câblage : les lives et les appels l'ATTENDENT avant de créer leur connexion ;
// ⑨ expirés : retirés, même quand le renouvellement échoue ;
// ⑩ une entrée dans un live ne se double pas pendant l'attente (double toucher).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RELAIS = {
  urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
  username: "banc-utilisateur", credential: "banc-secret",
};

async function preparer(page, { compte = true } = {}) {
  await bootOnboarded(page);
  await page.evaluate(([relais, compteReel]) => {
    window.__demandes = [];
    window.__reponse = { data: { ok: true, iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, relais], ttl: 21600, configure: true }, error: null };
    window.__muet = false;
    const fonctions = {
      invoke(nom, opts) {
        window.__demandes.push({ nom, body: opts && opts.body });
        if (window.__muet) return new Promise(() => {});
        return Promise.resolve(JSON.parse(JSON.stringify(window.__reponse)));
      },
    };
    if (typeof supa === "undefined" || !supa) supa = {};
    // `functions` est un ACCESSEUR du client supabase-js (sans mutateur) : une simple
    // affectation est ignorée en silence, et c'est le vrai `invoke` qui partait. Une
    // propriété propre le masque ; le banc vérifie que le faux a bien pris.
    Object.defineProperty(supa, "functions", { value: fonctions, configurable: true, writable: true });
    if (supa.functions !== fonctions) throw new Error("le faux `supa.functions` n'a pas pris");
    window._supaReal = true;
    window.connexionTempsReelAutorisee = () => compteReel;
    _iceRelais.serveurs.forEach((s) => { const i = CALL_ICE_SERVERS.indexOf(s); if (i !== -1) CALL_ICE_SERVERS.splice(i, 1); });
    _iceRelais.serveurs = []; _iceRelais.jusqua = 0; _iceRelais.expire = 0; _iceRelais.enCours = null;
    window.__base = CALL_ICE_SERVERS.length;
  }, [RELAIS, compte]);
}

test("① une réponse valide AJOUTE le relais au tableau des connexions, en une seule demande", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const n = await assurerServeursIce();
    return { n, demandes: window.__demandes, ice: CALL_ICE_SERVERS, base: window.__base };
  });
  expect(r.n).toBe(2);
  expect(r.demandes).toEqual([{ nom: "notify-call", body: { type: "ice" } }]);
  expect(r.ice.length).toBe(r.base + 2);
  expect(r.ice).toContainEqual(RELAIS);
  // Les STUN de Google restent : le relais s'ajoute, il ne remplace rien.
  expect(JSON.stringify(r.ice)).toContain("stun.l.google.com");
});

test("② gardés tant qu'il leur reste plus de 3 h : une seconde demande ne part pas", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    await assurerServeursIce(); await assurerServeursIce(); await assurerServeursIce();
    return { demandes: window.__demandes.length, longueur: CALL_ICE_SERVERS.length, base: window.__base, renouvelle: _iceRelais.jusqua - Date.now(), expire: _iceRelais.expire - Date.now() };
  });
  expect(r.demandes).toBe(1);
  expect(r.longueur).toBe(r.base + 2);
  // 6 h chez Cloudflare ; renouvelés à 3 h de l'expiration : un live ou un appel
  // part toujours avec au moins 3 h de validité.
  expect(r.expire).toBeGreaterThan(5.9 * 3600 * 1000);
  expect(r.expire).toBeLessThanOrEqual(6 * 3600 * 1000);
  expect(r.renouvelle).toBeGreaterThan(2.9 * 3600 * 1000);
  expect(r.renouvelle).toBeLessThanOrEqual(3 * 3600 * 1000);
});

test("③ relais coupé (secrets absents) : les identifiants déjà posés sont RETIRÉS, pas de nouvelle demande avant une heure", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const pose = await assurerServeursIce();
    const avecRelais = CALL_ICE_SERVERS.length;
    window.__reponse = { data: { ok: true, iceServers: [], configure: false }, error: null };
    _iceRelais.jusqua = 0; // l'heure du renouvellement
    const n = await assurerServeursIce();
    await assurerServeursIce();
    return { pose, avecRelais, n, demandes: window.__demandes.length, longueur: CALL_ICE_SERVERS.length, base: window.__base, attente: _iceRelais.jusqua - Date.now(), ice: JSON.stringify(CALL_ICE_SERVERS) };
  });
  expect(r.pose).toBe(2);
  expect(r.avecRelais).toBe(r.base + 2);
  expect(r.n).toBe(0);
  expect(r.demandes).toBe(2);
  expect(r.longueur).toBe(r.base);
  expect(r.ice).not.toContain("banc-secret");
  expect(r.attente).toBeGreaterThan(55 * 60 * 1000);
});

test("④ réponse hostile ou hors forme : rien n'entre dans la configuration des connexions", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    const essais = [
      { iceServers: [{ urls: ["javascript:alert(1)"] }] },
      { iceServers: [{ urls: ["turn:a.example:3478"] }] },                        // relais sans identifiants
      { iceServers: [{ urls: ["https://evil.example"], username: "u", credential: "c" }] },
      { iceServers: "x" },
      null,
    ];
    const ajouts = [];
    for (const d of essais) {
      window.__reponse = { data: d, error: null };
      _iceRelais.jusqua = 0;
      ajouts.push(await assurerServeursIce());
    }
    // Un refus du serveur arrive dans `error` (le SDK ne lève pas) : il l'emporte,
    // même accompagné d'un corps qui aurait la bonne forme.
    window.__reponse = { data: { ok: true, iceServers: [{ urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" }] }, error: { message: "turn_indisponible" } };
    _iceRelais.jusqua = 0;
    ajouts.push(await assurerServeursIce());
    return { ajouts, longueur: CALL_ICE_SERVERS.length, base: window.__base };
  });
  expect(r.ajouts).toEqual([0, 0, 0, 0, 0, 0]);
  expect(r.longueur).toBe(r.base);
});

test("⑤ fonction muette : la promesse se règle en 2,5 s au plus, l'app continue en STUN seul — et n'attend plus pendant 5 min", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    window.__muet = true;
    const debut = Date.now();
    const n = await assurerServeursIce();
    const ms = Date.now() - debut;
    // L'entrée suivante dans un live : ni nouvelle demande, ni nouvelle attente.
    const debut2 = Date.now();
    const n2 = await assurerServeursIce();
    return { n, ms, n2, ms2: Date.now() - debut2, demandes: window.__demandes.length, longueur: CALL_ICE_SERVERS.length, base: window.__base, pause: _iceRelais.jusqua - Date.now() };
  });
  expect(r.n).toBe(0);
  expect(r.ms).toBeGreaterThanOrEqual(2400);
  expect(r.ms).toBeLessThan(6000);
  expect(r.longueur).toBe(r.base);
  expect(r.n2).toBe(0);
  expect(r.ms2).toBeLessThan(200);
  expect(r.demandes).toBe(1);
  expect(r.pause).toBeGreaterThan(4.9 * 60 * 1000);
  expect(r.pause).toBeLessThanOrEqual(5 * 60 * 1000);
});

test("⑥ un renouvellement REMPLACE les anciens identifiants : le tableau ne grossit pas", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    await assurerServeursIce();
    const apres1 = CALL_ICE_SERVERS.length;
    window.__reponse.data.iceServers[1].credential = "secret-renouvele";
    _iceRelais.jusqua = 0;
    await assurerServeursIce();
    return { apres1, apres2: CALL_ICE_SERVERS.length, ice: CALL_ICE_SERVERS };
  });
  expect(r.apres2).toBe(r.apres1);
  expect(JSON.stringify(r.ice)).toContain("secret-renouvele");
  expect(JSON.stringify(r.ice)).not.toContain('"banc-secret"');
});

test("⑦ un visiteur (sans compte) ne demande rien", async ({ page }) => {
  await preparer(page, { compte: false });
  const r = await page.evaluate(async () => ({ n: await assurerServeursIce(), demandes: window.__demandes.length }));
  expect(r.n).toBe(0);
  expect(r.demandes).toBe(0);
});

test("⑧ câblage : les lives et les appels ATTENDENT le relais avant de créer leur connexion", async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-05-config-profil.js"), "utf8");
  const corps = (nom) => {
    const i = src.indexOf(nom);
    expect(i, nom).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf("\n}\n", i));
  };
  const ATTENTE = "try { await _relais; } catch (e) {}";
  const hote = corps("async function startVideoLive()");
  expect(hote.indexOf("const _relais = assurerServeursIce();")).toBeGreaterThan(hote.indexOf("_appelEnPreparation();"));
  expect(hote.indexOf("const _relais = assurerServeursIce();")).toBeLessThan(hote.indexOf("await _vlivePromptTitle()"));
  // Attendu UNE fois, après la caméra et AVANT d'ouvrir le live : la connexion de
  // chaque spectateur se crée ensuite sans attente.
  expect(hote.indexOf(ATTENTE)).toBeGreaterThan(hote.indexOf("getUserMedia("));
  expect(hote.indexOf(ATTENTE)).toBeLessThan(hote.indexOf('supa.channel("vlive:"'));
  // Chaque spectateur : SYNCHRONE jusqu'à `H.pcs[vid]` — `_vliveHostAssign` décide
  // doublon et capacité sur cette table. Une attente là (première correction de
  // l'audit) faisait répondre « complet » à des spectateurs arrivés ensemble.
  const ajout = corps("async function _vliveHostAddViewer(vid)");
  const pose = ajout.indexOf("H.pcs[vid] = entry;");
  expect(pose).toBeGreaterThan(-1);
  expect(ajout.slice(0, pose)).not.toMatch(/\bawait\b/);
  expect(ajout.indexOf("assurerServeursIce();")).toBeGreaterThan(ajout.indexOf("VLIVE_MAX_VIEWERS"));
  expect(ajout.indexOf("assurerServeursIce();")).toBeLessThan(ajout.indexOf("new RTCPeerConnection"));
  // Toute autre connexion (spectateur, relais vers un enfant) relance le relais juste
  // avant : les identifiants expirés tombent, le renouvellement part.
  for (const m of src.matchAll(/new RTCPeerConnection\(\{ iceServers: CALL_ICE_SERVERS \}\)/g)) {
    const avant = src.slice(Math.max(0, m.index - 260), m.index);
    expect(/assurerServeursIce\(\);[^\n]*\n\s*(const pc = )?$/.test(avant) || /function _callSetupPeerConnection\(\) \{\n  const cs = window\._call;\n  const pc = $/.test(avant), avant.slice(-120)).toBe(true);
  }
  const spectateur = corps("async function joinVideoLive(liveId)");
  expect(spectateur).toContain("const _relais = assurerServeursIce();");
  // Attendu AVANT d'entrer dans le canal du live : l'offre de l'hôte peut arriver tout de suite.
  expect(spectateur.indexOf(ATTENTE)).toBeGreaterThan(-1);
  expect(spectateur.indexOf(ATTENTE)).toBeLessThan(spectateur.indexOf('supa.channel("vlive:"'));
  // Les appels : l'attente se place AVANT `_callSetupPeerConnection()`, qui copie la
  // liste des serveurs ; la demande, APRÈS l'exclusion des contacts de démo.
  const appel = corps("async function startCall(convId, kind)");
  expect(appel.indexOf("const _relais = assurerServeursIce();")).toBeGreaterThan(appel.indexOf("Ce contact de démo n'est pas joignable"));
  expect(appel.indexOf(ATTENTE)).toBeGreaterThan(appel.indexOf("await _callGetMedia(kind)"));
  expect(appel.indexOf(ATTENTE)).toBeLessThan(appel.indexOf("_callSetupPeerConnection();"));
  // Un double toucher pendant l'attente n'écrase pas l'appel ; un départ devenu sans
  // objet coupe la caméra et le micro qu'il a obtenus.
  expect(appel.indexOf("if (window._callDepart) return;")).toBeLessThan(appel.indexOf("await _callGetMedia(kind)"));
  expect(appel.indexOf("const departValide = window._callDepart === depart && !window._call;")).toBeGreaterThan(appel.indexOf(ATTENTE));
  expect(appel.indexOf("if (!departValide) { try { (stream.getTracks() || []).forEach((t) => t.stop()); } catch (e) {} return; }")).toBeLessThan(appel.indexOf("_callSetupPeerConnection();"));
  const reponse = corps("async function acceptIncomingCall()");
  expect(reponse.indexOf("const _relais = assurerServeursIce();")).toBeLessThan(reponse.indexOf("await _callGetMedia(inv.kind)"));
  expect(reponse.indexOf(ATTENTE)).toBeGreaterThan(reponse.indexOf("await _callGetMedia(inv.kind)"));
  expect(reponse.indexOf(ATTENTE)).toBeLessThan(reponse.indexOf("_callSetupPeerConnection();"));
  // Aucune connexion ne lit autre chose que le tableau commun.
  const connexions = src.match(/new RTCPeerConnection\(\{[^)]*\}\)/g) || [];
  expect(connexions.length).toBe(5);
  for (const c of connexions) expect(c).toBe("new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS })");
  // Aucun secret Cloudflare dans le client (le dépôt est public).
  expect(src).not.toMatch(/TURN_CF_API_TOKEN\s*[:=]|rtc\.live\.cloudflare\.com/);
});

test("⑨ identifiants expirés : retirés, même quand le renouvellement échoue", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    await assurerServeursIce();
    const avec = CALL_ICE_SERVERS.length;
    _iceRelais.expire = Date.now() - 1; // l'heure est passée
    _iceRelais.jusqua = 0;
    window.__reponse = { data: null, error: { message: "panne" } };
    const n = await assurerServeursIce();
    return { avec, n, longueur: CALL_ICE_SERVERS.length, base: window.__base, ice: JSON.stringify(CALL_ICE_SERVERS) };
  });
  expect(r.avec).toBe(r.base + 2);
  expect(r.n).toBe(0);
  expect(r.longueur).toBe(r.base);
  expect(r.ice).not.toContain("banc-secret");
});

// Le banc des entrées dans un live : faux `supa.from` (l'état du live, compté) et
// faux `supa.channel` (les canaux ouverts), le relais qui tarde 2,5 s.
async function bancLive(page) {
  await preparer(page);
  await page.evaluate(() => {
    window.__muet = true; // le relais tarde : 2,5 s sans rien à l'écran
    window.__canaux = [];
    window.__lectures = 0;
    // Toute requête est acceptée (l'app lit en arrière-plan, dont la liste des lives) et
    // rend une liste vide ; seule la lecture d'UN live par son identifiant — celle de
    // l'entrée — rend la ligne et se compte.
    const requete = () => {
      let col = null, id = null;
      const q = new Proxy({}, {
        get: (_t, p) => {
          if (p === "eq") return (c, v) => { col = c; id = v; return q; };
          if (p === "maybeSingle") {
            return () => {
              if (col !== "id") return Promise.resolve({ data: null, error: null });
              window.__lectures++;
              return Promise.resolve({ data: { id, status: "live", last_seen: new Date().toISOString(), started_at: new Date().toISOString(), author_id: "hote_banc" }, error: null });
            };
          }
          if (p === "then") return (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko);
          return () => q;
        },
      });
      return q;
    };
    const faux = () => requete();
    Object.defineProperty(supa, "from", { value: faux, configurable: true, writable: true });
    Object.defineProperty(supa, "channel", {
      value: (topic) => { window.__canaux.push(topic); const c = { on() { return c; }, subscribe() { return c; }, track() {}, unsubscribe() {}, send() { return Promise.resolve("ok"); } }; return c; },
      configurable: true, writable: true,
    });
    if (supa.from !== faux) throw new Error("le faux `supa.from` n'a pas pris");
    _vliveRenderUI = () => {}; _vliveStartTimer = () => {};
  });
}

test("⑩ une entrée dans un live ne se double pas pendant l'attente du relais (double toucher)", async ({ page }) => {
  await bancLive(page);
  const r = await page.evaluate(async () => {
    const premier = joinVideoLive("live_banc");
    const second = joinVideoLive("live_banc"); // second toucher pendant l'attente
    await Promise.all([premier, second]);
    return { canaux: window.__canaux, lectures: window.__lectures, vue: window._vliveView && window._vliveView.id, entree: window._vliveEntree };
  });
  // Un seul canal : chaque gestionnaire attaché UNE fois (sinon le chat s'affiche en double).
  expect(r.canaux).toEqual(["vlive:live_banc"]);
  // Et le second toucher s'arrête AVANT toute lecture : une seule demande de l'état du live.
  expect(r.lectures).toBe(1);
  expect(r.vue).toBe("live_banc");
  expect(r.entree).toBe(null);
});

// Les appels sont coupés pendant le pilote : l'armement de test les rallume, et
// `supabase.co` est coupé (rien ne part vers la production).
async function bancAppel(page) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem("passio_appels_actifs", "1"));
  await preparer(page);
  await page.evaluate(() => {
    window.__muet = true; // le relais tarde 2,5 s : la fenêtre où l'on peut retoucher
    window.__arrets = 0; window.__connexions = 0; window.__refus = []; window.__medias = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.__medias++;
      const piste = { stop() { window.__arrets++; } };
      return Promise.resolve({ getTracks: () => [piste], getAudioTracks: () => [piste], getVideoTracks: () => [] });
    };
    _callSetupPeerConnection = () => { window.__connexions++; };
    _callRenderActiveUI = () => {};
    _callDeclineSilent = (inv) => { window.__refus.push(inv.callId); };
  });
}

test("⑪ appel entrant : « Refuser » pendant l'attente du relais ANNULE l'acceptation — aucune connexion, caméra et micro coupés", async ({ page }) => {
  await bancAppel(page);
  const r = await page.evaluate(async () => {
    window._callIncoming = { callId: "c_banc", from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "voice", identite: { name: "Léa", emoji: "🌿", color: "#22c55e" } };
    const acceptation = acceptIncomingCall();
    await new Promise((res) => setTimeout(res, 300));
    declineIncomingCall(); // rien ne bougeait encore à l'écran : on refuse
    await acceptation;
    return { appel: !!window._call, connexions: window.__connexions, medias: window.__medias, arrets: window.__arrets, refus: window.__refus, jeton: window._callAcceptation };
  });
  expect(r.medias).toBe(1);
  expect(r.appel).toBe(false);
  expect(r.connexions).toBe(0);
  expect(r.arrets, "la caméra et le micro obtenus sont coupés").toBe(1);
  expect(r.refus).toEqual(["c_banc"]);
  expect(r.jeton).toBe(null);
});

test("⑪ bis appel entrant accepté sans refus : il se connecte, une seule fois", async ({ page }) => {
  await bancAppel(page);
  const r = await page.evaluate(async () => {
    window._callIncoming = { callId: "c_banc", from: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "voice", identite: { name: "Léa", emoji: "🌿", color: "#22c55e" } };
    await acceptIncomingCall();
    return { appel: window._call && window._call.id, connexions: window.__connexions, arrets: window.__arrets, jeton: window._callAcceptation };
  });
  expect(r.appel).toBe("c_banc");
  expect(r.connexions).toBe(1);
  expect(r.arrets).toBe(0);
  expect(r.jeton).toBe(null);
});

test("⑩ bis deux lives touchés coup sur coup : le DERNIER gagne, le premier n'ouvre aucun canal", async ({ page }) => {
  await bancLive(page);
  const r = await page.evaluate(async () => {
    const a = joinVideoLive("live_a");
    const b = joinVideoLive("live_b");
    await Promise.all([a, b]);
    return { canaux: window.__canaux, vue: window._vliveView && window._vliveView.id, entree: window._vliveEntree };
  });
  expect(r.canaux).toEqual(["vlive:live_b"]);
  expect(r.vue).toBe("live_b");
  expect(r.entree).toBe(null);
});
