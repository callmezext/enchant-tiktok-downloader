// Polyfill global.WebSocket for Node.js runtime environment
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}

// WhatsApp Bot Manager using lightweight zapo-js with persistent SQLite store
const { createSqliteStore } = require('@innovatorssoft/store-sqlite');
const { createStore, WaClient, createNoopLogger } = require('zapo-js');
const QRCode = require('qrcode');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Helper to extract text from any WhatsApp message protobuf structure
function extractTextFromMessage(message) {
  if (!message) return '';
  if (message.ephemeralMessage?.message) return extractTextFromMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractTextFromMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractTextFromMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage?.message) return extractTextFromMessage(message.documentWithCaptionMessage.message);
  if (message.editedMessage?.message) return extractTextFromMessage(message.editedMessage.message);

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.interactiveResponseMessage?.body?.text ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.templateButtonReplyMessage?.selectedId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

function hasSavedSqliteAuth(sqlitePath) {
  try {
    if (!fs.existsSync(sqlitePath)) return false;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      const row = db.prepare("SELECT me_jid FROM auth_credentials WHERE me_jid IS NOT NULL AND me_jid != '' LIMIT 1").get();
      return !!(row && row.me_jid);
    } finally {
      db.close();
    }
  } catch (_) {
    return false;
  }
}

class WhatsAppBotManager {
  constructor(options = {}) {
    this.sessionDir = options.sessionDir || path.join(__dirname, 'wa_session');
    this.sqlitePath = path.join(this.sessionDir, 'bot.sqlite');
    this.videoSessions = options.videoSessions || new Map();
    this.saveSession = options.saveSession || null;
    this.client = null;
    this.store = null;
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.botPhoneNumber = options.defaultBotNumber || '628xxxxxxxxxx';
    this.logs = [];

    this.fetchTikTok = options.fetchTikTok || null;
    this.resolveShortUrl = options.resolveShortUrl || null;
    this.extractUrl = options.extractUrl || null;
    this.getServerStats = options.getServerStats || null;
    this.generateSessionCode = options.generateSessionCode || null;
    this.pendingConfirmations = new Map(); // senderJid -> { url, timestamp, timeoutId }

    // Ensure session directory exists
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  log(msg, type = 'info') {
    const entry = {
      time: new Date().toLocaleTimeString('id-ID'),
      msg,
      type
    };
    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();
    console.log(`[WA-BOT] [${entry.time}] ${msg}`);
  }

  setBotNumber(number) {
    if (!number) return;
    let cleaned = number.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    this.botPhoneNumber = cleaned;
    this.log(`Nomor WhatsApp Bot diatur ke: +${this.botPhoneNumber}`);
  }

  async init(options = {}) {
    const forceQr = !!options.forceQr;
    if (this.status === 'connected' && !forceQr) return;
    if (this._isStarting) return;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    const hasPaired = hasSavedSqliteAuth(this.sqlitePath);
    if (!forceQr && !hasPaired) {
      this.status = 'disconnected';
      this.qrDataUrl = null;
      this.pairingCode = null;
      this.log('Mode Standby (belum ada sesi login). Klik Hubungkan / Scan QR di WA Panel untuk menautkan nomor.');
      return;
    }

    this._isStarting = true;
    this._manualStop = false;
    if (!this._pairingReadyWaiters) this._pairingReadyWaiters = [];

    const notifyReady = () => {
      const list = (this._pairingReadyWaiters || []).splice(0);
      for (const r of list) { try { r(true); } catch (_) {} }
    };

    try {
      if (this.client) {
        try { await this.client.disconnect(); } catch (_) {}
        this.client = null;
      }
      this.status = 'connecting';
      this.qrDataUrl = null;
      this.pairingCode = null;
      this.log('Menginisialisasi WhatsApp Bot dengan persistent SQLite database...');

      const sqliteBackend = createSqliteStore({ path: this.sqlitePath });
      this.store = createStore({
        backends: { sqlite: sqliteBackend },
        providers: {
          auth: 'sqlite', signal: 'sqlite', preKey: 'sqlite', session: 'sqlite',
          identity: 'sqlite', senderKey: 'sqlite', appState: 'sqlite',
          messages: 'sqlite', threads: 'sqlite', contacts: 'sqlite', privacyToken: 'sqlite'
        }
      });

      this.client = new WaClient(
        { store: this.store, sessionId: 'enchant-wa-bot', recoverFromClientTooOld: true },
        createNoopLogger()
      );

      this.client.on('auth_qr', async ({ qr }) => {
        this.status = 'connecting';
        this.log('Menerima QR Code baru, silakan scan dari WhatsApp di HP.');
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 8,
            color: { dark: '#0b060d', light: '#ffffff' }
          });
        } catch (e) {
          this.log('Gagal render QR Code: ' + e.message, 'error');
        }
        notifyReady();
      });

      this.client.on('auth_pairing_code', ({ code }) => {
        this.pairingCode = code ? (code.match(/.{1,4}/g)?.join('-') || code) : null;
      });

      this.client.on('auth_pairing_required', async ({ forceManual }) => {
        notifyReady();
        if (forceManual && this.status !== 'connected') {
          this.log('Batas waktu refresh QR habis, kembali ke mode Standby.');
          await this.disconnect();
        }
      });

      this.client.on('auth_paired', ({ credentials }) => {
        this.status = 'connected';
        this.qrDataUrl = null;
        this.pairingCode = null;
        const meJid = credentials?.meJid || '';
        this.connectedNumber = meJid.split('@')[0]?.split(':')[0] || null;
        this.connectedName = credentials?.pushName || null;
        if (this.connectedNumber) this.botPhoneNumber = this.connectedNumber;
        this.log('🎉 WhatsApp Bot BERHASIL TERHUBUNG & TERSIMPAN DI DATABASE!');
      });

      this.client.on('connection', (conn) => {
        if (conn?.status === 'open' || conn?.connected) {
          this.status = 'connected';
          this.qrDataUrl = null;
          this.pairingCode = null;
          const creds = this.client?.getCredentials?.();
          const meJid = creds?.meJid || '';
          this.connectedNumber = meJid.split('@')[0]?.split(':')[0] || this.connectedNumber || null;
          this.connectedName = creds?.pushName || this.connectedName || null;
          if (this.connectedNumber) this.botPhoneNumber = this.connectedNumber;
          this.log('Status koneksi aktif / Online.');
        } else if (conn?.status === 'close') {
          if (conn.reason === 'failure_client_too_old') {
            this.status = 'connecting';
            this.log('Versi WA usang (405), mengambil versi terbaru & menyambung ulang...', 'warn');
            return;
          }
          const wasPaired = hasSavedSqliteAuth(this.sqlitePath);
          if (conn.isLogout) {
            this.log('Perangkat di-logout dari HP, mereset sesi...', 'warn');
            this.resetSession({ startQr: false }).catch(() => {});
            return;
          }
          if (!this._manualStop && wasPaired) {
            this.status = 'connecting';
            this._reconnectTimer = setTimeout(() => {
              if (!this._manualStop && this.status !== 'connected') {
                this.init({ forceQr: false }).catch(() => {});
              }
            }, 4000);
          } else if (!wasPaired) {
            this.status = 'disconnected';
            this.qrDataUrl = null;
            if (!this._manualStop) {
              this.log(`Koneksi terputus (${conn?.reason || 'closed'}, code: ${conn?.code ?? '-'})`, 'warn');
            }
          }
        }
      });

      this.client.on('message', async (msg) => {
        try {
          await this.handleIncomingMessage(msg);
        } catch (err) {
          this.log('Error handling message: ' + err.message, 'error');
        }
      });

      await this.client.connect();
      const creds = this.client?.getCredentials?.();
      if (creds?.meJid) {
        this.status = 'connected';
        this.connectedNumber = creds.meJid.split('@')[0]?.split(':')[0] || null;
        this.connectedName = creds.pushName || null;
        if (this.connectedNumber) this.botPhoneNumber = this.connectedNumber;
        this.qrDataUrl = null;
        this.pairingCode = null;
      }
    } catch (err) {
      this.status = 'disconnected';
      this.log('Gagal memulai bot: ' + err.message, 'error');
    } finally {
      this._isStarting = false;
    }
  }

  async handleIncomingMessage(msg) {
    if (!msg || !msg.message) return;

    const senderJid = msg.key?.remoteJid;
    if (!senderJid) return;

    // Ignore group chats
    if (senderJid.endsWith('@g.us') || senderJid.endsWith('@broadcast') || senderJid.endsWith('@newsletter')) return;

    // Extract text from any message wrapper
    const messageContent = extractTextFromMessage(msg.message);
    const text = (messageContent || '').trim();
    if (!text) return;

    this.log(`📩 Pesan masuk dari ${senderJid} (fromMe: ${!!msg.key?.fromMe}): "${text.substring(0, 50)}"`);

    // 1. SLASH COMMANDS: /spek, /usage, /status, /ping, /help
    if (text.startsWith('/') || text.startsWith('!')) {
      const cmd = text.toLowerCase().replace(/^[\/!]/, '').trim();

      if (cmd === 'spek' || cmd === 'spec' || cmd === 'server' || cmd === 'specs') {
        const stats = typeof this.getServerStats === 'function' ? this.getServerStats() : null;
        if (stats) {
          const reply = `🖥️ *SPESIFIKASI SERVER ENCHANT* 🖥️\n\n` +
            `🔹 *Host*: ${stats.hostname}\n` +
            `🔹 *OS*: ${stats.platform}\n` +
            `🔹 *CPU*: ${stats.cpuModel}\n` +
            `🔹 *Cores*: ${stats.cpuCores} Core(s)\n` +
            `🔹 *RAM Total*: ${stats.memory.total}\n` +
            `🔹 *Storage Disk*: ${stats.disk.total} (Tersedia: ${stats.disk.free})\n` +
            `🔹 *Node.js*: ${stats.nodeVersion}\n` +
            `🔹 *Uptime Server*: ${stats.serverUptime}\n\n` +
            `⚡ _Powered by Enchant High Performance Infrastructure_`;
          await this.sendMessage(senderJid, reply);
        } else {
          await this.sendMessage(senderJid, '⚠️ Data spesifikasi server sedang tidak tersedia.');
        }
        return;
      }

      if (cmd === 'usage' || cmd === 'status' || cmd === 'ping' || cmd === 'stats') {
        const stats = typeof this.getServerStats === 'function' ? this.getServerStats() : null;
        if (stats) {
          const reply = `📊 *LIVE USAGE & STATUS SERVER* 📊\n\n` +
            `⚡ *Status*: 🟢 ONLINE / FAST\n` +
            `🧠 *RAM Terpakai*: ${stats.memory.used} / ${stats.memory.total} (${stats.memory.percent})\n` +
            `💾 *Disk Terpakai*: ${stats.disk.used} / ${stats.disk.total} (${stats.disk.percent})\n` +
            `⚙️ *CPU Load Avg*: ${stats.loadAvg}\n` +
            `⏱️ *App Uptime*: ${stats.processUptime}\n` +
            `📥 *Active Sessions*: ${this.videoSessions.size} video\n\n` +
            `🌐 Web: https://tiktok.enchant.id`;
          await this.sendMessage(senderJid, reply);
        } else {
          await this.sendMessage(senderJid, '🟢 Bot Online & Normal.');
        }
        return;
      }

      if (cmd === 'help' || cmd === 'menu') {
        const helpText = `✨ *ENCHANT DOWNLOADER BOT MENU* ✨\n\n` +
          `🔹 *Kirim Link TikTok*: Kirim link video TikTok, bot akan konfirmasi & unduh Super HD.\n` +
          `🔹 *Kirim Kode Sesi*: Kirim kode unik dari web (contoh: *ENCHANT-TIKTOK-XXXXXX* atau *XXXXXX*).\n` +
          `🔹 */spek*: Cek spesifikasi hardware server.\n` +
          `🔹 */usage* / */status*: Cek realtime RAM, CPU, & disk usage server.\n` +
          `🔹 */help*: Menampilkan bantuan menu ini.\n\n` +
          `🌐 Website: https://tiktok.enchant.id`;
        await this.sendMessage(senderJid, helpText);
        return;
      }
    }

    // 2. CHECK PENDING CONFIRMATION FOR SENDER (Iya / Tidak)
    const pending = this.pendingConfirmations.get(senderJid);
    if (pending) {
      if (/^(iya|ya|yes|y|gas|mau|download|ok|oke|lanjut|bisa|1|boleh|siap|kirim)/i.test(text)) {
        clearTimeout(pending.timeoutId);
        const urlToDownload = pending.url;
        this.pendingConfirmations.delete(senderJid);

        await this.processAndSendDirectUrl(senderJid, urlToDownload);
        return;
      } else if (/^(tidak|ga|gak|nggak|batal|no|n|cancel|enggak|skip|2)/i.test(text)) {
        clearTimeout(pending.timeoutId);
        this.pendingConfirmations.delete(senderJid);
        await this.sendMessage(senderJid, `👌 Baik, proses unduhan dibatalkan.\n\nJika ingin mendownload video lain, cukup kirim link TikTok-nya ke sini ya! ✨`);
        return;
      }
    }

    // 3. DETECT DIRECT TIKTOK LINK IN MESSAGE
    const isTikTokLink = /https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com\/[^\s]+|vt\.tiktok\.com\/[^\s]+|vm\.tiktok\.com\/[^\s]+)/i.test(text);
    if (isTikTokLink) {
      let extracted = text;
      if (typeof this.extractUrl === 'function') {
        extracted = this.extractUrl(text) || text;
      } else {
        const match = text.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com\/[^\s]+|vt\.tiktok\.com\/[^\s]+|vm\.tiktok\.com\/[^\s]+)/i);
        if (match) extracted = match[0];
      }

      // Clear previous confirmation if any
      if (pending) clearTimeout(pending.timeoutId);

      // Store pending confirmation for 2 minutes
      const timeoutId = setTimeout(() => {
        this.pendingConfirmations.delete(senderJid);
      }, 2 * 60 * 1000);

      this.pendingConfirmations.set(senderJid, {
        url: extracted,
        timestamp: Date.now(),
        timeoutId
      });

      const confirmText = `🎥 *Tautan TikTok Terdeteksi!* 🎥\n\n` +
        `Mau didownloadin video ini tanpa watermark kualitas Super HD? 📥\n\n` +
        `Balas pesan ini:\n` +
        `👉 Ketik *IYA* untuk mendownload video langsung\n` +
        `👉 Ketik *TIDAK* untuk membatalkan`;

      await this.sendMessage(senderJid, confirmText);
      return;
    }

    // 4. CHECK FOR SESSION CODE (ENCHANT-TIKTOK-XXXXXX, ENCHANT-XXXXXX, or 6-char code)
    const session = this.findSessionFromText(text);
    if (session) {
      this.log(`✅ Sesi ditemukan untuk teks: "${text.substring(0, 30)}" -> Code: ${session.sessionCode}`);
      await this.deliverSessionVideo(senderJid, session);
      return;
    }

    // If user sent something looking like a code but not found
    const potentialCode = this.extractPotentialCode(text);
    if (potentialCode) {
      this.log(`⚠️ Kode "${potentialCode}" tidak ditemukan di database.`);
      const notFoundText = `❌ *Kode Video Tidak Ditemukan*\n\n` +
        `Kode *${potentialCode}* tidak ditemukan di database atau sudah kadaluarsa (berlaku 24 jam).\n\n` +
        `💡 *Tips:*\n` +
        `1️⃣ Anda bisa langsung kirim *Link TikTok* ke chat ini (contoh: https://vt.tiktok.com/xxxx).\n` +
        `2️⃣ Atau proses ulang di website resmi: https://tiktok.enchant.id`;
      await this.sendMessage(senderJid, notFoundText);
      return;
    }

    // 5. DEFAULT GREETING / MENU
    if (/^(halo|hi|hai|menu|help|start|p|test|bot|halo bot|oi|info)/i.test(text)) {
      const helpText = `👋 *Halo! Selamat datang di Enchant Downloader Bot!*\n\n` +
        `🎬 *Cara Pakai:*\n` +
        `1️⃣ Kirim link video TikTok langsung ke sini (contoh: https://vt.tiktok.com/xxxx)\n` +
        `2️⃣ Atau kirim kode unik dari website (contoh: *ENCHANT-TIKTOK-ABC123* atau *ABC123*)\n\n` +
        `💡 *Command Server:*\n` +
        `• */spek* : Cek spesifikasi server\n` +
        `• */usage* : Cek status RAM & CPU realtime\n\n` +
        `Bot akan otomatis mengirim video kualitas Super HD 1080p tanpa watermark! 🚀`;
      await this.sendMessage(senderJid, helpText);
    }
  }

  findSessionFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const clean = rawText.toUpperCase().trim();

    // 1. Exact match with Map key
    if (this.videoSessions.has(clean)) {
      return this.videoSessions.get(clean);
    }

    // 2. Extract ENCHANT-TIKTOK-XXXXXX or ENCHANT-XXXXXX
    const fullMatch = clean.match(/ENCHANT(?:-TIKTOK)?-([A-Z0-9]{4,10})/i);
    if (fullMatch) {
      const targetSuffix = fullMatch[1].toUpperCase();
      for (const [code, item] of this.videoSessions.entries()) {
        if (code === fullMatch[0].toUpperCase() || code.endsWith(`-${targetSuffix}`)) {
          return item;
        }
      }
    }

    // 3. Match 6-character alphanumeric code inside words
    const codeWords = clean.match(/\b([A-Z0-9]{5,8})\b/g);
    if (codeWords) {
      for (const word of codeWords) {
        for (const [code, item] of this.videoSessions.entries()) {
          if (code === word || code.endsWith(`-${word}`)) {
            return item;
          }
        }
      }
    }

    return null;
  }

  extractPotentialCode(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const clean = rawText.toUpperCase().trim();
    const fullMatch = clean.match(/ENCHANT(?:-TIKTOK)?-[A-Z0-9]{4,10}/i);
    if (fullMatch) return fullMatch[0].toUpperCase();

    // Check if the whole message is just a 5-8 char alphanumeric string
    if (/^[A-Z0-9]{5,8}$/.test(clean)) {
      return clean;
    }
    return null;
  }

  async processAndSendDirectUrl(senderJid, url) {
    await this.sendMessage(senderJid, `⏳ *Sedang menganalisis & memproses video TikTok Anda...*\nMohon tunggu beberapa detik...`);

    try {
      let targetUrl = url;
      if (typeof this.resolveShortUrl === 'function') {
        try {
          targetUrl = await this.resolveShortUrl(url);
        } catch (e) {
          targetUrl = url;
        }
      }

      let data;
      if (typeof this.fetchTikTok === 'function') {
        data = await this.fetchTikTok(targetUrl);
      } else {
        throw new Error('Fetcher helper tidak tersedia.');
      }

      // Generate session and save
      const sessionCode = typeof this.generateSessionCode === 'function' ? this.generateSessionCode() : `ENCHANT-TIKTOK-${Date.now().toString(36).toUpperCase()}`;
      const sessionData = {
        ...data,
        sessionCode,
        createdAt: Date.now()
      };

      if (typeof this.saveSession === 'function') {
        this.saveSession(sessionCode, sessionData);
      } else {
        this.videoSessions.set(sessionCode, sessionData);
      }

      await this.deliverSessionVideo(senderJid, sessionData);
    } catch (err) {
      this.log(`Error processing direct link: ${err.message}`, 'error');
      await this.sendMessage(senderJid, `❌ *Gagal Mengambil Video*\n\nAlasan: ${err.message || 'Video tidak ditemukan / akun diprivat'}.\nSilakan coba lagi atau proses manual di: https://tiktok.enchant.id`);
    }
  }

  async deliverSessionVideo(senderJid, session) {
    await this.sendMessage(senderJid, `⏳ *Sedang Menyiapkan Video Anda...*\n\n🎬 *Judul*: ${session.title || 'TikTok Video'}\n👤 *Kreator*: @${session.author?.uniqueId || 'creator'}\n\n📥 *Kualitas*: Super HD 1080p (No Watermark)\nFile video sedang dikirim langsung ke chat ini...`);

    const videoUrl = session.downloads?.superHd || session.downloads?.hd;
    if (videoUrl && !session.isImagePost) {
      try {
        this.log(`Mengunduh media video buffer dari CDN...`);
        const vidRes = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            ...(videoUrl.includes('tiktok') ? { 'Referer': 'https://www.tiktok.com/' } : {})
          },
          timeout: 35000
        });

        const buffer = Buffer.from(vidRes.data);
        this.log(`Mengirim file video (${(buffer.length / 1024 / 1024).toFixed(1)} MB) ke ${senderJid}...`);

        await this.client.message.send(senderJid, {
          type: 'video',
          media: buffer,
          mimetype: 'video/mp4',
          caption: `✨ *${session.title || 'TikTok Video'}*\n👤 Kreator: @${session.author?.uniqueId || 'tiktok'}\n\n🌟 *Super HD Tanpa Watermark*\n🌐 Web: https://tiktok.enchant.id`
        });

        this.log(`✅ File video berhasil terkirim ke ${senderJid}!`);
        return;
      } catch (vidErr) {
        this.log(`Kirim file video buffer gagal: ${vidErr.message}, mengirim link cadangan...`, 'warn');
      }
    }

    // Fallback text
    const replyText = `✨ *ENCHANT DOWNLOADER — Video Siap!* ✨\n\n` +
      `🎬 *Judul*: ${session.title || 'TikTok Video'}\n` +
      `👤 *Kreator*: @${session.author?.uniqueId || 'user'}\n\n` +
      `🔗 *Pilihan Download Kualitas:*\n` +
      `🌟 *Super HD (No Watermark)*: ${session.downloads?.superHd || session.downloads?.hd || '-'}\n` +
      (session.downloads?.audio ? `🎵 *Audio MP3*: ${session.downloads.audio}\n` : '') +
      `\n🌐 Download langsung di web: https://tiktok.enchant.id`;

    await this.sendMessage(senderJid, replyText);
    this.log(`Balasan link terkirim ke ${senderJid}`);
  }

  async sendMessage(toJid, text) {
    if (!this.client || this.status !== 'connected') {
      this.log(`Gagal kirim pesan ke ${toJid}: Bot belum terhubung`, 'warn');
      return;
    }
    try {
      if (typeof this.client.message?.send === 'function') {
        await this.client.message.send(toJid, {
          type: 'text',
          text: text
        });
      }
    } catch (e) {
      this.log(`Error kirim pesan ke ${toJid}: ${e.message}`, 'error');
    }
  }

  async disconnect() {
    this._manualStop = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._pairingReadyWaiters) {
      const list = this._pairingReadyWaiters.splice(0);
      for (const r of list) { try { r(false); } catch (_) {} }
    }
    this.status = 'disconnected';
    this.qrDataUrl = null;
    this.pairingCode = null;
    if (this.client) {
      try {
        if (typeof this.client.disconnect === 'function') {
          await this.client.disconnect();
        }
      } catch (e) {}
      this.client = null;
    }
    this.log('WhatsApp Bot telah diputuskan (Standby).');
  }

  async restart() {
    await this.disconnect();
    await this.init({ forceQr: true });
  }

  async resetSession(options = { startQr: false }) {
    await this.disconnect();
    this.connectedNumber = null;
    this.connectedName = null;
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const p = this.sqlitePath + suffix;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      this.log('Database sesi SQLite lama dibersihkan.');
    } catch (e) {
      this.log('Gagal menghapus file sesi: ' + e.message, 'warn');
    }
    if (options && options.startQr) {
      await this.init({ forceQr: true });
    }
  }

  async requestPairingCode(phoneNumber) {
    let cleaned = String(phoneNumber || this.botPhoneNumber || '').replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    if (!cleaned || cleaned.length < 8 || cleaned.includes('x')) {
      throw new Error('Nomor WhatsApp tidak valid (contoh: 628123456789).');
    }

    if (!this.client || this.status === 'disconnected') {
      if (!this._pairingReadyWaiters) this._pairingReadyWaiters = [];
      const waitReady = new Promise((resolve) => {
        this._pairingReadyWaiters.push(resolve);
        setTimeout(() => resolve(false), 9000);
      });
      await this.init({ forceQr: true });
      if (!this.qrDataUrl) {
        await waitReady;
      }
    }

    if (!this.client || !this.client.auth) {
      throw new Error('Client WhatsApp belum siap, coba klik Tampilkan QR terlebih dahulu.');
    }

    this.log('Meminta Pairing Code untuk nomor: +' + cleaned + '...');
    try {
      const rawCode = await this.client.auth.requestPairingCode(cleaned);
      const formatted = rawCode ? (rawCode.match(/.{1,4}/g)?.join('-') || rawCode) : rawCode;
      this.pairingCode = formatted;
      this.log('🎉 Pairing Code diterima: ' + formatted);
      return formatted;
    } catch (err) {
      this.log('Gagal meminta Pairing Code: ' + err.message, 'error');
      throw err;
    }
  }

  getStatus() {
    return {
      status: this.status,
      connected: this.status === 'connected',
      qrDataUrl: this.qrDataUrl,
      pairingCode: this.pairingCode,
      botPhoneNumber: this.connectedNumber || this.botPhoneNumber,
      connectedNumber: this.connectedNumber || null,
      connectedName: this.connectedName || null,
      activeSessionsCount: this.videoSessions.size,
      logs: this.logs.slice(0, 20)
    };
  }
}

module.exports = WhatsAppBotManager;
