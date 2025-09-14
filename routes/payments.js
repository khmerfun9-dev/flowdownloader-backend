const express = require('express');
const Joi = require('joi');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('paypal-rest-sdk');
const User = require('../models/User');
const License = require('../models/License');
const { authenticateToken } = require('../middleware/auth');
const { LICENSE_TYPES, db, COLLECTIONS } = require('../config/firebase');

const router = express.Router();

// Configure PayPal
paypal.configure({
  mode: process.env.PAYPAL_MODE || 'sandbox', // 'sandbox' or 'live'
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET
});

// Validation schemas
const createPaymentSchema = Joi.object({
  licenseType: Joi.string().valid('BASIC', 'PRO', 'UNLIMITED').required(),
  paymentMethod: Joi.string().valid('stripe', 'paypal').required(),
  duration: Joi.number().integer().min(1).max(365).default(30), // days
  currency: Joi.string().valid('USD', 'EUR', 'GBP').default('USD')
});

const stripePaymentSchema = Joi.object({
  paymentMethodId: Joi.string().required(),
  licenseType: Joi.string().valid('BASIC', 'PRO', 'UNLIMITED').required(),
  duration: Joi.number().integer().min(1).max(365).default(30)
});

// Create Stripe payment intent
router.post('/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { error, value } = stripePaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { licenseType, duration } = value;
    const licenseInfo = LICENSE_TYPES[licenseType];
    
    if (!licenseInfo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid license type'
      });
    }

    // Calculate amount (price per month * duration in months)
    const monthlyPrice = licenseInfo.price;
    const months = Math.ceil(duration / 30);
    const amount = Math.round(monthlyPrice * months * 100); // Convert to cents

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        userId: req.user.id,
        licenseType,
        duration: duration.toString(),
        userEmail: req.user.email
      },
      description: `FlowDownloader ${licenseType} License - ${duration} days`
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: 'usd',
        licenseType,
        duration
      }
    });
  } catch (error) {
    console.error('Stripe payment intent creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment intent creation failed',
      error: error.message
    });
  }
});

// Confirm Stripe payment
router.post('/stripe/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID required'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }

    // Verify the payment belongs to the current user
    if (paymentIntent.metadata.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const { licenseType, duration } = paymentIntent.metadata;
    const amount = paymentIntent.amount / 100; // Convert from cents
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(duration));

    // Create license
    const license = await License.create({
      userId: req.user.id,
      licenseType,
      expiryDate,
      paymentId: paymentIntentId,
      paymentMethod: 'stripe',
      amount,
      currency: paymentIntent.currency.toUpperCase()
    });

    // Update user license
    await req.user.updateLicense(licenseType, parseInt(duration));

    // Store payment record
    await db.collection(COLLECTIONS.PAYMENTS).add({
      userId: req.user.id,
      licenseId: license.id,
      paymentId: paymentIntentId,
      paymentMethod: 'stripe',
      amount,
      currency: paymentIntent.currency.toUpperCase(),
      status: 'completed',
      licenseType,
      duration: parseInt(duration),
      createdAt: new Date()
    });

    res.json({
      success: true,
      message: 'Payment confirmed and license activated',
      data: {
        license: license.toJSON(),
        user: req.user.toJSON()
      }
    });
  } catch (error) {
    console.error('Stripe payment confirmation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment confirmation failed',
      error: error.message
    });
  }
});

// Create PayPal payment
router.post('/paypal/create-payment', authenticateToken, async (req, res) => {
  try {
    const { error, value } = createPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { licenseType, duration, currency } = value;
    const licenseInfo = LICENSE_TYPES[licenseType];
    
    if (!licenseInfo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid license type'
      });
    }

    // Calculate amount
    const monthlyPrice = licenseInfo.price;
    const months = Math.ceil(duration / 30);
    const amount = (monthlyPrice * months).toFixed(2);

    const paymentData = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`
      },
      transactions: [{
        item_list: {
          items: [{
            name: `FlowDownloader ${licenseType} License`,
            sku: `${licenseType}_${duration}D`,
            price: amount,
            currency: currency,
            quantity: 1
          }]
        },
        amount: {
          currency: currency,
          total: amount
        },
        description: `FlowDownloader ${licenseType} License - ${duration} days`,
        custom: JSON.stringify({
          userId: req.user.id,
          licenseType,
          duration,
          userEmail: req.user.email
        })
      }]
    };

    paypal.payment.create(paymentData, (error, payment) => {
      if (error) {
        console.error('PayPal payment creation failed:', error);
        return res.status(500).json({
          success: false,
          message: 'PayPal payment creation failed',
          error: error.message
        });
      }

      // Find approval URL
      const approvalUrl = payment.links.find(link => link.rel === 'approval_url');
      
      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          approvalUrl: approvalUrl.href,
          amount,
          currency,
          licenseType,
          duration
        }
      });
    });
  } catch (error) {
    console.error('PayPal payment creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment creation failed',
      error: error.message
    });
  }
});

// Execute PayPal payment
router.post('/paypal/execute-payment', authenticateToken, async (req, res) => {
  try {
    const { paymentId, payerId } = req.body;
    
    if (!paymentId || !payerId) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID and Payer ID required'
      });
    }

    const executePaymentData = {
      payer_id: payerId
    };

    paypal.payment.execute(paymentId, executePaymentData, async (error, payment) => {
      if (error) {
        console.error('PayPal payment execution failed:', error);
        return res.status(500).json({
          success: false,
          message: 'PayPal payment execution failed',
          error: error.message
        });
      }

      if (payment.state !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Payment not approved'
        });
      }

      try {
        const customData = JSON.parse(payment.transactions[0].custom);
        
        // Verify the payment belongs to the current user
        if (customData.userId !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'Payment verification failed'
          });
        }

        const { licenseType, duration } = customData;
        const amount = parseFloat(payment.transactions[0].amount.total);
        const currency = payment.transactions[0].amount.currency;
        
        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(duration));

        // Create license
        const license = await License.create({
          userId: req.user.id,
          licenseType,
          expiryDate,
          paymentId: paymentId,
          paymentMethod: 'paypal',
          amount,
          currency
        });

        // Update user license
        await req.user.updateLicense(licenseType, parseInt(duration));

        // Store payment record
        await db.collection(COLLECTIONS.PAYMENTS).add({
          userId: req.user.id,
          licenseId: license.id,
          paymentId: paymentId,
          paymentMethod: 'paypal',
          amount,
          currency,
          status: 'completed',
          licenseType,
          duration: parseInt(duration),
          createdAt: new Date()
        });

        res.json({
          success: true,
          message: 'Payment completed and license activated',
          data: {
            license: license.toJSON(),
            user: req.user.toJSON()
          }
        });
      } catch (error) {
        console.error('License creation failed:', error);
        res.status(500).json({
          success: false,
          message: 'License creation failed',
          error: error.message
        });
      }
    });
  } catch (error) {
    console.error('PayPal payment execution failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment execution failed',
      error: error.message
    });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.PAYMENTS)
      .where('userId', '==', req.user.id)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
});

// Webhook for Stripe (for handling subscription renewals, etc.)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;