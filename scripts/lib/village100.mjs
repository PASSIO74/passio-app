// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE 100 — fonctions PURES de la simulation hybride (aucun réseau, aucun
// secret). Le réseau vit dans `village100-figurants.mjs`, l'orchestration dans
// `tests/e2e/village-100-hybride.spec.js`. Ce qui décide d'un verdict est ici,
// pour être éprouvé par `tests/unit/village100.test.mjs` sans staging.
//
// Les briques reprises du banc `charge-realiste` (même référence de staging,
// même domaine d'adresses jetables, mêmes percentiles) sont IMPORTÉES, jamais
// recopiées : deux copies d'une même règle divergent sur celle qu'on oublie.
// ═══════════════════════════════════════════════════════════════════════════
import { STAGING_REF, emailCapacite, statistiques } from "./charge-realiste.mjs";

export { STAGING_REF };

// 100 personnes : 4 « yeux » dans de vrais navigateurs + 96 figurants API.
export const YEUX = Object.freeze(["Léa", "Hugo", "Jade", "Tom"]);
export const NB_FIGURANTS = 96;
export const PLACES = 20;

// ≤ 134 connexions / 5 min (journal capacité, banc charge-realiste : 2 250 ms).
// Les quatre yeux se connectent AUSSI dans la même fenêtre : 2 400 ms laisse
// 125 connexions de figurants + 4 = 129 par fenêtre de 5 min.
export const DELAI_CONNEXION_MS = 2400;
export const PLAFOND_CONNEXIONS_5_MIN = 134;
export function connexionsParFenetre(delaiMs, autres = YEUX.length) {
  if (!(delaiMs > 0)) throw new Error("DELAI_INVALIDE");
  return Math.floor(300000 / delaiMs) + autres;
}

// Budgets de séance : la campagne s'ARRÊTE au premier dépassement (Budget de
// charge-realiste). Forfait Pro à spend cap : un quota est un mur dur.
export const LIMITES_VILLAGE100 = Object.freeze({
  octets: 80_000_000, octetsNettoyage: 20_000_000,
  messagesRealtime: 60_000, requetes: 9_000, dureeCampagneMs: 40 * 60_000,
});

export function campagneVillage100(maintenant = Date.now(), alea = "00000000") {
  const c = `capacite_${String(maintenant).padStart(13, "0")}_${String(alea).toLowerCase().slice(0, 8).padEnd(8, "0")}`;
  emailCapacite(c, 0); // même grammaire que le banc de charge, vérifiée par lui
  return c;
}
export function emailFigurant(campagne, index) {
  if (!Number.isInteger(index) || index < 0 || index >= NB_FIGURANTS) throw new Error("FIGURANT_HORS_PLAN");
  return emailCapacite(campagne, index);
}

// Les YEUX aussi prennent une adresse du domaine du banc (index 96 à 99) :
// `@passio-e2e.test` est purgé PAR MOTIF par le teardown du job `test-prod`
// de la CI, qui vise le staging — deux séances ont perdu leurs quatre yeux en
// plein acte (profil disparu : `posts_author_id_fkey`, notification d'Hugo
// sautée par le déclencheur de traçage). Le banc de charge a pris ce domaine
// séparé pour la même raison.
export function emailOeil(campagne, index) {
  if (!Number.isInteger(index) || index < 0 || index >= YEUX.length) throw new Error("OEIL_HORS_PLAN");
  return emailCapacite(campagne, NB_FIGURANTS + index);
}

// ── La distribution des rôles ───────────────────────────────────────────────
// Léa occupe 1 des 20 places. Les 99 autres :
//   · 15 figurants « précoces » + Hugo → 17 venants, 3 places restent ;
//   · LA COURSE : 29 figurants + Jade cliquent à la même seconde → 3 gagnants,
//     27 refus « complète », qui rejoignent la liste d'attente ;
//   · 52 figurants « tardifs », puis Tom → directement en liste d'attente ;
//   → 20 venants, 80 en attente. Puis 10 précoces se désistent ensemble.
export function planVillage(nFigurants = NB_FIGURANTS, places = PLACES) {
  if (nFigurants !== NB_FIGURANTS || places !== PLACES) throw new Error("PLAN_FIGE_96_20");
  const plage = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const plan = {
    precoces: plage(0, 15),
    course: plage(15, 44),
    tardifs: plage(44, 96),
    desistants: plage(0, 10),
    commentateurs: plage(0, 48),
    aimeurs: plage(0, 96),
  };
  const venantsAvantCourse = 1 + plan.precoces.length + 1; // Léa + précoces + Hugo
  const placesCourse = places - venantsAvantCourse;
  const coureurs = plan.course.length + 1;                 // + Jade
  plan.attendus = {
    venantsAvantCourse, placesCourse, coureurs, refusCourse: coureurs - placesCourse,
    venants: places,
    attente: (coureurs - placesCourse) + plan.tardifs.length + 1, // + Tom
    desistements: plan.desistants.length,
    attenteApresCascade: (coureurs - placesCourse) + plan.tardifs.length + 1 - plan.desistants.length,
    likes: plan.aimeurs.length + YEUX.length,              // 96 + Hugo, Jade, Tom, Léa
    likesNotifies: plan.aimeurs.length + YEUX.length - 1,  // Léa n'est pas prévenue de son like
    commentaires: plan.commentateurs.length + 2,           // + Hugo, Jade
    prevenusAnnulation: NB_FIGURANTS + YEUX.length - 1,    // tout le monde sauf l'organisatrice
  };
  return plan;
}

// ── Horodatages : la base trie à la MICROSECONDE ──────────────────────────────
// PostgREST rend « 2026-11-22T17:00:00.123456+00:00 » (timestamptz) ou sans
// fuseau (timestamp) et retire les zéros de fin. `Date` tronque à la
// milliseconde : deux inscriptions de la même milliseconde seraient départagées
// par l'identifiant ici et par la microseconde en base — un faux « hors ordre ».
export function microsDe(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(String(ts || ""));
  if (!m) throw new Error("HORODATAGE_ILLISIBLE");
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let decalageMin = 0;
  if (m[8] && m[8] !== "Z") {
    const s = m[8][0] === "-" ? -1 : 1, chiffres = m[8].slice(1).replace(":", "");
    decalageMin = s * (Number(chiffres.slice(0, 2)) * 60 + Number(chiffres.slice(2, 4) || 0));
  }
  return (base - decalageMin * 60000) * 1000 + Number((m[7] || "").padEnd(6, "0"));
}

// Même ordre que `promouvoir_attente` : created_at, puis user_id.
export function ordreAttente(lignes) {
  return lignes.filter((l) => l.rsvp === "waitlist")
    .map((l) => ({ ...l, _us: microsDe(l.created_at) }))
    .sort((a, b) => a._us - b._us || (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0))
    .map((l) => l.user_id);
}

export const compterRsvp = (lignes, rsvp) => lignes.filter((l) => (l.rsvp || "going") === rsvp).length;

// La course : le serveur tient-il la capacité EXACTEMENT ?
export function verdictCourse({ lignesApres, tentatives, places, placesCourse }) {
  const venants = compterRsvp(lignesApres, "going");
  const gagnants = tentatives.filter((t) => t.issue === "going").length;
  const refus = tentatives.filter((t) => t.issue === "complete").length;
  const autres = tentatives.filter((t) => !["going", "complete"].includes(t.issue));
  const motifs = {};
  for (const t of autres) motifs[t.issue || "inconnu"] = (motifs[t.issue || "inconnu"] || 0) + 1;
  const ok = venants === places && gagnants === placesCourse && refus === tentatives.length - placesCourse && autres.length === 0;
  return { ok, venants, gagnants, refus, autres: autres.length, motifs };
}

// La cascade : les promus sont-ils EXACTEMENT les premiers de la file, et
// chacun prévenu une fois ? `notifs` : lignes event_update de l'activité.
export function verdictCascade({ attenteAvant, lignesApres, notifs, desistements, places }) {
  const attendus = attenteAvant.slice(0, desistements);
  const venantsApres = new Set(lignesApres.filter((l) => (l.rsvp || "going") === "going").map((l) => l.user_id));
  const promus = attenteAvant.filter((u) => venantsApres.has(u));
  const manquants = attendus.filter((u) => !venantsApres.has(u));
  const horsRang = promus.filter((u) => !attendus.includes(u));
  const parDestinataire = new Map();
  for (const n of notifs) parDestinataire.set(n.user_id, (parDestinataire.get(n.user_id) || 0) + 1);
  const promusSansNotif = promus.filter((u) => !parDestinataire.get(u));
  const promusNotifiesPlusieursFois = promus.filter((u) => (parDestinataire.get(u) || 0) > 1);
  const notifiesNonPromus = [...parDestinataire.keys()].filter((u) => !venantsApres.has(u));
  // Ordre : les notifications d'origine serveur, triées par leur horodatage,
  // doivent suivre le rang dans la file (une promotion = un verrou de l'activité).
  const ordreNotifs = notifs.filter((n) => attendus.includes(n.user_id))
    .map((n) => ({ u: n.user_id, us: microsDe(n.created_at) })).sort((a, b) => a.us - b.us).map((x) => x.u);
  const inversions = ordreNotifs.reduce((n, u, i) => n + ordreNotifs.slice(i + 1).filter((v) => attendus.indexOf(v) < attendus.indexOf(u)).length, 0);
  const venants = venantsApres.size;
  const ok = venants === places && manquants.length === 0 && horsRang.length === 0
    && promusSansNotif.length === 0 && promusNotifiesPlusieursFois.length === 0 && notifiesNonPromus.length === 0;
  return { ok, venants, promus: promus.length, manquants: manquants.length, horsRang: horsRang.length,
    promusSansNotif: promusSansNotif.length, doublons: promusNotifiesPlusieursFois.length,
    notifiesNonPromus: notifiesNonPromus.length, inversions, ordreRespecte: inversions === 0 };
}

// Une notification par (destinataire, émetteur, genre, cible) : au-delà, c'est
// un doublon. Rend aussi la répartition par genre.
export function doublonsNotifs(notifs) {
  const vus = new Map(), parGenre = {};
  for (const n of notifs) {
    const k = [n.user_id, n.from_id, n.kind, n.ref_id].join("|");
    vus.set(k, (vus.get(k) || 0) + 1);
    parGenre[n.kind] = (parGenre[n.kind] || 0) + 1;
  }
  const doublons = [...vus.values()].filter((v) => v > 1).reduce((s, v) => s + v - 1, 0);
  return { total: notifs.length, doublons, parGenre };
}

// « Est-ce du spam ? » — un JUGEMENT, rapporté en observation. On le pose sur
// ce que l'écran de l'organisatrice montre : une ligne par notification pour
// une même activité, au-delà de `seuilParActivite`, sans regroupement.
export function jugementSpam({ lignesAffichees, notifsActivite, seuilParActivite = 10 }) {
  const regroupe = lignesAffichees < notifsActivite;
  const spam = !regroupe && notifsActivite > seuilParActivite;
  return { spam, regroupe, lignesAffichees, notifsActivite, seuilParActivite };
}

// Latences : mêmes percentiles que charge-realiste (rang ⌈n·p⌉).
export function latences(ms) {
  const s = statistiques(ms.filter((x) => Number.isFinite(x)).map((x) => ({ ok: true, ms: x })));
  const max = ms.length ? Math.round(Math.max(...ms)) : null;
  return { n: s.tentatives, p50: s.p50Ms, p95: s.p95Ms, p99: s.p99Ms, max };
}
export const fmtLat = (l) => (l && l.n ? `n=${l.n} · p50 ${l.p50} ms · p95 ${l.p95} ms · max ${l.max} ms` : "aucune mesure");

// Mesures HTTP : par famille, statuts et latences. Un 429 est un MUR touché.
export function resumeHttp(mesures) {
  const familles = {};
  for (const m of mesures) {
    const f = familles[m.famille] ||= { tentatives: 0, statuts: {}, ms: [] };
    f.tentatives++; f.statuts[m.status ?? "reseau"] = (f.statuts[m.status ?? "reseau"] || 0) + 1; f.ms.push(m.ms);
  }
  const out = {};
  for (const [k, f] of Object.entries(familles).sort(([a], [b]) => a.localeCompare(b))) {
    out[k] = { tentatives: f.tentatives, statuts: f.statuts, ...latences(f.ms) };
  }
  const total429 = mesures.filter((m) => m.status === 429).length;
  const total5xx = mesures.filter((m) => m.status >= 500).length;
  return { familles: out, total: mesures.length, total429, total5xx };
}

// Débit atteint : le plus grand nombre de mesures dans une seconde glissante.
export function picParSeconde(instants) {
  const t = [...instants].sort((a, b) => a - b);
  let pic = 0;
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i] - t[j] >= 1000) j++;
    pic = Math.max(pic, i - j + 1);
  }
  return pic;
}

// Décalages d'un départ étalé sur une fenêtre (likes et commentaires « en
// 10 s ») : déterministes pour une graine, bornés à la fenêtre.
export function decalages(n, fenetreMs, graine = 1) {
  let x = (graine >>> 0) || 1;
  return Array.from({ length: n }, () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x % Math.max(1, fenetreMs);
  });
}

// ── Le rapport : même forme que celui du village (EXIGÉ / OBSERVATION) ───────
export function rapportMarkdown(r) {
  const n = (s) => r.controles.filter((c) => c.statut === s).length;
  const icone = { "OK": "✅", "ÉCHEC": "❌", "À REGARDER": "👀" };
  const cell = (x) => String(x ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  let md = `# Le village à 100 — rapport de simulation hybride\n\n`;
  md += `- Date : ${r.date} · cible : ${r.cible} · durée : ${r.dureeS} s · campagne : \`${r.campagne}\`\n`;
  md += `- Population : ${r.population.yeux} personnages en navigateur + ${r.population.figurants} figurants API = ${r.population.yeux + r.population.figurants}\n`;
  md += `- Contrôles : **${n("OK")} OK · ${n("ÉCHEC")} échec(s) exigé(s) · ${n("À REGARDER")} observation(s)**\n`;
  md += `- Purge : ${r.purge ? `${r.purge.lignes} lignes, ${r.purge.comptes} comptes${r.purge.erreurs.length ? " — ⚠️ " + r.purge.erreurs.join(" ; ") : ""}` : "non faite"}\n`;
  if (r.arret) md += `- ⚠️ **Séance interrompue** : ${cell(r.arret)}\n`;
  md += `\n## Les personnages en navigateur (les « yeux »)\n\n| # | Personnage | Rôle | Inscrit |\n|--|--|--|--|\n`;
  r.personas.forEach((p, i) => { md += `| ${i + 1} | ${p.nom} | ${p.role} | ${p.inscrit ? "oui" : "**non**"} |\n`; });
  let acte = null;
  for (const c of r.controles) {
    if (c.acte !== acte) { acte = c.acte; md += `\n## ${acte}\n\n| | Code | Contrôle | Niveau | Détail |\n|--|--|--|--|--|\n`; }
    md += `| ${icone[c.statut]} | ${c.code} | ${cell(c.libelle)} | ${c.exige ? "exigé" : "observation"} | ${cell(c.detail)} |\n`;
  }
  if (r.latences && Object.keys(r.latences).length) {
    md += `\n## Latences\n\n| Mesure | n | p50 | p95 | max |\n|--|--|--|--|--|\n`;
    for (const [k, l] of Object.entries(r.latences)) md += `| ${cell(k)} | ${l.n ?? 0} | ${l.p50 ?? "—"} ms | ${l.p95 ?? "—"} ms | ${l.max ?? "—"} ms |\n`;
  }
  if (r.murs) {
    md += `\n## Murs de quota du staging\n\n`;
    for (const [k, v] of Object.entries(r.murs)) md += `- **${cell(k)}** : ${cell(v)}\n`;
  }
  if (r.http && r.http.familles) {
    md += `\n## Appels HTTP des figurants (par famille)\n\n| Famille | Tentatives | Statuts | p50 | p95 |\n|--|--|--|--|--|\n`;
    for (const [k, f] of Object.entries(r.http.familles)) {
      md += `| ${cell(k)} | ${f.tentatives} | ${cell(Object.entries(f.statuts).map(([s, c]) => `${s}×${c}`).join(" "))} | ${f.p50 ?? "—"} ms | ${f.p95 ?? "—"} ms |\n`;
    }
  }
  const cons = Object.entries(r.erreursConsole || {}).filter(([, l]) => l.length);
  if (cons.length) {
    md += `\n## Erreurs console (navigateurs)\n\n`;
    for (const [nom, l] of cons) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 4).map((x) => "`" + x.replace(/`/g, "'").slice(0, 140) + "`").join(" · ")}\n`;
  }
  const http = Object.entries(r.erreursHttp || {}).filter(([, l]) => l.length);
  if (http.length) {
    md += `\n## Réponses HTTP ≥ 400 vues par les navigateurs\n\n`;
    for (const [nom, l] of http) md += `- **${nom}** (${l.length}) : ${[...new Set(l)].slice(0, 6).map((x) => "`" + x + "`").join(" · ")}\n`;
  }
  if (r.captures && r.captures.length) md += `\n## Captures\n\n${r.captures.map((f) => `- captures/${f}`).join("\n")}\n`;
  md += `\n## Portée\n\n${(r.portee || []).map((x) => `- ${x}`).join("\n")}\n`;
  return md;
}
