"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// UN LECTEUR YAML FERMÉ POUR LES WORKFLOWS GITHUB (ASTRA-52, cinquième
// contre-revue Astra, 2026-09-15).
//
// Pourquoi pas une bibliothèque : le job `audits` de la CI n'installe aucune
// dépendance (checkout + node, ~40 s, aucun secret), et une gate qui exige
// `npm ci` pour tourner ne tournerait pas. Pourquoi pas des expressions
// régulières ligne à ligne : c'est exactement ce qu'ASTRA-52 a mis en défaut
// (`on` en tableau ou en scalaire, indentation de quatre espaces,
// `secrets['…']`, `|| true`, commentaire en fin de ligne, `pull_request_target`).
//
// LE CONTRAT : ce lecteur comprend le sous-ensemble de YAML que les workflows
// du dépôt emploient — mappings et séquences par indentation, séquences et
// mappings en accolades/crochets SIMPLES, scalaires nus / entre guillemets /
// en bloc (`|`, `>`, avec `-`/`+`), commentaires. TOUT LE RESTE (ancres `&`,
// alias `*`, étiquettes `!`, documents multiples `---`, clés complexes `?`,
// accolades imbriquées, indicateur d'indentation explicite `|2`, saut de ligne
// autre que LF ou CRLF) LÈVE une erreur : une forme inconnue ne doit jamais
// être certifiée sûre — la gate rend alors ROUGE, pas vert. Les blancs sont
// ceux de YAML : l'espace et la tabulation, rien d'autre.
// Les scalaires sont rendus en CHAÎNES (aucune conversion de type : `on` reste
// la clé « on », `true` reste « true ») ; c'est ce que l'audit attend.
// ═══════════════════════════════════════════════════════════════════════════

class ErreurYaml extends Error { constructor(m, ligne) { super(m + (ligne != null ? " (ligne " + ligne + ")" : "")); this.name = "ErreurYaml"; this.ligne = ligne; } }

// Retire un commentaire de fin de ligne, hors guillemets. `#` n'ouvre un
// commentaire que précédé d'une espace ou d'une tabulation (ou en début de
// ligne) : les seuls blancs de YAML (§ 6.6). ⚠️ 2026-11-15 (relecture adverse
// de la PR #920) : un `\s` de JavaScript prenait une espace insécable pour un
// blanc — `echo ok<U+00A0># ; npm install` perdait sa commande ici, quand
// GitHub et bash la gardent ; et `trim()` effaçait un U+00A0 final.
const blanc = (c) => c === " " || c === "\t";
const sansBlancs = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");
function sansCommentaire(l) {
  let out = "", q = null;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { out += c; if (c === q && l[i - 1] !== "\\") q = null; continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    if (c === "#" && (i === 0 || blanc(l[i - 1]))) break;
    out += c;
  }
  return out.replace(/[ \t]+$/, "");
}
const indentDe = (l) => l.length - l.replace(/^ */, "").length;

// ⚠️ ASTRA-62 : LES MAPPINGS SONT DES OBJETS SANS PROTOTYPE, ET UNE CLÉ NE
// S'ÉCRIT QU'UNE FOIS. Un job nommé `__proto__` posé sur `{}` devenait le
// PROTOTYPE de l'objet : `Object.entries(jobs)` ne le voyait plus, GitHub si —
// un job invisible pour la gate, exécuté par GitHub. Avec un objet sans
// prototype, `__proto__` est une clé comme une autre. Et une clé en double
// (deux `if:` sur le même job) n'a pas de lecture certaine : refusée.
function mappingVide() { return Object.create(null); }
function poser(o, cle, valeur, ligne) {
  if (Object.prototype.hasOwnProperty.call(o, cle)) throw new ErreurYaml("clé en double : " + String(cle).slice(0, 40), ligne);
  o[cle] = valeur;
}

function scalaire(texte, ligne) {
  const t = sansBlancs(texte);
  if (t === "") return "";
  if (/^[&*!]/.test(t) || t.startsWith("? ")) throw new ErreurYaml("forme YAML non prise en charge : " + t.slice(0, 20), ligne);
  if (t[0] === "'" ) { if (!t.endsWith("'") || t.length < 2) throw new ErreurYaml("guillemet simple non fermé", ligne); return t.slice(1, -1).replace(/''/g, "'"); }
  if (t[0] === '"') {
    if (!t.endsWith('"') || t.length < 2) throw new ErreurYaml("guillemet double non fermé", ligne);
    // ⚠️ ASTRA-62 : ENSEMBLE FERMÉ d'échappements. YAML en connaît une vingtaine
    // (s, \x73, \N, \_, \L…) qui recomposent un mot que la gate compare
    // (« pull_request ») ; les lire à moitié, c'est certifier un texte que
    // GitHub ne lira pas. Tout échappement hors de {\" \\ \n \t} lève.
    const corps = t.slice(1, -1);
    let out = "";
    for (let i = 0; i < corps.length; i++) {
      const c = corps[i];
      if (c !== "\\") { out += c; continue; }
      const n = corps[++i];
      if (n === '"') out += '"'; else if (n === "\\") out += "\\"; else if (n === "n") out += "\n"; else if (n === "t") out += "\t";
      else throw new ErreurYaml("échappement YAML non pris en charge : \\" + (n === undefined ? "" : n), ligne);
    }
    return out;
  }
  if (t[0] === "[") return flux(t, "[", "]", ligne);
  if (t[0] === "{") return flux(t, "{", "}", ligne);
  return t;
}
// Séquence `[a, b]` ou mapping `{a: b}` SIMPLES : aucune imbrication.
// ⚠️ 2026-11-15 (relecture adverse de la PR #920) : le découpage aux virgules
// se fait HORS des scalaires cités. `{ run: 'echo ''x'', ; npm install' }` est
// UN scalaire pour YAML ; coupé à sa virgule, il devenait `echo 'x'` plus une
// clé que personne ne lisait. Un guillemet n'ouvre un scalaire cité qu'en tête
// d'élément ou de valeur (`a'b` reste un scalaire nu) ; un crochet ou une
// accolade cités ne sont pas une imbrication (`"${{ inputs.y }}"`).
// ⚠️ Même jour, relecture suivante : dans une SÉQUENCE en ligne, une entrée
// `clé: valeur` est un mapping pour YAML (`steps: [ run: '…' ]` est une
// étape) ; rendue comme un texte, elle échappait à toutes les règles. Elle
// lève, comme toute autre imbrication.
function decouperFlux(corps, ligne, sequence) {
  const parts = [];
  let cur = "", q = null;
  const fin = () => {
    // Un `:` suivi d'un blanc (ou de la fin), hors des scalaires cités : l'entrée est une paire `clé: valeur`.
    if (sequence && /:(?:[ \t]|$)/.test(cur.replace(/'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"/g, "''"))) throw new ErreurYaml("entrée « clé: valeur » d'une séquence en ligne : non prise en charge", ligne);
    parts.push(cur);
    cur = "";
  };
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    if (q === "'") { cur += c; if (c === "'") { if (corps[i + 1] === "'") { cur += "'"; i++; } else q = null; } continue; }
    if (q === '"') { cur += c; if (c === "\\" && i + 1 < corps.length) cur += corps[++i]; else if (c === '"') q = null; continue; }
    if ((c === "'" || c === '"') && /(?:^[ \t]*|:[ \t]+)$/.test(cur)) { q = c; cur += c; continue; }
    if (c === "[" || c === "]" || c === "{" || c === "}") throw new ErreurYaml("collection en ligne imbriquée : non prise en charge", ligne);
    if (c === ",") { fin(); continue; }
    cur += c;
  }
  if (q) throw new ErreurYaml("guillemet non fermé dans une collection en ligne", ligne);
  fin();
  return parts.map(sansBlancs).filter((x) => x !== "");
}
function flux(t, ouvre, ferme, ligne) {
  if (!t.endsWith(ferme)) throw new ErreurYaml("collection en ligne non fermée", ligne);
  const parts = decouperFlux(sansBlancs(t.slice(1, -1)), ligne, ouvre === "[");
  if (ouvre === "[") return parts.map((p) => scalaire(p, ligne));
  const o = mappingVide();
  for (const p of parts) { const m = /^([^:]+):[ \t]*(.*)$/.exec(p); if (!m) throw new ErreurYaml("mapping en ligne illisible : " + p, ligne); poser(o, scalaire(m[1], ligne), scalaire(m[2], ligne), ligne); }
  return o;
}

/** Lit un document YAML (sous-ensemble) et rend un objet JS. Lève ErreurYaml sinon. */
function lireYaml(texte) {
  // Seuls LF et CRLF coupent une ligne ici. Un CR seul, NEL, U+2028 ou U+2029
  // couperaient une ligne pour un autre lecteur (YamlDotNet, celui du runner, en
  // tient certains pour des sauts de ligne) : sans lecture certaine, refusé.
  const t = String(texte).replace(new RegExp("^" + String.fromCharCode(0xfeff)), "");
  const sauts = new RegExp("\\r(?!\\n)|[" + String.fromCharCode(0x85, 0x2028, 0x2029) + "]");
  const s = sauts.exec(t);
  if (s) throw new ErreurYaml("saut de ligne que ce lecteur ne lit pas (U+" + s[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") + ")", t.slice(0, s.index).split("\n").length);
  const brut = t.split(/\r?\n/);
  const lignes = brut.map((l, i) => ({ n: i + 1, brute: l, t: sansCommentaire(l) }));
  if (lignes.some((l) => /^(---|\.\.\.)[ \t]*$/.test(l.t) && l.n > 1)) throw new ErreurYaml("documents multiples : non pris en charge");
  let pos = 0;
  while (pos < lignes.length && (sansBlancs(lignes[pos].t) === "" || /^---[ \t]*$/.test(lignes[pos].t))) pos++;

  function suivanteUtile(i) { while (i < lignes.length && sansBlancs(lignes[i].t) === "") i++; return i; }

  // Scalaire en bloc (`|`, `>`, `|-`, `>+`…) : les lignes plus indentées que `indentParent`.
  // ⚠️ 2026-11-14 (relecture adverse de la PR #920) : un indicateur d'indentation EXPLICITE (`|2`, `>1-`) fixe
  // l'indentation du contenu, donc ce qui est « plus indenté » dans un bloc replié — l'ignorer, c'était replier
  // ce que YAML garde ligne à ligne. Aucun workflow ne s'en sert : il lève.
  function bloc(indic, indentParent, i, ligneDeb) {
    const plie = indic[0] === ">";
    const chomp = indic.slice(1);
    if (/^[|>](?:[-+]?[0-9]|[0-9][-+]?)$/.test(indic)) throw new ErreurYaml("indicateur d'indentation explicite : non pris en charge : " + indic, ligneDeb);
    if (!/^[|>][-+]?$/.test(indic)) throw new ErreurYaml("indicateur de bloc inconnu : " + indic, ligneDeb);
    const corps = [];
    let indentBloc = -1;
    while (i < lignes.length) {
      const l = lignes[i];
      if (sansBlancs(l.brute) === "") { corps.push(""); i++; continue; }
      const ind = indentDe(l.brute);
      if (indentBloc < 0) { if (ind <= indentParent) break; indentBloc = ind; }
      if (ind < indentBloc) break;
      corps.push(l.brute.slice(indentBloc));
      i++;
    }
    while (corps.length && corps[corps.length - 1] === "") corps.pop();
    let s = plie ? replier(corps) : corps.join("\n");
    if (chomp !== "-") s += "\n";
    return { valeur: s, pos: i };
  }
  // Le pliage de YAML 1.2 (§ 8.1.3) : deux lignes de texte voisines se joignent par une espace ; une ligne vide
  // entre elles devient un saut de ligne ; autour d'une ligne PLUS indentée, les sauts de ligne restent. Joindre
  // tout par une espace faisait de `npm ci` suivi d'un `--ignore-scripts` plus indenté une seule commande, alors
  // que le shell lance `npm ci` seul, avec les scripts (relecture adverse de la PR #920, 2026-11-14).
  function replier(corps) {
    let s = "";
    let prec = null;
    let vides = 0;
    for (const c of corps) {
      if (c === "") { vides++; continue; }
      const plusIndentee = /^[ \t]/.test(c);
      if (prec === null) s += "\n".repeat(vides);
      else if (prec === "texte" && !plusIndentee) s += vides ? "\n".repeat(vides) : " ";
      else s += "\n".repeat(vides + 1);
      s += c;
      prec = plusIndentee ? "indentee" : "texte";
      vides = 0;
    }
    return s;
  }

  // Lit un nœud dont les lignes ont l'indentation `indent` ; rend { valeur, pos }.
  function noeud(i, indent) {
    i = suivanteUtile(i);
    if (i >= lignes.length) return { valeur: "", pos: i };
    const l = lignes[i];
    if (indentDe(l.brute) !== indent) throw new ErreurYaml("indentation inattendue", l.n);
    if (/^[ \t]*-([ \t]|$)/.test(l.t)) return sequence(i, indent);
    return mapping(i, indent);
  }

  function sequence(i, indent) {
    const out = [];
    while (i < lignes.length) {
      i = suivanteUtile(i);
      if (i >= lignes.length) break;
      const l = lignes[i];
      const ind = indentDe(l.brute);
      if (ind < indent) break;
      if (ind > indent) throw new ErreurYaml("indentation inattendue dans une séquence", l.n);
      const m = /^[ \t]*-(?:[ \t]+(.*))?$/.exec(l.t);
      if (!m) break;
      const reste = sansBlancs(m[1] || "");
      if (reste === "") { const r = noeud(i + 1, indentDeSuivante(i + 1, indent)); out.push(r.valeur); i = r.pos; continue; }
      if (/^[|>]/.test(reste)) { const r = bloc(reste, indent, i + 1, l.n); out.push(r.valeur); i = r.pos; continue; }
      // `- clé: valeur` : un mapping qui commence sur la ligne du tiret.
      if (/^[^'"\[{][^:]*:([ \t]|$)/.test(reste) || /^['"][^'"]*['"][ \t]*:([ \t]|$)/.test(reste)) {
        const indentCle = ind + 2 + (l.t.indexOf(reste) - l.t.indexOf("-") - 1 - 1);
        // On réécrit virtuellement la ligne comme si la clé était à `ind + 2`.
        const virt = { n: l.n, brute: " ".repeat(ind + 2) + reste, t: " ".repeat(ind + 2) + reste };
        const sauv = lignes[i]; lignes[i] = virt;
        const r = mapping(i, ind + 2);
        lignes[i] = sauv; void indentCle;
        out.push(r.valeur); i = r.pos; continue;
      }
      out.push(scalaire(reste, l.n)); i++;
    }
    return { valeur: out, pos: i };
  }
  function indentDeSuivante(i, minimum) { i = suivanteUtile(i); if (i >= lignes.length) return minimum + 1; const ind = indentDe(lignes[i].brute); if (ind <= minimum) throw new ErreurYaml("valeur attendue, plus indentée", lignes[i].n); return ind; }

  function mapping(i, indent) {
    const out = mappingVide();
    while (i < lignes.length) {
      i = suivanteUtile(i);
      if (i >= lignes.length) break;
      const l = lignes[i];
      const ind = indentDe(l.brute);
      if (ind < indent) break;
      if (ind > indent) throw new ErreurYaml("indentation inattendue dans un mapping", l.n);
      if (/^[ \t]*-([ \t]|$)/.test(l.t)) break;                       // une séquence au même niveau : fin du mapping
      const m = /^[ \t]*('[^']*'|"[^"]*"|[^ \t:'"][^:]*?)[ \t]*:(?:[ \t]+(.*))?$/.exec(l.t);
      if (!m) throw new ErreurYaml("ligne illisible : " + sansBlancs(l.t).slice(0, 40), l.n);
      const cle = scalaire(m[1], l.n);
      if (typeof cle !== "string") throw new ErreurYaml("clé non scalaire", l.n);
      const reste = sansBlancs(m[2] || "");
      if (reste === "") {
        const j = suivanteUtile(i + 1);
        if (j >= lignes.length || indentDe(lignes[j].brute) <= indent && !(/^[ \t]*-([ \t]|$)/.test(lignes[j].t) && indentDe(lignes[j].brute) === indent)) { poser(out, cle, "", l.n); i++; continue; }
        // Une séquence peut être au MÊME niveau que sa clé (`on:\n- push`) : YAML l'admet.
        const r = noeud(j, indentDe(lignes[j].brute));
        poser(out, cle, r.valeur, l.n); i = r.pos; continue;
      }
      if (/^[|>]/.test(reste)) { const r = bloc(reste, indent, i + 1, l.n); poser(out, cle, r.valeur, l.n); i = r.pos; continue; }
      poser(out, cle, scalaire(reste, l.n), l.n); i++;
    }
    return { valeur: out, pos: i };
  }

  if (pos >= lignes.length) return mappingVide();
  const racine = noeud(pos, indentDe(lignes[pos].brute));
  const reste = suivanteUtile(racine.pos);
  if (reste < lignes.length) throw new ErreurYaml("contenu inattendu après la racine", lignes[reste].n);
  return racine.valeur;
}

module.exports = { lireYaml, ErreurYaml, sansCommentaire };
