// ══════════════════════════════════════════════════════════════════════════
// CONTRÔLE GÉNÉRAL DU 2026-11-10 — neuf défauts trouvés en parcourant chaque
// onglet à 375 × 812, comme quelqu'un qui arrive. Chacun a été MESURÉ avant
// d'être corrigé, et chaque test ci-dessous est rouge sur le code d'avant
// (contre-épreuve faite sur `main` 6dafc0f1, les neuf).
//
//   ① fil — le texte d'une carte portait le retour à la ligne et l'indentation
//     du gabarit (`.post-body` est en pre-wrap) : 7 lignes peintes pour 4 écrites ;
//   ② page d'une publication — « ✨ » à la place de l'avatar que la carte montrait ;
//   ③ bulle de passion — une vignette en échec laissait l'icône « image cassée » ;
//   ④ fiche d'une activité — « Demain » au-dessus de la date du jour ;
//   ⑤ discussion d'un exemple — son commentaire d'exemple disparaissait à l'ouverture ;
//   ⑥ messages — chaque message d'exemple en double à la deuxième visite ;
//   ⑦ landing — le sixième pilier lisible entre et sous les boutons collants ;
//   ⑧ carte d'exemple — le pseudo sur deux lignes, écrasé par les deux capsules ;
//   ⑨ bobines — le libellé « Commentaire » mangé par la rangée de capsules.
//
// Stub local (`bootOnboarded`) : aucune écriture, aucune lecture en production.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Contrôle général 2026-11-10", () => {
  // La largeur où les défauts ⑦ ⑧ ⑨ ont été mesurés (iPhone 12 mini, 13 mini, X, 11 Pro).
  // Le fuseau de Paris : les runners de la CI sont en UTC, où le cas « changement
  // d'heure » de ④ ne prouvait rien — 48 h y valent toujours deux jours (audit du lot 28).
  test.use({ viewport: { width: 375, height: 812 }, timezoneId: "Europe/Paris" });

  test("① fil : le texte d'une carte est collé à ses balises — ni ligne vide, ni retrait, ni « Lire la suite » seul à la ligne", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const base = state.seed.posts.find((p) => p && p.text && p.authorName) || state.seed.posts[0];
      const scene = document.createElement("div");
      scene.style.cssText = "position:fixed;top:0;left:0;width:340px;z-index:99999;background:#fff;";
      document.body.appendChild(scene);
      const monter = (texte) => {
        const p = Object.assign({}, base, { id: "p_ctrl_texte", _source: "seed", text: texte, image: "", video: "", cover: false, type: "text", comments: [] });
        scene.innerHTML = renderPostHTML(p);
        const carte = scene.querySelector(".post");
        carte.style.setProperty("content-visibility", "visible", "important");
        carte.style.setProperty("contain-intrinsic-size", "none", "important");
        const corps = scene.querySelector(".post-body");
        const plage = document.createRange();
        plage.selectNodeContents(corps);
        const hauts = new Set([...plage.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
        const premier = [...plage.getClientRects()].filter((x) => x.width > 0)[0];
        return {
          texte: corps.textContent,
          lignes: hauts.size,
          hauteurEnLignes: Math.round(corps.getBoundingClientRect().height / parseFloat(getComputedStyle(corps).lineHeight)),
          retrait: Math.round(premier.left - corps.getBoundingClientRect().left),
        };
      };
      const court = monter("Ligne une\nLigne deux");
      const long = monter("Mot ".repeat(80).trim());   // 319 caractères : tronqué à 220, avec « Lire la suite »
      scene.remove();
      return { court, long };
    });
    // Le texte de l'auteur, et rien d'autre : pas un caractère du gabarit.
    expect(r.court.texte).toBe("Ligne une\nLigne deux");
    expect(r.court.lignes).toBe(2);
    expect(r.court.hauteurEnLignes, "deux lignes écrites, deux lignes peintes (5 avant : une au-dessus, deux en dessous)").toBe(2);
    expect(r.court.retrait, "la première ligne part du bord, comme les suivantes").toBe(0);
    expect(r.long.texte.startsWith("Mot Mot")).toBe(true);
    expect(r.long.texte.endsWith("… Lire la suite"), "« Lire la suite » suit le texte").toBe(true);
    expect(r.long.texte.includes("\n")).toBe(false);
    expect(r.long.retrait).toBe(0);
  });

  test("② page d'une publication : le même avatar que la carte du fil, quand la publication ne porte que le nom de son auteur", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const p = (state.seed.posts || []).find((x) => {
        const u = x && userById(x.authorId);
        return x && x.authorName && !x.authorEmoji && !x.authorAvatar && u && u.profileEmoji && u.profileEmoji !== "✨" && !u.photoUrl;
      });
      if (!p) return null;
      const scene = document.createElement("div");
      scene.innerHTML = renderPostHTML(Object.assign({}, p, { _source: "seed" }));
      const carte = scene.querySelector(".post-header .avatar").textContent.trim();
      await openPost(p.id);
      const detail = document.querySelector("#postDetailContent .post-header .avatar");
      return { carte, page: detail ? detail.textContent.trim() : null, attendu: userById(p.authorId).profileEmoji };
    });
    expect(r, "un exemple dont l'auteur a un emoji de compte et pas de photo").not.toBeNull();
    expect(r.carte).toBe(r.attendu);
    expect(r.page, "la page disait « ✨ » là où la carte montrait l'avatar du compte").toBe(r.carte);
  });

  test("③ bulle de passion : une vignette qui ne charge pas s'efface — son repli est essayé une fois, la pastille d'emoji reste, la mise en page ne bouge pas", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const attendre = (cond) => new Promise((ok, ko) => {
        const t0 = Date.now();
        (function tour() {
          if (cond()) return ok();
          if (Date.now() - t0 > 10000) return ko(new Error("les vignettes en échec sont restées affichées"));
          setTimeout(tour, 50);
        })();
      });
      const o = location.origin;
      const scene = document.createElement("div");
      scene.style.cssText = "position:fixed;top:0;left:0;z-index:99999;background:#fff;";
      scene.innerHTML = passionTileHTML({ emoji: "🎸", label: "Guitare", photoUrl: o + "/ctrl-introuvable-a.png" })
        + passionTileHTML({ emoji: "🏋️", label: "Sport", photoUrl: o + "/ctrl-introuvable-b.png", fallbackUrl: o + "/ctrl-introuvable-c.png" });
      document.body.appendChild(scene);
      const imgs = [...scene.querySelectorAll("img.profile-tile-photo")];
      imgs.forEach((i) => { i.loading = "eager"; });
      await attendre(() => imgs.every((i) => getComputedStyle(i).visibility === "hidden"));
      const out = {
        n: imgs.length,
        repli: imgs[1].getAttribute("src"),
        repliEssaye: imgs[1].dataset.repli || null,
        sansRepli: imgs[0].dataset.repli || null,
        pastilles: [...scene.querySelectorAll(".profile-tile-emoji-badge")].filter((b) => b.getBoundingClientRect().width > 0).length,
        // `display` reste l'autorité de la mise en page (ui-v7-lot §3 la lit) : intact.
        affichees: imgs.filter((i) => getComputedStyle(i).display !== "none").length,
        attendu: o + "/ctrl-introuvable-c.png",
      };
      scene.remove();
      return out;
    });
    expect(r.n).toBe(2);
    expect(r.repli, "le repli a bien été essayé avant le retrait").toBe(r.attendu);
    expect(r.repliEssaye).toBe("1");
    expect(r.sansRepli).toBeNull();
    expect(r.pastilles, "la bulle garde sa pastille d'emoji").toBe(2);
    expect(r.affichees, "l'échec efface l'image sans toucher à `display`").toBe(2);
  });

  test("④ fiche d'une activité : « Aujourd'hui » pour ce soir et « Demain » pour demain soir — des jours de calendrier, pas une durée", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const modele = allEvents().find((e) => e && e.id);
      const ceSoir = new Date(); ceSoir.setHours(23, 59, 59, 0);
      const demainSoir = new Date(ceSoir.getTime()); demainSoir.setDate(demainSoir.getDate() + 1);
      state.userEvents = state.userEvents || [];
      const poser = (id, date) => state.userEvents.push(Object.assign({}, modele, {
        id, date: date.getTime(), endAt: null, status: "active", attendees: [], organizerId: "u_ctrl", authorId: "u_ctrl", fromSupabase: false,
      }));
      poser("ctrl_ce_soir", ceSoir);
      poser("ctrl_demain_soir", demainSoir);
      const lire = async (id) => {
        openEventDetails(id);
        await pause(400);
        const el = document.querySelector("#eventDetailPage .event-detail-urgency");
        return el ? { texte: el.textContent.trim(), classe: el.className } : null;
      };
      const a = await lire("ctrl_ce_soir");
      const b = await lire("ctrl_demain_soir");
      return {
        a, b,
        enFin: Date.now() < ceSoir.getTime(),
        // Gardé par `typeof` : sur le code d'avant, c'est l'ÉCRAN qui doit rougir
        // (« Demain »), pas l'absence de la fonction.
        calc: typeof joursCalendairesAvant !== "function" ? null : [
          joursCalendairesAvant(new Date(2026, 10, 10, 23, 59), new Date(2026, 10, 10, 0, 1)),   // ce soir, lu à minuit une : 0
          joursCalendairesAvant(new Date(2026, 10, 11, 0, 1), new Date(2026, 10, 10, 23, 59)),   // dans deux minutes, mais demain : 1
          joursCalendairesAvant(new Date(2026, 9, 26, 12), new Date(2026, 9, 24, 12)),           // par-dessus le changement d'heure du 25/10 : 2
          joursCalendairesAvant(new Date(2026, 10, 9, 20), new Date(2026, 10, 10, 9)),           // hier soir : -1
          joursCalendairesAvant("illisible"),                                                    // jamais NaN à l'écran
          // Une colonne `timestamp` (sans fuseau) est en UTC : 23:30 UTC le 10, c'est
          // 00:30 le 11 à Paris — demain. Lue par `new Date(chaîne)`, ce serait 23:30
          // heure locale, donc « aujourd'hui » : le passage par `supaTs` (audit du lot 28).
          joursCalendairesAvant("2026-11-10 23:30:00", new Date(2026, 10, 10, 9)),
        ],
      };
    });
    expect(r.enFin, "le test a tourné à la dernière seconde du jour : à relancer").toBe(true);
    expect(r.a && r.a.texte, "« Demain » avant : la durée jusqu'à ce soir, arrondie au jour supérieur").toBe("Aujourd'hui !");
    expect(r.a.classe).toContain("today");
    expect(r.b && r.b.texte, "« Dans 2 jours » avant").toBe("Demain");
    expect(r.calc).toEqual([0, 1, 2, -1, 0, 1]);
  });

  test("⑤ discussion d'un exemple : son décor reste, un vrai commentaire s'y ajoute, et une ligne sans drapeau reste périmée sur une vraie publication", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const ex = state.seed.posts.find((p) => p && Array.isArray(p.comments) && p.comments.length && p.comments.every((c) => c && !c.fromSupabase));
      if (!ex) return null;
      const decor = ex.comments.map((c) => c.id).sort();
      // La page serveur d'un exemple est presque toujours vide.
      _fusionnerPageCommentaires(findPostAnywhere(ex.id), []);
      const apresVide = (findPostAnywhere(ex.id).comments || []).map((c) => c.id).sort();
      // Un vrai compte a commenté l'exemple : sa ligne (la page) rejoint le décor.
      _fusionnerPageCommentaires(findPostAnywhere(ex.id), [
        { id: "c_ctrl_vrai", authorId: "ctrl-compte", authorName: "Vrai compte", authorEmoji: "✨", content: "Un vrai commentaire", createdAt: Date.now(), fromSupabase: true },
      ]);
      const apresPage = (findPostAnywhere(ex.id).comments || []).map((c) => c.id).sort();
      const compte = nbCommentairesPost(findPostAnywhere(ex.id));
      // La règle d'origine tient ailleurs : sur une publication RÉELLE, une ligne
      // sans drapeau (liste persistée par un ancien client) est périmée.
      state.supabasePosts = (state.supabasePosts || []).concat([
        { id: "ctrl_reelle", fromSupabase: true, authorId: "ctrl-compte", text: "x", comments: [{ id: "ctrl_vieille", text: "ancienne ligne", createdAt: 1 }] },
      ]);
      _fusionnerPageCommentaires(findPostAnywhere("ctrl_reelle"), []);
      const reelle = (findPostAnywhere("ctrl_reelle").comments || []).map((c) => c.id);
      // ⚠️ MA publication (`state.userPosts`) n'a ni `fromSupabase` ni `_source` : c'est
      // le cas pour lequel la règle d'origine a été écrite (audit du lot 28, P3). Une
      // simplification de `_ciEstExemple` en `!p.fromSupabase` la prendrait pour un
      // exemple, et y garderait pour toujours une ligne périmée.
      state.userPosts = (state.userPosts || []).concat([
        { id: "ctrl_mienne", authorId: "me", text: "x", comments: [{ id: "ctrl_perimee", text: "ligne d'un ancien client", createdAt: 1 }] },
      ]);
      _fusionnerPageCommentaires(findPostAnywhere("ctrl_mienne"), []);
      const mienne = (findPostAnywhere("ctrl_mienne").comments || []).map((c) => c.id);
      // Un exemple dont la discussion PAGINE (31 vrais commentaires et plus) : le total
      // serveur est posé, et le décor doit rester compté — le titre « Discussion (N) »
      // vaut ce qui est affiché, réponses comprises (audit du lot 28, P4).
      const pageLongue = [];
      for (let i = 0; i < 30; i++) {
        pageLongue.push({ id: "c_ctrl_p" + i, authorId: "ctrl-compte", content: "page " + i, createdAt: Date.now() - i * 1000, fromSupabase: true });
      }
      pageLongue.suite = { created_at: new Date(Date.now() - 31000).toISOString(), id: "c_ctrl_p29" };
      _fusionnerPageCommentaires(findPostAnywhere(ex.id), pageLongue);
      const pagine = findPostAnywhere(ex.id);
      const longue = { total: pagine.commentsTotal, affiche: nbCommentairesPost(pagine), attendu: commentThreadCount(pagine.comments || []) };
      return { id: ex.id, decor, apresVide, apresPage, compte, reelle, mienne, longue };
    });
    expect(r, "un exemple commenté dans la graine").not.toBeNull();
    expect(r.decor.length).toBeGreaterThan(0);
    expect(r.apresVide, "la discussion d'un exemple se vidait à l'ouverture").toEqual(r.decor);
    expect(r.apresPage).toEqual(r.decor.concat(["c_ctrl_vrai"]).sort());
    expect(r.compte).toBeGreaterThanOrEqual(r.decor.length + 1);
    expect(r.reelle).toEqual([]);
    expect(r.mienne, "ma propre publication garde la règle d'origine : la ligne périmée part").toEqual([]);
    expect(r.longue.total, "prémisse : la page annonce une suite, le total serveur est posé").toBe(30);
    expect(r.longue.affiche, "« Discussion (N) » compte le décor d'un exemple dont la discussion pagine").toBe(r.longue.attendu);

    // Et à l'écran : la feuille « Discussion » d'un exemple montre son commentaire.
    await page.evaluate((id) => { openComments(id); }, r.id);
    await page.waitForTimeout(2500);   // la lecture serveur (projet vide en local) puis la fusion
    const ecran = await page.evaluate(() => {
      const boite = document.getElementById("commentsBox");
      return boite ? { vide: !!boite.querySelector(".empty"), lignes: boite.querySelectorAll(".comment").length } : null;
    });
    expect(ecran).not.toBeNull();
    expect(ecran.vide, "« Sois le premier à réagir » sous un exemple déjà commenté").toBe(false);
    expect(ecran.lignes).toBeGreaterThan(0);
  });

  test("⑥ messages : les fils d'exemple ne se dédoublent pas quand les deux stores ne portent pas la même graine — et un appareil déjà doublé se répare", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const copie = () => JSON.parse(JSON.stringify(SEED_CONVERSATIONS));
      // La graine d'IndexedDB a été semée cinq minutes avant celle de ce démarrage.
      const ancienne = copie();
      ancienne.forEach((c) => { c.lastAt -= 312000; c.messages.forEach((m) => { m.at -= 312000; }); });
      // Une VRAIE conversation où la même personne a écrit deux fois « ok » : intouchable.
      const reelle = { id: "conv_ctrl_reelle", userId: "ctrl-vrai-compte", lastAt: 2000, messages: [{ from: "me", text: "ok", at: 1000 }, { from: "me", text: "ok", at: 2000 }] };
      const unis = deduplicateConversations(_unionConvsById(ancienne, copie().concat([reelle])));
      const par = {};
      unis.forEach((c) => { par[c.id] = c.messages.length; });
      const attendu = {};
      SEED_CONVERSATIONS.forEach((c) => { attendu[c.id] = c.messages.length; });
      const premiere = unis.find((c) => c.id === SEED_CONVERSATIONS[0].id);
      const sortie = {
        par, attendu,
        ordre: premiere.messages.map((m) => m.text),
        ordreAttendu: SEED_CONVERSATIONS[0].messages.map((m) => m.text),
        dateDuFil: premiere.lastAt === premiere.messages[premiere.messages.length - 1].at,
      };
      // Un appareil DÉJÀ doublé (état persisté par le client d'avant) : il se répare à la lecture.
      const double = copie();
      double.forEach((c, i) => { c.messages = ancienne[i].messages.concat(c.messages).sort((a, b) => a.at - b.at); });
      localStorage.setItem("passio_conversations_v1", JSON.stringify(double));
      conversationsState = null;
      sortie.repare = getConversations().filter((c) => SEED_CONVERSATIONS.some((s) => s.id === c.id)).map((c) => c.id + ":" + c.messages.length).sort();
      sortie.repareAttendu = SEED_CONVERSATIONS.map((c) => c.id + ":" + c.messages.length).sort();
      return sortie;
    });
    for (const id of Object.keys(r.attendu)) {
      expect(r.par[id], id + " : chaque message d'exemple une seule fois").toBe(r.attendu[id]);
    }
    expect(r.par.conv_ctrl_reelle, "une vraie conversation garde ses deux « ok »").toBe(2);
    expect(r.ordre).toEqual(r.ordreAttendu);
    expect(r.dateDuFil).toBe(true);
    expect(r.repare).toEqual(r.repareAttendu);

    // Et à l'écran : le fil d'exemple affiche ses messages une fois.
    const bulles = await page.evaluate(async () => {
      goTo("messages");
      openConversation(SEED_CONVERSATIONS[0].id);
      await new Promise((ok) => setTimeout(ok, 700));
      const n = document.querySelectorAll("#conv-fullpage .conv-bubble").length;
      closeConversation();
      return { n, attendu: SEED_CONVERSATIONS[0].messages.length };
    });
    expect(bulles.n).toBe(bulles.attendu);
  });

  test("⑦ landing : le pied collant couvre ce qui défile dessous, sur toute la largeur et jusqu'au bord bas — et tout reste atteignable", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const l = document.getElementById("landing");
      l.classList.add("active");
      // L'entrée en fondu (`fadeIn`, 320 ms) part 6 px plus bas. Sous WebKit sans écran,
      // elle n'avance pas toujours : attendre 450 ms y laissait mesurer la landing figée
      // au début du fondu (bas à 818 pour 812). On la TERMINE avant de mesurer.
      await pause(50);
      l.getAnimations({ subtree: true }).forEach((a) => { try { a.finish(); } catch (e) {} });
      const pied = l.querySelector(".landing-cta");
      const R = (e) => { const b = e.getBoundingClientRect(); return { g: Math.round(b.left), h: Math.round(b.top), d: Math.round(b.right), b: Math.round(b.bottom) }; };
      const cs = getComputedStyle(pied);
      const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      const parts = m ? m[1].split(",").map(Number) : [];
      const alpha = parts.length > 3 ? parts[3] : (parts.length === 3 ? 1 : 0);
      l.scrollTop = 0;
      await pause(50);
      const repos = R(pied);
      const piliers = [...l.querySelectorAll(".landing-pillar")];
      const sousLePied = piliers.filter((p) => R(p).b > repos.h).length;
      l.scrollTop = l.scrollHeight;
      await pause(120);
      const enBas = R(pied);
      const dernier = R(piliers[piliers.length - 1]);
      l.scrollTop = 0;
      l.classList.remove("active");
      return { vw: document.documentElement.clientWidth, vh: window.innerHeight, repos, alpha, sousLePied, enBas, dernier, piliers: piliers.length };
    });
    expect(r.piliers).toBeGreaterThan(0);
    expect(r.sousLePied, "à 375 × 812 la page dépasse l'écran : des piliers passent sous le pied, c'est le cas à couvrir").toBeGreaterThan(0);
    expect(r.alpha, "transparent, le pied laissait lire le pilier entre les deux boutons").toBeGreaterThanOrEqual(0.75);
    expect(r.repos.g).toBe(0);
    expect(r.repos.d).toBe(r.vw);
    expect(r.repos.b, "rien ne dépasse sous les boutons").toBe(r.vh);
    expect(r.dernier.b, "en bas de page, le dernier pilier est au-dessus du pied").toBeLessThanOrEqual(r.enBas.h);
  });

  test("⑧ carte d'exemple : le pseudo et sa ligne tiennent chacun sur une ligne, les deux capsules s'empilent à droite", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const base = state.seed.posts.find((p) => p && p.text && p.authorName);
      const p = Object.assign({}, base, { id: "p_ctrl_entete", _source: "seed", authorName: "Mehdi Saïd", mood: "learn", comments: [] });
      const scene = document.createElement("div");
      scene.innerHTML = renderPostHTML(p);
      const liste = document.getElementById("feedList");
      liste.prepend(scene);
      const carte = scene.querySelector(".post");
      carte.style.setProperty("content-visibility", "visible", "important");
      carte.style.setProperty("contain-intrinsic-size", "none", "important");
      const h = scene.querySelector(".post-header");
      const R = (e) => { const b = e.getBoundingClientRect(); return { g: b.left, h: b.top, d: b.right, b: b.bottom }; };
      const lignes = (e) => {
        const plage = document.createRange();
        plage.selectNodeContents(e);
        return new Set([...plage.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      };
      const exemple = h.querySelector(".fr-demo-tag"), envie = h.querySelector(".post-mood-tag");
      const out = { exemple: !!exemple, envie: !!envie, largeurCarte: Math.round(carte.getBoundingClientRect().width) };
      if (exemple && envie) {
        out.nom = lignes(h.querySelector(".post-author-name"));
        out.meta = lignes(h.querySelector(".post-author-meta"));
        out.rExemple = R(exemple); out.rEnvie = R(envie); out.rAuteur = R(h.querySelector(".post-author")); out.rAvatar = R(h.querySelector(".avatar")); out.rEntete = R(h);
      }
      scene.remove();
      return out;
    });
    expect(r.exemple, "la carte d'un exemple porte « Exemple PASSIO »").toBe(true);
    expect(r.envie).toBe(true);
    expect(r.nom, "« Mehdi Saïd » passait sur deux lignes").toBe(1);
    expect(r.meta, "« Sport · 12:52 » aussi").toBe(1);
    expect(r.rExemple.b, "« Exemple PASSIO » au-dessus de la capsule d'envie").toBeLessThanOrEqual(r.rEnvie.h + 0.5);
    expect(Math.abs(r.rExemple.d - r.rEnvie.d), "les deux capsules partagent le bord droit").toBeLessThanOrEqual(1);
    expect(r.rAuteur.d, "le pseudo ne passe pas sous les capsules").toBeLessThanOrEqual(Math.min(r.rExemple.g, r.rEnvie.g) + 0.5);
    // L'avatar reste centré sur la hauteur de l'en-tête.
    const milieuAvatar = (r.rAvatar.h + r.rAvatar.b) / 2, milieuEntete = (r.rEntete.h + r.rEntete.b) / 2;
    expect(Math.abs(milieuAvatar - milieuEntete)).toBeLessThanOrEqual(2);
  });

  test("⑨ bobines : le libellé « Commentaire » n'est plus sous la rangée de capsules", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { openReels(); });
    await page.waitForFunction(() => {
      const it = document.querySelector("#reelsViewer .reel-item");
      return !!it && [...it.querySelectorAll(".reel-action-label")].some((l) => /Commentaire/.test(l.textContent));
    }, null, { timeout: 15000 });
    await page.waitForTimeout(700);   // l'ouverture du lecteur est finie
    const r = await page.evaluate(() => {
      const it = document.querySelector("#reelsViewer .reel-item");
      const R = (e) => { const b = e.getBoundingClientRect(); return { g: b.left, d: b.right, h: b.top, b: b.bottom }; };
      const libelle = [...it.querySelectorAll(".reel-action-label")].find((l) => /Commentaire/.test(l.textContent));
      const indice = document.getElementById("reelsHint");
      const capsules = it.querySelector(".v5-actions");
      const colonne = it.querySelector(".reel-actions");
      // L'indice s'anime 5 s (apparition, maintien, disparition, ±8 px) : l'instant de
      // la mesure varie selon le moteur et la machine — WebKit, plus lent à démarrer,
      // le mesurait en plein fondu. On lit sa position de REPOS, animation suspendue.
      let indiceRepos = null;
      if (indice) {
        const anim = indice.style.animation;
        indice.style.animation = "none";
        indiceRepos = { ...R(indice), affiche: getComputedStyle(indice).display !== "none" };
        indice.style.animation = anim;
      }
      const out = {
        info: R(it.querySelector(".reel-info")), libelle: R(libelle), vw: document.documentElement.clientWidth,
        indice: indiceRepos,
        capsules: capsules ? R(capsules) : null,
        colonne: R(colonne),
        boutons: [...colonne.querySelectorAll(".reel-action-btn")].map((b) => b.getBoundingClientRect().width),
      };
      // La police de l'appareil est `system-ui` : on rejoue la mesure sous une police
      // LARGE, comme celle de la CI Linux (où la première version de ce correctif
      // laissait encore le libellé à 275,8 px sous une zone de texte finie à 287).
      const large = document.createElement("style");
      large.textContent = ".reel-action-label { font-family: 'Courier New', monospace !important; letter-spacing: 1px !important; }";
      document.head.appendChild(large);
      out.large = {
        info: R(it.querySelector(".reel-info")), libelle: R(libelle), colonne: R(colonne),
        rogne: libelle.scrollWidth > libelle.clientWidth,
      };
      large.remove();
      closeReels();   // le lecteur est en z-index 9999 : on le ferme avant de sortir
      return out;
    });
    expect(r.vw).toBe(375);
    expect(r.libelle.d - r.libelle.g, "le libellé est bien à l'écran").toBeGreaterThan(20);
    expect(r.info.d, "la zone de texte (et sa rangée de capsules) s'arrête avant le libellé").toBeLessThanOrEqual(r.libelle.g);
    // Ce qui ne dépend PAS de la police de l'appareil (la pile est `system-ui` : le
    // libellé fait 70 px sous Segoe UI, ~83 sous la police de repli de la CI Linux) :
    // la colonne a une largeur fixe, le libellé y reste, la zone de texte s'arrête avant.
    expect(Math.round(r.colonne.d - r.colonne.g), "la colonne d'actions a une largeur fixe").toBe(80);
    expect(r.libelle.g, "le libellé ne déborde pas de sa colonne").toBeGreaterThanOrEqual(r.colonne.g - 0.5);
    expect(r.libelle.d).toBeLessThanOrEqual(r.colonne.d + 0.5);
    expect(r.info.d, "la zone de texte s'arrête avant la colonne").toBeLessThanOrEqual(r.colonne.g);
    for (const largeur of r.boutons) expect(largeur, "un bouton d'action reste une cible de 44 px").toBeGreaterThanOrEqual(44);
    // Sous une police large : le libellé est rogné DANS sa colonne, jamais sous le texte.
    expect(r.large.rogne, "prémisse : la police large déborde bien les 76 px du libellé").toBe(true);
    expect(Math.round(r.large.colonne.d - r.large.colonne.g)).toBe(80);
    expect(r.large.libelle.g, "police large : le libellé reste dans sa colonne").toBeGreaterThanOrEqual(r.large.colonne.g - 0.5);
    expect(r.large.info.d, "police large : la zone de texte s'arrête avant le libellé").toBeLessThanOrEqual(r.large.libelle.g);
    // L'indice « Glisse vers le haut… » rejoue cinq secondes à chaque ouverture :
    // il ne doit couvrir ni la rangée de capsules, ni le libellé.
    expect(r.capsules, "la rangée de capsules du lot UI-5").not.toBeNull();
    expect(r.indice).not.toBeNull();
    expect(r.indice.affiche, "prémisse : l'indice est rendu").toBe(true);
    expect(r.indice.b - r.indice.h, "prémisse : l'indice a une hauteur").toBeGreaterThan(10);
    expect(r.indice.b, "l'indice tombait sur la rangée de capsules").toBeLessThanOrEqual(r.info.h);
    expect(r.indice.b).toBeLessThanOrEqual(r.libelle.h);
  });
});
