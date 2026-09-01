// ══════════════════════════════════════════════════════════════════════════
// RÉFÉRENTIEL PLAT DES PASSIONS — moteur de recherche (lot flat_passions_v1)
//
// « Recherche et choisis directement ce qui te passionne. »
//
// IL N'Y A QU'UN SEUL NIVEAU. « Enduro », « Guitare électrique »,
// « Astrophotographie » et « Sport » sont quatre passions au même rang. Aucune
// n'est « sous » une autre, aucune n'exige d'en ouvrir une avant. Le champ
// `broader` existe dans les données, il ne sort JAMAIS à l'écran : il sert à
// mieux classer (taper « moto enduro » doit trouver « Enduro ») et à suggérer.
//
// ── CE QUE CE FICHIER N'EST PAS ────────────────────────────────────────────
// Il ne contient PAS le référentiel. Les 1 900 entrées vivent dans
// `data/passions-v1.json`, téléchargé au PREMIER usage réel de la recherche.
// ⚠️ C'est structurel, pas une optimisation : `scripts/build.js` inline TOUT
// `<script src="js/…">` dans le monolithe de production. Un référentiel en JS
// finirait donc sur le chemin critique du démarrage, pour une donnée dont la
// grande majorité des sessions n'a jamais besoin.
//
// ── ACTIVATION — ACTIF PAR DÉFAUT depuis le 2026-09-01 ────────────────────
//   Le drapeau ne sait plus qu'ENLEVER. Coupures, prioritaires sur tout :
//     localStorage.flat_passions_v1 = "0"
//     window.PASSIO_FLAT_PASSIONS = false
//   Les anciens liens `?passio_preview=flat-passions-v1` restent tolérés, mais
//   ne décident plus rien.
//
// Aucune activation positive n'est écrite dans `localStorage`. Coupé, le lot
// rend l'application d'avant à l'octet près — c'est ce qui rend le retour
// arrière gratuit, sans redéploiement.
//
// ── QUATRE PIÈGES DE CE DÉPÔT, ÉVITÉS ICI EXPRESSÉMENT ────────────────────
// ① `state` vaut **null**, pas `undefined`, jusqu'à `state = loadState()`.
//    `typeof state === "undefined"` ne protège donc PAS `state.user` : c'est
//    ce motif exact qui a tué la reprise d'`ui-v4b-fiche.js` le 2026-08-28.
// ② Un module chargé hors bloc app doit écouter `passio:app-ready` ET y
//    remettre ses compteurs de reprise à zéro : en production le bloc app
//    n'est injecté qu'APRÈS le code d'accès, et un budget de reprise se
//    consomme entièrement pendant la saisie.
// ③ Jamais de `requestAnimationFrame` pour cadencer quoi que ce soit : il ne
//    part pas sur une page qui ne compose pas de frames (onglet caché,
//    headless, machine saturée).
// ④ Jamais de `catch` muet sur un chemin de rendu — `diagLog`, toujours.
//
// ── VIE PRIVÉE ────────────────────────────────────────────────────────────
// ⚠️ AUCUNE RECHERCHE LIBRE NE PART EN TÉLÉMÉTRIE. La frappe ne quitte
// l'appareil que vers `rechercher_passions` (RPC Supabase, corps de requête —
// que `js/telemetry.js` ne lit pas, il ne relève que l'URL sans query), et
// aucun événement de télémétrie ne transporte le texte tapé. Les surfaces qui
// affichent la frappe doivent porter un `data-tel` explicite : sans lui, la
// délégation de clic de `telemetry.js` retombe sur `textContent.slice(0, 40)`
// et emporterait le texte de la personne.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var STORAGE_KEY = "flat_passions_v1";
  var URL_DATA = "data/passions-v1.json";
  var CLE_RECENTES = "passio_passions_recentes";
  var MAX_RECENTES = 12;

  function journal(quoi, e) {
    try {
      if (typeof diagLog === "function") diagLog("passions_flat " + quoi + " " + (e && e.message ? e.message : e || ""));
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRAPEAU
  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ ACTIF PAR DÉFAUT DEPUIS LE 2026-09-01, ET LE DRAPEAU NE SAIT PLUS
  // QU'ENLEVER. Même patron que les lots UI-3A et UI-4 : aucune valeur positive
  // n'active, rien n'est écrit dans `localStorage`, et les anciens liens
  // `?passio_preview=flat-passions-v1` restent tolérés sans plus rien décider.
  //
  // ⚠️ CE BASCULEMENT SUPPOSE LA MIGRATION APPLIQUÉE, et elle l'est : vérifié en
  // production le 2026-09-01 — 1 908 passions actives, 3 830 relations, les 19
  // identifiants historiques conservés, ZÉRO publication orpheline. L'ordre
  // n'était pas négociable : allumer avant la migration aurait ouvert une
  // recherche promettant 1 889 passions que la clé étrangère de
  // `posts.passion_id` aurait refusées à la publication.
  //
  // ⚠️ LA COUPURE RESTE ENTIÈRE, et c'est elle qui rend le retour arrière
  // gratuit : `localStorage.flat_passions_v1 = "0"` ou
  // `window.PASSIO_FLAT_PASSIONS = false` rendent le catalogue historique à
  // l'octet près, sans redéploiement.
  function coupeLocalement() {
    try { return localStorage.getItem(STORAGE_KEY) === "0"; } catch (e) { return false; }
  }

  function actif() {
    try { if (window.PASSIO_FLAT_PASSIONS === false) return false; } catch (e) {}
    if (coupeLocalement()) return false;
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NORMALISATION
  // ⚠️ CE PLIAGE DOIT RESTER IDENTIQUE à `norme()` de
  // `scripts/referentiel-passions.js` et à `normalized_label` en base. Trois
  // pliages différents, c'est « moto cross » qui trouve « Motocross » d'un
  // côté et pas de l'autre — et un défaut qu'aucun test unitaire local ne voit.
  // `tests/e2e/passions-plates.spec.js` compare le pliage du navigateur à celui
  // du référentiel construit.
  // ══════════════════════════════════════════════════════════════════════════
  function norme(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Repli singulier : « guitares » doit rejoindre « guitare ». Volontairement
  // minimal — un désuffixage agressif fusionne des mots distincts (« bus » →
  // « bu »). Un seul `s`/`x` final, et seulement à partir de 4 lettres.
  function singulier(mot) {
    return (mot.length >= 4 && /[sx]$/.test(mot)) ? mot.slice(0, -1) : mot;
  }
  function mots(q) {
    return norme(q).split(" ").filter(Boolean);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHARGEMENT — une fois, à la demande, jamais au démarrage
  // ══════════════════════════════════════════════════════════════════════════
  var DONNEES = null;        // { parId, liste, index }
  var promesse = null;
  var echecChargement = false;

  function racineData() {
    // En développement les fichiers sont servis depuis la racine du dépôt ;
    // en production `dist/` porte la même arborescence (cf. scripts/build.js).
    // Un chemin RELATIF suit les deux sans configuration.
    return URL_DATA;
  }

  function construireIndex(paquet) {
    var liste = [];
    var parId = Object.create(null);
    (paquet.passions || []).forEach(function (l) {
      var p = {
        id: l[0], label: l[1], emoji: l[2], color: l[3],
        aliases: l[4] || [], broader: l[5] || null,
        popularity: l[6] || 0, is_broad: !!l[7],
      };
      p.nLabel = norme(p.label);
      p.nAliases = p.aliases.map(norme);
      // Formes repliées au singulier : « guitares » doit atteindre « Guitare »
      // par la MÊME règle de score, et pas seulement par la branche
      // approximative — sinon le départage se fait à la popularité et
      // « Guitare électrique » passe devant « Guitare ». Mesuré.
      p.sLabel = p.nLabel.split(" ").map(singulier).join(" ");
      p.sAliases = p.nAliases.map(function (a) { return a.split(" ").map(singulier).join(" "); });
      parId[p.id] = p;
      liste.push(p);
    });

    // La botte de foin d'une entrée inclut le libellé de son terme plus
    // général : c'est ce qui fait que « moto enduro » trouve « Enduro ».
    // ⚠️ Ça ne crée aucun niveau visible — le libellé du terme général n'est
    // jamais affiché à côté du résultat.
    liste.forEach(function (p) {
      var sup = p.broader && parId[p.broader] ? parId[p.broader].nLabel : "";
      p.foin = (p.nLabel + " " + p.nAliases.join(" ") + " " + sup + " " + norme(p.id)).trim();
      p.foinSing = p.foin.split(" ").map(singulier).join(" ");
    });

    // Index par préfixe de 3 lettres. À 1 900 entrées un balayage complet
    // suffirait ; à 20 000 il ne suffirait plus, et l'index se règle
    // maintenant — pas le jour où la frappe devient poussive sur un téléphone.
    var index = Object.create(null);
    liste.forEach(function (p, i) {
      var vus = Object.create(null);
      p.foinSing.split(" ").forEach(function (m) {
        if (!m) return;
        var cle = m.slice(0, 3);
        if (vus[cle]) return;
        vus[cle] = 1;
        (index[cle] || (index[cle] = [])).push(i);
      });
    });

    return {
      liste: liste, parId: parId, index: index,
      related: paquet.related || [],
      canoniques: paquet.canoniques || [],
      version: paquet.version || "v1",
    };
  }

  // Repli hors ligne : le socle embarqué (`PASSIONS`, app-01), les passions du
  // compte et les récentes. La recherche fonctionne alors sur une poignée
  // d'entrées au lieu de 1 900 — dégradé, mais jamais un écran vide.
  function repliHorsLigne() {
    var lignes = [];
    var vus = Object.create(null);
    function pousser(id, label, emoji, color) {
      if (!id || vus[id]) return;
      vus[id] = 1;
      lignes.push([id, label || id, emoji || "✨", color || "#8b5cf6", [], null, 0, 0]);
    }
    try {
      if (typeof PASSIONS !== "undefined" && Array.isArray(PASSIONS)) {
        PASSIONS.forEach(function (p) { pousser(p.id, p.label, p.emoji, p.color); });
      }
    } catch (e) {}
    // ⚠️ `state` vaut `null` avant `loadState()` : on teste la VALEUR, pas le
    // seul `typeof` (piège ① de l'en-tête).
    try {
      var s = (typeof state !== "undefined") ? state : null;
      var profils = (s && s.user && s.user.profiles) || [];
      profils.forEach(function (pr) {
        if (pr && pr.passion) pousser(pr.passion, pr.label || pr.passion, pr.emoji, pr.color);
      });
    } catch (e) {}
    recentes().forEach(function (r) { pousser(r.id, r.label, r.emoji, r.color); });
    return { schema: 1, version: "repli", passions: lignes, related: [], canoniques: [] };
  }

  function charger() {
    if (promesse) return promesse;
    promesse = new Promise(function (resoudre) {
      var url = racineData();
      var fini = false;
      function termine(paquet, horsLigne) {
        if (fini) return;
        fini = true;
        try { DONNEES = construireIndex(paquet); DONNEES.horsLigne = !!horsLigne; }
        catch (e) { journal("index", e); DONNEES = construireIndex(repliHorsLigne()); DONNEES.horsLigne = true; }
        resoudre(DONNEES);
      }
      try {
        fetch(url, { credentials: "omit" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (j) { termine(j, false); })
          .catch(function (e) {
            echecChargement = true;
            journal("fetch", e);
            termine(repliHorsLigne(), true);
          });
      } catch (e) {
        echecChargement = true;
        journal("fetch_sync", e);
        termine(repliHorsLigne(), true);
      }
    });
    return promesse;
  }

  function pret() { return !!DONNEES; }

  // ══════════════════════════════════════════════════════════════════════════
  // CLASSEMENT
  // Ordre imposé par la spécification, du meilleur au moins bon :
  //   0  correspondance exacte du libellé
  //   5  ALIAS exact
  //  10  libellé qui COMMENCE par la frappe
  //  30  alias qui commence par la frappe
  //  40  occurrence en milieu de libellé
  //  50  approximatif (tous les mots présents, ailleurs dans la botte de foin)
  //  (+2 quand la correspondance n'est obtenue qu'après repli au singulier)
  //
  // ⚠️ UN ÉCART ASSUMÉ À LA LETTRE DE LA SPÉCIFICATION, et pourquoi. Elle
  // énumère « début du libellé » AVANT « alias exact ». Appliqué tel quel,
  // taper « running » remontait « Running urbain » — un début de libellé —
  // devant « Course à pied », dont « running » est précisément l'alias exact.
  // Or la même spécification donne « running, jogging → Course à pied » comme
  // exemple de ce que la recherche doit faire. Les deux phrases se contredisent ;
  // on tranche pour l'exemple, qui dit l'intention : une correspondance EXACTE
  // sur la frappe entière — libellé ou alias — passe avant un simple préfixe.
  // puis, à score égal : popularité, puis usage récent, puis ordre du
  // référentiel.
  //
  // ⚠️ UN TERME TRÈS GÉNÉRAL EST RÉTROGRADÉ de 5 points à pertinence égale.
  // Sans ça, taper « moto » remonterait « Moto » devant « Motocross » — c'est
  // juste — mais taper « escalade » remontait la grande famille « Sport »
  // (qui porte « escalade » dans sa botte de foin) au même rang que la passion
  // « Escalade » elle-même. Le modèle est plat : à pertinence égale, c'est le
  // terme PRÉCIS qui gagne.
  // ══════════════════════════════════════════════════════════════════════════
  function scoreBrut(p, n, labels, aliases) {
    if (labels === n) return 0;
    for (var i = 0; i < aliases.length; i++) if (aliases[i] === n) return 5;
    if (labels.indexOf(n) === 0) return 10;
    for (var j = 0; j < aliases.length; j++) if (aliases[j].indexOf(n) === 0) return 30;
    if (labels.indexOf(n) > 0) return 40;
    return 99;
  }

  function score(p, n, nSing, motsQ) {
    // Le meilleur des deux pliages : la frappe telle quelle, et sa forme
    // repliée au singulier. La seconde reçoit +2, pour qu'une correspondance
    // exacte l'emporte toujours sur une correspondance obtenue par repli.
    var s = Math.min(
      scoreBrut(p, n, p.nLabel, p.nAliases),
      scoreBrut(p, nSing, p.sLabel, p.sAliases) + 2
    );
    if (s < 99) return s;
    // Approximatif : tous les mots de la frappe se retrouvent, dans le
    // désordre, dans la botte de foin. C'est ce qui fait marcher « photo
    // astro » et « moto enduro ».
    for (var k = 0; k < motsQ.length; k++) {
      if (p.foinSing.indexOf(motsQ[k]) < 0) return 99;
    }
    return 50;
  }

  function candidats(motsQ) {
    if (!DONNEES) return [];
    var liste = DONNEES.liste;
    // Un mot de moins de 3 lettres ne peut pas passer par l'index de préfixes :
    // on balaye. Le cas est rare et le résultat est plafonné de toute façon.
    var plusPetit = null;
    for (var i = 0; i < motsQ.length; i++) {
      var m = motsQ[i];
      if (m.length < 3) return liste;
      var seau = DONNEES.index[m.slice(0, 3)];
      if (!seau) return [];                       // un mot introuvable = zéro résultat
      if (!plusPetit || seau.length < plusPetit.length) plusPetit = seau;
    }
    if (!plusPetit) return liste;
    return plusPetit.map(function (i) { return liste[i]; });
  }

  function rangRecence(id) {
    var r = recentes();
    for (var i = 0; i < r.length; i++) if (r[i].id === id) return i;
    return 999;
  }

  function chercher(q, options) {
    options = options || {};
    var limite = options.limite || 20;
    var exclure = options.exclure || null;      // Set ou tableau d'identifiants
    var exclu = Object.create(null);
    if (exclure) (exclure.forEach ? exclure : []).forEach(function (id) { exclu[id] = 1; });

    if (!DONNEES) return [];
    var n = norme(q);
    if (!n) return suggestions(limite, exclure);

    var motsQ = mots(q).map(singulier);
    var nSing = motsQ.join(" ");
    var pool = candidats(motsQ);
    var trouves = [];
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (exclu[p.id]) continue;
      var s = score(p, n, nSing, motsQ);
      if (s >= 99) continue;
      trouves.push({ p: p, s: s + (p.is_broad ? 5 : 0) });
      // On ne borne pas la collecte : le tri doit voir tous les candidats,
      // sinon un résultat exact arrivé tard serait jeté avant d'être classé.
    }
    trouves.sort(function (a, b) {
      if (a.s !== b.s) return a.s - b.s;
      if (a.p.popularity !== b.p.popularity) return b.p.popularity - a.p.popularity;
      var ra = rangRecence(a.p.id), rb = rangRecence(b.p.id);
      if (ra !== rb) return ra - rb;
      return a.p.label.localeCompare(b.p.label, "fr");
    });
    return trouves.slice(0, limite).map(function (x) { return x.p; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECHERCHE SERVEUR — indexée, plafonnée, annulable
  // ⚠️ ELLE N'EST PAS OBLIGATOIRE. Tant que la migration n'est pas appliquée,
  // `rechercher_passions` n'existe pas : la fonction bascule alors DÉFINITIVEMENT
  // sur le local pour la session, sans réessayer à chaque frappe.
  // ══════════════════════════════════════════════════════════════════════════
  var serveurIndisponible = false;
  var cacheServeur = Object.create(null);      // frappe normalisée → résultats
  var CACHE_MAX = 40;

  function serveurUtilisable() {
    if (serveurIndisponible) return false;
    try { return typeof supa !== "undefined" && !!supa && !!window._supaReal; } catch (e) { return false; }
  }

  function chercherServeur(q, limite) {
    var n = norme(q);
    if (!n) return Promise.resolve(null);
    if (cacheServeur[n]) return Promise.resolve(cacheServeur[n]);
    if (!serveurUtilisable()) return Promise.resolve(null);
    return supa.rpc("rechercher_passions", { q: q, lim: limite || 20 })
      .then(function (r) {
        if (r && r.error) {
          // 404 sur la fonction = migration non appliquée. On cesse de demander.
          serveurIndisponible = true;
          journal("rpc", r.error.message || r.error);
          return null;
        }
        var lignes = (r && r.data) || [];
        var out = lignes.map(function (x) {
          var local = DONNEES && DONNEES.parId[x.id];
          return local || { id: x.id, label: x.label, emoji: x.emoji || "✨", color: x.color, aliases: [], broader: null, popularity: x.popularity || 0, is_broad: false };
        });
        var cles = Object.keys(cacheServeur);
        if (cles.length > CACHE_MAX) delete cacheServeur[cles[0]];
        cacheServeur[n] = out;
        return out;
      })
      .catch(function (e) { serveurIndisponible = true; journal("rpc_catch", e); return null; });
  }

  // Le point d'entrée de l'interface : local d'abord (immédiat, hors ligne
  // compris), serveur ensuite s'il répond mieux. L'appelant reçoit un premier
  // résultat sans attendre le réseau.
  function chercherAsync(q, options) {
    options = options || {};
    return charger().then(function () {
      var local = chercher(q, options);
      if (!options.serveur || !serveurUtilisable()) return local;
      return chercherServeur(q, options.limite || 20).then(function (dist) {
        if (!dist || !dist.length) return local;
        return fusionner(q, local, dist, options);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FUSION LOCAL + SERVEUR — LE CLASSEMENT APPARTIENT AU NAVIGATEUR
  // ──────────────────────────────────────────────────────────────────────────
  // ⚠️ DÉFAUT MESURÉ EN CI LE 2026-09-01, ET IL A FALLU QUE LA MIGRATION SOIT
  // APPLIQUÉE POUR LE VOIR. Le code prenait le classement du SERVEUR tel quel
  // dès qu'il répondait. Or les deux barèmes ne coïncident pas : sur
  // « guitares », le navigateur remonte « Guitare » (repli au singulier, pénalité
  // +2 sur les autres) et `rechercher_passions` remonte « Guitare électrique ».
  //
  // Le vrai problème n'est pas de savoir lequel a raison — les deux résultats
  // sont pertinents. C'est que l'ORDRE CHANGEAIT selon que la requête réseau
  // avait répondu ou non : même frappe, même appareil, deux écrans différents.
  // Un utilisateur sur réseau lent voyait un classement, le même sur Wi-Fi en
  // voyait un autre.
  //
  // Le serveur sert donc à ce qu'il fait le mieux — RETROUVER dans tout le
  // catalogue, y compris ce que l'index local par préfixe ne rattrape pas — et
  // le navigateur reste la SEULE autorité sur l'ordre. Un seul barème, appliqué
  // à un seul endroit : c'est aussi ce qui évite qu'ils redivergent au premier
  // ajustement de l'un des deux.
  //
  // ⚠️ Une passion rendue par le serveur mais ABSENTE du référentiel local est
  // conservée, à la fin : elle est réelle (la base fait foi), simplement plus
  // récente que le JSON embarqué. La jeter ferait disparaître une passion
  // publiable — l'inverse de ce que la recherche serveur apporte.
  // ══════════════════════════════════════════════════════════════════════════
  function fusionner(q, local, dist, options) {
    options = options || {};
    var limite = options.limite || 20;
    var exclu = Object.create(null);
    if (options.exclure && options.exclure.forEach) options.exclure.forEach(function (id) { exclu[id] = 1; });

    var n = norme(q);
    var motsQ = mots(q).map(singulier);
    var nSing = motsQ.join(" ");

    var vus = Object.create(null);
    var classables = [];      // connues du référentiel local → notées ici
    var inconnues = [];       // venues du serveur seul → gardées telles quelles

    function ajouter(p) {
      if (!p || !p.id || vus[p.id] || exclu[p.id]) return;
      vus[p.id] = 1;
      var connue = DONNEES && DONNEES.parId[p.id];
      if (connue) classables.push({ p: connue, s: score(connue, n, nSing, motsQ) + (connue.is_broad ? 5 : 0) });
      else inconnues.push(p);
    }
    local.forEach(ajouter);
    dist.forEach(ajouter);

    classables.sort(function (a, b) {
      if (a.s !== b.s) return a.s - b.s;
      if (a.p.popularity !== b.p.popularity) return b.p.popularity - a.p.popularity;
      var ra = rangRecence(a.p.id), rb = rangRecence(b.p.id);
      if (ra !== rb) return ra - rb;
      return a.p.label.localeCompare(b.p.label, "fr");
    });
    return classables.map(function (x) { return x.p; }).concat(inconnues).slice(0, limite);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUGGESTIONS, RÉCENTES, ACCÈS UNITAIRE
  // ══════════════════════════════════════════════════════════════════════════
  function suggestions(limite, exclure) {
    if (!DONNEES) return [];
    var exclu = Object.create(null);
    if (exclure && exclure.forEach) exclure.forEach(function (id) { exclu[id] = 1; });
    var out = [];
    var rec = recentes();
    for (var i = 0; i < rec.length && out.length < (limite || 12); i++) {
      var p = DONNEES.parId[rec[i].id];
      if (p && !exclu[p.id]) { out.push(p); exclu[p.id] = 1; }
    }
    // ⚠️ ON ALTERNE PRÉCIS ET GÉNÉRAL, en commençant par un terme PRÉCIS.
    // Trié par popularité seule, le repos affichait « Sport · Sports de combat
    // · Sports collectifs · Musique… » : rien que des grandes familles, ce qui
    // réapprend exactement ce que ce lot défait — l'idée qu'il faut d'abord
    // choisir une catégorie. Voir « Enduro » et « Astrophotographie » dès
    // l'écran d'accueil est ce qui dit, sans un mot d'explication, que tout est
    // au même niveau.
    var pop = DONNEES.liste.filter(function (p) { return p.popularity >= 1000 && !exclu[p.id]; });
    var precis = pop.filter(function (p) { return !p.is_broad; });
    var larges = pop.filter(function (p) { return p.is_broad; });
    var max = limite || 12;
    for (var j = 0; out.length < max && (j < precis.length || j < larges.length); j++) {
      if (precis[j] && out.length < max) out.push(precis[j]);
      if (larges[j] && out.length < max) out.push(larges[j]);
    }
    return out;
  }

  function parId(id) { return (DONNEES && DONNEES.parId[id]) || null; }
  function existe(id) { return !!parId(id); }

  function recentes() {
    try {
      var v = JSON.parse(localStorage.getItem(CLE_RECENTES) || "[]");
      return Array.isArray(v) ? v.filter(function (x) { return x && x.id; }) : [];
    } catch (e) { return []; }
  }

  // ⚠️ On mémorise l'IDENTIFIANT et son libellé, jamais la frappe qui y a mené.
  function noterUtilisation(id) {
    try {
      var p = parId(id);
      var l = recentes().filter(function (x) { return x.id !== id; });
      l.unshift({ id: id, label: (p && p.label) || id, emoji: (p && p.emoji) || "✨", color: p && p.color });
      localStorage.setItem(CLE_RECENTES, JSON.stringify(l.slice(0, MAX_RECENTES)));
    } catch (e) { journal("recentes", e); }
  }

  // Passions liées — sert à SUGGÉRER, jamais à filtrer, et rien à l'écran ne
  // nomme la relation.
  function liees(id, limite) {
    if (!DONNEES) return [];
    var out = [];
    (DONNEES.related || []).forEach(function (r) {
      if (r[0] === id && DONNEES.parId[r[1]]) out.push({ p: DONNEES.parId[r[1]], w: r[2] });
      else if (r[1] === id && DONNEES.parId[r[0]]) out.push({ p: DONNEES.parId[r[0]], w: r[2] });
    });
    out.sort(function (a, b) { return b.w - a.w; });
    return out.slice(0, limite || 6).map(function (x) { return x.p; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEMANDES D'AJOUT — « Ajouter « X » à mes passions »
  // ⚠️ Une demande N'EST PAS une passion. Elle ne devient jamais publiable :
  // `estPassionCanonique` (app-02) reste la seule autorité, et la clé étrangère
  // de `posts.passion_id` refuserait l'écriture de toute façon.
  // ══════════════════════════════════════════════════════════════════════════
  var CLE_DEMANDES = "passio_passions_demandes";

  function demandes() {
    try {
      var v = JSON.parse(localStorage.getItem(CLE_DEMANDES) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  // Avant de créer quoi que ce soit : normaliser, chercher les alias, chercher
  // les approchants. Rend `{ doublon }` quand le terme existe déjà — la
  // spécification l'exige, et sans ça le référentiel se remplirait de variantes.
  function analyserDemande(texte) {
    var n = norme(texte);
    if (!n || n.length < 2) return { valide: false, motif: "trop_court" };
    if (n.length > 60) return { valide: false, motif: "trop_long" };
    var proches = chercher(texte, { limite: 5 });
    var exact = proches.filter(function (p) {
      if (p.nLabel === n) return true;
      for (var i = 0; i < p.nAliases.length; i++) if (p.nAliases[i] === n) return true;
      return false;
    })[0] || null;
    return { valide: true, texte: String(texte).trim(), normalise: n, doublon: exact, proches: proches };
  }

  function deposerDemande(texte) {
    var a = analyserDemande(texte);
    if (!a.valide) return Promise.resolve(a);
    if (a.doublon) return Promise.resolve(a);
    var enregistrement = {
      id: "pr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label: a.texte, normalise: a.normalise, status: "pending", createdAt: Date.now(),
    };
    try {
      var l = demandes().filter(function (d) { return d.normalise !== a.normalise; });
      l.unshift(enregistrement);
      localStorage.setItem(CLE_DEMANDES, JSON.stringify(l.slice(0, 50)));
    } catch (e) { journal("demande_locale", e); }

    // Visiteur non connecté : la demande reste locale et sera envoyée plus
    // tard. Connecté : on l'envoie, et on LIT `{ error }` — le SDK Supabase ne
    // lève pas sur un refus RLS, une écriture non lue « réussit » à l'écran et
    // disparaît au rechargement.
    try {
      var uid = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : null;
      if (uid && serveurUtilisable()) {
        return supa.from("passion_requests")
          .insert({ user_id: uid, label: a.texte, normalized_label: a.normalise, status: "pending" })
          .then(function (r) {
            if (r && r.error) journal("demande_serveur", r.error.message || r.error);
            return Object.assign({}, a, { enregistrement: enregistrement, envoyee: !(r && r.error) });
          })
          .catch(function (e) { journal("demande_serveur_catch", e); return Object.assign({}, a, { enregistrement: enregistrement, envoyee: false }); });
      }
    } catch (e) { journal("demande", e); }
    return Promise.resolve(Object.assign({}, a, { enregistrement: enregistrement, envoyee: false }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AMORÇAGE
  // ⚠️ Le module ne charge RIEN au démarrage : le référentiel n'arrive qu'au
  // premier `charger()`, déclenché par l'ouverture du sélecteur. Le seul travail
  // fait ici est de poser la classe racine (pour le CSS du lot) — et de la
  // reposer sur `passio:app-ready`, puisqu'en production le bloc app n'existe
  // pas encore au moment où ce fichier s'exécute (piège ②).
  // ══════════════════════════════════════════════════════════════════════════
  function poserClasse() {
    try {
      document.documentElement.classList.toggle("passio-flat-passions", actif());
    } catch (e) { journal("classe", e); }
  }

  function couper() {
    try { window.PASSIO_FLAT_PASSIONS = false; } catch (e) {}
    poserClasse();
  }

  poserClasse();
  try {
    window.addEventListener("passio:app-ready", poserClasse);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", poserClasse, { once: true });
    }
  } catch (e) { journal("amorce", e); }

  window.PassioPassions = {
    actif: actif,
    couper: couper,
    charger: charger,
    pret: pret,
    norme: norme,
    chercher: chercher,
    chercherAsync: chercherAsync,
    chercherServeur: chercherServeur,
    suggestions: suggestions,
    parId: parId,
    existe: existe,
    liees: liees,
    recentes: recentes,
    noterUtilisation: noterUtilisation,
    demandes: demandes,
    analyserDemande: analyserDemande,
    deposerDemande: deposerDemande,
    // Exposé pour les tests et le diagnostic — jamais pour un chemin de rendu.
    _etat: function () {
      return {
        actif: actif(), pret: pret(), horsLigne: !!(DONNEES && DONNEES.horsLigne),
        echecChargement: echecChargement, serveurIndisponible: serveurIndisponible,
        taille: DONNEES ? DONNEES.liste.length : 0,
      };
    },
  };
})();
