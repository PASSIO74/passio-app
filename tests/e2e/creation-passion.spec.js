// ══════════════════════════════════════════════════════════════════════════
// CRÉER UNE PASSION DEPUIS L'APPLICATION — lot creation_passion_v1 (2026-09-08)
//
// « Chacun peut créer une passion » : premier reproche des testeurs. Avant ce
// lot, un nom absent du référentiel ne pouvait donner qu'une DEMANDE — une
// entrée « en vérification », jamais publiable. La porte existait, elle ne
// menait nulle part.
//
// ⚠️ CE QUE CETTE SUITE NE PROUVE PAS, et il faut le savoir avant de la lire
// comme un feu vert : elle n'exerce PAS le serveur. `creer_passion` est une
// fonction `SECURITY DEFINER` — dédoublonnage, plafonds, identifiant dérivé,
// référentiel non inscriptible en direct : tout cela est prouvé sur un vrai
// PostgreSQL par `scripts/verifier-migration-creation-passion.sh` (CI). Ici on
// mesure le CLIENT : ce qu'il envoie, ce qu'il fait de la réponse, et ce qu'il
// fait quand le serveur n'est pas là.
//
// ⚠️ `window.supa` ET le `supa` lexical d'app-08 DÉSIGNENT LE MÊME OBJET
// (`supa = _buildNoopSupa(); window.supa = supa;`). Muter `window.supa.rpc`
// suffit donc, là où REMPLACER `window.supa` ne changerait rien pour les
// modules qui lisent le binding lexical — piège classique de ce dépôt.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";

// ⚠️ `MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE : `getMyUserId()` fabrique un
// `u_<aléatoire>` pour TOUT visiteur, et `creationDisponible()` exige un vrai
// uuid. On pose donc l'identité par `localStorage.passio_uid`, que `getMyUserId`
// relit — jamais par une réaffectation du binding lexical, impossible sous CSP.
async function bootAvecCompte(page, opts = {}) {
  await page.addInitScript((uid) => {
    try { localStorage.setItem("passio_uid", uid); } catch (e) {}
  }, opts.uid === null ? "u_visiteur_sans_compte" : UID);
  await bootOnboarded(page);
  await page.waitForFunction(() => !!window.PassioPassions, null, { timeout: 15000 });
}

// Branche un serveur factice : `_supaReal` vrai, et `rpc` qui journalise ses
// appels. `reponse` décrit ce que rend `creer_passion`.
async function poserServeur(page, reponse) {
  await page.evaluate((rep) => {
    window._supaReal = true;
    window.__rpcAppels = [];
    window.supa.rpc = function (nom, args) {
      window.__rpcAppels.push({ nom: nom, args: args });
      if (nom !== "creer_passion") return Promise.resolve({ data: [], error: null });
      if (rep.error) return Promise.resolve({ data: null, error: rep.error });
      return Promise.resolve({ data: rep.data, error: null });
    };
  }, reponse);
}

const CREEE = {
  data: [{ id: "sculpture-sur-glace", label: "Sculpture sur glace", emoji: "🧊", color: "#7c3aed", cree: true }],
};

test.describe("Créer une passion", () => {
  // ① Le cœur du lot : une passion inconnue devient une passion RÉELLE.
  test("① créer rend une passion nommée, canonique et publiable", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);

    const r = await page.evaluate(() => window.PassioPassions.creerPassion("sculpture sur glace"));
    expect(r.cree).toBe(true);
    expect(r.passion.id).toBe("sculpture-sur-glace");

    // Le NOM, pas « ✨ Passion » : sans injection au référentiel en mémoire, la
    // passion qu'on vient de créer s'afficherait générique jusqu'au prochain
    // démarrage (même famille de défaut que le lot TAXO-1).
    const meta = await page.evaluate(() => passionById("sculpture-sur-glace"));
    expect(meta.label).toBe("Sculpture sur glace");
    expect(meta.emoji).toBe("🧊");

    // PUBLIABLE TOUT DE SUITE : c'est tout l'objet du lot. `estPassionCanonique`
    // reste la seule autorité de publication.
    expect(await page.evaluate(() => estPassionCanonique("sculpture-sur-glace"))).toBe(true);

    // Le client n'envoie QUE le nom : ni identifiant, ni statut, ni source.
    const appel = await page.evaluate(() => window.__rpcAppels[0]);
    expect(appel.nom).toBe("creer_passion");
    expect(Object.keys(appel.args).sort()).toEqual(["p_emoji", "p_label"]);
    expect(appel.args.p_label).toBe("sculpture sur glace");
  });

  // ② Elle rejoint la recherche LOCALE, pas seulement la réponse du serveur.
  test("② la passion créée est immédiatement trouvable dans la recherche", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => window.PassioPassions.charger());
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await poserServeur(page, CREEE);

    expect(await page.evaluate(() =>
      window.PassioPassions.chercher("sculpture sur glace", { limite: 5 }).map(p => p.id)
    )).not.toContain("sculpture-sur-glace");

    await page.evaluate(() => window.PassioPassions.creerPassion("sculpture sur glace"));

    expect(await page.evaluate(() =>
      window.PassioPassions.chercher("sculpture sur glace", { limite: 5 }).map(p => p.id)
    )).toContain("sculpture-sur-glace");
  });

  // ③ Un nom déjà connu ne part même pas au serveur : on rend l'existante.
  test("③ un nom déjà au référentiel ne crée aucune variante", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => window.PassioPassions.charger());
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await poserServeur(page, CREEE);

    const r = await page.evaluate(() => window.PassioPassions.creerPassion("Musique"));
    expect(r.cree).toBe(false);
    expect(r.passion.id).toBe("musique");
    expect(await page.evaluate(() => window.__rpcAppels.length)).toBe(0);
  });

  // ④ Un refus serveur est NOMMÉ, et n'écrit rien du tout.
  test("④ un refus serveur ne rend pas la passion canonique", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, { error: { message: "quota_jour", code: "53400" } });

    const r = await page.evaluate(() => window.PassioPassions.creerPassion("tricot islandais"));
    expect(r.erreur).toBe("quota_jour");
    expect(r.cree).toBe(false);
    expect(await page.evaluate(() => estPassionCanonique("tricot-islandais"))).toBe(false);
  });

  // ⑤ Le REPLI n'est jamais un échec muet — et surtout, il ne ment pas :
  // sans serveur, l'appelant apprend qu'il n'a déposé qu'une demande.
  test("⑤ sans serveur, on retombe sur la demande et rien n'est publiable", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => { window._supaReal = false; });

    const r = await page.evaluate(() => window.PassioPassions.creerPassion("tricot islandais"));
    expect(r.cree).toBe(false);
    expect(r.repli).toBe("demande");
    expect(await page.evaluate(() => estPassionCanonique("tricot-islandais"))).toBe(false);
    expect(await page.evaluate(() =>
      window.PassioPassions.demandes().map(d => d.normalise)
    )).toContain("tricot islandais");
  });

  // ⑥ `MY_UID` ne prouve pas qu'un compte existe : un visiteur ne crée rien.
  test("⑥ un identifiant fabriqué de visiteur n'ouvre pas la création", async ({ page }) => {
    await bootAvecCompte(page, { uid: null });
    await page.evaluate(() => { window._supaReal = true; });
    expect(await page.evaluate(() => window.PassioPassions.creationDisponible())).toBe(false);
  });

  // ⑦ L'ÉCRAN : le bouton du sélecteur crée, sélectionne, et le dit.
  test("⑦ le bouton du sélecteur crée la passion et la sélectionne", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);
    await page.evaluate(() => {
      window.__choisies = null;
      const hote = document.createElement("div");
      hote.id = "hoteCreation";
      document.body.appendChild(hote);
      PassionSearchSelector.monterDans(hote, {
        mode: "multi",
        onChangement: (ids) => { window.__choisies = ids; },
      });
    });
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });

    await page.locator("#hoteCreation .psel-input").fill("sculpture sur glace");
    const bouton = page.locator("#hoteCreation .psel-ajouter");
    await expect(bouton).toBeVisible({ timeout: 10000 });
    // Le libellé DIT ce qui va se passer.
    await expect(bouton).toContainText("Créer");
    // ⚠️ VIE PRIVÉE : sans `data-tel`, `telemetry.js` nomme le clic avec le
    // `textContent` du bouton — donc avec la recherche libre de la personne.
    expect(await bouton.getAttribute("data-tel")).toBe("passion_creation");

    await bouton.click();
    await expect(page.locator("#hoteCreation .psel-puce")).toContainText("Sculpture sur glace", { timeout: 10000 });
    expect(await page.evaluate(() => window.__choisies)).toContain("sculpture-sur-glace");
    // Le champ est rendu vide : la frappe a abouti, elle ne reste pas en plan.
    expect(await page.locator("#hoteCreation .psel-input").inputValue()).toBe("");
  });

  // ⑨ TROIS CRÉATIONS OFFERTES, ENSUITE C'EST PAYANT (2026-09-08, soir).
  // Le plafond est tenu par le SERVEUR (`creer_passion` → `quota_creation`,
  // prouvé par `scripts/verifier-migration-creation-passion.sh` ⑥). Ici on
  // mesure ce que l'écran en fait : un refus qui ne se prononce pas est
  // indiscernable d'une panne, donc il doit ouvrir le PAYWALL, pas un toast.
  test("⑨ au plafond, le refus serveur ouvre le paywall des créations", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, { error: { message: "quota_creation", code: "53400" } });
    await page.evaluate(() => {
      const hote = document.createElement("div");
      hote.id = "hotePlafond";
      document.body.appendChild(hote);
      PassionSearchSelector.monterDans(hote, { mode: "multi" });
    });
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await page.locator("#hotePlafond .psel-input").fill("sculpture sur glace");
    const bouton = page.locator("#hotePlafond .psel-ajouter");
    await expect(bouton).toBeVisible({ timeout: 10000 });
    await bouton.click();

    const modale = page.locator("#modalContent");
    await expect(modale).toBeVisible({ timeout: 10000 });
    // ⚠️ LA FENÊTRE DOIT PARLER DU GESTE REFUSÉ. Trois plafonds distincts
    // aboutissent au même mur : quelqu'un qui vient de se faire refuser une
    // CRÉATION ne doit pas y lire qu'il « suit déjà 3 passions » — ce peut être
    // faux, et un mur qui parle d'autre chose se lit comme une panne.
    await expect(modale).toContainText("Trois créations offertes");
    await expect(modale).toContainText("créations de passion");
    await expect(modale).not.toContainText("Tu suis déjà");
    // ⚠️ AUCUN TARIF, AUCUN BOUTON « PAYER » — invariant du paywall (㉒).
    expect(await modale.textContent()).not.toMatch(/[€$]|\d+\s?(euros?|EUR)/i);
    // Et rien n'a été créé : la passion refusée n'est pas devenue publiable.
    expect(await page.evaluate(() => estPassionCanonique("sculpture-sur-glace"))).toBe(false);
  });

  // ⑩ Une passion qui EXISTE DÉJÀ ne consomme aucune création — elle ne part
  // même pas au serveur (verrou ③), donc le plafond ne peut pas la barrer.
  // C'est la contrepartie honnête du plafond : on ne fait pas payer un nom que
  // le référentiel connaissait déjà.
  test("⑩ au plafond, une passion déjà connue reste ajoutable", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => window.PassioPassions.charger());
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await poserServeur(page, { error: { message: "quota_creation", code: "53400" } });

    const r = await page.evaluate(() => window.PassioPassions.creerPassion("Musique"));
    expect(r.erreur).toBeUndefined();
    expect(r.passion.id).toBe("musique");
    expect(await page.evaluate(() => window.__rpcAppels.length)).toBe(0);
  });

  // ⑧ Sans serveur, le bouton ne PROMET pas ce qu'il ne peut pas tenir.
  test("⑧ sans création possible, le bouton annonce une demande", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => {
      window._supaReal = false;
      const hote = document.createElement("div");
      hote.id = "hoteDemande";
      document.body.appendChild(hote);
      PassionSearchSelector.monterDans(hote, { mode: "multi" });
    });
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await page.locator("#hoteDemande .psel-input").fill("sculpture sur glace");
    const bouton = page.locator("#hoteDemande .psel-ajouter");
    await expect(bouton).toBeVisible({ timeout: 10000 });
    await expect(bouton).toContainText("Demander l'ajout");
    expect(await bouton.getAttribute("data-tel")).toBe("passion_ajout_demande");

    // ⚠️ ON CLIQUE. La première version de ce cas lisait le libellé sans jamais
    // exercer le geste — et le défaut était là : tous les taps partaient vers
    // la création, donc vers la porte d'inscription, et la demande promise par
    // le bouton n'était JAMAIS enregistrée. Un verrou qui cesse d'exercer le
    // geste cesse de protéger le geste.
    await bouton.click();
    await expect.poll(async () => await page.evaluate(() =>
      window.PassioPassions.demandes().map(d => d.normalise)
    ), { timeout: 10000 }).toContain("sculpture sur glace");
    expect(await page.locator("#hoteDemande .psel-input").inputValue()).toBe("");
  });
});
