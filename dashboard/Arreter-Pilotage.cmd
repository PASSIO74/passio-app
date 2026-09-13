@echo off
REM ===========================================================================
REM  Arrete le superviseur ET le serveur du centre de pilotage.
REM  Le demarrage automatique reste installe : tout repart a la prochaine
REM  ouverture de session. Pour le desinstaller :
REM      Installer-Demarrage-Auto.cmd /retirer
REM  (ASCII pur : voir la note dans Installer-Demarrage-Auto.cmd)
REM
REM  Revue du 2026-09-13 : le script annoncait "arrete" sans verifier.
REM   - Un superviseur sans fichier PID (disque plein a son demarrage, fichier
REM     efface, double lancement) survivait et relancait le serveur 2 s apres.
REM     On tue desormais TOUS les "node ... supervise.mjs" de ce dossier, par
REM     leur ligne de commande (wmic n existe plus sur Windows 11 24H2 :
REM     PowerShell + CIM).
REM   - Le filet du port 4610 etait trop large (":4610" matchait aussi ":46100"
REM     ou un port distant) : motif strict, et on ne tue jamais un pid non
REM     numerique.
REM   - A la fin, on VERIFIE : plus aucun superviseur, plus rien sur 4610.
REM ===========================================================================
setlocal enabledelayedexpansion
set "DASH=%~dp0"
set "PIDF=%DASH%data\supervise.pid"

if exist "%PIDF%" (
  set /p SUPPID=<"%PIDF%"
  echo !SUPPID!| findstr /R /C:"^[0-9][0-9]*$" >nul && (
    echo Arret du superviseur enregistre ^(pid !SUPPID!^)...
    taskkill /PID !SUPPID! /T /F >nul 2>&1
  )
  del "%PIDF%" >nul 2>&1
)

REM Tous les superviseurs de CE dossier, meme sans fichier PID.
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*supervise.mjs*' -and $_.CommandLine -like '*%DASH:~0,-1%*' } | Select-Object -ExpandProperty ProcessId"`) do (
  echo Arret d un superviseur survivant ^(pid %%p^)...
  taskkill /PID %%p /T /F >nul 2>&1
)

REM Filet : ce qui ecoute encore sur 4610 (motif strict : ":4610 " suivi de LISTENING).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":4610 .*LISTENING"') do (
  echo %%p| findstr /R /C:"^[0-9][0-9]*$" >nul && (
    echo Liberation du port 4610 ^(pid %%p^)...
    taskkill /PID %%p /T /F >nul 2>&1
  )
)

REM Verification : rien ne doit survivre.
timeout /t 1 /nobreak >nul
set "RESTE="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*supervise.mjs*' -and $_.CommandLine -like '*%DASH:~0,-1%*' } | Select-Object -ExpandProperty ProcessId"`) do set "RESTE=%%p"
netstat -ano | findstr /R /C:":4610 .*LISTENING" >nul 2>&1 && set "RESTE=port"
if defined RESTE (
  echo ATTENTION : quelque chose survit encore ^(%RESTE%^). Relance ce script, ou regarde le Gestionnaire des taches.
) else (
  echo Centre de pilotage arrete ^(verifie : aucun superviseur, port 4610 libre^).
)
endlocal
