const express = require('express');
const { v4: uuidv4 } = require('uuid');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const path = require('path');
const fs = require('fs');
const ffmpegService = require('../services/ffmpegService');
const { validateDownloadRequest, validateRateLimit } = require('../middleware/validation');

const router = express.Router();

// Job tracking for downloads
const downloadJobs = new Map();

// Download video from URL
router.post('/', validateRateLimit, validateDownloadRequest, async (req, res) => {
  try {
    const { url, format, quality } = req.body;
    const jobId = uuidv4();
    const outputDir = path.join(__dirname, '../downloads');
    
    // Ensure download directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Initialize job tracking
    downloadJobs.set(jobId, {
      status: 'starting',
      url,
      format,
      quality,
      startTime: Date.now(),
      progress: 0
    });
    
    // Start download process asynchronously
    downloadVideo(jobId, url, format, quality, outputDir)
      .catch(error => {
        console.error(`Download job ${jobId} failed:`, error);
        downloadJobs.set(jobId, {
          ...downloadJobs.get(jobId),
          status: 'failed',
          error: error.message,
          endTime: Date.now()
        });
      });
    
    res.json({
      success: true,
      jobId,
      message: 'Download started',
      status: 'starting'
    });
    
  } catch (error) {
    console.error('Download initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start download',
      message: error.message
    });
  }
});

// Get download progress
router.get('/progress/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = downloadJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Format response to match frontend expectations
    const response = {
      success: true,
      progress: job.progress || 0,
      status: job.status,
      error: job.error
    };
    
    // Add download URL and filename when completed
    if (job.status === 'completed' && job.outputFile) {
      response.downloadUrl = `/api/download/file/${jobId}`;
      response.filename = path.basename(job.outputFile);
      response.fileSize = job.fileSize;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get progress',
      message: error.message
    });
  }
});

// Download completed file
router.get('/file/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = downloadJobs.get(jobId);
    
    if (!job || job.status !== 'completed') {
      return res.status(404).json({
        success: false,
        error: 'File not ready or job not found'
      });
    }
    
    if (!job.outputFile || !fs.existsSync(job.outputFile)) {
      return res.status(404).json({
        success: false,
        error: 'File not found on disk'
      });
    }
    
    const filename = path.basename(job.outputFile);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(path.resolve(job.outputFile));
    
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// Get video info without downloading
router.post('/info', validateDownloadRequest, async (req, res) => {
  try {
    const { url } = req.body;
    
    const info = await ytDlpWrap.getVideoInfo(url);
    
    res.json({
      success: true,
      info: {
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        uploader: info.uploader,
        view_count: info.view_count,
        upload_date: info.upload_date,
        formats: info.formats?.map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          quality: f.quality,
          filesize: f.filesize,
          width: f.width,
          height: f.height,
          fps: f.fps,
          vcodec: f.vcodec,
          acodec: f.acodec
        })) || []
      }
    });
    
  } catch (error) {
    console.error('Video info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get video info',
      message: error.message
    });
  }
});

// Batch download multiple URLs
router.post('/batch', validateRateLimit, async (req, res) => {
  try {
    const { urls, format = 'mp4', quality = '720p' } = req.body;
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required'
      });
    }
    
    if (urls.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 URLs allowed per batch'
      });
    }
    
    const batchId = uuidv4();
    const jobIds = [];
    const outputDir = path.join(__dirname, '../downloads');
    
    // Ensure download directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Start downloads for each URL
    for (const url of urls) {
      const jobId = uuidv4();
      jobIds.push(jobId);
      
      downloadJobs.set(jobId, {
        status: 'starting',
        url,
        format,
        quality,
        batchId,
        startTime: Date.now(),
        progress: 0
      });
      
      // Start download asynchronously
      downloadVideo(jobId, url, format, quality, outputDir)
        .catch(error => {
          console.error(`Batch download job ${jobId} failed:`, error);
          downloadJobs.set(jobId, {
            ...downloadJobs.get(jobId),
            status: 'failed',
            error: error.message,
            endTime: Date.now()
          });
        });
    }
    
    res.json({
      success: true,
      batchId,
      jobIds,
      message: `Batch download started for ${urls.length} URLs`
    });
    
  } catch (error) {
    console.error('Batch download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start batch download',
      message: error.message
    });
  }
});

// Helper function to download video
async function downloadVideo(jobId, url, format, quality, outputDir) {
  try {
    // Update status to downloading
    downloadJobs.set(jobId, {
      ...downloadJobs.get(jobId),
      status: 'downloading'
    });
    
    // Determine output filename
    const timestamp = Date.now();
    const outputTemplate = path.join(outputDir, `${jobId}-${timestamp}.%(ext)s`);
    
    // Configure yt-dlp options as object
    const options = {
      output: outputTemplate,
      noPlaylist: true
    };
    
    // Set format based on request
    if (format === 'mp3') {
      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.audioQuality = '192K';
    } else {
      // Video download
      let formatSelector = 'best';
      
      switch (quality) {
        case '480p':
          formatSelector = 'best[height<=480]';
          break;
        case '720p':
          formatSelector = 'best[height<=720]';
          break;
        case '1080p':
          formatSelector = 'best[height<=1080]';
          break;
        case '1440p':
          formatSelector = 'best[height<=1440]';
          break;
        case '2160p':
          formatSelector = 'best[height<=2160]';
          break;
      }
      
      options.format = formatSelector;
      
      if (format !== 'best') {
        options.recodeVideo = format;
      }
    }
    
    // Execute download with progress tracking
    try {
      // Update progress periodically during download
      const progressTimer = setInterval(() => {
        const currentJob = downloadJobs.get(jobId);
        if (currentJob && currentJob.status === 'downloading') {
          // Simulate progress increase (yt-dlp doesn't provide real-time progress easily)
          const elapsed = Date.now() - currentJob.startTime;
          const estimatedProgress = Math.min(90, Math.floor(elapsed / 1000) * 2); // 2% per second, max 90%
          downloadJobs.set(jobId, {
            ...currentJob,
            progress: estimatedProgress
          });
        }
      }, 1000);
      
      await ytDlpWrap.execPromise([url], options);
      clearInterval(progressTimer);
      
    } catch (error) {
      throw new Error(`yt-dlp failed: ${error.message}`);
    }
    
    // Find the downloaded file
    const allFiles = fs.readdirSync(outputDir);
    const downloadedFiles = allFiles.filter(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      return stats.isFile() && file.includes(jobId);
    });
    
    if (downloadedFiles.length === 0) {
      throw new Error('Downloaded file not found');
    }
    
    const outputFile = path.join(outputDir, downloadedFiles[0]);
    const fileStats = fs.statSync(outputFile);
    const fileSize = fileStats.size;
    
    // Update job status to completed
    downloadJobs.set(jobId, {
      ...downloadJobs.get(jobId),
      status: 'completed',
      outputFile,
      fileSize,
      endTime: Date.now(),
      progress: 100
    });
    
  } catch (error) {
    throw error;
  }
}

// Cleanup old downloads
setInterval(() => {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();
  
  for (const [jobId, job] of downloadJobs.entries()) {
    if (job.endTime && (now - job.endTime) > maxAge) {
      // Delete file
      if (job.outputFile && fs.existsSync(job.outputFile)) {
        fs.unlinkSync(job.outputFile);
      }
      
      // Remove from tracking
      downloadJobs.delete(jobId);
    }
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = router;