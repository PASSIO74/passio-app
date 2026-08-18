@echo off
REM ===========================================================================
REM  Active le canal local PASSIO : ChatGPT -> GitHub -> Claude Code + Codex.
REM  A lancer UNE FOIS par double-clic depuis la session Windows de Benjamin.
REM  ASCII pur volontairement (compatibilite cmd.exe).
REM ===========================================================================
setlocal
set "DASH=%~dp0"
for %%I in ("%DASH%..") do set "REPO=%%~fI"

echo.
echo  PASSIO - Activation Claude Code + Codex
echo  ========================================
echo.

where git >nul 2>&1 || goto :nogit
where claude >nul 2>&1 || goto :noclaude
where codex >nul 2>&1 || goto :nocodex

echo [1/4] Synchronisation du depot...
cd /d "%REPO%"
git fetch origin main
if errorlevel 1 goto :gitfail
git pull --ff-only origin main
if errorlevel 1 goto :gitdirty

echo [2/4] Verification Claude Code...
REM Sur Windows, claude installe par npm est souvent claude.cmd. Sans CALL,
REM l execution transfere le controle au shim et ce script ne reprend jamais.
call claude auth status > "%TEMP%\passio-claude-status.txt" 2>&1
if errorlevel 1 goto :claudeauth
findstr /I /C:"\"loggedIn\":true" /C:"\"loggedIn\": true" "%TEMP%\passio-claude-status.txt" >nul 2>&1
if errorlevel 1 goto :claudeauth

echo [3/4] Verification Codex...
REM Meme precaution pour codex.cmd.
call codex login status > "%TEMP%\passio-codex-status.txt" 2>&1
if errorlevel 1 goto :codexauth
findstr /I /C:"not logged in" /C:"unauthorized" "%TEMP%\passio-codex-status.txt" >nul 2>&1
if not errorlevel 1 goto :codexauth

echo [4/4] Redemarrage du pilotage + worker IA...
call "%DASH%Arreter-Pilotage.cmd" >nul 2>&1
start "" wscript.exe "%DASH%Sentinelle-Demarrage.vbs"

echo.
echo  OK - canal local active.
echo  Claude Code standard : connecte
echo  Codex : connecte
echo  Worker : dashboard\aiworker.mjs
echo.
echo  Tu peux maintenant donner les consignes dans ChatGPT.
echo  Elles passeront par les deux agents avant resultat.
echo.
pause
goto :end

:nogit
echo ERREUR : git introuvable dans PATH.
goto :fail

:noclaude
echo ERREUR : Claude Code introuvable dans PATH.
echo Installer/ouvrir Claude Code puis relancer ce fichier.
goto :fail

:nocodex
echo ERREUR : Codex introuvable dans PATH.
echo Installer Codex puis relancer ce fichier.
goto :fail

:claudeauth
echo.
echo Claude Code est installe mais la session n'est pas connectee.
echo Lance dans un terminal : claude auth login
echo Puis relance ce fichier.
goto :fail

:codexauth
echo.
echo Codex est installe mais la session n'est pas connectee.
echo Lance dans un terminal : codex login
echo Choisis Sign in with ChatGPT, puis relance ce fichier.
goto :fail

:gitdirty
echo.
echo Synchronisation refusee par git pull --ff-only.
echo Aucun fichier local n'a ete ecrase.
echo Termine/commit le travail local puis relance ce fichier.
goto :fail

:gitfail
echo.
echo Impossible de joindre GitHub pour synchroniser le depot.
goto :fail

:fail
echo.
echo Activation non terminee. Rien de destructif n'a ete fait.
echo.
pause

:end
del "%TEMP%\passio-claude-status.txt" >nul 2>&1
del "%TEMP%\passio-codex-status.txt" >nul 2>&1
endlocal
