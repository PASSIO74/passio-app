#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANCS SQL NON NOMMÉS DANS LE WORKFLOW — ils tournent quand même.
#
# Chaque banc `tests/sql/*.test.sh` avait jusqu'ici SA ligne dans
# `.github/workflows/deploy.yml`, donc chaque nouvelle migration touchait
# `.github/` et déclenchait la gouvernance critique (contre-revue humaine) —
# pour une ligne de YAML. Ce script exécute tout banc présent dans `tests/sql/`
# qui n'est PAS cité en toutes lettres dans le workflow : un banc neuf tourne
# dès son premier commit, sans toucher la CI. Les bancs nommés restent nommés
# (leur commentaire dit pourquoi ils existent) ; celui-ci ramasse les autres.
#
# ⚠️ Un banc absent = un banc qui ne tourne pas, et rien ne le dit. D'où le
# décompte imprimé à la fin, et l'échec au premier banc rouge.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW="$RACINE/.github/workflows/deploy.yml"
n=0; rouges=0
for banc in "$RACINE"/tests/sql/*.test.sh; do
  nom="$(basename "$banc")"
  if grep -q "tests/sql/$nom" "$WORKFLOW"; then continue; fi
  n=$((n+1))
  echo "── banc non nommé : $nom ──────────────────────────────────"
  if bash "$banc"; then echo "  ✅ $nom"; else rouges=$((rouges+1)); echo "  ❌ $nom"; fi
done
echo "bancs non nommés exécutés : $n, rouges : $rouges"
[ "$rouges" -eq 0 ]
