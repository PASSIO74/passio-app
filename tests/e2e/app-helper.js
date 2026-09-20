// Helper partagé des tests E2E « in-app » (missions 2, 5, 6, 7).
// Entre dans l'app via un état local onboardé injecté dans localStorage —
// CI-safe (pas de compte Supabase créé) et rapide. Les fonctions de sync
// Supabase sont neutralisées après boot pour ne JAMAIS polluer la prod.
const fs = require("fs");
const path = require("path");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const PASSIONS = ["musique", "sport", "cuisine"];

// État d'un utilisateur onboardé avec `n` profils passion (1 par défaut).
function onboardedState(n = 1) {
  const profiles = [];
  for (let i = 0; i < n; i++) {
    profiles.push({
      id: "pp_" + i, name: "Audit QA", passion: PASSIONS[i % PASSIONS.length],
      emoji: "🎵", bio: "Profil de test " + i, color: "#7c3aed", createdAt: i + 1,
    });
  }
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Audit QA", birthYear: 1995, isMinor: false,
      currentProfileId: "pp_0", profiles,
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], savedCarnets: [], general: { username: "Audit QA" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all", selectedFeedPassions: [],
  };
}

// Démarre l'app dans l'état onboardé. `errors` (optionnel) = { js:[], console:[], network:[] }.
// `opts.query` (optionnel) = chaîne ajoutée à l'URL. Depuis le déploiement validé
// du 2026-08-26, UI-1 + UI-2 sont actives sur l'URL normale ; les tests de
// secours posent explicitement le kill switch avant le boot.
// `opts.state` (optionnel) = état local COMPLET à injecter à la place de
// `onboardedState(nProfiles)`. Ajouté pour les cas qui ont besoin d'un compte
// précis (une passion du référentiel plat, par exemple) : le recopier dans le
// test ferait diverger deux fixtures, le passer ici n'en garde qu'une.
async function bootOnboarded(page, errors, nProfiles = 1, opts = {}) {
  // ══════════════════════════════════════════════════════════════════════════
  // ISOLATION DES DONNÉES DISTANTES — PAR DÉFAUT, ET C'EST LE POINT
  // ──────────────────────────────────────────────────────────────────────────
  // Ce remède existait depuis le 2026-09-01 (sous le nom `sansPublicationsDistantes`,
  // quand il ne couvrait que `posts`), mais il fallait y
  // PENSER : 3 suites sur 91 l'appelaient. Les 88 autres laissaient les vraies
  // publications de production entrer dans leur fil, et leur verdict dépendait
  // donc du contenu de la base — d'où « des échecs qui frappent des PR au
  // hasard, sans rapport avec leur diff ». Le 2026-09-02, ce défaut a coûté une
  // mise en ligne : `pastille-mood.spec.js` a échoué sur `main` (run 2413), et
  // le job « Déploiement production », qui en dépend, a été SAUTÉ.
  //
  // ÉTENDU LE MÊME JOUR AUX TROIS AUTRES TABLES QUE LE DÉMARRAGE FAIT ENTRER
  // DANS L'ÉTAT DE DÉMONSTRATION, et deux le font plus brutalement que `posts` :
  //   · `stories`  → `state.seed.stories = s` : un REMPLACEMENT pur et simple ;
  //   · `events`   → fusionnés dans `state.seed.events`, avec un `renderIRL()`
  //                  immédiat si l'écran Rencontrer est déjà à l'écran ;
  //   · `notifications` → `mergeSupaNotifs`, qui ajoute des lignes à la cloche.
  // `event_attendees` n'a PAS besoin d'y figurer : `supaLoadEvents` ne
  // l'interroge que `if (rows.length)`, donc jamais quand `events` rend [].
  //
  // Un remède qu'il faut se rappeler d'appliquer n'est pas un remède. Il est
  // donc posé ICI, une fois, pour tout le monde — et il faut désormais une
  // DEMANDE EXPLICITE pour s'en passer.
  //
  // ⚠️ AVANT `addInitScript` ET `goto`, ET C'EST LA SEULE POSITION CORRECTE :
  // `bootOnboarded` fait lui-même la navigation, donc une route posée par
  // l'appelant APRÈS lui ne protège que les chargements suivants, jamais le
  // premier — celui qui rapporte la production.
  //
  // ⚠️ LA PORTÉE EST L'APPEL, PAS LE FICHIER. Une suite qui boote aussi par un
  // helper maison (son propre `goto`) garde ce chemin-là exposé : il doit poser
  // `sansDonneesDistantes` lui-même. C'est le cas de `bootLegacy`
  // (adr-009), `bootVierge` (feed-premier-rendu) et du `boot` d'aides-contextuelles,
  // tous trois corrigés le même jour.
  //
  // ⚠️ CE QUE CETTE ROUTE NE COUVRE PAS, et qu'il ne faut pas croire couvert :
  //   (le REALTIME, lui, EST couvert depuis le 2026-09-03 : `sansDonneesDistantes`
  //   intercepte aussi le WebSocket `realtime/v1/websocket`. Voir son commentaire.)
  //   · l'ÉTAT DÉJÀ PERSISTÉ. `_leanState` ne retire pas `supabasePosts` du blob
  //     `localStorage`, et l'`addInitScript` ci-dessous n'écrase PAS un état
  //     existant (c'est voulu, cf. plus bas). Un test qui naviguerait AVANT son
  //     `bootOnboarded` ferait donc entrer les vraies publications par le
  //     stockage, où aucune route ne peut plus rien. Aucun test ne le fait
  //     aujourd'hui ; la chausse-trappe est réelle.
  //   · la table `profiles`, LAISSÉE DEHORS EXPRÈS. `supaEnsureProfileExists`
  //     appelle `_insertProfilMinimalSiAbsent` : une lecture rendue vide lui
  //     ferait conclure « ce profil n'existe pas » et tenter une ÉCRITURE en
  //     production. Rendre un test déterministe ne vaut pas ce risque-là. Les
  //     lectures de `profiles` restent donc réelles (profil visité,
  //     `discoverPeople`) — exposition connue, et bien moindre : elles ne
  //     remplacent aucun contenu de démonstration.
  //
  // ⚠️ `opts.sansIsolationDesDonnees` est pour l'appelant qui gère le
  // réseau LUI-MÊME. Playwright évalue les routes dans l'ORDRE INVERSE de leur
  // enregistrement : sans cette porte, la route posée ici écraserait une
  // barrière plus stricte posée avant l'appel. Cas réel : `ui-v3-passerelle`
  // coupe TOUT `*.supabase.co` par `route.abort()` — sa requête `posts` serait
  // devenue un `fulfill []`, donc une simulation différente de celle qu'elle
  // mesure.
  if (!opts.sansIsolationDesDonnees) await sansDonneesDistantes(page, opts);

  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const txt = m.text();
      if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
      else errors.console.push(txt);
    });
  }
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Ne PAS écraser l'état s'il existe déjà : permet de tester la persistance
    // (un post créé puis un reload doit retrouver le post). addInitScript tourne
    // à chaque navigation, donc le garde est indispensable.
    if (!localStorage.getItem("passio_mvp_state_v1")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }
  }, [GATE_KEY, GATE_TOKEN, opts.state || onboardedState(nProfiles)]);
  await page.goto("/index.html" + (opts.query || ""));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500); // initApp (emoji-misc) + boot async
  // Fermer la landing (affichée sans session Supabase en test offline ; en prod
  // un utilisateur onboardé a une session anonyme persistante → pas de landing).
  // Et neutraliser les écritures Supabase pour garder la prod propre.
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    // Conservées AVANT neutralisation : une suite qui doit exercer les VRAIS
    // chemins d'écriture le fait contre un client Supabase factice (cf.
    // partage-bobine.spec.js, commentaires-bobine.spec.js). Sans cette copie,
    // la fonction d'origine est définitivement perdue pour la page.
    window.__vraiSupa = {
      publishPost: window.supaPublishPostWithRetry,
      addComment: window.supaAddComment,
      insertNotif: window.supaInsertNotif,
      upsertProfile: window.supaUpsertProfile,
    };
    window.__vraiSupaPublishPost = window.supaPublishPostWithRetry;
    window.supaPublishPostWithRetry = async () => false;
    // ⚠️ supaSetPostLike doit répondre { ok:true } : un like dont l'écriture
    // serveur n'est pas confirmée est désormais ANNULÉ à l'écran.
    window.supaSetPostLike = async () => ({ ok: true, error: null });
    window.supaAddComment = () => {};
    window.supaInsertNotif = () => {};
    window.supaUpsertProfile = async () => {};
  });
}

// ══════════════════════════════════════════════════════════════════════════
// LE FIL SANS LES PUBLICATIONS DE PRODUCTION
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ NEUTRALISER `window.supaLoadPosts` APRÈS LE BOOT ARRIVE TROP TARD, et c'est
// ce qui rendait `interactions` et `reel-deeplink` dépendantes de la production.
//
// `bootOnboarded` fait lui-même le `goto` : quand une suite pose son stub dans le
// `page.evaluate` qui suit, la requête du boot est DÉJÀ PARTIE. Le stub protège
// des chargements suivants, jamais du premier. En CI (avec réseau) ce premier
// chargement rapporte les vraies publications de `posts`.
//
// Conséquence mesurée le 2026-09-01 sur la PR #235 : `renderFeed` ne peint que
// `sortedPosts.slice(0, renderLimit)` avec `renderLimit = 20`, et le post semé
// par `seedServerPost` (`likes: 4`, auteur inconnu) DISPUTE SA PLACE aux vraies
// publications. Sonde lancée à l'identique sur `main` et sur une branche de
// feature, avec des publications simulées à `likes: 500+` :
//
//     34 posts → le post semé ranke 43e, non rendu   (les deux arbres)
//     60 posts → 69e, non rendu                       (les deux arbres)
//     publications à likes: 0 → rang 9, rendu         (les deux arbres)
//
// Le basculement dépend donc du CONTENU DE LA PRODUCTION, pas du code testé —
// d'où des échecs qui frappent des PR au hasard, sans rapport avec leur diff.
// Même maladie pour `reel-deeplink` : `buildReels` tronque à 30, et une bobine
// réelle pousse dehors la bobine de démonstration attendue.
//
// Le remède attaque la cause à la seule frontière que le code de l'application
// ne peut pas reprendre : le RÉSEAU, interdit avant même la navigation. Un stub
// posé sur `window` serait de toute façon écrasé par la déclaration
// `function supaLoadPosts` d'app-08 au chargement du script.
//
// ⚠️ SEULES LES LECTURES SONT COURT-CIRCUITÉES. Les écritures (POST, PATCH,
// DELETE) passent, pour qu'une suite qui exerce un vrai chemin de publication
// continue de le faire — d'où le test de méthode plutôt qu'un `abort()` global.
//
// ⚠️ LE MOTIF EXIGE LE `?` DE LA CHAÎNE DE REQUÊTE, ce qui le rend étroit par
// construction : `post_likes?`, `post_comments?`, `event_attendees?`,
// `event_reactions?` et `event_comments?` ne contiennent AUCUN des libellés
// ci-dessous suivi d'un `?`. Ajouter une table à `TABLES_DISTANTES` demande donc
// de vérifier qu'aucune autre table ne commence par son nom.
//
// ⚠️ Sans réseau (conteneur de dev sans accès à Supabase), cette route ne se
// déclenche jamais : le comportement local est INCHANGÉ. Le correctif ne peut
// donc rien casser là où il ne sert à rien — mais il ne peut pas non plus y être
// vérifié. C'est la CI qui en fait foi.
//
// ⚠️ `profiles` N'EST PAS DE LA LISTE, et c'est délibéré : une lecture rendue
// vide ferait conclure à `supaEnsureProfileExists` que le profil n'existe pas,
// et tenter une ÉCRITURE en production. Voir le bloc de `bootOnboarded`.
const TABLES_DISTANTES = ["posts", "stories", "events", "notifications"];
const MOTIF_TABLES_DISTANTES = new RegExp(
  "/rest/v1/(" + TABLES_DISTANTES.join("|") + ")\\?",
);

// ── LES MÉDIAS DE PRODUCTION, QUI COÛTAIENT LA BANDE PASSANTE DU PROJET ────
// Mesuré le 2026-09-10 sur le tableau de bord Supabase : 1,12 Go d'egress en
// 24 h pour un plan qui en offre 10 Go par MOIS — dont 1,06 Go pour un SEUL
// fichier, un avatar de 2,59 Mo demandé 399 fois. Le demandeur n'était pas un
// utilisateur : c'était cette suite de tests.
//
// ⚠️ LE CHEMIN EST INDIRECT, ET C'EST POUR ÇA QU'IL A TENU SI LONGTEMPS.
// `profiles` n'est délibérément PAS dans TABLES_DISTANTES (une lecture rendue
// vide ferait conclure à `supaEnsureProfileExists` que le profil n'existe pas,
// et tenter une ÉCRITURE en production). Les profils réels remontent donc, avec
// leurs URLs d'avatar réelles, et le NAVIGATEUR les télécharge — une fois par
// `page.goto`, six shards en parallèle, plus d'une centaine de suites. Aucune
// de ces images n'est jamais regardée par un test.
//
// ⚠️ ON RÉPOND UNE IMAGE VALIDE, ON N'ABORTE PAS. Le produit porte des
// `onerror` qui repeignent la boîte en gris et lui imposent une hauteur
// minimale (`renderPostHTML`) : abandonner la requête ferait donc BOUGER la
// mise en page, et une suite qui mesure un cadrage rougirait pour une raison
// qui n'a rien à voir avec elle. Un PNG 1×1 transparent laisse le chemin « image
// chargée » exactement tel qu'il est. Ce qui n'est pas une image (vidéos de
// 30 Mo, pièces jointes) est abandonné : aucune suite n'en lit le contenu.
//
// ⚠️ CETTE ROUTE NE CHANGE RIEN À LA PRODUCTION — c'est du code de test. Elle ne
// dispense pas de réduire le poids des avatars servis aux VRAIS utilisateurs,
// qui est un autre sujet et un autre lot.
const MOTIF_MEDIAS_DISTANTS = /\/storage\/v1\/(object|render\/image)\/|\/media\/(content|attachments)\//;
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

// ── LE RÉFÉRENTIEL DES PASSIONS, QUE LA CI TÉLÉCHARGEAIT 4 300 FOIS PAR RUN ──
// Mesuré le 2026-09-20 (canal ① d'ADR-012, `extensions.pg_stat_statements`,
// cumul sur 129 jours) : `select id from passions where status = 'active'` est
// la TROISIÈME requête de toute la base — 2 900 511 appels, 4 368 s de CPU,
// 5,92 % du total. Pour DIX comptes réels.
//
// ⚠️ LE DEMANDEUR N'EST PAS UN UTILISATEUR, C'EST CETTE SUITE — et le calcul le
// dit sans ambiguïté. `chargerReferentielPassions` (app-02) pagine par 1 000 :
// 5 001 passions actives = SIX requêtes par démarrage de page. La suite compte
// 716 démarrages ; un run complet vaut donc ~4 300 appels, et 2 900 511 / 4 296
// ≈ 675 runs. Le contre-témoin confirme le modèle : la variante SANS le filtre
// `status` — le client d'avant le 2026-09-09 — porte 141 520 appels, soit ~33
// runs, très exactement la fenêtre où ce client a vécu.
// C'est la famille de l'avatar de 2,59 Mo demandé 399 fois (2026-09-10) : un
// coût de production payé par les tests, par un chemin que personne ne regarde.
// S'y ajoutent ~140 ko d'identifiants par démarrage, soit ~100 Mo d'egress par
// run complet — que nul test ne lit jamais.
//
// ⚠️ ON NE RÉPOND PAS `[]`, ET C'EST TOUT L'OBJET DU CHOIX. Une réponse vide
// laisserait `_referentielPassions` à `null`, donc `estPassionCanonique` au
// PLANCHER des 19 passions du socle : une suite qui publie sous une passion du
// référentiel deviendrait rouge pour une raison étrangère à son sujet, et —
// pire — une suite qui passerait quand même cesserait d'exercer la liste
// blanche sans que rien ne le dise. On sert donc `data/passions-v1.json`, qui
// n'est pas une imitation : c'est le MIROIR GÉNÉRÉ de cette table (même source
// `data/passions/*.js` que `migration_passions_plat.sql`, égalité tenue par la
// gate `npm run passions:verifier`). Contenu identique, zéro octet de prod.
//
// ⚠️ DIVERGENCE CONNUE ET ASSUMÉE : les passions créées depuis l'application
// (`source = 'user_suggested'`, 6 en production) vivent en base et PAS dans le
// miroir. Aucun test ne peut donc s'appuyer sur elles — ce qui est la bonne
// règle de toute façon : un banc qui dépend d'une ligne que seul le serveur
// porte dépend d'un état que personne ne contrôle (la leçon « sculpture sur
// glace », et celle de `user-passions-miroir`).
//
// ⚠️ LE `status=eq.active` EST IGNORÉ À DESSEIN : le miroir ne contient QUE des
// passions actives, par construction. Le filtrer serait une boucle sur un
// prédicat toujours vrai, et laisserait croire qu'on sait rendre l'archivage —
// ce qui est faux, et c'est écrit ici plutôt que deviné plus tard.
//
// ⚠️ DEUX FORMES DE REQUÊTE, PAS UNE. Outre le chargeur paginé, `passions-flat.js`
// demande `select=id,label,emoji,color&id=in.(…)` pour nommer un identifiant que
// le socle ne connaît pas. N'en servir qu'une laisserait l'autre partir en
// production — un correctif qui ne corrige qu'une surface.
const MOTIF_PASSIONS_DISTANTES = /\/rest\/v1\/passions\?/;
const CHEMIN_MIROIR_PASSIONS = path.join(__dirname, "..", "..", "data", "passions-v1.json");
let _miroirPassions = null;
let _miroirPassionsDit = false;

function miroirPassions() {
  if (_miroirPassions) return _miroirPassions;
  const j = JSON.parse(fs.readFileSync(CHEMIN_MIROIR_PASSIONS, "utf8"));
  // Les colonnes se lisent par `champs`, jamais par un indice en dur : le
  // générateur peut en ajouter une, et un `p[1]` deviendrait faux en silence.
  const c = {};
  j.champs.forEach((nom, k) => { c[nom] = k; });
  _miroirPassions = j.passions.map((p) => ({
    id: p[c.id], label: p[c.label], emoji: p[c.emoji], color: p[c.color],
  }));
  return _miroirPassions;
}

function servirPassions(route) {
  const req = route.request();
  // Les ÉCRITURES passent, comme pour les tables et les médias.
  if (req.method() !== "GET") return route.continue();

  let lignes;
  try {
    lignes = miroirPassions();
  } catch (e) {
    // Miroir illisible : on rend la main à la production — le comportement
    // d'avant ce correctif. Mais JAMAIS en silence : un repli muet ici se
    // lirait comme « la CI ne coûte plus rien », qui serait faux.
    if (!_miroirPassionsDit) {
      _miroirPassionsDit = true;
      console.warn("[app-helper] miroir des passions illisible (" + (e && e.message) +
                   ") — les tests repartent sur la production");
    }
    return route.continue();
  }

  const params = new URL(req.url()).searchParams;

  const filtreId = params.get("id") || "";
  if (filtreId.startsWith("in.")) {
    const voulus = new Set(
      filtreId.slice(3).replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")),
    );
    lignes = lignes.filter((p) => voulus.has(p.id));
  }

  const colonnes = (params.get("select") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (colonnes.length && !colonnes.includes("*")) {
    lignes = lignes.map((p) => {
      const o = {};
      colonnes.forEach((k) => { if (k in p) o[k] = p[k]; });
      return o;
    });
  }

  // ── LA PAGINATION, ET ELLE NE PASSE PAS PAR OÙ L'ON CROIT ────────────────
  // ⚠️ `postgrest-js` 2.116 TRADUIT `.range(a, b)` EN PARAMÈTRES D'URL
  //   (`offset=a&limit=b-a+1`), PAS EN EN-TÊTE `Range` — lu dans
  //   `js/vendor/supabase-js-2.116.0.js`, et confirmé par le SQL enregistré en
  //   production (`LIMIT $1 OFFSET $2`).
  //   La première version de cette route ne lisait que l'en-tête : elle rendait
  //   donc les 5 001 lignes À CHAQUE page. Le chargeur redemande tant qu'une
  //   page revient PLEINE, il partait donc pour ses 40 pages (`PAGES_MAX`),
  //   journalisait « référentiel TRONQUÉ » et ne passait JAMAIS `complet` —
  //   c'est-à-dire qu'il rechargeait à chaque appel. Un correctif de charge qui
  //   MULTIPLIAIT la charge par sept.
  // ⚠️ ET HUIT VERROUS ÉTAIENT VERTS DESSUS : ils interrogeaient cette route
  //   avec leur propre `fetch`, jamais avec le client. Un banc qui mesure le
  //   faux serveur ne mesure pas le produit — c'est le cas ⑨ qui l'a trouvé.
  // L'en-tête reste honoré : le vrai PostgREST accepte les deux, et un appelant
  // futur pourrait l'employer.
  const params_offset = Number(params.get("offset"));
  const params_limit = Number(params.get("limit"));
  const plage = /^(\d+)-(\d+)$/.exec(req.headers()["range"] || "");
  const total = lignes.length;
  let debut = 0, fin = total - 1, partielle = false;
  if (Number.isFinite(params_limit) && params.get("limit") !== null) {
    debut = Number.isFinite(params_offset) && params.get("offset") !== null ? params_offset : 0;
    fin = Math.min(debut + params_limit - 1, total - 1);
    lignes = lignes.slice(debut, fin + 1);
  } else if (plage) {
    debut = Number(plage[1]);
    fin = Math.min(Number(plage[2]), total - 1);
    lignes = lignes.slice(debut, fin + 1);
    partielle = true;                        // PostgREST rend 206 sur un en-tête Range
  }
  return route.fulfill({
    status: partielle ? 206 : 200,
    contentType: "application/json",
    headers: {
      "content-range": debut + "-" + Math.max(debut, fin) + "/" + total,
      // ⚠️ `Content-Range` N'EST PAS UN EN-TÊTE EXPOSÉ PAR DÉFAUT. Le vrai
      // PostgREST l'expose nommément ; sans cette ligne, un appelant d'une
      // AUTRE origine lit `null` alors que le corps, lui, est bien arrivé — et
      // c'est tout `count` / `range` du SDK qui devient muet, sans erreur. Un
      // faux serveur qui omet ce que le vrai déclare ne mesure pas le vrai.
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-range",
    },
    body: JSON.stringify(lignes),
  });
}

async function sansDonneesDistantes(page, opts = {}) {
  await page.route(MOTIF_TABLES_DISTANTES, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // ⚠️ `sansMiroirPassions` — UNE ÉCHAPPATOIRE ÉTROITE, ET IL EN FALLAIT UNE.
  // Playwright donne la priorité à la route enregistrée en DERNIER : une suite
  // qui pose sa propre route sur `passions` AVANT `bootOnboarded` (parce que
  // c'est le chargement du BOOT qu'elle veut contrôler — `creation-passion` ⑬
  // exige un cache vide pour que son appel explicite atteigne vraiment le
  // client) se faisait donc écraser par celle-ci, en silence, et mesurait le
  // contraire de son sujet.
  // On ne lui fait PAS poser `sansIsolationDesDonnees` : ce serait rendre à la
  // production ses posts, ses stories, ses médias et son canal temps réel pour
  // un besoin qui ne porte que sur une table. Une échappatoire large est une
  // isolation qu'on retire par mégarde.
  if (!opts.sansMiroirPassions) await page.route(MOTIF_PASSIONS_DISTANTES, servirPassions);

  await page.route(MOTIF_MEDIAS_DISTANTS, (route) => {
    // Les ÉCRITURES passent, comme pour les tables : une suite qui exerce un
    // vrai dépôt de fichier doit continuer de le faire.
    if (route.request().method() !== "GET") return route.continue();
    if (route.request().resourceType() !== "image") return route.abort();
    return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
  });

  // ── LE CANAL TEMPS RÉEL, QUE LA ROUTE REST NE POUVAIT PAS ATTEINDRE ────────
  // `app-08` ouvre un canal `realtime:db` et s'y abonne aux `postgres_changes`
  // INSERT sur `posts` : toute publication d'un AUTRE auteur y est injectée dans
  // le fil par `feedAddRealtimePost`, puis `scheduleFeedRender()`. C'est du
  // WebSocket, donc `page.route` — qui ne voit que HTTP — le laissait passer :
  // une vraie publication tombant pendant la fenêtre d'un test s'invitait dans
  // `#feedList` malgré toute l'isolation REST.
  //
  // On intercepte sans jamais appeler `ws.connectToServer()` : la page croit
  // parler à un serveur, aucun octet de production n'arrive.
  //
  // ⚠️ AUCUNE SUITE NE PERD RIEN. Les cinq qui exercent le temps réel appellent
  // `feedAddRealtimePost({...})` DIRECTEMENT en JS (feed-realtime-course,
  // feed-window, interactions, suppression-durable, qa-campaign) — aucune
  // n'attend un message venu du vrai canal. Et `dbChan.subscribe()` est appelé
  // SANS callback de statut : l'application ne journalise donc rien quand
  // l'abonnement n'aboutit pas, il n'y a pas de bruit console à craindre.
  //
  // ⚠️ Ce canal porte AUSSI les messages et les accusés de lecture. Le couper
  // en test ne retire rien qu'une suite locale observe (elles simulent toutes
  // par appel direct), mais une future suite qui voudrait exercer le VRAI canal
  // devra passer `opts.sansIsolationDesDonnees`.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
}

module.exports = { onboardedState, bootOnboarded, sansDonneesDistantes, miroirPassions, PASSIONS };
