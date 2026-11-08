// ═══════════════════════════════════════════════════════════════════════════
// LES TESTS QUI JOUENT DU VRAI BASH TROUVENT CELUI DE GIT, MÊME DEPUIS POWERSHELL.
//
// Trois suites de `npm run verif` exécutent les blocs `run:` réels des workflows
// sous `bash`. Git pour Windows ne met sur le PATH que son dossier `cmd` : depuis
// PowerShell ou cmd, `execFileSync("bash", …)` rendait ENOENT, et `verif`
// s'arrêtait à `sentinelle-taille-pr` (mesuré le 2026-11-07, sept rouges). Depuis
// Git Bash, ces mêmes suites passent : ce n'est pas le code testé qui diverge.
//
// À importer AVANT tout appel à `bash` : les imports s'évaluent avant le corps du
// module, et `process.env.PATH` est lu au moment de l'appel. Sans effet hors de
// Windows, et sans effet si `bash` se trouve déjà.
//
// ⚠️ `usr/bin`, PAS `bin` : le `bash.exe` de `Git/bin` est un LANCEUR qui remet
// `/usr/bin` en tête du PATH. Le faux `sleep` d'un bac perdait alors contre le
// vrai, et `sentinelle-workflows` attendait de vrais `sleep 8` avant de rougir.
// Même ordre que Git Bash : `mingw64/bin`, puis `usr/bin`, puis le reste — sinon
// `sort` et `find` seraient ceux de `System32`.
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function bashTrouve() {
  return !spawnSync("bash", ["--version"], { stdio: "ignore" }).error;
}

if (process.platform === "win32" && !bashTrouve()) {
  try {
    // `…/Git/mingw64/libexec/git-core` → `…/Git` : suit l'emplacement réel de Git.
    const coeur = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    const racine = path.resolve(coeur, "..", "..", "..");
    const usrBin = path.join(racine, "usr", "bin");
    if (fs.existsSync(path.join(usrBin, "bash.exe"))) {
      process.env.PATH = [path.join(racine, "mingw64", "bin"), usrBin, process.env.PATH].join(path.delimiter);
    }
  } catch (e) {
    // Pas de Git : le premier appel à `bash` dira ENOENT, c'est le bon message.
  }
}
