#!/usr/bin/env node
/**
 * Audit — le stub Supabase hors ligne couvre-t-il la surface RÉELLEMENT appelée ?
 *
 * Le SDK Supabase est chargé en paresseux depuis un CDN (js/supabase-loader.js).
 * Tant qu'il n'est pas là — réseau coupé, CDN bloqué, chargement en cours — tout
 * passe par le stub noop `_buildNoopSupa()` de js/app-08-ui-modals-tour.js, dont
 * la promesse est explicite : « tout appel retombe dessus sans casser ».
 *
 * Cette promesse est indémontrable à l'œil : la surface PostgREST est large, et
 * un seul maillon manquant ne se voit qu'en production, hors ligne, sous la forme
 * d'un TypeError non rattrapé — donc précisément là où le stub devait protéger.
 * Mesuré le 2026-08-22 : `.not()`, `.or()`, `.update()`, `supa.storage` et
 * `supa.functions` étaient appelés par l'app et absents du stub.
 *
 * L'audit relève statiquement ce que l'app appelle sur `supa`, construit le vrai
 * stub, et échoue sur tout membre manquant.
 *
 * ⚠️ Ne relever que ce qui est chaîné LITTÉRALEMENT après `supa.from(…)` laisse
 * passer le cas le plus courant : la requête construite en plusieurs temps.
 *   let q = supa.from("posts").select(…);
 *   if (authorId) q = q.eq("author_id", authorId);
 *   await q.order(…).range(offset, offset + 59);   // app-08, chargeur du fil
 * `.range()` n'apparaît QUE là dans tout le dépôt : une première version de cet
 * audit était verte alors que `.range` manquait au stub — c'est-à-dire aveugle
 * au bug qu'il existe pour attraper (le fil restait vide, l'exception avalée par
 * son propre catch). On suit donc les VARIABLES issues de `supa.from(…)` /
 * `supa.channel(…)`, y compris réaffectées à partir d'elles-mêmes.
 *
 * Angle mort assumé : un alias posé sur `supa` lui-même (`var sb = window.supa`,
 * js/telemetry.js) n'est suivi que d'un niveau, et un `supa` passé en paramètre
 * de fonction ne l'est pas du tout. Le stub couvre aujourd'hui toute la surface
 * PostgREST, pas seulement les membres relevés — cet audit garde la couverture,
 * il ne la définit pas.
 *
 *   node scripts/audit-supa-stub.js
 */
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const FICHIER_STUB = path.join(RACINE, "js", "app-08-ui-modals-tour.js");

/** Extrait le source de `_buildNoopSupa` et l'évalue, sans charger toute l'app. */
function construireStub() {
  const src = fs.readFileSync(FICHIER_STUB, "utf8");
  const debut = src.indexOf("function _buildNoopSupa() {");
  if (debut === -1) throw new Error("_buildNoopSupa introuvable dans " + FICHIER_STUB);
  // La fonction est au premier niveau : sa fermeture est la 1re accolade en colonne 0.
  const fin = src.indexOf("\n}\n", debut);
  if (fin === -1) throw new Error("fin de _buildNoopSupa introuvable");
  const corps = src.slice(debut, fin + 3);
  return new Function(corps + "\nreturn _buildNoopSupa();")();
}

/** Consomme un appel `(...)` équilibré à partir de l'index 0 de `s`. */
function sauterAppel(s) {
  if (s[0] !== "(") return 0;
  let d = 0, i = 0;
  while (i < s.length) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") { d--; if (d === 0) return i + 1; }
    i++;
  }
  return s.length;
}

/**
 * Relève les `.methode(` enchaînés après une expression donnée.
 * `premierSeulement` : pour les objets dont chaque méthode rend une PROMESSE
 * (supa.storage.from(…)), la suite de la chaîne (.then/.catch) appartient à
 * cette promesse, pas à l'objet — l'attribuer produirait un faux manque.
 */
function chaine(src, depuis, dans, premierSeulement, dejaSurLePoint) {
  let reste = src.slice(depuis, depuis + 2000);
  if (!dejaSurLePoint) reste = reste.slice(sauterAppel(reste));
  for (;;) {
    const m = /^[\s\r\n]*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(reste);
    if (!m) return;
    dans.add(m[1]);
    if (premierSeulement) return;
    let k = m[0].length, d = 1;
    while (k < reste.length && d > 0) { if (reste[k] === "(") d++; else if (reste[k] === ")") d--; k++; }
    reste = reste.slice(k);
  }
}

/**
 * Relève les membres appelés sur les VARIABLES issues d'une expression `supa.X(…)`.
 * Deux passes : la seconde capte `q = q.eq(…)` (la variable se réalimente).
 */
function chaineParVariable(src, racine, dans) {
  const noms = new Set();
  const reDef = new RegExp(
    "(?:var|let|const)?\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*supa\\s*\\.\\s*" + racine + "\\s*\\(",
    "g"
  );
  let m;
  while ((m = reDef.exec(src))) noms.add(m[1]);
  if (!noms.size) return;

  for (let passe = 0; passe < 2; passe++) {
    for (const nom of [...noms]) {
      // Depuis `nom`, dérouler la chaîne ENTIÈRE : `q.order(…).range(…)` doit
      // livrer `order` ET `range`. Ne relever que le maillon collé à la variable
      // laissait passer `.range`, seul endroit du dépôt à l'utiliser.
      const reUse = new RegExp("\\b" + nom.replace(/\$/g, "\\$") + "(?=\\s*\\.\\s*[A-Za-z_$])", "g");
      let u;
      while ((u = reUse.exec(src))) chaine(src, reUse.lastIndex, dans, false, true);
      // `autre = nom.eq(…)` : la nouvelle variable porte le même builder.
      const reProp = new RegExp("(?:var|let|const)?\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*" + nom.replace(/\$/g, "\\$") + "\\s*\\.", "g");
      let pr;
      while ((pr = reProp.exec(src))) noms.add(pr[1]);
    }
  }
}

function releverUsages() {
  const fichiers = fs.readdirSync(path.join(RACINE, "js"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RACINE, "js", f));

  const u = {
    racine: new Set(),          // supa.X
    requete: new Set(),         // supa.from(...).X(...)
    auth: new Set(),            // supa.auth.X
    stockage: new Set(),        // supa.storage.from(...).X(...)
    fonctions: new Set(),       // supa.functions.X
    canal: new Set(),           // supa.channel(...).X(...)
  };

  for (const f of fichiers) {
    const src = fs.readFileSync(f, "utf8");
    let m;

    const reRacine = /\bsupa\s*\.\s*([A-Za-z_$][\w$]*)/g;
    while ((m = reRacine.exec(src))) u.racine.add(m[1]);

    const reFrom = /\bsupa\s*\.\s*from\s*(?=\()/g;
    while ((m = reFrom.exec(src))) chaine(src, reFrom.lastIndex, u.requete);

    const reAuth = /\bsupa\s*\.\s*auth\s*\.\s*([A-Za-z_$][\w$]*)/g;
    while ((m = reAuth.exec(src))) u.auth.add(m[1]);

    const reStock = /\bsupa\s*\.\s*storage\s*\.\s*from\s*(?=\()/g;
    while ((m = reStock.exec(src))) chaine(src, reStock.lastIndex, u.stockage, true);

    const reFn = /\bsupa\s*\.\s*functions\s*\.\s*([A-Za-z_$][\w$]*)/g;
    while ((m = reFn.exec(src))) u.fonctions.add(m[1]);

    const reCanal = /\bsupa\s*\.\s*channel\s*(?=\()/g;
    while ((m = reCanal.exec(src))) chaine(src, reCanal.lastIndex, u.canal);

    // Requêtes et canaux construits en plusieurs temps (cf. en-tête).
    chaineParVariable(src, "from", u.requete);
    chaineParVariable(src, "channel", u.canal);

    // Alias direct de `supa` (js/telemetry.js : `var sb = window.supa`).
    const reAlias = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\s*\.\s*)?supa\s*[;,\n]/g;
    while ((m = reAlias.exec(src))) {
      const reUse = new RegExp("\\b" + m[1] + "\\s*\\.\\s*([A-Za-z_$][\\w$]*)", "g");
      let a;
      while ((a = reUse.exec(src))) u.racine.add(a[1]);
    }
  }
  // `from` est relevé comme membre racine ET comme point de départ des chaînes.
  u.requete.delete("from");
  return u;
}

function main() {
  const stub = construireStub();
  const u = releverUsages();
  const manques = [];

  // Un membre est « présent » s'il est appelable (méthode) ou si c'est un objet
  // (espace de noms : supa.auth, supa.storage, supa.functions).
  const present = (v) => typeof v === "function" || (v !== null && typeof v === "object");
  const verifier = (obj, membres, chemin) => {
    for (const nom of [...membres].sort()) {
      if (!obj || !present(obj[nom])) manques.push(chemin.replace("%s", nom));
    }
  };

  verifier(stub, u.racine, "supa.%s");
  verifier(stub.from ? stub.from("t") : null, u.requete, "supa.from(…).%s");
  verifier(stub.auth, u.auth, "supa.auth.%s");
  verifier(stub.storage && stub.storage.from ? stub.storage.from("b") : null, u.stockage, "supa.storage.from(…).%s");
  verifier(stub.functions, u.fonctions, "supa.functions.%s");
  verifier(stub.channel ? stub.channel("c") : null, u.canal, "supa.channel(…).%s");

  // Sondes de FORME. Sous try/catch : si le membre manquant est un de ceux que la
  // sonde utilise elle-même (select, eq…), un TypeError brut remplacerait le
  // rapport lisible par une pile — l'échec resterait juste, mais muet sur sa cause.
  try {
    // Un builder non « thenable » casse tout `await supa.from(x).insert(y)` : la
    // valeur attendue est un objet { data, error }, pas le builder lui-même.
    const q = stub.from("t").select("*").eq("a", 1);
    if (typeof q.then !== "function") manques.push("supa.from(…) n'est pas thenable (await impossible)");
  } catch (e) {
    manques.push("sonde « builder thenable » impossible : " + e.message);
  }
  try {
    if (typeof stub.storage.from("b").getPublicUrl("p").data !== "object") {
      manques.push("supa.storage.from(…).getPublicUrl(…) ne rend pas { data: { publicUrl } }");
    }
  } catch (e) {
    manques.push("sonde « getPublicUrl » impossible : " + e.message);
  }

  const total = u.racine.size + u.requete.size + u.auth.size + u.stockage.size + u.fonctions.size + u.canal.size;
  if (manques.length) {
    console.error("❌ Stub Supabase hors ligne INCOMPLET — " + manques.length + " membre(s) appelé(s) par l'app mais absent(s) :\n");
    for (const x of manques) console.error("   • " + x);
    console.error("\nHors ligne (CDN injoignable), chacun lève un TypeError non rattrapé.");
    console.error("Corriger _buildNoopSupa() dans js/app-08-ui-modals-tour.js.");
    process.exit(1);
  }
  console.log("OK — stub Supabase hors ligne complet : " + total + " membre(s) appelé(s) par l'app, tous couverts.");
}

main();
