@echo off
chcp 65001 >nul
REM Arrête le superviseur ET le serveur du centre de pilotage.
REM (Le démarrage automatique reste installé : au prochain ouverture de session,
REM  tout repart. Pour le désinstaller : Installer-Demarrage-Auto.cmd /retirer)
setlocal
set "PIDF=%~dp0data\supervise.pid"

if exist "%PIDF%" (
  set /p SUPPID=<"%PIDF%"
  echo Arret du superviseur (pid %SUPPID%)...
  taskkill /PID %SUPPID% /T /F >nul 2>&1
  del "%PIDF%" >nul 2>&1
) else (
  echo Aucun superviseur enregistre.
)

REM Filet : tout processus node qui tient encore le port 4610.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4610" ^| findstr "LISTENING"') do (
  echo Liberation du port 4610 (pid %%p)...
  taskkill /PID %%p /T /F >nul 2>&1
)

echo Centre de pilotage arrete.
endlocal
