$ErrorActionPreference = "SilentlyContinue"
$passed = 0
$total = 12

foreach ($port in 4000..4011) {
    $response = $null
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 5
    } catch { }

    if ($null -ne $response -and $response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"OK"') {
        Write-Host "PASS port $port" -ForegroundColor Green
        $passed++
    } else {
        $status = if ($null -ne $response) { $response.StatusCode } else { "unreachable" }
        Write-Host "FAIL port $port (HTTP $status)" -ForegroundColor Red
    }
}

Write-Host "`n$passed/$total Services Operational"
if ($passed -ne $total) { exit 1 }