@echo off
chcp 65001 >nul
title Passio - Pilotage sur le telephone
rem ---------------------------------------------------------------------------
rem  Rend le centre de pilotage joignable depuis ton telephone (meme Wi-Fi).
rem  1) ouvre le port 4610 dans le pare-feu Windows, reseaux PRIVES seulement
rem     (jamais sur un Wi-Fi public : profil "private" uniquement) ;
rem  2) affiche l'adresse a taper sur le telephone.
rem  A lancer UNE fois. Il demande les droits administrateur (pare-feu).
rem ---------------------------------------------------------------------------
set "PORT=4610"

net session >nul 2>nul
if errorlevel 1 (
  echo Demande des droits administrateur pour le pare-feu...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

netsh advfirewall firewall delete rule name="Passio Pilotage (telephone)" >nul 2>nul
netsh advfirewall firewall add rule name="Passio Pilotage (telephone)" dir=in action=allow protocol=TCP localport=%PORT% profile=private >nul
if errorlevel 1 (
  echo   Impossible de creer la regle de pare-feu.
  pause
  exit /b 1
)

echo.
echo   ===============================================================
echo    Pare-feu : port %PORT% ouvert sur les reseaux PRIVES.
echo.
echo    Sur ton telephone (connecte au MEME Wi-Fi), ouvre :
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo        http://%%b:%PORT%/mobile.html
)
echo.
echo    Puis : iPhone = Partager ^> "Sur l'ecran d'accueil"
echo           Android = menu ^> "Ajouter a l'ecran d'accueil"
echo.
echo    Si ton Wi-Fi est marque "Public" dans Windows, passe-le en "Prive"
echo    (Parametres ^> Reseau ^> Wi-Fi ^> ton reseau ^> Profil reseau).
echo   ===============================================================
echo.
pause
