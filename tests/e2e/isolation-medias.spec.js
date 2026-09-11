// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LES MÉDIAS DE PRODUCTION NE SONT PLUS TÉLÉCHARGÉS PAR LES TESTS
//
// CE QUE ÇA A COÛTÉ. Mesuré le 2026-09-10 sur le tableau de bord Supabase :
// 1,12 Go d'egress en 24 h, sur un plan qui en offre 10 Go par MOIS. 1,06 Go
// venaient d'un SEUL fichier — un avatar de 2,59 Mo demandé 399 fois. Pas par
// des utilisateurs : par cette suite de tests. La bande passante du projet était
// donc déjà dépassée AVANT l'ouverture au public, et par le projet lui-même.
//
// ⚠️ LE CHEMIN EST INDIRECT, ET C'EST POUR ÇA QU'IL A TENU. `profiles` n'est
// délibérément pas isolée (une lecture vide ferait tenter une ÉCRITURE en
// production à `supaEnsureProfileExists`). Les profils réels remontent donc avec
// leurs URLs d'avatar réelles, et c'est le NAVIGATEUR qui télécharge — un étage
// plus bas que tout ce que l'isolation regardait.
//
// ⚠️ CES CAS MESURENT LE CÂBLAGE, PAS SEULEMENT LA FONCTION. Le cas ② passe par
// `bootOnboarded`, qui est le SEUL point d'entrée qu'utilisent les ~113 suites
// concernées : c'est lui qui doit poser la route. Un verrou qui n'appellerait
// que `sansDonneesDistantes` en direct resterait vert si quelqu'un retirait
// l'appel de `bootOnboarded` — exactement le défaut relevé sur `_notifierMessage`
// (12 verrous verts sur une fonction morte).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");
const { GATE_KEY, GATE_TOKEN } = require("./gate-helper");
const fs = require("fs");
const path = require("path");

// ⚠️ HÔTE FICTIF À DESSEIN, ET SOUS `.invalid`. Le motif d'interception porte
// sur le CHEMIN (`/storage/v1/object/`), pas sur le projet : écrire la vraie
// référence ici la recopierait dans un fichier de plus sans rien mesurer de
// mieux. `.invalid` est réservé par la RFC 2606 et ne résout JAMAIS — c'est ce
// qui rend les cas ④ et ⑤ discriminants : une requête interceptée échoue en
// `ERR_FAILED` (la route l'a abandonnée), une requête RÉELLEMENT partie échoue
// en `ERR_NAME_NOT_RESOLVED` (elle est allée jusqu'au DNS). Un sous-domaine de
// `supabase.co` aurait pu résoudre, et le cas ⑤ serait devenu un faux vert.
const IMAGE_DISTANTE =
  "https://passio-essai.invalid/storage/v1/object/public/content/avatars/quelconque.jpg";
const IMAGE_TRANSFORMEE =
  "https://passio-essai.invalid/storage/v1/render/image/public/content/avatars/quelconque.jpg?width=600";
const VIDEO_DISTANTE =
  "https://passio-essai.invalid/storage/v1/object/public/content/videos/lourde.mp4";

/** Déverrouille le gate — même convention que les autres suites. */
async function poserGate(page) {
  await page.addInitScript(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
}

/** Charge une URL comme une IMAGE et dit ce que le navigateur en a obtenu. */
function chargerImage(page, url) {
  return page.evaluate(
    (u) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => res({ chargee: true, largeur: img.naturalWidth });
        img.onerror = () => res({ chargee: false, largeur: 0 });
        img.src = u;
        // Un filet : sans lui, une requête qui ne se règle jamais gèlerait le cas
        // au lieu de le faire échouer en disant pourquoi.
        setTimeout(() => res({ chargee: false, largeur: -1 }), 8000);
      }),
    url,
  );
}

test.describe("Isolation des médias de production", () => {
  test("① une image de Storage est servie localement, elle ne part jamais sur le réseau", async ({
    page,
  }) => {
    await poserGate(page);
    await sansDonneesDistantes(page);
    await page.goto("/");

    // ⚠️ CE COLLECTEUR DOIT ÊTRE ASSERTÉ, SINON IL NE SERT À RIEN. Sa première
    // version accumulait les URLs vues et personne ne les regardait — le cas
    // annonçait « aucun octet de production n'a été demandé » sans jamais le
    // mesurer. On enregistre donc les échecs de TRANSPORT : ils ne peuvent
    // survenir que si la requête a quitté le navigateur.
    const transport = [];
    page.on("requestfailed", (r) => {
      if (/\/storage\/v1\//.test(r.url())) transport.push((r.failure() || {}).errorText || "");
    });

    const r = await chargerImage(page, IMAGE_DISTANTE);
    // Le pixel 1×1 : l'image se charge (le chemin « image chargée » du produit
    // reste emprunté), mais aucun octet de production n'a été demandé.
    expect(r.chargee, "l'image doit se charger, pas échouer").toBe(true);
    expect(r.largeur, "un PNG 1×1 a été servi à la place du fichier réel").toBe(1);
    expect(
      transport.join(" "),
      "aucune requête ne doit avoir atteint le réseau : la route sert le pixel",
    ).not.toMatch(/NAME_NOT_RESOLVED|TUNNEL_CONNECTION_FAILED|ERR_CONNECTION|ERR_PROXY/);
  });

  test("② le câblage : bootOnboarded pose la route pour les ~113 suites", async ({ page }) => {
    // ⚠️ `errors` attend un objet {js, network, console}, jamais un tableau :
    // lui passer un tableau fait lever le listener console de `bootOnboarded` à
    // chaque message, et `page.goto` n'aboutit jamais. On n'en a pas besoin ici.
    await bootOnboarded(page);

    const r = await chargerImage(page, IMAGE_DISTANTE);
    expect(
      r.chargee && r.largeur === 1,
      "bootOnboarded doit poser l'isolation des médias — c'est lui que les suites appellent",
    ).toBe(true);
  });

  test("③ la forme TRANSFORMÉE de l'URL est couverte, pas seulement la forme brute", async ({
    page,
  }) => {
    // `passioThumb` (app-02) réécrit `/object/public/` en `/render/image/public/`.
    // Un motif qui n'aurait connu que la première forme aurait laissé passer
    // toutes les images de publication — soit l'essentiel du poids.
    await poserGate(page);
    await sansDonneesDistantes(page);
    await page.goto("/");

    const r = await chargerImage(page, IMAGE_TRANSFORMEE);
    expect(r.chargee).toBe(true);
    expect(r.largeur).toBe(1);
  });

  test("④ ce qui n'est pas une image est ABANDONNÉ, pas déguisé en image", async ({ page }) => {
    // Servir un PNG de 68 octets sous le nom d'un .mp4 donnerait un élément
    // vidéo cassé d'une façon trompeuse. Les vidéos de production pèsent
    // jusqu'à 30 Mo et aucune suite n'en lit le contenu : on coupe franchement.
    await poserGate(page);
    await sansDonneesDistantes(page);
    await page.goto("/");

    const echecs = [];
    page.on("requestfailed", (r) => {
      if (/\/storage\/v1\//.test(r.url())) echecs.push((r.failure() || {}).errorText || "");
    });

    const verdict = await page.evaluate(
      (u) =>
        new Promise((res) => {
          const v = document.createElement("video");
          v.onloadeddata = () => res("chargee");
          v.onerror = () => res("abandonnee");
          v.src = u;
          v.load();
          setTimeout(() => res("sans-reponse"), 8000);
        }),
      VIDEO_DISTANTE,
    );
    expect(verdict, "une vidéo de production ne doit pas être servie").not.toBe("chargee");
    // ⚠️ C'EST LA RAISON DE L'ÉCHEC QUI PROUVE QUELQUE CHOSE, pas l'échec.
    // Sans la route, cette requête échouerait aussi — mais au DNS, donc après
    // être partie. Le cas serait resté vert en ne mesurant rien.
    expect(
      echecs.join(" "),
      "la vidéo doit être abandonnée par la route, pas partir jusqu'au DNS",
    ).toMatch(/ERR_FAILED|ERR_ABORTED/);
    expect(echecs.join(" "), "elle ne doit jamais atteindre le réseau").not.toMatch(
      /NAME_NOT_RESOLVED/,
    );
  });

  test("⑤ les ÉCRITURES continuent de passer — on n'a pas coupé les dépôts de fichier", async ({
    page,
  }) => {
    await poserGate(page);
    await sansDonneesDistantes(page);
    await page.goto("/");

    // Un POST vers Storage ne doit PAS être intercepté : une suite qui exerce un
    // vrai dépôt doit continuer de le faire. Sans réseau vers cet hôte fictif,
    // la requête échoue — et c'est précisément la preuve qu'elle est partie au
    // lieu d'être servie localement par un pixel.
    const echecs = [];
    page.on("requestfailed", (r) => {
      if (/\/storage\/v1\//.test(r.url())) echecs.push((r.failure() || {}).errorText || "");
    });

    await page.evaluate(
      (u) =>
        fetch(u, { method: "POST", body: "x" })
          .then(() => null)
          .catch(() => null),
      IMAGE_DISTANTE,
    );
    // ⚠️ LE DISCRIMINANT EST LA NATURE DE L'ERREUR, PAS SA PRÉSENCE. Une requête
    // abandonnée par `route.abort()` rend `net::ERR_FAILED` ; une requête qui a
    // RÉELLEMENT quitté le navigateur rend une erreur de TRANSPORT. Laquelle
    // dépend de l'environnement, et les deux sont légitimes : `ERR_NAME_NOT_RESOLVED`
    // en CI (DNS direct), `ERR_TUNNEL_CONNECTION_FAILED` derrière un proxy de
    // développement — mesuré à la sonde. Exiger le seul libellé du DNS aurait
    // rendu ce cas rouge partout sauf en CI.
    expect(
      echecs.join(" "),
      "un POST doit traverser la route, pas être intercepté comme une lecture",
    ).toMatch(/NAME_NOT_RESOLVED|TUNNEL_CONNECTION_FAILED|ERR_CONNECTION|ERR_PROXY/);
    expect(
      echecs.join(" "),
      "`ERR_FAILED` signifierait que l'isolation a avalé une ÉCRITURE",
    ).not.toMatch(/ERR_FAILED|ERR_ABORTED/);
  });

  test("⑥ à la SOURCE : `sansDonneesDistantes` enregistre bien une route médias", async () => {
    // Les cas ① à ⑤ mesurent le comportement. Celui-ci mesure le TEXTE, parce
    // qu'un comportement peut rester juste par accident (une image qui échoue
    // pour une raison de réseau ressemble à une image interceptée).
    const src = fs.readFileSync(path.join(__dirname, "app-helper.js"), "utf8");
    const corps = src.slice(src.indexOf("async function sansDonneesDistantes"));
    expect(corps, "la route médias doit vivre DANS sansDonneesDistantes").toMatch(
      /page\.route\(\s*MOTIF_MEDIAS_DISTANTS/,
    );
    expect(src, "le motif doit couvrir les deux formes d'URL Storage").toMatch(
      /object\|render\\\/image/,
    );
  });
});
