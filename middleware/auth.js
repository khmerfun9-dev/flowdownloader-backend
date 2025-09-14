const jwt = require('jsonwebtoken');
const User = require('../models/User');
const License = require('../models/License');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Verify license key
const verifyLicense = async (req, res, next) => {
  try {
    const licenseKey = req.headers['x-license-key'] || req.body.licenseKey || req.query.licenseKey;
    
    if (!licenseKey) {
      return res.status(401).json({
        success: false,
        message: 'License key required'
      });
    }

    const verification = await License.verify(licenseKey);
    
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        message: verification.reason
      });
    }

    req.license = verification.license;
    req.licenseInfo = verification.licenseInfo;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'License verification failed',
      error: error.message
    });
  }
};

// Check download permissions
const checkDownloadPermission = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const downloadCheck = await user.canDownload();
    
    if (!downloadCheck.canDownload) {
      return res.status(429).json({
        success: false,
        message: 'Daily download limit exceeded',
        remaining: downloadCheck.remaining,
        dailyLimit: downloadCheck.dailyLimit,
        licenseType: user.licenseType
      });
    }

    req.downloadPermission = downloadCheck;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Permission check failed',
      error: error.message
    });
  }
};

// Check quality permissions
const checkQualityPermission = (req, res, next) => {
  try {
    const user = req.user;
    const requestedQuality = req.body.quality || req.query.quality || '720p';
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const licenseInfo = req.licenseInfo || user.licenseInfo;
    const maxQuality = licenseInfo.max_quality;
    
    // Quality hierarchy: 360p < 480p < 720p < 1080p < original
    const qualityLevels = {
      '360p': 1,
      '480p': 2,
      '720p': 3,
      '1080p': 4,
      'original': 5
    };
    
    const requestedLevel = qualityLevels[requestedQuality] || 3;
    const maxLevel = qualityLevels[maxQuality] || 3;
    
    if (requestedLevel > maxLevel) {
      return res.status(403).json({
        success: false,
        message: `Quality ${requestedQuality} not available with ${user.licenseType} license`,
        maxQuality: maxQuality,
        licenseType: user.licenseType
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Quality permission check failed',
      error: error.message
    });
  }
};

// Optional authentication (for endpoints that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Ignore token errors for optional auth
      }
    }

    next();
  } catch (error) {
    next(); // Continue without authentication
  }
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.licenseType !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  verifyLicense,
  checkDownloadPermission,
  checkQualityPermission,
  optionalAuth,
  requireAdmin
};