// Preuve : le code du gate (4 chiffres, hash SHA-256 salé embarqué dans js/access-gate.js) se retrouve hors ligne.
const crypto = require("crypto");
const src = require("fs").readFileSync("/home/user/passio-app/js/access-gate.js", "utf8");
const salt = /GATE_SALT\s*=\s*"([^"]+)"/.exec(src)[1];
const hash = /GATE_HASH\s*=\s*"([0-9a-f]{64})"/.exec(src)[1];
const t0 = process.hrtime.bigint();
let found = null, n = 0;
for (let i = 0; i < 10000 && found === null; i++) {
  const c = String(i).padStart(4, "0"); n++;
  if (crypto.createHash("sha256").update(salt + c).digest("hex") === hash) found = c;
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(JSON.stringify({ code_retrouve: found ? "oui (" + found.length + " chiffres, valeur non recopiée)" : "non", essais: n, duree_ms: Math.round(ms) }));
