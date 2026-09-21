# Usage : powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rester-eveille.ps1 <minutes>
# Lancer AVANT une campagne `charge-realiste` : les essais du 20/09 sont morts de la veille du poste.
# Empêche la mise en veille du poste PENDANT une campagne de charge (demande
# transitoire, comme un lecteur vidéo) ; ne modifie aucun réglage d'alimentation.
Add-Type -Namespace Passio -Name Veille -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$continu = [uint32]::Parse("2147483648")                 # ES_CONTINUOUS
$eveille = [uint32]::Parse("2147483713")                 # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
$dureeMin = if ($args.Count -ge 1) { [int]$args[0] } else { 60 }
$fin = (Get-Date).AddMinutes($dureeMin)
while ((Get-Date) -lt $fin) {
  [Passio.Veille]::SetThreadExecutionState($eveille) | Out-Null
  Start-Sleep -Seconds 30
}
[Passio.Veille]::SetThreadExecutionState($continu) | Out-Null
