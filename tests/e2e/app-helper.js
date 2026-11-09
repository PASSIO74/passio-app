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
  //   · la table `profiles`, LAISSÉE DEHORS EXPRÈS de la route de PAGE.
  //     `supaEnsureProfileExists` appelle `_insertProfilMinimalSiAbsent` : une
  //     lecture rendue vide lui ferait conclure « ce profil n'existe pas » et
  //     tenter une ÉCRITURE en production. Rendre un test déterministe ne valait
  //     pas ce risque-là.
  //     ⚠️ DEPUIS LE 2026-11-09, LE RISQUE N'EXISTE PLUS POUR UNE SUITE LOCALE :
  //     le projet vide du CONTEXTE (`projetSupabaseVide`, plus bas) répond à
  //     `profiles` en lecture (`[]`) ET en écriture (refus de la RLS, comme la
  //     production refusait déjà ces 1 101 insertions quotidiennes sans
  //     session). Rien ne part plus. Seul le projet `prod`, qui en est exempt,
  //     lit encore les vrais profils — c'est son objet.
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
// ⚠️ SEULES LES LECTURES SONT COURT-CIRCUITÉES ICI. Les écritures (POST, PATCH,
// DELETE) passent, pour qu'une suite qui exerce un vrai chemin de publication
// continue de le faire — d'où le test de méthode plutôt qu'un `abort()` global.
// Depuis le 2026-11-09 elles « passent » par `route.fallback()` : jusqu'au projet
// vide du contexte pour une suite locale (jugées, jamais envoyées), jusqu'au
// réseau pour le projet `prod`.
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
// et tenter une ÉCRITURE en production. Voir le bloc de `bootOnboarded` — et
// `projetSupabaseVide` plus bas, qui la couvre désormais pour les suites
// locales, écriture comprise.
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
// ⚠️ LE DEMANDEUR N'EST PAS UN UTILISATEUR, C'EST CETTE SUITE — et le calcul se
// prend SANS compter les tests. `chargerReferentielPassions` (app-02) pagine par
// 1 000 : 5 001 passions actives = SIX requêtes par démarrage de page. Donc
// 2 900 511 / 6 ≈ 483 000 démarrages, soit ~3 750 PAR JOUR sur 129 jours — pour
// DIX comptes en production. Le contre-témoin confirme par un calcul distinct :
// la variante SANS le filtre `status` (le client d'avant le 2026-09-09, vivant
// ~11 jours) porte 141 520 appels, soit ~2 100 démarrages/jour, même ordre de
// grandeur. Compter les boots de la suite ne sert que de corroboration, et
// SOUS-ESTIME (un boot en `beforeEach` sert autant de cas que le fichier en
// porte) : ne pas rebâtir le constat dessus.
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
  // Les ÉCRITURES passent, comme pour les tables et les médias (`fallback` :
  // vers le projet vide du contexte pour une suite locale).
  if (req.method() !== "GET") return route.fallback();

  let lignes;
  try {
    lignes = miroirPassions();
  } catch (e) {
    // Miroir illisible : on rend la main à la production — le comportement
    // d'avant ce correctif. ⚠️ CE QUI REND CE REPLI NON SILENCIEUX N'EST PAS CE
    // `console.warn` : borné à une ligne par worker, il se noierait dans ~1 700
    // cas. C'est le cas ⑧ de `isolation-referentiel-passions.spec.js`, qui lit
    // le miroir SANS filet et lève donc si le fichier est illisible. Le warn
    // sert à nommer la cause quand on regarde, pas à donner l'alerte.
    // ⚠️ DEPUIS LE 2026-11-09, `fallback` : une suite LOCALE retombe sur le
    // projet vide (référentiel vide, donc plancher du socle — rouge au cas ⑧),
    // plus jamais sur la production ; seul le projet `prod` repart au réseau.
    if (!_miroirPassionsDit) {
      _miroirPassionsDit = true;
      console.warn("[app-helper] miroir des passions illisible (" + (e && e.message) +
                   ") — repli sur la route suivante (projet vide en local)");
    }
    return route.fallback();
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
    partielle = true;
    // ⚠️ APPROXIMATION ASSUMÉE : le vrai PostgREST rend 206 pour TOUTE réponse
    // partielle, `limit`/`offset` compris — pas seulement sur un en-tête Range.
    // On ne l'imite que sur le Range parce que supabase-js accepte tout 2xx et
    // qu'aligner le reste demanderait de savoir si la page est la dernière.
    // C'est une divergence de plus entre ce faux serveur et le vrai : elle est
    // écrite ici plutôt que découverte par quelqu'un qui compterait dessus.
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

// ══════════════════════════════════════════════════════════════════════════
// LE PROJET SUPABASE TOUT ENTIER — UN PROJET VIDE, AU NIVEAU DU CONTEXTE
// (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// CE QUE ÇA COÛTAIT. Mesuré le 2026-11-09 dans les journaux de la passerelle
// Supabase (`edge_logs`, du 08/11 12:00 au 09/11 12:00 UTC) : sur 54 563
// requêtes reçues par la production, 37 159 — 68 % — venaient du réseau des
// runners GitHub (Azure). La CI. Les routes de ce fichier ne couvraient que
// quatre tables, le référentiel et les médias ; tout le reste partait en
// production : l'annuaire des lives (`video_lives`, 7 873 — un balayage au
// démarrage puis chaque minute), les compteurs d'abonnés (`follows` en HEAD,
// 6 505), le référentiel des suites qui ne passent pas par ce fichier (6 182
// avec les pré-requêtes CORS), les profils (2 758), la messagerie (`conv_*`,
// 3 619), l'état de compte (`user_state`, 2 945 — dont 1 112 ÉCRITURES
// refusées en 401)… Le même projet, la même sortie (250 Go), le même plafond
// de connexions que les vrais utilisateurs.
//
// ⚠️ CES LECTURES NE SERVAIENT AUCUN TEST. Une suite locale n'a pas de vraie
// session (pas de jeton, ou un jeton FICTIF que la production rejette en 401)
// et ses identifiants (`u_lea`, `conv_lea`, des UUID inventés) n'existent pas en
// base : la production lui rendait donc des listes VIDES, en payant la sortie et
// la CPU de ses vrais utilisateurs. Et ce qui ne revenait pas vide — les douze
// profils de `discoverPeople`, un live en cours — faisait dépendre le verdict du
// CONTENU de la base : la maladie que ce fichier soigne depuis le 2026-09-01.
//
// LE REMÈDE. Un dernier recours qui répond À LA PLACE du projet ce qu'un projet
// VIDE répondrait à un visiteur SANS session — c'est-à-dire, pour ces suites, ce
// que la production répondait déjà, au contenu près :
//   · lire une table → `[]` (HEAD : compte 0) ; `.single()` → 406 PGRST116 ;
//     une table que le rôle `anon` ne peut pas lire → 401 42501 ;
//   · insérer → refus de la RLS (401 42501), sauf `client_errors` et
//     `telemetry_events` sans compte, que la production accepte d'un visiteur ;
//     modifier / supprimer → zéro ligne touchée (ou 401 sans le privilège) ;
//   · une RPC → `[]` pour les deux seules qu'`anon` peut exécuter, 401 sinon ;
//   · un jeton d'utilisateur (forcément fictif ici) → 401 PGRST301 sur tout le
//     REST, 403 `bad_jwt` sur `/auth/v1/user` : ce que la production répond à un
//     jeton qu'elle ne sait pas vérifier ;
//   · inscription, connexion, courriel → refusés : RIEN, depuis une suite locale,
//     ne crée un compte (MAU) ni n'envoie un message.
//
// ⚠️ AU NIVEAU DU CONTEXTE, ET C'EST TOUT LE CHOIX. Playwright consulte les
// routes de la PAGE avant celles du CONTEXTE, quel que soit l'ordre
// d'enregistrement : toute route posée par une suite — avant comme après
// `bootOnboarded` — garde la main, et ce recours ne répond qu'à ce que personne
// n'a servi. Une route de PAGE aurait au contraire écrasé celles qu'une suite
// pose avant `bootOnboarded` (le piège de `sansMiroirPassions`, plus bas).
// ⚠️ D'OÙ `route.fallback()`, ET PLUS `route.continue()`, DANS LES ROUTES DE
// `sansDonneesDistantes` : `continue` envoie au RÉSEAU en sautant le contexte —
// une écriture aurait filé en production sous ce filet.
//
// ⚠️ LE PROJET `prod` EN EST EXEMPT, et c'est sa définition : ses suites créent
// de VRAIS comptes et mesurent la VRAIE RLS (`irl-trust-safety-reel` passe par
// `sansDonneesDistantes` et a besoin de ses RPC réelles). Une suite LOCALE dont
// le SUJET est le contrat d'un chemin avec le vrai serveur le désigne, et lui
// seul, par `opts.cheminsReels` ; `opts.sansProjetVide` rend tout le projet.
// L'une ou l'autre s'inscrit au socle (`scripts/tests-isolation-socle.json`)
// avec sa raison — le banc `tests/unit/isolation-projet-supabase.test.mjs`
// l'exige.
//
// ⚠️ CE QUE CE PROJET VIDE NE SAIT PAS FAIRE, et qu'il ne faut pas lui prêter :
// la RLS réelle (il ne sert JAMAIS une ligne), les privilèges à jour (le relevé
// ci-dessous est daté), le temps réel (le canal est seulement avalé, comme dans
// `sansDonneesDistantes`). Une suite qui a besoin de lignes les sert elle-même
// par une route de page, ou par `audit-2026-11-parcours-faux-serveur.js`.
// Verrou : `tests/e2e/isolation-projet-supabase.spec.js`.
const MOTIF_PROJET_SUPABASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co\//;
const MOTIF_CANAL_TEMPS_REEL = /\/realtime\/v1\/websocket/;

// Privilèges du rôle `anon` EN PRODUCTION, relevés le 2026-11-09 (canal ①
// d'ADR-012, lecture seule) par `has_table_privilege('anon', …)`,
// `has_any_column_privilege('anon', …)` et `has_function_privilege('anon', …)`
// sur le schéma `public`, puis `pg_policies` pour les insertions sans compte.
// ⚠️ C'EST UN RELEVÉ, PAS UNE SOURCE : une migration qui change un GRANT ne le
// met pas à jour. Une table absente d'ici est traitée comme la majorité —
// lisible sous RLS, donc VIDE pour un visiteur sans session, ce qui reste le
// cas le plus fréquent et le moins surprenant.
const ANON_SANS_LECTURE = new Set([
  "access_policies", "activite_jour", "call_invites", "cdv_live_collaborators", "cdv_live_comments",
  "cdv_live_followers", "cdv_live_reactions", "cdv_live_steps", "cdv_lives", "comptes_en_suppression",
  "contenus_masques", "croissance_jour", "debit_ecritures", "event_attendees", "event_checkin_secrets",
  "migrations_appliquees", "moderation_actions", "pointage_essais", "signalements_preuves",
  "step_interactions", "telemetrie_debit", "user_safety",
]);
// Lisibles COLONNE PAR COLONNE seulement : `select=*` est refusé en entier
// (PostgREST lève 42501 dès qu'UNE colonne manque au rôle — `_EVENT_COLS_PUBLIC`).
const ANON_LECTURE_PAR_COLONNE = new Set(["events", "reglages_distants"]);
const ANON_SANS_INSERTION = new Set([
  ...ANON_SANS_LECTURE, ...ANON_LECTURE_PAR_COLONNE,
  "conv_members", "conv_messages", "conversations", "notifications",
]);
const ANON_SANS_MODIFICATION = new Set([...ANON_SANS_LECTURE, "notifications", "reglages_distants"]);
// Les deux seules tables qu'un visiteur ALIMENTE : leur policy d'insertion ne
// demande pas `auth.uid()` (`client_errors` : `true` ; `telemetry_events` :
// `user_id IS NULL`). Accepter ici, c'est ne rien écrire — mais répondre ce que
// la production répond, pour que la file de télémétrie se vide comme en vrai.
const ANON_INSERTION_ACCEPTEE = {
  client_errors: () => true,
  telemetry_events: (ligne) => !ligne || ligne.user_id == null,
};
// Les deux seules RPC exécutables par `anon` ; toutes deux rendent des LIGNES.
const ANON_RPC_EXECUTABLES = new Set(["fil_compteurs", "rechercher_passions"]);

const ENTETES_PROJET_VIDE = {
  "access-control-allow-origin": "*",
  // ⚠️ Comme pour le miroir des passions : sans cette liste, un appelant d'une
  // autre origine lit `content-range` à `null` et tout `count` du SDK se tait.
  "access-control-expose-headers": "content-range, range-unit, content-location, location, preference-applied",
};

function repondreJson(route, status, corps, entetes) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers: { ...ENTETES_PROJET_VIDE, ...(entetes || {}) },
    body: corps === undefined ? "" : JSON.stringify(corps),
  });
}
function repondreSansCorps(route, status, entetes) {
  return route.fulfill({ status, headers: { ...ENTETES_PROJET_VIDE, ...(entetes || {}) }, body: "" });
}
function refusPrivilege(route, message) {
  // PostgREST rend 42501 en 401 pour le rôle anonyme, en 403 pour un connecté.
  return repondreJson(route, 401, { code: "42501", details: null, hint: null, message });
}
const ZERO_LIGNE = { code: "PGRST116", details: "The result contains 0 rows", hint: null, message: "Cannot coerce the result to a single JSON object" };

function repondreRestVide(route, req, url, jetonFictif) {
  // Un jeton d'utilisateur, dans une suite LOCALE, ne peut être que fictif :
  // aucune n'obtient de vraie session (le projet vide refuse toute connexion).
  if (jetonFictif) return repondreJson(route, 401, { code: "PGRST301", details: null, hint: null, message: "JWSError JWSInvalidSignature" });
  const m = req.method();
  const h = req.headers();
  const segments = url.pathname.slice("/rest/v1/".length).split("/");
  if (segments[0] === "rpc") {
    const fn = segments[1] || "";
    if (!ANON_RPC_EXECUTABLES.has(fn)) return refusPrivilege(route, "permission denied for function " + fn);
    return repondreJson(route, 200, []);
  }
  const table = segments[0];
  if (!table) return repondreJson(route, 200, {});
  const objet = /vnd\.pgrst\.object/.test(h.accept || "");
  const representation = /return=representation/.test(h.prefer || "");
  if (m === "GET" || m === "HEAD") {
    const select = url.searchParams.get("select");
    const toutesColonnes = !select || select.split(",").some((c) => c.trim() === "*");
    if (ANON_SANS_LECTURE.has(table) || (ANON_LECTURE_PAR_COLONNE.has(table) && toutesColonnes)) {
      return refusPrivilege(route, "permission denied for table " + table);
    }
    if (objet) return repondreJson(route, 406, ZERO_LIGNE);
    if (m === "HEAD") return repondreSansCorps(route, 200, { "content-range": "*/0" });
    return repondreJson(route, 200, [], { "content-range": "*/0" });
  }
  if (m === "POST" || m === "PUT") {
    if (ANON_SANS_INSERTION.has(table)) return refusPrivilege(route, "permission denied for table " + table);
    let corps = null;
    try { corps = JSON.parse(req.postData() || "null"); } catch (e) {}
    const lignes = Array.isArray(corps) ? corps : [corps];
    const accepte = ANON_INSERTION_ACCEPTEE[table];
    if (accepte && lignes.every(accepte)) {
      if (!representation) return repondreSansCorps(route, 201);
      return repondreJson(route, 201, objet ? lignes[0] : lignes);
    }
    return refusPrivilege(route, 'new row violates row-level security policy for table "' + table + '"');
  }
  if (m === "PATCH" || m === "DELETE") {
    if (ANON_SANS_MODIFICATION.has(table)) return refusPrivilege(route, "permission denied for table " + table);
    if (objet) return repondreJson(route, 406, ZERO_LIGNE);
    // La RLS filtre : la requête réussit et ne touche AUCUNE ligne.
    if (representation) return repondreJson(route, 200, [], { "content-range": "*/0" });
    return repondreSansCorps(route, 204, { "content-range": "*/0" });
  }
  return repondreJson(route, 405, { code: "PGRST117", details: null, hint: null, message: "Unsupported HTTP method: " + m });
}

function repondreAuthVide(route, req, url) {
  const p = url.pathname.slice("/auth/v1/".length);
  const m = req.method();
  if (p === "user" && m === "GET") {
    return repondreJson(route, 403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature, token signature is invalid" });
  }
  if (p === "token") {
    if (url.searchParams.get("grant_type") === "refresh_token") {
      return repondreJson(route, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
    }
    return repondreJson(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (p === "logout") return repondreSansCorps(route, 204);
  if (p === "settings" || p === "health") return repondreJson(route, 200, {});
  // Inscription, lien magique, code, renvoi, récupération, OAuth, facteurs… :
  // en production, chacun CRÉE un compte ou ENVOIE un courriel. Jamais d'ici.
  return repondreJson(route, 422, { code: 422, error_code: "banc_projet_vide", msg: "Projet vide du banc local : ni inscription, ni connexion, ni courriel." });
}

function repondreStorageVide(route, req) {
  const m = req.method();
  if (m === "GET" || m === "HEAD") {
    // Même règle que la route des médias : une image valide (la mise en page
    // reste celle d'une image chargée), rien pour le reste.
    if (req.resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
    return repondreJson(route, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
  }
  return repondreJson(route, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
}

function repondreProjetVide(route) {
  const req = route.request();
  let url;
  try { url = new URL(req.url()); } catch (e) { return route.abort(); }
  const h = req.headers();
  if (req.method() === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        ...ENTETES_PROJET_VIDE,
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
        "access-control-allow-headers": h["access-control-request-headers"] || "*",
        "access-control-max-age": "600",
      },
      body: "",
    });
  }
  const jeton = String(h.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const jetonFictif = !!jeton && jeton !== String(h.apikey || "").trim();
  const p = url.pathname;
  // ⚠️ LE RÉFÉRENTIEL DES PASSIONS : LE MIROIR, PAS `[]`. Une suite qui ne pose
  // que ce projet vide (sans la route de page de `sansDonneesDistantes`) lisait
  // le VRAI référentiel avant ce lot ; lui rendre une table vide la ferait
  // tomber au plancher des 19 passions du socle — exactement ce que
  // `servirPassions` refuse de faire, pour les raisons écrites plus haut.
  if (req.method() === "GET" && MOTIF_PASSIONS_DISTANTES.test(req.url())) {
    let miroir = null;
    try { miroir = miroirPassions(); } catch (e) {}
    if (miroir) return servirPassions(route);
  }
  if (p.startsWith("/rest/v1/")) return repondreRestVide(route, req, url, jetonFictif);
  if (p.startsWith("/auth/v1/")) return repondreAuthVide(route, req, url);
  if (p.startsWith("/storage/v1/")) return repondreStorageVide(route, req);
  if (p.startsWith("/functions/v1/")) {
    return repondreJson(route, 401, jetonFictif ? { code: 401, message: "Invalid JWT" } : { error: "Non authentifié" });
  }
  // Diffusion REST du temps réel (`/realtime/v1/api/broadcast`) : acceptée et
  // jetée, comme le canal lui-même est avalé.
  if (p.startsWith("/realtime/v1/")) return repondreSansCorps(route, 202);
  return repondreJson(route, 404, { message: "no Route matched with those values" });
}

function projetPlaywright() {
  try { return require("@playwright/test").test.info().project.name; } catch (e) { return null; }
}

const _contextesProjetVide = new WeakSet();

/**
 * Pose le projet Supabase VIDE sur le CONTEXTE de la page (voir le bloc
 * ci-dessus). Idempotent par contexte (le premier appel fixe les options).
 * Rend `true` si le filet est posé, `false` pour le projet `prod` ou sur
 * `opts.sansProjetVide`.
 * `opts.cheminsReels` (tableau de RegExp sur l'URL) : les SEULES requêtes
 * laissées au vrai projet — le contrat d'un chemin avec le VRAI serveur, quand
 * il est le sujet du test. Tout le reste reste vide. Comme `sansProjetVide`,
 * une suite qui s'en sert figure au socle avec sa raison.
 * ⚠️ À appeler AVANT la première navigation, comme `sansDonneesDistantes` (qui
 * l'appelle elle-même) : une requête partie avant la route est partie.
 */
async function projetSupabaseVide(page, opts = {}) {
  if (opts.sansProjetVide || opts.sansIsolationDesDonnees) return false;
  if (projetPlaywright() === "prod") return false;
  const ctx = page.context();
  if (_contextesProjetVide.has(ctx)) return true;
  _contextesProjetVide.add(ctx);
  const reels = Array.isArray(opts.cheminsReels) ? opts.cheminsReels.filter((m) => m instanceof RegExp) : [];
  await ctx.route(MOTIF_PROJET_SUPABASE, (route) => {
    if (reels.length && reels.some((m) => m.test(route.request().url()))) return route.continue();
    return repondreProjetVide(route);
  });
  // Le canal temps réel, au même niveau : une page qui n'a pas sa propre route
  // de WebSocket (celle de `sansDonneesDistantes` est une route de PAGE, donc
  // prioritaire) ne se connecte pas non plus au vrai projet.
  await ctx.routeWebSocket(MOTIF_CANAL_TEMPS_REEL, () => {});
  return true;
}

async function sansDonneesDistantes(page, opts = {}) {
  await projetSupabaseVide(page, opts);

  await page.route(MOTIF_TABLES_DISTANTES, (route) => {
    // ⚠️ `fallback`, pas `continue` : l'écriture doit rejoindre les routes
    // d'avant puis le projet vide du CONTEXTE, pas le réseau (voir plus haut).
    if (route.request().method() !== "GET") return route.fallback();
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
    // vrai dépôt de fichier doit continuer de le faire — jusqu'au projet vide
    // du contexte pour une suite locale, jusqu'au réseau pour le projet `prod`.
    if (route.request().method() !== "GET") return route.fallback();
    if (route.request().resourceType() !== "image") return route.abort();
    return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
  });

  // ── LE CANAL TEMPS RÉEL, QUE LA ROUTE REST NE POUVAIT PAS ATTEINDRE ────────
  // `app-08` ouvre des canaux temps réel (`user:<moi>` et les sujets `fil:<id>`
  // des discussions à l'écran ; `realtime:db` et ses liaisons sont partis avec la
  // migration « 📴 » du 2026-11-09) ; jusqu'à ce jour-là, une
  // publication d'un AUTRE auteur y arrivait aussi et s'injectait dans le fil
  // (`feedAddRealtimePost`). C'est du WebSocket, donc `page.route` — qui ne voit
  // que HTTP — le laissait passer : une vraie ligne tombant pendant la fenêtre
  // d'un test s'invitait à l'écran malgré toute l'isolation REST.
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

// LANCEMENT GRATUIT (2026-11-01) : le plafond de trois passions et le quota de
// trois changements sont LEVÉS par défaut (`PLAFOND_PASSIONS_EN_VIGUEUR`, app-06).
// Une suite qui éprouve le plafond l'ARME elle-même, comme `access-gate.spec.js`
// arme le rideau : par la variable de `window`, posée à CHAQUE navigation et
// insensible à un `localStorage.clear()` du test.
async function armerPlafondPassions(page) {
  await page.addInitScript(() => { window.PASSIO_PLAFOND_PASSIONS = true; });
}

module.exports = {
  onboardedState, bootOnboarded, sansDonneesDistantes, projetSupabaseVide, miroirPassions, PASSIONS, armerPlafondPassions,
  // Exposé pour le banc unitaire (`tests/unit/isolation-projet-supabase.test.mjs`) :
  // la matrice des réponses s'y éprouve sans navigateur.
  repondreProjetVide,
};
