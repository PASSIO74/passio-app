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

// ⚠️ LE NOM D'ESSAI NE DOIT PAS POUVOIR ENTRER AU RÉFÉRENTIEL, JAMAIS.
// Cette suite s'appuie sur une prémisse : « ce nom est INCONNU du référentiel »,
// donc le sélecteur propose de le créer. Elle a d'abord utilisé « sculpture sur
// glace » — un nom parfaitement plausible, qui est effectivement entré au
// référentiel à la vague 3 (2026-09-10). Six cas sont tombés d'un coup, et pas
// pour un défaut du code : pour une prémisse périmée. Même famille que
// `user-passions-miroir` le 2026-09-09.
// Le référentiel est FAIT pour grossir (2 088 → 5 001, cible 12 000) : aucun
// nom vraisemblable n'est sûr. D'où une chaîne que personne n'écrira jamais
// comme libellé de passion, et un garde ci-dessous qui le VÉRIFIE au lieu de
// l'espérer.
const NOM_ESSAI = "zzbanc passion d essai";
const ID_ESSAI = "zzbanc-passion-d-essai";
const LIBELLE_ESSAI = "Zzbanc passion d essai";

const CREEE = {
  data: [{ id: ID_ESSAI, label: LIBELLE_ESSAI, emoji: "🧊", color: "#7c3aed", cree: true }],
};

test.describe("Créer une passion", () => {
  // ⓪ LE GARDE DE LA PRÉMISSE. Toute cette suite repose sur « NOM_ESSAI est
  // inconnu du référentiel ». Ce n'est pas une hypothèse à espérer, c'est un
  // fait à VÉRIFIER : le jour où il cesse d'être vrai, six cas tombent d'un
  // coup et le message ne dit pas pourquoi. Celui-ci le dit.
  test("⓪ le nom d'essai est bien ABSENT du référentiel", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => window.PassioPassions.charger());
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    const trouve = await page.evaluate((n) =>
      window.PassioPassions.chercher(n, { limite: 5 }).map((p) => p.label), NOM_ESSAI);
    expect(trouve,
      "« " + NOM_ESSAI + " » est entré au référentiel : toute cette suite en dépend "
      + "comme d'un nom INCONNU. Changer NOM_ESSAI / ID_ESSAI / LIBELLE_ESSAI en tête "
      + "de fichier, ne pas retirer la passion du référentiel."
    ).toHaveLength(0);
  });

  // ① Le cœur du lot : une passion inconnue devient une passion RÉELLE.
  test("① créer rend une passion nommée, canonique et publiable", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);

    const r = await page.evaluate((n) => window.PassioPassions.creerPassion(n), NOM_ESSAI);
    expect(r.cree).toBe(true);
    expect(r.passion.id).toBe(ID_ESSAI);

    // Le NOM, pas « ✨ Passion » : sans injection au référentiel en mémoire, la
    // passion qu'on vient de créer s'afficherait générique jusqu'au prochain
    // démarrage (même famille de défaut que le lot TAXO-1).
    const meta = await page.evaluate((i) => passionById(i), ID_ESSAI);
    expect(meta.label).toBe(LIBELLE_ESSAI);
    expect(meta.emoji).toBe("🧊");

    // PUBLIABLE TOUT DE SUITE : c'est tout l'objet du lot. `estPassionCanonique`
    // reste la seule autorité de publication.
    expect(await page.evaluate((i) => estPassionCanonique(i), ID_ESSAI)).toBe(true);

    // Le client n'envoie QUE le nom : ni identifiant, ni statut, ni source.
    const appel = await page.evaluate(() => window.__rpcAppels[0]);
    expect(appel.nom).toBe("creer_passion");
    expect(Object.keys(appel.args).sort()).toEqual(["p_emoji", "p_label"]);
    expect(appel.args.p_label).toBe(NOM_ESSAI);
  });

  // ② Elle rejoint la recherche LOCALE, pas seulement la réponse du serveur.
  test("② la passion créée est immédiatement trouvable dans la recherche", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => window.PassioPassions.charger());
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await poserServeur(page, CREEE);

    expect(await page.evaluate((n) =>
      window.PassioPassions.chercher(n, { limite: 5 }).map(p => p.id), NOM_ESSAI
    )).not.toContain(ID_ESSAI);

    await page.evaluate((n) => window.PassioPassions.creerPassion(n), NOM_ESSAI);

    expect(await page.evaluate((n) =>
      window.PassioPassions.chercher(n, { limite: 5 }).map(p => p.id), NOM_ESSAI
    )).toContain(ID_ESSAI);
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

    await page.locator("#hoteCreation .psel-input").fill(NOM_ESSAI);
    const bouton = page.locator("#hoteCreation .psel-ajouter");
    await expect(bouton).toBeVisible({ timeout: 10000 });
    // Le libellé DIT ce qui va se passer.
    await expect(bouton).toContainText("Créer");
    // ⚠️ VIE PRIVÉE : sans `data-tel`, `telemetry.js` nomme le clic avec le
    // `textContent` du bouton — donc avec la recherche libre de la personne.
    expect(await bouton.getAttribute("data-tel")).toBe("passion_creation");

    await bouton.click();
    await expect(page.locator("#hoteCreation .psel-puce")).toContainText(LIBELLE_ESSAI, { timeout: 10000 });
    expect(await page.evaluate(() => window.__choisies)).toContain(ID_ESSAI);
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
    await page.locator("#hotePlafond .psel-input").fill(NOM_ESSAI);
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
    expect(await page.evaluate((i) => estPassionCanonique(i), ID_ESSAI)).toBe(false);
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

  // ⑪ MODÉRATION (2026-09-09) : une passion créée doit pouvoir être signalée.
  // ⚠️ Le signalement passe par `supaReport` — le moteur qui sert déjà aux
  // comptes et aux publications — avec `target_type = "passion"`. Une seconde
  // file aurait divergé au premier correctif ; ce cas mesure qu'il n'y en a
  // qu'une, et qu'elle est appelée avec le bon type.
  test("⑪ la fiche d'une passion permet de la signaler", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => {
      window.__signalements = [];
      window.supaReport = async (type, id, raison) => {
        window.__signalements.push({ type: type, id: id, raison: raison });
        return true;
      };
      openPassionExplorer("musique");
    });
    const modale = page.locator("#modalContent");
    await expect(modale).toBeVisible({ timeout: 10000 });
    const lien = modale.locator('[data-tel="passion_signaler"]');
    await expect(lien).toBeVisible();
    await lien.click();
    await expect.poll(async () => await page.evaluate(() => window.__signalements.length),
      { timeout: 10000 }).toBe(1);
    expect(await page.evaluate(() => window.__signalements[0])).toEqual({
      type: "passion", id: "musique", raison: "",
    });
  });

  // ⑫ ⚠️ ON LIT LE VERDICT. `supaReport` rend `false` sur un refus RLS comme
  // sur un doublon — le SDK ne lève pas — et annoncer « signalement envoyé »
  // sur une écriture refusée est le défaut que ce dépôt a déjà payé.
  test("⑫ un signalement refusé ne s'annonce pas comme envoyé", async ({ page }) => {
    await bootAvecCompte(page);
    const texte = await page.evaluate(async () => {
      window.supaReport = async () => false;
      let vu = "";
      window.toast = (m) => { vu = String(m); };
      await reportPassion("musique", "Musique");
      return vu;
    });
    expect(texte).not.toMatch(/signalée\. On vérifie/i);
    expect(texte).toMatch(/déjà envoyé|impossible/i);
  });

  // ⑬ ARCHIVER DOIT AVOIR UN EFFET RÉEL. Le retrait de modération passe par
  // `status = 'archived'` : si la liste serveur des identifiants publiables ne
  // filtrait pas le statut, une passion retirée resterait publiable — le
  // retrait ne serait qu'un décor.
  test("⑬ la liste des passions publiables ne demande que les actives", async ({ page }) => {
    // ⚠️ LE CACHE DU RÉFÉRENTIEL EST À UN SEUL COUP, ET LA CI A DU RÉSEAU.
    // `chargerReferentielPassions` sort en tête quand `_referentielPassions` est
    // déjà rempli : en CI, la requête du boot avait réussi, la fonction ne
    // touchait plus `supa`, et le stub ci-dessous ne voyait RIEN — vert en
    // local (pas de SDK, donc pas de requête), rouge en CI. La famille de
    // divergence que ce dépôt connaît par cœur.
    //
    // On répond `[]` à la requête du boot : le cache ne se remplit QUE sur une
    // réponse non vide, donc il reste vide dans les DEUX environnements et
    // l'appel explicite ci-dessous atteint vraiment le client.
    //
    // ⚠️ Posée AVANT `bootOnboarded`, qui fait lui-même la navigation : une
    // route posée après ne protégerait que les chargements suivants.
    await page.route("**/rest/v1/passions?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await bootAvecCompte(page);
    const filtres = await page.evaluate(() => {
      const vus = [];
      window._supaReal = true;
      window.supa.from = (table) => ({
        select: () => ({
          eq: (col, val) => {
            vus.push({ table: table, col: col, val: val });
            return Promise.resolve({ data: [], error: null });
          },
          then: (f) => { vus.push({ table: table, col: null, val: null }); return Promise.resolve(f({ data: [], error: null })); },
        }),
      });
      chargerReferentielPassions();
      return vus;
    });
    const p = filtres.find((f) => f.table === "passions");
    expect(p, "la liste des passions publiables n'a pas été demandée").toBeTruthy();
    expect(p.col).toBe("status");
    expect(p.val).toBe("active");
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
    await page.locator("#hoteDemande .psel-input").fill(NOM_ESSAI);
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
    ), { timeout: 10000 }).toContain(NOM_ESSAI);
    expect(await page.locator("#hoteDemande .psel-input").inputValue()).toBe("");
  });

  // ══════════════════════════════════════════════════════════════════════
  // ALIAS À LA CRÉATION (2026-09-10)
  //
  // Mesuré en base après le rattrapage des alias : les six passions créées
  // depuis l'application étaient les SEULES à zéro alias — `creer_passion`
  // écrivait `aliases = '{}'` en dur. « GRS » existe et reste introuvable en
  // tapant « gymnastique rythmique ». La personne qui crée est justement celle
  // qui sait comment on la nomme autrement.
  //
  // ⚠️ CE QUI EST MESURÉ ICI EST LE CÂBLAGE, pas la règle. Le filtrage des
  // alias (pliage, bornes, balisage, alias qui percute une passion existante)
  // est prouvé sur un vrai PostgreSQL par
  // `scripts/verifier-migration-creation-passion.sh` ⑥ quater.
  // ══════════════════════════════════════════════════════════════════════

  // ⑭ Le champ n'existe QUE là où il sert.
  test("⑭ le champ « autres noms » n'apparaît que si la création est possible", async ({ page }) => {
    await bootAvecCompte(page);
    await page.evaluate(() => {
      window._supaReal = false;                       // chemin de DEMANDE
      const hote = document.createElement("div");
      hote.id = "hoteDemande";
      document.body.appendChild(hote);
      PassionSearchSelector.monterDans(hote, { mode: "multi" });
    });
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await page.locator("#hoteDemande .psel-input").fill(NOM_ESSAI);
    await expect(page.locator("#hoteDemande .psel-ajouter")).toContainText("Demander l'ajout");
    // Sous le chemin de demande, les alias ne seraient transmis à personne :
    // un champ qui ne sert à rien est un mensonge d'interface.
    await expect(page.locator("#hoteDemande .psel-alias")).toHaveCount(0);

    // Création possible ⇒ le champ paraît.
    await page.evaluate(() => { window._supaReal = true; });
    await page.locator("#hoteDemande .psel-input").fill(NOM_ESSAI + " bis");
    await expect(page.locator("#hoteDemande .psel-alias")).toBeVisible({ timeout: 10000 });
  });

  // ⑮ LE CAS QUI REND LE LOT DÉPLOYABLE AVANT SA MIGRATION.
  test("⑮ sans alias saisi, la charge utile n'a PAS changé", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);
    await page.evaluate((n) => window.PassioPassions.creerPassion(n), NOM_ESSAI);
    const appel = await page.evaluate(() => window.__rpcAppels[0]);
    // ⚠️ Envoyer `p_aliases` à une base qui ne connaît que la forme à deux
    // arguments fait répondre PostgREST « fonction introuvable » (PGRST202) —
    // que `creerPassion` traite comme un verrouillage DÉFINITIF de la création
    // pour toute la session. Sur une base parfaitement saine.
    expect(Object.keys(appel.args).sort()).toEqual(["p_emoji", "p_label"]);
  });

  // ⑯ Les alias partent, découpés et bornés.
  test("⑯ les alias saisis partent au serveur, découpés et bornés à cinq", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);
    await page.evaluate(() => window.PassioPassions.creerPassion("gymnastique rythmique", {
      alias: ["gym rythmique", "  ruban et cerceau  ", "a", "", "grs", "quatre", "cinq", "six"],
    }));
    const appel = await page.evaluate(() => window.__rpcAppels[0]);
    expect(Object.keys(appel.args).sort()).toEqual(["p_aliases", "p_emoji", "p_label"]);
    expect(appel.args.p_aliases).toEqual(["gym rythmique", "ruban et cerceau", "a", "grs", "quatre"]);
  });

  // ⑰ La saisie SURVIT à la réécriture du pied.
  test("⑰ le champ garde sa saisie quand le pied est réécrit", async ({ page }) => {
    await bootAvecCompte(page);
    await poserServeur(page, CREEE);
    await page.evaluate(() => {
      const hote = document.createElement("div");
      hote.id = "hoteDemande";
      document.body.appendChild(hote);
      PassionSearchSelector.monterDans(hote, { mode: "multi" });
    });
    await page.waitForFunction(() => window.PassioPassions.pret(), null, { timeout: 15000 });
    await page.locator("#hoteDemande .psel-input").fill(NOM_ESSAI);
    await page.locator("#hoteDemande .psel-alias").fill("glace sculptée");

    // ⚠️ `rendrePied` pose `innerHTML` À CHAQUE FRAPPE : un champ non mémorisé
    // perdrait sa saisie au caractère suivant tapé dans la recherche — même
    // famille que le cache `_lastHtml` de `renderProfileStrip`.
    await page.locator("#hoteDemande .psel-input").fill(NOM_ESSAI + "!");
    await expect(page.locator("#hoteDemande .psel-alias")).toHaveValue("glace sculptée");

    // Et ils partent réellement au serveur depuis le GESTE, pas seulement
    // depuis un appel direct au moteur.
    await page.locator("#hoteDemande .psel-ajouter").click();
    await expect.poll(async () => await page.evaluate(() => {
      const a = (window.__rpcAppels || []).find(x => x.nom === "creer_passion");
      return a && a.args.p_aliases ? a.args.p_aliases : null;
    }), { timeout: 10000 }).toEqual(["glace sculptée"]);
  });

  // ⑱ On remonte ce que le SERVEUR a retenu, jamais ce qu'on a demandé.
  test("⑱ les alias rendus sont ceux que le serveur a gardés", async ({ page }) => {
    await bootAvecCompte(page);
    // Le serveur en écarte un : il percute une passion existante.
    await poserServeur(page, {
      data: [{
        id: "course-nocturne", label: "Course nocturne", emoji: "✨", color: "#7c3aed",
        cree: true, aliases: ["trottiner"],
      }],
    });
    const r = await page.evaluate(() => window.PassioPassions.creerPassion("course nocturne", {
      alias: ["running", "trottiner"],
    }));
    expect(r.cree).toBe(true);
    // Laisser croire que « running » a été gardé serait un mensonge tranquille.
    expect(r.aliasRetenus).toEqual(["trottiner"]);

    // Et tant que la migration n'est pas appliquée, la réponse ne porte pas la
    // colonne : on rend un tableau vide, jamais `undefined`.
    await poserServeur(page, CREEE);
    const r2 = await page.evaluate((n) => window.PassioPassions.creerPassion(n), NOM_ESSAI);
    expect(r2.aliasRetenus).toEqual([]);
  });
});
