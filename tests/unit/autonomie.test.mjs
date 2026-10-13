// Autonomie de la veille (2026-10-11, revue le 2026-10-13) — réveil de la
// Sentinelle et retour arrière PROPOSÉ (jamais automatique) : la logique pure
// de supabase/functions/_shared/autonomie.js (le fichier que Deno déploie), et
// le câblage de supabase/functions/pilotage/index.ts. Chaque verrou nomme la
// mutation qui le rougit ; ceux qui lisent le source s'ANCRENT sur
// l'instruction elle-même — un `indexOf` à -1 ne doit jamais rendre un verrou
// vrai (contre-revue du 2026-10-13 : cinq mutations passaient au vert).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  REVEIL, RETOUR, EVT, enquetesEnCours, doitReveillerSentinelle, empreinte, decideRetour, deploiementsProduction,
  choisirPrecedent, continuerPagination, reveilsEpuises, idGeste, commitCourt, modeRetour, corpsProposition, TITRE_PROPOSITION,
} from "../../supabase/functions/_shared/autonomie.js";
import { filtrerProduction, precedentDe, continuerPagination as continuerReference } from "../../scripts/rollback-selection.mjs";

const T0 = Date.parse("2026-10-12T10:00:00Z");
const ilYa = (min) => new Date(T0 - min * 60e3).toISOString();
const FN = fs.readFileSync("supabase/functions/pilotage/index.ts", "utf8");
/** Corps d'une fonction de index.ts : de sa déclaration à la déclaration suivante de premier niveau. */
function corpsDe(nom) {
  const debut = FN.indexOf("async function " + nom + "(");
  assert.ok(debut > 0, nom + " existe");
  const suite = FN.slice(debut + 10).search(/\n(async function |function |const [A-Z_]+[:= ]|\/\/ ─── )/);
  return FN.slice(debut, suite === -1 ? undefined : debut + 10 + suite);
}
const position = (texte, motif, quoi) => { const i = texte.indexOf(motif); assert.ok(i >= 0, quoi + " : « " + motif + " » introuvable"); return i; };

test("① réveil : des échecs chez 2 comptes, rien en cours, pas de pause, pas de run récent (mutation : réveiller pendant une enquête)", () => {
  const base = { pause: false, enquetes: 0, dernierRun: { etat: "completed", le: ilYa(120) }, comptesErreurs: 2, maintenant: T0 };
  assert.equal(doitReveillerSentinelle(base).reveiller, true);
  assert.equal(doitReveillerSentinelle({ ...base, comptesErreurs: 1 }).raison, "calme", "un seul compte : peut-être son appareil");
  assert.equal(doitReveillerSentinelle({ ...base, comptesErreurs: null }).raison, "calme", "pas de mesure : on ne réveille pas");
  assert.equal(doitReveillerSentinelle({ ...base, enquetes: 1 }).raison, "enquete_en_cours");
  assert.equal(doitReveillerSentinelle({ ...base, pause: true }).raison, "pause", "la pause du pilote gagne");
  assert.equal(doitReveillerSentinelle({ ...base, dernierRun: { etat: "in_progress", le: ilYa(120) } }).raison, "run_en_cours");
  assert.equal(doitReveillerSentinelle({ ...base, dernierRun: { etat: "completed", le: ilYa(REVEIL.runRecentMs / 60e3 - 1) } }).raison, "run_recent");
  assert.equal(doitReveillerSentinelle({ ...base, dernierRun: null }).reveiller, true, "jamais tourné : on réveille");
  assert.equal(doitReveillerSentinelle({ ...base, enquetes: NaN }).reveiller, false, "GitHub illisible : on ne réveille pas à l'aveugle");
  assert.equal(doitReveillerSentinelle({}).reveiller, false);
});

test("② enquêtes en cours : issues `sentinelle` hors PR et hors `humain`", () => {
  assert.equal(enquetesEnCours([
    { pr: false, labels: ["sentinelle"] }, { pr: false, labels: ["sentinelle", "humain"] },
    { pr: true, labels: ["sentinelle"] }, { pr: false, labels: ["veille"] }, null,
  ]), 1);
  assert.equal(enquetesEnCours(null), 0);
});

const F = (famille, comptes, comptes_ailleurs, n = comptes) => ({ famille, comptes, n, comptes_ailleurs });
const BASE = { actif: true, version: "abcdef12", deployeA: ilYa(20), dernier: null, maintenant: T0 };

test("③ proposition : famille NOUVELLE chez 5 comptes anciens (mutation : seuil à 4, ou « déjà vue » à 1 compte)", () => {
  const d = decideRetour({ ...BASE, familles: [F("error:TypeError: neuf", 5, 1)] });
  assert.equal(d.retour, true);
  assert.equal(d.cle, "error:TypeError: neuf");
  assert.deepEqual(d.famille, { empreinte: empreinte("error:TypeError: neuf"), comptes: 5, n: 5 });
  assert.match(d.famille.empreinte, /^[0-9a-f]{8}$/);
  assert.equal(decideRetour({ ...BASE, familles: [F("e", 4, 0)] }).retour, false, "4 comptes : pas assez");
  assert.equal(decideRetour({ ...BASE, familles: [F("e", 50, 2)] }).raison, "aucune_erreur_nouvelle", "vue par 2 comptes anciens ailleurs : pas une régression");
  assert.equal(decideRetour({ ...BASE, familles: [F("e", 5, 1)] }).retour, true, "UN compte ailleurs ne suffit pas à la dire « déjà vue »");
  assert.equal(RETOUR.comptesMin, 5);
  assert.equal(RETOUR.vuAilleursMin, 2);
});

test("④ proposition : une valeur illisible n'est jamais une nouveauté ; TOUTES les familles sont examinées (mutation : ne regarder que les 3 premières)", () => {
  for (const ailleurs of [undefined, null, NaN, "0", -1, 1.5]) {
    assert.equal(decideRetour({ ...BASE, familles: [F("e", 9, ailleurs)] }).retour, false, "ailleurs illisible : " + String(ailleurs));
  }
  assert.equal(decideRetour({ ...BASE, familles: [F("e", "9", 0)] }).retour, false, "comptes non entier");
  assert.equal(decideRetour({ ...BASE, familles: [null, { comptes: 9, comptes_ailleurs: 0 }, F("", 9, 0)] }).retour, false, "famille sans clé");
  const bruit = [F("Failed to fetch", 90, 40), F("Load failed", 70, 30), F("Script error.", 50, 20), F("ResizeObserver", 30, 9)];
  const d = decideRetour({ ...BASE, familles: [...bruit, F("error:écran X cassé", 6, 0)] });
  assert.equal(d.cle, "error:écran X cassé", "une régression partielle ne se cache pas derrière le bruit de fond");
  assert.equal(decideRetour({ ...BASE, familles: bruit }).raison, "aucune_erreur_nouvelle");
  assert.equal(decideRetour({ ...BASE, familles: null }).raison, "aucune_erreur_nouvelle");
});

test("⑤ proposition : éteinte sans jeton, bornée dans le temps, une fois par version, 6 h entre deux (mutation : retirer la récupération)", () => {
  const b = { ...BASE, familles: [F("E", 9, 0)] };
  assert.equal(decideRetour({ ...b, actif: false }).raison, "inactif");
  assert.equal(decideRetour({ ...b, deployeA: ilYa(91) }).raison, "hors_fenetre");
  assert.equal(decideRetour({ ...b, deployeA: "n'importe quoi" }).raison, "deploiement_inconnu");
  assert.equal(decideRetour({ ...b, deployeA: ilYa(-5) }).raison, "deploiement_inconnu", "une mise en ligne dans le futur");
  assert.equal(decideRetour({ ...b, version: "dev" }).raison, "version_inconnue");
  assert.equal(decideRetour({ ...b, dernier: { version: "abcdef12", le: ilYa(600) } }).raison, "deja_proposee");
  assert.equal(decideRetour({ ...b, dernier: { version: "00000000", le: ilYa(60) } }).raison, "recuperation", "une proposition toutes les 6 h au plus");
  assert.equal(decideRetour({ ...b, dernier: { version: "00000000", le: ilYa(RETOUR.recuperationMs / 60e3 + 1) } }).retour, true);
});

test("⑥ choisirPrecedent et continuerPagination = scripts/rollback-selection.mjs sans exclusion ; une version retirée est SAUTÉE (mutation : remettre la version retirée)", () => {
  const d = (id, context = "production", state = "ready") => ({ id, context, state });
  const cas = [
    [[d("c"), d("b"), d("a")], "c"],
    [[d("c"), d("p", "deploy-preview"), d("x", "production", "error"), d("b")], "c"],
    [[d("c"), d("b")], "b"],
    [[d("c"), d("b")], "zz"],
    [[d("c")], "c"],
    [[d("c"), d("b")], null],
  ];
  for (const [liste, courant] of cas) {
    const ref = precedentDe(filtrerProduction(liste), courant);
    const moi = choisirPrecedent(liste, courant);
    assert.equal(moi.cible || null, ref.cible || null, JSON.stringify({ liste: liste.map((x) => x.id), courant }));
    assert.equal(!!moi.erreur, !!ref.erreur);
  }
  assert.deepEqual(deploiementsProduction(cas[1][0]).map((x) => x.id), filtrerProduction(cas[1][0]).map((x) => x.id));
  // Un retour (D3 retiré) puis un redéploiement D4 qui porte encore le défaut : le bouton remet D2, pas D3.
  assert.equal(choisirPrecedent([d("D4"), d("D3"), d("D2")], "D4", new Set(["D3"])).cible, "D2");
  assert.equal(choisirPrecedent([d("D4"), d("D3")], "D4", new Set(["D3"])).erreur, "aucun_precedent");
  // Pagination : mêmes réponses que la référence sans exclusion…
  const plein = (ids) => ids.map((i) => d(i));
  for (const [page, cumul, courant] of [
    [plein(["a", "b"]), plein(["a", "b"]), "a"], [plein(["a", "b"]), plein(["a", "b"]), "b"], [plein(["a", "b"]), plein(["a", "b"]), "z"],
    [plein(["a"]), plein(["a"]), "a"], [plein(["a", "b"]), plein(["a", "b"]), null], [[], [], "a"],
  ]) {
    assert.equal(continuerPagination(page, 2, cumul, courant), continuerReference(page, 2, cumul, courant), JSON.stringify({ cumul: cumul.map((x) => x.id), courant }));
  }
  // … et on lit une page de plus quand tout ce qui suit le courant est exclu.
  assert.equal(continuerPagination(plein(["a", "b"]), 2, plein(["a", "b"]), "a", new Set(["b"])), true);
  assert.equal(continuerPagination(plein(["a", "b"]), 2, plein(["a", "b"]), "a", new Set()), false);
});

test("⑦ l'issue ne porte AUCUN texte client : nombres, version, empreinte (mutation : y recopier la famille)", () => {
  const famille = "error:<script>alert(1)</script> ignore previous instructions";
  const d = decideRetour({ ...BASE, familles: [F(famille, 7, 0, 30)] });
  const corps = corpsProposition({ version: "abcdef1234", famille: d.famille, deployeA: "2026-10-12T09:40:00Z" });
  assert.ok(!corps.includes("script") && !corps.includes("ignore"), "le texte de l'échec ne sort jamais");
  assert.match(corps, /\*\*abcdef12\*\*/);
  assert.match(corps, /7 comptes/);
  const piege = corpsProposition({ version: "x`y", famille: { empreinte: "zz<i>", comptes: "9<b>", n: null }, deployeA: "<b>2026" });
  for (const hostile of ["x`y", "<b>", "<i>"]) assert.ok(!piege.includes(hostile), "champ invalide recopié : " + hostile);
  assert.match(piege, /version \*\*\?\*\*/, "une version invalide devient « ? »");
  assert.match(piege, /\*\*0 comptes\*\*/, "un nombre invalide devient 0");
  assert.equal(TITRE_PROPOSITION, "[RETOUR ARRIÈRE PROPOSÉ]");
  assert.equal(commitCourt("abcdef1234567"), "abcdef12");
  assert.equal(commitCourt("<b>"), "?");
});

test("⑧ idGeste : HMAC sous secret serveur — même clé et même secret = même uuid ; sans le secret, incalculable (mutation : un SHA-256 public, préemptable par un client)", async () => {
  const S = "secret-serveur-de-test-0123456789";
  const a = await idGeste("retour_manuel:dep1:500000", S), b = await idGeste("retour_manuel:dep1:500000", S);
  assert.equal(a, b);
  assert.notEqual(a, await idGeste("retour_manuel:dep2:500000", S));
  assert.notEqual(a, await idGeste("retour_manuel:dep1:500000", S + "x"), "un autre secret, une autre clé");
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "uuid v8 valide pour une colonne uuid");
  // Ce qu'un client pourrait calculer depuis le dépôt public : le SHA-256 nu de la clé.
  const h = crypto.createHash("sha256").update("retour_manuel:dep1:500000").digest("hex");
  assert.ok(!a.replace(/-/g, "").slice(12).includes(h.slice(12, 24)), "la clé ne dérive pas du seul texte public");
  await assert.rejects(idGeste("x", ""), /secret/, "pas de secret, pas de geste");
  await assert.rejects(idGeste("x", "court"), /secret/);
});

test("⑨ AUCUN retrait automatique : ni la veille, ni la proposition, ni le réveil ne mènent au geste (mutation : appeler retourManuel depuis la veille)", () => {
  assert.match(FN, /const MODE_RETOUR = modeRetour\(JETON_NETLIFY\);/);
  assert.doesNotMatch(FN, /PILOTAGE_RETOUR_AUTO|retourAuto/, "aucun interrupteur ne rallume l'automatique");
  assert.equal(modeRetour(""), "inactif");
  assert.equal(modeRetour("jeton"), "proposer");
  assert.equal(modeRetour("jeton", "1"), "proposer", "aucun second argument ne rallume l'automatique");
  const GESTE = /retourManuel|remettrePrecedent|retourApercu|lirePrecedent|\/restore/;
  for (const nom of ["veille", "proposerRetour", "reveillerSentinelle", "delestageAuto", "lireProposition"]) {
    assert.doesNotMatch(corpsDe(nom), GESTE, nom + " ne mène jamais au geste");
  }
  // Un seul chemin vers le geste : le case du pilote, APRÈS une porte qui existe.
  const porte = position(FN, "if (!autorise(user, EXTRA))", "porte d'authentification");
  assert.doesNotMatch(FN.slice(position(FN, "Deno.serve(", "handler"), porte), /retour|remettrePrecedent|restore/, "rien avant la porte");
  const cas = position(FN, 'case "retour_arriere": return retourManuel(admin, corps);', "case du geste");
  assert.ok(cas > porte);
  assert.ok(position(FN, 'case "retour_apercu": return retourApercu(admin);', "case de l'aperçu") > porte);
  assert.equal(FN.split("retourManuel(").length - 1, 2, "déclaration + case");
  assert.equal(FN.split("remettrePrecedent(").length - 1, 2, "déclaration + retourManuel");
  assert.equal(FN.split("retourApercu(").length - 1, 2, "déclaration + case");
  assert.equal(FN.split("lirePrecedent(").length - 1, 3, "déclaration + aperçu + geste");
  assert.match(corpsDe("retourManuel"), /remettrePrecedent\(admin, cible\)/);
});

test("⑩ le geste : verrou de 10 min, cible de l'APERÇU, marque HMAC AVANT la relecture et la restauration, marque effacée sur échec (mutations : déplacer la marque après /restore, oublier l'effacement)", () => {
  const g = corpsDe("remettrePrecedent");
  const verrou = position(g, 'if (recents && recents.length) return { erreur: "retour_recent" };', "verrou de 10 min");
  assert.match(g, /\.eq\("event", EVT\.manuel\)[\s\S]{0,120}gte\("created_at", ilYa\(RETOUR\.entreDeuxGestesMs\)\)/, "le verrou lit la MÊME marque que celle écrite");
  const lecture = position(g, "await lirePrecedent(admin)", "lecture de la cible");
  const cible = position(g, 'if (p.cible.id !== cibleDemandee) return { erreur: "cible_changee" };', "cible de l'aperçu");
  const marque = position(g, 'insert({ id, user_id: "systeme:pilotage", event: EVT.manuel', "marque du geste");
  const relu = position(g, 'encore.published_deploy.id !== p.courant.id) return await annuler("courant_change")', "relecture");
  const restore = position(g, "/restore", "restauration");
  assert.ok(verrou < lecture && lecture < cible && cible < marque && marque < relu && relu < restore, "verrou → cible → marque → relecture → restauration");
  assert.match(g, /const id = await idGeste\(`\$\{EVT\.manuel\}:\$\{p\.courant\.id\}:\$\{Math\.floor\(Date\.now\(\) \/ 3600e3\)\}`, SECRET_GESTES\);/, "clé HMAC, une par heure et par version servie");
  // Le secret est la clé service_role (posée sur toute fonction, jamais côté client) ; la clé anon, publique, ne vaut rien.
  assert.match(FN, /const SECRET_GESTES = Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\) \|\| "";/);
  assert.equal(FN.split("SECRET_GESTES").length - 1, 3, "déclaration + deux clés de geste, aucun autre usage");
  assert.doesNotMatch(FN, /idGeste\([^)]*ANON/, "jamais la clé anon comme secret");
  assert.match(g, /code === "23505" \? "retour_en_cours" : "journal_refuse"/);
  assert.match(g, /de_deploy: p\.courant\.id/, "la version retirée est notée : elle ne reviendra pas par ce bouton");
  const annuler = g.slice(position(g, "const annuler = async", "annuler"), relu);
  assert.match(annuler, /\.delete\(\)\.eq\("id", id\)/, "un geste échoué efface sa marque");
  assert.match(annuler, /event: EVT\.echec/);
  assert.match(g, /catch \{ return await annuler\("netlify_injoignable"\); \}/, "une exception avant la restauration efface aussi la marque");
  assert.match(g, /if \(!rr\.ok\) return await annuler\(/);
  assert.match(g, /event: EVT\.incertain/, "une restauration sans réponse est dite incertaine, marque gardée");
  assert.match(corpsDe("retourManuel"), /if \(!\/\^\[0-9a-f\]\{24\}\$\/\.test\(cible\)\)/, "la cible est un identifiant de déploiement, jamais un texte libre");
  assert.match(FN, /function netlify\([^)]*\) \{[\s\S]{0,300}signal: AbortSignal\.timeout\(/, "Netlify a toujours un délai");
  assert.match(FN, /function gh\([^)]*\) \{[\s\S]{0,500}signal: AbortSignal\.timeout\(/, "GitHub aussi");
});

test("⑪ lirePrecedent pagine comme la référence et saute les versions retirées dans les 24 h (mutation : une seule page de 30)", () => {
  const l = corpsDe("lirePrecedent");
  assert.match(l, /for \(let page = 1; page <= RETOUR\.pagesMax; page\+\+\)/);
  assert.match(l, /deploys\?per_page=\$\{RETOUR\.parPage\}&page=\$\{page\}/);
  assert.match(l, /if \(!continuerPagination\(l, RETOUR\.parPage, prods, courant\.id, exclus\)\) break;/);
  assert.match(l, /\.eq\("event", EVT\.manuel\)[\s\S]{0,120}gte\("created_at", ilYa\(RETOUR\.exclusionMs\)\)/);
  assert.match(l, /choisirPrecedent\(prods, courant\.id, exclus\)/);
  assert.match(l, /if \(!versionRemise\) return \{ erreur: "precedent_illisible" \}/, "on ne restaure pas ce qu'on ne sait pas vérifier");
  assert.equal(RETOUR.pagesMax, 10);
});

test("⑫ les marques ont UNE orthographe, lue et écrite par les mêmes constantes ; le réveil respecte ses deux plafonds (mutations : lire « retour_arriere », ignorer le plafond)", () => {
  assert.doesNotMatch(FN, /"(sentinelle_reveil|retour_propose|retour_manuel|retour_echec|retour_incertain)"/, "jamais une marque écrite en dur");
  assert.deepEqual(Object.values(EVT), ["sentinelle_reveil", "retour_propose", "retour_manuel", "retour_echec", "retour_incertain"]);
  const s = corpsDe("reveillerSentinelle");
  const plafond = position(s, 'if (!plafond.ok) return { raison: "plafond" };', "plafond horaire");
  const quota = position(s, 'if (er || reveilsEpuises(reveils24h ?? NaN)) return { raison: "quota_du_jour" };', "quota du jour");
  const dispatch = position(s, "/dispatches", "dispatch");
  assert.ok(plafond < dispatch && quota < dispatch);
  assert.match(s, /\.eq\("event", EVT\.reveil\)/);
  assert.match(s, /event: EVT\.reveil/);
  assert.match(s, /verifierPlafondEnBase\(admin, "systeme:sentinelle-reveil", "sentinelle-reveil", \{ parMinute: 1, parHeure: 2 \}\)/);
  assert.match(s, /if \(!a \|\| !a\.exact \|\| a\.echecs30 == null\) return \{ raison: "mesure_absente" \}/, "pas de mesure en base, pas de réveil");
  assert.match(s, /comptesErreurs: a\.echecs30 \}/, "le réveil décide sur les comptes ANCIENS comptés en base");
  assert.equal(reveilsEpuises(11), false);
  assert.equal(reveilsEpuises(12), true);
  assert.equal(reveilsEpuises(NaN), true, "comptage illisible : on ne réveille pas");
  // Un paramètre nommé `gh` masquerait la fonction `gh()` (trouvé par ce verrou, 2026-10-12).
  for (const nom of ["reveillerSentinelle", "proposerRetour", "remettrePrecedent", "retourManuel", "lirePrecedent", "retourApercu"]) {
    const corps = corpsDe(nom);
    assert.doesNotMatch(corps.slice(0, corps.indexOf("{")), /\bgh\s*:/, nom + " : un paramètre gh masquerait gh()");
  }
});

test("⑬ la proposition se compte EN BASE, sa clé est HMAC, et rien du texte client ne part vers GitHub ni dans la notification (mutation : recopier la famille dans le titre)", () => {
  const r = corpsDe("proposerRetour");
  assert.match(r, /admin\.rpc\("pilotage_familles_erreurs", \{ p_version: version, p_depuis:/);
  assert.match(r, /if \(estObjetAbsent\(error\)\) return \{ raison: "migration_absente" \}/);
  assert.match(r, /decideRetour\(\{ actif: true, version, deployeA, familles: familles \|\| \[\], dernier \}\)/);
  assert.match(r, /idGeste\(`\$\{EVT\.propose\}:\$\{version\}`, SECRET_GESTES\)/);
  assert.match(r, /code === "23505" \? "deja_proposee"/);
  const queue = r.slice(position(r, "if (JETON_GH) {", "issue"));
  assert.match(queue, /title: `\$\{TITRE_PROPOSITION\} version \$\{version\}`/);
  assert.match(queue, /body: corpsProposition\(\{ version: commit, famille: d\.famille, deployeA \}\)/);
  assert.doesNotMatch(queue, /d\.cle|\.message|familles\[|famille: String/, "ni le texte de la famille ni un message après la marque");
  assert.match(queue, /if \(!issue && !envoyes\) \{[\s\S]{0,200}\.delete\(\)\.eq\("id", id\)/, "personne prévenu : la marque s'efface, la veille réessaie");
  assert.match(queue, /issue = !!\(ri && ri\.ok\)/, "une issue refusée (403, 422) n'est pas une issue ouverte");
  // Le texte va au PILOTE seulement : lu par lireProposition, derrière la porte (etat).
  assert.equal(FN.split("lireProposition(").length - 1, 2, "déclaration + etat()");
  assert.ok(position(FN, 'case "etat": return json(await etat(admin));', "case etat") > position(FN, "if (!autorise(user, EXTRA))", "porte"));
});
