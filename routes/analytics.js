const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * GA4 Measurement Protocol endpoint
 * Forwards events to Google Analytics 4 for server-side tracking
 */
router.post('/ga4-event', async (req, res) => {
  try {
    const { client_id, events, user_id } = req.body;

    // Validate required environment variables
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;

    if (!measurementId || !apiSecret) {
      return res.status(500).json({
        error: 'GA4 configuration missing',
        message: 'GA4_MEASUREMENT_ID and GA4_API_SECRET must be configured'
      });
    }

    // Validate request body
    if (!client_id || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'client_id and events array are required'
      });
    }

    // Prepare the payload for GA4 Measurement Protocol
    const payload = {
      client_id,
      events
    };

    // Add user_id if provided
    if (user_id) {
      payload.user_id = user_id;
    }

    // Send to GA4 Measurement Protocol
    const ga4Url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
    
    const response = await axios.post(ga4Url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // GA4 Measurement Protocol returns 204 on success
    if (response.status === 204) {
      res.json({
        success: true,
        message: 'Events sent to GA4 successfully',
        events_count: events.length
      });
    } else {
      throw new Error(`Unexpected response status: ${response.status}`);
    }

  } catch (error) {
    console.error('GA4 Analytics Error:', error.message);
    
    // Don't expose internal errors to client
    res.status(500).json({
      error: 'Analytics tracking failed',
      message: 'Unable to send events to analytics service'
    });
  }
});

/**
 * Track purchase event specifically
 * Handles e-commerce tracking for license purchases
 */
router.post('/purchase', async (req, res) => {
  try {
    const {
      client_id,
      user_id,
      transaction_id,
      value,
      currency = 'USD',
      license_type,
      payment_method
    } = req.body;

    // Validate required fields
    if (!client_id || !transaction_id || !value || !license_type) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'client_id, transaction_id, value, and license_type are required'
      });
    }

    // Create purchase event
    const purchaseEvent = {
      name: 'purchase',
      params: {
        transaction_id,
        value: parseFloat(value),
        currency,
        payment_method,
        items: [{
          item_id: license_type,
          item_name: `FlowDownloader ${license_type} License`,
          category: 'software_license',
          quantity: 1,
          price: parseFloat(value)
        }]
      }
    };

    // Forward to GA4 event endpoint
    const eventPayload = {
      client_id,
      user_id,
      events: [purchaseEvent]
    };

    // Use internal endpoint to avoid code duplication
    req.body = eventPayload;
    return router.handle({
      ...req,
      method: 'POST',
      url: '/ga4-event'
    }, res);

  } catch (error) {
    console.error('Purchase tracking error:', error.message);
    res.status(500).json({
      error: 'Purchase tracking failed',
      message: 'Unable to track purchase event'
    });
  }
});

/**
 * Track license activation event
 */
router.post('/license-activation', async (req, res) => {
  try {
    const {
      client_id,
      user_id,
      license_type,
      license_key,
      activation_method = 'manual'
    } = req.body;

    if (!client_id || !license_type || !license_key) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'client_id, license_type, and license_key are required'
      });
    }

    const activationEvent = {
      name: 'license_activated',
      params: {
        license_type,
        activation_method,
        event_category: 'conversions',
        event_label: `${license_type} license activated`,
        value: 1
      }
    };

    const eventPayload = {
      client_id,
      user_id,
      events: [activationEvent]
    };

    req.body = eventPayload;
    return router.handle({
      ...req,
      method: 'POST',
      url: '/ga4-event'
    }, res);

  } catch (error) {
    console.error('License activation tracking error:', error.message);
    res.status(500).json({
      error: 'License activation tracking failed',
      message: 'Unable to track license activation'
    });
  }
});

/**
 * Health check endpoint for analytics service
 */
router.get('/health', (req, res) => {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  res.json({
    status: 'ok',
    service: 'analytics',
    ga4_configured: !!(measurementId && apiSecret),
    timestamp: new Date().toISOString()
  });
});

/**
 * Test endpoint for GA4 connection
 */
router.post('/test', async (req, res) => {
  try {
    const testEvent = {
      name: 'test_event',
      params: {
        test_parameter: 'test_value',
        timestamp: Date.now()
      }
    };

    const eventPayload = {
      client_id: 'test_client_' + Date.now(),
      events: [testEvent]
    };

    req.body = eventPayload;
    return router.handle({
      ...req,
      method: 'POST',
      url: '/ga4-event'
    }, res);

  } catch (error) {
    console.error('Analytics test error:', error.message);
    res.status(500).json({
      error: 'Analytics test failed',
      message: error.message
    });
  }
});

module.exports = router;