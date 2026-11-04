$ErrorActionPreference = "Stop"

$ignoredInterfacePattern = '(?i)(virtualbox|docker|vmware|loopback|hyper-v|vethernet|wsl|vpn)'
$wirelessInterfacePattern = '(?i)(wi[\s-]?fi|wireless|wlan)'

function Get-ValidIpv4Addresses {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        $Adapters
    )

    foreach ($adapter in $Adapters) {
        $addresses = @(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.AddressState -eq "Preferred" -and
                $_.IPAddress -notmatch '^(127\.|169\.254\.|0\.|255\.)' -and
                $_.IPAddress -ne "255.255.255.255"
            })

        if ($addresses.Count -eq 0) {
            continue
        }

        $configuration = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
        $hasDefaultGateway = $null -ne $configuration -and $null -ne $configuration.IPv4DefaultGateway

        foreach ($address in $addresses) {
            [PSCustomObject]@{
                IPAddress      = $address.IPAddress
                HasGateway     = $hasDefaultGateway
                InterfaceAlias = $adapter.Name
                InterfaceIndex = $adapter.ifIndex
                InterfaceMetric = $adapter.InterfaceMetric
            }
        }
    }
}

try {
    $adapters = @(Get-NetAdapter -ErrorAction Stop |
        Where-Object {
            $_.Status -eq "Up" -and
            "$($_.Name) $($_.InterfaceDescription)" -notmatch $ignoredInterfacePattern
        })

    $wirelessAdapters = @($adapters | Where-Object {
        "$($_.Name) $($_.InterfaceDescription)" -match $wirelessInterfacePattern
    })

    $candidates = @(Get-ValidIpv4Addresses -Adapters $wirelessAdapters)
    if ($candidates.Count -eq 0) {
        Write-Host "Wi-Fi adapter not identified by name; checking active non-virtual network adapters." -ForegroundColor Yellow
        $candidates = @(Get-ValidIpv4Addresses -Adapters $adapters)
    }

    if ($candidates.Count -eq 0) {
        throw "No active Wi-Fi or LAN IPv4 address was found. Connect the computer to the phone hotspot and retry."
    }

    $selectedAddress = $candidates |
        Sort-Object @{ Expression = { if ($_.HasGateway) { 0 } else { 1 } } }, InterfaceMetric |
        Select-Object -First 1
    $detectedIp = $selectedAddress.IPAddress
    Write-Host "Detected IP: $detectedIp ($($selectedAddress.InterfaceAlias))" -ForegroundColor Green

    $mobileDirectory = Join-Path $PSScriptRoot "apps\mobile"
    $environment = @{
        EXPO_PUBLIC_AUTH_API_URL = "http://${detectedIp}:4001/api/auth"
        EXPO_PUBLIC_FAMILY_API_URL = "http://${detectedIp}:4002/api/family"
    }
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    $environmentLines = @(
        "EXPO_PUBLIC_AUTH_API_URL=$($environment.EXPO_PUBLIC_AUTH_API_URL)"
        "EXPO_PUBLIC_FAMILY_API_URL=$($environment.EXPO_PUBLIC_FAMILY_API_URL)"
    )
    $environmentPath = Join-Path $mobileDirectory ".env"
    [System.IO.File]::WriteAllText(
        $environmentPath,
        (($environmentLines -join [Environment]::NewLine) + [Environment]::NewLine),
        $utf8WithoutBom
    )
    Write-Host "Updated .env file: $environmentPath" -ForegroundColor Green

    # Expo loads .env.local after .env, so keep these API URLs in sync when it exists.
    $localEnvironmentPath = Join-Path $mobileDirectory ".env.local"
    if (Test-Path -LiteralPath $localEnvironmentPath) {
        $updatedLocalLines = New-Object 'System.Collections.Generic.List[string]'
        $writtenKeys = @{}

        foreach ($line in [System.IO.File]::ReadAllLines($localEnvironmentPath)) {
            if ($line -match '^\s*(EXPO_PUBLIC_AUTH_API_URL|EXPO_PUBLIC_FAMILY_API_URL)\s*=') {
                $key = $matches[1]
                if (-not $writtenKeys.ContainsKey($key)) {
                    $updatedLocalLines.Add("$key=$($environment[$key])")
                    $writtenKeys[$key] = $true
                }
            }
            else {
                $updatedLocalLines.Add($line)
            }
        }

        foreach ($key in $environment.Keys) {
            if (-not $writtenKeys.ContainsKey($key)) {
                $updatedLocalLines.Add("$key=$($environment[$key])")
            }
        }

        [System.IO.File]::WriteAllText(
            $localEnvironmentPath,
            (($updatedLocalLines -join [Environment]::NewLine) + [Environment]::NewLine),
            $utf8WithoutBom
        )
        Write-Host "Synchronized Expo API URLs in .env.local." -ForegroundColor Green
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
