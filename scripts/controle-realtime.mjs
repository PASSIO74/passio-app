#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LE JOIN REALTIME QUE PERSONNE NE JOUAIT — et les TROIS questions qu'il tranche
// (2026-09-12)
//
// `docs/OUVERTURE_PUBLIQUE_2026-09-11.md` écrivait : « ouvrir l'application à
// deux comptes et vérifier qu'un appel sonne : c'est la seule preuve, aucun test
// du dépôt ne joue un join Realtime réel. » Ce script la joue.
//
// ⚠️ IL NE CHANGE RIEN. Il s'abonne, lit le verdict de la souscription, et se
// déconnecte. Aucune écriture, aucun réglage touché.
//
// ⚠️ POURQUOI IL NE PEUT PAS VIVRE DANS `npm run verif` NI DANS LA CI DE
// DÉPLOIEMENT : il juge un réglage du TABLEAU DE BORD Supabase, extérieur au
// dépôt. Une gate rouge qu'aucun commit ne peut réparer bloquerait tous les
// déploiements. C'est un contrôle d'EXPLOITATION, lancé à la demande.
//
// ── LES TROIS QUESTIONS ────────────────────────────────────────────────────
//
// ① « Allow public access » est-il encore ALLUMÉ ? C'est le réglage qui rend
//    les policies OPPOSABLES : tant qu'il permet les canaux publics, un client
//    qui omet `private: true` écoute encore, policies ou pas. Il ne se lit NULLE
//    PART — ni dans le dépôt, ni dans la base (pas de `realtime.tenants`), ni
//    par l'API PostgREST. La seule façon de le savoir est d'ESSAYER un canal
//    public et de regarder si l'abonnement est accepté.
//
// ② Un appel SORTANT fonctionne-t-il ? C'est le défaut que la PR #341 a
//    rattrapé de justesse : l'appelant s'abonne à `ring:<pair>` AVANT d'émettre
//    (app-05, `_callChannel("ring:" + peer.id)`), et Realtime refuse un join
//    privé sans droit de LECTURE. Une policy « on ne lit que SA sonnerie »
//    tuait donc tous les appels sortants — sans une erreur visible côté
//    produit, l'écran d'appel restant simplement muet.
//
// ③ Le fournisseur « Anonymous » est-il désactivé ? Même nature : un réglage du
//    plan de contrôle, invisible partout, mais qui s'ÉPROUVE. `onbSkipAuth` est
//    un chemin mort côté produit, mais un `signInAnonymously()` qui réussit
//    ouvre TOUTES les policies `authenticated` à qui le demande, sans compte.
//    ⚠️ L'essai CRÉE un compte s'il aboutit : le script le supprime aussitôt,
//    sinon il laisserait derrière lui exactement ce qu'il dénonce.
//
// ⚠️ LE PIÈGE DE CE SCRIPT LUI-MÊME : un `CHANNEL_ERROR` peut venir d'un refus
// de policy OU d'une panne de réseau, et les confondre ferait dire « le réglage
// est coupé » sur une coupure passagère. On exige donc un canal TÉMOIN qui,
// lui, doit réussir : si même le témoin échoue, le verdict est « indéterminé »,
// jamais « fermé ». Un contrôle qui ne sait pas dire « je ne sais pas » finit
// par affirmer n'importe quoi.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || "https://njkiyoklssvefstljemx.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// ⚠️ La clé `anon` est PUBLIQUE par construction (elle vit en clair dans
// `app-08` et part dans chaque page servie) : la relire depuis la source plutôt
// que d'en faire un secret évite un secret de plus à tenir à jour, et surtout
// évite qu'un contrôle mesure une clé DIFFÉRENTE de celle du produit.
function anonDuProduit() {
  try {
    const src = readFileSync(new URL("../js/app-08-ui-modals-tour.js", import.meta.url), "utf8");
    const m = src.match(/const SUPABASE_KEY = "([^"]+)"/);
    return m ? m[1] : "";
  } catch (e) { return ""; }
}
const ANON = process.env.SUPABASE_ANON_KEY || anonDuProduit();
const DELAI = Number(process.env.CONTROLE_RT_TIMEOUT_MS || 15000);

if (!SERVICE || !ANON) {
  console.error("SUPABASE_SERVICE_ROLE_KEY est requis ; la clé anon se lit dans js/app-08 (ou SUPABASE_ANON_KEY).");
  process.exit(2);
}

const MDP = "Passio!E2E-" + Math.random().toString(36).slice(2, 10);
const jetable = (p) => `e2e_rt_${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@passio-e2e.test`;

/** Compte PRÉ-CONFIRMÉ via l'API admin : « Confirm email » est actif, donc
 *  `signUp` ne rendrait aucune session (et consommerait le quota Brevo). */
async function compte(prefixe) {
  const email = jetable(prefixe);
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: MDP, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`création du compte ${prefixe} : HTTP ${r.status} ${await r.text()}`);
  const cli = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cli.auth.signInWithPassword({ email, password: MDP });
  if (error) throw new Error(`connexion ${prefixe} : ${error.message}`);
  return { cli, uid: data.user.id, email };
}

/** Rend "OUVERT" | "REFUSE" | "PANNE" — jamais une exception. */
function joindre(cli, topic, prive) {
  return new Promise((resolve) => {
    const ch = cli.channel(topic, { config: { private: prive, broadcast: { self: false } } });
    const fin = (v) => { clearTimeout(t); try { cli.removeChannel(ch); } catch (e) {} resolve(v); };
    const t = setTimeout(() => fin("PANNE"), DELAI);
    ch.subscribe((statut, err) => {
      if (statut === "SUBSCRIBED") return fin("OUVERT");
      if (statut === "CHANNEL_ERROR") {
        const m = String((err && err.message) || err || "");
        // Le discriminant : un refus nomme la permission, une panne non.
        return fin(/permission|policy|unauthorized|denied|not authorized/i.test(m) ? "REFUSE" : "PANNE");
      }
      if (statut === "TIMED_OUT" || statut === "CLOSED") return fin("PANNE");
    });
  });
}

const l = (s) => process.stdout.write(s + "\n");
const lignes = [];
let sortie = 0;

try {
  const A = await compte("a");
  const B = await compte("b");
  l("");
  l("── Contrôle Realtime en conditions réelles ───────────────────────────");
  l(`  comptes jetables : ${A.uid.slice(0, 8)}… et ${B.uid.slice(0, 8)}…`);

  // ⚠️ LE TÉMOIN D'ABORD. `realtime:db` en privé est ouvert à tout compte par
  // `passio_rt_recevoir` : s'il échoue, c'est le réseau ou le service, pas une
  // policy — et aucun autre verdict de ce script n'est alors interprétable.
  const temoin = await joindre(A.cli, "realtime:db", true);
  if (temoin !== "OUVERT") {
    l(`  ⚠️  TÉMOIN EN ÉCHEC (${temoin}) — le canal privé « realtime:db » devrait`);
    l("      toujours s'ouvrir à un compte connecté. Rien n'est concluant ici :");
    l("      ni le réglage du tableau de bord, ni l'état des appels.");
    l("      Vérifier le réseau et le service Realtime, puis rejouer.");
    process.exit(3);
  }
  l("  ✅ témoin : le canal privé « realtime:db » s'ouvre — le service répond.");

  // ① Le réglage du tableau de bord, mesuré par son EFFET.
  const publik = await joindre(A.cli, "controle_ouverture_public", false);
  if (publik === "OUVERT") {
    lignes.push(["❌", "« Allow public access » est ENCORE ACTIF",
      "un canal PUBLIC s'ouvre : les policies ne sont pas opposables, un client qui omet private:true écoute toujours"]);
    sortie = 1;
  } else if (publik === "REFUSE") {
    lignes.push(["✅", "« Allow public access » est COUPÉ",
      "un canal public est refusé : les policies de realtime.messages gouvernent bien"]);
  } else {
    lignes.push(["⚠️", "réglage indéterminé",
      "le canal public n'a ni abouti ni été refusé explicitement — rejouer"]);
    sortie = sortie || 3;
  }

  // ② L'appel SORTANT : A doit pouvoir s'abonner à la sonnerie de B.
  const sortant = await joindre(A.cli, `ring:${B.uid}`, true);
  if (sortant === "OUVERT") {
    lignes.push(["✅", "les appels SORTANTS fonctionnent",
      "A s'abonne à ring:<B> — c'est ce que fait _callChannel avant d'émettre l'invitation"]);
  } else {
    lignes.push(["❌", "les appels SORTANTS sont MORTS",
      `A ne peut pas s'abonner à ring:<B> (${sortant}) : l'invitation ne partira jamais, sans erreur visible`]);
    sortie = 1;
  }

  // ③ La sonnerie ENTRANTE, contrôle de non-régression.
  const entrant = await joindre(B.cli, `ring:${B.uid}`, true);
  if (entrant === "OUVERT") lignes.push(["✅", "la sonnerie ENTRANTE fonctionne", "B lit sa propre sonnerie"]);
  else { lignes.push(["❌", "la sonnerie ENTRANTE est MORTE", `B ne lit pas ring:<B> (${entrant})`]); sortie = 1; }

  // ④ Un visiteur SANS COMPTE ne doit rien lire, réglage coupé ou non.
  const visiteur = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const sansCompte = await joindre(visiteur, `ring:${B.uid}`, true);
  if (sansCompte === "OUVERT") {
    lignes.push(["❌", "un VISITEUR lit une sonnerie privée", "policy passio_rt_recevoir contournée — à traiter en priorité"]);
    sortie = 1;
  } else {
    lignes.push(["✅", "un visiteur sans compte ne lit aucune sonnerie", `refusé (${sansCompte})`]);
  }

  // ⑤ LE FOURNISSEUR « ANONYMOUS », MESURÉ EN L'ESSAYANT.
  // ⚠️ Il ne se lit pas davantage que « Allow public access » : c'est un réglage
  // du plan de contrôle. Mais il s'ÉPROUVE — et l'enjeu est net : `onbSkipAuth`
  // est un chemin mort côté produit, mais un `signInAnonymously()` réussi
  // ouvrirait TOUTES les policies `authenticated` à n'importe qui, sans compte.
  // ⚠️ Si ça marche, ça CRÉE un compte : on le supprime immédiatement, sinon ce
  // contrôle laisserait derrière lui exactement ce qu'il dénonce.
  const anonCli = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  let essaiAnon;
  try { essaiAnon = await anonCli.auth.signInAnonymously(); }
  catch (e) { essaiAnon = { error: { message: String(e && e.message || e) } }; }

  if (essaiAnon && essaiAnon.data && essaiAnon.data.user) {
    const uid = essaiAnon.data.user.id;
    lignes.push(["❌", "le fournisseur ANONYMOUS est ACTIF",
      `un compte sans e-mail vient d'être créé (${uid.slice(0, 8)}…) : toutes les policies « authenticated » sont ouvertes à qui le demande`]);
    sortie = 1;
    // Ne pas laisser le compte derrière soi.
    const sup = await fetch(`${URL}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    lignes.push([sup.ok ? "✅" : "⚠️", "compte anonyme de contrôle supprimé",
      sup.ok ? uid.slice(0, 8) + "… retiré" : `ÉCHEC HTTP ${sup.status} — à supprimer à la main : ${uid}`]);
    if (!sup.ok) sortie = 1;
  } else {
    const m = (essaiAnon && essaiAnon.error && essaiAnon.error.message) || "refusé";
    lignes.push(["✅", "le fournisseur ANONYMOUS est DÉSACTIVÉ", `la connexion sans compte est refusée (${m})`]);
  }

  l("");
  for (const [i, titre, detail] of lignes) l(`  ${i} ${titre}\n      ${detail}`);
  l("");
  if (sortie === 0) l("  ✅ Realtime est dans l'état attendu après l'ouverture.");
  else if (sortie === 1) l("  ❌ Au moins un point demande une action — voir ci-dessus.");
  else l("  ⚠️ Verdict partiel : rejouer avant de décider.");
} catch (e) {
  console.error("\n  ⚠️ contrôle interrompu :", e.message);
  console.error("  Aucun verdict n'est rendu — ne rien conclure de cet échec.");
  process.exit(3);
}
process.exit(sortie);
