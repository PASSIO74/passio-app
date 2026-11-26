// ═══════════════════════════════════════════════════════════════════════════
// STICKERS DE STORY ET DE BOBINE (2026-11-26, lot B) — façon Instagram
//   ① 📍 Activité : choisie parmi les activités à venir, posée sur la story ;
//      dans le lecteur, un toucher ferme la story et ouvre la fiche ;
//   ② @ Mention : choisie par son nom ; dans le lecteur, un toucher ouvre le
//      profil ; à la publication réussie, le compte mentionné reçoit un
//      message (jamais un compte d'exemple, jamais soi) ;
//   ③ ❓ Question : posée sur la story ; un spectateur répond, la réponse part
//      en message à l'auteur, la story est en pause pendant qu'il écrit ;
//   ④ bobine : Activité et Mention proposées, pas la Question ;
//   ⑤ un sticker hostile d'un autre compte ne sort pas de ses attributs ;
//   ⑨ story « Amis proches » : seul un compte mentionné qui peut LIRE la story
//      est prévenu — membre de la liste (relue au serveur) et, si le compte est
//      privé, abonné accepté ; un non-membre n'apprend pas qu'une story existe
//      (red team du 2026-11-26) ; une lecture en échec = personne.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

const LEA = "a1b2c3d4-0000-4000-8000-00000000d101";
const TOM = "a1b2c3d4-0000-4000-8000-00000000d102";
const MOI = "a1b2c3d4-0000-4000-8000-00000000d1ff";

async function banc(page, mode) {
  await bootOnboarded(page);
  await page.evaluate(({ lea, mode }) => {
    window.requireAuthentication = () => true;
    try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("banc")); } catch (e) {}
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== lea);
    state.seed.users.push({ id: lea, name: "Léa Martin", profileEmoji: "🎸", avatar: "#ec4899" });
    window.__envois = [];
    window._envoyerALAuteurStory = async (s, nom, texte) => { window.__envois.push({ a: s.authorId, texte }); return "envoye"; };
    window._uidEstUnCompte = () => true;
    meOpen(mode);
    if (mode === "bobine") meEnterEditPhase();
  }, { lea: LEA, mode });
  if (mode === "story") {
    await page.locator("#meBgBtn").click();
    await page.locator("#meTeChamp").fill("Ce soir");
    await page.locator("#meTeOk").click();
  }
}

test("① 📍 Activité : posée, puis ouvre la fiche depuis le lecteur", async ({ page }) => {
  await banc(page, "story");
  const ev = await page.evaluate(() => allEvents().find((e) => Number(e.date) > Date.now()));
  expect(ev, "le socle porte une activité à venir").toBeTruthy();
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Activité"]').click();
  await page.locator(`#meStickerPanel [data-eid="${ev.id}"]`).click();
  await expect(page.locator("#meStickerPanel")).toHaveCount(0);
  await expect(page.locator("#meOverlays .me-sticker-evenement")).toContainText(ev.title);
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  const s = await page.evaluate(() => state.seed.stories[0]);
  expect(s.overlays.find((o) => o.type === "evenement")).toMatchObject({ eid: ev.id, titre: ev.title });
  await page.evaluate((st) => { storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); }, s);
  const sticker = page.locator("#storyOverlays .story-sticker.st-evt");
  await expect(sticker).toBeVisible();
  // Le sticker est AU-DESSUS des zones de tap : c'est lui qui reçoit le toucher.
  const dessus = await sticker.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(t && t.closest(".story-sticker")); });
  expect(dessus).toBe(true);
  await sticker.click();
  await expect(page.locator("#storyViewer")).not.toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window._openEventDetailId)).toBe(ev.id);
});

test("② @ Mention : posée, ouvre le profil, et prévient le compte à la publication", async ({ page }) => {
  await banc(page, "story");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Mention"]').click();
  await page.locator("#meStickerPanel .me-sticker-recherche").fill("léa m");
  await page.locator(`#meStickerPanel [data-uid="${LEA}"]`).click();
  await expect(page.locator("#meOverlays .me-sticker-mention")).toHaveText("@Léa Martin");
  // Un compte d'exemple mentionné en plus : jamais prévenu.
  await page.evaluate(() => meAddOverlay({ type: "mention", uid: "u_lea", nom: "Léa Moreau", x: 50, y: 70 }));
  // Story gardée sur l'appareil : personne n'est prévenu.
  await page.evaluate(() => { window._supaReal = false; meState._enteredEditAt = 0; mePublish(); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Story écrite par le SERVEUR : le compte réel mentionné est prévenu, une fois.
  await page.evaluate(() => {
    window._supaReal = true; window.supaPublishStory = async () => true;
    const st = state.seed.stories[0];
    meOpen("story"); meState.overlays = []; 
    meCycleBg(); meFermerEditeurTexte(false);
    st.overlays.filter((o) => o.type === "mention").forEach((o) => meAddOverlay(Object.assign({}, o)));
    meState._enteredEditAt = 0; mePublish();
  });
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  const envoi = await page.evaluate(() => window.__envois[0]);
  expect(envoi.a).toBe(LEA);
  expect(envoi.texte).toContain("mentionné·e dans ma story");
  const s = await page.evaluate(() => state.seed.stories[0]);
  await page.evaluate((st) => { window.__profil = null; window.openUserProfile = (id) => { window.__profil = id; }; storyGroups = [{ authorId: st.authorId, stories: [st] }]; openStoryViewerAt(0, 0); }, s);
  await page.locator(`#storyOverlays .story-sticker.st-mention[data-uid="${LEA}"]`).click();
  await expect(page.locator("#storyViewer")).not.toHaveClass(/active/);
  expect(await page.evaluate(() => window.__profil)).toBe(LEA);
});

test("③ ❓ Question : la réponse d'un spectateur part en message à l'auteur", async ({ page }) => {
  await banc(page, "story");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Question"]').click();
  const feuille = page.locator("#feuilleConfirmation");
  await expect(feuille).toBeVisible();
  await page.locator("#feuilleConfirmationChamp").fill("Ton meilleur spot ?");
  await feuille.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.locator("#meOverlays .me-sticker-question")).toContainText("Ton meilleur spot ?");
  const data = await page.evaluate(() => _meOverlaysData().find((o) => o.type === "question"));
  expect(data.q).toBe("Ton meilleur spot ?");
  // Spectateur : la story est celle de Léa.
  await page.evaluate(({ d, lea }) => {
    meClose();
    const st = { id: "s_q", authorId: lea, authorName: "Léa Martin", text: "", overlays: [d], createdAt: Date.now() - 1000 };
    storyGroups = [{ authorId: lea, stories: [st] }];
    openStoryViewerAt(0, 0);
  }, { d: data, lea: LEA });
  await page.locator("#storyOverlays .st-q-rep").click();
  expect(await page.evaluate(() => window._storyEnPause)).toBe(true);
  const f2 = page.locator("#feuilleConfirmation");
  await page.locator("#feuilleConfirmationChamp").fill("La plage du Moulin");
  await f2.getByRole("button", { name: "Envoyer" }).click();
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  const e = await page.evaluate(() => window.__envois[0]);
  expect(e.a).toBe(LEA);
  expect(e.texte).toContain("Ton meilleur spot ?");
  expect(e.texte).toContain("La plage du Moulin");
  expect(await page.evaluate(() => !!window._storyEnPause), "la pause revient à ce qu elle était").toBe(false);
});

test("④ bobine : Activité et Mention proposées, pas la Question", async ({ page }) => {
  await banc(page, "bobine");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Activité"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Mention"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Question"]')).toHaveCount(0);
  // Le lecteur de bobines rend la mention, touchable — mais JAMAIS une Question
  // (posts.overlays est écrit par n'importe quel compte ; la réponse partirait
  // vers la dernière story vue).
  const html = await page.evaluate((lea) => renderReelHTML({ id: "reel_s", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: [{ type: "mention", uid: lea, nom: "Léa", x: 50, y: 50 }, { type: "question", q: "Piège ?" }], text: "", likes: 0, comments: [] }, 0), LEA);
  expect(html).toContain('class="story-ov story-sticker st-mention"');
  expect(html).not.toContain("st-q-rep");
  expect(html).not.toContain("Piège");
  // Une bobine publiée au REJEU ne prévient qu'une fois.
  const n = await page.evaluate((lea) => { const post = { id: "reel_m", isReel: true, overlays: [{ type: "mention", uid: lea, nom: "Léa" }] }; _prevenirMentionsBobine(post); _prevenirMentionsBobine(post); return new Promise((r) => setTimeout(() => r(window.__envois.length), 100)); }, LEA);
  expect(n).toBe(1);
});

test("⑤ un sticker hostile d'un autre compte ne sort pas de ses attributs", async ({ page }) => {
  await bootOnboarded(page);
  const h = await page.evaluate(() => _storyOverlaysHtml([
    { type: "evenement", eid: 'e1" onclick="alert(1)', titre: "x" },
    { type: "evenement", eid: "e1", titre: "<img src=x onerror=alert(1)>", quand: "<b>" },
    { type: "mention", uid: "u'><svg onload=1>", nom: "x" },
    { type: "mention", uid: "u_ok", nom: '"><script>alert(1)</script>' },
    { type: "question", q: '" onmouseover="alert(1)' },
  ]));
  // Analysé comme le ferait le navigateur : aucun élément actif, aucun attribut on*.
  const dom = await page.evaluate((html) => {
    const d = document.createElement("div"); d.innerHTML = html;
    const els = Array.from(d.querySelectorAll("*"));
    return {
      interdits: els.filter((e) => /^(IMG|SVG|SCRIPT)$/i.test(e.tagName)).length,
      on: els.filter((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length,
      evt: Array.from(d.querySelectorAll("[data-evt]")).map((e) => e.getAttribute("data-evt")),
      uid: Array.from(d.querySelectorAll("[data-uid]")).map((e) => e.getAttribute("data-uid")),
    };
  }, h);
  expect(dom.interdits).toBe(0);
  expect(dom.on).toBe(0);
  expect(dom.evt).toEqual(["e1"]);
  expect(dom.uid).toEqual(["u_ok"]);
});

test("⑥ un bouton « Écris ta réponse » hors du lecteur de story n'envoie rien", async ({ page }) => {
  await banc(page, "story");
  const r = await page.evaluate((lea) => {
    meClose();
    // La dernière story vue est celle de Léa…
    storyGroups = [{ authorId: lea, stories: [{ id: "s_l", authorId: lea, authorName: "Léa", text: "x", createdAt: Date.now() }] }];
    // …mais le bouton est ailleurs (forgé dans une autre surface).
    const d = document.createElement("div");
    d.innerHTML = '<div class="story-sticker st-question" data-q="Piège"><button type="button" class="st-q-rep">x</button></div>';
    document.body.appendChild(d);
    d.querySelector(".st-q-rep").click();
    return !!document.getElementById("feuilleConfirmation");
  }, LEA);
  expect(r).toBe(false);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
});

test("⑦ 📊 Sondage : posé, un vote, les pourcentages ; serveur stub, double vote, table absente", async ({ page }) => {
  await banc(page, "story");
  // Drapeau coupé (retour arrière) : le sticker n'est PAS proposé.
  await page.evaluate(() => { STORY_SONDAGE_ACTIF = false; });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Sondage"]')).toHaveCount(0);
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.evaluate(() => { STORY_SONDAGE_ACTIF = true; });
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await page.locator('#meStickerPanel [data-sticker="Sondage"]').click();
  await page.locator("#meSdQ").fill("Plage ou montagne ?");
  await page.locator("#meSdA").fill("Plage");
  await page.locator("#meSdB").fill("Montagne");
  await page.locator("#meSdOk").click();
  await expect(page.locator("#meOverlays .me-sticker-sondage")).toContainText("Plage ou montagne ?");
  const d = await page.evaluate(() => _meOverlaysData().find((o) => o.type === "sondage"));
  expect(d).toMatchObject({ q: "Plage ou montagne ?", a: "Plage", b: "Montagne" });

  // Serveur simulé : on enregistre l'INTENTION envoyée, puis la base rend les comptes.
  const r = await page.evaluate(({ d, lea }) => {
    meClose();
    window.__votes = []; window.__rpc = 0; window.__reponse = { error: null };
    window._supaReal = true;
    supa = {
      from: (t) => ({ insert: async (row) => { window.__votes.push({ t, row }); return window.__reponse; } }),
      rpc: async (nom, args) => { window.__rpc++; return { data: window.__votes.length ? { a_vote: true, mon_choix: 1, a: 3, b: 1 } : { a_vote: false }, error: null }; },
    };
    const st = { id: "s_sd", authorId: lea, authorName: "Léa Martin", text: "", overlays: [d], createdAt: Date.now() - 1000, fromSupabase: true };
    storyGroups = [{ authorId: lea, stories: [st] }];
    openStoryViewerAt(0, 0);
    return document.querySelectorAll("#storyOverlays .st-sondage .st-sd-opt").length;
  }, { d, lea: LEA });
  expect(r).toBe(2);
  await page.locator('#storyOverlays .st-sd-opt[data-choix="1"]').click();
  await expect(page.locator("#storyOverlays .st-sondage")).toHaveClass(/st-sd-vote/);
  const v = await page.evaluate(() => ({ votes: window.__votes, pct: Array.from(document.querySelectorAll("#storyOverlays .st-sd-pct")).map((e) => e.textContent), mien: document.querySelector("#storyOverlays .st-sd-mien").getAttribute("data-choix") }));
  expect(v.votes).toEqual([{ t: "story_sondage_votes", row: { story_id: "s_sd", choix: 1 } }]);
  expect(v.pct).toEqual(["75 %", "25 %"]);
  expect(v.mien).toBe("1");
  // Un second toucher ne revote pas.
  await page.locator('#storyOverlays .st-sd-opt[data-choix="0"]').click();
  expect(await page.evaluate(() => window.__votes.length)).toBe(1);

  // Table absente (migration pas encore appliquée) : un message clair, rien d'affiché comme voté.
  await page.evaluate(({ d, lea }) => {
    closeStoryViewer();
    window.__reponse = { error: { code: "PGRST205", message: "absente" } };
    window.__toasts = []; const t0 = window.toast; window.toast = (m) => { window.__toasts.push(m); };
    supa.rpc = async () => ({ data: { a_vote: false }, error: null });
    const st = { id: "s_sd2", authorId: lea, authorName: "Léa", text: "", overlays: [d], createdAt: Date.now() - 1000, fromSupabase: true };
    storyGroups = [{ authorId: lea, stories: [st] }];
    openStoryViewerAt(0, 0);
  }, { d, lea: LEA });
  await page.locator('#storyOverlays .st-sd-opt[data-choix="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__toasts.join("|"))).toContain("bientôt");
  await expect(page.locator("#storyOverlays .st-sondage")).not.toHaveClass(/st-sd-vote/);
});

test("⑧ 📊 Sondage : jamais rendu dans une bobine, et hostile = inerte", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const ov = [{ type: "sondage", q: '<img src=x onerror=alert(1)>', a: '"><svg onload=1>', b: "x" }];
    const bobine = renderReelHTML({ id: "reel_sd", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: ov, text: "", likes: 0, comments: [] }, 0);
    const d = document.createElement("div"); d.innerHTML = _storyOverlaysHtml(ov, { story: true });
    const els = Array.from(d.querySelectorAll("*"));
    const deux = _storyOverlaysHtml([{ type: "sondage", q: "Un", a: "a", b: "b" }, { type: "sondage", q: "Deux", a: "c", b: "d" }], { story: true });
    return { deux: (deux.match(/st-sondage/g) || []).length, bobine: bobine.includes("st-sondage"), actifs: els.filter((e) => /^(IMG|SVG|SCRIPT)$/i.test(e.tagName) || Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length, opts: d.querySelectorAll(".st-sd-opt").length };
  });
  expect(r.bobine).toBe(false);
  expect(r.deux, "un seul sondage rendu par story").toBe(1);
  expect(r.actifs).toBe(0);
  expect(r.opts).toBe(2);
});

test("⑨ story « Amis proches » : seul un mentionné qui peut lire la story est prévenu", async ({ page }) => {
  await banc(page, "story");
  await page.evaluate(({ moi, lea, tom }) => {
    MY_UID = moi; STORY_PROCHES_ACTIF = true; window._supaReal = true;
    window.__liste = { rows: [{ ami_id: lea }], error: null }; window.__lectures = [];
    window.__prive = false; window.__abonnes = [];
    supa = {
      from: (t) => {
        const f = [];
        const rep = () => {
          if (t === "amis_proches") return { data: window.__liste.error ? null : window.__liste.rows, error: window.__liste.error };
          if (t === "profiles") return { data: { is_private: window.__prive }, error: null };
          if (t === "follows") return { data: window.__abonnes.map((id) => ({ follower_id: id })), error: null };
          return { data: null, error: { code: "banc" } };
        };
        const b = {
          select() { return b; }, eq(c, v) { f.push([c, v]); return b; }, in(c, v) { f.push([c, v]); return b; }, limit() { return b; },
          maybeSingle() { return b; },
          then(ok, ko) { window.__lectures.push({ t, f }); return Promise.resolve(rep()).then(ok, ko); },
        };
        return b;
      },
    };
    window.supaPublishStory = async () => true;
    window.__publier = () => {
      meOpen("story"); meState.overlays = [];
      meCycleBg(); meFermerEditeurTexte(false);
      meAddOverlay({ type: "mention", uid: lea, nom: "Léa Martin", x: 40, y: 40 });
      meAddOverlay({ type: "mention", uid: tom, nom: "Tom Hors-liste", x: 60, y: 60 });
      meState._enteredEditAt = 0;
      return mePublishProches();
    };
  }, { moi: MOI, lea: LEA, tom: TOM });
  // Léa est dans la liste, Tom non : seule Léa reçoit le message.
  await page.evaluate(() => window.__publier());
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  await page.waitForTimeout(300);
  const envois = await page.evaluate(() => window.__envois);
  expect(envois.map((e) => e.a)).toEqual([LEA]);
  expect(await page.evaluate(() => state.seed.stories[0].audience)).toBe("proches");
  // La liste est relue au SERVEUR, filtrée sur le propriétaire.
  const lectures = await page.evaluate(() => window.__lectures.filter((r) => r.t === "amis_proches"));
  expect(lectures.some((r) => r.f.some(([c, v]) => c === "owner_id" && v === MOI))).toBe(true);
  // Compte PRIVÉ : Léa est dans la liste mais ne me suit pas → elle ne verrait
  // pas la story, elle n'est pas prévenue ; abonnée acceptée → prévenue.
  await page.evaluate(() => { window.__envois = []; window.__prive = true; window.__abonnes = []; return window.__publier(); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  await page.evaluate((lea) => { window.__abonnes = [lea]; return window.__publier(); }, LEA);
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
  const ab = await page.evaluate(() => window.__lectures.filter((r) => r.t === "follows").pop());
  expect(ab.f, "abonnés ACCEPTÉS de l'auteur, parmi la liste").toEqual(expect.arrayContaining([["following_id", MOI], ["status", "accepted"], ["follower_id", [LEA]]]));
  await page.evaluate(() => { window.__prive = false; });
  // Lecture de la liste en échec (après le passage de mePublishProches) : personne.
  await page.evaluate(() => {
    window.__envois = [];
    const lire = window._lireAmisProchesPourMentions;
    window._lireAmisProchesPourMentions = async () => { window.__liste = { rows: null, error: { code: "500" } }; return lire(); };
    return window.__publier();
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Story pour TOUS : les deux comptes réels mentionnés sont prévenus.
  await page.evaluate(({ lea, tom }) => {
    meOpen("story"); meState.overlays = [];
    meCycleBg(); meFermerEditeurTexte(false);
    meAddOverlay({ type: "mention", uid: lea, nom: "Léa Martin", x: 40, y: 40 });
    meAddOverlay({ type: "mention", uid: tom, nom: "Tom Hors-liste", x: 60, y: 60 });
    meState._enteredEditAt = 0; mePublish();
  }, { lea: LEA, tom: TOM });
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a).sort())).toEqual([LEA, TOM].sort());
});
