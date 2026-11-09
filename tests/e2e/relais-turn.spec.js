// ═══════════════════════════════════════════════════════════════════════════
// RELAIS TURN DES APPELS ET DES LIVES — CLOUDFLARE, FABRIQUÉ PAR LE SERVEUR (2026-11-09)
//
// Le TURN public « Open Relay » est mort (`openrelay.metered.ca` → 192.0.2.1 /
// 100::1, mesuré le 2026-11-09) : sans relais, un live ou un appel entre deux
// réseaux à NAT strict échoue. `notify-call` fabrique, sur `{ type: "ice" }`, des
// identifiants Cloudflare de 24 h ; `assurerServeursIce` (app-05) les AJOUTE au
// tableau que lisent les cinq `new RTCPeerConnection`. Le vrai code client, un
// faux `supa.functions.invoke` qui COMPTE les demandes.
//
// ① une réponse valide ajoute le relais, une seule demande ;
// ② gardé jusqu'à son expiration : pas de seconde demande ;
// ③ fonction non configurée (secrets absents) : rien d'ajouté, pas redemandé avant une heure ;
// ④ réponse hostile ou hors forme : rien d'ajouté ;
// ⑤ fonction muette : la promesse se règle en 2,5 s au plus, l'app continue en STUN ;
// ⑥ un renouvellement REMPLACE les anciens identifiants (le tableau ne grossit pas) ;
// ⑦ un visiteur ne demande rien ;
// ⑧ câblage : les lives et les appels le demandent au bon moment.
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
    window.__reponse = { data: { ok: true, iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, relais], ttl: 86400, configure: true }, error: null };
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
    _iceRelais.serveurs = []; _iceRelais.jusqua = 0; _iceRelais.enCours = null;
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

test("② gardé jusqu'à son expiration : une seconde demande ne part pas", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    await assurerServeursIce(); await assurerServeursIce(); await assurerServeursIce();
    return { demandes: window.__demandes.length, longueur: CALL_ICE_SERVERS.length, base: window.__base, expire: _iceRelais.jusqua - Date.now() };
  });
  expect(r.demandes).toBe(1);
  expect(r.longueur).toBe(r.base + 2);
  // Gardé une heure de moins que les 24 h de Cloudflare.
  expect(r.expire).toBeGreaterThan(22 * 3600 * 1000);
  expect(r.expire).toBeLessThanOrEqual(23 * 3600 * 1000);
});

test("③ fonction non configurée (secrets absents) : rien d'ajouté, pas redemandé avant une heure", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    window.__reponse = { data: { ok: true, iceServers: [], configure: false }, error: null };
    const n = await assurerServeursIce();
    await assurerServeursIce();
    return { n, demandes: window.__demandes.length, longueur: CALL_ICE_SERVERS.length, base: window.__base, attente: _iceRelais.jusqua - Date.now() };
  });
  expect(r.n).toBe(0);
  expect(r.demandes).toBe(1);
  expect(r.longueur).toBe(r.base);
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

test("⑤ fonction muette : la promesse se règle en 2,5 s au plus, l'app continue en STUN seul", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(async () => {
    window.__muet = true;
    const debut = Date.now();
    const n = await assurerServeursIce();
    return { n, ms: Date.now() - debut, longueur: CALL_ICE_SERVERS.length, base: window.__base };
  });
  expect(r.n).toBe(0);
  expect(r.ms).toBeGreaterThanOrEqual(2400);
  expect(r.ms).toBeLessThan(6000);
  expect(r.longueur).toBe(r.base);
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

test("⑧ câblage : les lives et les appels demandent le relais au bon moment", async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-05-config-profil.js"), "utf8");
  const corps = (nom) => {
    const i = src.indexOf(nom);
    expect(i, nom).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf("\n}\n", i));
  };
  const hote = corps("async function startVideoLive()");
  expect(hote.indexOf("assurerServeursIce();")).toBeGreaterThan(hote.indexOf("_appelEnPreparation();"));
  expect(hote.indexOf("assurerServeursIce();")).toBeLessThan(hote.indexOf("await _vlivePromptTitle()"));
  const spectateur = corps("async function joinVideoLive(liveId)");
  expect(spectateur).toContain("const _relais = assurerServeursIce();");
  // Attendu AVANT d'entrer dans le canal du live : l'offre de l'hôte peut arriver tout de suite.
  expect(spectateur.indexOf("try { await _relais; } catch (e) {}")).toBeGreaterThan(-1);
  expect(spectateur.indexOf("try { await _relais; } catch (e) {}")).toBeLessThan(spectateur.indexOf('supa.channel("vlive:"'));
  expect(corps("async function startCall(convId, kind)")).toContain("assurerServeursIce();");
  expect(corps("async function acceptIncomingCall()")).toContain("assurerServeursIce();");
  // Aucune connexion ne lit autre chose que le tableau commun.
  const connexions = src.match(/new RTCPeerConnection\(\{[^)]*\}\)/g) || [];
  expect(connexions.length).toBe(5);
  for (const c of connexions) expect(c).toBe("new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS })");
  // Aucun secret Cloudflare dans le client (le dépôt est public).
  expect(src).not.toMatch(/TURN_CF_API_TOKEN\s*[:=]|rtc\.live\.cloudflare\.com/);
});
