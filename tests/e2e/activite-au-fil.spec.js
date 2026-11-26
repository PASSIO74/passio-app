// Une activité créée apparaît dans le fil (2026-10-23).
//
// Signalé en production : Jerem crée « Via ferrata » (ligne `events` présente,
// statut actif), et rien n'arrive dans le fil. Créer une activité n'écrivait que
// dans `events` ; la seule carte du fil était celle du partage manuel. Ce que
// cette suite prouve :
//   ① une activité publiée sur le serveur pose SA carte dans le fil (id
//      déterministe `post_ev_<id>`, envoyée au serveur), sans fermer la
//      proposition d'invitation ;
//   ② rien n'est posé en mode local, sur un refus, ni à l'édition ;
//   ③ le rattrapage publie la carte d'une activité récente qui n'en a pas — et
//      rien quand le serveur en connaît déjà une, quand elle est ancienne,
//      passée, d'un autre compte, supprimée par son auteur, ou au second appel ;
//   ④ la coupure éteint les deux chemins.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UUID = "9f35913c-0000-4a55-a0b8-000000000001";

// Démarrage neutralisé (aucune écriture en production) : `supa` est un double
// chaînable dont la lecture `posts` rend `window.__postsServeur`.
async function banc(page, verdict, conserverPosts = false) {
  await bootOnboarded(page);
  await page.evaluate(({ v, uuid, conserverPosts }) => {
    ["supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent", "supaSetEventRsvp", "supaLoadEvents",
      "supaLoadMyRsvps", "supaLoadEventCommentCounts", "supaCreateEventConversation",
      "supaJoinEventConversation", "supaLeaveEventConversation",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.supaPublishEvent = async () => v === true;
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window._supaReal = v !== null;
    window.__envoyes = [];
    window.supaPublishPostWithRetry = async (p) => { window.__envoyes.push(p.id); return true; };
    window.partagerOuCopier = () => {};
    window.__postsServeur = [];
    window.__lectures = [];
    const q = {
      select() { return q; }, eq(c, x) { window.__lectures.push([c, x]); return q; },
      like(c, x) { window.__lectures.push([c, x]); return q; }, limit() { return q; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: window.__postsServeur, error: null }).then(res, rej); },
    };
    supa = { from: () => q };
    MY_UID = uuid;
    state.user.general.username = "Jerem";
    state.userEvents = [];
    if (!conserverPosts) state.userPosts = [];
    state.seed.events = [];
    goTo("irl");
    renderIRL();
  }, { v: verdict, uuid: UUID, conserverPosts });
}

async function creer(page, titre) {
  await page.evaluate((t) => {
    openCreateEvent();
    document.getElementById("evTitle").value = t;
    document.getElementById("evTime").value = "18:00";
    document.getElementById("evCity").value = "Sixt-Fer-à-Cheval";
  }, titre);
  await page.evaluate(() => submitEvent());
}

async function simulerLienStudio(page, reponseLien, confirmation = false) {
  await page.evaluate(({ reponse, confirmation }) => {
    window.__rpcLiens = [];
    window.__reponseLien = reponse;
    supa.rpc = async (nom, params) => {
      if (nom !== "relier_publication_sortie") return { data: null, error: null };
      window.__rpcLiens.push(params);
      return window.__reponseLien;
    };
    window.supaLoadPosts = async () => [];
    window.PASSIO_INVITE_APRES_CREATION = confirmation;
  }, { reponse: reponseLien, confirmation });
}

async function publierMessageEnsemble(page) {
  await page.evaluate(() => goTo("studio"));
  await page.getByRole("button", { name: "À faire ensemble", exact: true }).click();
  await page.getByRole("textbox", { name: "Ton message" }).fill("Qui vient marcher samedi ?");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
}

async function ouvrirSortieDepuisStudio(page, reponseLien, confirmation = false) {
  await simulerLienStudio(page, reponseLien, confirmation);
  await publierMessageEnsemble(page);
  await page.locator("#studioSuiteSortie").getByRole("button", { name: "Proposer une sortie" }).click();
  await expect(page.locator("#evAuFil")).not.toBeChecked();
  await expect(page.locator("#evPassion")).toHaveValue("musique");
  await page.evaluate(() => {
    document.getElementById("evTitle").value = "Marche du samedi";
    document.getElementById("evTime").value = "18:00";
    document.getElementById("evCity").value = "Sixt-Fer-à-Cheval";
  });
}

test("la sortie confirmée s’ouvre depuis le message d’origine", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: true, error: null });
  await page.evaluate(() => submitEvent());
  const { postId, sortieId } = await page.evaluate(() => ({ postId: state.userPosts[0].id, sortieId: state.userEvents[0].id }));
  expect(await page.evaluate(() => window.__rpcLiens)).toEqual([{ p_post_id: postId, p_event_id: sortieId }]);
  expect(await page.evaluate(() => state.userPosts.length)).toBe(1);
  const activite = page.locator(`article[data-postid="${postId}"] [data-v3-activity]`);
  await expect(activite).toHaveAttribute("data-v3-activity", sortieId);
  await activite.click();
  await expect(page.locator("#eventDetailPage")).toContainText("Marche du samedi");
});

test("Plus tard permet de reprendre le même message depuis le fil et sa fiche après rechargement", async ({ page }) => {
  await banc(page, true);
  await publierMessageEnsemble(page);
  const suite = page.locator("#studioSuiteSortie");
  await expect(suite).toBeVisible();
  const avantReport = await page.evaluate(() => state.userPosts[0]);
  const postId = avantReport.id;
  const carte = page.locator(`#feedList article[data-postid="${postId}"]`);
  const menuCarte = carte.getByRole("button", { name: "Options de la publication" });
  const fenetre = page.getByRole("dialog");
  const proposer = fenetre.getByRole("button", { name: "Proposer une sortie", exact: true });

  await menuCarte.click();
  await expect(proposer).toHaveCount(0);
  await fenetre.getByRole("button", { name: "Annuler", exact: true }).click();
  await suite.getByRole("button", { name: "Plus tard" }).click();
  await expect(suite).toHaveCount(0);

  // Recharge la page, ses scripts et le compte simulé ; le message vient du stockage.
  await banc(page, true, true);
  await simulerLienStudio(page, { data: true, error: null });
  await page.evaluate(ancien => {
    _applyUserState({ userPosts: [ancien] });
    goTo("feed");
  }, avantReport);
  await menuCarte.click();
  await proposer.press("Enter");
  await expect(page.locator("#evTitle")).toHaveAttribute("data-publication-studio", postId);
  await expect(page.locator("#evAuFil")).not.toBeChecked();
  await expect(page.locator("#evPassion")).toHaveValue("musique");
  await fenetre.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(await page.evaluate(() => [state.userEvents.length, window.__rpcLiens.length])).toEqual([0, 0]);

  await carte.locator(".post-body").click();
  const detail = page.locator("#postDetailPage");
  const menuDetail = detail.getByRole("button", { name: "Options de la publication" });
  await menuDetail.click();
  await proposer.click();
  await page.locator("#evTitle").fill("Randonnée du samedi");
  await page.locator("#evTime").fill("18:00");
  await page.evaluate(() => { document.getElementById("evCity").value = "Sixt-Fer-à-Cheval"; });
  await page.evaluate(async () => { window._supaReal = false; await submitEvent(); });
  await expect(page.locator("#evTitle")).toHaveValue("Randonnée du samedi");
  expect(await page.evaluate(() => state.userEvents.length)).toBe(0);
  await page.evaluate(ancien => {
    window._supaReal = true;
    const repondre = supa.rpc;
    supa.rpc = async (...args) => {
      const resultat = await repondre(...args);
      _applyUserState({ userPosts: [ancien] });
      return resultat;
    };
  }, avantReport);
  await page.evaluate(() => submitEvent());

  const sorties = await page.evaluate(() => state.userEvents.map(ev => ev.id));
  expect(sorties).toHaveLength(1);
  expect(await page.evaluate(() => window.__rpcLiens)).toEqual([{ p_post_id: postId, p_event_id: sorties[0] }]);
  await expect(carte.locator("[data-v3-activity]")).toHaveAttribute("data-v3-activity", sorties[0]);
  await expect(detail.getByRole("button", { name: "Voir la sortie" })).toBeVisible();
  await menuDetail.click();
  await expect(proposer).toHaveCount(0);
  await expect(fenetre.getByRole("button", { name: "Réessayer le lien avec ma sortie" })).toHaveCount(0);
});

test("le menu diffère seulement le message choisi et laisse la reprise d’un lien prioritaire", async ({ page }) => {
  await banc(page, true);
  await publierMessageEnsemble(page);
  await page.locator("#studioSuiteSortie").getByRole("button", { name: "Plus tard" }).click();
  const postId = await page.evaluate(() => state.userPosts[0].id);
  const fenetre = page.getByRole("dialog");
  const proposer = fenetre.getByRole("button", { name: "Proposer une sortie", exact: true });
  async function verifierMenu(mutation) {
    await page.evaluate(({ id, mutation }) => {
      Object.assign(state.userPosts.find(p => p.id === id), mutation);
      openPostOptions(id);
    }, { id: postId, mutation });
    await expect(proposer).toHaveCount(0);
    await fenetre.getByRole("button", { name: "Annuler", exact: true }).click();
  }

  await verifierMenu({ mood: "learn" });
  await verifierMenu({ mood: "irl", authorId: "9f35913c-0000-4a55-a0b8-000000000002" });
  await verifierMenu({ authorId: UUID, isReel: true });
  await verifierMenu({ isReel: false, sharedFromPostId: "repartage" });
  await page.evaluate(id => {
    const post = state.userPosts.find(p => p.id === id);
    delete post.sharedFromPostId;
    state.supabasePosts = [{ ...post, eventId: "sortie-deja-liee" }];
    openPostOptions(id);
  }, postId);
  await expect(proposer).toHaveCount(0);
  await fenetre.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.evaluate(id => {
    state.supabasePosts = [];
    window.PASSIO_UI_3 = false;
    openPostOptions(id);
  }, postId);
  await expect(proposer).toHaveCount(0);
  await fenetre.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.evaluate(id => {
    window.PASSIO_UI_3 = true;
    state.userPosts.find(p => p.id === id).sortieARelier = "sortie-en-attente";
    openPostOptions(id);
  }, postId);
  await expect(proposer).toHaveCount(0);
  await expect(fenetre.getByRole("button", { name: "Réessayer le lien avec ma sortie" })).toBeVisible();
});

test("un lien interrompu se reprend depuis le message sans recréer la sortie", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: null, error: { message: "Connexion interrompue" } });
  await page.evaluate(() => submitEvent());
  const postId = await page.evaluate(() => state.userPosts[0].id);
  expect(await page.evaluate(() => state.userPosts[0].eventId)).toBeFalsy();
  await page.evaluate(id => {
    window.__reponseLien = { data: true, error: null };
    openPostOptions(id);
  }, postId);
  await page.getByRole("button", { name: "Réessayer le lien avec ma sortie" }).click();
  await expect(page.locator(`article[data-postid="${postId}"] [data-v3-activity]`)).toBeVisible();
  expect(await page.evaluate(() => state.userEvents.length)).toBe(1);
  expect(await page.evaluate(() => window.__rpcLiens[0])).toEqual(await page.evaluate(() => window.__rpcLiens[1]));
  expect(await page.evaluate(() => state.userPosts[0].sortieARelier)).toBeUndefined();
});

test("Voir mon message ouvre la publication d’origine et sa sortie", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: true, error: null }, true);
  await page.evaluate(() => submitEvent());
  const fenetre = page.getByRole("dialog", { name: "Ta sortie est reliée à ton message" });
  await expect(fenetre.getByRole("button", { name: "Inviter mes amis" })).toBeVisible();
  const postId = await page.evaluate(() => state.userPosts[0].id);
  await fenetre.getByRole("button", { name: "Voir mon message" }).click();
  const detail = page.locator("#postDetailPage");
  await expect(detail).toBeVisible();
  await expect(detail.locator(".post-body")).toHaveText("Qui vient marcher samedi ?");
  await expect(detail.locator("#postDetailComments")).toHaveAttribute("data-thread", postId);
  await detail.getByRole("button", { name: "Voir la sortie" }).click();
  await expect(page.locator("#eventDetailPage")).toBeVisible();
  await expect(page.locator("#eventDetailHeroTitle .event-detail-title")).toHaveText("Marche du samedi");
});

test("la confirmation reprend le même lien et devient Voir mon message", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: null, error: { message: "Connexion interrompue" } }, true);
  await page.evaluate(() => submitEvent());
  const fenetre = page.getByRole("dialog");
  const reprendre = fenetre.getByRole("button", { name: "Réessayer le lien" });
  await expect(fenetre).toContainText("Il reste à la relier à ton message.");
  await reprendre.click();
  await expect(fenetre).toContainText("Le lien reste en attente.");
  await page.evaluate(() => {
    window.__reponseLien = new Promise(resolve => { window.__finLien = resolve; });
  });
  await reprendre.click();
  await expect(fenetre.getByRole("button", { name: "Vérification…" })).toBeDisabled();
  await page.evaluate(() => window.__finLien({ data: true, error: null }));
  await expect(fenetre.getByRole("button", { name: "Voir mon message" })).toBeVisible();
  const resultat = await page.evaluate(() => ({
    appels: window.__rpcLiens, messages: state.userPosts.length, sorties: state.userEvents.length,
    demande: { p_post_id: state.userPosts[0].id, p_event_id: state.userEvents[0].id },
  }));
  expect(resultat.appels).toEqual(Array(3).fill(resultat.demande));
  expect([resultat.messages, resultat.sorties]).toEqual([1, 1]);
});

test("une reprise terminée après la fermeture garde le nouvel écran intact", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: null, error: { message: "Connexion interrompue" } }, true);
  await page.evaluate(() => submitEvent());
  await page.evaluate(() => {
    window.__reponseLien = new Promise(resolve => { window.__finLien = resolve; });
  });
  await page.getByRole("button", { name: "Réessayer le lien", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fermer", exact: true }).click();
  await page.evaluate(() => {
    openModal('<div class="modal-title">Autre fenêtre</div>');
    window.__finLien({ data: true, error: null });
  });
  await expect.poll(() => page.evaluate(() => state.userPosts[0].eventId)).toBeTruthy();
  await expect(page.getByRole("dialog", { name: "Autre fenêtre" })).toBeVisible();
});

test("après un refus définitif, la confirmation indique le refus et conserve l’invitation", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, { data: null, error: { message: "Connexion interrompue" } }, true);
  await page.evaluate(() => submitEvent());
  await page.evaluate(() => { window.__reponseLien = { data: false, error: null }; });
  const fenetre = page.getByRole("dialog");
  await fenetre.getByRole("button", { name: "Réessayer le lien" }).click();
  await expect(fenetre).toContainText("Le lien avec ton message a été refusé.");
  await expect(fenetre.getByRole("button", { name: "Inviter mes amis" })).toBeVisible();
  await expect(fenetre.getByRole("button", { name: /Réessayer le lien|Voir mon message/ })).toHaveCount(0);
  expect(await page.evaluate(() => state.userPosts[0].eventId)).toBeFalsy();
});

test("quitter le fil pendant le premier rattachement empêche la confirmation de recouvrir le nouvel écran", async ({ page }) => {
  await banc(page, true);
  await ouvrirSortieDepuisStudio(page, null, true);
  await page.evaluate(() => {
    window.__reponseLien = new Promise(resolve => { window.__finLien = resolve; });
    window.__creationStudio = submitEvent();
  });
  await expect.poll(() => page.evaluate(() => window.__rpcLiens.length)).toBe(1);
  await page.evaluate(async () => {
    goTo("messages");
    window.__finLien({ data: true, error: null });
    await window.__creationStudio;
  });
  await expect(page.locator("#screen-messages")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => state.userPosts[0].eventId)).toBeTruthy();
});

test("une sortie refusée ou un formulaire abandonné ne rattachent pas le message", async ({ page }) => {
  await banc(page, false);
  await ouvrirSortieDepuisStudio(page, { data: true, error: null });
  await page.evaluate(() => submitEvent());
  expect(await page.evaluate(() => window.__rpcLiens)).toEqual([]);
  expect(await page.evaluate(() => state.userPosts[0].eventId)).toBeFalsy();

  await ouvrirSortieDepuisStudio(page, { data: true, error: null });
  await page.evaluate(() => { closeModal(); window.supaPublishEvent = async () => true; });
  await creer(page, "Une autre sortie");
  expect(await page.evaluate(() => window.__rpcLiens)).toEqual([]);
});

const activiteServeur = (o) => Object.assign({
  id: "ev_jerem", title: "Via ferrata", passion: "musique", city: "Sixt",
  date: Date.now() + 8 * 86400000, createdAt: Date.now() - 3600000,
  organizerId: UUID, authorId: UUID, status: "active", fromSupabase: true,
}, o);

for (const abandon of [false, true]) {
  test(abandon ? "fermer le formulaire pendant le géocodage annule la création et le lien"
    : "deux appuis pendant le géocodage créent une seule sortie liée", async ({ page }) => {
    await banc(page, true);
    // Le moteur doit tenir aussi dans le formulaire historique, sans le verrou
    // du lot visuel UI-6A0.
    await page.evaluate(() => { window.PASSIO_UI_6A0 = false; });
    await ouvrirSortieDepuisStudio(page, { data: true, error: null });
    await page.evaluate((doubleAppui) => {
      document.getElementById("evCity").value = "Hameau du banc sans coordonnées";
      window._evPickedCoords = null;
      window.__adresses = 0;
      const coordonnees = new Promise(resolve => { window.__terminerGeocodage = resolve; });
      window._geocodeAddress = () => { window.__adresses++; return coordonnees; };
      window.__sortiesPubliees = [];
      window.supaPublishEvent = async ev => { window.__sortiesPubliees.push(ev.id); return true; };
      window.__envoisSortie = [submitEvent()];
      if (doubleAppui) window.__envoisSortie.push(submitEvent());
    }, !abandon);
    await expect.poll(() => page.evaluate(() => window.__adresses)).toBeGreaterThan(0);
    if (abandon) await page.evaluate(() => closeModal());
    const r = await page.evaluate(async () => {
      window.__terminerGeocodage(null);
      await Promise.all(window.__envoisSortie);
      return { ecrites: window.__sortiesPubliees, sorties: state.userEvents.map(ev => ev.id),
        liens: window.__rpcLiens, postId: state.userPosts[0].id };
    });
    expect(r.sorties).toHaveLength(abandon ? 0 : 1);
    expect(r.ecrites).toEqual(r.sorties);
    expect(r.liens).toEqual(abandon ? [] : [{ p_post_id: r.postId, p_event_id: r.sorties[0] }]);
  });
}

test("la relecture du fil rend le lien au lecteur et à l’auteur dont la copie locale est périmée", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(auteur => {
    state.userPosts = [{ id: "post_local_sortie", authorId: auteur, authorName: "Jerem", passion: "musique",
      type: "text", mood: "irl", text: "On marche samedi ?", createdAt: Date.now(), likes: 0, comments: [] }];
    saveStateNow();
  }, UUID);
  await bootOnboarded(page); // Le cache de l’auteur survit au rechargement.
  const sortie = activiteServeur();
  await page.evaluate(({ ev, auteur }) => {
    MY_UID = auteur;
    const local = state.userPosts.find(p => p.id === "post_local_sortie");
    state.supabasePosts = [
      { ...local, fromSupabase: true },
      { ...local, id: "post_lu_sortie", authorId: "u_autre", authorName: "Léa", fromSupabase: true },
    ];
    state.seed.events = [ev];
    state.seed.posts = [];
    renderFeed();
  }, { ev: sortie, auteur: UUID });
  const portes = page.locator('#feedList article[data-postid="post_local_sortie"], #feedList article[data-postid="post_lu_sortie"]');
  await expect(portes.getByRole("button", { name: "Chercher une sortie musique" })).toHaveCount(2);
  await page.evaluate(async id => {
    const lignes = state.supabasePosts.map(p => ({
      id: p.id, author_id: p.authorId, passion_id: p.passion, mood: p.mood, content: p.text,
      created_at: new Date(p.createdAt).toISOString(), event_id: id, profiles: { username: p.authorName },
    }));
    const lecture = { select: () => lecture, order: () => lecture, range: async () => ({ data: lignes, error: null }) };
    const depuis = supa.from.bind(supa);
    supa.from = table => table === "posts" ? lecture : depuis(table);
    state.supabasePosts = await supaLoadPosts();
    renderFeed(); // Même liste, compteurs identiques, seul le rattachement a changé.
  }, sortie.id);
  await expect(portes.locator(`[data-v3-activity="${sortie.id}"]`)).toHaveCount(2);
  await page.locator('#feedList article[data-postid="post_lu_sortie"] [data-v3-activity]').click();
  await expect(page.locator("#eventDetailPage")).toContainText(sortie.title);
});

test.describe("Une activité créée apparaît dans le fil", () => {
  test("① publiée : sa carte arrive dans le fil, l'invitation reste à l'écran", async ({ page }) => {
    await banc(page, true);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => window.__envoyes.length)).toBe(1);
    const r = await page.evaluate(() => {
      const ev = state.userEvents[0];
      const p = state.userPosts.find((x) => x.id === "post_ev_" + ev.id);
      return { envoye: window.__envoyes[0], attendu: "post_ev_" + ev.id, p: p && {
        kind: p.sharedReelData.kind, ref: p.sharedReelData.id, evId: ev.id, mood: p.mood, auteur: p.authorId },
        invitation: !!document.querySelector("#modalBackdrop.active #_inviteEvBtn") };
    });
    expect(r.envoye).toBe(r.attendu);
    expect(r.p).toEqual({ kind: "event", ref: r.p.evId, evId: r.p.evId, mood: "irl", auteur: UUID });
    expect(r.invitation, "la carte ne remplace pas la proposition d'invitation").toBe(true);
    // Et elle est PEINTE dans le fil — la donnée seule ne suffit pas.
    await page.evaluate(() => { closeModal(); goTo("feed"); renderFeed(); });
    // (La sous-carte historique est masquée par UI-3 au profit de « Voir l'activité » :
    // c'est l'ARTICLE, porteur du titre, qui doit être visible.)
    const carte = page.locator('#feedList article[data-postid="' + r.attendu + '"]');
    await expect(carte).toBeVisible();
    await expect(carte).toContainText("Via ferrata");
  });

  test("② rien en mode local, sur un refus, ni à l'édition", async ({ page }) => {
    await banc(page, null);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);

    await banc(page, false);
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);

    await banc(page, true);
    await page.evaluate((uuid) => {
      window.supaUpdateEvent = async () => true;
      state.userEvents = [{ id: "ev_moi", title: "Avant", passion: "musique", city: "Paris",
        date: Date.now() + 3 * 86400000, time: "18:00", attendees: [uuid], maybes: [], waitlist: [],
        checkedIn: [], organizerId: uuid, authorId: uuid, status: "active" }];
      openCreateEvent("ev_moi");
      document.getElementById("evTitle").value = "Après";
    }, UUID);
    await page.evaluate(() => submitEvent("ev_moi"));
    await expect.poll(() => page.evaluate(() => _findCanonicalEvent("ev_moi").title)).toBe("Après");
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });

  test("③ rattrapage : une carte pour l'activité récente qui n'en a pas, et une seule", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(async ({ a, uuid }) => {
      const jour = 86400000;
      const evs = [
        a,                                                                   // la seule à rattraper
        Object.assign({}, a, { id: "ev_vieille", createdAt: Date.now() - 30 * jour }),
        Object.assign({}, a, { id: "ev_passee", date: Date.now() - jour }),
        Object.assign({}, a, { id: "ev_autre", organizerId: "u_x", authorId: "u_x" }),
        Object.assign({}, a, { id: "ev_annulee", status: "cancelled" }),
        Object.assign({}, a, { id: "ev_supprimee" }),
      ];
      marquerPostSupprime("post_ev_ev_supprimee");
      const n1 = await rattraperActivitesAuFil(evs);
      const n2 = await rattraperActivitesAuFil(evs);          // second démarrage
      return { n1, n2, envoyes: window.__envoyes.slice(), lectures: window.__lectures };
    }, { a: activiteServeur(), uuid: UUID });
    expect(r.n1).toBe(1);
    expect(r.n2).toBe(0);
    expect(r.envoyes).toEqual(["post_ev_ev_jerem"]);
    // La question posée au serveur couvre le partage MANUEL (même `shared_data`).
    expect(r.lectures).toEqual(expect.arrayContaining([["author_id", UUID], ["shared_data", '%"id":"ev_jerem"%']]));
  });

  test("③ bis rattrapage : le serveur connaît déjà une carte → rien", async ({ page }) => {
    await banc(page, true);
    const n = await page.evaluate(async (a) => {
      window.__postsServeur = [{ id: "post_manuel" }];
      return rattraperActivitesAuFil([a]);
    }, activiteServeur());
    expect(n).toBe(0);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });

  test("④ la coupure éteint la création comme le rattrapage", async ({ page }) => {
    await banc(page, true);
    await page.evaluate(() => { window.PASSIO_ACTIVITE_AU_FIL = false; });
    await creer(page, "Via ferrata");
    await expect.poll(() => page.evaluate(() => state.userEvents.length)).toBe(1);
    const n = await page.evaluate((a) => rattraperActivitesAuFil([a]), activiteServeur());
    expect(n).toBe(0);
    expect(await page.evaluate(() => [state.userPosts.length, window.__envoyes.length])).toEqual([0, 0]);
  });

  // 2026-11-15 (Benjamin) : le titre ET la description au-dessus du rectangle date.
  test("⑤ la carte porte la description, entre le titre et le rectangle, échappée", async ({ page }) => {
    await banc(page, true);
    const r = await page.evaluate(() => {
      const html = (desc, snap) => carteActiviteFilHTML({ sharedReelData: Object.assign(
        { kind: "event", id: "ev_absente", title: "Via ferrata", city: "Sixt", date: Date.now() + 86400000 }, snap) });
      const d = document.createElement("div");
      d.innerHTML = html(null, { desc: "Casque fourni <img src=x onerror=window.__xss=1>" });
      const enfants = Array.from(d.querySelector(".post-activite").children).map((n) => n.className);
      const sans = document.createElement("div");
      sans.innerHTML = html(null, {});
      return { enfants, texte: d.querySelector(".post-activite-desc").textContent,
        img: d.querySelectorAll(".post-activite-desc img").length, sans: sans.querySelectorAll(".post-activite-desc").length };
    });
    expect(r.enfants).toEqual(["post-activite-titre", "post-activite-desc", "post-activite-rdv"]);
    expect(r.texte).toContain("Casque fourni <img");
    expect(r.img).toBe(0);
    expect(r.sans, "pas de description → pas de ligne vide").toBe(0);

    // Et la création la recopie dans la carte du fil.
    await page.evaluate(() => {
      openCreateEvent();
      document.getElementById("evTitle").value = "Via ferrata";
      document.getElementById("evTime").value = "18:00";
      document.getElementById("evCity").value = "Sixt-Fer-à-Cheval";
      document.getElementById("evDesc").value = "Niveau débutant, baudrier prêté";
    });
    await page.evaluate(() => submitEvent());
    await expect.poll(() => page.evaluate(() => window.__envoyes.length)).toBe(1);
    await page.evaluate(() => { closeModal(); goTo("feed"); renderFeed(); });
    await expect(page.locator("#feedList .post-activite-desc").first()).toHaveText("Niveau débutant, baudrier prêté");
  });
});
