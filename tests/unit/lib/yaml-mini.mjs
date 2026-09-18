// ═══════════════════════════════════════════════════════════════════════════
// LECTEUR YAML MINIMAL POUR EXTRAIRE LES ÉTAPES RÉELLES DES WORKFLOWS.
//
// ⚠️ POURQUOI UN PARSEUR MAISON. Les verrous de tests/unit/sentinelle-workflows.
// test.mjs rejouent les blocs `run:` RÉELS de .github/workflows/*.yml (jamais
// une copie : une copie diverge et le test reste vert sur du code mort). Le
// dépôt n'a aucune dépendance YAML côté Node, et `npm install` n'est pas une
// option pour un verrou joué par `npm run verif` sur chaque PR ; python3 +
// PyYAML n'existent que sur le runner (tests/ci/frontiere-confiance.sh), pas
// sur le poste. Ce lecteur couvre le SOUS-ENSEMBLE que ces workflows emploient
// (mappings, séquences, scalaires simples et cités, blocs `|`) et REFUSE tout
// le reste (clé en double, indentation inattendue, reste non parsé) : une
// lecture approximative extrairait un bloc tronqué, et un bloc tronqué qui
// passe est pire qu'une erreur.
//
// Il ne remplace pas un vrai YAML : les ancres, les clés complexes, les
// scalaires multi-lignes pliés (`>`) sont hors sous-ensemble et lèvent.
// ═══════════════════════════════════════════════════════════════════════════

export function parse(texte) {
  const lignes = String(texte).replace(/\r/g, "").split("\n");
  let i = 0;
  const indentDe = (l) => l.match(/^ */)[0].length;
  const utile = (l) => l.trim() !== "" && !/^\s*#/.test(l);

  function scalaire(s) {
    s = s.trim();
    if (s.startsWith("'")) {
      if (!/^'([^']|'')*'$/.test(s)) throw new Error("scalaire simple non fermé : " + s);
      return s.slice(1, -1).replace(/''/g, "'");
    }
    if (s.startsWith('"')) {
      if (!/^"([^"\\]|\\.)*"$/.test(s)) throw new Error("scalaire double non fermé : " + s);
      return JSON.parse(s);
    }
    // Un flux `{ … }` / `[ … ]` est rendu tel quel : les workflows n'en lisent que la forme.
    if (s.startsWith("{") || s.startsWith("[")) return s;
    return s.replace(/\s+#.*$/, "");
  }

  // Bloc littéral `|` : toutes les lignes plus indentées que le parent (ou vides).
  function bloc(indentParent) {
    const out = [];
    let base = null;
    while (i < lignes.length) {
      const l = lignes[i];
      if (l.trim() === "") { out.push(""); i++; continue; }
      const ind = indentDe(l);
      if (ind <= indentParent) break;
      if (base === null) base = ind;
      if (ind < base) throw new Error("ligne " + (i + 1) + " : indentation sous la base du bloc");
      out.push(l.slice(base));
      i++;
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n") + "\n";
  }

  function noeud(indent) {
    while (i < lignes.length && !utile(lignes[i])) i++;
    if (i >= lignes.length) return null;
    const l = lignes[i];
    const ind = indentDe(l);
    if (ind < indent) return null;
    if (/^\s*- /.test(l) || /^\s*-$/.test(l)) return sequence(ind);
    return mapping(ind);
  }

  function valeurApres(reste, indentCle) {
    reste = reste.trim();
    if (reste === "") { i++; return noeud(indentCle + 1); }
    if (reste === "|" || reste === "|-" || reste === "|+") { i++; return bloc(indentCle); }
    if (reste === ">" || reste === ">-") throw new Error("ligne " + (i + 1) + " : scalaire plié (>) hors sous-ensemble");
    i++;
    return scalaire(reste);
  }

  function mapping(indent) {
    const obj = {};
    while (i < lignes.length) {
      if (!utile(lignes[i])) { i++; continue; }
      const l = lignes[i];
      const ind = indentDe(l);
      if (ind < indent) break;
      if (ind > indent) throw new Error("ligne " + (i + 1) + " : indentation inattendue (" + ind + " > " + indent + ") : " + l.trim());
      if (/^\s*- /.test(l)) break;
      const m = l.match(/^ *([^\s'"#][^:#]*?|'[^']*'|"[^"]*"):(?: (.*))?$/);
      if (!m) throw new Error("ligne " + (i + 1) + " : pas une clé : " + l);
      const cle = m[1].replace(/^['"]|['"]$/g, "");
      if (cle in obj) throw new Error("ligne " + (i + 1) + " : clé en double : " + cle);
      obj[cle] = valeurApres(m[2] || "", indent);
    }
    return obj;
  }

  function sequence(indent) {
    const arr = [];
    while (i < lignes.length) {
      if (!utile(lignes[i])) { i++; continue; }
      const l = lignes[i];
      const ind = indentDe(l);
      if (ind < indent) break;
      if (ind > indent) throw new Error("ligne " + (i + 1) + " : indentation inattendue dans une séquence : " + l.trim());
      if (!/^\s*-( |$)/.test(l)) break;
      const reste = l.replace(/^\s*-( |$)/, "");
      if (reste.trim() === "") { i++; arr.push(noeud(indent + 1)); continue; }
      if (/^[^\s'"#\[{][^:#]*?:( |$)/.test(reste)) {
        // Mapping commençant sur la ligne du tiret (`- name: …`) : la ligne est
        // réécrite comme si elle était indentée de deux, puis lue comme un mapping.
        lignes[i] = " ".repeat(indent + 2) + reste;
        arr.push(mapping(indent + 2));
      } else { i++; arr.push(scalaire(reste)); }
    }
    return arr;
  }

  const racine = noeud(0);
  while (i < lignes.length && !utile(lignes[i])) i++;
  if (i < lignes.length) throw new Error("ligne " + (i + 1) + " : reste non parsé : " + lignes[i]);
  return racine;
}
