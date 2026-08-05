@echo off
rem Recree le raccourci Bureau "Centre de pilotage" avec le logo PASSIO.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0creer-raccourci-bureau.ps1"
pause
