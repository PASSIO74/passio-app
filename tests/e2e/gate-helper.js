// Jeton de déverrouillage de l'Access Gate pour les tests E2E.
// ⚠️ Si le code d'accès change (GATE_HASH dans js/access-gate.js),
// mettre à jour GATE_TOKEN ici — voir docs/SECURITE_CODE_ACCES.md.
module.exports = {
  GATE_KEY: "passio_gate_v1",
  GATE_TOKEN: "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f",
  GATE_CODE: "2125", // utilisé uniquement par access-gate.spec.js
};
