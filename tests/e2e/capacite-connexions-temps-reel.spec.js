// ════════════════════════════════════════════════════════════════════════════
// CAPACITÉ — UN VISITEUR NE TIENT PAS DE CONNEXION TEMPS RÉEL (2026-09-20)
//
// Le mur mesuré du forfait Pro n'est ni le CPU ni le stockage : c'est
// `Realtime Concurrent Peak Connections`, 84 / 500 sur la page Usage. Et ce
// quota ne compte ni des canaux ni des messages — **il compte des CLIENTS**,
// parce que supabase-js multiplexe tous les canaux d'un client sur UN SEUL
// WebSocket. « 500 connexions » veut donc dire « 500 onglets ouverts ».
//
// Or, mesuré en production sur 7 jours (`telemetry_events`, sessions
// distinctes) : **2 546 sessions sans compte sur 2 600, soit 97,9 %**. Chacune
// ouvrait pourtant sa connexion, parce que `supaSubscribe` créait `realtime:db`
// SANS CONDITION et que la policy de ce canal est ouverte à `anon`.
//
// ⚠️ CE QUE LE VISITEUR PERD EST RÉEL. La première rédaction de cet en-tête
// écrivait « rien qu'il puisse recevoir » — **faux**, et aucun de ces sept cas
// n'aurait pu le démentir : NEUF des treize liaisons de `realtime:db` portent du
// contenu PUBLIC (posts, j'aime, commentaires, lives, profils) ; quatre
// seulement ne le concernent pas. (« Sept et six » a été écrit d'abord, de
// mémoire — un inventaire qu'on n'a pas compté est une affirmation.) Ce qu'il perd,
// c'est le rafraîchissement VIF du public.
//
// ⚠️ D'OÙ LE COUPLAGE, ET C'EST LE CAS ④ QUI LE GARDE — sur les DEUX filets.
// Ils reculent jusqu'à 5 min quand ils ne trouvent rien, ce qui était justifié
// par « ça arrive par le temps réel ». Retirez le temps réel au visiteur et ils
// deviennent **son seul chemin**. Sans le cas ④, ce lot échangerait la capacité
// contre un fil figé cinq minutes chez 98 % des gens — il aurait « réussi » en
// coûtant plus que son gain. Le marché réel est : 60 s de latence sur du
// contenu public contre 97,9 % d'un quota de 500.
//
// ⚠️ `supa` EST UN `let` DE PORTÉE SCRIPT : on MUTE `window.supa.channel`, on ne
// remplace jamais le binding (`window.supa = x` créerait une propriété
// séparée, que `supaSubscribe` ne lirait pas). Règle déjà payée par
// `reprise-lectures-boot`.
// ════════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

// ⚠️ UNE TRANCHE PRISE SUR UN NOMBRE MAGIQUE CESSE DE COUVRIR SA FONCTION DÈS
// QU'ELLE GRANDIT, sans un rouge : `slice(i, i + 2600)` s'arrêtait à UN
// caractère de la fin de `startFeedRefreshLoop`. On lit le corps jusqu'à son
// accolade fermante de colonne 0, comme le ferait un lecteur.
function corpsDeFonction(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return "";
  const j = src.indexOf("\n}\n", i);
  return j < 0 ? src.slice(i) : src.slice(i, j + 2);
}
const sansCommentaires = (t) => t.replace(/\/\/.*$/gm, " ");

const UID_COMPTE = "812aee2b-214f-4949-931e-842599b6d68b"; // forme d'un uuid d'auth
const UID_VISITEUR = "u_9f3kd2la0";                        // ce que `getMyUserId()` fabrique

// Compte les canaux ouverts par un appel à `supaSubscribe()` sous une identité
// donnée, en MUTANT le client existant. Remet l'état d'abonnement à zéro avant
// chaque mesure : `_supaSubscribed` est une garde anti-doublon, pas le sujet.
async function canauxOuvertsSous(page, uid) {
  return page.evaluate((identite) => {
    window.__topics = [];
    if (!window.supa) return { erreur: "window.supa absent" };
    const faux = { on: () => faux, subscribe: () => faux, send: () => {}, unsubscribe: () => {} };
    window.supa.channel = (topic) => { window.__topics.push(topic); return faux; };
    window._supaSubscribed = false;
    window._callRingChan = null;
    window._userTopicChan = null;
    window._dbChan = null;
    MY_UID = identite;
    window.MY_UID = identite;
    try { supaSubscribe(); } catch (e) { return { erreur: String(e && e.message) }; }
    return { topics: window.__topics.slice(), drapeau: window._supaSubscribed === true };
  }, uid);
}

test.describe("Capacité — la connexion temps réel est réservée aux comptes", () => {
  test("① à la SOURCE : la garde précède la pose du drapeau anti-doublon", () => {
    const corps = corpsDeFonction(lire("js/app-08-ui-modals-tour.js"), "function supaSubscribe()");
    const garde = corps.indexOf("connexionTempsReelAutorisee()");
    const drapeau = corps.indexOf("window._supaSubscribed = true");
    expect(garde).toBeGreaterThan(-1);
    expect(drapeau).toBeGreaterThan(-1);
    // ⚠️ L'ORDRE EST LE LOT. Le drapeau posé AVANT la garde condamnerait le
    // compte qui vient de se créer : `onAuthStateChange` rappelle `supaInit`,
    // et `supaSubscribe` ressortirait sur un drapeau posé du temps où la
    // personne était encore visiteur — plus aucun temps réel de la session.
    expect(garde).toBeLessThan(drapeau);
    // ⚠️ `diagLog` NE PREND QU'UN ARGUMENT (app-08) : un second part en
    // silence, donc la trace du refus n'en porte qu'un.
    const trace = corps.match(/diagLog\(([^)]*)\)/);
    expect(trace, "le refus se trace").toBeTruthy();
    expect(trace[1]).not.toContain(",");
  });

  test("② un VISITEUR n'ouvre AUCUN canal — donc aucune connexion", async ({ page }) => {
    await bootOnboarded(page);
    const r = await canauxOuvertsSous(page, UID_VISITEUR);
    expect(r.erreur).toBeFalsy();
    expect(r.topics).toEqual([]);
  });

  test("③ et il ne pose PAS le drapeau : s'inscrire rend le temps réel", async ({ page }) => {
    await bootOnboarded(page);
    const visiteur = await canauxOuvertsSous(page, UID_VISITEUR);
    expect(visiteur.drapeau).toBe(false);
    // Même page, même session : la personne vient de créer son compte.
    const compte = await page.evaluate((uid) => {
      MY_UID = uid; window.MY_UID = uid;
      try { supaSubscribe(); } catch (e) { return { erreur: String(e && e.message) }; }
      return { topics: window.__topics.slice() };
    }, UID_COMPTE);
    expect(compte.erreur).toBeFalsy();
    expect(compte.topics.length).toBeGreaterThan(0);
    expect(compte.topics).toContain("realtime:db");
  });

  test("④ les DEUX filets NE RECULENT PAS quand ils sont le seul chemin", () => {
    // ⚠️ LE FIL **ET** LES LIVES. La première rédaction ne lisait qu'app-08 :
    // le filet des lives portait le même couplage, non traité et non mesuré —
    // un visiteur aurait gardé une bulle « 🔴 LIVE » allumée jusqu'à cinq
    // minutes après la fin du direct. « Corriger une surface, c'est corriger
    // une surface », et un verrou qui n'en lit qu'une ne garde qu'une.
    const fil = corpsDeFonction(lire("js/app-08-ui-modals-tour.js"), "function startFeedRefreshLoop()");
    expect(fil).toMatch(/filetProchainPas\(\s*_feedFiletPas,\s*vivant \|\| seulChemin/);
    expect(fil).toMatch(/filetEstLeSeulChemin\(\)/);

    const lives = corpsDeFonction(lire("js/app-05-config-profil.js"), "function _vliveFiletTour()");
    expect(lives).toMatch(/filetProchainPas\(\s*_vliveFiletPas,\s*vivant \|\| seulChemin/);
    expect(lives).toMatch(/filetEstLeSeulChemin\(\)/);

    // ⚠️ ET LA BORNE EST LE LOT AUTANT QUE LE COUPLAGE : pinner ces filets
    // PARTOUT coûtait 4 req/min par onglet visiteur (×5 du régime d'avant), sur
    // l'egress qui est le SECOND mur. Ils ne sont « le seul chemin » que
    // pendant qu'on regarde le fil, et `goTo` les réveille au retour.
    const autorite = corpsDeFonction(lire("js/app-02-state-utils.js"), "function filetEstLeSeulChemin()");
    expect(autorite, "borné au fil à l'écran").toMatch(/screen-feed[\s\S]{0,120}active/);
    const nav = corpsDeFonction(lire("js/app-02-state-utils.js"), "function goTo(screen)");
    expect(nav, "revenir au fil réveille le filet du fil").toMatch(/screen === "feed"[\s\S]{0,400}feedFiletReveiller/);
    expect(nav, "et celui des lives").toMatch(/screen === "feed"[\s\S]{0,400}vliveFiletReveiller/);
  });

  test("④ bis les surfaces de GESTE d'un visiteur n'ouvrent pas de canal", () => {
    // ⚠️ DEUX SURFACES RESTAIENT ATTEIGNABLES SANS COMPTE, et aucune n'était
    // sur le chemin de `supaSubscribe` : ouvrir une conversation de
    // DÉMONSTRATION (`_subscribeTyping`, `_supaConvSpecificChannel`) et taper
    // une bulle « 🔴 LIVE » (`joinVideoLive`, dont la garde testait `!MY_UID`,
    // vrai pour un `u_<aléatoire>`). Le lot mesurait le boot et se taisait sur
    // les gestes.
    const app04 = lire("js/app-04-comments-shop.js");
    for (const fn of ["function _subscribeTyping(convId)", "function _supaConvSpecificChannel(convId, displayName)"]) {
      expect(corpsDeFonction(app04, fn), fn).toMatch(/!connexionTempsReelAutorisee\(\)\) return;/);
    }
    const app05 = lire("js/app-05-config-profil.js");
    for (const fn of [
      "async function joinVideoLive(liveId)",
      // ⚠️ LE JUMEAU, resté sur `!MY_UID` : aucun canal ne fuyait (la RLS
      // refuse l'INSERT avant), mais un visiteur obtenait **la demande de
      // permission caméra** avant d'être refusé.
      "async function startVideoLive()",
      // ⚠️ ET LE LIEN PROFOND `?call=` — entonnoir des DEUX portes d'appel
      // entrant (URL et message du service worker), sur aucun chemin de boot.
      "function handlePushIncomingCall(d)",
    ]) {
      expect(corpsDeFonction(app05, fn), fn).toMatch(/connexionTempsReelAutorisee\(\)/);
    }
  });

  test("⑤ les bornes du filet restent dans `filetProchainPas`, pas recopiées ici", () => {
    // ⚠️ Le lot de la veille interdit de recopier une borne hors de l'autorité
    // unique. Ce cas le redit pour le code AJOUTÉ ici, sur les DEUX filets : on
    // réutilise le contrat `vivant`, on n'invente pas un second pas.
    const fil = sansCommentaires(corpsDeFonction(lire("js/app-08-ui-modals-tour.js"), "function startFeedRefreshLoop()"));
    const lives = sansCommentaires(corpsDeFonction(lire("js/app-05-config-profil.js"), "function _vliveFiletTour()"));
    for (const corps of [fil, lives]) expect(corps).not.toMatch(/\b(60000|300000|1\.5)\b/);
  });

  // ── L'INVENTAIRE DES PORTES ────────────────────────────────────────────
  // ⚠️ CE QUE CE CAS REMPLACE, ET POURQUOI. La première rédaction mesurait le
  // BOOT d'un visiteur au navigateur. **Elle ne pouvait rien prouver** :
  // mesuré, `supaInit` n'atteint jamais `supaSubscribe` au banc (il s'arrête
  // sur les lectures que `sansDonneesDistantes` coupe), donc le cas restait
  // VERT avec la garde retirée — vérifié par réinjection. **Un verrou vide est
  // pire que pas de verrou** : il fait croire le poste gardé.
  //
  // Ce qui est mesurable, et qui répond à la même inquiétude (« une AUTRE porte
  // ouvrira un canal pour un visiteur »), c'est l'INVENTAIRE des sites de
  // création. Il est déclaré ici avec, pour chacun, la raison qu'un visiteur ne
  // l'atteint pas — même idiome que `scripts/tests-isolation-socle.json`. Une
  // porte NEUVE, ou une porte déplacée, fait rougir ce cas jusqu'à ce que
  // quelqu'un écrive pourquoi elle est sûre. Il ne PROUVE pas l'inatteignabilité
  // (aucun grep ne le peut) : il force à la dire.
  const PORTES = {
    "app-04-comments-shop.js:_creerCanalTyping": "fabrique appelée par _subscribeTyping, GARDÉE",
    "app-04-comments-shop.js:_creerCanalConvSpecifique": "fabrique appelée par _supaConvSpecificChannel, GARDÉE",
    "app-05-config-profil.js:_callChannel": "fabrique de canaux d'appel — pas une porte, ses appelants le sont",
    "app-05-config-profil.js:startCall": "GARDÉE (et le pair de démo est écarté juste après)",
    "app-05-config-profil.js:_callOnInvite": "deux entrées : le canal `ring:` (compte réel seul) et handlePushIncomingCall, GARDÉE",
    "app-05-config-profil.js:acceptIncomingCall": "atteignable seulement depuis l'écran posé par _callOnInvite",
    "app-05-config-profil.js:_callDeclineSilent": "idem — même écran, même amont",
    "app-05-config-profil.js:_subscribeCallRing": "GARDÉE par admissionCompteReel depuis le 2026-09-11",
    "app-05-config-profil.js:startVideoLive": "GARDÉE",
    "app-05-config-profil.js:joinVideoLive": "GARDÉE",
    "app-08-ui-modals-tour.js:_subscribePrivateConv": "appelée par _supaConvSpecificChannel (gardée) et par un gestionnaire de canal déjà gardé",
    "app-08-ui-modals-tour.js:_subscribeUserTopic": "appelée par supaSubscribe (gardée) et par onAuthStateChange (compte réel)",
    "app-08-ui-modals-tour.js:_creerCanalDb": "fabrique appelée par supaSubscribe, GARDÉE",
  };

  test("⑤ bis L'INVENTAIRE DES PORTES est complet — une porte neuve doit se justifier", () => {
    const trouvees = {};
    for (const f of fs.readdirSync(path.join(RACINE, "js")).filter((n) => n.endsWith(".js"))) {
      const lignes = lire(path.join("js", f)).split("\n");
      lignes.forEach((l, i) => {
        if (l.trim().startsWith("//")) return;
        if (!/(?:supa|admin)\.channel\(|_callChannel\(/.test(l)) return;
        let fn = "?";
        for (let j = i; j >= 0; j--) {
          const m = /^(?:async )?function (\w+)/.exec(lignes[j]);
          if (m) { fn = m[1]; break; }
        }
        trouvees[`${f}:${fn}`] = true;
      });
    }
    const inconnues = Object.keys(trouvees).filter((k) => !PORTES[k]).sort();
    expect(inconnues,
      "porte de canal NON DÉCLARÉE : ajoute-la à PORTES avec la raison qu'un visiteur ne l'atteint pas, ou garde-la"
    ).toEqual([]);
    // Et dans l'autre sens : une entrée déclarée qui n'existe plus est du
    // commentaire qui se prend pour une garantie.
    const disparues = Object.keys(PORTES).filter((k) => !trouvees[k]).sort();
    expect(disparues, "entrée de PORTES sans site réel").toEqual([]);
  });

  test("⑥ UNE SEULE AUTORITÉ : aucun lecteur ne recopie la condition d'identité", () => {
    const app02 = lire("js/app-02-state-utils.js");
    expect(app02).toContain("function connexionTempsReelAutorisee()");
    expect(app02).toContain("function filetEstLeSeulChemin()");

    // ⚠️ ON NE COMPTE PLUS LES LECTEURS. La première rédaction épinglait un
    // `toBe(2)` par fichier : ajouter une garde LÉGITIME — `startVideoLive`, le
    // lien profond `?call=` — faisait rougir ce cas pour une raison qui n'est
    // pas la sienne, c'est-à-dire la faute que ce même commit corrige deux fois
    // dans `capacite-amplification`.
    //
    // ⚠️ ET ON NE BALAIE PAS LES FICHIERS ENTIERS : la deuxième rédaction l'a
    // fait, et a **rougi sur trois innocents** — `app-04:5340` (`RE_UID_COMPTE`
    // sur l'identifiant d'UN AUTRE), `app-05:569` et `app-08:1863` (`/^u_/` sur
    // le pair et sur l'auteur d'une story). Aucun ne recopie la condition du
    // lot : ils la posent sur quelqu'un d'autre. Un verrou qui rougit sur un
    // innocent finit par être désarmé — troisième fois en deux jours, et la
    // première où c'est le verrou qui garde la règle qui l'enfreint.
    // On mesure donc DANS le corps de chaque fonction gardée, et là seulement.
    const gardees = [
      ["js/app-04-comments-shop.js", "function _subscribeTyping(convId)"],
      ["js/app-04-comments-shop.js", "function _supaConvSpecificChannel(convId, displayName)"],
      ["js/app-05-config-profil.js", "async function joinVideoLive(liveId)"],
      ["js/app-05-config-profil.js", "async function startVideoLive()"],
      ["js/app-05-config-profil.js", "function handlePushIncomingCall(d)"],
      ["js/app-08-ui-modals-tour.js", "function supaSubscribe()"],
    ];
    for (const [f, fn] of gardees) {
      const corps = sansCommentaires(corpsDeFonction(lire(f), fn));
      expect(corps, `${fn} passe par l'autorité`).toMatch(/connexionTempsReelAutorisee\(\)/);
      expect(corps, `${fn} ne recopie pas la condition`)
        .not.toMatch(/RE_UID_COMPTE|\/\^u_\/|\.length === 36/);
    }
    // Les deux filets passent par la BORNE, qui porte elle-même le verdict.
    for (const [f, fn] of [
      ["js/app-08-ui-modals-tour.js", "function startFeedRefreshLoop()"],
      ["js/app-05-config-profil.js", "function _vliveFiletTour()"],
    ]) {
      expect(sansCommentaires(corpsDeFonction(lire(f), fn)), fn).toMatch(/filetEstLeSeulChemin\(\)/);
    }
  });

  test("⑦ l'autorité tranche sur la FORME de l'identifiant, dans les deux sens", async ({ page }) => {
    await bootOnboarded(page);
    const verdicts = await page.evaluate((ids) => {
      const out = {};
      for (const [nom, uid] of Object.entries(ids)) {
        MY_UID = uid; window.MY_UID = uid;
        out[nom] = connexionTempsReelAutorisee();
      }
      return out;
    }, { compte: UID_COMPTE, visiteur: UID_VISITEUR, vide: "" });
    expect(verdicts.compte).toBe(true);
    expect(verdicts.visiteur).toBe(false);
    // ⚠️ Pas d'identité = pas de connexion. Le sens sûr de l'échec est ici le
    // REFUS : rien à recevoir, et c'est la masse qu'on écarte.
    expect(verdicts.vide).toBe(false);
  });

  test("⑦ bis l'autorité échoue OUVERT, dans le même sens que ses appelants", async ({ page }) => {
    await bootOnboarded(page);
    // ⚠️ SES DEUX APPELANTS LA LISENT PAR `typeof … === "function" && !…()` :
    // autorité absente, la connexion s'ouvre. Un `catch` qui REFUSERAIT irait
    // donc dans le sens inverse du câblage et couperait le temps réel d'un vrai
    // compte pour une cause que personne ne pourrait nommer. On rend
    // `_uidEstUnCompte` levant pour mesurer ce chemin, qui est sinon une
    // impossibilité (elle porte déjà son propre `catch`).
    const r = await page.evaluate(() => {
      const vrai = window._uidEstUnCompte;
      try {
        _uidEstUnCompte = () => { throw new Error("banc"); };
        const avant = (window._diagLogs || []).length;
        const verdict = connexionTempsReelAutorisee();
        return { verdict, trace: (window._diagLogs || []).length > avant };
      } finally { _uidEstUnCompte = vrai; }
    });
    expect(r.verdict).toBe(true);
    // ⚠️ Et un refus muet serait indiscernable d'un calme : on TRACE.
    expect(r.trace).toBe(true);
  });
});
