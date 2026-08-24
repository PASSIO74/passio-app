// Suite « funnel Fil → IRL : résultats réels » (Lot 1B).
//
// Le Lot 1A instrumentait l'INTENTION (vue du CTA, clic, brouillon prérempli),
// couverte par tests/e2e/feed-irl-bridge.spec.js. Ce lot-ci instrumente le
// RÉSULTAT : création et participation. Invariants vérifiés ici :
//
//   · un succès n'est émis QUE sur le verdict de l'écriture Supabase — un clic,
//     un affichage optimiste ou une insertion locale ne suffisent jamais ;
//   · une écriture refusée émet un échec de cause normalisée `write_failed`,
//     et JAMAIS un succès, même si l'événement est visible à l'écran ;
//   · aucune écriture tentée (mode local / hors ligne) = échec `offline` ;
//   · une édition n'est pas une création ; « declined » et le retrait ne sont
//     pas des participations ;
//   · l'origine Fil n'est portée que quand elle est réellement connue, et le
//     marqueur du pont ne fuit pas sur la création suivante ;
//   · double émission dédoublonnée dans la fenêtre, ré-émission possible après ;
//   · métadonnées bornées : ni titre, ni ville, ni identifiant, ni texte libre.
//
// Les quatre événements passent par `tel.action`, exactement comme les actions
// déjà comptées par le Centre de pilotage (`event_join`, `publish_post`…) :
// aucune infrastructure parallèle n'est créée, les agrégations génériques
// existantes les voient sans modification du dashboard.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const TITLE = "Titre-libre-QA-ne-doit-jamais-fuiter";
const CITY = "Paris";

// Démarrage neutralisé (aucune écriture prod) + capture de la télémétrie.
async function bootFunnel(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    ["supaPublishEvent", "supaUpdateEvent", "supaJoinEvent", "supaLeaveEvent",
      "supaSetEventRsvp", "supaLoadEvents", "supaLoadMyRsvps", "supaLoadEventCommentCounts",
      "supaCreateEventConversation", "supaJoinEventConversation", "supaLeaveEventConversation",
      "supaPromoteFromWaitlist", "supaFirstWaitlisted",
    ].forEach((fn) => { window[fn] = async () => null; });
    window.passioGeocode = async () => null;
    window._geocodeAddress = async () => null;
    window.irlUserLocation = { lat: 48.8566, lng: 2.3522 };

    window.__telCap = [];
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__telCap.push({ name: name, meta: meta }); };
    window.tel.error = function (err, ctx) { window.__telCap.push({ name: "__error", meta: ctx && ctx.meta }); };

    window._supaReal = false;
    window._irlFunnelSeen = {};
    state.userEvents = [];
    state.seed.events = [];
    state.user.joinedEvents = [];
    state.user.eventRsvp = {};
    goTo("irl");
    renderIRL();
  });
}

// Écriture serveur pilotée : `verdict` = true (confirmée), false (refusée) ou
// null (aucun backend → le chemin d'écriture n'est même pas emprunté).
async function setBackend(page, verdict) {
  await page.evaluate((v) => {
    window._supaReal = v !== null;
    window.supaPublishEvent = async () => v === true;
    window.supaSetEventRsvp = async () => v === true;
    window.supaJoinEvent = async () => v === true;
  }, verdict);
}

// Crée un événement par le formulaire IRL EXISTANT. `open` permet d'ouvrir le
// formulaire autrement (par le pont, par exemple).
async function createEvent(page, title, open) {
  await page.evaluate(([t, c, viaBridge]) => {
    if (!viaBridge) openCreateEvent();
    document.getElementById("evTitle").value = t;
    document.getElementById("evCity").value = c;
  }, [title, CITY, !!open]);
  await page.evaluate(() => submitEvent());
}

async function seedEvent(page, extra) {
  await page.evaluate((ex) => {
    state.seed.events = [Object.assign({
      id: "ev0", title: "Événement hôte", passion: "musique", emoji: "🎸",
      city: "Paris", lat: 48.8566, lng: 2.3522, date: Date.now() + 3 * 86400000,
      time: "18:00", desc: "", attendees: [], maybes: [], waitlist: [], checkedIn: [],
      organizerId: "someone_else", status: "active",
    }, ex || {})];
    state.user.eventRsvp = {};
    state.user.joinedEvents = [];
    renderIRL();
  }, extra || null);
}

const funnel = (page) => page.evaluate(() =>
  window.__telCap.filter((e) => /^irl_(create|join)_/.test(String(e.name))));

test.describe("Funnel IRL — création", () => {
  test("écriture confirmée : un seul irl_create_success, métadonnées bornées", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, true);
    await createEvent(page, TITLE);

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_success"]);
    expect(Object.keys(evs[0].meta).sort()).toEqual(["flag", "from_feed", "v"]);
    expect(evs[0].meta.v).toBe("v1b1");
    expect(evs[0].meta.flag).toBe("off");     // pont non activé sur ce parcours
    expect(evs[0].meta.from_feed).toBe(false);
    // L'événement existe bien localement : le succès n'est pas un effet de bord
    // d'un échec de création.
    expect(await page.evaluate(() => state.userEvents.length)).toBe(1);
  });

  test("écriture refusée : irl_create_failed(write_failed) alors que l'écran montre l'événement", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, false);
    await createEvent(page, TITLE);

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_failed"]);
    expect(evs[0].meta.reason).toBe("write_failed");
    expect(Object.keys(evs[0].meta).sort()).toEqual(["flag", "from_feed", "reason", "v"]);
    // L'affichage optimiste est bien là — et il n'a PAS produit de succès.
    expect(await page.evaluate(() => state.userEvents.length)).toBe(1);
  });

  test("aucune écriture tentée : irl_create_failed(offline), jamais un succès", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, null);
    await createEvent(page, TITLE);

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_failed"]);
    expect(evs[0].meta.reason).toBe("offline");
  });

  test("une édition n'entre pas dans le funnel de création", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, true);
    await page.evaluate(() => {
      state.userEvents = [{
        id: "mine1", title: "À corriger", passion: "musique", emoji: "🎸", city: "Paris",
        lat: 48.85, lng: 2.35, date: Date.now() + 5 * 86400000, time: "18:00", desc: "",
        attendees: [MY_UID], maybes: [], waitlist: [], organizerId: MY_UID, status: "active",
      }];
      window.supaUpdateEvent = async () => true;
      openCreateEvent("mine1");
      document.getElementById("evTitle").value = "Titre corrigé";
    });
    await page.evaluate(() => submitEvent("mine1"));

    expect((await funnel(page)).map((e) => e.name)).toEqual([]);
  });

  test("origine Fil : marquée quand le pont a ouvert le brouillon, jamais héritée ensuite", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, true);
    await page.evaluate(() => {
      localStorage.setItem("passio_feed_irl_bridge_v1", "1");
      delete window.PASSIO_FEED_IRL_BRIDGE_V1;
      state.userPosts = [{
        id: "post_funnel_qa", authorId: "me", authorName: "Audit QA", passion: "musique",
        type: "text", text: "contenu", createdAt: Date.now(), likes: 0, comments: [],
      }];
      feedIrlBridgeOpen("post_funnel_qa");   // ouvre le formulaire IRL existant
    });
    await createEvent(page, TITLE, true);

    let evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_success"]);
    expect(evs[0].meta.from_feed).toBe(true);
    expect(evs[0].meta.flag).toBe("on");

    // Création suivante, ouverte depuis l'écran IRL : le marqueur du pont a été
    // consommé, l'origine ne doit PAS être héritée.
    await createEvent(page, "Deuxième événement QA");
    evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_success", "irl_create_success"]);
    expect(evs[1].meta.from_feed).toBe(false);
  });

  test("brouillon du pont abandonné : la création suivante n'est pas attribuée au Fil", async ({ page }) => {
    await bootFunnel(page);
    await setBackend(page, true);
    await page.evaluate(() => {
      localStorage.setItem("passio_feed_irl_bridge_v1", "1");
      delete window.PASSIO_FEED_IRL_BRIDGE_V1;
      state.userPosts = [{
        id: "post_funnel_qa", authorId: "me", authorName: "Audit QA", passion: "musique",
        type: "text", text: "contenu", createdAt: Date.now(), likes: 0, comments: [],
      }];
      feedIrlBridgeOpen("post_funnel_qa");
      closeModal();                       // brouillon abandonné
    });
    await createEvent(page, TITLE);

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_create_success"]);
    expect(evs[0].meta.from_feed).toBe(false);
  });
});

test.describe("Funnel IRL — participation", () => {
  test("RSVP confirmé : irl_join_success sans origine devinée", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page);
    await setBackend(page, true);
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_join_success"]);
    expect(Object.keys(evs[0].meta).sort()).toEqual(["flag", "v"]);
    expect(evs[0].meta.v).toBe("v1b1");
  });

  test("RSVP refusé par la base : irl_join_failed(write_failed) malgré l'état local à jour", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page);
    await setBackend(page, false);
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_join_failed"]);
    expect(evs[0].meta.reason).toBe("write_failed");
    // L'état local optimiste existe bel et bien — il n'a pas produit de succès.
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("going");
  });

  test("aucun backend : irl_join_failed(offline)", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page);
    await setBackend(page, null);
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = await funnel(page);
    expect(evs.map((e) => e.name)).toEqual(["irl_join_failed"]);
    expect(evs[0].meta.reason).toBe("offline");
  });

  test("« peut-être » et liste d'attente comptent ; « declined » et le retrait non", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page, { maxAttendees: 1, attendees: ["u1"] });
    await setBackend(page, true);

    await page.evaluate(() => setEventRsvp("ev0", "maybe"));
    await page.evaluate(() => setEventRsvp("ev0", "going"));   // complet → waitlist
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("waitlist");
    await page.evaluate(() => setEventRsvp("ev0", "declined"));
    await page.evaluate(() => setEventRsvp("ev0", null));      // retrait

    expect((await funnel(page)).map((e) => e.name))
      .toEqual(["irl_join_success", "irl_join_success"]);
  });

  test("dédoublonnage : deux résultats identiques rapprochés = un seul événement", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page);
    await setBackend(page, true);

    await page.evaluate(() => setEventRsvp("ev0", "going"));
    // Même résultat réémis immédiatement (ré-entrance / double soumission).
    await page.evaluate(() => { _setMyRsvpLocal("ev0", null); return setEventRsvp("ev0", "going"); });
    expect((await funnel(page)).map((e) => e.name)).toEqual(["irl_join_success"]);

    // Hors fenêtre, une nouvelle conversion réelle est bien comptée : le
    // dédoublonnage absorbe le bruit, il ne rend pas le funnel sourd.
    await page.waitForTimeout(4300);
    await page.evaluate(() => { _setMyRsvpLocal("ev0", null); return setEventRsvp("ev0", "going"); });
    expect((await funnel(page)).map((e) => e.name))
      .toEqual(["irl_join_success", "irl_join_success"]);
  });
});

test.describe("Funnel IRL — confidentialité et robustesse", () => {
  test("aucune donnée personnelle ni identifiant dans les métadonnées", async ({ page }) => {
    await bootFunnel(page);
    await seedEvent(page);
    await setBackend(page, false);
    await createEvent(page, TITLE);
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    const evs = await funnel(page);
    expect(evs.length).toBe(2);
    const myUid = await page.evaluate(() => String(MY_UID));
    const eventId = await page.evaluate(() => String(state.userEvents[0].id));
    const ALLOWED = ["v", "flag", "from_feed", "reason"];
    for (const ev of evs) {
      for (const k of Object.keys(ev.meta)) expect(ALLOWED).toContain(k);
      const dump = JSON.stringify(ev.meta);
      expect(dump).not.toContain(TITLE);
      expect(dump).not.toContain(CITY);
      expect(dump).not.toContain(myUid);
      expect(dump).not.toContain(eventId);
      expect(dump).not.toContain("48.8");     // aucune coordonnée
      // Les clés doivent survivre au filtre PII de js/telemetry.js (DENY_KEY) :
      // une clé rejetée partirait sans jamais arriver au Centre de pilotage.
      for (const k of Object.keys(ev.meta)) {
        expect(k).not.toMatch(/(pass|token|secret|auth|code|mail|name|user|title|titre|label|city|ville|address|lat|lng|location|text|message|content)/i);
      }
    }
  });

  test("télémétrie indisponible : création et participation fonctionnent quand même", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await bootOnboarded(page, errors);
    await page.evaluate(() => {
      window.tel = {};                    // API présente mais sans `action`
      window._supaReal = true;
      window.supaPublishEvent = async () => true;
      window.supaSetEventRsvp = async () => true;
      window.supaJoinEvent = async () => true;
      window._geocodeAddress = async () => null;
      state.userEvents = [];
      state.seed.events = [{
        id: "ev0", title: "Hôte", passion: "musique", emoji: "🎸", city: "Paris",
        lat: 48.85, lng: 2.35, date: Date.now() + 3 * 86400000, time: "18:00", desc: "",
        attendees: [], maybes: [], waitlist: [], organizerId: "someone_else", status: "active",
      }];
      goTo("irl"); renderIRL();
    });
    await createEvent(page, "Sans télémétrie QA");
    await page.evaluate(() => setEventRsvp("ev0", "going"));

    expect(await page.evaluate(() => state.userEvents.length)).toBe(1);
    expect(await page.evaluate(() => myRsvp("ev0"))).toBe("going");
    // Ciblé : une télémétrie indisponible ne doit pas casser le parcours IRL.
    expect(errors.js.filter((m) => /tel|funnel|irlFunnel/i.test(m))).toEqual([]);
  });
});
