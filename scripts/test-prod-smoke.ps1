<#
  Read-only production smoke test. No writes, no auth, no destructive calls.
  Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-prod-smoke.ps1 -BaseUrl https://api.example.vn [-Origin https://app.example.vn] [-AllowDegraded]
  -AllowDegraded: accept /api/health 503 DEGRADED (stage 1: stage-2 services are not deployed yet).
#>
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [string]$Origin = '',
    [switch]$AllowDegraded
)
$ErrorActionPreference = 'Continue'
$BaseUrl = $BaseUrl.TrimEnd('/')
$passed = 0; $failed = 0

function Invoke-Probe([string]$Method, [string]$Path, [hashtable]$Headers = @{}) {
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -Method $Method -Headers $Headers -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = [string]$r.Content; Headers = $r.Headers }
    } catch {
        $raw = $_.Exception.Response
        if ($null -eq $raw) { return [pscustomobject]@{ Status = 0; Body = $_.Exception.Message; Headers = @{} } }
        $body = ''; try { $reader = New-Object System.IO.StreamReader($raw.GetResponseStream()); $body = $reader.ReadToEnd(); $reader.Dispose() } catch { }
        # Windows PowerShell 5.1 often consumes the error stream; the body is then in ErrorDetails.
        if ([string]::IsNullOrEmpty($body) -and $_.ErrorDetails) { $body = [string]$_.ErrorDetails.Message }
        return [pscustomobject]@{ Status = [int]$raw.StatusCode; Body = $body; Headers = $raw.Headers }
    }
}
function Check([string]$Label, [bool]$Ok, [string]$Detail = '') {
    if ($Ok) { Write-Host "PASS $Label" -ForegroundColor Green; $script:passed++ }
    else { Write-Host "FAIL $Label $Detail" -ForegroundColor Red; $script:failed++ }
}
function Has-StackTrace([string]$Body) { return $Body -match '\bat\s+\S+\s+\(.*:\d+:\d+\)' -or $Body -match 'node_modules[\\/]' }

$health = Invoke-Probe GET '/health'
Check 'gateway /health = 200' ($health.Status -eq 200) "(status $($health.Status))"

$agg = Invoke-Probe GET '/api/health'
$aggOk = ($agg.Status -eq 200) -or ($AllowDegraded -and $agg.Status -eq 503)
Check "aggregate /api/health ($($agg.Status))" $aggOk "(use -AllowDegraded during stage 1)"
try { ($agg.Body | ConvertFrom-Json).services.PSObject.Properties | ForEach-Object { Write-Host "     $($_.Name): $($_.Value)" } } catch { }

$unknown = Invoke-Probe GET '/api/__smoke_unknown_route__'
Check 'unknown route = 404 ROUTE_NOT_FOUND' ($unknown.Status -eq 404 -and $unknown.Body -match 'ROUTE_NOT_FOUND') "(status $($unknown.Status))"
Check 'no stack trace in 404 body' (-not (Has-StackTrace $unknown.Body))

$internal = Invoke-Probe GET '/api/notifications/internal/notifications'
Check 'internal service routes hidden (404)' ($internal.Status -eq 404) "(status $($internal.Status))"

$forged = Invoke-Probe GET '/api/admin/reports' @{ 'x-user-id' = 'smoke'; 'x-user-role' = 'ADMIN' }
Check 'forged x-user-role is not trusted (401/403)' ($forged.Status -in 401, 403) "(status $($forged.Status))"

$badToken = Invoke-Probe GET '/api/admin/reports/mine' @{ Authorization = 'Bearer smoke.invalid.token' }
Check 'invalid Bearer token = 401' ($badToken.Status -eq 401) "(status $($badToken.Status))"
Check 'no stack trace in 401 body' (-not (Has-StackTrace $badToken.Body))

$limited = Invoke-Probe GET '/api/__smoke_unknown_route__'
$rateHeader = $limited.Headers['RateLimit']; if (-not $rateHeader) { $rateHeader = $limited.Headers['RateLimit-Policy'] }
Check 'rate-limit headers present on /api' ([bool]$rateHeader)

if ($Origin) {
    $pre = Invoke-Probe OPTIONS '/api/notifications/promotions' @{ Origin = $Origin; 'Access-Control-Request-Method' = 'GET' }
    $allow = [string]$pre.Headers['Access-Control-Allow-Origin']
    Check "CORS preflight allows $Origin" ($pre.Status -in 200, 204 -and $allow -eq $Origin) "(status $($pre.Status), allow-origin '$allow')"
    $evil = Invoke-Probe OPTIONS '/api/notifications/promotions' @{ Origin = 'https://evil.invalid'; 'Access-Control-Request-Method' = 'GET' }
    Check 'CORS preflight does not allow an unknown origin' ([string]$evil.Headers['Access-Control-Allow-Origin'] -ne 'https://evil.invalid' -and [string]$evil.Headers['Access-Control-Allow-Origin'] -ne '*')
} else {
    Write-Host 'SKIP CORS preflight (pass -Origin https://your-app-origin)' -ForegroundColor Yellow
}

Write-Host "`n$passed passed, $failed failed"
if ($failed -gt 0) { exit 1 }
