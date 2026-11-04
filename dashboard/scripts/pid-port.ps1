# Affiche le PID du process qui ecoute sur un port TCP (rien si le port est libre).
#
# Pourquoi pas netstat : sur Windows 11 build 26300 (poste du 2026-11-04),
# `netstat -ano` n'affiche plus la ligne LISTENING de [::]:4610 alors que le
# serveur ecoute et repond. Les lanceurs concluaient "port libre" et demarraient
# un second serveur, qui mourait aussitot sur EADDRINUSE.
# Get-NetTCPConnection voit cette socket, mais avec un etat VIDE sur ce build :
# on ne filtre donc pas sur State -eq 'Listen'. Une ecoute se reconnait a son
# port distant nul.
param([int]$Port = 4610)

Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Where-Object { $_.RemotePort -eq 0 -and $_.State -ne 'Bound' -and $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique
