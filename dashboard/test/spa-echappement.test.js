// ═══════════════════════════════════════════════════════════════════════════
// ÉCHAPPEMENT DE LA PAGE — une faille RÉELLE, mesurée puis fermée le 2026-08-30.
//
// Le dashboard affiche du texte écrit par les navigateurs des utilisateurs de
// PASSIO : messages d'erreur, noms d'écrans, plateformes, gravités, identifiants
// d'appareil. Et il l'affiche dans une session qui porte les capacités les plus
// fortes du produit — lecture de la base en service_role, exécution de tests,
// mutations git. Une injection ici ne vise pas un visiteur : elle vise le poste
// de pilotage lui-même.
//
// ─── Le défaut ──────────────────────────────────────────────────────────────
// 17 boutons étaient écrits ainsi :
//     onclick='window.__copy(${JSON.stringify(b.message)},"Erreur")'
// `JSON.stringify` échappe le guillemet DOUBLE, jamais l'apostrophe — or c'est
// une apostrophe qui délimite l'attribut. Avec un message contenant « ' », le
// navigateur referme l'attribut au milieu de la charge et relit la suite comme
// des attributs HTML. Mesuré, pas déduit : le premier test le rejoue.
// 16 autres boutons portaient `onclick="fn('${id}')"` — même faille à une donnée
// hostile près : ces identifiants-là sont aujourd'hui des empreintes SHA-1 ou
// des UUID, donc inoffensifs. Un seul changement de champ suffisait.
//
// ─── Le correctif ───────────────────────────────────────────────────────────
// `escJsArg` : le navigateur DÉCODE l'attribut avant de parser le JS, donc
// `&#39;` y redevient une apostrophe — légale À L'INTÉRIEUR du littéral à
// guillemets doubles que produit `JSON.stringify`. C'est le rôle exact
// d'`escapeJsArg` dans l'app PASSIO, dont le pilotage n'avait pas d'équivalent.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "js");
const APP = fs.readFileSync(path.join(JS, "app.js"), "utf8");

/**
 * Évalue les deux helpers depuis le SOURCE réel — jamais une copie. Recopier
 * leur code ici ferait un test qui resterait vert après une régression dans
 * `app.js` : c'est le piège que le projet a déjà payé ailleurs.
 * ⚠️ `new Function` sur du texte interpolé n'est acceptable QUE parce que le
 * texte vient d'un fichier du dépôt, jamais d'une entrée. Ce n'est pas un motif
 * à reproduire en production.
 */
function helpers() {
  const esc = /^const esc = .*$/m.exec(APP);
  const jsa = /^const escJsArg = [\s\S]*?;$/m.exec(APP);
  assert.ok(esc, "`esc` introuvable dans app.js");
  assert.ok(jsa, "`escJsArg` introuvable dans app.js");
  return new Function(`${esc[0]}\n${jsa[0]}\nreturn { esc, escJsArg };`)();
}

const CHARGE = `x'); alert(document.cookie); //`;
const decoderHtml = (s) => s.replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

test("le défaut est réel : JSON.stringify seul referme l'attribut", () => {
  // On rejoue le motif d'ORIGINE. Ce test ne protège rien : il établit que le
  // correctif répond à un vrai problème, et il documente le mécanisme exact.
  const attribut = `onclick='window.__copy(${JSON.stringify(CHARGE)},"Erreur")'`;
  const valeur = attribut.slice(attribut.indexOf("'") + 1);
  const fin = valeur.indexOf("'");
  assert.ok(fin < valeur.length - 1, "l'apostrophe de la charge referme l'attribut avant sa fin");
  assert.ok(valeur.slice(0, fin).endsWith('"x'), "le navigateur n'exécuterait que le début de l'appel");
  assert.ok(valeur.slice(fin + 1).includes("alert("), "le reste est relu comme des attributs HTML");
});

test("escJsArg neutralise l'apostrophe et rend un littéral JS complet", () => {
  const { escJsArg } = helpers();
  const sortie = escJsArg(CHARGE);

  assert.ok(!sortie.includes("'"), "aucune apostrophe ne doit survivre : " + sortie);
  assert.ok(sortie.startsWith('"') && sortie.endsWith('"'), "la sortie EST le littéral JS, guillemets compris");
  assert.ok(!sortie.includes("<"), "le chevron ouvrant est neutralisé");

  // Le trajet réel : le navigateur décode l'attribut, PUIS parse le JS.
  assert.equal(JSON.parse(decoderHtml(sortie)), CHARGE,
    "après décodage HTML, le littéral rend EXACTEMENT la charge — comme donnée, pas comme code");

  // Et l'attribut reconstruit tient d'un bout à l'autre.
  const attribut = `onclick='window.__copy(${sortie},"Erreur")'`;
  const valeur = attribut.slice(attribut.indexOf("'") + 1, attribut.lastIndexOf("'"));
  assert.ok(!valeur.includes("'"), "l'attribut ne peut plus être refermé de l'intérieur");
});

test("escJsArg supporte les formes hostiles sans lever", () => {
  const { escJsArg } = helpers();
  for (const v of [null, undefined, 0, "", "&amp;", '"', "\\", "</script>", "&#39;"]) {
    const s = escJsArg(v);
    assert.ok(!s.includes("'"), `apostrophe résiduelle pour ${JSON.stringify(v)}`);
    assert.doesNotThrow(() => JSON.parse(decoderHtml(s)), `littéral cassé pour ${JSON.stringify(v)}`);
  }
  // Une charge DÉJÀ encodée ne doit pas se décoder en apostrophe vive : c'est le
  // rôle de l'échappement du « & » AVANT celui de l'apostrophe.
  assert.equal(JSON.parse(decoderHtml(escJsArg("&#39;"))), "&#39;");
});

test("RÈGLE : toute donnée injectée dans un onclick passe par escJsArg", () => {
  // La règle structurelle, celle qui empêche la faille de revenir par un
  // nouveau bouton. Objective, et vérifiable à la lecture.
  const fautifs = [];
  for (const f of fs.readdirSync(JS).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(JS, f), "utf8");
    for (const m of src.matchAll(/onclick=(['"])((?:(?!\1).)*)\1/g)) {
      for (const i of m[2].matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
        const expr = i[1].trim();
        if (/^escJsArg\(/.test(expr)) continue;
        if (/^(icon|hhmmss|num)\(/.test(expr)) continue;   // rendu interne, aucune donnée
        fautifs.push(`${f}:${src.slice(0, m.index).split("\n").length}  ${expr.slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(fautifs, [],
    "une donnée entre dans un onclick sans passer par escJsArg — c'est la faille du 2026-08-30.");
});

test("RÈGLE : les champs écrits par le navigateur ne s'affichent jamais bruts", () => {
  // Liste COURTE et explicite : uniquement des champs dont on sait qu'ils
  // viennent de la télémétrie, donc du navigateur de n'importe quel compte.
  // `nameFor` et `deviceLabel` n'y sont pas : le premier échappe lui-même, le
  // second est enveloppé d'`esc` à son point d'affichage.
  const HOSTILES = ["ev.platform", "ev.browser", "ev.severity", "ev.status", "ev.env",
                    "d.platform", "d.browser", "d.deviceId", "b.severity"];
  const fautifs = [];
  for (const f of fs.readdirSync(JS).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(JS, f), "utf8");
    for (const m of src.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
      const expr = m[1];
      if (/\besc\(|\bescJsArg\(/.test(expr)) continue;
      // Une seule exception, nommée : `linkTimelineRow` assemble un fragment de
      // texte (`dev`) qui est échappé À SON AFFICHAGE (`${esc(txt)}`). L'échapper
      // ici en plus produirait « &amp;lt; » à l'écran. L'exception cite donc le
      // point de sortie, elle ne fait pas confiance à la donnée.
      if (/^ev\.platform$|^ev\.browser \? "\/" \+ ev\.browser : ""$/.test(expr.trim())) continue;
      for (const champ of HOSTILES) {
        const nu = new RegExp("(^|[^\\w.$])" + champ.replace(".", "\\.") + "\\s*$");
        const interpole = new RegExp("\\$\\{\\s*" + champ.replace(".", "\\.") + "\\s*\\}");
        if (nu.test(expr) || interpole.test(expr)) {
          fautifs.push(`${f}:${src.slice(0, m.index).split("\n").length}  ${expr.slice(0, 90)}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(fautifs, [],
    "un champ de télémétrie s'affiche sans échappement : gravité, plateforme et " +
    "identifiant d'appareil entrent dans des ATTRIBUTS de classe, où un guillemet suffit.");
});

test("les libellés de graphe sont échappés à la SOURCE, dans bars()", () => {
  // `bars()` est le seul rendu HTML de `charts.js`, et ses libellés sont des
  // types d'événements, des noms d'écrans, des actions — écrits par les
  // navigateurs. L'escape est posé DANS le helper plutôt que chez ses six
  // appelants : un appelant qui oublie ne peut pas rouvrir le trou.
  const src = fs.readFileSync(path.join(JS, "charts.js"), "utf8");
  const rendu = /el\.innerHTML = items\.map[\s\S]*?\.join\(""\)/.exec(src);
  assert.ok(rendu, "le rendu de bars() a changé de forme — relis-le avant d'ajuster ce test");
  for (const m of rendu[0].matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    const expr = m[1].trim();
    if (/^esc\(/.test(expr)) continue;
    if (/^Math\./.test(expr)) continue;                     // largeur calculée
    if (/^it\.color \? "background:" \+ esc\(/.test(expr)) continue;
    assert.fail(`bars() insère « ${expr} » sans échappement`);
  }
});

test("le poste de commande construit ses nœuds, il n'assemble pas de HTML", () => {
  // `command.js` n'a pas de helper d'échappement — et n'en a pas besoin : il
  // passe par createElement/textContent. On fige ce choix, parce qu'un seul
  // `innerHTML` y réintroduirait le problème sans filet.
  const src = fs.readFileSync(path.join(JS, "command.js"), "utf8");
  assert.ok(/textContent/.test(src));
  assert.equal((src.match(/\.innerHTML\s*=/g) || []).length, 0,
    "command.js doit rester en construction de nœuds, sans innerHTML");
});
