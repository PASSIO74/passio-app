#!/usr/bin/env node
/**
 * audit-echappement.js — traque les données interpolées dans du HTML SANS passer
 * par un désinfectant valable POUR LE CONTEXTE d'insertion.
 *
 * Pourquoi un détecteur plutôt qu'une relecture : deux fonctions de rendu pèsent
 * à elles seules 322 Ko (openVlogViewer 3 779 lignes, openEventDetails 2 501).
 * Aucune relecture humaine ni aucun modèle ne les lit sérieusement d'un bout à
 * l'autre, et les découper en fragments ferait juger la forme au lieu du fond.
 * Ce qui est mécanique — « cette expression atteint-elle le DOM sans helper ? » —
 * se vérifie exhaustivement par balayage. Le jugement, lui, reste humain : le
 * script CLASSE par contexte et ne prétend jamais qu'un signalement est une faille.
 *
 * ⚠️ LE CONTEXTE DÉCIDE (cf. CLAUDE.md). Un désinfectant n'est pas « bon » dans
 * l'absolu, il l'est pour UN emplacement :
 *   escapeHtml   → texte HTML, attribut ordinaire. PAS un onclick : le HTML
 *                  décode `&#39;` AVANT le parse JS, l'apostrophe revient.
 *                  PAS une URL : il ne bloque pas `javascript:`.
 *   escapeJsArg  → argument de chaîne JS simple-quotée dans un attribut on*.
 *   safeUrlAttr  → URL d'un autre utilisateur, dans src/href/poster.
 *   _cssColor / _cssUrl / avatarBg → valeur posée dans un attribut style.
 *
 * Usage :
 *   node scripts/audit-echappement.js            # tous les signalements
 *   node scripts/audit-echappement.js --ci       # échoue si un contexte À RISQUE
 *                                                # (url / on* / style) sort du socle
 *   node scripts/audit-echappement.js --socle    # régénère le socle (à RELIRE)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const CHEMIN_SOCLE = path.join(__dirname, "echappement-socle.json");

/**
 * Ce qui DÉSINFECTE réellement, et POUR QUELS contextes.
 *
 * ⚠️ N'inscrire ici que ce qui a été LU. `passioThumb` y figurait à tort : il
 * TRANSFORME une URL Storage et renvoie l'entrée INCHANGÉE quand ce n'en est pas
 * une (js/app-02:600). Le compter comme une protection masquait les sites où une
 * URL hostile traversait intacte — un outil qui rassure à tort est pire qu'aucun
 * outil. Symétriquement, ne PAS inscrire un désinfectant réel (c'était le cas de
 * `avatarBg`, qui passe par `_cssColor`/`_cssUrl`) noie le rapport sous des faux
 * positifs, et un rapport bruyant finit ignoré : les deux erreurs coûtent cher.
 */
const DESINFECTANTS = {
  // Pourcent-encode tout ce qui est structurel : sûr partout.
  encodeURIComponent: ["url", "onclick", "style", "attr", "texte"],
  // Rendent un NOMBRE (ou NaN) : aucune quote ne peut en sortir, nulle part.
  Number: ["url", "onclick", "style", "attr", "texte"],
  parseInt: ["url", "onclick", "style", "attr", "texte"],
  parseFloat: ["url", "onclick", "style", "attr", "texte"],
  escapeHtml:  ["texte", "attr"],
  escapeJsArg: ["onclick", "texte", "attr"],
  safeUrlAttr: ["url", "attr"],
  // js/app-02 : refuse " ' < > ; { } url( expression( @import → reste dans la
  // déclaration CSS et dans l'attribut.
  _cssColor:   ["style"],
  // js/app-02 : n'accepte que http(s)/blob/data:image;base64 et pourcent-encode
  // quotes, parenthèses et espaces.
  _cssUrl:     ["style", "url"],
  // js/app-02 : compose les deux précédents.
  avatarBg:    ["style"],
  // js/app-02 : renvoie escapeHtml(emoji ou initiale).
  avatarInner: ["texte"],
};
const NOMS_DESINFECTANTS = Object.keys(DESINFECTANTS);

/** Contextes où une sortie d'attribut donne une exécution : le socle les garde. */
const CONTEXTES_A_RISQUE = new Set(["url", "onclick", "style"]);

const LIBELLE = {
  url: "attribut d'URL",
  onclick: "attribut on*",
  style: "attribut style",
  attr: "autre attribut",
  texte: "texte HTML",
};
const ATTENDU = {
  url: "safeUrlAttr",
  onclick: "escapeJsArg",
  style: "_cssColor / _cssUrl",
  attr: "escapeHtml",
  texte: "escapeHtml",
};

/**
 * Expressions sûres SANS désinfectant, quel que soit le contexte. Chacune est
 * justifiée : on ne met ici que ce dont la valeur ne peut pas venir d'autrui.
 */
const SURES = [
  /^[0-9]+$/,                           // littéral numérique
  /^["'`][^"'`]*["'`]$/,                // littéral chaîne
  /^(true|false|null|undefined)$/,
  /^(i|j|n|idx|index)$/,                // compteur de boucle
  /^Math\./,
  /^Date\.now\(\)$/,
  /^[A-Z_][A-Z0-9_]*$/,                 // CONSTANTE du projet
];

/**
 * Retire de l'expression tout appel `desinfectant(…)` VALABLE POUR CE CONTEXTE,
 * parenthèses appariées comprises, et rend ce qui reste.
 *
 * Tester la simple PRÉSENCE du nom (l'ancienne version) déclarait sûre une
 * expression seulement à moitié couverte — `escapeHtml(a) + b`, ou un ternaire
 * dont une seule branche est échappée. C'est exactement la forme qu'on cherche.
 */
function resteApresDesinfectants(expr, ctx) {
  let s = expr;
  let encore = true;
  while (encore) {
    encore = false;
    for (const nom of NOMS_DESINFECTANTS) {
      if (!DESINFECTANTS[nom].includes(ctx)) continue; // ne protège pas ICI
      const i = s.indexOf(nom + "(");
      if (i === -1) continue;
      let prof = 0, j = i + nom.length;
      for (; j < s.length; j++) {
        if (s[j] === "(") prof++;
        else if (s[j] === ")") { prof--; if (prof === 0) break; }
      }
      if (j >= s.length) continue;           // parenthèse non fermée : on laisse
      s = s.slice(0, i) + " SUR " + s.slice(j + 1);
      encore = true;
    }
  }
  return s;
}

/** Reste-t-il, après retrait des désinfectants, un accès à une donnée ? */
function porteEncoreDeLaDonnee(reste) {
  const nu = reste
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, " ")   // littéraux chaîne
    // La CONDITION d'un ternaire n'est jamais insérée, seules ses branches le sont :
    // `liked ? "❤️" : "🤍"` n'expose pas `liked`. Sans cette coupe, tout rendu
    // conditionnel — le style dominant du projet — remontait en faux positif.
    // (`?.` et `??` ne sont pas des ternaires : exclus par la sentinelle.)
    .replace(/[^?:]+\?(?![.?])/g, " ")
    .replace(/\bSUR\b/g, " ")                    // trous laissés par les helpers
    .replace(/[?:|&+!()[\]{},<>=*/%-]|\s/g, " ") // opérateurs et ponctuation
    .replace(/\b\d+\b/g, " ");
  const restes = nu.split(/\s+/).filter(Boolean);
  return restes.some((t) => !/^(true|false|null|undefined|typeof|new|Math|window)$/.test(t));
}

function estSure(expr, ctx) {
  const e = expr.trim();
  if (!e) return true;
  if (SURES.some((r) => r.test(e))) return true;
  return !porteEncoreDeLaDonnee(resteApresDesinfectants(e, ctx));
}

/** Devine le contexte d'insertion à partir de ce qui précède l'interpolation. */
function contexte(avant) {
  // Les quotes ÉCHAPPÉES du source JS (`onclick="fn(\'…`) ne ferment aucun
  // attribut HTML, mais elles cassaient la reconnaissance ci-dessous : tout un
  // pan de handlers construits par concaténation était classé « texte HTML »,
  // donc hors du périmètre tenu par --ci. On les neutralise avant d'analyser.
  const q = avant.replace(/\\["']/g, "_").slice(-400);

  // On cherche le dernier attribut OUVERT : son guillemet d'ouverture est capturé,
  // et on n'exige l'absence que de CE guillemet jusqu'ici.
  //
  // ⚠️ La version précédente refusait toute quote intermédiaire — or un handler
  // en contient légitimement (`onerror="this.src='…'"`). Deux XSS réelles du
  // 2026-08-15 (identifiant de carnet dans un onerror et dans un onclick de like)
  // étaient de ce fait classées « autre attribut », donc HORS du périmètre tenu
  // par --ci. C'est le test e2e, pas l'audit, qui les a trouvées.
  const ouvert = q.match(/\b([a-z-]+|xlink:href)\s*=\s*(["'`])((?:(?!\2).)*)$/i);
  if (ouvert) {
    const nom = ouvert[1].toLowerCase();
    if (/^on[a-z]+$/.test(nom)) return "onclick";
    if (/^(src|href|poster|action|formaction|data|xlink:href)$/.test(nom)) return "url";
    if (nom === "style") return "style";
    return "attr";
  }
  if (/<[a-z][^>]*$/i.test(q)) return "attr";
  return "texte";
}

/** Le bloc ressemble-t-il à du HTML ? (sinon l'interpolation n'atteint pas le DOM) */
function ressembleAHtml(s) {
  return /<[a-z!/][^>]*>/i.test(s) || /\b(class|style|src|href|onclick)\s*=/i.test(s);
}

function analyser(fichier) {
  const src = fs.readFileSync(path.join(RACINE, fichier), "utf8");
  const lignes = src.split(/\r?\n/);
  const trouves = [];
  const pousser = (ligne, expr, ctx) =>
    trouves.push({ fichier, ligne, expr: expr.trim().slice(0, 90), ctx });

  // 1) Interpolations `${…}`, balayées sur TOUT le fichier.
  //
  // ⚠️ La version précédente découpait d'abord les littéraux gabarits avec
  // /`…`/ — une regex incapable de gérer l'IMBRICATION : dans
  // `<img … ${c.cover ? `<img src="…${c.id}…">` : ""}>`, le bloc s'arrêtait au
  // backtick intérieur et tout ce qu'il contenait échappait à l'analyse. Une XSS
  // réelle (identifiant de carnet dans un onerror) vivait exactement là. On juge
  // désormais chaque interpolation sur le TEXTE QUI LA PRÉCÈDE, ce qui rend le
  // découpage en blocs inutile : le contexte se lit de proche en proche.
  const FENETRE = 400;
  const interp = /\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let x;
  while ((x = interp.exec(src)) !== null) {
    // ⚠️ Reprendre JUSTE APRÈS le `${` et non après le match entier : une
    // interpolation extérieure engloutit sinon celles qu'elle contient, qui ne
    // sont alors jamais jugées. `${c.cover ? `…${c.id}…` : ""}` était déclaré sûr
    // sur son seul ternaire extérieur, pendant que `c.id` filait brut dans un
    // onerror. Chaque `${` obtient ainsi son propre verdict, avec son contexte.
    interp.lastIndex = x.index + 2;

    const avant = src.slice(Math.max(0, x.index - FENETRE), x.index);
    if (!ressembleAHtml(avant)) continue;      // l'interpolation n'atteint pas le DOM
    const ctx = contexte(avant);
    if (estSure(x[1], ctx)) continue;
    pousser(src.slice(0, x.index).split(/\r?\n/).length, x[1], ctx);
  }

  // 2) Concaténations : "…<div …" + expr + "…"
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!ressembleAHtml(l)) continue;
    // Deux formes après `+` : un accès direct (`u.name`) OU une expression
    // parenthésée (`(u.avatar || "#7c3aed")`). N'accepter que la première laissait
    // passer le repli `|| valeur` — la forme la PLUS courante du projet pour les
    // couleurs et emojis d'autrui. Deux vrais sites y ont échappé.
    const conc = /["']\s*\+\s*(\((?:[^()]|\([^()]*\))*\)|[A-Za-z_$][\w$.[\]()'"]*)\s*\+\s*["']/g;
    let c;
    while ((c = conc.exec(l)) !== null) {
      const ctx = contexte(l.slice(0, c.index));
      if (estSure(c[1], ctx)) continue;
      pousser(i + 1, c[1], ctx);
    }
  }
  return trouves;
}

/**
 * Clé d'un signalement pour le socle : fichier + contexte + expression, JAMAIS le
 * numéro de ligne (une insertion plus haut invaliderait tout le socle et le rendrait
 * ingérable, donc ignoré).
 */
const cle = (r) => `${r.fichier} | ${r.ctx} | ${r.expr}`;

function tousLesSignalements() {
  const fichiers = fs.readdirSync(path.join(RACINE, "js"))
    .filter((f) => f.endsWith(".js")).sort().map((f) => "js/" + f);
  return fichiers.flatMap(analyser);
}

function lireSocle() {
  if (!fs.existsSync(CHEMIN_SOCLE)) return null;
  const j = JSON.parse(fs.readFileSync(CHEMIN_SOCLE, "utf8"));
  return new Map((j.acceptes || []).map((e) => [e.cle, e.raison]));
}

function main() {
  const args = process.argv.slice(2);
  const ci = args.includes("--ci");
  const regen = args.includes("--socle");
  const json = args.includes("--json");
  const tous = tousLesSignalements();
  const risque = tous.filter((r) => CONTEXTES_A_RISQUE.has(r.ctx));

  if (json) { console.log(JSON.stringify(tous, null, 1)); return; }

  if (regen) {
    const socle = lireSocle() || new Map();
    const vues = new Set();
    const acceptes = risque
      .filter((r) => !vues.has(cle(r)) && vues.add(cle(r)))  // même site répété = une entrée
      .map((r) => ({
        cle: cle(r),
        raison: socle.get(cle(r)) || "⚠️ À RELIRE — aucune justification écrite",
      }));
    fs.writeFileSync(CHEMIN_SOCLE, JSON.stringify({
      _lisezmoi: "Signalements en contexte À RISQUE (url/on*/style) relus et jugés " +
        "sans danger. Chaque entrée DOIT porter une raison vérifiable. Régénérer : " +
        "node scripts/audit-echappement.js --socle",
      acceptes,
    }, null, 2) + "\n");
    console.log(`Socle écrit : ${acceptes.length} entrée(s) → ${path.relative(RACINE, CHEMIN_SOCLE)}`);
    return;
  }

  if (ci) {
    const socle = lireSocle();
    if (!socle) { console.error("Socle absent : lancer --socle puis RELIRE chaque entrée."); process.exit(1); }
    const nouveaux = risque.filter((r) => !socle.has(cle(r)));
    if (nouveaux.length === 0) {
      console.log(`OK — ${risque.length} signalement(s) en contexte à risque, tous dans le socle relu.`);
      return;
    }
    console.error(`\n  ✗ ${nouveaux.length} interpolation(s) NON RELUE(S) en contexte à risque :\n`);
    for (const r of nouveaux) {
      console.error(`    ${r.fichier}:${r.ligne}  [${LIBELLE[r.ctx]}]  attendu : ${ATTENDU[r.ctx]}`);
      console.error(`      ${r.expr}`);
    }
    console.error(
      "\n  Soit la valeur vient d'un autre compte → l'entourer du désinfectant du\n" +
      "  contexte ; soit elle est interne → l'ajouter au socle AVEC sa raison\n" +
      "  (node scripts/audit-echappement.js --socle, puis écrire la justification).\n"
    );
    process.exit(1);
  }

  console.log("\n  Audit d'échappement — données interpolées dans du HTML\n");
  const parFichier = {};
  for (const r of tous) (parFichier[r.fichier] = parFichier[r.fichier] || []).push(r);
  const parCtx = {};
  for (const [f, rs] of Object.entries(parFichier)) {
    console.log(`  ${f}  (${rs.length})`);
    for (const r of rs) {
      parCtx[r.ctx] = (parCtx[r.ctx] || 0) + 1;
      console.log(`    ${String(r.ligne).padStart(5)}  [${LIBELLE[r.ctx]}]  attendu : ${ATTENDU[r.ctx]}\n           ${r.expr}`);
    }
    console.log("");
  }
  console.log(`  ${tous.length} signalement(s) — par contexte d'insertion :`);
  for (const [c, n] of Object.entries(parCtx).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${LIBELLE[c]}${CONTEXTES_A_RISQUE.has(c) ? "  ← tenu par --ci" : ""}`);
  }
  console.log(
    "\n  ⚠️ Un signalement n'est PAS une faille : beaucoup d'expressions portent des\n" +
    "  valeurs internes (identifiants générés, contenu déjà échappé en amont). Ce\n" +
    "  script dit OÙ REGARDER, il ne conclut pas à ta place. Seuls les contextes\n" +
    "  à risque (url / on* / style) sont tenus par --ci en intégration.\n"
  );
}

main();
