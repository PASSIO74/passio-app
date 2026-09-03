// ═══════════════════════════════════════════════════════════════════════════
// iPHONE — LES PANNEAUX PLEIN ÉCRAN DOIVENT RESPECTER LES ZONES SÛRES
// ---------------------------------------------------------------------------
// Défaut trouvé le 2026-09-02 par l'audit de parité iPhone/Android.
//
// `.app-shell` porte `padding-top: env(safe-area-inset-top)` : l'application
// normale évite donc l'encoche / la Dynamic Island. Mais QUATORZE panneaux sont
// en `position: fixed; inset: 0` — ils ÉCHAPPENT au shell et recouvrent l'écran
// ENTIER, barre d'état comprise. Toute commande posée en haut de ces panneaux se
// retrouve dessous : invisible et intouchable.
//
// Pourquoi c'est propre à l'iPhone : sur Android, `safe-area-inset-top` vaut 0
// (l'interface du navigateur est au-dessus de la page), donc rien n'est masqué.
// C'est encore une fois « ça marche sur Android ».
//
// Pourquoi c'est un P0 et pas un défaut cosmétique : en PWA installée sur
// iPhone il n'y a NI barre d'adresse NI bouton retour du navigateur. Quand la
// croix du viewer Bobines, le « ← » de la page Post ou le « ← Retour » d'une
// activité passe sous la barre d'état, il ne reste AUCUNE sortie visible. Le
// testeur est enfermé dans le panneau — ce qu'il décrit comme « l'écran est
// figé » ou « le retour ne marche pas ».
//
// ⚠️ CE QUI EST MESURABLE ICI. `env(safe-area-inset-*)` vaut 0 dans un
// navigateur de bureau et aucune API ne permet de le simuler : `getComputedStyle`
// rendrait `14px` aussi bien avant qu'après le correctif. Le symptôme n'est donc
// pas observable en CI. Ce qui l'est — et ce qui suffit à empêcher la
// régression — c'est le CONTRAT DE SOURCE : toute commande ancrée en haut ou en
// bas d'un panneau qui échappe au shell doit référencer l'inset correspondant.
// On lit donc les octets réellement servis.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..", "..");
const CSS = fs.readFileSync(path.join(RACINE, "styles.css"), "utf8");
const HTML = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");

// Renvoie le corps de la PREMIÈRE règle portant exactement ce sélecteur.
function corpsDe(selecteur) {
  const i = CSS.indexOf(selecteur + " {");
  expect(i, `sélecteur introuvable dans styles.css : ${selecteur}`).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("}", i));
}

// Commandes ancrées en HAUT d'un panneau qui échappe à `.app-shell`.
// Chacune est, pour son panneau, la sortie ou une action indispensable.
const HAUT = [
  [".event-detail-back",    "« ← Retour » et « Partager » d'une activité"],
  [".story-progress-row",   "barre de progression des stories"],
  [".story-viewer-header",  "la croix qui ferme une story"],
  [".reels-header",         "la croix qui ferme le viewer Bobines"],
  [".reel-sound-btn",       "coupure du son d'une bobine"],
  [".reel-tag-mood",        "étiquette d'humeur d'une bobine"],
];

// Commandes ancrées en BAS : la barre d'accueil de l'iPhone (~34 px) les
// recouvre. Un « J'aime » ou un « Commenter » sous la barre d'accueil est
// intouchable — le geste est capté par le système.
const BAS = [
  [".story-sound-btn",      "son d'une story"],
  [".reel-info",            "auteur et légende d'une bobine"],
  [".reel-actions",         "J'aime / Commenter / Partager d'une bobine"],
  [".reels-hint",           "indice de défilement des Bobines"],
  [".reel-comments-panel",  "saisie des commentaires d'une bobine"],
];

test.describe("iPhone — zones sûres des panneaux plein écran", () => {

  for (const [sel, role] of HAUT) {
    test(`${sel} évite l'encoche (${role})`, async () => {
      expect(corpsDe(sel), `${sel} passe sous la barre d'état de l'iPhone`)
        .toContain("safe-area-inset-top");
    });
  }

  for (const [sel, role] of BAS) {
    test(`${sel} évite la barre d'accueil (${role})`, async () => {
      expect(corpsDe(sel), `${sel} passe sous la barre d'accueil de l'iPhone`)
        .toContain("safe-area-inset-bottom");
    });
  }

  // Le bouton de sortie de la carte plein écran est un cas à part : la même
  // classe sert AUSSI hors plein écran, où la carte est dans `.app-shell` qui
  // porte déjà le retrait. L'inset ne doit donc être ajouté QUE pour le plein
  // écran — sinon on décale à tort le bouton de ~47 px dans le fil.
  test(".irl-map-expand n'ajoute l'inset QUE en plein écran", async () => {
    expect(CSS, "le bouton de sortie de la carte plein écran passe sous la barre d'état")
      .toContain(".irl-map-wrap.fullscreen .irl-map-expand { top: calc(10px + env(safe-area-inset-top)); }");
    // La règle de base, elle, ne doit PAS porter l'inset (double comptage).
    expect(corpsDe(".irl-map-expand")).not.toContain("safe-area-inset-top");
  });

  // La page « Post » est un panneau fixe déclaré en style EN LIGNE dans
  // index.html : aucune règle de styles.css ne la couvre.
  test("l'en-tête de #postDetailPage évite l'encoche", async () => {
    const i = HTML.indexOf('id="postDetailPage"');
    expect(i, "#postDetailPage introuvable").toBeGreaterThan(-1);
    const entete = HTML.slice(i, i + 900);
    expect(entete, "le « ← » de la page Post passe sous la barre d'état de l'iPhone")
      .toContain("env(safe-area-inset-top)");
  });

  // Garde-fou de fond : le shell lui-même. S'il perdait ses retraits, TOUTE
  // l'application repasserait sous l'encoche — et les correctifs ci-dessus
  // deviendraient des rustines sur une fondation cassée.
  test(".app-shell garde ses retraits de zone sûre", async () => {
    const b = corpsDe(".app-shell");
    expect(b).toContain("padding-top: env(safe-area-inset-top)");
    expect(b).toContain("env(safe-area-inset-left)");
    expect(b).toContain("env(safe-area-inset-right)");
  });

  // ⚠️ Ce cas existe pour qu'un futur panneau plein écran ne passe pas entre les
  // mailles. Il ne vérifie pas une valeur : il compte. Si l'on ajoute un
  // `position: fixed; inset: 0` de plus, il faut décider SCIEMMENT s'il porte
  // des commandes en bord d'écran, puis mettre ce nombre à jour.
  test("aucun panneau plein écran n'a été ajouté sans arbitrage", async () => {
    const panneaux = [];
    const re = /([^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(CSS))) {
      const sel = m[1].trim().split("\n").pop().trim();
      const corps = m[2];
      if (!/position:\s*fixed/.test(corps)) continue;
      if (!/inset:\s*0|top:\s*0/.test(corps)) continue;
      panneaux.push(sel);
    }
    expect(panneaux.length,
      "un panneau plein écran a été ajouté ou retiré : vérifie que ses commandes " +
      "de bord d'écran portent env(safe-area-inset-*), puis ajuste ce nombre.\n" +
      panneaux.join("\n")).toBe(14);
  });
});
