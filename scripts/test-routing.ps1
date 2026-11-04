$ErrorActionPreference = "SilentlyContinue"
$passed = 0
$total = 13

function Test-Route {
    param([string]$Label, [string]$Url, [int]$ExpectedStatus, [string]$ExpectedBody)
    $response = $null
    $status = $null
    $body = ""
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        $status = [int]$response.StatusCode
        $body = $response.Content
    } catch {
        $errorResponse = $_.Exception.Response
        if ($null -ne $errorResponse) {
            $status = [int]$errorResponse.StatusCode
            $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
            $body = $reader.ReadToEnd()
            $reader.Dispose()
            if ([string]::IsNullOrWhiteSpace($body)) {
                $body = curl.exe --silent --show-error --max-time 5 $Url 2>$null
            }
        }
    }

    if ($null -ne $status -and $status -eq $ExpectedStatus -and $body -like "*$ExpectedBody*") {
        Write-Host "PASS $Label" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "FAIL $Label (HTTP $(if ($null -ne $status) { $status } else { 'unreachable' }))" -ForegroundColor Red
    }
}

Test-Route "aggregate health" "http://localhost:4000/api/health" 200 '"status":"OK"'
foreach ($prefix in @("auth", "families", "inventory", "nutrition", "meal-diary", "recipes", "menus", "shopping-list", "payments", "notifications", "admin")) {
    Test-Route "$prefix health" "http://localhost:4000/api/$prefix/health" 200 '"status":"OK"'
}
Test-Route "unknown prefix" "http://localhost:4000/api/unknown-prefix/x" 404 "ROUTE_NOT_FOUND"

Write-Host "`n$passed/$total Routes Verified"
if ($passed -ne $total) { exit 1 }