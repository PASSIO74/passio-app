#!/usr/bin/env node
/**
 * dossier-domaine.js — empaquette UN DOMAINE de PASSIO pour une revue par un
 * second modèle en lecture seule.
 *
 * Frère de `dossier-revue.js`, qui ne sait travailler que sur un DIFF. Pour
 * balayer l'application entière il faut pouvoir soumettre un domaine complet
 * (le fil, les messages, l'identité…) sans changement associé.
 *
 * Contrainte réelle : les fichiers applicatifs pèsent 100 à 270 Ko chacun. Les
 * coller entiers dans un chat est impossible. Le script extrait donc les
 * FONCTIONS du domaine avec leur corps ENTIER et leurs commentaires d'en-tête —
 * jamais des fragments de lignes : un relecteur qui ne voit que des morceaux
 * juge la forme, pas le fond. Et il DIT ce qu'il n'a pas inclus : le dossier
 * porte la liste de ce qui manque, pour que le relecteur sache où il est aveugle.
 *
 * Usage :
 *   node scripts/dossier-domaine.js --domaine fil
 *   node scripts/dossier-domaine.js --liste
 */

"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ *
 * Carte des domaines
 * ------------------------------------------------------------------ */

/**
 * `ancres` : noms de fonctions top-level à extraire (chaîne exacte ou RegExp).
 * `fichiers` : fichiers inclus EN ENTIER (réservé aux petits modules).
 * `focus` : ce que le relecteur doit chercher — la partie qui fait la valeur.
 */
const DOMAINES = {
  "securite-xss": {
    libelle: "Affichage de contenu d'autrui — échappement et XSS stockés",
    fichiers: [],
    // Ancres relevées sur le code, pas devinées : les trois helpers eux-mêmes, puis
    // les fonctions de rendu qui manipulent le PLUS de contenu d'autrui (mesuré par
    // le nombre d'appels d'échappement qu'elles contiennent). 150 fonctions
    // échappent du contenu dans ce dépôt : les inclure toutes noierait le relecteur.
    // Resserré sur le chemin le PLUS exposé : les tables dont le payload est
    // librement insérable par n'importe quel compte authentifié
    // (comment_interactions, event_reactions, messages média). Les gros rendus
    // d'écran — openEventDetails, openVlogViewer, renderExplorer… — pèsent à eux
    // seuls près de 400 Ko : ils feront une seconde manche, sinon le relecteur ne
    // lit plus, il survole.
    ancres: [
      /^escapeHtml$/, /^escapeJsArg$/, /^safeUrlAttr$/,
      /^_renderCommentsList$/, /^loadReelComments$/, /^_fillEventReactionDetail$/,
      /^_renderGroupMembersModal$/, /^searchUsers$/, /^_splCardHtml$/,
    ],
    focus:
      "Tout payload de `comment_interactions`, `event_reactions` ou de message média est librement insérable par n'importe quel compte authentifié. " +
      "Cherche un chemin d'affichage où un de ces payloads atteint le DOM sans passer par le bon helper. " +
      "Les trois helpers ne sont PAS interchangeables : escapeHtml = texte HTML, escapeJsArg = argument JS dans un onclick " +
      "(le HTML décode `&#39;` AVANT le parse JS), safeUrlAttr = URL fournie par un autre utilisateur.",
  },
  "ecritures-supabase": {
    libelle: "Écritures Supabase — les échecs silencieux",
    fichiers: [],
    ancres: [/^supa[A-Z]/, /^_flush/],
    focus:
      "Le SDK Supabase ne LÈVE PAS sur un refus RLS : il renvoie { error }. Une écriture dont personne ne lit `error` " +
      "reste « réussie » à l'écran et disparaît au rechargement. Cherche chaque écriture qui ignore `error`, " +
      "chaque affichage optimiste sans annulation en cas d'échec réel, et chaque écriture d'état qui RE-DÉDUIT " +
      "l'action d'une lecture préalable au lieu d'envoyer l'INTENTION de l'utilisateur.",
  },
  "etat-sync": {
    libelle: "État local, persistance et synchronisation cross-appareil",
    fichiers: ["js/idb-store.js"],
    ancres: [/^saveState$/, /^loadState$/, /^_syncableState$/, /^supaSaveUserState/, /^supaLoadUserState$/, /^_applyUserState$/, /^_flushPendingUserState$/, /^_queuePendingUserState$/, /^_clearPendingUserState$/, /^_markStateSynced$/, /^_scheduleStateSync$/],
    focus:
      "Perte de données, écrasement d'un état plus récent, double écriture, quota localStorage, cycle de vie mobile " +
      "(gel d'onglet, bfcache, kill par l'OS). `updated_at` est généré CÔTÉ CLIENT alors que la colonne a un DEFAULT now().",
  },
  fil: {
    libelle: "Fil d'actualité — classement et rendu",
    fichiers: [],
    ancres: [/^rankFeedPosts$/, /^renderFeed/, /^likePost$/, /^findPostAnywhere$/, /^_feedDom/],
    focus:
      "Le classement doit rester stable et explicable. Côté rendu : écrire dans #feedList ou #storiesRowFeed sans " +
      "invalider `_feedDomSig`/`_lastHtml` fait sauter le prochain render (guard no-op). Cherche aussi les recherches " +
      "de post qui n'utilisent pas `findPostAnywhere` et oublient donc les vrais posts réseau.",
  },
  "auth-identite": {
    libelle: "Authentification, identité et isolation entre comptes",
    // idb-store.js entier (3 Ko) : `idbConvClear` n'y est pas une fonction
    // top-level, l'extraction par ancre ne l'attrape pas — et c'est précisément
    // la fonction qui vide le store durable des conversations à la déconnexion.
    fichiers: ["js/idb-store.js"],
    // Ancres relevées sur le code (les noms maison ne suivent pas la convention
    // supaSignIn/signOut qu'on pourrait deviner).
    ancres: [
      /^doLogout$/, /^openLogoutConfirm$/, /^onbDoAuth$/, /^onbGoogleAuth$/, /^onbSkipAuth$/,
      /^exitLandingAsAuth$/, /^currentProfile$/, /^cacheRemoteProfile$/, /^supaUpsertProfile$/,
      /^_primeProfileCache$/, /^_fetchProfile$/, /^hydrateConvsFromIDB$/,
      // ⚠️ Sans purgeAccountScopedData, le relecteur voit `doLogout` DÉLÉGUER toute
      // l'isolation à une fonction absente du dossier : il ne peut alors rien
      // conclure sur la fuite entre comptes, qui est justement la question centrale
      // du domaine. Un dossier doit contenir la fonction qui fait le travail, pas
      // seulement celle qui l'appelle.
      /^purgeAccountScopedData$/, /^idbConvClear$/, /^discardPendingStateSave$/,
    ],
    focus:
      "L'identité est le user_id, jamais l'appareil. Cherche ce qui SURVIT à une déconnexion et pourrait fuiter vers " +
      "le compte suivant sur le même appareil (localStorage, IndexedDB, caches en mémoire), et tout endroit où un " +
      "pseudo est traité comme une identité.",
  },
  "messages-realtime": {
    libelle: "Messagerie et livraison temps réel",
    // idb-store.js entier : les conversations ont un SECOND store durable, et la
    // perte de messages se joue dans la fusion entre les deux.
    fichiers: ["js/idb-store.js"],
    // Ancres relevées sur le code. On prend la chaîne COMPLÈTE d'un message :
    // envoi → persistance locale (localStorage + IndexedDB) → fusion → rendu,
    // plus l'abonnement realtime. Sans le maillon de fusion (`_unionConvsById`,
    // `deduplicateConversations`), un relecteur ne peut pas juger la perte de
    // messages — c'est la leçon de la manche identité.
    ancres: [
      /^sendMessageFp$/, /^saveConversations$/, /^saveConversationsNow$/,
      /^hydrateConvsFromIDB$/, /^_unionConvsById$/, /^deduplicateConversations$/,
      /^purgeConvDuplicates$/, /^getConversations$/, /^openConversation$/,
      /^_supaConvSpecificChannel$/, /^_subscribeTyping$/, /^startDirectMessage$/,
    ],
    focus:
      "Livraison cross-compte, ordre des messages, doublons, perte au rechargement. Jamais de requête dans " +
      "`onAuthStateChange` (deadlock). Jamais de base64 en base.",
  },
  "medias-storage": {
    libelle: "Médias — upload, Storage, downscale",
    fichiers: [],
    ancres: [/^supaUploadMedia$/, /^downscale/, /^fileToDataUrl$/, /^supaPublishStory$/],
    focus:
      "Jamais de base64 en base (→ Storage). Cherche les uploads dont l'échec passe inaperçu, les médias qui restent " +
      "en data: URL, et les fichiers orphelins créés quand l'insert qui suit échoue.",
  },
  "pwa-offline": {
    libelle: "PWA — service worker, cache, mise à jour",
    fichiers: ["js/pwa-detect.js", "js/platform.js", "manifest.json"],
    ancres: [/^registerSW/, /^_swUpdate/, /^checkForUpdate/],
    focus:
      "Une version en cache qui ne se met jamais à jour, un service worker qui sert du contenu périmé, " +
      "une installation qui échoue silencieusement.",
  },
  telemetrie: {
    libelle: "Télémétrie et centre de pilotage — fuite de PII",
    fichiers: ["js/telemetry.js"],
    ancres: [],
    focus:
      "Le filtre PII est une LISTE BLANCHE. Cherche tout champ qui pourrait la contourner, tout contenu de message " +
      "ou base64 qui pourrait partir, et toute donnée permettant de ré-identifier une personne par recoupement.",
  },
};

/* ------------------------------------------------------------------ *
 * Extraction de fonctions top-level avec corps entier
 * ------------------------------------------------------------------ */

/** Remonte les lignes de commentaire qui précèdent immédiatement `i`. */
function enteteCommentaire(lignes, i) {
  const out = [];
  for (let j = i - 1; j >= 0; j--) {
    const l = lignes[j];
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) out.unshift(l);
    else break;
  }
  return out;
}

/**
 * Extrait les fonctions top-level dont le nom satisfait un des motifs.
 * Les fonctions top-level de ce projet commencent en colonne 0 : on s'appuie
 * dessus pour délimiter le corps par comptage d'accolades, en ignorant les
 * accolades situées dans une chaîne ou un commentaire.
 */
function extraireFonctions(source, motifs) {
  const lignes = source.split(/\r?\n/);
  const trouvees = [];
  const decl = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

  for (let i = 0; i < lignes.length; i++) {
    const m = decl.exec(lignes[i]);
    if (!m) continue;
    const nom = m[1];
    if (!motifs.some((p) => (p instanceof RegExp ? p.test(nom) : p === nom))) continue;

    // Corps : de la ligne de déclaration jusqu'à l'accolade fermante de même niveau.
    let profondeur = 0, demarre = false, fin = i;
    for (let j = i; j < lignes.length; j++) {
      const l = depouiller(lignes[j]);
      for (const c of l) {
        if (c === "{") { profondeur++; demarre = true; }
        else if (c === "}") profondeur--;
      }
      if (demarre && profondeur <= 0) { fin = j; break; }
      fin = j;
    }

    const entete = enteteCommentaire(lignes, i);
    trouvees.push({
      nom,
      ligne: i + 1 - entete.length,
      texte: entete.concat(lignes.slice(i, fin + 1)).join("\n"),
    });
    i = fin;
  }
  return trouvees;
}

/** Retire chaînes et commentaires d'une ligne pour ne compter que les vraies accolades. */
function depouiller(ligne) {
  let out = "", i = 0;
  while (i < ligne.length) {
    const c = ligne[i];
    if (c === "/" && ligne[i + 1] === "/") break;
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < ligne.length && ligne[i] !== q) { if (ligne[i] === "\\") i++; i++; }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Programme principal
 * ------------------------------------------------------------------ */

function lireArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--liste") args.liste = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
  }
  return args;
}

function main() {
  const args = lireArgs(process.argv.slice(2));

  if (args.liste || !args.domaine) {
    console.log("\n  Domaines disponibles :\n");
    for (const [id, d] of Object.entries(DOMAINES)) console.log(`    ${id.padEnd(20)} ${d.libelle}`);
    console.log("\n  Usage : node scripts/dossier-domaine.js --domaine <id>\n");
    process.exit(args.liste ? 0 : 2);
  }

  const dom = DOMAINES[args.domaine];
  if (!dom) {
    console.error(`\n  Domaine inconnu : ${args.domaine}. Utiliser --liste.\n`);
    process.exit(2);
  }

  const jsFiles = fs.readdirSync(path.join(RACINE, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f);

  const d = new Date();
  const dateIso = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  const sortie = path.join(RACINE, ".passio", "reviews", `domaine-${args.domaine}-${dateIso}`);
  fs.mkdirSync(sortie, { recursive: true });

  console.log(`\n  Dossier de domaine — ${dom.libelle}\n`);

  /* --- Extraction --- */
  const blocs = [];
  let nbFonctions = 0;
  for (const f of jsFiles) {
    if (!dom.ancres.length) break;
    const src = fs.readFileSync(path.join(RACINE, f), "utf8");
    const fns = extraireFonctions(src, dom.ancres);
    if (!fns.length) continue;
    nbFonctions += fns.length;
    blocs.push(
      `\n## ${f}\n\n` +
        fns.map((fn) => `### ${fn.nom}()  — ${f}:${fn.ligne}\n\n\`\`\`js\n${fn.texte}\n\`\`\`\n`).join("\n")
    );
    console.log(`    ${f.padEnd(32)} ${fns.length} fonction(s)`);
  }

  /* --- Fichiers inclus en entier --- */
  const entiers = [];
  for (const f of dom.fichiers) {
    const src = path.join(RACINE, f);
    if (!fs.existsSync(src)) continue;
    const contenu = fs.readFileSync(src, "utf8");
    const ext = path.extname(f).slice(1) || "txt";
    entiers.push(`\n## ${f} (fichier entier)\n\n\`\`\`${ext}\n${contenu}\n\`\`\`\n`);
    console.log(`    ${f.padEnd(32)} entier (${(contenu.length / 1024).toFixed(0)} Ko)`);
  }

  /* --- Ce que le relecteur NE voit PAS : la liste honnête --- */
  const inventaire = jsFiles
    .map((f) => `- \`${f}\` — ${(fs.statSync(path.join(RACINE, f)).size / 1024).toFixed(0)} Ko`)
    .join("\n");

  const conventions = ["CLAUDE.md", "docs/PIEGES_CONNUS.md"]
    .filter((f) => fs.existsSync(path.join(RACINE, f)))
    .map((f) => {
      fs.mkdirSync(path.join(sortie, "conventions"), { recursive: true });
      fs.copyFileSync(path.join(RACINE, f), path.join(sortie, "conventions", path.basename(f)));
      return f;
    });

  const doc = `# Revue de domaine — ${dom.libelle}

PASSIO, PWA vanilla JS (pas de framework, pas de bundler) + Supabase. 17 scripts
partagent \`window\`, l'ordre de chargement fait foi (hoisting), les fonctions
top-level deviennent des globales.

Tu es relecteur indépendant **en lecture seule** : aucun accès au dépôt, à la base
de production ni au déploiement. Tu juges uniquement sur ce document.

## Ce que tu dois chercher

${dom.focus}

## Ce que j'attends

Chaque remarque doit être **falsifiable** : séquence concrète → état attendu →
état obtenu. Une remarque sans scénario sera écartée. Classe par gravité réelle,
pas par facilité de détection. **Dis explicitement ce que tu ne peux pas vérifier**
depuis ce document plutôt que de le supposer. Pas de reformulation du code, pas de
conseils de style : la syntaxe et les audits maison sont verts.

## ⚠️ Ce que tu ne vois PAS

Ce document contient ${nbFonctions} fonction(s) extraite(s) avec leur corps entier${entiers.length ? ` et ${entiers.length} fichier(s) complet(s)` : ""},
sélectionnées pour ce domaine. Le reste de l'application n'y est pas. Inventaire
complet des sources, pour que tu saches où tu es aveugle :

${inventaire}

Ne sont pas non plus inclus : \`index.html\` (111 Ko), \`styles.css\` (298 Ko), le
schéma SQL de production, les policies RLS et les migrations. Si une conclusion en
dépend, demande-la au lieu de la supposer.

## Conventions du projet

Jointes séparément : ${conventions.join(", ")}.
${entiers.join("\n")}${blocs.join("\n")}
`;

  fs.writeFileSync(path.join(sortie, "DOSSIER-DOMAINE.md"), doc, "utf8");

  console.log(`\n  Dossier écrit : ${path.relative(RACINE, sortie)}`);
  console.log(`    ${nbFonctions} fonction(s), ${(doc.length / 1024).toFixed(0)} Ko`);
  console.log(`  À joindre au chat du relecteur : ${path.join(path.relative(RACINE, sortie), "DOSSIER-DOMAINE.md")}\n`);
}

main();
