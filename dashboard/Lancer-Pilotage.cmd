@echo off
chcp 65001 >nul
title Passio - Centre de pilotage
cd /d "%~dp0"
setlocal enabledelayedexpansion

set "PORT=4610"
set "URL=http://localhost:%PORT%"

rem --- Un process ecoute-t-il deja sur le port ? On recupere son PID ---
set "HOLDER_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "HOLDER_PID=%%a"

if defined HOLDER_PID (
  rem --- Un serveur tient le port : repond-il vraiment ? (instance figee = ne s'ouvre plus) ---
  set "ALIVE="
  set "HAVE_CURL="
  where curl >nul 2>nul && set "HAVE_CURL=1"
  if defined HAVE_CURL (
    curl -s -m 4 -o nul "%URL%/api/health" && set "ALIVE=1"
  ) else (
    rem Pas de curl pour sonder : on suppose l'instance vivante.
    set "ALIVE=1"
  )

  if defined ALIVE (
    echo Le serveur tourne deja et repond. Ouverture du navigateur...
    start "" "%URL%"
    timeout /t 2 >nul
    exit /b 0
  )

  echo   Une ancienne instance ^(PID !HOLDER_PID!^) tient le port %PORT% mais ne repond plus.
  echo   Nettoyage puis redemarrage propre...
  taskkill /F /PID !HOLDER_PID! >nul 2>nul
  timeout /t 1 >nul
)

rem --- Node installe ? ---
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js est requis. Installe-le depuis https://nodejs.org puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

rem --- Premiere utilisation : installation des dependances ---
if not exist "node_modules" (
  echo   Premiere utilisation : installation des dependances ^(1 minute^)...
  call npm install --no-audit --no-fund
)

echo.
echo   ===============================================
echo    PASSIO - Centre de pilotage
echo    Le navigateur va s'ouvrir automatiquement.
echo    Identifiants : voir dashboard\.env
echo    Ferme cette fenetre pour ARRETER le serveur.
echo   ===============================================
echo.

set DASH_OPEN_BROWSER=1
node server/start.js
echo.
echo Serveur arrete (le process s'est termine).
echo Si ce n'etait pas voulu, lis le message d'erreur ci-dessus.
pause
