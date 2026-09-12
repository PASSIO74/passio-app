#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LES QUATRE ENREGISTREMENTS DNS QUI DÉCIDENT SI L'E-MAIL DE CONFIRMATION
// ARRIVE — ou part en indésirables (2026-09-12)
//
// Sans DKIM aligné sur le domaine d'expédition, l'e-mail de confirmation part
// en spam, et un compte non confirmé est INUTILISABLE. Personne ne se plaint :
// la personne abandonne. C'est le défaut qui tue une ouverture EN SILENCE, et
// c'est exactement pour ça qu'il lui faut une mesure — l'absence de plainte ne
// prouve rien.
//
// ⚠️ CE SCRIPT NE POSE RIEN. Il ne fait que LIRE le DNS public et dire ce qui
// manque. Poser les entrées reste un geste chez OVH (`docs/SETUP_SMTP_AUTH.md`
// §2), et vérifier le domaine reste un geste chez Brevo.
//
// ⚠️ POURQUOI IL NE VIT PAS DANS `npm run verif` NI DANS LA CI DE DÉPLOIEMENT :
// tant que les entrées ne sont pas posées, il est ROUGE — et une gate rouge sur
// un fait extérieur au dépôt bloquerait tous les déploiements pour une raison
// qu'aucun commit ne peut corriger. C'est un contrôle d'EXPLOITATION, pas une
// gate de code.
//
// ⚠️ LE PIÈGE QUE CE SCRIPT CHERCHE EN PREMIER, parce que c'est le plus probable
// et le plus silencieux : le POINT FINAL des deux CNAME. Sans lui, OVH complète
// la cible par le domaine et l'on obtient
// `b1.passio-app-fr.dkim.brevo.com.passio-app.fr` — une cible qui EXISTE dans la
// zone, que `nslookup` résout sans broncher, et qui ne signe RIEN. Un contrôle
// qui se contenterait de « le CNAME existe » rendrait donc vert sur le défaut
// même qu'il doit attraper.
// ═══════════════════════════════════════════════════════════════════════════

import { Resolver } from "node:dns/promises";

const DOMAINE = "passio-app.fr";
// Résolveur public explicite : la machine qui lance ce script peut avoir un
// resolver d'entreprise qui filtre ou met en cache agressivement.
const resolveur = new Resolver();
resolveur.setServers(["8.8.8.8", "1.1.1.1"]);

const ATTENDUS = [
  { cle: "brevo-code", type: "TXT", nom: DOMAINE,
    contient: "brevo-code:d6cd3a738248091f3341c59815171780",
    role: "preuve de propriété du domaine, exigée par Brevo" },
  { cle: "dkim1", type: "CNAME", nom: `brevo1._domainkey.${DOMAINE}`,
    cible: "b1.passio-app-fr.dkim.brevo.com",
    role: "première clé DKIM — c'est elle qui fait sortir du spam" },
  { cle: "dkim2", type: "CNAME", nom: `brevo2._domainkey.${DOMAINE}`,
    cible: "b2.passio-app-fr.dkim.brevo.com",
    role: "seconde clé DKIM (rotation)" },
  { cle: "dmarc", type: "TXT", nom: `_dmarc.${DOMAINE}`,
    contient: "v=DMARC1",
    role: "politique DMARC — p=none observe sans rien rejeter" },
];

const vert = [], rouge = [];

async function txt(nom) {
  try { return (await resolveur.resolveTxt(nom)).map((p) => p.join("")); }
  catch (e) { return { erreur: e.code || String(e) }; }
}
async function cname(nom) {
  try { return await resolveur.resolveCname(nom); }
  catch (e) { return { erreur: e.code || String(e) }; }
}

for (const a of ATTENDUS) {
  const res = a.type === "TXT" ? await txt(a.nom) : await cname(a.nom);

  if (res && res.erreur) {
    rouge.push({ ...a, etat: "ABSENT", detail: `résolution impossible (${res.erreur})` });
    continue;
  }
  if (a.type === "TXT") {
    const trouve = res.find((v) => v.includes(a.contient));
    if (trouve) vert.push({ ...a, detail: trouve.slice(0, 80) });
    else rouge.push({ ...a, etat: "INCORRECT",
      detail: res.length ? `présent mais sans « ${a.contient} » : ${res.map((v) => v.slice(0, 50)).join(" · ")}`
                         : "aucun enregistrement TXT" });
    continue;
  }
  // CNAME : la cible EXACTE compte, et le défaut le plus probable est la
  // cible complétée par le domaine faute de point final.
  const cible = (res[0] || "").replace(/\.$/, "");
  if (cible === a.cible) {
    vert.push({ ...a, detail: cible });
  } else if (cible === `${a.cible}.${DOMAINE}` || cible.endsWith(`.${DOMAINE}`)) {
    rouge.push({ ...a, etat: "POINT FINAL MANQUANT",
      detail: `cible « ${cible} » — OVH a complété par le domaine. Reposer la valeur AVEC le point final : « ${a.cible}. »` });
  } else {
    rouge.push({ ...a, etat: "INCORRECT", detail: `cible « ${cible} », attendu « ${a.cible} »` });
  }
}

const l = (s) => process.stdout.write(s + "\n");
l("");
l(`── DNS d'expédition de ${DOMAINE} ────────────────────────────────────`);
for (const v of vert) l(`  ✅ ${v.cle.padEnd(11)} ${v.detail}`);
for (const r of rouge) l(`  ❌ ${r.cle.padEnd(11)} ${r.etat} — ${r.detail}`);
l("");
l(`  ${vert.length} en place · ${rouge.length} à poser ou à corriger`);

if (rouge.length) {
  l("");
  l("  Les valeurs exactes et les quatre lignes à coller : docs/SETUP_SMTP_AUTH.md §2");
  l("  OVH → Noms de domaine → passio-app.fr → Zone DNS → « Ajouter une entrée »");
  l("  Puis Brevo → Domains → passio-app.fr → « Vérifier les enregistrements ».");
  l("");
  l("  ⚠️ Tant que DKIM n'est pas en place, l'e-mail de confirmation part");
  l("     probablement en indésirables — et personne ne le signalera.");
  process.exit(1);
}
l("");
l("  ✅ Les quatre enregistrements sont en place. Reste à vérifier, chez Brevo,");
l("     que le domaine est marqué « authentifié » : le DNS est nécessaire, il");
l("     n'est pas suffisant.");
