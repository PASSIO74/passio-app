param(
  [string]$ProjectId = "",
  [string]$BillingAccount = "",
  [string]$BucketName = "",
  [string]$Location = "us-central1"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Step([string]$Message) {
  Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  throw $Message
}

function Resolve-Gcloud {
  $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { $cmd = Get-Command gcloud -ErrorAction SilentlyContinue }
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}

function Run-Gcloud {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  & $script:Gcloud @Args
  if ($LASTEXITCODE -ne 0) {
    Fail "gcloud a echoue: gcloud $($Args -join ' ')"
  }
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = @(Get-Content -LiteralPath $Path -ErrorAction Stop)
  $prefix = "$Key="
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith($prefix)) {
      $lines[$i] = "$Key=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines += "$Key=$Value" }
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

Step "Detection de Google Cloud CLI"
$script:Gcloud = Resolve-Gcloud
if (-not $script:Gcloud) {
  Write-Host "Google Cloud CLI absent. Installation automatique..."
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    & $winget.Source install --id Google.CloudSDK -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Fail "Installation Google Cloud CLI via winget impossible." }
  } else {
    $installer = Join-Path $env:TEMP "GoogleCloudSDKInstaller.exe"
    (New-Object Net.WebClient).DownloadFile(
      "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe",
      $installer
    )
    Start-Process -FilePath $installer -ArgumentList "/S" -Wait
  }
  $script:Gcloud = Resolve-Gcloud
  if (-not $script:Gcloud) {
    Fail "Google Cloud CLI vient d'etre installe mais n'est pas encore visible. Ferme puis relance ce fichier une fois."
  }
}
Write-Host "gcloud: $script:Gcloud"
& $script:Gcloud --version | Select-Object -First 3

Step "Authentification Google"
$active = (& $script:Gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null | Select-Object -First 1).Trim()
if (-not $active) {
  Write-Host "Une fenetre Google va s'ouvrir. Connecte le compte qui doit posseder Passio/Veo."
  Run-Gcloud auth login --update-adc
  $active = (& $script:Gcloud auth list --filter="status:ACTIVE" --format="value(account)" | Select-Object -First 1).Trim()
} else {
  Write-Host "Compte Google deja connecte: $active"
  try { Run-Gcloud auth application-default set-quota-project ($ProjectId) 2>$null } catch {}
}
if (-not $active) { Fail "Aucun compte Google actif apres authentification." }

Step "Creation ou selection du projet Google Cloud Passio"
if (-not $ProjectId) {
  $stamp = Get-Date -Format "yyMMdd"
  $rand = Get-Random -Minimum 100000 -Maximum 999999
  $ProjectId = "passio-veo-$stamp-$rand".ToLowerInvariant()
}
if ($ProjectId -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$') {
  Fail "ProjectId invalide: $ProjectId"
}

& $script:Gcloud projects describe $ProjectId --format="value(projectId)" *> $null
if ($LASTEXITCODE -ne 0) {
  Run-Gcloud projects create $ProjectId --name="Passio Veo"
  Write-Host "Projet cree: $ProjectId"
} else {
  Write-Host "Projet existant: $ProjectId"
}

Step "Facturation Google Cloud"
$linked = (& $script:Gcloud billing projects describe $ProjectId --format="value(billingAccountName)" 2>$null | Select-Object -First 1).Trim()
if (-not $linked) {
  if (-not $BillingAccount) {
    $json = & $script:Gcloud billing accounts list --filter="open=true" --format=json
    if ($LASTEXITCODE -ne 0) { Fail "Impossible de lister les comptes de facturation." }
    $accounts = @($json | ConvertFrom-Json)
    if ($accounts.Count -eq 0) {
      Write-Host "Aucun compte de facturation actif n'est accessible a $active." -ForegroundColor Yellow
      Write-Host "Google exige une facturation active pour Vertex AI. Ouvre la console Billing, active un compte, puis relance ce fichier." -ForegroundColor Yellow
      Start-Process "https://console.cloud.google.com/billing?project=$ProjectId"
      exit 2
    }
    if ($accounts.Count -eq 1) {
      $BillingAccount = [string]$accounts[0].name -replace '^billingAccounts/', ''
    } else {
      Write-Host "Plusieurs comptes de facturation sont accessibles. Choisis celui qui doit payer les generations Veo:" -ForegroundColor Yellow
      for ($i = 0; $i -lt $accounts.Count; $i++) {
        $id = [string]$accounts[$i].name -replace '^billingAccounts/', ''
        Write-Host "[$($i + 1)] $($accounts[$i].displayName)  ($id)"
      }
      $choice = [int](Read-Host "Numero")
      if ($choice -lt 1 -or $choice -gt $accounts.Count) { Fail "Choix de facturation invalide." }
      $BillingAccount = [string]$accounts[$choice - 1].name -replace '^billingAccounts/', ''
    }
  }
  Run-Gcloud billing projects link $ProjectId --billing-account=$BillingAccount
  Write-Host "Facturation liee au projet."
} else {
  Write-Host "Facturation deja active: $linked"
}

Step "Activation des API Vertex AI et Cloud Storage"
Run-Gcloud services enable aiplatform.googleapis.com storage.googleapis.com serviceusage.googleapis.com --project=$ProjectId --quiet

Step "Creation du bucket video Passio"
if (-not $BucketName) { $BucketName = "$ProjectId-media".ToLowerInvariant() }
if ($BucketName -notmatch '^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$') { Fail "Nom de bucket invalide: $BucketName" }

& $script:Gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
  & $script:Gcloud storage buckets create "gs://$BucketName" --project=$ProjectId --location=$Location --uniform-bucket-level-access
  if ($LASTEXITCODE -ne 0) {
    $BucketName = "$ProjectId-media-$(Get-Random -Minimum 1000 -Maximum 9999)".ToLowerInvariant()
    Run-Gcloud storage buckets create "gs://$BucketName" --project=$ProjectId --location=$Location --uniform-bucket-level-access
  }
}
Write-Host "Bucket: gs://$BucketName/veo/"

Step "Configuration locale Passio"
$dashboard = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $dashboard ".env"
$envExample = Join-Path $dashboard ".env.example"
if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExample)) { Fail ".env.example introuvable." }
  Copy-Item $envExample $envFile
}
Set-DotEnvValue $envFile "GOOGLE_CLOUD_PROJECT" $ProjectId
Set-DotEnvValue $envFile "GOOGLE_CLOUD_LOCATION" $Location
Set-DotEnvValue $envFile "PASSIO_VEO_MODEL" "veo-3.1-generate-001"
Set-DotEnvValue $envFile "PASSIO_VEO_FAST_MODEL" "veo-3.1-fast-generate-001"
Set-DotEnvValue $envFile "PASSIO_VEO_OUTPUT_GCS_URI" "gs://$BucketName/veo/"

Run-Gcloud config set project $ProjectId --quiet
try { Run-Gcloud auth application-default set-quota-project $ProjectId --quiet } catch {
  Write-Host "ADC quota project non modifie; le connecteur Passio utilise gcloud auth print-access-token et reste fonctionnel." -ForegroundColor Yellow
}

Step "Verification finale"
$token = (& $script:Gcloud auth print-access-token 2>$null | Select-Object -First 1).Trim()
if (-not $token) { Fail "Impossible d'obtenir un jeton Google Cloud." }
Run-Gcloud services list --enabled --project=$ProjectId --filter="name:aiplatform.googleapis.com" --format="value(name)"
Run-Gcloud storage ls "gs://$BucketName" --project=$ProjectId

$dataDir = Join-Path $dashboard "data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$report = [ordered]@{
  configuredAt = (Get-Date).ToUniversalTime().ToString("o")
  projectId = $ProjectId
  location = $Location
  outputGcsUri = "gs://$BucketName/veo/"
  model = "veo-3.1-generate-001"
  fastModel = "veo-3.1-fast-generate-001"
  account = $active
}
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir "veo-setup.json") -Encoding UTF8

Write-Host "`nGEMINI / VEO EST CONFIGURE POUR PASSIO" -ForegroundColor Green
Write-Host "Projet : $ProjectId"
Write-Host "Sortie : gs://$BucketName/veo/"
Write-Host "Config : $envFile"
Write-Host "`nPour generer une video depuis dashboard/:"
Write-Host 'npm run veo -- --prompt "A cinematic Passio teaser..." --vertical --fast --duration 8'
