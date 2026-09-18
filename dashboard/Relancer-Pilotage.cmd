@echo off
REM ===========================================================================
REM  Relance le SERVEUR du centre de pilotage apres une modification de code,
REM  sans toucher au superviseur.
REM
REM  Le superviseur (supervise.mjs) ne surveille pas les fichiers : il faut
REM  arreter le processus qui ecoute sur le port 4610, et le superviseur le
REM  relance en 2 s avec le nouveau code. On tue UNIQUEMENT ce pid (pas /T,
REM  jamais le superviseur), avec le motif strict d Arreter-Pilotage.cmd
REM  (":4610 " suivi de LISTENING, pid numerique seulement).
REM
REM  Effet de bord assume : la relance est comptee comme une relance par le
REM  superviseur (page Sources). Pour un changement de .env, utiliser
REM  Arreter-Pilotage.cmd puis Sentinelle-Demarrage.vbs (l env n est lu qu au
REM  demarrage du superviseur).
REM  (ASCII pur : voir la note dans Installer-Demarrage-Auto.cmd)
REM ===========================================================================
setlocal enabledelayedexpansion
set "TROUVE="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":4610 .*LISTENING"') do (
  echo %%p| findstr /R /C:"^[0-9][0-9]*$" >nul && (
    echo Arret du serveur du pilotage ^(pid %%p^) — le superviseur le relance en 2 s...
    taskkill /PID %%p /F >nul 2>&1
    set "TROUVE=%%p"
  )
)
if not defined TROUVE (
  echo Aucun serveur n ecoute sur 4610 : rien a relancer. Si le pilotage doit tourner, lance Lancer-Pilotage.cmd.
  goto :fin
)
timeout /t 4 /nobreak >nul
netstat -ano | findstr /R /C:":4610 .*LISTENING" >nul 2>&1 && (
  echo Serveur relance ^(port 4610 de nouveau en ecoute^).
) || (
  echo ATTENTION : rien n ecoute encore sur 4610. Le superviseur tourne-t-il ? ^(data\supervise.pid, page Sources^)
)
:fin
endlocal
