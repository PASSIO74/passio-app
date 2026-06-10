@echo off
setlocal

set URL=https://passio-app.netlify.app
set SHORTCUT=%USERPROFILE%\Desktop\PASSIO.lnk
set ICON=%USERPROFILE%\Desktop\PASSIO\icon-512.png

:: Cherche Chrome ou Edge
set BROWSER=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe

if not defined BROWSER (
  echo Chrome ou Edge introuvable. Installe Chrome et relance ce fichier.
  pause
  exit /b
)

:: Crée le raccourci bureau avec PowerShell
powershell -NoProfile -Command ^
  "$s = (New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = '%BROWSER%';" ^
  "$s.Arguments = '--app=%URL% --window-size=430,900';" ^
  "$s.Description = 'PASSIO – Le reseau de tes passions';" ^
  "$s.WorkingDirectory = '%USERPROFILE%';" ^
  "$s.Save();"

echo.
echo PASSIO installe sur ton bureau !
echo Double-clique sur l'icone PASSIO pour lancer l'app.
echo.
pause
