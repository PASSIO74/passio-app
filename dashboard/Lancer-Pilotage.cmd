@echo off
chcp 65001 >nul
title Passio - Centre de pilotage
cd /d "%~dp0"

rem --- Deja demarre ? On ouvre juste le navigateur ---
netstat -ano | findstr ":4610" | findstr LISTENING >nul 2>nul
if %errorlevel%==0 (
  echo Le serveur tourne deja. Ouverture du navigateur...
  start "" http://localhost:4610
  timeout /t 2 >nul
  exit /b 0
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
node server/index.js
echo.
echo Serveur arrete.
pause
