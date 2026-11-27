// ═══════════════════════════════════════════════════════════════════════════
// STICKERS DE STORY ET DE BOBINE (2026-11-26, lot B) — façon Instagram
//   ① 📍 Activité : choisie parmi les activités à venir, posée sur la story ;
//      dans le lecteur, un toucher ferme la story et ouvre la fiche ;
//   ② @ Mention : choisie par son nom ; dans le lecteur, un toucher ouvre le
//      profil ; à la publication réussie, le compte mentionné reçoit un
//      message (jamais un compte d'exemple, jamais soi) ;
//   ③ ❓ Question : posée sur la story ; un spectateur répond, la réponse part
//      en message à l'auteur, la story est en pause pendant qu'il écrit ;
//   ④ bobine : Activité, Mention et Question proposées (lot H), pas le Sondage ;
//   ⑤ un sticker hostile d'un autre compte ne sort pas de ses attributs ;
//   ⑩ compte PRIVÉ : une story « tous » ou une bobine ne prévient que les
//      mentionnés abonnés ACCEPTÉS (relus au serveur) — un autre compte
//      n'apprend pas qu'un contenu existe (red team du 2026-11-26) ; une
//      lecture en échec = personne ; jamais pour un autre auteur que moi.
//   ⑨ story « Amis proches » : seul un mentionné MEMBRE de la liste (relue au
//      serveur) est prévenu — un non-membre n'apprend pas qu'une story existe ;
//      compte privé : membre ET abonné accepté ; liste illisible = personne.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

const LEA = "a1b2c3d4-0000-4000-8000-00000000d101";
const TOM = "a1b2c3d4-0000-4000-8000-00000000d102";
const MOI = "a1b2c3d4-0000-4000-8000-00000000d1ff";

// `supa` simulé : profil (public par défaut) et abonnés acceptés ; chaque
// lecture est journalisée avec ses filtres.
async function stubSupa(page) {
  await page.evaluate(() => {
    window.__prive = false; window.__profilErreur = null; window.__followsErreur = null; window.__abonnes = []; window.__lectures = [];
    window.__liste = []; window.__listeErreur = null;
    window.__pendantLecture = null;
    supa = {
      from: (t) => {
        const f = []; let sel = null;
        const rep = () => {
          if (t === "profiles") return window.__profilErreur ? { data: null, error: window.__profilErreur } : { data: { is_private: window.__prive }, error: null };
          if (t === "follows") return window.__followsErreur ? { data: null, error: window.__followsErreur } : { data: window.__abonnes.map((id) => ({ follower_id: id })), error: null };
          if (t === "amis_proches") return window.__listeErreur ? { data: null, error: window.__listeErreur } : { data: window.__liste.map((id) => ({ ami_id: id })), error: null };
          return { data: null, error: { code: "banc" } };
        };
        const b = {
          select(c) { sel = c; return b; }, eq(c, v) { f.push([c, v]); return b; }, in(c, v) { f.push([c, v]); return b; }, limit() { return b; },
          maybeSingle() { return b; },
          then(ok, ko) {
            window.__lectures.push({ t, sel, f });
            if (window.__pendantLecture && t === "profiles" && sel === "is_private") { const g = window.__pendantLecture; window.__pendantLecture = null; g(); }
            return Promise.resolve(rep()).then(ok, ko);
          },
        };
        return b;
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    };
  });
}

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
  await stubSupa(page);
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

test("④ bobine : Activité, Mention et Question proposées, pas le Sondage", async ({ page }) => {
  await banc(page, "bobine");
  await page.locator('.me-tool[aria-label="Ajouter un sticker"]').click();
  await expect(page.locator('#meStickerPanel [data-sticker="Activité"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Mention"]')).toBeVisible();
  // ❓ Question proposée aux bobines depuis le 2026-11-26 (lot H) : la réponse va à
  // l'auteur de la bobine lu dans reelsState.items (bobine-montage-video.spec.js ⑤).
  // 📊 Sondage reste story seulement (votes rangés par story_id).
  await expect(page.locator('#meStickerPanel [data-sticker="Question"]')).toBeVisible();
  await expect(page.locator('#meStickerPanel [data-sticker="Sondage"]')).toHaveCount(0);
  // Le lecteur de bobines rend la mention, touchable, et la Question — son texte
  // ÉCHAPPÉ (posts.overlays est écrit par n'importe quel compte).
  const html = await page.evaluate((lea) => renderReelHTML({ id: "reel_s", authorId: "x", type: "video", isReel: true, video: "https://example.invalid/v.mp4", overlays: [{ type: "mention", uid: lea, nom: "Léa", x: 50, y: 50 }, { type: "question", q: "Piège <img src=x onerror=alert(1)> ?" }], text: "", likes: 0, comments: [] }, 0), LEA);
  expect(html).toContain('class="story-ov story-sticker st-mention"');
  expect(html).toContain("st-q-rep");
  expect(html).toContain("Piège &lt;img");
  expect(html).not.toContain("<img src=x");
  // Une bobine publiée au REJEU ne prévient qu'une fois.
  await stubSupa(page);
  const n = await page.evaluate((lea) => { const post = { id: "reel_m", isReel: true, authorId: MY_UID, overlays: [{ type: "mention", uid: lea, nom: "Léa" }] }; _prevenirMentionsBobine(post); _prevenirMentionsBobine(post); return new Promise((r) => setTimeout(() => r(window.__envois.length), 100)); }, LEA);
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

test("⑩ compte privé : story « tous » et bobine ne préviennent que les abonnés acceptés", async ({ page }) => {
  await banc(page, "story");
  await stubSupa(page);
  await page.evaluate(({ moi, lea, tom }) => {
    MY_UID = moi; window._supaReal = true;
    window.supaPublishStory = async () => true;
    window.__publier = () => {
      meOpen("story"); meState.overlays = [];
      meCycleBg(); meFermerEditeurTexte(false);
      meAddOverlay({ type: "mention", uid: lea, nom: "Léa Martin", x: 40, y: 40 });
      meAddOverlay({ type: "mention", uid: tom, nom: "Tom Inconnu", x: 60, y: 60 });
      meState._enteredEditAt = 0;
      return mePublish();
    };
    window.__bobine = (id, auteur) => _prevenirMentionsBobine({ id, isReel: true, authorId: auteur || MY_UID,
      overlays: [{ type: "mention", uid: lea, nom: "Léa" }, { type: "mention", uid: tom, nom: "Tom" }] });
  }, { moi: MOI, lea: LEA, tom: TOM });
  // Compte PRIVÉ, Léa abonnée acceptée, Tom non : seule Léa est prévenue.
  await page.evaluate((lea) => { window.__prive = true; window.__abonnes = [lea]; return window.__publier(); }, LEA);
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
  // `is_private` relu au SERVEUR pour MON compte ; abonnés ACCEPTÉS parmi les
  // mentionnés. Les lectures sont repérées par leur COLONNE : un minuteur de
  // l'app peut lire `profiles` ou `follows` avec d'autres filtres entre-temps.
  const lectures = await page.evaluate(() => window.__lectures);
  expect(lectures.filter((r) => r.t === "profiles" && r.sel === "is_private").map((r) => r.f)).toEqual([[["id", MOI]]]);
  expect(lectures.find((r) => r.t === "follows" && r.sel === "follower_id").f).toEqual(expect.arrayContaining([["following_id", MOI], ["status", "accepted"], ["follower_id", [LEA, TOM]]]));
  // Aucun abonné accepté parmi les mentionnés : personne.
  await page.evaluate(() => { window.__envois = []; window.__abonnes = []; return window.__publier(); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Bobine d'un compte privé : même règle, et une seule fois.
  await page.evaluate((lea) => { window.__abonnes = [lea]; window.__bobine("reel_p1"); }, LEA);
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
  // Lecture du profil en échec : personne n'est prévenu (story comme bobine).
  await page.evaluate(() => { window.__envois = []; window.__profilErreur = { code: "500" }; window.__publier(); window.__bobine("reel_p2"); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Lecture des abonnés en échec : personne.
  await page.evaluate(() => { window.__envois = []; window.__profilErreur = null; window.__followsErreur = { code: "500" }; window.__publier(); window.__bobine("reel_p2b"); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Le compte change PENDANT la lecture : personne.
  await page.evaluate((lea) => { window.__followsErreur = null; window.__abonnes = [lea]; window.__pendantLecture = () => { MY_UID = "a1b2c3d4-0000-4000-8000-00000000d1ee"; }; window.__bobine("reel_p2c", MY_UID); }, LEA);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  await page.evaluate((moi) => { MY_UID = moi; }, MOI);
  // Bobine d'un AUTRE compte (rejeu après changement de compte) : personne, sans lecture.
  await page.evaluate(() => { window.__profilErreur = null; window.__prive = false; window.__lectures = []; window.__bobine("reel_p3", "a1b2c3d4-0000-4000-8000-00000000d1ee"); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({ n: window.__envois.length, l: window.__lectures.filter((r) => r.sel === "is_private").length }))).toEqual({ n: 0, l: 0 });
  // Compte PUBLIC : les deux mentionnés sont prévenus…
  await page.evaluate(() => window.__publier());
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a).sort())).toEqual([LEA, TOM].sort());
  // … sauf un compte que J'AI bloqué.
  await page.evaluate((tom) => { window.__envois = []; state.user.blocked = [tom]; window.__publier(); }, TOM);
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
});

test("⑨ story « Amis proches » : seul un mentionné membre de la liste (et abonné si privé) est prévenu", async ({ page }) => {
  await banc(page, "story");
  await stubSupa(page);
  await page.evaluate(({ moi, lea, tom }) => {
    MY_UID = moi; window._supaReal = true; STORY_PROCHES_ACTIF = true;
    window.supaPublishStory = async () => true;
    window.__publier = (proches) => {
      meOpen("story"); meState.overlays = [];
      meCycleBg(); meFermerEditeurTexte(false);
      meAddOverlay({ type: "mention", uid: lea, nom: "Léa Martin", x: 40, y: 40 });
      meAddOverlay({ type: "mention", uid: tom, nom: "Tom Hors-liste", x: 60, y: 60 });
      meState._enteredEditAt = 0;
      return proches ? mePublishProches() : mePublish();
    };
  }, { moi: MOI, lea: LEA, tom: TOM });
  // Léa est dans la liste, Tom non : seule Léa reçoit le message.
  await page.evaluate((lea) => { window.__liste = [lea]; return window.__publier(true); }, LEA);
  await expect.poll(() => page.evaluate(() => window.__envois.length)).toBe(1);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
  expect(await page.evaluate(() => state.seed.stories[0].audience)).toBe("proches");
  // La liste est relue au SERVEUR, filtrée sur le propriétaire.
  const lectures = await page.evaluate(() => window.__lectures.filter((r) => r.t === "amis_proches" && r.sel === "ami_id"));
  expect(lectures.some((r) => r.f.some(([c, v]) => c === "owner_id" && v === MOI))).toBe(true);
  // Compte PRIVÉ : Léa membre mais pas abonnée acceptée → personne ; abonnée → Léa.
  await page.evaluate(() => { window.__envois = []; window.__prive = true; window.__abonnes = []; return window.__publier(true); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  await page.evaluate(({ lea, tom }) => { window.__abonnes = [lea, tom]; return window.__publier(true); }, { lea: LEA, tom: TOM });
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a))).toEqual([LEA]);
  // Lecture de la liste en échec (APRÈS le passage de mePublishProches) : personne.
  await page.evaluate(() => {
    window.__envois = []; window.__prive = false;
    const lire = window._lireAmisProchesPourMentions;
    window._lireAmisProchesPourMentions = (a) => { window.__listeErreur = { code: "500" }; return lire(a); };
    return window.__publier(true);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__envois.length)).toBe(0);
  // Story pour TOUS : la liste ne s'applique pas, les deux sont prévenus.
  await page.evaluate(() => window.__publier(false));
  await expect.poll(() => page.evaluate(() => window.__envois.map((e) => e.a).sort())).toEqual([LEA, TOM].sort());
});
