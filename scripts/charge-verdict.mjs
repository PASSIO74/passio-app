// Verdict d'une réponse du banc de charge — fonctions PURES (ASTRA-20, 2026-09-15).
//
// ⚠️ UN HTTP 200 VIDE N'EST PAS UN SUCCÈS. La première version de `charge.mjs`
// ne regardait que `res.ok` : quatre réponses 200 vides → quatre succès, zéro
// erreur (contre-épreuve d'Astra). Une base vidée, une policy RLS qui masque
// tout, une colonne renommée qui fait rendre `[]` — le banc aurait mesuré un
// serveur qui « tient » en ne servant rien. Chaque famille de requête dit
// désormais ce qu'elle ATTEND, et une réponse qui ne le porte pas est comptée
// comme une erreur nommée (`vide`, `forme`, `contenu`), jamais comme un succès.
export const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `attentes` : ce que la requête doit rendre. Retourne { ok, motif }.
//   - tableau: true          → un tableau JSON
//   - min: n                 → au moins n éléments (n = 0 admis, dit explicitement)
//   - champs: [..]           → chaque élément porte ces clés (non nulles)
//   - id: "x"                → exactement un élément et son id est x
//   - uuid: "champ"          → chaque élément a ce champ en uuid
//   - imbrique: "profiles"   → chaque élément porte un objet non nul sous cette clé
export function verdictReponse(status, corps, attentes) {
  if (status < 200 || status >= 300) return { ok: false, motif: `HTTP ${status}` };
  if (!attentes) return { ok: false, motif: "aucune attente déclarée" };
  let j = corps;
  if (typeof corps === "string") { try { j = JSON.parse(corps); } catch (e) { return { ok: false, motif: "forme : JSON illisible" }; } }
  if (attentes.tableau) {
    if (!Array.isArray(j)) return { ok: false, motif: "forme : tableau attendu" };
    const min = typeof attentes.min === "number" ? attentes.min : 1;
    if (j.length < min) return { ok: false, motif: `vide : ${j.length} élément(s), ${min} attendu(s)` };
    if (attentes.id !== undefined) {
      if (j.length !== 1) return { ok: false, motif: `contenu : ${j.length} élément(s) pour un id` };
      if (j[0] == null || String(j[0].id) !== String(attentes.id)) return { ok: false, motif: `contenu : id ${j[0] && j[0].id} ≠ ${attentes.id}` };
    }
    for (const el of j) {
      if (!el || typeof el !== "object") return { ok: false, motif: "forme : élément non objet" };
      for (const c of attentes.champs || []) if (el[c] === undefined || el[c] === null) return { ok: false, motif: `contenu : champ ${c} absent` };
      if (attentes.uuid && !RE_UUID.test(String(el[attentes.uuid] || ""))) return { ok: false, motif: `contenu : ${attentes.uuid} n'est pas un uuid` };
      if (attentes.imbrique && (!el[attentes.imbrique] || typeof el[attentes.imbrique] !== "object")) return { ok: false, motif: `contenu : ${attentes.imbrique} absent` };
    }
    return { ok: true, motif: null };
  }
  if (attentes.objet) {
    if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, motif: "forme : objet attendu" };
    for (const c of attentes.champs || []) if (j[c] === undefined || j[c] === null) return { ok: false, motif: `contenu : champ ${c} absent` };
    return { ok: true, motif: null };
  }
  return { ok: false, motif: "aucune attente déclarée" };
}

// Percentile d'un tableau TRIÉ ; null si vide.
export function pct(a, p) { return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; }

// Agrège les mesures d'une famille en une ligne de rapport. Les erreurs sont
// comptées PAR MOTIF : « 12 × vide » se lit, « 12 erreurs » ne dit rien.
export function ligneRapport(palier, nom, mesures, duree) {
  const t = mesures.filter((m) => m.ok).map((m) => m.ms).sort((a, b) => a - b);
  const motifs = {};
  for (const m of mesures) if (!m.ok) motifs[m.motif] = (motifs[m.motif] || 0) + 1;
  const err = mesures.length - t.length;
  return {
    palier, requete: nom, ok: t.length, erreurs: err,
    rps: +((mesures.length) / duree).toFixed(1),
    p50: pct(t, 0.5) == null ? null : Math.round(pct(t, 0.5)),
    p95: pct(t, 0.95) == null ? null : Math.round(pct(t, 0.95)),
    p99: pct(t, 0.99) == null ? null : Math.round(pct(t, 0.99)),
    motifs: Object.entries(motifs).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n} × ${m}`).join(", "),
  };
}
