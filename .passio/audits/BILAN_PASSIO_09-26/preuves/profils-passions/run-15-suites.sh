#!/bin/bash
cd /home/user/passio-app
P=/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/profils-passions
run() { # $1 = nom log, reste = specs
  L=$1; shift
  PASSIO_PORT=8105 npx playwright test --project=local "$@" --workers=1 --reporter=line > "$P/$L" 2>&1
  echo "EXIT=$?" >> "$P/$L"
}
run pw-A.log tests/e2e/profils-types.spec.js tests/e2e/refonte-multi-passion.spec.js tests/e2e/passions-archive-quota.spec.js
run pw-B.log tests/e2e/mes-passions-page.spec.js tests/e2e/sync-passion-active.spec.js tests/e2e/multi-passion-integrite.spec.js tests/e2e/multi-passion-audit-restant.spec.js
run pw-C.log tests/e2e/passions-plates.spec.js tests/e2e/profil-entete-passions.spec.js
run pw-D.log tests/e2e/profil-trois-autorites.spec.js tests/e2e/profil-identite-serveur-autoritaire.spec.js tests/e2e/user-passions-miroir.spec.js tests/e2e/ui-v8-passions.spec.js tests/e2e/passion-personnalisee-fk.spec.js tests/e2e/hotfix-profil-passion-custom.spec.js
echo "TOUT-FINI" > "$P/pw-FINI.txt"
