@echo off
REM ===========================================================================
REM  PASSIO - Autopilote de la sentinelle : ON / OFF / ETAT.
REM
REM    Activer-Autopilote.cmd            -> allume l autopilote local
REM    Activer-Autopilote.cmd /enligne   -> allume EN PLUS la mise en ligne
REM                                         automatique (PR + auto-merge + prod)
REM    Activer-Autopilote.cmd /off       -> eteint l autopilote (la sentinelle
REM                                         continue d analyser et de PROPOSER)
REM    Activer-Autopilote.cmd /nonenligne-> eteint la seule mise en ligne auto
REM    Activer-Autopilote.cmd /etat      -> affiche l etat des cles
REM
REM  Ce que l autopilote fait : alerte -> diagnostic -> correctif ecrit dans un
REM  worktree ISOLE -> audits + tests -> fusion dans la branche locale si tout
REM  est vert, retour arriere exact sinon.
REM  Ce qu il ne fait PAS, et ne peut pas faire : deployer en production.
REM
REM  ASCII pur volontairement (compatibilite cmd.exe).
REM ===========================================================================
setlocal
set "DASH=%~dp0"
cd /d "%DASH%"

where node >nul 2>&1 || goto :nonode
if not exist "%DASH%.env" goto :noenv

if /I "%~1"=="/off"  ( node scripts\autopilote.mjs off  & goto :fin )
if /I "%~1"=="/etat" ( node scripts\autopilote.mjs etat & goto :fin )
if /I "%~1"=="/nonenligne" ( node scripts\autopilote.mjs production-off & goto :redemarre )
if /I "%~1"=="/enligne" (
  node scripts\autopilote.mjs production-on
  if errorlevel 1 goto :fin
  goto :redemarre
)

node scripts\autopilote.mjs on
if errorlevel 1 goto :fin

:redemarre
echo.
echo  Redemarrage du pilotage pour prise en compte...
call "%DASH%Arreter-Pilotage.cmd" >nul 2>&1
start "" wscript.exe "%DASH%Sentinelle-Demarrage.vbs"
echo  OK : http://localhost:4610
goto :fin

:nonode
echo  ERREUR : Node.js est introuvable. Installe-le puis relance.
goto :fin

:noenv
echo  ERREUR : dashboard\.env est introuvable.
echo  Copie .env.example en .env, renseigne-le, puis relance.
goto :fin

:fin
echo.
pause
endlocal
