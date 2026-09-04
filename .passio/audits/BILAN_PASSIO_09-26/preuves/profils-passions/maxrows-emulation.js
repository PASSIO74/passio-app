// Émulation : que fait le client si `select("id")` sur `passions` est tronqué à 1 000 lignes
// (valeur par défaut de max-rows sur Supabase) ? Les 1 000 ids sont ceux rendus par
// `select id from passions order by ctid limit 1000` (requête base du 2026-09-04).
const path = require("path");
const fs = require("fs");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/@playwright/test"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
const ids1000 = fs.readFileSync(path.join(__dirname, "ids-1000-ctid.txt"), "utf8").trim().split(",");
const tousIds = JSON.parse(fs.readFileSync(path.join(REPO, "data/passions-v1.json"), "utf8"));
const listeIds = Array.isArray(tousIds) ? tousIds.map((x) => x[0] || x.id) : (tousIds.passions || tousIds.items || []).map((x) => Array.isArray(x) ? x[0] : x.id);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8106", viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  await bootOnboarded(page, null, 1, {});
  const r = await page.evaluate(([ids, tous]) => {
    _referentielPassions = new Set(ids);          // ce que `chargerReferentielPassions` installe si PostgREST rend 1 000 lignes
    const refusees = tous.filter((id) => !estPassionCanonique(id));
    // Un compte qui possède « sante-sport-sante » (cas réel en production, rang physique 1732)
    state.user.profiles.push({ id: "pp_s", name: "Audit QA", passion: "sante-sport-sante", emoji: "🩺", color: "#7c3aed", createdAt: Date.now() });
    state.user.currentProfileId = "pp_s"; saveState();
    goTo("studio");
    const options = Array.from(document.getElementById("postPassion").options).map((o) => o.value);
    const note = (document.querySelector("#screen-studio .studio-passion-note, #studioPassionNote") || {}).textContent || null;
    let verdictEvenement = null;
    try { verdictEvenement = requiredCanonicalPassion("sante-sport-sante"); } catch (e) {}
    return {
      total_referentiel: tous.length,
      canoniques_vues_par_le_client: tous.length - refusees.length,
      refusees_a_la_publication: refusees.length,
      exemples_refusees: refusees.slice(0, 8),
      sante_sport_sante_canonique: estPassionCanonique("sante-sport-sante"),
      studio_options: options,
      studio_propose_sante_sport_sante: options.includes("sante-sport-sante"),
      studio_note: note,
      verdict_evenement: verdictEvenement,
      story_passion_normalisee: optionalCanonicalPassion("sante-sport-sante"),
    };
  }, [ids1000, listeIds]);
  fs.writeFileSync(path.join(__dirname, "maxrows-emulation-resultat.json"), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
