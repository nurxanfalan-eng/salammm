const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const axios = require('axios');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(morgan('combined'));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: extract TikTok video ID from URL ───────────────────────────────
function extractTikTokVideoId(url) {
  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/v\/(\d+)/,
    /vm\.tiktok\.com\/(\w+)/,
    /vt\.tiktok\.com\/(\w+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Helper: resolve short URL ───────────────────────────────────────────────
async function resolveShortUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      validateStatus: () => true,
    });
    return response.request.res.responseUrl || response.config.url || url;
  } catch (e) {
    return url;
  }
}

// ─── Helper: fetch video info via TikTok API (no watermark) ──────────────────
async function fetchTikTokNoWatermark(videoUrl) {
  try {
    // Method 1: tikwm API (most reliable, no watermark HD)
    const tikwmRes = await axios.get('https://www.tikwm.com/api/', {
      params: { url: videoUrl, hd: 1 },
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.tikwm.com/',
      }
    });

    if (tikwmRes.data && tikwmRes.data.code === 0 && tikwmRes.data.data) {
      const d = tikwmRes.data.data;
      const hdPlay = d.hdplay || d.play || '';
      const sdPlay = d.play || '';
      return {
        success: true,
        method: 'tikwm',
        title: d.title || 'TikTok Video',
        author: d.author?.nickname || d.author?.unique_id || 'Unknown',
        cover: d.cover || d.origin_cover || '',
        duration: d.duration || 0,
        hdUrl: hdPlay,
        sdUrl: sdPlay,
        noWatermarkUrl: hdPlay || sdPlay,
        musicUrl: d.music_info?.play || d.music || '',
        stats: {
          plays: d.play_count || 0,
          likes: d.digg_count || 0,
          comments: d.comment_count || 0,
          shares: d.share_count || 0,
        }
      };
    }
  } catch (e) {
    console.error('tikwm error:', e.message);
  }

  try {
    // Method 2: ssstik.io scraper approach via another API
    const ssRes = await axios.post('https://savetik.co/api/ajaxSearch', 
      new URLSearchParams({ q: videoUrl, lang: 'en' }).toString(),
      {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://savetik.co/',
          'X-Requested-With': 'XMLHttpRequest',
        }
      }
    );
    if (ssRes.data && ssRes.data.status === 'ok' && ssRes.data.data) {
      const html = ssRes.data.data;
      // Extract download link from HTML
      const hdMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*>.*?HD/i);
      const anyMatch = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i);
      const titleMatch = html.match(/<p[^>]*class="[^"]*tik-name[^"]*"[^>]*>([^<]+)<\/p>/i) ||
                         html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      
      const downloadUrl = (hdMatch && hdMatch[1]) || (anyMatch && anyMatch[1]) || '';
      if (downloadUrl) {
        return {
          success: true,
          method: 'savetik',
          title: (titleMatch && titleMatch[1]) || 'TikTok Video',
          author: 'Unknown',
          cover: '',
          duration: 0,
          hdUrl: downloadUrl,
          sdUrl: downloadUrl,
          noWatermarkUrl: downloadUrl,
          musicUrl: '',
          stats: {}
        };
      }
    }
  } catch (e) {
    console.error('savetik error:', e.message);
  }

  try {
    // Method 3: snaptik API
    const snapRes = await axios.post('https://snaptik.app/abc2.php',
      new URLSearchParams({ url: videoUrl }).toString(),
      {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://snaptik.app/',
        }
      }
    );
    if (snapRes.data) {
      const html = typeof snapRes.data === 'string' ? snapRes.data : JSON.stringify(snapRes.data);
      const urlMatch = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/);
      if (urlMatch) {
        return {
          success: true,
          method: 'snaptik',
          title: 'TikTok Video',
          author: 'Unknown',
          cover: '',
          duration: 0,
          hdUrl: urlMatch[0],
          sdUrl: urlMatch[0],
          noWatermarkUrl: urlMatch[0],
          musicUrl: '',
          stats: {}
        };
      }
    }
  } catch (e) {
    console.error('snaptik error:', e.message);
  }

  return { success: false, error: 'Video tapılmadı. URL-i yoxlayın.' };
}

// ─── API: Get video info ──────────────────────────────────────────────────────
app.post('/api/video-info', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL tələb olunur' });
    }

    url = url.trim();

    // Validate TikTok URL
    if (!url.includes('tiktok.com') && !url.includes('vm.tiktok') && !url.includes('vt.tiktok')) {
      return res.status(400).json({ success: false, error: 'Zəhmət olmasa düzgün TikTok URL-i daxil edin' });
    }

    // Resolve short URLs
    if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
      url = await resolveShortUrl(url);
    }

    const result = await fetchTikTokNoWatermark(url);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('video-info error:', err);
    res.status(500).json({ success: false, error: 'Server xətası baş verdi' });
  }
});

// ─── API: Download video (proxy) ─────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  try {
    const { url: videoUrl, filename } = req.query;

    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL tələb olunur' });
    }

    const decodedUrl = decodeURIComponent(videoUrl);
    const safeFilename = (filename || 'tiktok_video').replace(/[^a-zA-Z0-9_\-\.]/g, '_') + '.mp4';

    // Fetch the video
    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      maxRedirects: 10,
    });

    const contentType = response.headers['content-type'] || 'video/mp4';
    const contentLength = response.headers['content-length'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    response.data.pipe(res);

    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Video endirilmədi' });
      }
    });

  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Video endirilmədi: ' + err.message });
    }
  }
});

// ─── API: Proxy image (for thumbnails) ───────────────────────────────────────
app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url: imgUrl } = req.query;
    if (!imgUrl) return res.status(400).send('URL required');

    const response = await axios({
      method: 'GET',
      url: decodeURIComponent(imgUrl),
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    response.data.pipe(res);
  } catch (e) {
    res.status(404).send('Image not found');
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ─── Serve frontend ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
