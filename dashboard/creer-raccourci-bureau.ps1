# Crée (ou recrée) le raccourci Bureau « Centre de pilotage » avec le logo PASSIO.
# Le Bureau affiche alors le logo (flèche violette) avec « Centre de pilotage » écrit dessous.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $here 'assets\passio.ico'
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desktop 'Centre de pilotage.lnk'))
$lnk.TargetPath       = (Join-Path $here 'Lancer-Pilotage.cmd')
$lnk.WorkingDirectory = $here
$lnk.IconLocation     = "$ico,0"
$lnk.Description       = 'Centre de pilotage Passio - supervision temps reel'
$lnk.Save()
Write-Host "Raccourci 'Centre de pilotage' cree sur le Bureau (logo PASSIO)."
