#!/bin/bash
# $1 = port, $2 = fichier log, reste = specs
PORT=$1; LOG=$2; shift 2
cd /home/user/passio-app
PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/pw-browsers PASSIO_PORT=$PORT npx playwright test --project=local "$@" --workers=1 --reporter=line > "$LOG" 2>&1
echo "EXIT=$?" >> "$LOG"
