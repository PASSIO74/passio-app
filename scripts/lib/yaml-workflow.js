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
// accolades imbriquées) LÈVE une erreur : une forme inconnue ne doit jamais
// être certifiée sûre — la gate rend alors ROUGE, pas vert.
// Les scalaires sont rendus en CHAÎNES (aucune conversion de type : `on` reste
// la clé « on », `true` reste « true ») ; c'est ce que l'audit attend.
// ═══════════════════════════════════════════════════════════════════════════

class ErreurYaml extends Error { constructor(m, ligne) { super(m + (ligne != null ? " (ligne " + ligne + ")" : "")); this.name = "ErreurYaml"; this.ligne = ligne; } }

// Retire un commentaire de fin de ligne, hors guillemets. `#` n'ouvre un
// commentaire que précédé d'un blanc (ou en début de ligne).
function sansCommentaire(l) {
  let out = "", q = null;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { out += c; if (c === q && l[i - 1] !== "\\") q = null; continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(l[i - 1]))) break;
    out += c;
  }
  return out.replace(/\s+$/, "");
}
const indentDe = (l) => l.length - l.replace(/^ */, "").length;

function scalaire(texte, ligne) {
  const t = texte.trim();
  if (t === "") return "";
  if (/^[&*!]/.test(t) || t.startsWith("? ")) throw new ErreurYaml("forme YAML non prise en charge : " + t.slice(0, 20), ligne);
  if (t[0] === "'" ) { if (!t.endsWith("'") || t.length < 2) throw new ErreurYaml("guillemet simple non fermé", ligne); return t.slice(1, -1).replace(/''/g, "'"); }
  if (t[0] === '"') { if (!t.endsWith('"') || t.length < 2) throw new ErreurYaml("guillemet double non fermé", ligne); return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\"); }
  if (t[0] === "[") return flux(t, "[", "]", ligne);
  if (t[0] === "{") return flux(t, "{", "}", ligne);
  return t;
}
// Séquence `[a, b]` ou mapping `{a: b}` SIMPLES : aucune imbrication.
function flux(t, ouvre, ferme, ligne) {
  if (!t.endsWith(ferme)) throw new ErreurYaml("collection en ligne non fermée", ligne);
  const corps = t.slice(1, -1).trim();
  if (/[\[\]{}]/.test(corps)) throw new ErreurYaml("collection en ligne imbriquée : non prise en charge", ligne);
  const parts = corps === "" ? [] : corps.split(",").map((x) => x.trim()).filter((x) => x !== "");
  if (ouvre === "[") return parts.map((p) => scalaire(p, ligne));
  const o = {};
  for (const p of parts) { const m = /^([^:]+):\s*(.*)$/.exec(p); if (!m) throw new ErreurYaml("mapping en ligne illisible : " + p, ligne); o[scalaire(m[1], ligne)] = scalaire(m[2], ligne); }
  return o;
}

/** Lit un document YAML (sous-ensemble) et rend un objet JS. Lève ErreurYaml sinon. */
function lireYaml(texte) {
  const brut = String(texte).split(/\r?\n/);
  const lignes = brut.map((l, i) => ({ n: i + 1, brute: l, t: sansCommentaire(l) }));
  if (lignes.some((l) => /^(---|\.\.\.)\s*$/.test(l.t) && l.n > 1)) throw new ErreurYaml("documents multiples : non pris en charge");
  let pos = 0;
  while (pos < lignes.length && (lignes[pos].t.trim() === "" || /^---\s*$/.test(lignes[pos].t))) pos++;

  function suivanteUtile(i) { while (i < lignes.length && lignes[i].t.trim() === "") i++; return i; }

  // Scalaire en bloc (`|`, `>`, `|-`, `>+`…) : les lignes plus indentées que `indentParent`.
  function bloc(indic, indentParent, i, ligneDeb) {
    const plie = indic[0] === ">";
    const chomp = indic.slice(1);
    if (!/^[|>][-+]?[0-9]?$/.test(indic)) throw new ErreurYaml("indicateur de bloc inconnu : " + indic, ligneDeb);
    const corps = [];
    let indentBloc = -1;
    while (i < lignes.length) {
      const l = lignes[i];
      if (l.brute.trim() === "") { corps.push(""); i++; continue; }
      const ind = indentDe(l.brute);
      if (indentBloc < 0) { if (ind <= indentParent) break; indentBloc = ind; }
      if (ind < indentBloc) break;
      corps.push(l.brute.slice(indentBloc));
      i++;
    }
    while (corps.length && corps[corps.length - 1] === "") corps.pop();
    let s = plie ? corps.join(" ").replace(/  +/g, " ") : corps.join("\n");
    if (chomp !== "-") s += "\n";
    return { valeur: s, pos: i };
  }

  // Lit un nœud dont les lignes ont l'indentation `indent` ; rend { valeur, pos }.
  function noeud(i, indent) {
    i = suivanteUtile(i);
    if (i >= lignes.length) return { valeur: "", pos: i };
    const l = lignes[i];
    if (indentDe(l.brute) !== indent) throw new ErreurYaml("indentation inattendue", l.n);
    if (/^\s*-(\s|$)/.test(l.t)) return sequence(i, indent);
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
      const m = /^\s*-(?:\s+(.*))?$/.exec(l.t);
      if (!m) break;
      const reste = (m[1] || "").trim();
      if (reste === "") { const r = noeud(i + 1, indentDeSuivante(i + 1, indent)); out.push(r.valeur); i = r.pos; continue; }
      if (/^[|>]/.test(reste)) { const r = bloc(reste, indent, i + 1, l.n); out.push(r.valeur); i = r.pos; continue; }
      // `- clé: valeur` : un mapping qui commence sur la ligne du tiret.
      if (/^[^'"\[{][^:]*:(\s|$)/.test(reste) || /^['"][^'"]*['"]\s*:(\s|$)/.test(reste)) {
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
    const out = {};
    while (i < lignes.length) {
      i = suivanteUtile(i);
      if (i >= lignes.length) break;
      const l = lignes[i];
      const ind = indentDe(l.brute);
      if (ind < indent) break;
      if (ind > indent) throw new ErreurYaml("indentation inattendue dans un mapping", l.n);
      if (/^\s*-(\s|$)/.test(l.t)) break;                       // une séquence au même niveau : fin du mapping
      const m = /^\s*('[^']*'|"[^"]*"|[^\s:'"][^:]*?)\s*:(?:\s+(.*))?$/.exec(l.t);
      if (!m) throw new ErreurYaml("ligne illisible : " + l.t.trim().slice(0, 40), l.n);
      const cle = scalaire(m[1], l.n);
      if (typeof cle !== "string") throw new ErreurYaml("clé non scalaire", l.n);
      const reste = (m[2] || "").trim();
      if (reste === "") {
        const j = suivanteUtile(i + 1);
        if (j >= lignes.length || indentDe(lignes[j].brute) <= indent && !(/^\s*-(\s|$)/.test(lignes[j].t) && indentDe(lignes[j].brute) === indent)) { out[cle] = ""; i++; continue; }
        // Une séquence peut être au MÊME niveau que sa clé (`on:\n- push`) : YAML l'admet.
        const r = noeud(j, indentDe(lignes[j].brute));
        out[cle] = r.valeur; i = r.pos; continue;
      }
      if (/^[|>]/.test(reste)) { const r = bloc(reste, indent, i + 1, l.n); out[cle] = r.valeur; i = r.pos; continue; }
      out[cle] = scalaire(reste, l.n); i++;
    }
    return { valeur: out, pos: i };
  }

  if (pos >= lignes.length) return {};
  const racine = noeud(pos, indentDe(lignes[pos].brute));
  const reste = suivanteUtile(racine.pos);
  if (reste < lignes.length) throw new ErreurYaml("contenu inattendu après la racine", lignes[reste].n);
  return racine.valeur;
}

module.exports = { lireYaml, ErreurYaml, sansCommentaire };
