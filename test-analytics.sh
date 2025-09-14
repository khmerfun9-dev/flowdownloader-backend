#!/bin/bash

# Test script for GA4 Measurement Protocol Analytics Endpoints
# Make sure to set your environment variables before running this script

echo "=== FlowDownloader Analytics API Test Script ==="
echo

# Configuration
BASE_URL="http://localhost:3001/api/analytics"
GA4_MEASUREMENT_ID="${GA4_MEASUREMENT_ID:-G-XXXXXXXXXX}"
GA4_API_SECRET="${GA4_API_SECRET:-your_api_secret_here}"

echo "Testing Analytics API at: $BASE_URL"
echo "GA4 Measurement ID: $GA4_MEASUREMENT_ID"
echo

# Test 1: Health Check
echo "1. Testing Analytics Health Check..."
curl -s -X GET "$BASE_URL/health" \
  -H "Content-Type: application/json" | jq .
echo
echo

# Test 2: Basic GA4 Event
echo "2. Testing Basic GA4 Event..."
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "events": [
      {
        "name": "test_event",
        "params": {
          "test_parameter": "test_value",
          "timestamp": '$(date +%s)'
        }
      }
    ]
  }' | jq .
echo
echo

# Test 3: Download Start Event
echo "3. Testing Download Start Event..."
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "user_id": "test_user_456",
    "events": [
      {
        "name": "download_start",
        "params": {
          "url": "https://example.com/test-video",
          "format": "MP4",
          "quality": "1080p",
          "platform": "youtube",
          "user_type": "authenticated",
          "license_type": "pro"
        }
      }
    ]
  }' | jq .
echo
echo

# Test 4: Download Complete Event
echo "4. Testing Download Complete Event..."
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "user_id": "test_user_456",
    "events": [
      {
        "name": "download_complete",
        "params": {
          "url": "https://example.com/test-video",
          "format": "MP4",
          "quality": "1080p",
          "platform": "youtube",
          "user_type": "authenticated",
          "license_type": "pro",
          "file_size": "45MB",
          "duration_seconds": 120
        }
      }
    ]
  }' | jq .
echo
echo

# Test 5: Purchase Event
echo "5. Testing Purchase Event..."
curl -s -X POST "$BASE_URL/purchase" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "user_id": "test_user_456",
    "transaction_id": "txn_'$(date +%s)'",
    "value": 29.99,
    "currency": "USD",
    "license_type": "pro",
    "payment_method": "stripe"
  }' | jq .
echo
echo

# Test 6: License Activation Event
echo "6. Testing License Activation Event..."
curl -s -X POST "$BASE_URL/license-activation" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "user_id": "test_user_456",
    "license_type": "pro",
    "license_key": "FD-PRO-'$(date +%s)'",
    "activation_method": "manual"
  }' | jq .
echo
echo

# Test 7: Multiple Events in Single Request
echo "7. Testing Multiple Events..."
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123",
    "user_id": "test_user_456",
    "events": [
      {
        "name": "page_view",
        "params": {
          "page_title": "FlowDownloader Home",
          "page_location": "https://flowdownloader.com"
        }
      },
      {
        "name": "user_engagement",
        "params": {
          "engagement_time_msec": 30000
        }
      },
      {
        "name": "scroll",
        "params": {
          "percent_scrolled": 75
        }
      }
    ]
  }' | jq .
echo
echo

# Test 8: Error Cases
echo "8. Testing Error Cases..."
echo "8a. Missing client_id:"
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "name": "test_event",
        "params": {}
      }
    ]
  }' | jq .
echo

echo "8b. Missing events array:"
curl -s -X POST "$BASE_URL/ga4-event" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123"
  }' | jq .
echo

echo "8c. Invalid purchase data:"
curl -s -X POST "$BASE_URL/purchase" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_123"
  }' | jq .
echo
echo

# Test 9: Direct GA4 Measurement Protocol Test
echo "9. Testing Direct GA4 Measurement Protocol..."
echo "Note: This will only work if GA4_MEASUREMENT_ID and GA4_API_SECRET are properly configured"
curl -s -X POST "https://www.google-analytics.com/mp/collect?measurement_id=$GA4_MEASUREMENT_ID&api_secret=$GA4_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test_client_direct_'$(date +%s)'",
    "events": [
      {
        "name": "test_direct_event",
        "params": {
          "test_source": "curl_script",
          "timestamp": '$(date +%s)'
        }
      }
    ]
  }'
echo
echo "Direct GA4 test completed (204 status = success, no response body expected)"
echo

echo "=== Analytics API Test Complete ==="
echo
echo "Instructions:"
echo "1. Check your GA4 DebugView at https://analytics.google.com/analytics/web/#/debugview/"
echo "2. Look for events with client_id starting with 'test_client_'"
echo "3. Verify that events are being received and processed correctly"
echo "4. Check the server logs for any error messages"
echo
echo "Environment Variables Required:"
echo "- GA4_MEASUREMENT_ID: Your Google Analytics 4 Measurement ID (G-XXXXXXXXXX)"
echo "- GA4_API_SECRET: Your GA4 Measurement Protocol API Secret"
echo
echo "To set environment variables:"
echo "export GA4_MEASUREMENT_ID=G-XXXXXXXXXX"
echo "export GA4_API_SECRET=your_api_secret_here"
echo