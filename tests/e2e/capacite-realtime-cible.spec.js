const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// ═══════════════════════════════════════════════════════════════════════════
// TEMPS RÉEL : UN ÉVÉNEMENT SANS RAPPORT AVEC L'ÉCRAN NE COÛTE RIEN (2026-09-21)
//
// `profiles` UPDATE est poussé à tous les connectés (table publique, aucun
// filtre de colonne possible) et c'est la table la plus modifiée de la base.
// Avant, chaque UPDATE de n'importe qui faisait chez chacun : une entrée de
// cache persistée, un rendu du fil, un rendu des messages. Désormais seul un
// profil CONNU localement (montré quelque part) suit ce chemin ; un inconnu est
// ignoré et compté. Le vrai gestionnaire du canal est exercé.
// ═══════════════════════════════════════════════════════════════════════════

async function preparer(page) {
  await bootOnboarded(page);
  return page.evaluate(() => {
    stopFeedRefreshLoop();
    MY_UID = "812aee2b-214f-4949-931e-842599b6d68b"; window.MY_UID = MY_UID;
    window._supaReal = true;
    window.__rendusFil = 0; window.__rendusMessages = 0;
    window.scheduleFeedRender = () => { window.__rendusFil++; };
    window.renderMessages = () => { window.__rendusMessages++; };
    window._rtProfilsIgnores = 0;
    _clearProfileCache();
    state.seed.users = state.seed.users.filter(u => u.id !== "connu_fil" && u.id !== "inconnu" && u.id !== "connu_messagerie");
    cacheRemoteProfile({ id: "connu_fil", username: "Camille", emoji: "📷", color: "#123456", avatar_url: null });
    _profileCache.set("connu_messagerie", { username: "Dominique", emoji: "🎸", color: "#654321" });
    const bindings = [];
    supa.channel = () => { const ch = { on(type, cfg, cb) { bindings.push({ cfg, cb }); return ch; }, subscribe() { return ch; } }; return ch; };
    _creerCanalDb(true);
    window.__profilsUpdate = bindings.find(b => b.cfg.table === "profiles" && b.cfg.event === "UPDATE").cb;
    return bindings.map(b => b.cfg.table + ":" + b.cfg.event);
  });
}

test("un profil inconnu localement : ni cache, ni rendu du fil, ni rendu des messages", async ({ page }) => {
  const bindings = await preparer(page);
  expect(bindings.filter(b => b.startsWith("profiles:"))).toEqual(["profiles:UPDATE"]);
  const r = await page.evaluate(() => {
    const tailleAvant = state.seed.users.length, cacheAvant = _profileCache.size;
    __profilsUpdate({ new: { id: "inconnu", username: "Personne", emoji: "👻", color: "#000", avatar_url: null, passion_id: "photo", passions: [], bio: "" } });
    return { rendusFil: __rendusFil, rendusMessages: __rendusMessages, ignores: _rtProfilsIgnores,
      seed: state.seed.users.length - tailleAvant, cache: _profileCache.size - cacheAvant, connu: profilConnuLocalement("inconnu") };
  });
  expect(r).toEqual({ rendusFil: 0, rendusMessages: 0, ignores: 1, seed: 0, cache: 0, connu: false });
});

test("un profil connu (auteur du fil) : cache rafraîchi et rendus, comme avant", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    __profilsUpdate({ new: { id: "connu_fil", username: "Camille B.", emoji: "📷", color: "#123456", avatar_url: "https://x/c.jpg", passion_id: "photo", passions: [], bio: "" } });
    const u = userById("connu_fil");
    return { rendusFil: __rendusFil, rendusMessages: __rendusMessages, ignores: _rtProfilsIgnores, nom: u && u.name, photo: u && u.photoUrl };
  });
  expect(r).toEqual({ rendusFil: 1, rendusMessages: 1, ignores: 0, nom: "Camille B.", photo: "https://x/c.jpg" });
});

test("un profil connu de la seule messagerie suit aussi le chemin d'avant ; le mien est ignoré comme avant", async ({ page }) => {
  await preparer(page);
  const r = await page.evaluate(() => {
    __profilsUpdate({ new: { id: "connu_messagerie", username: "Dom", emoji: "🎸", color: "#654321", avatar_url: null, passion_id: "musique", passions: [], bio: "" } });
    const apresConnu = { rendusFil: __rendusFil, rendusMessages: __rendusMessages, nom: _profileCache.get("connu_messagerie").username };
    __profilsUpdate({ new: { id: MY_UID, username: "Moi", emoji: "✨", color: "#fff", avatar_url: null } });
    return { apresConnu, apresMoi: { rendusFil: __rendusFil, rendusMessages: __rendusMessages, ignores: _rtProfilsIgnores } };
  });
  expect(r.apresConnu).toEqual({ rendusFil: 1, rendusMessages: 1, nom: "Dom" });
  expect(r.apresMoi).toEqual({ rendusFil: 1, rendusMessages: 1, ignores: 0 });
});

test("l'autorité est unique et le gestionnaire la lit avant tout travail", async () => {
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");
  expect(src.split("function profilConnuLocalement(").length).toBe(2);
  const debut = src.indexOf('table: "profiles" }, payload => {');
  const corps = src.slice(debut, src.indexOf("cacheRemoteProfile(p);", debut));
  expect(corps).toContain("if (!profilConnuLocalement(p.id))");
});
