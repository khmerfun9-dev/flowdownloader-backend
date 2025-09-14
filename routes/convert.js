const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpegService = require('../services/ffmpegService');
const { validateConversionRequest } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
      'video/webm', 'video/mkv', 'audio/mp3', 'audio/wav', 'audio/aac',
      'audio/flac', 'audio/ogg'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video and audio files are allowed.'));
    }
  }
});

// Convert video format
router.post('/video', upload.single('video'), validateConversionRequest, async (req, res) => {
  try {
    const { format, quality, codec } = req.body;
    const inputFile = req.file.path;
    const jobId = uuidv4();
    
    // Start conversion process
    const result = await ffmpegService.convertVideo({
      inputFile,
      format: format || 'mp4',
      quality: quality || '720p',
      codec: codec || 'libx264',
      jobId
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Video conversion started',
      outputFile: result.outputFile
    });
    
  } catch (error) {
    console.error('Video conversion error:', error);
    res.status(500).json({
      success: false,
      error: 'Video conversion failed',
      message: error.message
    });
  }
});

// Extract audio from video
router.post('/audio', upload.single('video'), validateConversionRequest, async (req, res) => {
  try {
    const { format, bitrate } = req.body;
    const inputFile = req.file.path;
    const jobId = uuidv4();
    
    const result = await ffmpegService.extractAudio({
      inputFile,
      format: format || 'mp3',
      bitrate: bitrate || '192k',
      jobId
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Audio extraction started',
      outputFile: result.outputFile
    });
    
  } catch (error) {
    console.error('Audio extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Audio extraction failed',
      message: error.message
    });
  }
});

// Get conversion progress
router.get('/progress/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = ffmpegService.getProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      progress
    });
    
  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get progress',
      message: error.message
    });
  }
});

// Download converted file
router.get('/download/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const filePath = ffmpegService.getOutputFile(jobId);
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(path.resolve(filePath));
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// Get supported formats
router.get('/formats', (req, res) => {
  res.json({
    success: true,
    formats: {
      video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'],
      audio: ['mp3', 'wav', 'aac', 'flac', 'ogg'],
      qualities: ['480p', '720p', '1080p', '1440p', '2160p'],
      codecs: {
        video: ['libx264', 'libx265', 'libvpx', 'libvpx-vp9'],
        audio: ['aac', 'mp3', 'libvorbis', 'flac']
      }
    }
  });
});

module.exports = router;