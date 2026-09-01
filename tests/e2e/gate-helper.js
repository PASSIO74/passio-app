// Jeton de déverrouillage de l'Access Gate pour les tests E2E.
// ⚠️ Si le code d'accès change (GATE_HASH dans js/access-gate.js),
// mettre à jour GATE_TOKEN ici — voir docs/SECURITE_CODE_ACCES.md.
const GATE_KEY = "passio_gate_v1";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";

// Clé du parcours « première visite », ACTIF PAR DÉFAUT depuis le 2026-09-01.
const CLE_PREMIERE_VISITE = "passio_first_run_experience_v1";

// Déverrouille le gate ET coupe la première visite, pour les suites qui
// observent le parcours HISTORIQUE depuis un appareil vierge.
//
// ⚠️ POURQUOI CE HELPER EXISTE. Le lot « première visite » est actif par
// défaut : un appareil sans compte entre directement dans le Fil et ne voit
// plus la landing ni l'onboarding. Une suite qui démarre vierge et attend
// l'ancien parcours mesurerait donc le nouveau sans le dire. La convention du
// projet, déjà appliquée aux mises en ligne d'UI-3A et des lots UI-4 : la suite
// pose la coupure au boot et garde TOUTES ses assertions — on ne retire jamais
// un contrôle, on le rend explicite.
//
// ⚠️ Les suites qui injectent un état ONBOARDÉ (`app-helper.js`) n'en ont pas
// besoin : `entreeDirecte()` sort sur sa garde « compte existant ».
// Et le nouveau parcours a sa propre suite, `first-run.spec.js`.
async function poserGateSansPremiereVisite(page) {
  await page.addInitScript(([k, t, cle]) => {
    sessionStorage.setItem(k, t);
    localStorage.setItem(cle, "0");
  }, [GATE_KEY, GATE_TOKEN, CLE_PREMIERE_VISITE]);
}

module.exports = {
  GATE_KEY,
  GATE_TOKEN,
  GATE_CODE: "2125", // utilisé uniquement par access-gate.spec.js
  CLE_PREMIERE_VISITE,
  poserGateSansPremiereVisite,
};
