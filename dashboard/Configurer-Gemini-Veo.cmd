@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configurer-Gemini-Veo.ps1"
set CODE=%ERRORLEVEL%
if not "%CODE%"=="0" (
  echo.
  echo Configuration incomplete. Code: %CODE%
  pause
  exit /b %CODE%
)
echo.
echo Configuration Gemini / Veo terminee.
pause
