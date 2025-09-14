const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Set FFmpeg and FFprobe paths
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Job tracking
const jobs = new Map();
const progressTracking = new Map();

class FFmpegService {
  constructor() {
    this.outputDir = path.join(__dirname, '../output');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // Convert video format and quality
  async convertVideo({ inputFile, format, quality, codec, jobId }) {
    return new Promise((resolve, reject) => {
      const outputFile = path.join(this.outputDir, `${jobId}.${format}`);
      
      // Initialize job tracking
      jobs.set(jobId, {
        status: 'processing',
        inputFile,
        outputFile,
        startTime: Date.now(),
        type: 'video_conversion'
      });
      
      progressTracking.set(jobId, {
        percent: 0,
        currentFps: 0,
        currentKbps: 0,
        targetSize: 0,
        timemark: '00:00:00.00'
      });

      let command = ffmpeg(inputFile)
        .output(outputFile)
        .videoCodec(codec || 'libx264')
        .format(format);

      // Set quality/resolution
      switch (quality) {
        case '480p':
          command = command.size('854x480').videoBitrate('1000k');
          break;
        case '720p':
          command = command.size('1280x720').videoBitrate('2500k');
          break;
        case '1080p':
          command = command.size('1920x1080').videoBitrate('5000k');
          break;
        case '1440p':
          command = command.size('2560x1440').videoBitrate('8000k');
          break;
        case '2160p':
          command = command.size('3840x2160').videoBitrate('15000k');
          break;
        default:
          // Keep original resolution
          break;
      }

      // Add progress tracking
      command.on('progress', (progress) => {
        progressTracking.set(jobId, {
          percent: Math.round(progress.percent || 0),
          currentFps: progress.currentFps || 0,
          currentKbps: progress.currentKbps || 0,
          targetSize: progress.targetSize || 0,
          timemark: progress.timemark || '00:00:00.00'
        });
      });

      command.on('end', () => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          endTime: Date.now()
        });
        
        progressTracking.set(jobId, {
          ...progressTracking.get(jobId),
          percent: 100
        });
        
        resolve({ outputFile, jobId });
      });

      command.on('error', (err) => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'failed',
          error: err.message,
          endTime: Date.now()
        });
        
        reject(err);
      });

      command.run();
    });
  }

  // Extract audio from video
  async extractAudio({ inputFile, format, bitrate, jobId }) {
    return new Promise((resolve, reject) => {
      const outputFile = path.join(this.outputDir, `${jobId}.${format}`);
      
      jobs.set(jobId, {
        status: 'processing',
        inputFile,
        outputFile,
        startTime: Date.now(),
        type: 'audio_extraction'
      });
      
      progressTracking.set(jobId, {
        percent: 0,
        currentKbps: 0,
        timemark: '00:00:00.00'
      });

      let command = ffmpeg(inputFile)
        .output(outputFile)
        .noVideo()
        .audioBitrate(bitrate || '192k')
        .format(format);

      // Set audio codec based on format
      switch (format) {
        case 'mp3':
          command = command.audioCodec('libmp3lame');
          break;
        case 'aac':
          command = command.audioCodec('aac');
          break;
        case 'wav':
          command = command.audioCodec('pcm_s16le');
          break;
        case 'flac':
          command = command.audioCodec('flac');
          break;
        case 'ogg':
          command = command.audioCodec('libvorbis');
          break;
        default:
          break;
      }

      command.on('progress', (progress) => {
        progressTracking.set(jobId, {
          percent: Math.round(progress.percent || 0),
          currentKbps: progress.currentKbps || 0,
          timemark: progress.timemark || '00:00:00.00'
        });
      });

      command.on('end', () => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          endTime: Date.now()
        });
        
        progressTracking.set(jobId, {
          ...progressTracking.get(jobId),
          percent: 100
        });
        
        resolve({ outputFile, jobId });
      });

      command.on('error', (err) => {
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'failed',
          error: err.message,
          endTime: Date.now()
        });
        
        reject(err);
      });

      command.run();
    });
  }

  // Get file information
  async getFileInfo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            duration: metadata.format.duration,
            size: metadata.format.size,
            bitrate: metadata.format.bit_rate,
            format: metadata.format.format_name,
            streams: metadata.streams.map(stream => ({
              type: stream.codec_type,
              codec: stream.codec_name,
              width: stream.width,
              height: stream.height,
              fps: stream.r_frame_rate,
              bitrate: stream.bit_rate
            }))
          });
        }
      });
    });
  }

  // Get conversion progress
  getProgress(jobId) {
    const job = jobs.get(jobId);
    const progress = progressTracking.get(jobId);
    
    if (!job) return null;
    
    return {
      jobId,
      status: job.status,
      progress: progress || { percent: 0 },
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error
    };
  }

  // Get output file path
  getOutputFile(jobId) {
    const job = jobs.get(jobId);
    return job ? job.outputFile : null;
  }

  // Clean up old files and jobs
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const now = Date.now();
    
    for (const [jobId, job] of jobs.entries()) {
      if (job.endTime && (now - job.endTime) > maxAge) {
        // Delete output file
        if (fs.existsSync(job.outputFile)) {
          fs.unlinkSync(job.outputFile);
        }
        
        // Delete input file if it's in uploads
        if (job.inputFile.includes('uploads') && fs.existsSync(job.inputFile)) {
          fs.unlinkSync(job.inputFile);
        }
        
        // Remove from tracking
        jobs.delete(jobId);
        progressTracking.delete(jobId);
      }
    }
  }
}

// Create singleton instance
const ffmpegService = new FFmpegService();

// Schedule cleanup every hour
setInterval(() => {
  ffmpegService.cleanup();
}, 60 * 60 * 1000);

module.exports = ffmpegService;