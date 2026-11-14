# Start (or update) the self-hosted SmartKitchen stack on Windows. Guide: docs/deploy/self-host.md
#   .\scripts\self-host-start.ps1             pull the latest images, then start
#   .\scripts\self-host-start.ps1 -SkipPull   start with images already on this machine (built locally)
param(
  [switch]$SkipPull,
  [int]$TimeoutSeconds = 300
)
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
$composeArgs = @("compose", "-p", "smartkitchen", "-f", "docker-compose.prod.yml")
$gatewayHealthUrl = "http://127.0.0.1:4000/health"

if (-not (Test-Path ".env")) {
  Write-Error "Missing .env. Copy .env.example to .env and fill in the secrets first."
}

if (-not $SkipPull) {
  & docker @composeArgs pull
  if ($LASTEXITCODE -ne 0) { throw "docker compose pull failed" }
}
& docker @composeArgs up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host "Waiting for gateway at $gatewayHealthUrl (up to ${TimeoutSeconds}s)..."
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ($true) {
  try {
    Invoke-WebRequest -Uri $gatewayHealthUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
    break
  } catch {
    if ((Get-Date) -ge $deadline) { throw "Gateway did not become healthy in ${TimeoutSeconds}s. Check: docker $($composeArgs -join ' ') ps" }
    Start-Sleep -Seconds 3
  }
}
Write-Host "SmartKitchen is up."
