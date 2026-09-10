// ═══════════════════════════════════════════════════════════════════════════
// REPRISE DES LECTURES DE DÉMARRAGE APRÈS UNE COUPURE RÉSEAU
//
// Mesuré en production le 2026-09-10 (telemetry_events, type=api, 14 jours) :
// 448 appels morts avec `http_status = 0` et « Failed to fetch », sur
// 46 sessions — `passions`, `user_state`, `posts`, `profiles`, `follows`,
// `notifications`, `conv_members`… La requête n'a jamais atteint PostgREST.
//
// ⚠️ CE QUE LA MESURE A CORRIGÉ DANS L'HYPOTHÈSE DE DÉPART, et c'est la raison
// d'être de la forme du correctif :
//   · AUCUNE ligne iOS/Safari dans cette famille. 374 Android/Chrome,
//     57 Windows/Edge, 17 Windows/Chrome. L'explication « WebKit coupe les
//     requêtes d'une page en arrière-plan » ne tient pas devant la base.
//   · Le passage en arrière-plan n'explique QU'UN TIERS des cas : 126 des 374
//     lignes Android suivent un `lifecycle hidden` dans la minute ; ZÉRO des
//     74 lignes de bureau.
//   · Les échecs arrivent EN RAFALE : 3,2 par seconde en moyenne, jusqu'à 23
//     dans la même seconde — toutes les requêtes en vol qui tombent ensemble.
//   · 92 échecs sur 448 seulement sont suivis d'un appel réussi dans la même
//     session : dans l'immense majorité des cas, PERSONNE NE RÉESSAIE.
//
// D'où le correctif : pas une garde à l'aller (« n'émettre que si la page est
// visible » aurait raté deux tiers des cas et retardé tout démarrage en
// arrière-plan), mais un REJEU au retour — celui que les chemins d'ÉCRITURE
// avaient déjà (`_flushPendingUserState`, `_delObFlush`, `_cmtObFlush`,
// `_flushOutbox`) et que les chemins de LECTURE n'avaient pas.
//
// Ce que ce banc garde, et il ÉCHOUE sur le code d'avant (réinjection) :
//   ① `estEchecReseau` sépare une panne de réseau d'un refus du serveur ;
//   ② une lecture `user_state` coupée s'inscrit au registre ;
//   ③ un refus RLS ne s'y inscrit JAMAIS (marteler une porte fermée) ;
//   ④ une lecture réussie acquitte et rend son crédit d'essais ;
//   ⑤ le retour en visibilité rejoue ;
//   ⑥ `online` rejoue ;
//   ⑦ le rejeu est BORNÉ à 3 essais — pas de boucle ;
//   ⑧ on ne rejoue pas depuis une page masquée ni hors ligne (ce serait
//      refabriquer l'échec et consommer un essai pour rien) ;
//   ⑨ un référentiel de passions TRONQUÉ par une coupure est rechargé — le
//      cache à un seul coup le figeait pour toute la session ;
//   ⑩ rien n'est armé quand rien n'a échoué (aucune minuterie parasite) ;
//   ⑪ télémétrie : un échec réseau PROUVÉ transitoire est `warn`, un échec
//      inexpliqué reste `error` ;
//   ⑫ contrat de source : le câblage existe aux deux points de lecture — sans
//      ce cas, on pourrait le supprimer sans un seul rouge.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SOURCE_APP02 = path.join(__dirname, "..", "..", "js", "app-02-state-utils.js");
const SOURCE_TELEMETRIE = path.join(__dirname, "..", "..", "js", "telemetry.js");

// Identifiant que personne n'écrira jamais : il ne doit exister ni dans le socle
// embarqué, ni dans le référentiel réel. Même précaution que `NOM_ESSAI` de
// `creation-passion.spec.js` — un nom plausible finit par entrer au référentiel
// et fait tomber la suite pour une prémisse périmée, pas pour un défaut.
const ID_BANC = "zzz-passion-de-banc-reprise-nexiste-pas";

/**
 * Pose un faux `supa` en MUTANT l'objet existant. ⚠️ On ne peut PAS remplacer le
 * binding : `supa` est un `let` de portée script (app-08), donc `window.supa = x`
 * crée une propriété SÉPARÉE que le code applicatif ne regarde jamais. Le vrai
 * levier est la mutation de l'objet, que les deux voient.
 */
async function poserFauxSupa(page) {
  await page.evaluate((idBanc) => {
    window.__appels = { user_state: 0, passions: 0 };
    // Scénario courant, changé d'un test à l'autre : "reseau" | "refus" | "ok".
    window.__scenario = "reseau";
    // Nombre de pages de passions déjà servies, pour rejouer la pagination.
    window.__pagePassions = 0;
    // Combien de pages PLEINES avant la coupure (ou la fin propre).
    window.__pagesPleines = 1;

    const ERR_RESEAU = { message: "FetchError: Failed to fetch", details: "", hint: "", code: "" };
    const ERR_REFUS = { message: "permission denied for table user_state", details: "", hint: "", code: "42501" };

    function reponse(table) {
      if (table === "user_state") {
        window.__appels.user_state++;
        if (window.__scenario === "reseau") return { data: null, error: ERR_RESEAU };
        if (window.__scenario === "refus") return { data: null, error: ERR_REFUS };
        return { data: null, error: null };          // lecture aboutie, pas de ligne
      }
      // table === "passions"
      window.__appels.passions++;
      const page = window.__pagePassions++;
      function pagePleine(n) {
        const pleine = [];
        for (let i = 0; i < 1000; i++) pleine.push({ id: "banc-p" + n + "-" + i });
        return { data: pleine, error: null };
      }
      // `__pagesPleines` pages complètes, puis soit la coupure, soit la fin propre.
      if (page < window.__pagesPleines) return pagePleine(page);
      if (window.__scenario === "reseau") return { data: null, error: ERR_RESEAU };
      return { data: [{ id: idBanc }], error: null };  // page courte → fin propre
    }

    window.supa.from = function (table) {
      const chaine = {
        select: function () { return chaine; },
        eq: function () { return chaine; },
        range: function () { return chaine; },
        upsert: function () { return chaine; },
        insert: function () { return chaine; },
        maybeSingle: function () { return Promise.resolve(reponse(table)); },
        then: function (ok, ko) { return Promise.resolve(reponse(table)).then(ok, ko); },
        catch: function (f) { return Promise.resolve(reponse(table)).catch(f); },
      };
      return chaine;
    };
    window._supaReal = true;
  }, ID_BANC);
}

test.describe("Reprise des lectures de démarrage après coupure réseau", () => {

  test("① estEchecReseau sépare une panne de réseau d'un refus du serveur", async ({ page }) => {
    await bootOnboarded(page, null);
    const verdicts = await page.evaluate(() => {
      const f = window.estEchecReseau;
      return {
        existe: typeof f === "function",
        // Les libellés RÉELS des quatre moteurs, pas des inventions.
        chrome: f({ message: "Failed to fetch" }),
        postgrest: f({ message: "FetchError: Failed to fetch", code: "" }),
        webkit: f({ message: "Load failed" }),
        firefox: f({ message: "NetworkError when attempting to fetch resource." }),
        ios: f({ message: "The network connection was lost." }),
        // Et ce qui ne doit JAMAIS être rejoué.
        rls: f({ message: "permission denied for table posts", code: "42501" }),
        pasDeLigne: f({ message: "JSON object requested", code: "PGRST116" }),
        http401: f({ message: "Unauthorized", status: 401 }),
        http409: f({ message: "duplicate key value", code: "23505" }),
        vide: f(null),
      };
    });
    expect(verdicts.existe).toBe(true);
    expect(verdicts.chrome).toBe(true);
    expect(verdicts.postgrest).toBe(true);
    expect(verdicts.webkit).toBe(true);
    expect(verdicts.firefox).toBe(true);
    expect(verdicts.ios).toBe(true);
    expect(verdicts.rls).toBe(false);
    expect(verdicts.pasDeLigne).toBe(false);
    expect(verdicts.http401).toBe(false);
    expect(verdicts.http409).toBe(false);
    expect(verdicts.vide).toBe(false);
  });

  test("② une lecture user_state coupée par le réseau s'inscrit au registre", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const etat = await page.evaluate(async () => {
      window.__scenario = "reseau";
      await window.supaLoadUserState();
      return window._repriseEtat();
    });
    expect(etat.enAttente).toContain("user_state");
  });

  test("③ un refus RLS ne s'inscrit JAMAIS : on ne martèle pas une porte fermée", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const etat = await page.evaluate(async () => {
      window.__scenario = "refus";
      await window.supaLoadUserState();
      return window._repriseEtat();
    });
    expect(etat.enAttente).not.toContain("user_state");
    expect(etat.arme).toBe(false);
  });

  test("④ une lecture aboutie acquitte ET rend son crédit d'essais", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const etat = await page.evaluate(async () => {
      window.__scenario = "reseau";
      await window.supaLoadUserState();          // échoue → inscrit
      window.__scenario = "ok";
      await window.supaLoadUserState();          // aboutit → acquitte
      return window._repriseEtat();
    });
    expect(etat.enAttente).not.toContain("user_state");
    // Le crédit d'essais est RENDU : une coupure une heure plus tard doit
    // retrouver ses trois tentatives, pas un compteur déjà épuisé.
    expect(etat.essais.user_state).toBeUndefined();
  });

  test("⑤ le retour en visibilité rejoue la lecture coupée", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async () => {
      window.__scenario = "reseau";
      await window.supaLoadUserState();
      const avant = window.__appels.user_state;
      window.__scenario = "ok";
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 300));
      return { avant, apres: window.__appels.user_state, etat: window._repriseEtat() };
    });
    expect(r.apres).toBeGreaterThan(r.avant);
    expect(r.etat.enAttente).not.toContain("user_state");
  });

  test("⑥ l'événement online rejoue lui aussi", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async () => {
      window.__scenario = "reseau";
      await window.supaLoadUserState();
      const avant = window.__appels.user_state;
      window.__scenario = "ok";
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 300));
      return { avant, apres: window.__appels.user_state };
    });
    expect(r.apres).toBeGreaterThan(r.avant);
  });

  test("⑦ le rejeu est BORNÉ à trois essais — une coupure durable ne boucle pas", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async () => {
      window.__scenario = "reseau";                 // le réseau ne revient jamais
      await window.supaLoadUserState();
      // Dix sollicitations : la borne doit tenir, pas la patience de l'appelant.
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new Event("online"));
        await new Promise((r) => setTimeout(r, 60));
      }
      return { appels: window.__appels.user_state, etat: window._repriseEtat() };
    });
    // ⚠️ LES DEUX BORNES, PAS SEULEMENT LA HAUTE. « ≤ 4 » seul restait VERT si
    // l'on supprimait tout le moteur (`appels === 1`) : un verrou qui n'exerce
    // plus le geste cesse de protéger le geste.
    expect(r.appels).toBeGreaterThan(1);
    expect(r.appels).toBeLessThanOrEqual(4);
    expect(r.etat.enAttente).not.toContain("user_state");
    expect(r.etat.arme).toBe(false);
  });

  test("⑧ on ne rejoue ni depuis une page masquée ni hors ligne", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async () => {
      window.__scenario = "reseau";
      await window.supaLoadUserState();
      const avant = window.__appels.user_state;
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const masquee = await window.repriseLecturesBoot("banc-masquee");
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const horsLigne = await window.repriseLecturesBoot("banc-hors-ligne");
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      return { avant, apres: window.__appels.user_state, masquee, horsLigne, etat: window._repriseEtat() };
    });
    expect(r.masquee).toBe(0);
    expect(r.horsLigne).toBe(0);
    expect(r.apres).toBe(r.avant);                  // aucune requête refabriquée
    // Et surtout : aucun essai consommé, la lecture attend toujours.
    expect(r.etat.enAttente).toContain("user_state");
  });

  test("⑨ un référentiel de passions TRONQUÉ par une coupure est rechargé", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async (idBanc) => {
      window.__scenario = "reseau";
      window.chargerReferentielPassions();          // page 0 pleine, page 1 coupée
      await new Promise((r) => setTimeout(r, 300));
      const avant = {
        canonique: window.estPassionCanonique(idBanc),
        enAttente: window._repriseEtat().enAttente.slice(),
        appels: window.__appels.passions,
      };
      // Le réseau revient. Sur le code d'avant, le cache à UN SEUL COUP
      // (`if (_referentielPassions) return;`) refusait tout rechargement : la
      // liste blanche tronquée restait en place pour toute la session, et
      // `estPassionCanonique` refusait des passions légitimes à la publication.
      window.__scenario = "ok";
      window.__pagePassions = 0;
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 500));
      return {
        avant,
        apres: {
          canonique: window.estPassionCanonique(idBanc),
          enAttente: window._repriseEtat().enAttente.slice(),
          appels: window.__appels.passions,
        },
      };
    }, ID_BANC);
    expect(r.avant.canonique).toBe(false);
    expect(r.avant.enAttente).toContain("passions");
    expect(r.apres.appels).toBeGreaterThan(r.avant.appels);
    expect(r.apres.canonique).toBe(true);           // le référentiel est redevenu COMPLET
    expect(r.apres.enAttente).not.toContain("passions");
  });

  test("⑬ un rejeu ne RÉTRÉCIT jamais la liste blanche des passions", async ({ page }) => {
    await bootOnboarded(page, null);
    await poserFauxSupa(page);
    const r = await page.evaluate(async (idBanc) => {
      // Premier chargement : deux pages pleines, puis coupure → 2 000 ids connus.
      window.__scenario = "reseau";
      window.__pagesPleines = 2;
      window.chargerReferentielPassions();
      await new Promise((r) => setTimeout(r, 400));
      const avant = window.estPassionCanonique("banc-p1-500");
      // Le rejeu repart de la page 0 et casse DÈS la page 1 : sans amorçage sur
      // l'existant, `_referentielPassions` tombait de 2 000 à 1 000 ids et
      // `estPassionCanonique` refusait 1 000 passions parfaitement légitimes —
      // un rejeu censé RÉPARER qui retranche. C'est l'invariant « le référentiel
      // serveur AJOUTE, il ne retranche pas » (2026-08-31).
      window.__pagePassions = 0;
      window.__pagesPleines = 1;
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 600));
      return { avant, apres: window.estPassionCanonique("banc-p1-500") };
    }, ID_BANC);
    expect(r.avant).toBe(true);
    expect(r.apres).toBe(true);          // rien n'a été RETRANCHÉ par le rejeu
  });

  test("⑩ rien n'est armé quand rien n'a échoué (aucune minuterie parasite)", async ({ page }) => {
    await bootOnboarded(page, null);
    const etat = await page.evaluate(() => window._repriseEtat());
    expect(etat.enAttente).toEqual([]);
    expect(etat.arme).toBe(false);
    expect(Object.keys(etat.essais)).toEqual([]);
  });

  test("⑪ télémétrie : le transitoire PROUVÉ est warn, l'inexpliqué reste error", async ({ page }) => {
    // `?telemetry=1` est le SEUL opt-in en local : sans lui les hooks passifs ne
    // sont même pas installés (« if (!ENABLED) return; »), et le banc mesurerait
    // le vide en se croyant vert.
    await bootOnboarded(page, null, 1, { query: "?telemetry=1" });
    // Aucun envoi ne doit partir vers la PRODUCTION depuis un banc.
    await page.route("**/rest/v1/telemetry_events*", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
    // La requête que l'on va faire échouer : une URL « supabase » quelconque,
    // volontairement PAS telemetry_events (le hook s'exclut lui-même).
    await page.route("**/faux-hote.supabase.co/**", (route) => route.abort("failed"));

    const r = await page.evaluate(async () => {
      window.__evts = [];
      // `window.tel` EST l'objet `Telemetry` du hook (même référence) : le muter
      // intercepte à la source, sans dépendre du transport ni d'un flush.
      window.tel.api = function (f) { window.__evts.push(f); };
      async function tenter() {
        try { await fetch("https://faux-hote.supabase.co/rest/v1/banc"); } catch (e) {}
        await new Promise((r) => setTimeout(r, 60));
        return window.__evts.pop() || null;
      }
      const visible = await tenter();                       // en ligne + visible
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const masquee = await tenter();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      const horsLigne = await tenter();
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      return { visible, masquee, horsLigne };
    });

    // Les trois doivent exister : sans ce contrôle, un `null` donnerait un
    // TypeError illisible au lieu d'un échec qui dit quoi regarder.
    expect(r.visible).not.toBeNull();
    expect(r.masquee).not.toBeNull();
    expect(r.horsLigne).not.toBeNull();
    // Un échec réseau page visible et en ligne : personne ne sait l'expliquer,
    // il ne doit pas se taire.
    expect(r.visible.severity).toBe("error");
    expect(r.visible.http_status).toBe(0);
    // Page masquée / appareil hors ligne : la cause est PROUVÉE au moment de
    // l'échec, ce n'est pas un défaut de notre code.
    expect(r.masquee.severity).toBe("warn");
    expect(r.masquee.meta.masquee).toBe(true);
    expect(r.horsLigne.severity).toBe("warn");
    expect(r.horsLigne.meta.hors_ligne).toBe(true);
    // Le statut reste « error » dans les trois cas : l'appel a bel et bien
    // échoué, on n'efface pas le fait, on cesse seulement de crier.
    expect(r.masquee.status).toBe("error");
  });

  test("⑫ contrat de source : le câblage existe aux deux points de lecture", async () => {
    const src = fs.readFileSync(SOURCE_APP02, "utf8");
    // Sans ce cas, le moteur pourrait rester vivant et n'être appelé par
    // PERSONNE — la suite entière resterait verte. Faute déjà commise sur
    // « Gérer mes passions » (2026-09-03) et sur le nom d'utilisateur.
    // ⚠️ Découper « la fonction » par une fenêtre de N caractères ne marche pas
    // dans ce dépôt : ses fonctions portent des blocs de commentaires plus longs
    // que leur code, et une fenêtre trop courte rendrait ce cas FAUX-ROUGE (vécu
    // en écrivant ce banc). On borne à la déclaration de premier niveau suivante.
    const bloc = (nom) => {
      const i = src.indexOf(nom);
      expect(i, nom + " est introuvable dans app-02").toBeGreaterThan(-1);
      const reste = src.slice(i + nom.length);
      const fin = reste.search(/\n(?:async function |function |let |const |window\.)/);
      return reste.slice(0, fin > -1 ? fin : reste.length);
    };
    expect(bloc("async function supaLoadUserState()")).toMatch(/_noterRepriseUserState\(\)/);
    expect(bloc("function chargerReferentielPassions()")).toMatch(/_noterReprisePassions\(\)/);
    // Le référentiel ne se déclare COMPLET que sur la sortie propre de la
    // boucle : un seul `_referentielComplet = true` dans tout le fichier.
    expect((src.match(/_referentielComplet = true/g) || []).length).toBe(1);
    // Les deux déclencheurs de rejeu sont branchés.
    expect(src).toMatch(/addEventListener\("online", function \(\) \{ repriseLecturesBoot/);
    expect(src).toMatch(/visibilityState === "visible"\) repriseLecturesBoot/);
    // Un rejeu ne peut pas RETRANCHER : `vus` est amorcé sur l'existant.
    expect(src).toMatch(/var vus = new Set\(_referentielPassions \|\| \[\]\);/);
    // Le rejeu des passions est ATTENDABLE, sinon l'essai est compté avant le verdict.
    expect(bloc("function chargerReferentielPassions()")).toMatch(/return _promesse;/);

    const tel = fs.readFileSync(SOURCE_TELEMETRIE, "utf8");
    expect(tel).toMatch(/severity: _transitoire \? "warn" : "error"/);
  });
});
