// PASSIO Pilotage — version téléphone (2026-09-28).
// Cinq onglets au pouce : Accueil · Alertes · Utilisateurs · Machines · Réglages.
// Règles de ce fichier :
//   · tout est construit par nœuds + textContent, JAMAIS innerHTML (les titres
//     d'alertes, de bugs et d'issues viennent de données externes) ;
//   · un domaine qui ne répond pas n'efface pas les autres (Promise.allSettled) ;
//   · une route qui ne répond pas est « non lu », jamais confondue avec un vide ;
//   · les seules écritures possibles sont bornées : marquer une alerte vue,
//     classer un bug, lancer une suite de tests en liste blanche. La Sentinelle
//     reste en lecture seule, aucune console git n'est exposée.

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error((data && data.error) || ("HTTP " + res.status));
    e.status = res.status;
    throw e;
  }
  return data;
}

// ─── Petits constructeurs de nœuds ──────────────────────────────────────────
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}
function vider(id) { const n = $(id); while (n.firstChild) n.removeChild(n.firstChild); return n; }
const borne = (s, n) => { const t = String(s == null ? "" : s); return t.length > n ? t.slice(0, n) + " …" : t; };

/** Une carte : titre, étiquette colorée (optionnelle), texte (optionnel). */
function carte(titre, etiquette, texte, couleur) {
  const c = el("article", "carte" + (couleur ? " " + couleur : ""));
  const tete = el("div", "carte-tete");
  tete.append(el("span", "carte-titre", borne(titre, 200)));
  if (etiquette) tete.append(el("span", "etiquette " + (couleur || "gris"), etiquette));
  c.append(tete);
  if (texte) c.append(el("p", null, borne(texte, 600)));
  return c;
}
function chiffre(valeur, libelle, couleur) {
  const c = el("div", "chiffre" + (couleur ? " " + couleur : ""));
  c.append(el("b", null, valeur == null ? "—" : valeur), el("span", null, libelle));
  return c;
}
function nonLu(id, titre, e) {
  const root = vider(id);
  const interdit = e && (e.status === 401 || e.status === 403);
  root.append(carte(titre, interdit ? "Réservé" : "Non lu", interdit ? "Ton rôle n'a pas accès à cette information." : "Le poste n'a pas répondu pour cette partie.", "gris"));
}
function lienDetail(c, cible) {
  const u = String(cible || "");
  let href = null, texte = "Voir le détail";
  if (/^https:\/\/github\.com\//.test(u)) { href = u; texte = "Ouvrir sur GitHub"; }
  else if (/^#[a-z0-9_-]+$/i.test(u)) { href = "/" + u; texte = "Voir sur la version ordinateur"; }
  if (!href) return;
  const a = el("a", null, texte); a.href = href;
  if (href.startsWith("http")) { a.target = "_blank"; a.rel = "noopener"; }
  let actions = c.querySelector(".carte-actions");
  if (!actions) { actions = el("div", "carte-actions"); c.append(actions); }
  actions.append(a);
}

// ─── Mots simples ───────────────────────────────────────────────────────────
function ilYA(ms) {
  const t = typeof ms === "number" ? ms : Date.parse(String(ms));
  if (!Number.isFinite(t)) return "date inconnue";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const PRIORITE = { P0: ["Urgent", "rouge"], P1: ["Important", "orange"], P2: ["À voir", "gris"], P3: ["Info", "gris"] };
const priorite = (p) => PRIORITE[p] || ["Info", "gris"];
function couleurNiveau(level) {
  const l = String(level || "").toLowerCase();
  if (l === "critical" || l === "high" || l === "error") return "rouge";
  if (l === "warn" || l === "warning" || l === "medium") return "orange";
  return "gris";
}
const NIVEAU = { critical: "Critique", high: "Grave", error: "Erreur", warn: "Attention", warning: "Attention", medium: "Moyen", low: "Faible", info: "Info" };
const niveau = (l) => NIVEAU[String(l || "").toLowerCase()] || "Info";
// État technique (PASS/FAIL…) → mots et couleur.
function etat(s) {
  const x = String(s || "").toUpperCase();
  if (["PASS", "GO", "LIVE", "PROMOTED_LOCAL", "OK"].includes(x)) return ["OK", "vert"];
  if (["FAIL", "NO_GO", "UNAVAILABLE", "ROLLED_BACK"].includes(x)) return ["Problème", "rouge"];
  if (x === "STALE") return ["Ancien", "orange"];
  return ["Inconnu", "gris"];
}
const CR_ETAT = { ok: ["OK", "vert"], warn: ["Attention", "orange"], alert: ["Alerte", "rouge"] };
const crEtat = (e) => (Object.hasOwn(CR_ETAT, e) ? CR_ETAT[e] : ["Inconnu", "gris"]);

// ─── Données ────────────────────────────────────────────────────────────────
const REQUETES = [
  ["overview", "/overview"], ["attente", "/attente"], ["alertes", "/alerts"], ["bugs", "/bugs"],
  ["incidents", "/incidents?limit=50"], ["signups", "/signups"], ["kpi", "/kpi"], ["devices", "/devices"],
  ["guardian", "/release-guardian"], ["command", "/control/command"], ["observation", "/observation"],
  ["changes", "/control/changes"], ["tests", "/tests"], ["sentinel", "/sentinel?limit=20"], ["comptes", "/comptes-rendus"],
];
let moi = null;
let enCours = false;
let derniereMaj = 0;

// ─── Accueil ────────────────────────────────────────────────────────────────
/** Le verdict global : une phrase, une couleur, les raisons. */
export function verdictGlobal({ overview, attente, alertes }) {
  if (!overview) return { couleur: "gris", titre: "Pas de nouvelles", raisons: ["La santé de l'app n'a pas pu être lue."] };
  const rouge = [], orange = [];
  const h = overview.health || {};
  if (h.level === "critical" || h.level === "degraded") rouge.push(`App : ${String(h.label || "dégradée").toLowerCase()}`);
  else if (h.level === "minor") orange.push("App légèrement dégradée");
  const items = (attente && attente.items) || [];
  const p0 = items.filter((i) => i.priorite === "P0").length;
  const p1 = items.filter((i) => i.priorite === "P1").length;
  if (p0) rouge.push(`${p0} geste urgent`);
  if (p1) orange.push(`${p1} geste important`);
  const nonVues = (alertes || []).filter((a) => !a.acknowledged);
  const graves = nonVues.filter((a) => couleurNiveau(a.level) === "rouge").length;
  const moyennes = nonVues.filter((a) => couleurNiveau(a.level) === "orange").length;
  if (graves) rouge.push(`${graves} alerte(s) grave(s)`);
  if (moyennes) orange.push(`${moyennes} alerte(s) à regarder`);
  const t = overview.totals || {};
  if (t.criticalBugs) rouge.push(`${t.criticalBugs} bug(s) critique(s)`);
  if (rouge.length) return { couleur: "rouge", titre: "Problème en cours", raisons: rouge.concat(orange) };
  if (orange.length) return { couleur: "orange", titre: "À surveiller", raisons: orange };
  return { couleur: "vert", titre: "Tout va bien", raisons: ["Aucun problème détecté, rien d'urgent à faire."] };
}

function rendreAccueil(d) {
  const v = verdictGlobal({ overview: d.overview, attente: d.attente, alertes: d.alertes });
  $("verdict").className = "verdict " + v.couleur;
  $("verdictTitre").textContent = v.titre;
  $("verdictDetail").textContent = v.raisons.slice(0, 3).join(" · ");

  const ch = vider("chiffres");
  const t = (d.overview && d.overview.totals) || {};
  const h = (d.overview && d.overview.health) || {};
  if (d.overview) {
    ch.append(
      chiffre(t.onlineUsers, "comptes en ligne"),
      chiffre(t.activeUsers, "actifs (5 min)"),
      chiffre(h.errors5m, "erreurs (5 min)", h.errors5m > 2 ? "orange" : null),
      chiffre(t.openBugs, "bugs ouverts", t.criticalBugs ? "rouge" : null),
    );
  } else ch.append(carte("Chiffres", "Non lu", "Le poste n'a pas répondu.", "gris"));

  // Ce qui t'attend
  const root = vider("attente");
  if (!d.attente) nonLu("attente", "Ce qui t'attend", d.erreurs.attente);
  else {
    const items = d.attente.items || [];
    if (!items.length) root.append(carte("Rien ne t'attend", "OK", "Aucun geste à faire : les machines tournent seules.", "vert"));
    items.slice(0, 12).forEach((it) => {
      const [mot, coul] = priorite(it.priorite);
      const c = carte(it.titre || it.key, mot, [it.detail, it.depuis ? "depuis " + ilYA(it.depuis) : ""].filter(Boolean).join(" · "), coul);
      lienDetail(c, it.cible);
      root.append(c);
    });
  }

  const act = vider("activite");
  if (d.overview) {
    act.append(
      chiffre(t.publications, "publications"), chiffre(t.messages, "messages"), chiffre(t.comments, "commentaires"),
      chiffre(t.reactions, "réactions"), chiffre(t.signupsConfirmes, "inscriptions confirmées"),
      chiffre(t.apiSuccessRate == null ? "—" : t.apiSuccessRate + " %", "requêtes réussies"),
    );
  }
}

// ─── Alertes ────────────────────────────────────────────────────────────────
function peut(cap) { return !!(moi && Array.isArray(moi.caps) && moi.caps.includes(cap)); }

async function action(bouton, fn, message) {
  if (message && !confirm(message)) return;
  bouton.disabled = true;
  try { await fn(); await actualiser(); }
  catch (e) { montrerErreur("Action refusée : " + (e.message || e)); bouton.disabled = false; }
}

function rendreAlertes(d) {
  const root = vider("listeAlertes");
  const bouton = $("toutVu");
  let nonVues = [];
  if (!d.alertes) { nonLu("listeAlertes", "Alertes", d.erreurs.alertes); bouton.hidden = true; }
  else {
    nonVues = d.alertes.filter((a) => !a.acknowledged).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    bouton.hidden = !nonVues.length || !peut("alerts");
    if (!nonVues.length) root.append(carte("Aucune alerte non vue", "OK", "", "vert"));
    nonVues.slice(0, 30).forEach((a) => {
      const coul = couleurNiveau(a.level);
      const c = carte(a.title || a.key, niveau(a.level), [a.message, ilYA(a.ts)].filter(Boolean).join(" · "), coul);
      if (peut("alerts")) {
        const acts = el("div", "carte-actions");
        const b = el("button", "btn", "Marquer vu"); b.type = "button";
        b.onclick = () => action(b, () => api(`/alerts/${encodeURIComponent(a.id)}/ack`, { method: "POST" }));
        acts.append(b); c.append(acts);
      }
      root.append(c);
    });
  }
  bouton.onclick = () => action(bouton, () => Promise.allSettled(nonVues.map((a) => api(`/alerts/${encodeURIComponent(a.id)}/ack`, { method: "POST" }))), `Marquer les ${nonVues.length} alertes comme vues ?`);
  const badge = $("badgeAlertes");
  const n = nonVues.filter((a) => couleurNiveau(a.level) !== "gris").length;
  badge.hidden = !n; badge.textContent = n > 99 ? "99+" : String(n);

  // Bugs
  const rb = vider("listeBugs");
  if (!d.bugs) nonLu("listeBugs", "Bugs", d.erreurs.bugs);
  else {
    const ouverts = d.bugs.filter((b) => b.status !== "corrige" && b.status !== "ignore");
    if (!ouverts.length) rb.append(carte("Aucun bug ouvert", "OK", "", "vert"));
    ouverts.slice(0, 25).forEach((b) => {
      const coul = couleurNiveau(b.severity);
      const c = carte(b.title || b.id, niveau(b.severity),
        `${b.count || 0} fois · ${b.users || 0} compte(s) · ${b.devices || 0} appareil(s) · vu ${ilYA(b.lastSeen)}`, coul);
      if (b.message) c.append(el("p", "corps", borne(b.message, 300)));
      if (peut("sessions")) {
        const acts = el("div", "carte-actions");
        const ok = el("button", "btn", "Corrigé"); ok.type = "button";
        ok.onclick = () => action(ok, () => api(`/bugs/${encodeURIComponent(b.id)}`, { method: "PATCH", body: { status: "corrige" } }), "Classer ce bug comme corrigé ?");
        const ign = el("button", "btn", "Ignorer"); ign.type = "button";
        ign.onclick = () => action(ign, () => api(`/bugs/${encodeURIComponent(b.id)}`, { method: "PATCH", body: { status: "ignore" } }), "Ignorer ce bug ?");
        acts.append(ok, ign); c.append(acts);
      }
      rb.append(c);
    });
  }

  // Incidents
  const ri = vider("listeIncidents");
  if (!d.incidents) nonLu("listeIncidents", "Incidents", d.erreurs.incidents);
  else {
    const open = (d.incidents || []).filter((x) => x.status !== "closed");
    if (!open.length) ri.append(carte("Aucun incident ouvert", "OK", "", "vert"));
    open.slice(0, 20).forEach((i) => ri.append(carte(i.signal?.title || i.id, i.phase || i.severity || "Ouvert",
      [i.signal?.message, i.occurrences > 1 ? i.occurrences + " occurrences" : ""].filter(Boolean).join(" · "), "orange")));
  }
}

// ─── Utilisateurs ───────────────────────────────────────────────────────────
function rendreUtilisateurs(d) {
  const m = vider("maintenant");
  const t = (d.overview && d.overview.totals) || {};
  if (d.overview) {
    m.append(chiffre(t.onlineUsers, "comptes en ligne"), chiffre(t.onlineDevices, "appareils en ligne"),
      chiffre(t.sessions, "sessions actives"), chiffre(t.strugglingDevices, "appareils en difficulté", t.strugglingDevices ? "orange" : null));
  } else nonLu("maintenant", "En ce moment", d.erreurs.overview);

  const s = d.signups;
  const ins = vider("inscriptions");
  const g = vider("grapheInscriptions");
  if (!s) { nonLu("inscriptions", "Inscriptions", d.erreurs.signups); g.hidden = true; }
  else if (s.configured === false) { ins.append(carte("Inscriptions", "Non configuré", "Supabase n'est pas branché sur ce poste.", "gris")); g.hidden = true; }
  else {
    ins.append(chiffre(s.today, "aujourd'hui"), chiffre(s.week, "7 jours"), chiffre(s.total, "au total"));
    const serie = Array.isArray(s.series) ? s.series : [];
    const max = Math.max(1, ...serie.map((x) => Number(x.n) || 0));
    g.hidden = !serie.length;
    serie.forEach((x, i) => {
      const n = Number(x.n) || 0;
      const b = el("div", "barre-j" + (n ? "" : " zero"));
      b.style.height = Math.max(2, Math.round((n / max) * 100)) + "%";
      b.title = `${x.t} : ${n}`;
      if (i === 0 || i === serie.length - 1 || i === Math.floor(serie.length / 2)) b.append(el("span", null, String(x.t || "").replace("-", "/")));
      g.append(b);
    });
  }

  const k = d.kpi;
  const f = vider("frequentation");
  if (!k) nonLu("frequentation", "Fréquentation", d.erreurs.kpi);
  else if (k.configured === false) f.append(carte("Fréquentation", "Non configuré", "Supabase n'est pas branché sur ce poste.", "gris"));
  else if (k.error) f.append(carte("Fréquentation", "Non lu", borne(k.error, 200), "gris"));
  else f.append(chiffre(k.dau, "par jour"), chiffre(k.wau, "par semaine"), chiffre(k.mau, "par mois"));

  const r = vider("listeAppareils");
  if (!d.devices) nonLu("listeAppareils", "Appareils", d.erreurs.devices);
  else {
    const liste = d.devices.filter((x) => x.active || x.online).slice(0, 25);
    if (!liste.length) r.append(carte("Personne en ce moment", "", "Aucun appareil actif dans les 5 dernières minutes.", "gris"));
    liste.forEach((x) => {
      const qui = x.userLabel || (x.userId ? "Compte" : "Visiteur");
      const ou = [x.platform, x.browser].filter(Boolean).join(" · ");
      const coul = x.struggling ? "orange" : x.online ? "vert" : "gris";
      const mot = x.struggling ? "En difficulté" : x.online ? "En ligne" : "Actif";
      r.append(carte(qui, mot, [ou, x.screen ? "écran : " + x.screen : "", "vu " + ilYA(x.lastSeen)].filter(Boolean).join(" · "), coul));
    });
  }
}

// ─── Machines ───────────────────────────────────────────────────────────────
function rendreMachines(d) {
  // Ce que les machines ont fait
  const mf = vider("machinesFait");
  if (!d.attente) nonLu("machinesFait", "Machines (7 j)", d.erreurs.attente);
  else {
    const x = d.attente.machines7j || {};
    const v = (n) => (n == null ? "—" : String(n));
    const [mot, coul] = x.chaine === "vit" ? ["Vivante", "vert"] : x.chaine ? ["À vérifier", "orange"] : ["Inconnue", "gris"];
    mf.append(carte("Chaîne GitHub", mot, `${v(x.enquetesGithubFermees)} enquête(s) close(s) · sauvegarde ${x.sauvegardeOk ? "OK" : "?"} · veille ${x.veilleOk ? "OK" : "?"}`, coul));
    mf.append(carte("Sentinelle locale", "", `${v(x.diagnostics)} diagnostic(s) · ${v(x.correctifsVerifies)} correctif(s) vérifié(s) · ${v(x.correctifsFusionnes)} fusionné(s) · ${v(x.recidives)} récidive(s)`));
  }

  // Sentinelle (lecture seule)
  const se = vider("sentinelleEtat");
  const sl = vider("sentinelleListe");
  if (!d.sentinel) { nonLu("sentinelleEtat", "Sentinelle", d.erreurs.sentinel); }
  else {
    const st = d.sentinel.state || {};
    se.append(carte("Surveillance", st.enabled ? (st.available ? "Active" : "Indisponible") : "En veille", st.enabled ? "La Sentinelle analyse les nouvelles erreurs." : "La Sentinelle est en pause.", st.enabled && st.available ? "vert" : "orange"));
    se.append(carte("File d'attente", st.queued ? String(st.queued) : "Vide", `${st.runsLastHour || 0} analyse(s) cette heure`, st.queued ? "orange" : "vert"));
    if (st.repairing) se.append(carte("Réparation en cours", "", st.repairing.title || st.repairing.id, "orange"));
    const ds = d.sentinel.diagnoses || [];
    if (!ds.length) sl.append(carte("Aucun diagnostic récent", "OK", "", "vert"));
    ds.slice(0, 20).forEach((x) => {
      const rep = x.repair?.ok ? ` · correctif vérifié ${x.repair.branch || ""}` : x.repair?.raison ? ` · réparation : ${x.repair.raison}` : "";
      const auto = x.repair?.autopilot?.status ? ` · fusion auto : ${x.repair.autopilot.status}` : "";
      const coul = x.error ? "rouge" : x.verdict === "defect" ? "orange" : "vert";
      sl.append(carte(x.title || x.id, x.error ? "Échec" : x.verdict === "defect" ? "Défaut" : "OK", `${x.verdict || "sans verdict"}${rep}${auto}${x.ts ? " · " + ilYA(x.ts) : ""}`, coul));
    });
  }

  rendreComptesRendus(d);

  // Mise en production
  const mp = vider("miseEnProd");
  const ctl = vider("controles");
  if (!d.guardian) { nonLu("miseEnProd", "Mise en production", d.erreurs.guardian); }
  else {
    const g = d.guardian;
    const ok = g.decision === "GO";
    mp.append(carte(ok ? "Mise en production autorisée" : "Mise en production bloquée", ok ? "OK" : g.decision ? "Bloquée" : "Inconnu",
      g.generatedAt ? "évalué " + ilYA(g.generatedAt) : "", ok ? "vert" : g.decision ? "rouge" : "gris"));
    (g.gates || []).forEach((x) => { const [mot, coul] = etat(x.state); ctl.append(carte(x.key, mot, x.detail, coul)); });
    if (!(g.gates || []).length) ctl.append(carte("Aucun contrôle", "", "", "gris"));
  }

  const ac = vider("actionsConseillees");
  if (!d.command) nonLu("actionsConseillees", "Actions", d.erreurs.command);
  else {
    const list = d.command.actions || [];
    if (!list.length) ac.append(carte("Aucune action urgente", "OK", "", "vert"));
    list.forEach((a) => ac.append(carte(a.action || "Action", a.priority || "", "", a.priority === "P0" ? "rouge" : "orange")));
  }

  const chg = vider("changements");
  if (!d.changes) nonLu("changements", "Changements", d.erreurs.changes);
  else if (!d.changes.comparable) chg.append(carte("Pas encore de comparaison", "", d.changes.reason || "", "gris"));
  else {
    if (!(d.changes.changes || []).length) chg.append(carte("Rien n'a changé", "OK", "", "vert"));
    (d.changes.changes || []).slice(0, 30).forEach((c) => chg.append(carte(c.key || c.type || "changement", "",
      `${c.before !== undefined ? String(c.before) + " → " : ""}${c.now !== undefined ? String(c.now) : ""}`)));
  }

  const ob = vider("observation");
  if (!d.observation) nonLu("observation", "Observation", d.erreurs.observation);
  else {
    const parts = d.observation.parts || {};
    Object.entries(parts).forEach(([k, v]) => { const [mot, coul] = etat(v.state); ob.append(carte(k, mot, v.detail || "", coul)); });
    if (!Object.keys(parts).length) { const [mot, coul] = etat(d.observation.state); ob.append(carte("Observation", mot, d.observation.detail || "", coul)); }
  }

  const lt = vider("listeTests");
  if (!d.tests) nonLu("listeTests", "Tests", d.erreurs.tests);
  else {
    const courant = d.tests.current;
    if (courant && courant.status === "running") lt.append(carte("Suite en cours : " + (courant.label || courant.id || "?"), "En cours", "", "orange"));
    (d.tests.suites || []).forEach((s) => {
      const c = carte(s.label || s.id, "", s.cmd || "");
      if (peut("tests")) {
        const acts = el("div", "carte-actions");
        const b = el("button", "btn", "Lancer"); b.type = "button";
        b.onclick = () => action(b, () => api("/tests/run", { method: "POST", body: { id: s.id } }), "Lancer la suite « " + (s.label || s.id) + " » ?");
        acts.append(b); c.append(acts);
      }
      lt.append(c);
    });
  }
}

// Comptes rendus (Veille / Digest / Sentinelle GitHub). Le corps du digest reste
// du TEXTE ; seuls les liens vers github.com deviennent cliquables.
function rendreComptesRendus(d) {
  const root = vider("comptesRendus");
  const cr = d.comptes;
  if (!cr) { nonLu("comptesRendus", "Comptes rendus", d.erreurs.comptes); return; }
  if (cr.erreur) root.append(carte("Comptes rendus", "Non lu", "lecture GitHub en erreur : " + borne(cr.erreur, 200), "gris"));
  const v = cr.veille;
  if (!v) root.append(carte("Veille de production", "Inconnu", "aucun tableau de veille lu", "gris"));
  else {
    const [mot, coul] = crEtat(v.etat);
    const c = carte("Veille de production", mot, "mise à jour " + ilYA(Date.now() - Number(v.ageMin) * 60000), coul);
    const lignes = (Array.isArray(v.lignes) ? v.lignes : []).filter((l) => l.etat && l.etat !== "ok").slice(0, 8);
    lignes.forEach((l) => c.append(el("p", null, "• " + borne(l.cle, 80) + " : " + borne(l.texte, 200))));
    lienDetail(c, v.run);
    root.append(c);
  }
  const dg = cr.digest;
  if (dg) {
    const c = carte(borne(dg.titre || "Digest", 200), dg.emis === true ? "À lire" : dg.emis === false ? "Rien à faire" : "Inconnu",
      "composé " + ilYA(Date.now() - Number(dg.ageMin) * 60000), dg.emis === true ? "orange" : dg.emis === false ? "vert" : "gris");
    const txt = borne(dg.texte, 4000);
    if (txt) { const det = el("details", "repli"); det.append(el("summary", null, "Lire le digest"), el("p", "corps", txt)); c.append(det); }
    lienDetail(c, dg.run);
    root.append(c);
  }
  const s = cr.sentinelle || {};
  const ouv = Array.isArray(s.ouvertes) ? s.ouvertes : null;
  if (ouv) {
    root.append(carte("Enquêtes GitHub", ouv.length ? ouv.length + " ouverte(s)" : "Aucune ouverte", `${Array.isArray(s.fermees7j) ? s.fermees7j.length : "?"} close(s) sur 7 j`, ouv.length ? "orange" : "vert"));
    ouv.slice(0, 6).forEach((i) => { const c = carte("#" + i.numero + " · " + borne(i.titre, 160), "Ouverte", i.depuis ? "depuis " + ilYA(i.depuis) : "", "orange"); lienDetail(c, i.url); root.append(c); });
  }
}

// ─── Réglages ───────────────────────────────────────────────────────────────
const ROLE = { admin: "Administrateur", developer: "Développeur", tester: "Testeur", observer: "Observateur" };
function rendreReglages() {
  const c = vider("compte");
  if (moi) {
    c.append(carte(moi.user, ROLE[moi.role] || moi.role, moi.expiresAt ? "Session valable jusqu'au " + new Date(moi.expiresAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : ""));
  }
  const a = vider("adresses");
  const liste = (moi && Array.isArray(moi.adressesTelephone)) ? moi.adressesTelephone : [];
  a.append(carte("Adresse actuelle", "", location.origin + "/mobile.html"));
  liste.filter((u) => !u.startsWith(location.origin)).forEach((u) => a.append(carte("Autre adresse du PC", "", u)));
  a.append(el("p", "discret", "Même Wi-Fi que le PC : ouvre l'une de ces adresses. Hors de chez toi : installe Tailscale (gratuit) sur le PC et le téléphone — son adresse en 100.x apparaîtra ici."));
}

let invitation = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; majInstallation(); });
function majInstallation() {
  const texte = $("installTexte"), bouton = $("installer");
  const installe = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  bouton.hidden = !invitation || installe;
  if (installe) texte.textContent = "C'est fait : l'application est installée sur ce téléphone.";
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) texte.textContent = "Sur iPhone : dans Safari, touche le bouton Partager (carré avec une flèche), puis « Sur l'écran d'accueil ».";
  else if (invitation) texte.textContent = "Touche le bouton ci-dessous pour ajouter le pilotage à ton écran d'accueil.";
  else texte.textContent = "Sur Android : dans Chrome, ouvre le menu ⋮ puis « Ajouter à l'écran d'accueil » (ou « Installer l'application »).";
}
$("installer").onclick = async () => {
  if (!invitation) return;
  invitation.prompt();
  try { await invitation.userChoice; } catch {}
  invitation = null; majInstallation();
};

function lireAuto() { try { return localStorage.getItem("passio_pilot_auto") !== "0"; } catch { return true; } }
$("autoMaj").checked = lireAuto();
$("autoMaj").onchange = (e) => { try { localStorage.setItem("passio_pilot_auto", e.target.checked ? "1" : "0"); } catch {} };

$("deconnexion").onclick = async () => {
  if (!confirm("Se déconnecter de ce téléphone ?")) return;
  try { await api("/logout", { method: "POST" }); } catch {}
  moi = null; montrerEcran("connexion");
};

// ─── Navigation ─────────────────────────────────────────────────────────────
function ouvrirOnglet(id) {
  document.querySelectorAll(".barre button").forEach((b) => b.classList.toggle("actif", b.dataset.tab === id));
  document.querySelectorAll(".onglet").forEach((o) => o.classList.toggle("actif", o.id === id));
  const o = $(id);
  $("titreOnglet").textContent = (o && o.dataset.titre) || "Pilotage";
  try { sessionStorage.setItem("passio_pilot_onglet", id); } catch {}
  window.scrollTo(0, 0);
}
document.querySelectorAll(".barre button").forEach((b) => b.addEventListener("click", () => ouvrirOnglet(b.dataset.tab)));

function montrerEcran(nom) {
  $("ecranInjoignable").hidden = nom !== "injoignable";
  $("ecranConnexion").hidden = nom !== "connexion";
  $("app").hidden = nom !== "app";
  if (nom === "connexion") setTimeout(() => $("cxUser").focus(), 50);
}
function montrerErreur(t) { const b = $("bandeauErreur"); b.hidden = !t; b.textContent = t || ""; }

function majEtat() {
  const e = $("etatMaj");
  if (!navigator.onLine) { e.textContent = "Hors ligne"; e.className = "etat-maj hors-ligne"; return; }
  e.className = "etat-maj";
  e.textContent = derniereMaj ? "Mis à jour " + ilYA(derniereMaj) : "Chargement…";
}

// ─── Actualisation ──────────────────────────────────────────────────────────
async function actualiser() {
  if (enCours) return;
  enCours = true;
  const bouton = $("actualiser");
  bouton.classList.add("tourne"); bouton.disabled = true;
  try {
    const resultats = await Promise.allSettled(REQUETES.map(([, path]) => api(path)));
    const d = { erreurs: {} };
    resultats.forEach((r, i) => {
      const nom = REQUETES[i][0];
      if (r.status === "fulfilled") d[nom] = r.value; else { d[nom] = null; d.erreurs[nom] = r.reason; }
    });
    // Session expirée : retour à l'écran de connexion, pas à des cartes vides.
    if (Object.values(d.erreurs).some((e) => e && e.status === 401)) { moi = null; montrerEcran("connexion"); return; }
    // Poste injoignable : TOUT a échoué sans statut HTTP.
    if (resultats.every((r) => r.status === "rejected" && !r.reason?.status)) { montrerErreur("Le poste de pilotage ne répond pas. Dernières données conservées."); return; }

    rendreAccueil(d); rendreAlertes(d); rendreUtilisateurs(d); rendreMachines(d);
    const pannes = Object.values(d.erreurs).filter((e) => !(e && (e.status === 401 || e.status === 403)));
    montrerErreur(pannes.length ? `${pannes.length} domaine(s) indisponible(s) — les autres preuves restent affichées.` : "");
    derniereMaj = Date.now();
  } finally {
    enCours = false; bouton.classList.remove("tourne"); bouton.disabled = false; majEtat();
  }
}
$("actualiser").onclick = actualiser;

// ─── Connexion ──────────────────────────────────────────────────────────────
$("formConnexion").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("cxErreur"), b = $("cxBouton");
  err.hidden = true; b.disabled = true; b.textContent = "Connexion…";
  try {
    await api("/login", { method: "POST", body: { user: $("cxUser").value.trim(), password: $("cxPass").value, remember: $("cxRemember").checked } });
    $("cxPass").value = "";
    await demarrer();
  } catch (e) {
    err.hidden = false;
    err.textContent = e.status === 401 ? "Identifiant ou mot de passe incorrect." : e.status === 429 ? "Trop d'essais : attends 5 minutes." : "Connexion impossible : " + (e.message || e);
  } finally { b.disabled = false; b.textContent = "Se connecter"; }
});
$("reessayer").onclick = () => demarrer();

async function demarrer() {
  try { await api("/health"); }
  catch (e) { if (!e.status) { montrerEcran("injoignable"); return; } }
  try { moi = await api("/me"); }
  catch (e) { moi = null; montrerEcran(e.status ? "connexion" : "injoignable"); return; }
  montrerEcran("app");
  let onglet = "accueil";
  try { onglet = sessionStorage.getItem("passio_pilot_onglet") || "accueil"; } catch {}
  ouvrirOnglet($(onglet) ? onglet : "accueil");
  rendreReglages(); majInstallation();
  await actualiser();
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && moi && Date.now() - derniereMaj > 15000) actualiser(); });
window.addEventListener("online", () => { majEtat(); if (moi) actualiser(); });
window.addEventListener("offline", majEtat);
setInterval(() => {
  majEtat();
  if (moi && lireAuto() && document.visibilityState === "visible" && Date.now() - derniereMaj >= 30000) actualiser();
}, 5000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mobile-sw.js").catch(() => {});
demarrer();
