#!/usr/bin/env node
// Assemble donnees/domaines/msg-conversation.json à partir de `-_surfaces.js` et
// `-_constats.js`, puis le RECROISE avec le disque :
//   · chaque constat cité par une surface existe, et inversement ;
//   · chaque visuel cité existe en capture ; le champ `visuel` est ramené à ce qui
//     est réellement sur disque (jamais « avant-apres » sans image APRÈS) ;
//   · imprime les compteurs du rapport.
//   node docs/audit-ux-ui-2026-11-10/outils/sondes/msg-conversation-_registre.js
"use strict";
const fs = require("fs");
const path = require("path");
const AUDIT = path.resolve(__dirname, "..", "..");
const DOM = "msg-conversation";
const surfaces = require("./msg-conversation-_surfaces.js");
const constats = require("./msg-conversation-_constats.js").slice().sort((a, b) => a.id.localeCompare(b.id));

const dirDon = path.join(AUDIT, "donnees", "captures", DOM);
const fiches = {};
if (fs.existsSync(dirDon)) for (const f of fs.readdirSync(dirDon).filter((x) => x.endsWith(".json"))) {
  try { const j = JSON.parse(fs.readFileSync(path.join(dirDon, f), "utf8")); (fiches[j.id] = fiches[j.id] || []).push(j); } catch (e) { console.log("fiche illisible : " + f); }
}
const aAvant = (id) => !!fiches[id];
const aApres = (id) => (fiches[id] || []).some((f) => f.apres);

const alertes = [];
const idsC = new Set(constats.map((c) => c.id));
const idsS = new Set(surfaces.map((s) => s.id));
for (const s of surfaces) {
  for (const p of s.problemes) if (!idsC.has(p)) alertes.push(s.id + " cite un constat inconnu " + p);
  const caps = s.captures && s.captures.length ? s.captures : [s.id];
  const vise = s.visuel;
  const avant = caps.some(aAvant), apres = caps.some(aApres);
  let reel = "aucun";
  if (vise === "avant-apres") reel = apres ? "avant-apres" : (avant ? "avant" : "aucun");
  else if (vise === "avant") reel = avant ? "avant" : "aucun";
  if (reel !== vise) alertes.push(s.id + " : visuel visé « " + vise + " », sur disque « " + reel + " »");
  if (vise === "aucun" && avant && !s.captures) alertes.push(s.id + " : capture présente alors que le registre vise « aucun »");
  s._visuelVise = vise; s.visuel = reel;
  if (s.verdict === "a-ameliorer" && !s.problemes.length) alertes.push(s.id + " : à améliorer sans constat");
}
for (const c of constats) {
  for (const id of c.surfaces) {
    if (!idsS.has(id)) alertes.push(c.id + " cite une surface inconnue " + id);
    else { const s = surfaces.find((x) => x.id === id); if (!s.problemes.includes(c.id)) s.problemes.push(c.id); }
  }
  for (const id of c.visuels) if (!aAvant(id)) alertes.push(c.id + " cite un visuel sans capture " + id);
}
for (const id of Object.keys(fiches)) if (!surfaces.some((s) => (s.captures || [s.id]).includes(id))) alertes.push("capture hors registre : " + id);

const sortie = {
  domaine: DOM,
  groupe: "Messagerie",
  titre: "Messagerie — la conversation",
  resume: "L'écran de conversation fait l'essentiel correctement : ouverture rapide, envoi sans doublon, file hors ligne, relance d'un envoi raté, pagination qui garde la position, réponses, réactions, signalement d'un message. Mais plusieurs défauts mesurés touchent des gestes quotidiens : mes vocaux, documents et positions envoyés sont blancs sur fond clair (1,08:1), le fil n'arrive pas sur le dernier message quand il contient des médias (360 px d'écart), le champ de saisie ne fait que 156 px sur 390 et la touche Entrée envoie sur mobile. Le vocal est le point le plus fragile : un simple toucher lance un enregistrement qui continue sans doigt posé et que le toucher suivant envoie, et l'annuler demande un second doigt. Trois envois se font sans filet — position exacte, photo, suppression « pour tous » — et un GIF ou une position en échec restent affichés comme envoyés. Surtout, aucun toast n'est visible tant qu'une conversation est ouverte (pile des toasts sous le panneau) : « message trop long », micro ou position refusés, pièce jointe non envoyée, refus dans une conversation d'exemple — tous ces garde-fous existent, mais le geste semble ne rien faire. Enfin la conversation est coupée de la boucle Fil → interaction → IRL : l'en-tête ne rappelle ni la passion commune ni l'activité dont on discute, et « proposer un IRL » existe en deux versions différentes.",
  aConserver: [
    "L'ouverture ne donne pas le focus au champ sur tactile : le clavier ne masque pas le fil (correctif du 2026-09-02, vérifié).",
    "Aucun doublon : double appui sur Envoyer et Entrée répétée ne créent qu'un message (2 lignes en base pour 2 envois).",
    "La file hors ligne : un message écrit sans réseau part seul, une seule fois, au retour de la connexion.",
    "« Réessayer » renvoie réellement le message après une panne serveur ; rien n'est perdu.",
    "La pagination par 40 messages conserve le point de lecture à chaque page (230 messages parcourus en 5 remontées, rendu complet en 29 ms).",
    "Répondre : barre « Réponse à … » avec extrait, citation lisible dans la bulle, saut au message cité.",
    "Signaler un message : feuille claire, confidentialité rappelée, absent de mes propres messages.",
    "Le dépôt d'une pièce jointe a un statut d'échec et une relance depuis la copie locale.",
    "Groupes : nom de l'expéditeur au-dessus de chaque série de bulles, mentions @ proposées dans une liste propre.",
    "Le champ de saisie est à 16 px (pas de zoom automatique sur iOS) et grandit jusqu'à cinq lignes.",
    "Le brouillon est gardé par conversation pendant la session et annoncé dans la liste.",
    "Le retour système ferme la conversation (entrée d'historique dédiée).",
    "Le menu « + » : six lignes de 60 px, pictogrammes au trait cohérents, « Proposer un IRL » en tête.",
    "Message de plus de 5 000 caractères : refusé, le texte reste dans le champ (le message qui donne la limite existe, mais il est masqué — MSG-C85).",
  ],
  registre: surfaces.map((s) => { const { _visuelVise, ...r } = s; return r; }),
  constats,
};
const cible = path.join(AUDIT, "donnees", "domaines", DOM + ".json");
fs.mkdirSync(path.dirname(cible), { recursive: true });
fs.writeFileSync(cible, JSON.stringify(sortie, null, 1));
JSON.parse(fs.readFileSync(cible, "utf8"));

const n = (f) => surfaces.filter(f).length;
const parPrio = {}; for (const c of constats) parPrio[c.priorite] = (parPrio[c.priorite] || 0) + 1;
console.log("JSON écrit : " + path.relative(process.cwd(), cible));
console.log("surfaces " + surfaces.length + " · observées " + n((s) => s.observation === "observe") + " · simulées " + n((s) => s.observation === "simule") + " · code seul " + n((s) => s.observation === "code") + " · inaccessibles " + n((s) => s.observation === "inaccessible")
  + " · avant-après " + n((s) => s.visuel === "avant-apres") + " · avant seul " + n((s) => s.visuel === "avant") + " · sans visuel " + n((s) => s.visuel === "aucun")
  + " · à améliorer " + n((s) => s.verdict === "a-ameliorer") + " · à conserver " + n((s) => s.verdict === "a-conserver") + " · à vérifier " + n((s) => s.verdict === "a-verifier"));
console.log("constats " + constats.length + " : " + Object.keys(parPrio).sort().map((k) => k + " " + parPrio[k]).join(" · ") + " · sensibles " + constats.filter((c) => c.sensible).length);
console.log("captures sur disque : " + Object.keys(fiches).length + " identifiants, " + Object.values(fiches).reduce((a, b) => a + b.length, 0) + " fiches");
if (alertes.length) { console.log("— " + alertes.length + " alerte(s) :"); for (const a of alertes) console.log("  ! " + a); }
