// Audit BILAN PASSIO 09/26 — domaine profils-passions — attaques en ÉMULATION Chromium (serveur local).
// Aucune écriture en base : `supa` est remplacé par un faux client qui journalise.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const fs = require("fs");
const OUT = __dirname;
function note(nom, obj) { fs.writeFileSync(OUT + "/" + nom, JSON.stringify(obj, null, 2)); }

async function fauxSupa(page) {
  await page.evaluate(() => {
    window.__appels = [];
    function requete(table, op) {
      const q = { table, op, filtres: [],
        eq(c, v) { this.filtres.push(["eq", c, v]); return this; },
        not(c, o, v) { this.filtres.push(["not", c, o, v]); return this; },
        select() { return this; },
        maybeSingle() { return this; },
        then(res, rej) { window.__appels.push({ table: this.table, op: this.op, filtres: this.filtres }); return Promise.resolve({ data: this.op === "update" ? [{ id: "x" }] : [], error: null }).then(res, rej); } };
      return q;
    }
    supa = { from(table) { return {
      upsert: (rows, opts) => { window.__appels.push({ table, op: "upsert", rows, opts: opts || null }); return Promise.resolve({ data: null, error: null }); },
      update: (charge) => { const q = requete(table, "update"); q.charge = charge; window.__appels.push({ table, op: "update", charge }); return q; },
      insert: (charge) => { window.__appels.push({ table, op: "insert", charge }); return Promise.resolve({ data: null, error: null }); },
      delete: () => requete(table, "delete"),
      select: () => requete(table, "select"),
    }; } };
    window._supaReal = true;
  });
}

test("A · plafond : 6 passions vivantes injectées → aucun refus client, miroir user_passions envoie 6 lignes", async ({ page }) => {
  await bootOnboarded(page, null, 3);
  await fauxSupa(page);
  const r = await page.evaluate(async () => {
    const ids = ["musique", "photo", "voyage", "cuisine", "sport", "cinema"];
    state.user.profiles = ids.map((p, i) => ({ id: "p" + i, name: "Ben", passion: p, emoji: "✨", color: "#8b5cf6", createdAt: i + 1 }));
    state.user.currentProfileId = "p0";
    saveState();
    const vivantes = nbPassionsVivantes();
    const plafond = plafondPassionsAtteint();
    const restantes = passionsRestantesOffertes();
    const ok = await supaSavePassionState();
    const up = window.__appels.find(a => a.table === "user_passions" && a.op === "upsert");
    const prof = window.__appels.find(a => a.table === "profiles" && a.op === "update" && a.charge && a.charge.passions);
    return { vivantes, plafond, restantes, ok, nbLignesMiroir: up ? up.rows.length : null, nbPassionsProfil: prof ? prof.charge.passions.length : null, passionIdProfil: prof ? prof.charge.passion_id : null };
  });
  note("A-plafond-6-passions.json", r);
  expect(r.vivantes).toBe(6);
  expect(r.nbLignesMiroir).toBe(6);
});

test("A bis · kill switch flat_passions_v1=0 → le plafond disparaît, ajouterPassionAuCompte accepte une 4e puis une 5e", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("flat_passions_v1", "0"); });
  await bootOnboarded(page, null, 3);
  const r = await page.evaluate(() => {
    const avant = nbPassionsVivantes();
    const actif = plafondPassionsActif();
    const a4 = ajouterPassionAuCompte("jardinage", "");
    const a5 = ajouterPassionAuCompte("cinema", "");
    return { avant, plafondActif: actif, apres: nbPassionsVivantes(), a4: !!a4, a5: !!a5, illimite: passionsIllimitees() };
  });
  note("Abis-killswitch-plafond.json", r);
  expect(r.apres).toBe(5);
});

test("B · quota : 3 archives consommées puis journal vidé depuis le client → 3 changements de nouveau disponibles", async ({ page }) => {
  await bootOnboarded(page, null, 3);
  const r = await page.evaluate(() => {
    localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");
    state.onboarded = true;
    const ids = ["musique", "photo", "voyage", "cuisine"];
    state.user.profiles = ids.map((p, i) => ({ id: "p" + i, name: "Ben", passion: p, emoji: "✨", color: "#8b5cf6", createdAt: i + 1 }));
    state.user.currentProfileId = "p0";
    state.user.passionChanges = { entries: [] };
    saveState();
    const quotaActif = quotaChangementsActif();
    const r1 = archiverPassion("p1", true), r2 = archiverPassion("p2", true), r3 = archiverPassion("p3", true);
    const restantsApres3 = changementsPassionRestants();
    // 4e archive (p0 est active ; on restaure p1 puis on tente d'archiver p0 → refus attendu)
    restaurerPassion("p1", true);
    const r4 = archiverPassion("p0", true);
    const restantsAvantReset = changementsPassionRestants();
    state.user.passionChanges.entries = [];
    saveState();
    const restantsApresReset = changementsPassionRestants();
    const r5 = archiverPassion("p0", true);
    return { quotaActif, r1, r2, r3, restantsApres3, r4, restantsAvantReset, restantsApresReset, r5, journal: state.user.passionChanges.entries.length };
  });
  note("B-quota-reset-client.json", r);
  expect(r.r4).toBe(false);
  expect(r.restantsApresReset).toBe(3);
  expect(r.r5).toBe(true);
});

test("C · messagerie : le nom, l'emoji et la photo du contact suivent les métadonnées `sp` choisies par l'expéditeur", async ({ page }) => {
  await bootOnboarded(page, null, 1);
  await fauxSupa(page);
  const r = await page.evaluate(async () => {
    const autre = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    // Vérité serveur connue du client : le profil réel de l'expéditeur.
    _profileCache.set(autre, { username: "vrai_nom", emoji: "🎵", color: "#8b5cf6", photoUrl: "https://exemple.test/vrai.jpg" });
    const convs = getConversations();
    convs.unshift({ id: "conv_audit", isGroup: false, passion: null, userId: autre, userEmoji: "🎵", userColor: "#8b5cf6", userName: "vrai_nom", userPhoto: "https://exemple.test/vrai.jpg", userIds: [MY_UID, autre], lastAt: Date.now(), unread: 0, messages: [], fromSupabase: true });
    saveConversations();
    const contenu = JSON.stringify({ type: "text", text: "Bonjour, je suis l'équipe PASSIO", sp: { n: "Équipe PASSIO", e: "👑", c: "#000000", ph: "https://exemple.test/usurpe.jpg", pid: "x" } });
    await _handleIncomingConvMessage({ id: "msg_audit_1", conv_id: "conv_audit", from_id: autre, content: contenu, created_at: new Date().toISOString() });
    const c = getConversations().find(x => x.id === "conv_audit");
    const m = c.messages.find(x => x.id === "msg_audit_1");
    goTo("messages");
    await new Promise(r => setTimeout(r, 400));
    const liste = document.querySelector("#screen-messages") ? document.querySelector("#screen-messages").innerText : "";
    return { userName: c.userName, userEmoji: c.userEmoji, userPhoto: c.userPhoto, fromName: m.fromName, listeMontreUsurpe: /Équipe PASSIO/.test(liste), listeMontreVrai: /vrai_nom/.test(liste) };
  });
  note("C-usurpation-nom-messagerie.json", r);
  await page.screenshot({ path: OUT + "/C-usurpation-messagerie.png", fullPage: false });
  expect(r.userName).toBe("Équipe PASSIO");
});

test("D · archive de la passion active, double appel, restauration au plafond", async ({ page }) => {
  await bootOnboarded(page, null, 3);
  const r = await page.evaluate(() => {
    localStorage.setItem("passio_uid", "11111111-2222-4333-8444-555555555555");
    state.onboarded = true;
    state.user.passionChanges = { entries: [] };
    const active = state.user.currentProfileId;
    const r1 = archiverPassion(active, true);
    const r2 = archiverPassion(active, true);   // double clic
    const journal = state.user.passionChanges.entries.filter(e => e.type === "archive").length;
    const nouvelleActive = state.user.currentProfileId;
    const activeArchivee = !!(state.user.profiles.find(p => p.id === active) || {}).archived;
    // Restauration au plafond : on ajoute une 3e vivante puis on tente de restaurer.
    const vivantes = nbPassionsVivantes();
    const ajout = ajouterPassionAuCompte("jardinage", "");
    const plafond = plafondPassionsAtteint();
    let paywall = false; const _o = window.openPassionPaywall; window.openPassionPaywall = function () { paywall = true; };
    const r3 = restaurerPassion(active, true);
    window.openPassionPaywall = _o;
    return { r1, r2, journal, activeChangee: nouvelleActive !== active, activeArchivee, vivantesApresArchive: vivantes, ajout: !!ajout, plafond, restaurerAuPlafond: r3, paywallOuvert: paywall, toujoursArchivee: !!(state.user.profiles.find(p => p.id === active) || {}).archived };
  });
  note("D-archive-active-double-restaure.json", r);
  expect(r.r1).toBe(true); expect(r.r2).toBe(false); expect(r.journal).toBe(1);
  expect(r.activeChangee).toBe(true); expect(r.restaurerAuPlafond).toBe(false); expect(r.toujoursArchivee).toBe(true);
});

test("E · profiles.passions hostile d'un autre compte : échappé et borné à 3", async ({ page }) => {
  await bootOnboarded(page, null, 1);
  const r = await page.evaluate(() => {
    const u = { id: "autre", passions: [] };
    for (let i = 0; i < 50; i++) u.passions.push({ id: "x" + i, label: i === 0 ? "<img src=x onerror=window.__xss=1>" : "P" + i, emoji: "<b>" });
    const html = identitePassionsHTML(u, "ident-passions-sm");
    const d = document.createElement("div"); d.innerHTML = html;
    const aff = passionsAffichables(u);
    return { xss: !!window.__xss, contientBalise: /<img/.test(d.textContent) , html: html.slice(0, 200), nbAffichables: aff.length, nbTotal: 50 };
  });
  note("E-jsonb-hostile.json", r);
  expect(r.xss).toBe(false);
});

test("F · identité d'écriture : publier/commenter/réagir/RSVP/message/story/événement/suivre — colonnes envoyées", async ({ page }) => {
  await bootOnboarded(page, null, 2);
  await fauxSupa(page);
  const r = await page.evaluate(async () => {
    window.__appels = [];
    const res = {};
    const prof = currentProfile();
    res.currentProfile = { id: prof.id, passion: prof.passion, name: prof.name };
    try { res.retComment = await supaAddComment("post_x", "coucou", "c_audit"); } catch (e) { res.errComment = String(e); }
    try { await supaCommentInteract("c_audit", "post_x", "like", null); } catch (e) { res.errCint = String(e); }
    try { await supaSetEventRsvp("ev_x", "going"); } catch (e) { res.errRsvp = String(e); }
    try { await supaSendMessage("conv_x", "salut"); } catch (e) { res.errMsg = String(e); }
    try { await supaFollowUser("u_y"); } catch (e) { res.errFollow = String(e); }
    try { if (typeof supaPublishStory === "function") res.retStory = await supaPublishStory({ id: "st_audit", passion: prof.passion, content: "s" }); } catch (e) { res.errStory = String(e); }
    try { if (typeof supaPublishEvent === "function") res.retEvent = await supaPublishEvent({ id: "ev_audit", title: "T", passion: prof.passion, date: new Date(Date.now() + 864e5).toISOString(), city: "Annecy" }); } catch (e) { res.errEvent = String(e); }
    try { res.retPost = await supaPublishPost({ id: "post_audit", passion: prof.passion, content: "texte", mood: "creation", createdAt: Date.now(), type: "text" }); } catch (e) { res.errPost = String(e); }
    res.appels = window.__appels.filter(a => ["insert", "upsert", "update"].includes(a.op)).map(a => ({ table: a.table, op: a.op, cles: Object.keys(a.charge || (a.rows && a.rows[0]) || {}), passion_id: (a.charge || (a.rows && a.rows[0]) || {}).passion_id, author: (a.charge || {}).author_id || (a.charge || {}).user_id || (a.charge || {}).from_id || (a.charge || {}).follower_id, contenu: typeof (a.charge || {}).content === "string" ? (a.charge || {}).content.slice(0, 160) : undefined }));
    res.MY_UID = MY_UID;
    return res;
  });
  note("F-matrice-actions-identite.json", r);
  expect(r.appels.length).toBeGreaterThan(0);
});
