@echo off
chcp 65001 >nul
REM ═══════════════════════════════════════════════════════════════════════════
REM  Installe (ou retire) le démarrage automatique du centre de pilotage.
REM  Aucun droit administrateur : on dépose simplement un raccourci dans le
REM  dossier Démarrage de TA session Windows. Rien n'est touché dans le système.
REM
REM    Installer-Demarrage-Auto.cmd            -> installe
REM    Installer-Demarrage-Auto.cmd /retirer   -> retire
REM ═══════════════════════════════════════════════════════════════════════════
setlocal
set "ICI=%~dp0"
set "DEMARRAGE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "CIBLE=%DEMARRAGE%\Passio - Centre de pilotage.lnk"

if /I "%~1"=="/retirer" goto :retirer

echo Installation du demarrage automatique...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut('%CIBLE%'); $l.TargetPath='wscript.exe'; $l.Arguments='\"%ICI%Sentinelle-Demarrage.vbs\"'; $l.WorkingDirectory='%ICI%'; $l.Description='Centre de pilotage Passio - sentinelle permanente'; $l.Save()"

if exist "%CIBLE%" (
  echo.
  echo   OK : le centre de pilotage demarrera a chaque ouverture de session.
  echo   Raccourci : %CIBLE%
  echo.
  echo   Lancement immediat...
  start "" wscript.exe "%ICI%Sentinelle-Demarrage.vbs"
  echo   Ouvre http://localhost:4610
) else (
  echo   ECHEC : le raccourci n a pas pu etre cree.
)
goto :fin

:retirer
if exist "%CIBLE%" (
  del "%CIBLE%"
  echo   Demarrage automatique retire.
) else (
  echo   Rien a retirer : le demarrage automatique n etait pas installe.
)

:fin
endlocal
