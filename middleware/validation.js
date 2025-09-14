const Joi = require('joi');

// Validation schemas
const conversionSchema = Joi.object({
  format: Joi.string().valid('mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'mp3', 'wav', 'aac', 'flac', 'ogg').optional(),
  quality: Joi.string().valid('480p', '720p', '1080p', '1440p', '2160p').optional(),
  codec: Joi.string().valid('libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'aac', 'mp3', 'libvorbis', 'flac').optional(),
  bitrate: Joi.string().pattern(/^\d+k$/).optional() // e.g., "192k", "320k"
});

const downloadSchema = Joi.object({
  url: Joi.string().uri().required(),
  format: Joi.string().valid('mp4', 'mp3', 'webm', 'best').default('mp4'),
  quality: Joi.string().valid('480p', '720p', '1080p', '1440p', '2160p', 'best').default('720p')
});

// Middleware functions
const validateConversionRequest = (req, res, next) => {
  const { error } = conversionSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(detail => detail.message)
    });
  }
  
  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }
  
  next();
};

const validateDownloadRequest = (req, res, next) => {
  const { error, value } = downloadSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details.map(detail => detail.message)
    });
  }
  
  // Replace req.body with validated and default values
  req.body = value;
  
  // Validate URL format for supported platforms
  const url = req.body.url;
  const supportedPlatforms = [
    /^https?:\/\/(www\.)?(facebook|fb)\.com\/.+/,
    /^https?:\/\/(www\.)?instagram\.com\/.+/,
    /^https?:\/\/(www\.)?tiktok\.com\/.+/,
    /^https?:\/\/(www\.)?youtube\.com\/.+/,
    /^https?:\/\/(www\.)?youtu\.be\/.+/,
    /^https?:\/\/(www\.)?twitter\.com\/.+/,
    /^https?:\/\/(www\.)?x\.com\/.+/
  ];
  
  const isSupported = supportedPlatforms.some(pattern => pattern.test(url));
  
  if (!isSupported) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported platform',
      message: 'URL must be from Facebook, Instagram, TikTok, YouTube, or Twitter/X'
    });
  }
  
  next();
};

const validateJobId = (req, res, next) => {
  const { jobId } = req.params;
  
  if (!jobId || typeof jobId !== 'string' || jobId.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'Invalid job ID'
    });
  }
  
  next();
};

// File size validation middleware
const validateFileSize = (maxSize = 500 * 1024 * 1024) => { // 500MB default
  return (req, res, next) => {
    if (req.file && req.file.size > maxSize) {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: `File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB`
      });
    }
    next();
  };
};

// Rate limiting validation
const validateRateLimit = (req, res, next) => {
  // This would typically integrate with Redis or a database
  // For now, we'll use a simple in-memory store
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 10;
  
  if (!global.rateLimitStore) {
    global.rateLimitStore = new Map();
  }
  
  const clientData = global.rateLimitStore.get(clientIP) || { requests: [], lastReset: now };
  
  // Clean old requests
  clientData.requests = clientData.requests.filter(timestamp => now - timestamp < windowMs);
  
  if (clientData.requests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: `Too many conversion requests. Try again in ${Math.ceil((windowMs - (now - clientData.requests[0])) / 1000)} seconds.`
    });
  }
  
  clientData.requests.push(now);
  global.rateLimitStore.set(clientIP, clientData);
  
  next();
};

module.exports = {
  validateConversionRequest,
  validateDownloadRequest,
  validateJobId,
  validateFileSize,
  validateRateLimit
};