@echo off
REM ===========================================================================
REM  PASSIO - Reconnecter Claude Code pour le centre de pilotage.
REM
REM    Connecter-Claude.cmd          -> connexion (une page web s ouvre) + verif
REM    Connecter-Claude.cmd /etat    -> verification seule
REM
REM  A utiliser quand le pilotage affiche "Claude Code deconnecte" ou
REM  "CLI installee mais non connectee". Il n y a RIEN a redemarrer ensuite :
REM  le pilotage re-sonde la connexion toutes les minutes tant qu elle manque.
REM
REM  Pourquoi ce fichier plutot que "claude auth login" dans un terminal :
REM  si dashboard\.env isole les identifiants du pilotage
REM  (DASH_CLAUDE_CONFIG_DIR), un login fait ailleurs ne le reconnecte pas.
REM  Ce script utilise toujours le bon dossier.
REM
REM  ASCII pur volontairement (compatibilite cmd.exe).
REM ===========================================================================
setlocal
set "DASH=%~dp0"
cd /d "%DASH%"

where node >nul 2>&1 || goto :nonode

if /I "%~1"=="/etat" ( node scripts\connecter-claude.mjs etat & goto :fin )
node scripts\connecter-claude.mjs
goto :fin

:nonode
echo  ERREUR : Node.js est introuvable. Installe-le puis relance.

:fin
echo.
pause
endlocal
