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
  // ⚠️ ASTRA-37 : UNE ÉCRITURE SANS CORPS EST UNE ÉCRITURE QUI COMPTE. Le DELETE
  // d'un « j'aime » rend 204 sans contenu ; il n'était PAS MESURÉ du tout
  // (`.catch(() => {})`), alors qu'il y en a autant que de « aimer » — 2 390
  // dans le run mélangé, 6 717 dans la tenue. Une écriture qu'on émet sans la
  // compter fausse le débit ET peut échouer sans témoin. On exige donc un 2xx
  // ET un corps VIDE : un corps inattendu sur un 204 est une anomalie, pas un
  // succès qu'on arrondit.
  if (attentes.aucunContenu) {
    const t = typeof corps === "string" ? corps.trim() : "";
    return t === "" || t === "[]" ? { ok: true, motif: null } : { ok: false, motif: "contenu inattendu sur une réponse sans corps : " + t.slice(0, 60) };
  }
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
// ⚠️ `p50/p95/p99` sont calculés sur les SEULS SUCCÈS (contrat historique, lu
// par les rapports du 15/09) ; `p95Tous` l'est sur TOUTES les mesures, échecs et
// délais compris — c'est lui que lit le verdict d'arrêt (audit F, 2026-11-02) :
// un palier où la moitié des requêtes expirent affichait un p95 VERT, parce
// que les expirées n'étaient pas des succès et sortaient donc du percentile.
export function ligneRapport(palier, nom, mesures, duree) {
  const t = mesures.filter((m) => m.ok).map((m) => m.ms).sort((a, b) => a - b);
  const tous = mesures.map((m) => m.ms).sort((a, b) => a - b);
  const motifs = {};
  for (const m of mesures) if (!m.ok) motifs[m.motif] = (motifs[m.motif] || 0) + 1;
  const err = mesures.length - t.length;
  return {
    palier, requete: nom, ok: t.length, erreurs: err,
    rps: +((mesures.length) / duree).toFixed(1),
    p50: pct(t, 0.5) == null ? null : Math.round(pct(t, 0.5)),
    p95: pct(t, 0.95) == null ? null : Math.round(pct(t, 0.95)),
    p99: pct(t, 0.99) == null ? null : Math.round(pct(t, 0.99)),
    p95Tous: pct(tous, 0.95) == null ? null : Math.round(pct(tous, 0.95)),
    motifs: Object.entries(motifs).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n} × ${m}`).join(", "),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEUILS D'ARRÊT D'UN PALIER (audit F, 2026-11-02) — même grammaire que
// `verdictPalier` du banc authentifié (scripts/lib/charge-realiste.mjs), pour
// que les deux bancs cessent de monter au MÊME endroit :
//   · erreurs > 1 % sur une famille (délais compris : une requête expirée est
//     une erreur, pas une absence) ;
//   · p95 TOUTES MESURES > 1 000 ms sur une famille HTTP ;
//   · la famille temps réel : une seule livraison manquée ou p95 > 2 000 ms.
// Le 15/09, `charge.mjs` avait enchaîné 10 → 25 → 50 alors que le palier 25
// portait déjà 7 livraisons manquées et un p99 de 13 s sur « publier » : il n'y
// avait AUCUN seuil, et la documentation du banc (« aucun palier supérieur si
// erreurs > 1 %, p95 > 1 s… ») ne valait que pour charge-realiste.
// Pure : un tableau de `ligneRapport`, un verdict { ok, motifs }.
// ═══════════════════════════════════════════════════════════════════════════
export const SEUILS_PALIER = Object.freeze({ tauxErreurMax: 0.01, p95HttpMs: 1000, p95RealtimeMs: 2000 });
export function verdictPalierSimple(lignes, seuils = SEUILS_PALIER) {
  const motifs = [];
  if (!Array.isArray(lignes) || !lignes.length) return { ok: false, motifs: ["PALIER_SANS_MESURE"] };
  for (const l of lignes) {
    const total = (l.ok || 0) + (l.erreurs || 0);
    const nom = String(l.requete || "?");
    const tempsReel = /temps r[ée]el/i.test(nom);
    if (!total) { motifs.push(`${nom} : AUCUNE_MESURE`); continue; }
    if (tempsReel) {
      if (l.erreurs > 0) motifs.push(`${nom} : LIVRAISON_MANQUEE (${l.erreurs})`);
      const p = l.p95Tous ?? l.p95;
      if (p != null && p > seuils.p95RealtimeMs) motifs.push(`${nom} : P95_REALTIME_SUP_${seuils.p95RealtimeMs}_MS (${p})`);
      continue;
    }
    if (l.erreurs / total > seuils.tauxErreurMax) motifs.push(`${nom} : ERREURS_SUP_1_PCT (${l.erreurs}/${total})`);
    const p = l.p95Tous ?? l.p95;
    if (p != null && p > seuils.p95HttpMs) motifs.push(`${nom} : P95_SUP_${seuils.p95HttpMs}_MS (${p})`);
  }
  return { ok: motifs.length === 0, motifs };
}
