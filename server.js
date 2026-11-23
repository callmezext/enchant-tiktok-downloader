const express = require('express');
const cors = require('cors');
const axios = require('axios');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Helper to get system & server metrics
function getServerStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
  const cpuCores = cpus.length;
  const loadAvg = os.loadavg();
  const uptimeSeconds = os.uptime();
  const processUptime = process.uptime();

  let diskInfo = { total: 'N/A', used: 'N/A', free: 'N/A', percent: 'N/A' };
  try {
    const dfOut = execSync('df -h / 2>/dev/null', { timeout: 1500 }).toString();
    const lines = dfOut.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].replace(/\s+/g, ' ').split(' ');
      if (parts.length >= 5) {
        diskInfo = {
          total: parts[1],
          used: parts[2],
          free: parts[3],
          percent: parts[4]
        };
      }
    }
  } catch (e) {}

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    nodeVersion: process.version,
    cpuModel,
    cpuCores,
    loadAvg: loadAvg.map(l => l.toFixed(2)).join(', '),
    memory: {
      total: (totalMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      used: (usedMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      free: (freeMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      percent: memUsagePercent + '%'
    },
    disk: diskInfo,
    serverUptime: formatUptime(uptimeSeconds),
    processUptime: formatUptime(processUptime)
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}h`);
  if (h > 0) parts.push(`${h}j`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}d`);
  return parts.join(' ');
}

const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to format numbers (e.g. 1.2M, 45.3K)
function formatNumber(num) {
  if (!num && num !== 0) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toLocaleString();
}

// Helper to format duration in MM:SS
function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Extract TikTok video ID or clean URL
function extractTikTokUrl(rawUrl) {
  if (!rawUrl) return null;
  const match = rawUrl.trim().match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com\/[^\s]+|vt\.tiktok\.com\/[^\s]+|vm\.tiktok\.com\/[^\s]+)/i);
  return match ? match[0] : rawUrl.trim();
}

// Fetch from TikWM API
async function fetchTikWM(url) {
  const endpoint = 'https://www.tikwm.com/api/';
  const params = new URLSearchParams({
    url: url,
    hd: '1'
  });

  const response = await axios.post(endpoint, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  if (response.data && response.data.code === 0 && response.data.data) {
    const d = response.data.data;
    
    // Check if it's an image slide / photo post
    const isImagePost = Array.isArray(d.images) && d.images.length > 0;

    return {
      success: true,
      id: d.id,
      title: d.title || 'TikTok Video',
      duration: d.duration || 0,
      formattedDuration: formatDuration(d.duration),
      isImagePost: isImagePost,
      images: isImagePost ? d.images : [],
      cover: d.origin_cover || d.cover || d.ai_dynamic_cover || '',
      dynamicCover: d.ai_dynamic_cover || '',
      
      // Video downloads
      downloads: {
        superHd: d.hdplay ? (d.hdplay.startsWith('http') ? d.hdplay : `https://www.tikwm.com${d.hdplay}`) : (d.play || null),
        directSuperHd: d.hdplay || null,
        hd: d.play ? (d.play.startsWith('http') ? d.play : `https://www.tikwm.com${d.play}`) : null,
        watermark: d.wmplay ? (d.wmplay.startsWith('http') ? d.wmplay : `https://www.tikwm.com${d.wmplay}`) : null,
        audio: d.music || (d.music_info && d.music_info.play ? d.music_info.play : null)
      },

      sizes: {
        superHd: d.hd_size || null,
        hd: d.size || null,
        watermark: d.wm_size || null
      },

      author: {
        id: d.author ? d.author.id : '',
        uniqueId: d.author ? d.author.unique_id : 'unknown',
        nickname: d.author ? d.author.nickname : 'TikTok Creator',
        avatar: d.author ? d.author.avatar : ''
      },

      music: {
        id: d.music_info ? d.music_info.id : '',
        title: d.music_info ? d.music_info.title : 'Original Sound',
        author: d.music_info ? d.music_info.author : (d.author ? d.author.nickname : ''),
        cover: d.music_info ? d.music_info.cover : '',
        duration: d.music_info ? formatDuration(d.music_info.duration) : ''
      },

      stats: {
        views: formatNumber(d.play_count),
        likes: formatNumber(d.digg_count),
        comments: formatNumber(d.comment_count),
        shares: formatNumber(d.share_count),
        downloads: formatNumber(d.download_count),
        raw: {
          views: d.play_count || 0,
          likes: d.digg_count || 0,
          comments: d.comment_count || 0,
          shares: d.share_count || 0
        }
      },

      createTime: d.create_time ? new Date(d.create_time * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : ''
    };
  }

  throw new Error(response.data.msg || 'Gagal memproses video dari TikTok.');
}

// Alternative TikTok API Fallback
async function fetchTiklyDown(url) {
  const endpoint = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;
  const response = await axios.get(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  if (response.data && response.data.id) {
    const d = response.data;
    const isImagePost = Array.isArray(d.images) && d.images.length > 0;
    const superHdUrl = (d.video && (d.video.noWatermarkHd || d.video.noWatermark)) || null;

    return {
      success: true,
      id: d.id,
      title: d.title || 'TikTok Video',
      duration: 0,
      formattedDuration: '00:00',
      isImagePost: isImagePost,
      images: isImagePost ? d.images.map(img => typeof img === 'string' ? img : img.url) : [],
      cover: (d.video && d.video.cover) || '',
      dynamicCover: (d.video && d.video.dynamic_cover) || '',
      downloads: {
        superHd: superHdUrl,
        directSuperHd: superHdUrl,
        hd: (d.video && d.video.noWatermark) || superHdUrl,
        watermark: (d.video && d.video.watermark) || null,
        audio: (d.music && d.music.play_url) || null
      },
      sizes: {
        superHd: null,
        hd: null,
        watermark: null
      },
      author: {
        id: (d.author && d.author.id) || '',
        uniqueId: (d.author && d.author.unique_id) || 'unknown',
        nickname: (d.author && d.author.name) || 'TikTok Creator',
        avatar: (d.author && d.author.avatar) || ''
      },
      music: {
        id: (d.music && d.music.id) || '',
        title: (d.music && d.music.title) || 'Original Sound',
        author: (d.music && d.music.author) || '',
        cover: (d.music && d.music.cover_hd) || '',
        duration: ''
      },
      stats: {
        views: formatNumber(d.stats && d.stats.playCount),
        likes: formatNumber(d.stats && d.stats.likeCount),
        comments: formatNumber(d.stats && d.stats.commentCount),
        shares: formatNumber(d.stats && d.stats.shareCount),
        downloads: '0',
        raw: {
          views: (d.stats && d.stats.playCount) || 0,
          likes: (d.stats && d.stats.likeCount) || 0,
          comments: (d.stats && d.stats.commentCount) || 0,
          shares: (d.stats && d.stats.shareCount) || 0
        }
      },
      createTime: d.created_at || ''
    };
  }

  throw new Error('Fallback API gagal.');
}

const WhatsAppBotManager = require('./wa-bot');

// Persistent settings storage
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const SESSIONS_FILE = path.join(__dirname, 'wa_session', 'sessions.json');

let currentSettings = { waBotNumber: '628xxxxxxxxxx' };
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    currentSettings = JSON.parse(raw);
  }
} catch (e) {
  console.error('Error reading settings.json:', e.message);
}

let currentWaBotNumber = currentSettings.waBotNumber || process.env.WA_BOT_NUMBER || '628xxxxxxxxxx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Wangy321';
const ADMIN_TOKEN = 'enchant_admin_secret_token_wangy321';

// Persistent Video Session Storage for WhatsApp Bot Integration
const videoSessions = new Map();

function loadSessionsFromDisk() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const list = JSON.parse(raw);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000;
      for (const item of list) {
        if (item.sessionCode && (now - item.createdAt < maxAge)) {
          videoSessions.set(item.sessionCode, item);
        }
      }
      console.log(`[SESSION] Loaded ${videoSessions.size} active video sessions from disk.`);
    }
  } catch (e) {
    console.error('Error reading sessions.json:', e.message);
  }
}

function saveSessionsToDisk() {
  try {
    const list = Array.from(videoSessions.values());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving sessions.json:', e.message);
  }
}

// Load sessions on startup
loadSessionsFromDisk();

function saveSession(sessionCode, data) {
  videoSessions.set(sessionCode, data);
  saveSessionsToDisk();
}

// Initialize WhatsApp Bot Manager with Zapo-JS
const waBot = new WhatsAppBotManager({
  defaultBotNumber: currentWaBotNumber,
  videoSessions: videoSessions,
  saveSession: saveSession,
  getServerStats: getServerStats,
  fetchTikTok: fetchTikWM,
  resolveShortUrl: resolveTikTokShortUrl,
  extractUrl: extractTikTokUrl,
  generateSessionCode: generateSessionCode
});

// Start WhatsApp Bot Client in background
waBot.init();

// Helper to generate unique session code: ENCHANT-TIKTOK-XXXXXX
function generateSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ENCHANT-TIKTOK-${rand}`;
}

// Prune sessions older than 24 hours
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  let pruned = false;
  for (const [code, item] of videoSessions.entries()) {
    if (now - item.createdAt > maxAge) {
      videoSessions.delete(code);
      pruned = true;
    }
  }
  if (pruned) saveSessionsToDisk();
}, 60 * 60 * 1000);

// Middleware: Require Admin Password Token
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth === `Bearer ${ADMIN_TOKEN}` || req.query.token === ADMIN_TOKEN) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized - Password required' });
}

// Serve /admin Web Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Admin Login (Password: Wangy321)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_TOKEN });
  }
  return res.status(401).json({ success: false, message: 'Password salah!' });
});

// API: Admin Bot Status & Live Sessions
app.get('/api/admin/bot-status', requireAdmin, (req, res) => {
  const botStatus = waBot.getStatus();
  const sessionsList = [];
  for (const [code, item] of videoSessions.entries()) {
    sessionsList.push({
      code: item.sessionCode,
      title: item.title,
      author: item.author?.uniqueId,
      timeAgo: new Date(item.createdAt).toLocaleTimeString('id-ID'),
      createdAt: item.createdAt
    });
  }
  sessionsList.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    ...botStatus,
    botPhoneNumber: currentWaBotNumber,
    sessions: sessionsList,
    serverStats: getServerStats()
  });
});

// API: Admin Bot Action (Connect / Disconnect / Restart)
app.post('/api/admin/bot-action', requireAdmin, async (req, res) => {
  const { action } = req.body;
  try {
    if (action === 'connect' || action === 'qr') {
      await waBot.init({ forceQr: true });
    } else if (action === 'disconnect') {
      await waBot.disconnect();
    } else if (action === 'restart') {
      await waBot.restart();
    } else if (action === 'reset') {
      await waBot.resetSession({ startQr: true });
    }
    res.json({ success: true, status: waBot.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Gagal menjalankan aksi bot' });
  }
});

// API: Request WhatsApp 8-digit Pairing Code
app.post('/api/admin/request-pairing-code', requireAdmin, async (req, res) => {
  const { phoneNumber } = req.body;
  try {
    const code = await waBot.requestPairingCode(phoneNumber || currentWaBotNumber);
    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Admin Update Settings (e.g. Bot Phone Number)
app.post('/api/admin/update-settings', requireAdmin, (req, res) => {
  const { waBotNumber } = req.body;
  if (waBotNumber) {
    let cleaned = waBotNumber.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    currentWaBotNumber = cleaned;
    currentSettings.waBotNumber = cleaned;
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write settings.json:', e.message);
    }
    waBot.setBotNumber(currentWaBotNumber);
  }
  res.json({ success: true, waBotNumber: currentWaBotNumber });
});

// API: Public Config Endpoint
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    waBotNumber: currentWaBotNumber
  });
});

// API: Bot Query Session Endpoint (For WhatsApp Bot to fetch video details by code)
app.get('/api/session/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const session = videoSessions.get(code);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Kode sesi tidak ditemukan atau sudah kadaluarsa (berlaku 24 jam).'
    });
  }

  res.json({
    success: true,
    code: session.sessionCode,
    createdAt: session.createdAt,
    data: session
  });
});
// API: Internal register session from Enchant AIO
app.post('/api/internal/register-session', (req, res) => {
  const { sessionCode, data } = req.body;
  if (!sessionCode || !data) {
    return res.status(400).json({ success: false, message: 'Missing sessionCode or data' });
  }
  saveSession(sessionCode, { ...data, sessionCode, createdAt: Date.now() });
  res.json({ success: true, sessionCode });
});

// API: Bot Query alternative endpoint: /api/bot/get-video?code=...
app.get('/api/bot/get-video', (req, res) => {
  const code = (req.query.code || '').trim().toUpperCase();
  const session = videoSessions.get(code);

  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Kode sesi tidak ditemukan atau sudah kadaluarsa.'
    });
  }

  res.json({
    success: true,
    code: session.sessionCode,
    title: session.title,
    author: session.author,
    downloads: session.downloads,
    images: session.images,
    isImagePost: session.isImagePost
  });
});

// Helper to follow redirects for short links (vt.tiktok.com, vm.tiktok.com)
async function resolveTikTokShortUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  if (rawUrl.includes('vt.tiktok.com') || rawUrl.includes('vm.tiktok.com') || rawUrl.includes('/t/')) {
    try {
      const response = await axios.get(rawUrl, {
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });
      const resolved = response.request?.res?.responseUrl || response.request?.path;
      if (resolved && resolved.includes('tiktok.com')) return resolved;
    } catch (e) {
      if (e.response?.headers?.location) {
        return e.response.headers.location;
      }
    }
  }
  return rawUrl;
}

// API: Analyze TikTok URL
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: 'Harap masukkan link TikTok yang valid!' });
  }

  const cleanedUrl = extractTikTokUrl(url);
  if (!cleanedUrl) {
    return res.status(400).json({ success: false, message: 'Link TikTok tidak dikenali. Pastikan format link benar (contoh: https://vt.tiktok.com/... atau https://www.tiktok.com/@user/video/...)' });
  }

  try {
    let targetUrl = cleanedUrl;
    try {
      targetUrl = await resolveTikTokShortUrl(cleanedUrl);
    } catch (e) {
      targetUrl = cleanedUrl;
    }

    if (targetUrl === 'https://www.tiktok.com/' || targetUrl === 'https://www.tiktok.com/?_r=1') {
      return res.status(400).json({
        success: false,
        message: 'Link video TikTok tidak valid atau video sudah dihapus. Pastikan link disalin langsung dari tombol Share video.'
      });
    }

    let data;
    // Try primary provider (TikWM with Super HD support)
    try {
      data = await fetchTikWM(targetUrl);
    } catch (primaryErr) {
      console.warn('Primary TikWM API failed, trying fallback:', primaryErr.message);
      data = await fetchTikWM(cleanedUrl); // Try original url as fallback
    }

    // Attach unique session code for WhatsApp Bot
    const sessionCode = generateSessionCode();
    data.sessionCode = sessionCode;
    data.waBotNumber = currentWaBotNumber;

    // Save session persistently (expires in 24h)
    saveSession(sessionCode, {
      ...data,
      createdAt: Date.now()
    });

    return res.json(data);
  } catch (error) {
    console.error('All APIs failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data video. Pastikan akun tidak privat dan link video masih aktif.'
    });
  }
});

// API: Media Streaming Proxy (For in-browser video & audio playback with HTTP Range support)
app.get('/api/stream', async (req, res) => {
  const { url, type } = req.query;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const customHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://www.tiktok.com/'
    };

    if (req.headers.range) {
      customHeaders['Range'] = req.headers.range;
    }

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: customHeaders,
      timeout: 20000,
      validateStatus: status => (status >= 200 && status < 300) || status === 206
    });

    const contentType = type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4');

    res.status(response.status);
    res.setHeader('Content-Type', response.headers['content-type'] || contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error('Streaming proxy error:', err.message);
    res.status(500).send('Streaming error');
  }
});

// API: Proxy Download Streaming (Forces download, handles CDN CORS & headers)
app.get('/api/download', async (req, res) => {
  const { url, filename, type } = req.query;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    // Clean and format filename: "Enchant-Downloader - Caption.mp4"
    let cleanName = (filename || 'Enchant-Downloader - Video')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanName.toLowerCase().startsWith('enchant-downloader')) {
      cleanName = `Enchant-Downloader - ${cleanName}`;
    }

    const extension = type === 'audio' ? '.mp3' : (type === 'image' ? '.jpg' : '.mp4');
    const finalFilename = cleanName.toLowerCase().endsWith(extension) ? cleanName : `${cleanName}${extension}`;
    const encodedFilename = encodeURIComponent(finalFilename);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://www.tiktok.com/'
    };

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: headers,
      timeout: 30000
    });

    const contentType = type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4');

    // Clean ASCII filename for standard Content-Disposition filename="..." and UTF-8 encoded for modern browsers
    const asciiFilename = finalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', contentType);
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error('Download proxy error:', err.message);
    res.status(500).send('Gagal mengunduh file secara langsung. Silakan gunakan link langsung.');
  }
});

// API: Batch Download TikTok Image Slides as ZIP
app.post('/api/download-zip', async (req, res) => {
  const { images, title, author } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ success: false, message: 'Tidak ada gambar untuk diunduh' });
  }

  try {
    const zipFilename = `EnchantDownloader_${(author || 'tiktok')}_photos_${Date.now()}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      try {
        const imgStream = await axios({
          method: 'GET',
          url: imgUrl,
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://www.tiktok.com/'
          },
          timeout: 15000
        });

        archive.append(imgStream.data, { name: `photo_${(i + 1).toString().padStart(2, '0')}.jpg` });
      } catch (imgErr) {
        console.warn(`Failed to fetch image slide ${i + 1}:`, imgErr.message);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('ZIP generation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Gagal membuat file ZIP.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`✨ Enchant Downloader running at http://localhost:${PORT}`);
});
