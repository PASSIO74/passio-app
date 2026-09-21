// ═══════════════════════════════════════════════════════════════════════════
// MÉDIAS ORPHELINS — verrous du cœur PUR (2026-09-20)
//
// Cet outil SUPPRIME des médias d'utilisateurs. Son classement est donc la
// seule chose qui le sépare d'une perte de données, et il repose sur une
// ABSENCE : « je n'ai trouvé ce nom nulle part ». Les cas ci-dessous mesurent
// très exactement les façons dont cette absence peut être fausse.
//
// Mutations éprouvées (chacune rougit le cas nommé) :
//   · retirer la garde d'âge (`age >= ageMin` → `true`) ....... « trop récent »
//   · comparer le chemin entier au lieu du nom de fichier ..... « nom seul »
//   · classer un nom vide en orphelin ......................... « nom vide »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { classerOrphelins, SOURCES, AGE_MIN_JOURS } = require_("../../scripts/medias-orphelins.js");

const JOUR = 86400000;
const MAINTENANT = Date.parse("2026-09-20T12:00:00Z");
const vieux = new Date(MAINTENANT - 60 * JOUR).toISOString();
const hier = new Date(MAINTENANT - 1 * JOUR).toISOString();

const obj = (name, extra = {}) => ({ name, size: 1000, created_at: vieux, ...extra });

test("① un objet dont le nom apparaît dans les références n'est JAMAIS orphelin", () => {
  const objets = [obj("videos/u1/reel_abc123.mp4"), obj("photos/u1/img_zzz999.jpg")];
  const refs = "https://x.supabase.co/storage/v1/object/public/content/videos/u1/reel_abc123.mp4";
  const r = classerOrphelins(objets, refs, { maintenant: MAINTENANT });
  assert.equal(r.references.length, 1);
  assert.equal(r.orphelins.length, 1);
  assert.equal(r.orphelins[0].name, "photos/u1/img_zzz999.jpg");
});

test("② les deux formes d'URL en production sont reconnues (Supabase, CDN, miniature)", () => {
  // Constat, pas une garde : le CHEMIN de l'objet est sous-chaîne des trois,
  // donc ce cas passerait aussi avec une comparaison sur le chemin entier. Il
  // est gardé parce qu'il fige les formes RÉELLES que la production émet.
  const objets = [obj("videos/u1/reel_abc123.mp4")];
  for (const url of [
    "https://x.supabase.co/storage/v1/object/public/content/videos/u1/reel_abc123.mp4",
    "https://passio-app.netlify.app/media/content/videos/u1/reel_abc123.mp4",
    "https://x.supabase.co/storage/v1/render/image/public/content/videos/u1/reel_abc123.mp4?width=700",
  ]) {
    assert.equal(classerOrphelins(objets, url, { maintenant: MAINTENANT }).orphelins.length, 0, url);
  }
});

test("② bis nom SEUL : une référence qui ne porte pas le chemin protège quand même l'objet", () => {
  // ⚠️ C'EST LE CAS QUI MESURE LE CHOIX, et le premier jet ne l'avait pas :
  // la mutation « comparer le chemin entier » laissait le cas ② VERT, parce
  // que le chemin est sous-chaîne de toutes les URL. Ce qui distingue
  // vraiment les deux, c'est une référence qui porte le nom de fichier SANS
  // son dossier — un `overlays`, un contenu de message, un blob `user_state`
  // reconstruit. Comparer le chemin entier la manquerait et SUPPRIMERAIT un
  // média vivant. Le sens de l'erreur est tout l'argument : on préfère
  // classer « référencé » à tort que supprimer à tort.
  const objets = [obj("videos/u1/reel_abc123.mp4")];
  const r = classerOrphelins(objets, '{"fichier":"reel_abc123.mp4"}', { maintenant: MAINTENANT });
  assert.equal(r.orphelins.length, 0, "le nom seul doit suffire à protéger l'objet");
  assert.equal(r.references.length, 1);
});

test("③ trop récent : un média sans référence mais de moins de 30 j n'est pas touché", () => {
  // L'upload PRÉCÈDE l'écriture de la ligne, et une publication hors ligne peut
  // attendre des heures dans sa file : un média frais sans référence est un
  // média en cours de publication, pas un déchet.
  const objets = [obj("videos/u1/tout_neuf.mp4", { created_at: hier })];
  const r = classerOrphelins(objets, "", { maintenant: MAINTENANT });
  assert.equal(r.orphelins.length, 0, "un média d'hier ne doit jamais partir à la suppression");
  assert.equal(r.tropJeunes.length, 1);
});

test("③ bis le seuil est celui qu'on passe, et 30 j est le défaut", () => {
  const objets = [obj("a/x_1.jpg", { created_at: new Date(MAINTENANT - 10 * JOUR).toISOString() })];
  assert.equal(classerOrphelins(objets, "", { maintenant: MAINTENANT }).orphelins.length, 0);
  assert.equal(classerOrphelins(objets, "", { maintenant: MAINTENANT, ageMinJours: 5 }).orphelins.length, 1);
  assert.equal(AGE_MIN_JOURS, 30);
});

test("④ nom vide : rien d'anonyme ne part à la suppression", () => {
  // `"".includes("")` rend true, donc un nom vide serait classé « référencé »
  // par accident. On l'y range EXPLICITEMENT — une garde qui tient par accident
  // finit par le dire.
  const r = classerOrphelins([obj(""), obj("dossier/")], "", { maintenant: MAINTENANT });
  assert.equal(r.orphelins.length, 0, "aucun objet sans nom de fichier ne doit être orphelin");
  assert.equal(r.references.length, 2);
});

test("⑤ une date illisible ne rend pas l'objet supprimable", () => {
  // `Date.parse("")` rend NaN ; `NaN >= x` est false, donc l'objet reste dans
  // « trop jeunes ». C'est le bon sens de l'échec : on ne supprime pas ce dont
  // on ne sait pas l'âge.
  const r = classerOrphelins([obj("a/b_1.jpg", { created_at: "pas une date" })], "", { maintenant: MAINTENANT });
  assert.equal(r.orphelins.length, 0);
  assert.equal(r.tropJeunes.length, 1);
});

test("⑥ les CINQ sources sont déclarées, dont `user_state` — celle qu'on oublie", () => {
  // La première mesure de ce lot annonçait 62 Mo d'orphelins ; elle ne lisait
  // pas `user_state`, où vivent les publications PERSO. Six objets (12 Mo) y
  // étaient référencés. Retirer une source d'ici fabrique des suppressions.
  const tables = SOURCES.map((s) => s.table);
  for (const t of ["posts", "profiles", "stories", "conv_messages", "user_state"]) {
    assert.ok(tables.includes(t), `source « ${t} » absente : elle fabriquerait de faux orphelins`);
  }
  assert.equal(SOURCES.length, 5);
  const us = SOURCES.find((s) => s.table === "user_state");
  assert.match(us.colonnes, /\bdata\b/, "user_state.data porte les publications perso");
});

test("⑦ à la SOURCE : le rapport est le défaut, la suppression demande --appliquer", async () => {
  const src = await (await import("node:fs/promises")).readFile(
    new URL("../../scripts/medias-orphelins.js", import.meta.url), "utf8",
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  assert.match(code, /args\.includes\("--appliquer"\)/, "le drapeau d'écriture doit être explicite");
  assert.match(code, /if \(!appliquer\)[\s\S]{0,200}return;/, "sans --appliquer, on sort AVANT toute suppression");
  assert.match(code, /throw new Error\(\s*\n?\s*`source/, "une source illisible doit LEVER, jamais réduire la liste");
});

test("la GRANDE d'une photo de publication n'est référencée que par sa légère : elle n'est jamais orpheline", () => {
  const objets = [
    { name: "photos/u/p.jpg", size: 1, created_at: vieux },
    { name: "photos/u/p.jpg.v720.webp", size: 1, created_at: vieux },
    { name: "photos/u/q.png", size: 1, created_at: vieux },      // première forme (21/09) : la légère ne porte pas l'extension
    { name: "photos/u/q.v720.webp", size: 1, created_at: vieux },
    { name: "photos/u/z.jpg", size: 1, created_at: vieux },      // rien ne le référence
  ];
  const refs = '{"media_url":"https://cdn/media/content/photos/u/p.jpg.v720.webp"},{"media_url":"https://cdn/media/content/photos/u/q.v720.webp"}';
  const r = classerOrphelins(objets, refs, { maintenant: MAINTENANT });
  assert.deepEqual(r.orphelins.map((o) => o.name), ["photos/u/z.jpg"]);
  assert.deepEqual(r.references.map((o) => o.name).sort(), ["photos/u/p.jpg", "photos/u/p.jpg.v720.webp", "photos/u/q.png", "photos/u/q.v720.webp"]);
  // Un nom sans extension ne se cherche pas suffixé : `hay.includes("" + ".v720.")` ne sauve rien par accident.
  assert.equal(classerOrphelins([{ name: "photos/u/nom-sans-ext", size: 1, created_at: vieux }], "x.v720.webp", { maintenant: MAINTENANT }).orphelins.length, 1);
});
