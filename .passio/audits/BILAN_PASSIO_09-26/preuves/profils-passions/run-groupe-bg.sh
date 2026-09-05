#!/bin/bash
cd /home/user/passio-app
P=/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/profils-passions
L=$1; shift
PASSIO_PORT=8105 npx playwright test --project=local "$@" --workers=1 --reporter=line > "$P/$L" 2>&1
echo "EXIT=$?" >> "$P/$L"
