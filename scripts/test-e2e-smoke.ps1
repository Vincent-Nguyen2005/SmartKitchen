$ErrorActionPreference = 'Continue'
$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { 'http://localhost:4000' }
$NotificationUrl = if ($env:NOTIFICATION_URL) { $env:NOTIFICATION_URL } else { 'http://localhost:4010' }
$AdminUrl = if ($env:ADMIN_URL) { $env:ADMIN_URL } else { 'http://localhost:4011' }
$ApiKey = if ($env:PARTNER_API_KEY) { $env:PARTNER_API_KEY } else { 'replace-with-partner-key' }
$passed = 0; $failed = 0; $skipped = 0

# JWT_SECRET signs the dev tokens below: the environment wins, otherwise the root .env is read.
# Only the JWT_SECRET line is parsed and the value is never printed. No placeholder fallback.
function Resolve-JwtSecret {
    if ($env:JWT_SECRET) { return $env:JWT_SECRET }
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { return $null }
    try { $lines = Get-Content -LiteralPath $envFile -ErrorAction Stop } catch { return $null }
    foreach ($line in $lines) {
        if ($line -notmatch '^\s*(?:export\s+)?JWT_SECRET\s*=(.*)$') { continue }
        $value = $Matches[1].Trim()
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
        else { $value = ($value -replace '\s+#.*$', '').Trim() }
        if ($value) { return $value }
    }
    return $null
}
$JwtSecret = Resolve-JwtSecret
if (-not $JwtSecret) {
    Write-Host 'FAIL JWT_SECRET is not set: export it or copy .env.example to .env and set JWT_SECRET (the same value the stack runs with).' -ForegroundColor Red
    exit 1
}

function Invoke-Api {
    param([string]$Method, [string]$Url, [hashtable]$Headers = $null, [string]$Body = $null)
    try {
        if ($Method -eq 'GET') {
            if ($null -ne $Headers -and $Headers.Count -gt 0) { $response = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop }
            else { $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop }
        } else {
            $request = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true; TimeoutSec = 10; ErrorAction = 'Stop' }
            if ($null -ne $Headers -and $Headers.Count -gt 0) { $request.Headers = $Headers }
            if ($null -ne $Body) { $request.ContentType = 'application/json'; $request.Body = $Body }
            $response = Invoke-WebRequest @request
        }
        return [pscustomobject]@{ Method = $Method; Url = $Url; Status = [int]$response.StatusCode; Body = [string]$response.Content; Headers = $response.Headers; Error = $null }
    } catch {
        $raw = $_.Exception.Response
        if ($null -eq $raw) { $fallback = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }; return [pscustomobject]@{ Method = $Method; Url = $Url; Status = 0; Body = $fallback; Headers = @{}; Error = $_.Exception.Message } }
        $bodyText = ''
        try { $reader = New-Object System.IO.StreamReader($raw.GetResponseStream()); $bodyText = $reader.ReadToEnd(); $reader.Dispose() } catch { $bodyText = '' }
        return [pscustomobject]@{ Method = $Method; Url = $Url; Status = [int]$raw.StatusCode; Body = $bodyText; Headers = $raw.Headers; Error = $_.Exception.Message }
    }
}
function Header-Value($Response, [string]$Name) { if ($null -eq $Response.Headers) { return '' }; $value = $Response.Headers[$Name]; if ($value -is [array]) { return [string]$value[0] }; return [string]$value }
function Body-Snippet($Response) { $body = [string]$Response.Body; if ($body.Length -gt 300) { return $body.Substring(0, 300) }; return $body }
function Pass([string]$Label) { Write-Host "PASS $Label" -ForegroundColor Green; $script:passed++ }
function Fail([string]$Label, $Response, [string]$Expected) { $detail = "$($Response.Method) $($Response.Url), status $($Response.Status), expected $Expected, body: $(Body-Snippet $Response)"; if ($Response.Error) { $detail += "; error: $($Response.Error)" }; Write-Host "FAIL $Label ($detail)" -ForegroundColor Red; $script:failed++ }
function Expect-Status([string]$Label, $Response, [int]$Expected) { if ($Response.Status -eq $Expected) { Pass $Label } else { Fail $Label $Response $Expected } }
function Expect-Header([string]$Label, $Response, [string]$Name, [string]$Expected) { if ((Header-Value $Response $Name) -eq $Expected) { Pass $Label } else { Fail $Label $Response "$Name=$Expected" } }
# Dev-only HS256 access token shaped like auth-service's (sub + role, 15 min), signed with $JwtSecret.
function ConvertTo-Base64Url([byte[]]$Bytes) { [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function New-DevJwt([string]$Subject, [string]$Role) {
    $secret = $JwtSecret
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
    $payload = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes("{`"sub`":`"$Subject`",`"role`":`"$Role`",`"iat`":$now,`"exp`":$($now + 900)}"))
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 (,[Text.Encoding]::UTF8.GetBytes($secret))
    $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
    return "$header.$payload.$signature"
}
function Read-Json([string]$Label, $Response) { if ($Response.Status -eq 0 -or [string]::IsNullOrWhiteSpace($Response.Body)) { Fail $Label $Response 'JSON body'; return $null }; try { return ($Response.Body | ConvertFrom-Json) } catch { Fail $Label $Response 'valid JSON'; return $null } }

foreach ($route in @(@('gateway health', "$BaseUrl/health", 200), @('aggregate health', "$BaseUrl/api/health", 200), @('auth routing', "$BaseUrl/api/auth/health", 200), @('families routing', "$BaseUrl/api/families/health", 200), @('inventory routing', "$BaseUrl/api/inventory/health", 200), @('nutrition routing', "$BaseUrl/api/nutrition/health", 200), @('meal-diary routing', "$BaseUrl/api/meal-diary/health", 200), @('recipes routing', "$BaseUrl/api/recipes/health", 200), @('menus routing', "$BaseUrl/api/menus/health", 200), @('shopping-list routing', "$BaseUrl/api/shopping-list/health", 200), @('payments routing', "$BaseUrl/api/payments/health", 200), @('notifications routing', "$BaseUrl/api/notifications/health", 200), @('admin routing', "$BaseUrl/api/admin/health", 200), @('unknown route', "$BaseUrl/api/unknown-route", 404))) { $response = Invoke-Api GET $route[1]; Expect-Status $route[0] $response $route[2] }

$cacheUrl = "$BaseUrl/api/notifications/promotions?active=true&e2e=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$cacheFirst = Invoke-Api GET $cacheUrl; $cacheSecond = Invoke-Api GET $cacheUrl
Expect-Status 'cache public GET first response' $cacheFirst 200; Expect-Header 'cache MISS on first public GET' $cacheFirst 'x-cache' 'MISS'
Expect-Status 'cache public GET second response' $cacheSecond 200; Expect-Header 'cache HIT on second public GET' $cacheSecond 'x-cache' 'HIT'
$e2eToken = New-DevJwt 'e2e-user-001' 'USER'
Expect-Header 'authenticated GET bypasses cache' (Invoke-Api GET $cacheUrl @{ Authorization = "Bearer $e2eToken" }) 'x-cache' 'BYPASS'
Expect-Status 'invalid Bearer token is rejected (401)' (Invoke-Api GET $cacheUrl @{ Authorization = 'Bearer e2e-invalid-token' }) 401
Expect-Header 'POST bypasses cache' (Invoke-Api POST $cacheUrl $null '{}') 'x-cache' 'BYPASS'

$partnerHeaders = @{ 'x-api-key' = $ApiKey }
$partner = Invoke-Api POST "$NotificationUrl/partners" $partnerHeaders (@{ name = 'e2e-partner' } | ConvertTo-Json)
if ($partner.Status -eq 200 -or $partner.Status -eq 201) { Pass 'promotion partner upsert' } else { Fail 'promotion partner upsert' $partner '200 or 201' }
$partnerObject = Read-Json 'promotion partner response JSON' $partner
$partnerId = if ($null -ne $partnerObject) { [string]$partnerObject.id } else { '' }
if ([string]::IsNullOrWhiteSpace($partnerId)) { Fail 'promotion partner id present' $partner 'partner id' }
# User-owned notification routes go through the gateway: identity comes only from the signed access token.
$userHeaders = @{ Authorization = "Bearer $e2eToken" }
$otherUserHeaders = @{ Authorization = "Bearer $(New-DevJwt 'e2e-user-002' 'USER')" }
$adminBearer = @{ Authorization = "Bearer $(New-DevJwt 'e2e-admin-001' 'ADMIN')" }
Expect-Status 'notifications require identity (401)' (Invoke-Api GET "$BaseUrl/api/notifications/notifications") 401
$device = Invoke-Api POST "$BaseUrl/api/notifications/device-tokens" $userHeaders (@{ token = 'e2e-device-token'; platform = 'ANDROID' } | ConvertTo-Json)
Expect-Status 'promotion device token registration' $device 201
$promotionId = ''
if ($partnerId) {
    $promotionEnds = (Get-Date).ToUniversalTime().AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $promotionPayload = '[{"title":"e2e-promotion","description":"e2e promotion","productKeywords":["ca chua"],"startsAt":"2026-01-01T00:00:00Z","endsAt":"' + $promotionEnds + '"}]'
    $promotion = Invoke-Api POST "$NotificationUrl/partners/$partnerId/promotions" $partnerHeaders $promotionPayload
    Expect-Status 'promotion ingestion' $promotion 201
    $promotionObject = Read-Json 'promotion ingestion response JSON' $promotion
    if ($null -ne $promotionObject -and $null -ne $promotionObject.promotions -and $promotionObject.promotions.Count -gt 0) { $promotionId = [string]$promotionObject.promotions[0].id } else { Fail 'promotion id present' $promotion 'promotions[0].id' }
} else { $promotion = [pscustomobject]@{ Method = 'POST'; Url = "$NotificationUrl/partners/<missing>/promotions"; Status = 0; Body = ''; Headers = @{}; Error = 'partner id unavailable' }; Fail 'promotion ingestion' $promotion '201' }
if ($promotionId) {
    $match = Invoke-Api POST "$NotificationUrl/promotions/match" $null (@{ userId = 'e2e-user-001'; keywords = @('Cà Chua') } | ConvertTo-Json)
    if ($match.Status -eq 200 -and $match.Body -match $promotionId) { Pass 'promotion keyword match' } else { Fail 'promotion keyword match' $match 200 }
    $dispatchBody = @{ userIds = @('e2e-user-001') } | ConvertTo-Json
    Expect-Status 'promotion dispatch as USER is forbidden (403)' (Invoke-Api POST "$BaseUrl/api/notifications/promotions/$promotionId/dispatch" $userHeaders $dispatchBody) 403
    $dispatch = Invoke-Api POST "$BaseUrl/api/notifications/promotions/$promotionId/dispatch" $adminBearer $dispatchBody
    Expect-Status 'promotion mock dispatch' $dispatch 200
    $notifications = Invoke-Api GET "$BaseUrl/api/notifications/notifications" $userHeaders
    if ($notifications.Status -eq 200 -and $notifications.Body -match '"status":"SENT"') { Pass 'promotion notification is SENT' } else { Fail 'promotion notification is SENT' $notifications 200 }
} else { $missing = [pscustomobject]@{ Method = 'POST'; Url = "$BaseUrl/api/notifications/promotions/<missing>/dispatch"; Status = 0; Body = ''; Headers = @{}; Error = 'promotion id unavailable' }; Fail 'promotion keyword match' $missing 200; Fail 'promotion dispatch as USER is forbidden (403)' $missing 403; Fail 'promotion mock dispatch' $missing 200; Fail 'promotion notification is SENT' $missing 200 }
Expect-Status 'IDOR: another user cannot list this inbox (403)' (Invoke-Api GET "$BaseUrl/api/notifications/notifications?userId=e2e-user-001" $otherUserHeaders) 403
Expect-Status 'IDOR: another user cannot read these preferences (403)' (Invoke-Api GET "$BaseUrl/api/notifications/preferences/e2e-user-001" $otherUserHeaders) 403
Expect-Status 'IDOR: another user cannot delete this device token (404)' (Invoke-Api DELETE "$BaseUrl/api/notifications/device-tokens/e2e-device-token" $otherUserHeaders) 404
Expect-Status 'device token cleanup by its owner' (Invoke-Api DELETE "$BaseUrl/api/notifications/device-tokens/e2e-device-token" $userHeaders) 204
# Teardown: the test promotion must not stay in Thông báo (scripts/data-fixes/2026-12-delete-e2e-promotions.js removes older leftovers).
if ($promotionId) { Expect-Status 'e2e promotion cleanup' (Invoke-Api DELETE "$BaseUrl/api/notifications/promotions/$promotionId" $adminBearer) 200 }

$adminHeaders = @{ 'x-user-id' = 'e2e-admin-001'; 'x-user-role' = 'ADMIN' }
$forbidden = Invoke-Api GET "$AdminUrl/weights"
Expect-Status 'admin guard rejects missing role' $forbidden 403
$ingredientSearch = Invoke-Api GET "$AdminUrl/ingredients?search=e2e-ingredient" $adminHeaders
$ingredientObject = Read-Json 'admin ingredient search JSON' $ingredientSearch
$ingredient = if ($null -ne $ingredientObject -and $null -ne $ingredientObject.items -and $ingredientObject.items.Count -gt 0) { $ingredientObject.items[0] } else { $null }
$ingredientPayload = @{ name = 'e2e-ingredient'; category = 'e2e'; defaultUnit = 'g'; caloriesPer100g = 10; proteinPer100g = 1; carbsPer100g = 1; fatPer100g = 1; allergenTags = @() } | ConvertTo-Json
if ($null -eq $ingredient) { $created = Invoke-Api POST "$AdminUrl/ingredients" $adminHeaders $ingredientPayload; Expect-Status 'admin ingredient create' $created 201; $ingredient = Read-Json 'admin ingredient create JSON' $created } else { Pass 'admin ingredient is reusable' }
$ingredientId = if ($null -ne $ingredient) { [string]$ingredient.id } else { '' }
if ($ingredientId) {
    Expect-Status 'admin ingredient update' (Invoke-Api PUT "$AdminUrl/ingredients/$ingredientId" $adminHeaders (@{ category = 'e2e-updated' } | ConvertTo-Json)) 200
    Expect-Status 'admin ingredient soft delete' (Invoke-Api PATCH "$AdminUrl/ingredients/$ingredientId/active" $adminHeaders (@{ isActive = $false } | ConvertTo-Json)) 200
    # Hard delete, so the smoke run leaves no e2e-ingredient row in the catalog (the gateway is not involved).
    Expect-Status 'admin ingredient cleanup (hard delete)' (Invoke-Api DELETE "$AdminUrl/ingredients/$ingredientId" $adminHeaders) 204
} else { $missing = [pscustomobject]@{ Method = 'PUT'; Url = "$AdminUrl/ingredients/<missing>"; Status = 0; Body = ''; Headers = @{}; Error = 'ingredient id unavailable' }; Fail 'admin ingredient update' $missing 200; Fail 'admin ingredient soft delete' $missing 200 }
$weightResponse = Invoke-Api GET "$AdminUrl/weights/expiry_priority" $adminHeaders; $weight = Read-Json 'admin weight JSON' $weightResponse
if ($null -ne $weight) {
    $oldVersion = [int]$weight.version; $newValue = if ([double]$weight.value -eq 0.35) { 0.36 } else { 0.35 }
    Expect-Status 'admin weight update' (Invoke-Api PUT "$AdminUrl/weights/expiry_priority" $adminHeaders (@{ value = $newValue; expectedVersion = $oldVersion } | ConvertTo-Json)) 200
    Expect-Status 'admin stale weight update is conflict' (Invoke-Api PUT "$AdminUrl/weights/expiry_priority" $adminHeaders (@{ value = $newValue; expectedVersion = $oldVersion } | ConvertTo-Json)) 409
    Expect-Status 'admin weight cleanup' (Invoke-Api POST "$AdminUrl/weights/reset-defaults" $adminHeaders '{}') 200
} else { Fail 'admin weight update' $weightResponse 200; Fail 'admin stale weight update is conflict' $weightResponse 409 }

Write-Host "`n$passed passed, $failed failed, $skipped skipped"
if ($failed -gt 0) { exit 1 }
