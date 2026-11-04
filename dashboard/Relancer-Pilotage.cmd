@echo off
REM ===========================================================================
REM  Relance le SERVEUR du centre de pilotage apres une modification de code,
REM  sans toucher au superviseur.
REM
REM  Le superviseur (supervise.mjs) ne surveille pas les fichiers : il faut
REM  arreter le processus qui ecoute sur le port 4610, et le superviseur le
REM  relance en 2 s avec le nouveau code. On tue UNIQUEMENT ce pid (pas /T,
REM  jamais le superviseur), pid numerique seulement.
REM
REM  2026-11-03 : le pid est lu par PowerShell (Get-NetTCPConnection, socket
REM  d ecoute = port distant 0) et non plus par netstat, qui n affichait pas
REM  toujours la ligne LISTENING du 4610. La verification finale sonde
REM  /api/health.
REM
REM  Effet de bord assume : la relance est comptee comme une relance par le
REM  superviseur (page Sources). Pour un changement de .env, utiliser
REM  Arreter-Pilotage.cmd puis Sentinelle-Demarrage.vbs (l env n est lu qu au
REM  demarrage du superviseur).
REM  (ASCII pur : voir la note dans Installer-Demarrage-Auto.cmd)
REM ===========================================================================
setlocal enabledelayedexpansion
set "TROUVE="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4610 -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 0 -and $_.OwningProcess -gt 4 } | Select-Object -ExpandProperty OwningProcess -Unique"`) do (
  echo %%p| findstr /R /C:"^[0-9][0-9]*$" >nul && (
    echo Arret du serveur du pilotage ^(pid %%p^) - le superviseur le relance en 2 s...
    taskkill /PID %%p /F >nul 2>&1
    set "TROUVE=%%p"
  )
)
if not defined TROUVE (
  echo Aucun serveur n ecoute sur 4610 : rien a relancer. Si le pilotage doit tourner, lance Lancer-Pilotage.cmd.
  goto :fin
)
REM On laisse au superviseur jusqu a ~12 s pour relancer le serveur.
REM (ping comme pause : timeout echoue sans console, ex. lance par un agent)
set "OK="
for /l %%i in (1,1,6) do (
  if not defined OK (
    ping -n 3 127.0.0.1 >nul
    curl -s -f -m 2 -o nul "http://localhost:4610/api/health" && set "OK=1"
  )
)
if defined OK (
  echo Serveur relance ^(il repond de nouveau sur le port 4610^).
) else (
  echo ATTENTION : le serveur ne repond pas encore sur 4610. Le superviseur tourne-t-il ? ^(data\supervise.pid, page Sources^)
)
:fin
endlocal
