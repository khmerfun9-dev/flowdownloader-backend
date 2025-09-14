# PowerShell Test Script for GA4 Measurement Protocol Analytics Endpoints
# Make sure to set your environment variables before running this script

Write-Host "=== FlowDownloader Analytics API Test Script ===" -ForegroundColor Green
Write-Host

# Configuration
$BaseUrl = "http://localhost:3001/api/analytics"
$GA4MeasurementId = if ($env:GA4_MEASUREMENT_ID) { $env:GA4_MEASUREMENT_ID } else { "G-XXXXXXXXXX" }
$GA4ApiSecret = if ($env:GA4_API_SECRET) { $env:GA4_API_SECRET } else { "your_api_secret_here" }

Write-Host "Testing Analytics API at: $BaseUrl" -ForegroundColor Yellow
Write-Host "GA4 Measurement ID: $GA4MeasurementId" -ForegroundColor Yellow
Write-Host

# Helper function to make HTTP requests
function Invoke-ApiTest {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Body = $null,
        [string]$Description
    )
    
    Write-Host $Description -ForegroundColor Cyan
    
    try {
        $headers = @{ "Content-Type" = "application/json" }
        
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers -Body $jsonBody
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers
        }
        
        $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    }
    catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
    }
    
    Write-Host
}

# Test 1: Health Check
Invoke-ApiTest -Method "GET" -Url "$BaseUrl/health" -Description "1. Testing Analytics Health Check..."

# Test 2: Basic GA4 Event
$basicEvent = @{
    client_id = "test_client_123"
    events = @(
        @{
            name = "test_event"
            params = @{
                test_parameter = "test_value"
                timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            }
        }
    )
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $basicEvent -Description "2. Testing Basic GA4 Event..."

# Test 3: Download Start Event
$downloadStartEvent = @{
    client_id = "test_client_123"
    user_id = "test_user_456"
    events = @(
        @{
            name = "download_start"
            params = @{
                url = "https://example.com/test-video"
                format = "MP4"
                quality = "1080p"
                platform = "youtube"
                user_type = "authenticated"
                license_type = "pro"
            }
        }
    )
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $downloadStartEvent -Description "3. Testing Download Start Event..."

# Test 4: Download Complete Event
$downloadCompleteEvent = @{
    client_id = "test_client_123"
    user_id = "test_user_456"
    events = @(
        @{
            name = "download_complete"
            params = @{
                url = "https://example.com/test-video"
                format = "MP4"
                quality = "1080p"
                platform = "youtube"
                user_type = "authenticated"
                license_type = "pro"
                file_size = "45MB"
                duration_seconds = 120
            }
        }
    )
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $downloadCompleteEvent -Description "4. Testing Download Complete Event..."

# Test 5: Purchase Event
$purchaseEvent = @{
    client_id = "test_client_123"
    user_id = "test_user_456"
    transaction_id = "txn_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    value = 29.99
    currency = "USD"
    license_type = "pro"
    payment_method = "stripe"
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/purchase" -Body $purchaseEvent -Description "5. Testing Purchase Event..."

# Test 6: License Activation Event
$licenseActivationEvent = @{
    client_id = "test_client_123"
    user_id = "test_user_456"
    license_type = "pro"
    license_key = "FD-PRO-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    activation_method = "manual"
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/license-activation" -Body $licenseActivationEvent -Description "6. Testing License Activation Event..."

# Test 7: Multiple Events in Single Request
$multipleEvents = @{
    client_id = "test_client_123"
    user_id = "test_user_456"
    events = @(
        @{
            name = "page_view"
            params = @{
                page_title = "FlowDownloader Home"
                page_location = "https://flowdownloader.com"
            }
        },
        @{
            name = "user_engagement"
            params = @{
                engagement_time_msec = 30000
            }
        },
        @{
            name = "scroll"
            params = @{
                percent_scrolled = 75
            }
        }
    )
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $multipleEvents -Description "7. Testing Multiple Events..."

# Test 8: Error Cases
Write-Host "8. Testing Error Cases..." -ForegroundColor Cyan

# 8a. Missing client_id
$missingClientId = @{
    events = @(
        @{
            name = "test_event"
            params = @{}
        }
    )
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $missingClientId -Description "8a. Missing client_id:"

# 8b. Missing events array
$missingEvents = @{
    client_id = "test_client_123"
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/ga4-event" -Body $missingEvents -Description "8b. Missing events array:"

# 8c. Invalid purchase data
$invalidPurchase = @{
    client_id = "test_client_123"
}
Invoke-ApiTest -Method "POST" -Url "$BaseUrl/purchase" -Body $invalidPurchase -Description "8c. Invalid purchase data:"

# Test 9: Direct GA4 Measurement Protocol Test
Write-Host "9. Testing Direct GA4 Measurement Protocol..." -ForegroundColor Cyan
Write-Host "Note: This will only work if GA4_MEASUREMENT_ID and GA4_API_SECRET are properly configured" -ForegroundColor Yellow

$directGA4Event = @{
    client_id = "test_client_direct_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    events = @(
        @{
            name = "test_direct_event"
            params = @{
                test_source = "powershell_script"
                timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            }
        }
    )
}

try {
    $ga4Url = "https://www.google-analytics.com/mp/collect?measurement_id=$GA4MeasurementId&api_secret=$GA4ApiSecret"
    $headers = @{ "Content-Type" = "application/json" }
    $jsonBody = $directGA4Event | ConvertTo-Json -Depth 10
    
    $response = Invoke-WebRequest -Uri $ga4Url -Method POST -Headers $headers -Body $jsonBody
    Write-Host "Direct GA4 Response Status: $($response.StatusCode)" -ForegroundColor Green
    if ($response.StatusCode -eq 204) {
        Write-Host "Success! GA4 accepted the event (204 No Content is expected)" -ForegroundColor Green
    }
}
catch {
    Write-Host "Direct GA4 Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host
Write-Host "=== Analytics API Test Complete ===" -ForegroundColor Green
Write-Host
Write-Host "Instructions:" -ForegroundColor Yellow
Write-Host "1. Check your GA4 DebugView at https://analytics.google.com/analytics/web/#/debugview/"
Write-Host "2. Look for events with client_id starting with 'test_client_'"
Write-Host "3. Verify that events are being received and processed correctly"
Write-Host "4. Check the server logs for any error messages"
Write-Host
Write-Host "Environment Variables Required:" -ForegroundColor Yellow
Write-Host "- GA4_MEASUREMENT_ID: Your Google Analytics 4 Measurement ID (G-XXXXXXXXXX)"
Write-Host "- GA4_API_SECRET: Your GA4 Measurement Protocol API Secret"
Write-Host
Write-Host "To set environment variables in PowerShell:" -ForegroundColor Yellow
Write-Host '$env:GA4_MEASUREMENT_ID = "G-XXXXXXXXXX"'
Write-Host '$env:GA4_API_SECRET = "your_api_secret_here"'
Write-Host
Write-Host "Or create a .env file in the backend directory with:" -ForegroundColor Yellow
Write-Host "GA4_MEASUREMENT_ID=G-XXXXXXXXXX"
Write-Host "GA4_API_SECRET=your_api_secret_here"
Write-Host