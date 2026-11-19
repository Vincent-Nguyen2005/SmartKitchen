param(
    [string]$GatewayUrl = "https://jolliness-jackal-twilight.ngrok-free.dev",
    [switch]$ConfigureOnly
)

$ErrorActionPreference = "Stop"

try {
    $gatewayUri = $null
    if (-not [Uri]::TryCreate($GatewayUrl, [UriKind]::Absolute, [ref]$gatewayUri) -or
        $gatewayUri.Scheme -notin @("http", "https") -or
        $gatewayUri.UserInfo -or
        $gatewayUri.Query -or
        $gatewayUri.Fragment -or
        $gatewayUri.AbsolutePath -ne "/") {
        throw "GatewayUrl must be an HTTP(S) origin without a path, query, or credentials."
    }

    $baseUrl = $gatewayUri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
    $mobileDirectory = Join-Path $PSScriptRoot "apps\mobile"
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

    foreach ($fileName in @(".env", ".env.local")) {
        $environmentPath = Join-Path $mobileDirectory $fileName
        $lines = New-Object 'System.Collections.Generic.List[string]'

        if (Test-Path -LiteralPath $environmentPath) {
            foreach ($line in [System.IO.File]::ReadAllLines($environmentPath)) {
                if ($line -notmatch '^\s*EXPO_PUBLIC_(API_BASE_URL|AUTH_API_URL|FAMILY_API_URL)\s*=') {
                    $lines.Add($line)
                }
            }
        }

        $lines.Add("EXPO_PUBLIC_API_BASE_URL=$baseUrl")
        [System.IO.File]::WriteAllText(
            $environmentPath,
            (($lines -join [Environment]::NewLine) + [Environment]::NewLine),
            $utf8WithoutBom
        )
        Write-Host "Configured gateway in $environmentPath" -ForegroundColor Green
    }

    try {
        $health = Invoke-WebRequest -Uri "$baseUrl/health" -Headers @{ "ngrok-skip-browser-warning" = "1" } -TimeoutSec 10
        if ($health.StatusCode -ne 200) {
            Write-Warning "Gateway health returned HTTP $($health.StatusCode)."
        }
    }
    catch {
        Write-Warning "Gateway health check failed. Check the gateway and tunnel before signing in: $baseUrl/health"
    }

    if ($ConfigureOnly) {
        return
    }

    Set-Location -LiteralPath $mobileDirectory
    Write-Host "Starting Expo Go development server..." -ForegroundColor Green
    & pnpm.cmd exec expo start --clear
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
catch {
    Write-Error $_
    exit 1
}
