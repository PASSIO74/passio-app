// ═══════════════════════════════════════════════════════════════════════════
// ADMISSION 18+ — LA PORTE CÔTÉ CLIENT
//
// La BARRIÈRE est serveur (policies RLS d'`events` / `event_attendees`, cf.
// migrations/migration_admission_18_plus.sql et son banc PostgreSQL). Ce que
// cette suite éprouve, c'est la PORTE : expliquer avant le refus, demander
// l'année à qui ne l'a jamais déclarée, et ne JAMAIS enfermer quelqu'un dehors
// pour une panne de courtoisie.
//
// ⚠️ LE POINT LE PLUS IMPORTANT DE CETTE SUITE : la porte échoue OUVERT.
// C'est l'inverse exact de la garde `irlProposalVerdict` (irl-trust-safety),
// et c'est délibéré — celle-là tient une frontière que personne d'autre ne
// tient, celle-ci double une frontière déjà tenue par la base. Retenir sur un
// statut illisible couperait l'IRL à TOUT LE MONDE tant que la migration n'est
// pas appliquée, alors que le serveur, lui, sait très bien décider.
//
// C'est ce qui rend ce lot déployable AVANT la migration — et c'est exactement
// ce que le cas ① mesure.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Installe un faux canal Supabase qui rend le statut demandé, et enregistre
// tous les appels RPC pour qu'on puisse prouver ce qui a été demandé — et ce
// qui ne l'a pas été.
const UID_REEL = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

async function installerAdmission(page, statut, opts = {}) {
  await page.evaluate(({ statut, declareEchoue, statutEchoue, uid }) => {
    window._supaReal = true;
    // ⚠️ UN VRAI UUID, pas le `u_<aléatoire>` que `getMyUserId()` fabrique pour
    // tout visiteur : la porte n'agit que pour un compte Supabase réel. Sans
    // cette ligne, le test mesurerait la porte TRANSPARENTE et serait vert sans
    // rien prouver.
    MY_UID = uid; window.MY_UID = uid;
    // Session fraîche : le rappel « une fois par session » et le statut mis en
    // cache ne doivent rien hériter du démarrage.
    _admissionAnneePoussee = false;
    _admissionStatut = null;
    window.__rpc = [];
    window.__statutServeur = statut;
    window.supa.rpc = async (nom, args) => {
      window.__rpc.push({ nom, args });
      if (nom === "declare_birth_year") {
        if (declareEchoue) return { data: null, error: { message: "panne simulée" } };
        // Le serveur dérive lui-même la majorité : une année majeure admet.
        const an = Number(args && args._birth_year);
        const majeur = (new Date().getFullYear() - an) >= 18;
        window.__statutServeur = majeur ? "admitted" : "minor";
        return { data: true, error: null };
      }
      if (nom === "adult_access_status") {
        if (statutEchoue) return { data: null, error: { message: "fonction absente" } };
        return { data: window.__statutServeur, error: null };
      }
      return { data: null, error: { message: "RPC inattendu" } };
    };
    // Neutralise les écritures réelles : on mesure la PORTE, pas la base.
    window.__ecritures = [];
    window.supaSetEventRsvp = async (id, rsvp) => { window.__ecritures.push({ id, rsvp }); return true; };
  }, { statut, declareEchoue: !!opts.declareEchoue, statutEchoue: !!opts.statutEchoue, uid: UID_REEL });
}

// Un événement de démonstration auquel on peut réellement s'inscrire.
async function semerEvenement(page) {
  await page.evaluate(() => {
    state.seed = state.seed || {};
    state.seed.events = [{
      id: "ev_admission", title: "Sortie test", passion: "musique",
      city: "Annecy", date: Date.now() + 86400000, author: "u_orga",
      organizerId: "u_orga", attendees: [], maybes: [], waitlist: [],
      emoji: "🎶", status: "active",
    }];
    state.user.joinedEvents = [];
  });
}

// Vide l'année locale : le compte n'a jamais rien déclaré.
async function sansAnnee(page) {
  await page.evaluate(() => { state.user.birthYear = null; state.user.isMinor = false; saveState(); });
}

test.describe("Admission 18+ — la porte côté client", () => {

  // ── ① Le point capital : la porte est transparente quand elle ne sait pas ──

  test("statut illisible (migration pas encore appliquée) : la porte laisse passer", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "off", { statutEchoue: true });
    await semerEvenement(page);
    const r = await page.evaluate(async () => {
      const statut = await admissionLireStatut(true);
      const passe = await requireAdmission("rejoindre");
      return { statut, passe, modale: !!document.querySelector("#modalBackdrop.active") };
    });
    // « inconnu » et non « minor » : on ne DEVINE jamais un refus.
    expect(r.statut).toBe("inconnu");
    expect(r.passe).toBe(true);
    expect(r.modale).toBe(false);
  });

  test("aucun compte / aucun canal : la porte laisse passer aussi", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => { window._supaReal = false; });
    const r = await page.evaluate(async () => ({
      pret: admissionCanalPret(),
      passe: await requireAdmission("activite"),
    }));
    expect(r.pret).toBe(false);
    expect(r.passe).toBe(true);
  });

  test("visiteur sans compte réel : aucun RPC ne part, la porte est transparente", async ({ page }) => {
    // ⚠️ LE DÉFAUT QUI A CASSÉ LA CI, et qu'aucun test local ne voyait.
    // `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur : s'y fier
    // ouvrait la garde au démarrage, et le rappel partait interroger la
    // production sous une identité qui n'existe pas — en consommant au passage
    // son drapeau « une fois par session ». Seul un uuid Supabase prouve un compte.
    await bootOnboarded(page);
    const r = await page.evaluate(async () => {
      window._supaReal = true;
      window.__rpc = [];
      window.supa.rpc = async (nom) => { window.__rpc.push(nom); return { data: null, error: null }; };
      MY_UID = "u_" + Math.random().toString(36).slice(2, 10);   // ce que produit getMyUserId()
      _admissionAnneePoussee = false; _admissionStatut = null;
      return {
        pret: admissionCanalPret(),
        rappel: await admissionRappelServeur(),
        passe: await requireAdmission("rejoindre"),
        appels: window.__rpc.length,
        drapeau: _admissionAnneePoussee,
      };
    });
    expect(r.pret).toBe(false);
    expect(r.rappel).toBe(false);
    expect(r.appels).toBe(0);          // rien n'est demandé au serveur
    expect(r.drapeau).toBe(false);     // et le « une fois par session » n'est PAS consommé
    expect(r.passe).toBe(true);        // la porte laisse passer : le serveur décide
  });

  test("règle éteinte : la porte ne s'interpose pas et ne demande rien", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "off");
    await sansAnnee(page);
    const r = await page.evaluate(async () => ({
      passe: await requireAdmission("rejoindre"),
      modale: !!document.querySelector("#modalBackdrop.active"),
    }));
    expect(r.passe).toBe(true);
    expect(r.modale).toBe(false);
  });

  // ── ② Les trois statuts décidables ────────────────────────────────────────

  test("compte admis : rien n'est demandé", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "admitted");
    const r = await page.evaluate(async () => ({
      passe: await requireAdmission("activite"),
      modale: !!document.querySelector("#modalBackdrop.active"),
    }));
    expect(r.passe).toBe(true);
    expect(r.modale).toBe(false);
  });

  test("mineur déclaré : refus EXPLIQUÉ, et on ne redemande pas l'année", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "minor");
    const passe = await page.evaluate(() => requireAdmission("rejoindre"));
    expect(passe).toBe(false);
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Réservé aux majeurs");
    // La fenêtre de refus n'a PAS de champ année : redemander une année déjà
    // déclarée ferait croire qu'une autre réponse changerait quelque chose.
    await expect(page.locator("#admissionAnnee")).toHaveCount(0);
    // Et elle dit ce qui reste ouvert, plutôt que de claquer la porte.
    // ⚠️ Ce verrou exigeait « reste ouvert » — la phrase qui promettait le fil et
    // les messages à un mineur. PASSIO est réservé aux majeurs depuis le
    // 2026-09-09 : elle est partie avec la règle qu'elle décrivait, et le refus
    // doit maintenant dire que le COMPTE ne peut pas être maintenu.
    await expect(page.locator("#modalBackdrop.active")).toContainText(/18 ans et plus/);
    await expect(page.locator("#modalBackdrop.active")).not.toContainText(/reste ouvert/);
  });

  test("année jamais déclarée : la porte la demande, l'enregistre, et l'action passe", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "undeclared");
    await sansAnnee(page);

    const premier = await page.evaluate(() => requireAdmission("rejoindre"));
    expect(premier).toBe(false); // l'action s'arrête : on demande d'abord
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Ton année de naissance");

    await page.locator("#admissionAnnee").fill("1990");
    await page.locator("#modalBackdrop.active .btn.primary").click();
    await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);

    const apres = await page.evaluate(async () => ({
      annee: state.user.birthYear,
      mineur: state.user.isMinor,
      statut: await admissionLireStatut(false),
      passe: await requireAdmission("rejoindre"),
      envoyee: window.__rpc.filter(c => c.nom === "declare_birth_year").map(c => c.args._birth_year),
    }));
    expect(apres.annee).toBe(1990);
    expect(apres.mineur).toBe(false);
    expect(apres.statut).toBe("admitted");
    expect(apres.passe).toBe(true);
    expect(apres.envoyee).toContain(1990);
  });

  test("année saisie de mineur : refusée, et l'année part quand même au serveur", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "undeclared");
    await sansAnnee(page);
    await page.evaluate(() => requireAdmission("rejoindre"));
    const an = await page.evaluate(() => new Date().getFullYear() - 15);
    await page.locator("#admissionAnnee").fill(String(an));
    await page.locator("#modalBackdrop.active .btn.primary").click();
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Réservé aux majeurs");
    const r = await page.evaluate(() => ({
      mineur: state.user.isMinor,
      envoyee: window.__rpc.filter(c => c.nom === "declare_birth_year").length,
    }));
    expect(r.mineur).toBe(true);
    // La déclaration part : c'est elle qui rend la retenue OPPOSABLE côté
    // serveur. Ne pas l'envoyer laisserait le compte « undeclared », donc
    // libre de retenter ailleurs.
    expect(r.envoyee).toBe(1);
  });

  test("année manifestement erronée (moins de 13 ans) : refusée à la saisie, rien n'est envoyé", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "undeclared");
    await sansAnnee(page);
    await page.evaluate(() => requireAdmission("rejoindre"));
    const an = await page.evaluate(() => new Date().getFullYear() - 10);
    await page.locator("#admissionAnnee").fill(String(an));
    await page.locator("#modalBackdrop.active .btn.primary").click();
    const r = await page.evaluate(() => ({
      annee: state.user.birthYear,
      appels: window.__rpc.filter(c => c.nom === "declare_birth_year").length,
      encoreOuverte: !!document.querySelector("#admissionAnnee"),
    }));
    expect(r.annee).toBeFalsy();
    expect(r.appels).toBe(0);
    expect(r.encoreOuverte).toBe(true);
  });

  // ── ③ Le rappel serveur : les comptes EXISTANTS n'ont rien à ressaisir ────

  test("compte d'avant la règle : l'année locale est poussée sans rien demander", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "undeclared");
    // Prémisse : l'année existe en local (onboarding d'avant), pas au serveur.
    const r = await page.evaluate(async () => {
      const anneeLocale = state.user.birthYear;
      const passe = await requireAdmission("rejoindre");
      return {
        anneeLocale, passe,
        modale: !!document.querySelector("#modalBackdrop.active"),
        envoyee: window.__rpc.filter(c => c.nom === "declare_birth_year").map(c => c.args._birth_year),
      };
    });
    expect(r.anneeLocale).toBe(1995);
    expect(r.envoyee).toContain(1995);
    expect(r.passe).toBe(true);       // admis sans un mot
    expect(r.modale).toBe(false);     // et sans fenêtre
  });

  test("le rappel ne part qu'UNE fois par session", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "undeclared");
    const n = await page.evaluate(async () => {
      await admissionRappelServeur();
      await admissionRappelServeur();
      await admissionRappelServeur();
      return window.__rpc.filter(c => c.nom === "declare_birth_year").length;
    });
    expect(n).toBe(1);
  });

  // ── ④ Le branchement : la porte est VRAIMENT sur le chemin ───────────────
  //
  // ⚠️ Tester la fonction ne suffit pas — le câblage, non couvert, pourrait
  // être supprimé sans un seul rouge (piège déjà payé le 2026-09-02 sur
  // l'adoption de compte). Ces cas exercent les GESTES.

  test("s'inscrire à une rencontre en étant mineur : aucune écriture ne part", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "minor");
    await semerEvenement(page);
    const r = await page.evaluate(async () => {
      await setEventRsvp("ev_admission", "going");
      return { ecritures: window.__ecritures, rsvp: myRsvp("ev_admission") };
    });
    expect(r.ecritures).toEqual([]);
    expect(r.rsvp).toBeFalsy();
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Réservé aux majeurs");
  });

  test("PRÉMISSE — s'inscrire en étant admis fonctionne toujours", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "admitted");
    await semerEvenement(page);
    const r = await page.evaluate(async () => {
      await setEventRsvp("ev_admission", "going");
      return { ecritures: window.__ecritures, rsvp: myRsvp("ev_admission") };
    });
    // Sans cette prémisse, le test précédent passerait aussi bien si le RSVP
    // était cassé pour tout le monde.
    expect(r.rsvp).toBe("going");
    expect(r.ecritures.length).toBe(1);
  });

  test("SE RETIRER n'est jamais gardé, même pour un compte non admis", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "admitted");
    await semerEvenement(page);
    await page.evaluate(() => setEventRsvp("ev_admission", "going"));
    // La règle rattrape le compte APRÈS son inscription.
    await page.evaluate(() => { window.__statutServeur = "minor"; _admissionStatut = null; });
    const r = await page.evaluate(async () => {
      await setEventRsvp("ev_admission", null);
      return { rsvp: myRsvp("ev_admission"), ecritures: window.__ecritures.length,
               modale: !!document.querySelector("#modalBackdrop.active") };
    });
    expect(r.rsvp).toBeFalsy();          // il est bien sorti
    expect(r.modale).toBe(false);        // sans qu'on lui oppose quoi que ce soit
  });

  test("publier une rencontre en étant mineur : la porte arrête avant l'écriture", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "minor");
    const avant = await page.evaluate(() => (state.userEvents || []).length);
    await page.evaluate(() => submitEvent());
    await expect(page.locator("#modalBackdrop.active .modal-title")).toContainText("Réservé aux majeurs");
    const apres = await page.evaluate(() => (state.userEvents || []).length);
    expect(apres).toBe(avant);
  });

  // ── ⑤ Traces : aucune année, aucun identifiant ───────────────────────────

  test("les clés de télémétrie survivent au filtre PII et ne portent ni âge ni identité", async ({ page }) => {
    await bootOnboarded(page);
    await installerAdmission(page, "minor");
    const capt = await page.evaluate(async () => {
      const vus = [];
      window.tel = window.tel || {};
      const vrai = window.tel.action;
      window.tel.action = (n, meta) => vus.push({ n, meta });
      await requireAdmission("rejoindre");
      window.tel.action = vrai;
      return { vus, cles: Object.keys(admissionMeta("minor", "rejoindre")) };
    });
    expect(capt.cles.sort()).toEqual(["ctx", "statut", "v"]);
    expect(JSON.stringify(capt.vus)).not.toContain("1995");
    expect(JSON.stringify(capt.vus)).not.toContain("Audit QA");

    // ⚠️ La regex est LUE dans js/telemetry.js, jamais recopiée : une copie
    // dériverait au premier durcissement du filtre.
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "telemetry.js"), "utf8");
    const m = src.match(/var\s+DENY_KEY\s*=\s*(\/(?:\\.|[^/\\])+\/[a-z]*)\s*;/);
    expect(m, "DENY_KEY introuvable — le filtre a été renommé").not.toBeNull();
    const deny = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), m[1].slice(m[1].lastIndexOf("/") + 1));
    for (const c of capt.cles) expect(deny.test(c), `la clé « ${c} » serait jetée en silence`).toBe(false);
  });

  test("la porte est documentée comme n'étant PAS la barrière", async () => {
    // Le prochain lecteur doit trouver écrit, dans le code, que la frontière est
    // serveur. Sans cet avertissement, quelqu'un « durcira » la porte en la
    // rendant fail-closed, et coupera l'IRL à tout le monde le jour d'une panne.
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "js", "app-07-ia-explore-irl.js"), "utf8");
    expect(src).toContain("IL ÉCHOUE DONC OUVERT");
    expect(src).toContain("migration_admission_18_plus.sql");
  });
});
