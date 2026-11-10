// Build PASSIO : ré-assemble index.html (dev, fichiers séparés) pour la production.
// Depuis le 2026-07-03, le bloc app (9 fichiers + emoji-misc, ~1,1 Mo) n'est PLUS
// inline : il sort de la page, injecté par un petit chargeur UNE FOIS le gate
// franchi (window.__gateReady). La page verrouillée — celle que voient les nouveaux
// visiteurs et Lighthouse — n'a quasi plus de JS applicatif à compiler (TBT ÷ ~3).
// Session déjà déverrouillée : __gateReady est résolue → injection immédiate.
// Depuis le 2026-11-09, ce bloc sort en 9 SCRIPTS (dist/app/), plus en un seul
// dist/app.js : voir l'étape 1.
// Usage : node scripts/build.js [dist/index.html]
// PASSIO_MINIFIER_APP=1 (déploiement de production, et la passe « Gates artefact »
// de la CI) : les 9 scripts sont minifiés ICI, par le terser du lockfile — l'étape 1
// bis dit pourquoi —, et la feuille de style aussi, par le clean-css du lockfile
// (étape 2 bis, depuis le 2026-11-10).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const outPath = process.argv[2] || path.join(root, "dist", "index.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const hash10 = (texte) => crypto.createHash("sha1").update(texte).digest("hex").slice(0, 10);
// L'empreinte `integrity` (Subresource Integrity) d'octets servis : sha384, base64.
const sri = (octets) => "sha384-" + crypto.createHash("sha384").update(octets).digest("base64");

// 1. Bloc app : les 9 fichiers entre les marqueurs sortent en 9 SCRIPTS, chacun
//    sous l'empreinte de SON contenu : `app/app-04-comments-shop.js?v=<hash>`
//    (cf. _headers : /app/* immutable).
//    ⚠️ POURQUOI (2026-11-09, capacité sans investir). Jusque-là les 9 étaient
//    concaténés dans UN dist/app.js (417 Ko compressés, mesuré en production) :
//    une version qui ne touchait qu'UN fichier — 38 des 136 commits de `main` en
//    30 jours touchaient le bloc, ~2 fichiers sur 9 chacun — faisait retélécharger
//    TOUT le bloc à chaque appareil actif. Découpé, seuls les fichiers changés
//    repartent ; les autres restent dans le cache du navigateur (un an, immutable).
//    ⚠️ L'ORDRE D'EXÉCUTION EST CELUI DU BLOC, ET RIEN NE LE CHANGE (hoisting entre
//    app-01 et app-09 : NE PAS réordonner). Le chargeur ci-dessous télécharge les 9
//    EN PARALLÈLE (preload) et les exécute UN PAR UN, chacun au `load` du
//    précédent : c'est la sémantique du développement, où les 9 fichiers sont déjà
//    9 balises — la preuve que le découpage tient.
//    ⚠️ CHACUN EST INSÉRÉ DÈS QUE LE PRÉCÉDENT A TOURNÉ, JAMAIS « QUAND TOUS SONT
//    ARRIVÉS ». Un `<script>` inséré RETARDE l'événement `load` de la page, un
//    `<link rel=preload>` non : un chargeur qui n'insérait rien avant l'arrivée des 9
//    (essayé le 2026-11-09, pour que les minuteurs de démarrage d'app-04 partent avec
//    ceux d'app-08) laissait la page déclarer `load` AVANT que l'application tourne
//    — mesuré sous Chromium et WebKit, dernier script retenu 1,5 s : `load` à 100 ms,
//    l'application après. Avec l'ancien app.js comme avec cette chaîne, l'application
//    s'exécute avant `load` (verrou ⑤). Un script qui ne se charge pas
//    est retenté deux fois, puis le chargeur S'ARRÊTE : il ne lance jamais la suite
//    sans lui, sinon app-09 démarrerait une application à laquelle il manque un
//    fichier (le monolithe, lui, ne pouvait manquer qu'en entier).
//    ⚠️ CHAQUE REPRISE REDEMANDE D'ABORD L'ADRESSE AU RÉSEAU, en
//    `fetch(adresse, { cache: "reload" })` (2026-11-09). Netlify applique la règle
//    `/app/*` de `_headers` aux 404 AUSSI : une adresse du lot demandée pendant un
//    retour arrière vers un déploiement d'avant ce découpage (aucun `app/`) revient
//    en 404 `public,max-age=31536000,immutable` (mesuré en production). Quand un
//    redéploiement la rétablit à l'identique (fichier inchangé, même empreinte), le
//    navigateur relirait ce 404 pendant un an — la reprise aussi : l'application ne
//    démarrerait plus sur cet appareil. `cache: "reload"` va au réseau sans lire le
//    cache HTTP et y RANGE la réponse ; le script réinséré relit alors ce qui vient
//    d'arriver. Le worker ne range jamais un 404 (sw.js, `contenuVersionne`) et
//    transmet le mode `reload` à son propre `fetch(e.request)` (branche
//    `estVersionne`). Le corps est lu jusqu'au bout avant la réinsertion : le
//    script relit alors l'entrée que la redemande vient d'écrire, au lieu de
//    repartir au réseau pendant qu'elle s'écrit encore. Verrou :
//    app-scripts-par-fichier.spec.js ⑥ (profil persistant, deux moteurs : la seconde
//    visite relit le 404 en cache, et c'est la redemande qui démarre l'application ;
//    mutations : sans redemande, ou redemande sans `cache: "reload"` → rouge).
//    ⚠️ CHAQUE SCRIPT PORTE L'EMPREINTE `integrity` (sha384) DE SES OCTETS SERVIS
//    (2026-11-10). Netlify ignore le `?v=` : pendant un retour arrière de B vers A
//    (scripts/rollback-netlify.mjs, une restauration instantanée), une demande de
//    l'adresse de B reçoit le contenu de A, en 200 `immutable` — une page B partie
//    juste avant la bascule, ou le worker de B qui s'installe. Quand B revient à
//    l'identique (même fichier, même `?v=`), le navigateur exécutait l'ANCIEN script
//    avec les 8 autres de B, et rien n'échouait : la reprise du 404 ne le voyait pas.
//    Mesuré sous Chromium et WebKit, dans le cache HTTP comme dans celui du worker.
//    Avec `integrity`, le navigateur REFUSE ces octets : `onerror`, la reprise
//    redemande l'adresse au réseau (`cache: "reload"`, que le worker honore — sw.js),
//    et le script de B tourne. Pendant la bascule elle-même, la page B refuse le
//    script de A et s'arrête comme devant un script manquant : jamais deux versions
//    mêlées. L'empreinte va sur le preload ET sur le `<script>` (sans elle sur le
//    preload, Chromium ne le réutilise pas et retélécharge). La redemande n'en porte
//    pas : elle sert à remplacer ce que gardent les caches, quoi qu'arrive. Verrou :
//    app-scripts-par-fichier.spec.js ⑦ (cache HTTP) ⑧ (cache du worker), deux moteurs.
//    ⚠️ CHAQUE SCRIPT N'AVANCE LA CHAÎNE QU'UNE FOIS (2026-11-10, audit de stabilisation).
//    `onload` et `onerror` se DÉSARMENT au premier appel. Mesuré en production le 10/11
//    à 12:18 UTC : dans une page déjà démarrée, un robot de prévisualisation (arrivé par
//    `?fbclid=`, écran 2000 × 2000) a rejoué le `load` des 9 scripts ; chaque `onload`
//    refaisait `i++` puis `suivant()`, `i` dépassait le nombre de scripts et
//    `scripts[i][0]` levait — 9 erreurs par page, comptées comme des erreurs de la
//    production (`client_errors` 211 à 220). Un `error` rejoué retirait de la page le
//    script déjà exécuté, puis la reprise levait la même erreur une seconde plus tard
//    (mesuré au banc : 18 erreurs pour 9 `load` et 9 `error` rejoués) ; rejoué PENDANT
//    le chargement, il aurait redemandé et réinséré le script en cours — lu dans le
//    code, non mesuré. Désarmé, un événement rejoué ne fait plus rien ; la reprise, elle,
//    pose ses écouteurs sur le NOUVEL élément. Verrou : app-scripts-par-fichier.spec.js ⑨.
//    emoji-misc.js (qui doit garder son ordre APRÈS le bloc app) et
//    passion-context.js (il observe la persona active, donc APRÈS la définition
//    de state/currentProfile) ferment le 9ᵉ script, comme ils fermaient app.js :
//    le `boot()` qu'app-09 lance en microtâche part ainsi après eux, exactement
//    comme avant. pwa-landing.js reste inline : il ne dépend que de pwa-detect
//    (head) et son listener `load` mourrait si différé.
//    Verrous : tests/e2e/app-scripts-par-fichier.spec.js (ordre, parallélisme,
//    reprise, arrêt, application avant `load`), tests/e2e/version-skew.spec.js
//    (empreinte = contenu).
const startMark = html.indexOf("<!-- BUILD:APP-START");
const endMark = html.indexOf("<!-- BUILD:APP-END -->");
if (startMark === -1 || endMark === -1) throw new Error("Marqueurs BUILD:APP introuvables");
const appBlock = html.slice(startMark, endMark + "<!-- BUILD:APP-END -->".length);
const appFiles = [...appBlock.matchAll(/<script src="(js\/app-[^"]+)"><\/script>/g)].map(m => m[1]);
if (appFiles.length !== 9) throw new Error(`9 fichiers app attendus, trouvé ${appFiles.length}`);
const EMOJI_TAG = '<script src="js/emoji-misc.js"></script>';
if (!html.includes(EMOJI_TAG)) throw new Error("Tag emoji-misc.js introuvable (attendu après le bloc app)");
const appScripts = appFiles.map((f, i) => {
  const contenu = read(f) + (i === appFiles.length - 1
    ? "\n" + read("js/emoji-misc.js") + "\n" + read("js/passion-context.js") : "");
  const nom = path.basename(f);
  // `integrite` : celle des octets écrits ici ; l'étape 1 bis la remplace par celle
  // des octets minifiés quand elle minifie.
  return { nom, contenu, ref: "app/" + nom + "?v=" + hash10(contenu), integrite: sri(contenu) };
});
// Le texte de l'application, octet pour octet celui de l'ancien app.js : il fait
// l'empreinte d'ensemble du contrat (`appHash`) et entre dans le buildId (étape 5).
const appJs = appScripts.map(s => s.contenu).join("");
const appHash = hash10(appJs);
// ⚠️ Chaque adresse reste un LITTÉRAL COMPLET dans la page : la barrière des
// migrations (scripts/lib/barriere-migration.js, `urlsBundlesServis`) les lit dans
// le HTML servi, minifié compris. Une adresse recomposée à l'exécution
// ("app/" + nom + "?v=" + h) lui serait invisible. Son empreinte `integrity` la suit
// dans la MÊME paire : scripts/verifier-integrite-app.js les relit ensemble dans la
// page servie, minifiée comprise.
const loader = ""
  + "<script>\n"
  + "/* Bloc app externalisé : 9 scripts (scripts/build.js, étape 1), parsés et\n"
  + "   exécutés SEULEMENT après le gate. Téléchargés en parallèle, exécutés un par\n"
  + "   un dans l'ordre du bloc, chacun inséré dès que le précédent a tourné : un\n"
  + "   script inséré retarde l'événement `load` de la page, l'application tourne donc\n"
  + "   avant lui, comme avec l'ancien app.js. Chacun porte l'empreinte de ses octets\n"
  + "   (`integrity`) : un script d'une autre version resté en cache est refusé. Un\n"
  + "   échec de chargement est retenté deux fois, l'adresse d'abord redemandée au\n"
  + "   réseau (un 404 « immutable », ou le script d'une autre version, resterait sinon\n"
  + "   un an dans le cache HTTP), puis on s'arrête plutôt que de lancer la suite\n"
  + "   sans lui. Pas de preload statique (il concurrençait le HTML/CSS critiques sur\n"
  + "   mobile et polluait les métriques LCP) : prefetch basse priorité à la PREMIÈRE\n"
  + "   frappe dans le champ code — les fichiers sont en cache HTTP quand le 4e\n"
  + "   chiffre déverrouille. */\n"
  + "(function () {\n"
  + "  var scripts = [\n"
  + appScripts.map(s => "    [" + JSON.stringify(s.ref) + ", " + JSON.stringify(s.integrite) + "]").join(",\n") + "\n"
  + "  ];\n"
  + "  function lier(rel, href, integrite) {\n"
  + '    var l = document.createElement("link");\n'
  + '    l.rel = rel; l.as = "script"; l.href = href;\n'
  + "    if (integrite) l.integrity = integrite;\n"
  + "    document.head.appendChild(l);\n"
  + "  }\n"
  + "  (window.__gateReady || Promise.resolve()).then(function () {\n"
  + '    scripts.forEach(function (x) { lier("preload", x[0], x[1]); });\n'
  + "    var i = 0, essais = 0;\n"
  + "    (function suivant() {\n"
  + "      if (i === scripts.length) {\n"
  + '        window.dispatchEvent(new Event("passio:app-ready"));\n'
  + "        return;\n"
  + "      }\n"
  + '      var s = document.createElement("script");\n'
  + "      s.src = scripts[i][0];\n"
  + "      s.integrity = scripts[i][1];\n"
  + "      s.onload = function () { s.onload = s.onerror = null; i++; essais = 0; suivant(); };\n"
  + "      s.onerror = function () {\n"
  + "        s.onload = s.onerror = null;\n"
  + "        if (s.parentNode) s.parentNode.removeChild(s);\n"
  + "        if (++essais <= 2) setTimeout(function () {\n"
  + "          var reprendre = function () { suivant(); };\n"
  + '          if (typeof fetch !== "function") return reprendre();\n'
  + '          fetch(scripts[i][0], { cache: "reload" })\n'
  + "            .then(function (r) { return r.arrayBuffer(); })\n"
  + "            .then(reprendre, reprendre);\n"
  + "        }, 1000 * essais);\n"
  + '        else if (window.console) console.error("PASSIO : " + scripts[i][0] + " ne se charge pas, l\'application ne démarre pas.");\n'
  + "      };\n"
  + "      document.body.appendChild(s);\n"
  + "    })();\n"
  + "  });\n"
  + '  if (document.documentElement.classList.contains("passio-locked")) {\n'
  + '    document.addEventListener("input", function () {\n'
  + '      scripts.forEach(function (x) { lier("prefetch", x[0]); });\n'
  + "    }, { once: true, capture: true });\n"
  + "  }\n"
  + "})();\n"
  + "</script>";
html = html.slice(0, startMark) + loader + html.slice(endMark + "<!-- BUILD:APP-END -->".length);
html = html.replace(EMOJI_TAG, "<!-- emoji-misc.js + passion-context.js : inclus dans le 9e script (app/app-09-…) -->");

// 2. CSS : EXTERNALISÉ dans dist/styles.css (avant le 2026-07-15 : inline dans le
//    HTML). index.html est servi en no-store → les ~230 Ko de CSS inline étaient
//    re-téléchargés À CHAQUE visite. Externalisé avec cache-busting par contenu
//    (?v=<hash>, cf. _headers : /styles.css immutable), il n'est téléchargé qu'une
//    fois par version — et le <link> reste dans les premiers octets du HTML, donc
//    découvert immédiatement par le preload-scanner (pas de flash sans style).
//    ⚠️ LA FEUILLE PORTE L'EMPREINTE `integrity` (sha384) DE SES OCTETS SERVIS, ET UNE
//    REPRISE (2026-11-10). Le cas des 9 scripts (étape 1), pour la feuille : Netlify
//    ignore le `?v=`, et pendant un retour arrière de C vers A
//    (scripts/rollback-netlify.mjs, une restauration instantanée), une demande de
//    l'adresse de C reçoit la feuille de A, en 200 `immutable` — une page C partie juste
//    avant la bascule (cache HTTP), ou le worker de C qui s'installe (son cache,
//    `FICHIERS_VERSION`). Quand C revient à l'identique, l'appareil appliquait la feuille
//    de A jusqu'au prochain changement de la feuille (11 versions sur 151 en 30 jours,
//    jusqu'à 33 jours d'écart) : des styles de C manquants, sans une erreur ni une
//    demande au serveur. Mesuré sous Chromium et WebKit, dans les deux caches. Avec
//    `integrity`, le navigateur REFUSE ces octets.
//    ⚠️ UNE FEUILLE REFUSÉE LAISSE LA PAGE SANS STYLES — pire que le défaut. D'où la
//    reprise, posée AVANT le <link> : son `error` part avant que le moindre script du
//    <body> ne s'exécute (ils attendent la feuille), un écouteur posé plus tard ne le
//    verrait jamais. Au refus, elle pose TOUT DE SUITE, à la place du <link> refusé, un
//    <link> de SECOURS sans empreinte : la page prend la feuille que gardent les caches
//    (celle de l'autre version) au lieu de rester nue. Puis, le secours réglé, elle
//    redemande l'adresse au réseau (`fetch(…, { cache: "reload" })`, que le worker honore
//    — sw.js — et qui remplace l'entrée du cache HTTP), et pose JUSTE APRÈS le secours un
//    <link> AVEC l'empreinte : chargé, il retire le secours ; refusé (pendant la bascule
//    elle-même, le site sert encore l'autre version), il se retire, et la page garde le
//    secours — comme avant ce lot. Toujours à la place du <link> d'origine : l'ordre des
//    feuilles fait la cascade, et app-05 ajoute au <head>, APRÈS la feuille, les <style>
//    des réglages de l'utilisateur (thème, police, taille, arrondi).
//    ⚠️ LE SECOURS D'ABORD, LA REDEMANDE ENSUITE (relecture `audit-passio`, même jour) :
//    la première version redemandait d'abord et ne reposait un <link> qu'au retour du
//    réseau — un réseau qui cale (tunnel, portail captif) laissait la page SANS styles
//    aussi longtemps que la redemande ne se réglait pas, et chaque reprise montrait un
//    éclair sans styles (médiane 0,2 à 0,9 s mesurée). Jamais une page sans styles :
//    pour une feuille, deux versions mêlées un instant sont un défaut visuel, l'absence
//    de styles serait pire — à l'inverse des scripts, qui s'arrêtent.
//    Verrou : app-scripts-par-fichier.spec.js ⑨ (cache HTTP) ⑩ (cache du worker), deux
//    moteurs. Contrôle des octets servis, et de la présence de la reprise :
//    scripts/verifier-integrite-app.js.
const CSS_TAG = '  <link rel="stylesheet" href="styles.css" />';
if (!html.includes(CSS_TAG)) throw new Error("Tag <link styles.css> introuvable dans index.html");
const css = read("styles.css");
const cssHash = crypto.createHash("sha1").update(css).digest("hex").slice(0, 10);
const cssRef = "styles.css?v=" + cssHash;
// `cssIntegrite` : celle des octets écrits ici ; l'étape 2 bis la remplace par celle des
// octets minifiés quand elle minifie.
let cssIntegrite = sri(css);
const repriseFeuille = ""
  + "  <script>\n"
  + "/* Reprise de la feuille de style (scripts/build.js, étape 2). Elle porte l'empreinte\n"
  + "   de ses octets : celle d'une autre version restée en cache est refusée. Tout de\n"
  + "   suite, à sa place, un secours SANS empreinte (la feuille que gardent les caches) :\n"
  + "   jamais une page sans styles. Puis on redemande l'adresse au réseau, et un <link>\n"
  + "   AVEC l'empreinte, posé juste après le secours, le retire s'il se charge. Posée\n"
  + "   AVANT le <link> : son échec part avant les scripts du <body>, qui attendent la\n"
  + "   feuille. */\n"
  + "(function () {\n"
  + "  var fait = false;\n"
  + '  document.addEventListener("error", function (e) {\n'
  + "    var l = e.target;\n"
  + '    if (fait || !l || l.tagName !== "LINK" || !l.parentNode || !/^styles\\.css\\?v=[0-9a-f]+$/.test(l.getAttribute("href") || "")) return;\n'
  + "    fait = true;\n"
  + '    var adresse = l.getAttribute("href"), integrite = l.getAttribute("integrity"), relance = false;\n'
  + "    var lien = function (empreinte) {\n"
  + '      var n = document.createElement("link");\n'
  + '      n.rel = "stylesheet";\n'
  + '      if (empreinte) n.setAttribute("integrity", empreinte);\n'
  + "      n.href = adresse;\n"
  + "      return n;\n"
  + "    };\n"
  + "    var secours = lien(null);\n"
  + "    var redemander = function () {\n"
  + '      if (relance || !integrite || typeof fetch !== "function") return;\n'
  + "      relance = true;\n"
  + "      var poser = function () {\n"
  + "        if (!secours.parentNode) return;\n"
  + "        var n = lien(integrite);\n"
  + "        n.onload = function () { if (secours.parentNode) secours.parentNode.removeChild(secours); };\n"
  + "        n.onerror = function () { if (n.parentNode) n.parentNode.removeChild(n); };\n"
  + "        secours.parentNode.insertBefore(n, secours.nextSibling);\n"
  + "      };\n"
  + '      fetch(adresse, { cache: "reload" })\n'
  + "        .then(function (r) { return r.arrayBuffer(); })\n"
  + "        .then(poser, poser);\n"
  + "    };\n"
  + "    secours.onload = secours.onerror = redemander;\n"
  + "    l.parentNode.replaceChild(secours, l);\n"
  + "  }, true);\n"
  + "})();\n"
  + "  </script>\n";
html = html.replace(CSS_TAG, () => repriseFeuille + '  <link rel="stylesheet" href="' + cssRef + '" integrity="' + cssIntegrite + '" />');

// 3. Les gardes sont chargés juste après telemetry.js :
//    - identity-transition observe les POST telemetry_events avant le bloc app ;
//    - release-guard connaît déjà PASSIO_RELEASE au moment de son initialisation.
//    Le HTML est coupé devant telemetry.js : le contrat de release s'y posera à
//    l'étape 5, une fois connu le buildId qu'il porte lui-même.
const TELEMETRY_TAG = '  <script src="js/telemetry.js"></script>';
const posTelemetry = html.indexOf(TELEMETRY_TAG);
if (posTelemetry === -1) throw new Error("Tag telemetry.js introuvable");
const htmlAvantContrat = html.slice(0, posTelemetry);
const htmlApresContrat = TELEMETRY_TAG + "\n"
  + '  <script src="js/identity-transition.js"></script>\n'
  + '  <script src="js/release-guard.js"></script>'
  + html.slice(posTelemetry + TELEMETRY_TAG.length);

// 4. Scripts individuels restants (uniquement src="js/…")
const inliner = (morceau) => morceau.replace(/^([ \t]*)<script src="(js\/[^"]+)"><\/script>$/gm,
  (m, indent, file) => indent + "<script>\n" + read(file) + indent + "</script>");
const pageAvantContrat = inliner(htmlAvantContrat);
const pageApresContrat = inliner(htmlApresContrat);

// 5. Contrat de release — UNE identité commune au navigateur, au cockpit et à
//    Sentinel. Le buildId ne dépend PAS d'un timestamp : deux builds des mêmes
//    sources produisent le même identifiant. Le commit est une preuve additionnelle
//    quand Netlify/GitHub la fournit, jamais une valeur inventée en local.
//    ⚠️ IL COUVRE TOUT CE QUE LA PAGE EXÉCUTE : le HTML avec ses scripts inlinés
//    (dont le chargeur, qui porte l'empreinte de chacun des 9 scripts), le texte
//    des 9 scripts du bloc app et le CSS. Calculé avant l'inlining jusqu'au 2026-11-04, il ignorait
//    telemetry.js, platform.js, first-run.js, ui-v*… : une version qui ne changeait
//    qu'eux gardait son buildId, et aucun worker ne se réinstallait.
//    ⚠️ RIEN DE CE QUE PORTE LE CONTRAT N'Y ENTRE, ni le commit ni la cible Supabase :
//    ils sont posés APRÈS le calcul, entre les deux morceaux (pas de dépendance
//    circulaire). Sinon un commit de documentation changerait l'identifiant, et
//    chaque déploiement rechargerait toutes les pages ouvertes (pwa-detect.js).
//    Verrou : tests/unit/build-id.test.mjs.
const commitRef = process.env.COMMIT_REF || process.env.GITHUB_SHA || null;
const buildId = crypto.createHash("sha1")
  .update(pageAvantContrat).update("\0").update(pageApresContrat)
  .update("\0").update(appJs).update("\0").update(css)
  .digest("hex").slice(0, 12);
const release = {
  schema: 1,
  buildId,
  appHash,
  cssHash,
  commit: commitRef,
  builtAt: process.env.PASSIO_BUILD_TIME || null,
};

// SUP-04 (2026-09-14) : un artefact construit avec PASSIO_SUPABASE_URL et
// PASSIO_SUPABASE_ANON vise CE projet (aperçu de PR sur le staging) — le
// script est posé avant telemetry.js et le bloc app, donc avant app-08, qui
// le lit (`_cibleSupabase`). Sans les deux variables : rien n'est écrit, la
// production. Une seule des deux = erreur, pas un silence.
const cibleUrl = (process.env.PASSIO_SUPABASE_URL || "").trim(), cibleAnon = (process.env.PASSIO_SUPABASE_ANON || "").trim();
if (!!cibleUrl !== !!cibleAnon) throw new Error("PASSIO_SUPABASE_URL et PASSIO_SUPABASE_ANON vont ensemble (une seule des deux est posée)");
if (cibleUrl && !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(cibleUrl)) throw new Error("PASSIO_SUPABASE_URL doit être https://<ref>.supabase.co");
const cibleBootstrap = cibleUrl
  ? '  <script>window.PASSIO_SUPABASE_CIBLE=' + JSON.stringify({ url: cibleUrl, anon: cibleAnon }).replace(/</g, "\\u003c") + ';</script>\n'
  : "";
if (cibleUrl) console.log("cible Supabase de l'artefact : " + cibleUrl + " (PAS la production)");
const releaseBootstrap = '  <script>window.PASSIO_RELEASE=' + JSON.stringify(release).replace(/</g, "\\u003c") + ';</script>';
html = pageAvantContrat + cibleBootstrap + releaseBootstrap + "\n" + pageApresContrat;

// 6. Service worker : même buildId que le contrat de release. Une modif réelle
//    change cet identifiant → dist/sw.js change → le navigateur réinstalle le SW.
//    Le contrat et le cache parlent ainsi EXACTEMENT de la même release.
let sw = read("sw.js");
const swBefore = sw;
sw = sw.replace(/const CACHE = "passio-v"\s*\+\s*Date\.now\(\);/,
  `const CACHE = "passio-v${buildId}"; // auto-bump build`);
if (sw === swBefore) throw new Error("Ligne CACHE de sw.js introuvable — auto-bump SW cassé");
//    Les fichiers versionnés de la version (les 9 scripts app/ et la feuille de
//    style), que le worker met en cache à son installation en RECOPIANT de l'ancien
//    cache ceux qui n'ont pas changé (sw.js, `install`) : sans cette liste, une mise
//    à jour retéléchargeait les 9 scripts sous WebKit (2026-11-09). Elle ne fait pas
//    un second buildId : leurs empreintes sont déjà dans le sien.
const swAvantFichiers = sw;
sw = sw.replace(/const FICHIERS_VERSION = \[\];/,
  "const FICHIERS_VERSION = " + JSON.stringify([...appScripts.map(s => "./" + s.ref), "./" + cssRef]) + "; // build");
if (sw === swAvantFichiers) throw new Error("Ligne FICHIERS_VERSION de sw.js introuvable — les fichiers de la version ne seraient plus gardés d'une mise à jour à l'autre");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
// Les 9 scripts du bloc app (étape 1), sous leur nom de source. Un dist/app.js
// laissé par un build d'avant le 2026-11-09 est retiré : personne ne le charge
// plus, et un banc qui le relirait mesurerait un fichier périmé.
const appDir = path.join(path.dirname(outPath), "app");
fs.mkdirSync(appDir, { recursive: true });
for (const s of appScripts) fs.writeFileSync(path.join(appDir, s.nom), s.contenu);

// 1 bis. LA MINIFICATION DES 9 SCRIPTS SE FAIT ICI, PLUS DANS LE WORKFLOW (2026-11-10).
//    L'empreinte `integrity` de la page (étape 1) doit être celle des octets SERVIS :
//    calculée ici puis minifiée par `.github/workflows/deploy.yml`, elle aurait
//    désigné un fichier que personne ne reçoit, et la production entière se serait
//    arrêtée sur son premier script. Même commande que l'ancienne étape du workflow
//    (`terser <f> --compress --mangle`, le terser figé par le lockfile : mêmes octets,
//    vérifié), même repli sur le fichier brut si elle échoue — l'empreinte suit
//    alors le brut. ⚠️ SANS `--toplevel` : aucun nom de premier niveau n'est renommé
//    ni retiré, et c'est par eux que les 9 scripts classiques se parlent.
//    ⚠️ LE buildId NE BOUGE PAS (étape 5) : il a été calculé sur la page qui cite les
//    empreintes des sources, et seules les empreintes sont remplacées ici, chacune à
//    son unique place. Un build local rend donc le buildId servi — ce qui permet de
//    vérifier la production depuis le poste. Le `?v=` reste l'empreinte de la source.
//    ⚠️ UNE MISE À JOUR DE TERSER change les octets servis sous les mêmes `?v=` : chaque
//    appareil refuse une fois ce qu'il garde (`integrity`) et le redemande (la
//    reprise, une seconde par script) — le prix d'une version de terser, pas un défaut.
//    Contrôle, après la minification de la page : scripts/verifier-integrite-app.js.
//    La feuille de style suit le même chemin (étape 2 bis, juste après).
if (process.env.PASSIO_MINIFIER_APP === "1") {
  const terser =require.resolve("terser/bin/terser", { paths: [root] });
  for (const s of appScripts) {
    const f = path.join(appDir, s.nom);
    try {
      execFileSync(process.execPath, [terser, f, "-o", f + ".min", "--compress", "--mangle"], { stdio: "pipe", timeout: 120000 });
      fs.renameSync(f + ".min", f);
    } catch (e) {
      try { fs.unlinkSync(f + ".min"); } catch (_e) { /* rien à retirer */ }
      console.log("::warning title=Minification::Minification de app/" + s.nom + " échouée, fichier brut servi : " + String((e && e.message) || e).split("\n")[0]);
    }
    const servie = sri(fs.readFileSync(f));
    if (servie === s.integrite) continue;
    const citee = JSON.stringify(s.integrite);
    const n = html.split(citee).length - 1;
    if (n !== 1) throw new Error("app/" + s.nom + " : son empreinte figure " + n + " fois dans la page, 1 attendue");
    html = html.replace(citee, () => JSON.stringify(servie));
    s.integrite = servie;
  }
}

// 2 bis. LA FEUILLE DE STYLE EST MINIFIÉE ICI AUSSI, PLUS DANS LE WORKFLOW (2026-11-10).
//    Même raison que l'étape 1 bis : l'empreinte `integrity` du <link> (étape 2) doit être
//    celle des octets SERVIS, et `.github/workflows/deploy.yml` minifiait la feuille APRÈS
//    le build. Même commande que l'ancienne étape du workflow (`cleancss -o <sortie>
//    <entrée>`, le clean-css-cli figé par le lockfile, réglages par défaut : mêmes octets,
//    comparés à la feuille que servait la production), même repli sur le fichier brut si
//    elle échoue — l'empreinte suit alors le brut. ⚠️ LE `?v=` ET LE buildId NE BOUGENT
//    PAS : ce sont les empreintes de la SOURCE (`cssHash`, étape 5) ; seule l'empreinte
//    `integrity` est remplacée, à son unique place. ⚠️ UNE MISE À JOUR DE CLEAN-CSS change
//    les octets servis sous le même `?v=` : chaque appareil refuse une fois la feuille
//    qu'il garde et la redemande (la reprise) — le prix d'une version, pas un défaut ;
//    clean-css-cli est figé (5.6.3, sans `^`).
const feuilleServie = path.join(path.dirname(outPath), "styles.css");
fs.writeFileSync(feuilleServie, css);
let tailleFeuille = Buffer.byteLength(css);
if (process.env.PASSIO_MINIFIER_APP === "1") {
  const cleancss = require.resolve("clean-css-cli/bin/cleancss", { paths: [root] });
  try {
    execFileSync(process.execPath, [cleancss, "-o", feuilleServie + ".min", feuilleServie], { stdio: "pipe", timeout: 120000 });
    fs.renameSync(feuilleServie + ".min", feuilleServie);
  } catch (e) {
    try { fs.unlinkSync(feuilleServie + ".min"); } catch (_e) { /* rien à retirer */ }
    // `::warning` : une annotation dans le résumé du run — le déploiement reste vert avec
    // une feuille brute de 489 Ko, mais il le dit (relecture `audit-passio`, 2026-11-10).
    console.log("::warning title=Minification::Minification de styles.css échouée, fichier brut servi : " + String((e && e.message) || e).split("\n")[0]);
  }
  const octetsServis = fs.readFileSync(feuilleServie);
  tailleFeuille = octetsServis.length;
  const servie = sri(octetsServis);
  if (servie !== cssIntegrite) {
    const citee = JSON.stringify(cssIntegrite);
    const n = html.split(citee).length - 1;
    if (n !== 1) throw new Error("styles.css : son empreinte figure " + n + " fois dans la page, 1 attendue");
    html = html.replace(citee, () => JSON.stringify(servie));
    cssIntegrite = servie;
  }
}
fs.writeFileSync(outPath, html);
const ancienAppJs = path.join(path.dirname(outPath), "app.js");
if (fs.existsSync(ancienAppJs)) fs.unlinkSync(ancienAppJs);
fs.writeFileSync(path.join(path.dirname(outPath), "sw.js"), sw);
fs.writeFileSync(path.join(path.dirname(outPath), "release.json"), JSON.stringify(release, null, 2) + "\n");

// 7. Données servies À LA DEMANDE (data/*.json) — recopiées telles quelles.
//    ⚠️ ELLES NE DOIVENT SURTOUT PAS PASSER PAR L'ÉTAPE 4 : celle-ci inline
//    tout `<script src="js/…">` dans le monolithe. Le référentiel des passions
//    (≈ 568 Ko) atterrirait alors sur le chemin critique du démarrage, pour une
//    donnée dont la plupart des sessions n'ont jamais besoin. C'est un JSON,
//    chargé par `fetch` au premier usage réel de la recherche.
//
//    La copie vit ICI et pas dans le workflow de déploiement, pour que
//    `node scripts/build.js` produise un `dist/` complet et testable en local —
//    un asset qui n'existe qu'en CI est un asset qu'on découvre manquant en
//    production.
const dataDir = path.join(root, "data");
if (fs.existsSync(dataDir)) {
  const cible = path.join(path.dirname(outPath), "data");
  fs.mkdirSync(cible, { recursive: true });
  let nData = 0;
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.endsWith(".json")) continue;   // les sources .js du référentiel restent hors de dist
    fs.copyFileSync(path.join(dataDir, f), path.join(cible, f));
    nData++;
  }
  if (nData) console.log("  + data/ :", nData, "fichier(s) JSON copié(s)");
}
// 8. Bibliothèques AUTO-HÉBERGÉES (js/vendor/*) — chargées à la demande par les
//    loaders (supabase-loader.js, map-loader.js), donc jamais inlinées à l'étape 4,
//    donc à copier ICI. Même règle que data/ : un asset qui n'existe qu'en CI est
//    un asset qu'on découvre manquant en production.
const vendorDir = path.join(root, "js", "vendor");
if (fs.existsSync(vendorDir)) {
  const cible = path.join(path.dirname(outPath), "js", "vendor");
  fs.mkdirSync(cible, { recursive: true });
  let nVendor = 0;
  for (const f of fs.readdirSync(vendorDir)) {
    if (!/\.(js|css)$/.test(f)) continue;
    fs.copyFileSync(path.join(vendorDir, f), path.join(cible, f));
    nVendor++;
  }
  console.log("  + js/vendor/ :", nVendor, "fichier(s) copié(s)");
}
// 8 bis. La POLICE des titres (fonts/) — servie par PASSIO depuis le 2026-11-08, au lieu de Google
//    Fonts à chaque ouverture (audit de sécurité du 06/11, G-03). Même règle que data/ : copiée ICI.
const fontsDir = path.join(root, "fonts");
if (fs.existsSync(fontsDir)) {
  const cible = path.join(path.dirname(outPath), "fonts");
  fs.mkdirSync(cible, { recursive: true });
  let nFonts = 0;
  for (const f of fs.readdirSync(fontsDir)) {
    if (!/\.(woff2|txt)$/.test(f)) continue;
    fs.copyFileSync(path.join(fontsDir, f), path.join(cible, f));
    nFonts++;
  }
  console.log("  + fonts/ :", nFonts, "fichier(s) copié(s)");
}
// 9. Le PILOTAGE NUAGE (pilotage/) — page téléphone autonome, hors du monolithe
//    (ses scripts ne doivent jamais être inlinés dans l'app). Copié tel quel,
//    même règle que data/ et js/vendor/ : un asset qui n'existe qu'en CI est un
//    asset qu'on découvre manquant en production.
const pilotageDir = path.join(root, "pilotage");
if (fs.existsSync(pilotageDir)) {
  const cible = path.join(path.dirname(outPath), "pilotage");
  fs.cpSync(pilotageDir, cible, { recursive: true });
  console.log("  + pilotage/ : copié");
}
console.log("Build OK →", outPath,
  "(", Buffer.byteLength(html), "octets ) + app/ :", appScripts.length, "scripts (", Buffer.byteLength(appJs),
  "octets, ensemble v=" + appHash + ") + styles.css (", tailleFeuille,
  "octets servis, v=" + cssHash + ") + sw.js + release.json (build " + buildId + ")");
