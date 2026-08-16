@echo off
REM ===========================================================================
REM  Arrete le superviseur ET le serveur du centre de pilotage.
REM  Le demarrage automatique reste installe : tout repart a la prochaine
REM  ouverture de session. Pour le desinstaller :
REM      Installer-Demarrage-Auto.cmd /retirer
REM  (ASCII pur : voir la note dans Installer-Demarrage-Auto.cmd)
REM ===========================================================================
setlocal enabledelayedexpansion
set "PIDF=%~dp0data\supervise.pid"

if exist "%PIDF%" (
  set /p SUPPID=<"%PIDF%"
  echo Arret du superviseur ^(pid !SUPPID!^)...
  taskkill /PID !SUPPID! /T /F >nul 2>&1
  del "%PIDF%" >nul 2>&1
) else (
  echo Aucun superviseur enregistre.
)

REM Filet : tout processus qui tient encore le port 4610.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4610" ^| findstr "LISTENING"') do (
  echo Liberation du port 4610 ^(pid %%p^)...
  taskkill /PID %%p /T /F >nul 2>&1
)

echo Centre de pilotage arrete.
endlocal
