const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const License = require('../models/License');
const { authenticateToken, verifyLicense } = require('../middleware/auth');
const { LICENSE_TYPES } = require('../config/firebase');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const licenseActivationSchema = Joi.object({
  licenseKey: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Create user
    const user = await User.create(value);
    const token = user.generateToken();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Authenticate user
    const user = await User.authenticate(value.email, value.password);
    const token = user.generateToken();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const downloadCheck = await user.canDownload();

    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        downloadPermission: downloadCheck
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Activate license key
router.post('/activate-license', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = licenseActivationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    // Verify license key
    const verification = await License.verify(value.licenseKey);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.reason
      });
    }

    const license = verification.license;
    
    // Check if license is already assigned to another user
    if (license.userId && license.userId !== req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'License key is already in use'
      });
    }

    // Update user license
    const expiryDays = license.expiryDate ? 
      Math.ceil((new Date(license.expiryDate.toDate()) - new Date()) / (1000 * 60 * 60 * 24)) : 
      null;
    
    await req.user.updateLicense(license.licenseType, expiryDays);

    // Update license with user ID if not already set
    if (!license.userId) {
      await db.collection(COLLECTIONS.LICENSES).doc(license.id).update({
        userId: req.user.id,
        updatedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'License activated successfully',
      data: {
        user: req.user.toJSON(),
        license: license.toJSON()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Verify license key (public endpoint)
router.post('/verify-license', async (req, res) => {
  try {
    const { error, value } = licenseActivationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const verification = await License.verify(value.licenseKey);
    
    res.json({
      success: true,
      data: {
        valid: verification.valid,
        reason: verification.reason || null,
        licenseInfo: verification.licenseInfo || null,
        license: verification.license ? {
          licenseType: verification.license.licenseType,
          status: verification.license.status,
          expiryDate: verification.license.expiryDate,
          isValid: verification.license.isValid(),
          daysUntilExpiry: verification.license.getDaysUntilExpiry()
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get license types and pricing
router.get('/license-types', (req, res) => {
  res.json({
    success: true,
    data: LICENSE_TYPES
  });
});

// Get user's licenses
router.get('/my-licenses', authenticateToken, async (req, res) => {
  try {
    const licenses = await License.findByUserId(req.user.id);
    
    res.json({
      success: true,
      data: licenses.map(license => license.toJSON())
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Refresh token
router.post('/refresh-token', authenticateToken, (req, res) => {
  try {
    const newToken = req.user.generateToken();
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;