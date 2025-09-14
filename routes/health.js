const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const YTDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Detailed health check with dependencies
router.get('/detailed', async (req, res) => {
  const health = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {
      ffmpeg: { status: 'unknown', version: null },
      ytdlp: { status: 'unknown', version: null },
      filesystem: { status: 'unknown', directories: {} }
    }
  };

  // Check FFmpeg
  try {
    await new Promise((resolve, reject) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          health.dependencies.ffmpeg = { status: 'error', error: err.message };
          reject(err);
        } else {
          health.dependencies.ffmpeg = { 
            status: 'healthy', 
            formatsCount: Object.keys(formats).length 
          };
          resolve();
        }
      });
    });
  } catch (error) {
    health.dependencies.ffmpeg = { status: 'error', error: error.message };
    health.success = false;
  }

  // Check yt-dlp
  try {
    const ytDlpWrap = new YTDlpWrap();
    const version = await ytDlpWrap.getVersion();
    health.dependencies.ytdlp = { status: 'healthy', version };
  } catch (error) {
    health.dependencies.ytdlp = { status: 'error', error: error.message };
    health.success = false;
  }

  // Check filesystem directories
  const directories = {
    uploads: path.join(__dirname, '../uploads'),
    downloads: path.join(__dirname, '../downloads'),
    output: path.join(__dirname, '../output')
  };

  for (const [name, dir] of Object.entries(directories)) {
    try {
      const exists = fs.existsSync(dir);
      if (exists) {
        const stats = fs.statSync(dir);
        health.dependencies.filesystem.directories[name] = {
          status: 'exists',
          writable: true, // We'll assume writable if it exists
          path: dir
        };
      } else {
        // Try to create directory
        fs.mkdirSync(dir, { recursive: true });
        health.dependencies.filesystem.directories[name] = {
          status: 'created',
          writable: true,
          path: dir
        };
      }
    } catch (error) {
      health.dependencies.filesystem.directories[name] = {
        status: 'error',
        error: error.message,
        path: dir
      };
      health.success = false;
    }
  }

  health.dependencies.filesystem.status = health.success ? 'healthy' : 'error';

  if (health.success) {
    res.json(health);
  } else {
    res.status(503).json(health);
  }
});

// System information
router.get('/system', (req, res) => {
  const os = require('os');
  
  res.json({
    success: true,
    system: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      uptime: os.uptime()
    },
    node: {
      version: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development'
    }
  });
});

// Performance metrics
router.get('/metrics', (req, res) => {
  const metrics = {
    success: true,
    timestamp: new Date().toISOString(),
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };

  // Add custom metrics if available
  if (global.customMetrics) {
    metrics.custom = global.customMetrics;
  }

  res.json(metrics);
});

// Test FFmpeg functionality
router.post('/test/ffmpeg', async (req, res) => {
  try {
    // Test FFmpeg by getting codec information
    const codecs = await new Promise((resolve, reject) => {
      ffmpeg.getAvailableCodecs((err, codecs) => {
        if (err) reject(err);
        else resolve(codecs);
      });
    });

    const videoCodecs = Object.keys(codecs).filter(codec => 
      codecs[codec].type === 'video' && codecs[codec].canEncode
    ).slice(0, 10); // Limit to first 10

    const audioCodecs = Object.keys(codecs).filter(codec => 
      codecs[codec].type === 'audio' && codecs[codec].canEncode
    ).slice(0, 10); // Limit to first 10

    res.json({
      success: true,
      message: 'FFmpeg is working correctly',
      availableCodecs: {
        video: videoCodecs,
        audio: audioCodecs
      },
      totalCodecs: Object.keys(codecs).length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'FFmpeg test failed',
      message: error.message
    });
  }
});

// Test yt-dlp functionality
router.post('/test/ytdlp', async (req, res) => {
  try {
    const { testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } = req.body;
    
    const ytDlpWrap = new YTDlpWrap();
    
    // Test by getting video info (without downloading)
    const info = await ytDlpWrap.getVideoInfo(testUrl);
    
    res.json({
      success: true,
      message: 'yt-dlp is working correctly',
      testResult: {
        title: info.title,
        duration: info.duration,
        uploader: info.uploader,
        formatCount: info.formats?.length || 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'yt-dlp test failed',
      message: error.message
    });
  }
});

module.exports = router;