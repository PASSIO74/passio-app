// ══════════════════════════════════════════════════════════════════════════
// Sonde « lavis violet, écriture violet foncé » — partagée par les suites.
//
// La formule a été arrêtée par Benjamin le 2026-09-01 (« les grands carrés
// violets sont agressifs, mets plutôt des carrés violet très léger et écris en
// violet foncé »), d'abord pour la feuille « Créer » et le panneau Filtres de
// Rencontrer, puis étendue le même jour à la feuille « Trouver une expérience »
// du Fil (« je veux les mêmes onglets que dans (+), même design »).
//
// Trois suites la mesurent maintenant : elle vit donc ici, en UN exemplaire.
// Deux copies auraient divergé, et c'est précisément le genre de divergence que
// ces tests existent pour interdire.
//
// ⚠️ Aucune valeur hexadécimale n'est exigée : ce sont des SEUILS (luminance du
// fond, teinte violette du texte, rapport de contraste). Une retouche de la
// charte reste donc libre ; seule la règle « clair dessous, violet foncé
// dessus » est verrouillée.
// ══════════════════════════════════════════════════════════════════════════
const { expect } = require("@playwright/test");

// Mesure faite DANS la page : on lit les couleurs calculées, jamais la feuille
// de style — c'est ce qui est réellement peint qui compte.
// ⚠️ Cette fonction part s'exécuter dans le navigateur : elle ne doit RIEN
// emprunter à la portée de ce fichier (Playwright n'en sérialise que la source,
// jamais sa fermeture) — d'où les trois helpers définis à l'intérieur.
function sonde(el) {
  const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);
  const lire = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  // Le fond d'un nœud peut être transparent : on remonte jusqu'au premier
  // ancêtre OPAQUE, exactement comme le ferait l'œil.
  const fond = (n) => {
    for (let c = n; c; c = c.parentElement) {
      const b = getComputedStyle(c).backgroundColor;
      const v = lire(b);
      const a = (b.match(/[\d.]+/g) || [])[3];
      if (v.length === 3 && (a === undefined || Number(a) === 1)) return v;
    }
    return [255, 255, 255];
  };
  const f = fond(el);
  const t = lire(getComputedStyle(el).color);
  const lf = lum(f), lt = lum(t);
  return {
    fond: f,
    texte: t,
    lumFond: lf,
    contraste: (Math.max(lf, lt) + 0.05) / (Math.min(lf, lt) + 0.05),
  };
}

// Un « lavis violet à écriture violet foncé » se reconnaît à trois choses, et
// c'est tout ce que l'on exige.
function verifierLavis(m, quoi) {
  expect(m.lumFond, `${quoi} : le fond doit être CLAIR, pas un aplat violet`).toBeGreaterThan(0.6);
  expect(m.texte[2], `${quoi} : l'écriture doit être violette (bleu dominant)`)
    .toBeGreaterThan(m.texte[1] + 40);
  expect(m.texte[0], `${quoi} : l'écriture doit être FONCÉE, pas blanche`).toBeLessThan(160);
  expect(m.contraste, `${quoi} : contraste AA`).toBeGreaterThanOrEqual(4.5);
}

module.exports = { sonde, verifierLavis };
