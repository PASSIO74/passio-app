# Crée (ou recrée) le raccourci Bureau « Centre de pilotage » avec le logo PASSIO.
# Le Bureau affiche alors le logo (flèche violette) avec « Centre de pilotage » écrit dessous.
# Depuis le 2026-11-04, il ouvre LE centre de pilotage, en ligne : rien à lancer, aucun
# mot de passe du poste. Il menait à l'atelier technique (Lancer-Pilotage.cmd, 30 vues),
# qui reste disponible : double-clic sur Lancer-Pilotage.cmd dans ce dossier.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $here 'assets\passio.ico'
$ancien = Join-Path $desktop 'Centre de pilotage.lnk'
if (Test-Path -LiteralPath $ancien) { Remove-Item -LiteralPath $ancien }
$lignes = @('[InternetShortcut]', 'URL=https://passio-app.netlify.app/pilotage/', "IconFile=$ico", 'IconIndex=0')
Set-Content -LiteralPath (Join-Path $desktop 'Centre de pilotage.url') -Value $lignes -Encoding ASCII
Write-Host "Raccourci 'Centre de pilotage' cree sur le Bureau : il ouvre le pilotage en ligne."
