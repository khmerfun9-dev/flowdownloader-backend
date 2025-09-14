# FlowDownloader Backend

Node.js backend API for FlowDownloader with FFmpeg integration for video/audio conversion and download capabilities.

## Features

- 🎬 **Video Conversion**: Convert between multiple video formats (MP4, AVI, MOV, WebM, etc.)
- 🎵 **Audio Extraction**: Extract and convert audio from videos (MP3, WAV, AAC, FLAC)
- 📱 **Social Media Downloads**: Download videos from Facebook, Instagram, TikTok, YouTube
- 🔄 **Quality Control**: Support for multiple resolutions (480p to 4K)
- 📊 **Progress Tracking**: Real-time conversion and download progress
- 🚀 **Batch Processing**: Handle multiple files simultaneously
- 🛡️ **Security**: Rate limiting, file validation, and secure uploads

## Prerequisites

- Node.js 16.0.0 or higher
- FFmpeg (automatically installed via ffmpeg-static)
- yt-dlp (automatically installed via yt-dlp-wrap)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Start the production server:**
   ```bash
   npm start
   ```

## API Endpoints

### Health Check
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health with dependencies
- `GET /api/health/system` - System information
- `POST /api/health/test/ffmpeg` - Test FFmpeg functionality
- `POST /api/health/test/ytdlp` - Test yt-dlp functionality

### Video Conversion
- `POST /api/convert/video` - Convert video format/quality
- `POST /api/convert/audio` - Extract audio from video
- `GET /api/convert/progress/:jobId` - Get conversion progress
- `GET /api/convert/download/:jobId` - Download converted file
- `GET /api/convert/formats` - Get supported formats

### Video Download
- `POST /api/download` - Download video from URL
- `POST /api/download/batch` - Batch download multiple URLs
- `POST /api/download/info` - Get video info without downloading
- `GET /api/download/progress/:jobId` - Get download progress
- `GET /api/download/file/:jobId` - Download completed file

## Usage Examples

### Convert Video Format
```javascript
const formData = new FormData();
formData.append('video', videoFile);
formData.append('format', 'mp4');
formData.append('quality', '1080p');
formData.append('codec', 'libx264');

const response = await fetch('/api/convert/video', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Job ID:', result.jobId);
```

### Download from Social Media
```javascript
const response = await fetch('/api/download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://www.instagram.com/p/example/',
    format: 'mp4',
    quality: '720p'
  })
});

const result = await response.json();
console.log('Download started:', result.jobId);
```

### Track Progress
```javascript
const checkProgress = async (jobId) => {
  const response = await fetch(`/api/convert/progress/${jobId}`);
  const result = await response.json();
  
  console.log(`Progress: ${result.progress.percent}%`);
  
  if (result.progress.percent === 100) {
    // Download completed file
    window.location.href = `/api/convert/download/${jobId}`;
  }
};

// Check progress every 2 seconds
setInterval(() => checkProgress(jobId), 2000);
```

## Supported Platforms

- ✅ YouTube
- ✅ Facebook
- ✅ Instagram
- ✅ TikTok
- ✅ Twitter/X
- 🔄 More platforms coming soon...

## Supported Formats

### Video Formats
- MP4, AVI, MOV, WMV, FLV, WebM, MKV

### Audio Formats
- MP3, WAV, AAC, FLAC, OGG

### Quality Options
- 480p, 720p, 1080p, 1440p, 2160p (4K)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment mode |
| `FRONTEND_URL` | http://localhost:5173 | Frontend URL for CORS |
| `MAX_FILE_SIZE` | 500MB | Maximum upload file size |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Max requests per window |
| `FILE_MAX_AGE_HOURS` | 24 | File cleanup age |

### File Structure
```
backend/
├── routes/
│   ├── convert.js      # Video conversion endpoints
│   ├── download.js     # Video download endpoints
│   └── health.js       # Health check endpoints
├── services/
│   └── ffmpegService.js # FFmpeg operations
├── middleware/
│   └── validation.js   # Request validation
├── uploads/            # Temporary upload files
├── downloads/          # Downloaded videos
├── output/             # Converted files
└── server.js           # Main server file
```

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

## Rate Limiting

- 100 requests per 15 minutes per IP
- 10 conversion requests per 15 minutes per IP
- File size limit: 500MB

## Security Features

- Helmet.js for security headers
- CORS configuration
- File type validation
- Rate limiting
- Input sanitization
- Automatic file cleanup

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Debug Mode
```bash
DEBUG=* npm run dev
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure proper CORS origins
3. Set up reverse proxy (nginx)
4. Configure file storage (AWS S3, etc.)
5. Set up monitoring and logging

## License

MIT License - see LICENSE file for details.