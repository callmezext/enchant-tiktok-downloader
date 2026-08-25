// Enchant Downloader — Full App Script with Native Android App Bridge & Multi-Language Support
document.addEventListener('DOMContentLoaded', () => {
  // Check if running inside Enchant Native Android App
  const isNativeApp = navigator.userAgent.includes('EnchantApp') || !!window.AndroidBridge;
  if (isNativeApp) {
    document.body.classList.add('is-native-app');
  }

  // Elements
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const clearBtn = document.getElementById('clearBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const loadingSection = document.getElementById('loadingSection');
  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');
  const closeErrorBtn = document.getElementById('closeErrorBtn');
  const resultSection = document.getElementById('resultSection');

  // Preview elements
  const authorAvatar = document.getElementById('authorAvatar');
  const authorNickname = document.getElementById('authorNickname');
  const authorUniqueId = document.getElementById('authorUniqueId');
  const videoDurationBadge = document.getElementById('videoDurationBadge');
  const videoDuration = document.getElementById('videoDuration');
  const postDate = document.getElementById('postDate');
  const videoCaption = document.getElementById('videoCaption');
  const copyCaptionBtn = document.getElementById('copyCaptionBtn');
  
  // Stats elements
  const statViews = document.getElementById('statViews');
  const statLikes = document.getElementById('statLikes');
  const statComments = document.getElementById('statComments');
  const statShares = document.getElementById('statShares');

  // Media elements
  const videoPlayerBox = document.getElementById('videoPlayerBox');
  const videoPlayer = document.getElementById('videoPlayer');
  const videoSource = document.getElementById('videoSource');
  const slideshowBox = document.getElementById('slideshowBox');
  const slideCurrentImg = document.getElementById('slideCurrentImg');
  const slideCounter = document.getElementById('slideCounter');
  const slidePrevBtn = document.getElementById('slidePrevBtn');
  const slideNextBtn = document.getElementById('slideNextBtn');
  const slideThumbnails = document.getElementById('slideThumbnails');

  // Music elements
  const musicTitle = document.getElementById('musicTitle');
  const musicAuthor = document.getElementById('musicAuthor');
  const playAudioPreviewBtn = document.getElementById('playAudioPreviewBtn');
  const audioElement = document.getElementById('audioElement');

  // Download buttons
  const videoDownloadButtons = document.getElementById('videoDownloadButtons');
  const imageDownloadButtons = document.getElementById('imageDownloadButtons');
  const btnSuperHd = document.getElementById('btnSuperHd');
  const btnHd = document.getElementById('btnHd');
  const btnWatermark = document.getElementById('btnWatermark');
  const btnAudioMp3 = document.getElementById('btnAudioMp3');
  const btnDownloadCover = document.getElementById('btnDownloadCover');
  const btnDownloadAllZip = document.getElementById('btnDownloadAllZip');
  const btnDownloadCurrentSlide = document.getElementById('btnDownloadCurrentSlide');

  // WhatsApp Bot Card
  const waBotCard = document.getElementById('waBotCard');
  const waSessionCode = document.getElementById('waSessionCode');
  const copyWaCodeBtn = document.getElementById('copyWaCodeBtn');
  const btnSendToWhatsApp = document.getElementById('btnSendToWhatsApp');

  // History & Toast
  const historyBtn = document.getElementById('historyBtn');
  const historyModal = document.getElementById('historyModal');
  const historyBackdrop = document.getElementById('historyBackdrop');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Bottom Navigation Bar
  const navHome = document.getElementById('navHome');
  const navPaste = document.getElementById('navPaste');
  const navBot = document.getElementById('navBot');
  const navHistory = document.getElementById('navHistory');
  const navTheme = document.getElementById('navTheme');

  // Language, Theme & PWA
  const langBtnId = document.getElementById('langBtnId');
  const langBtnEn = document.getElementById('langBtnEn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  let currentVideoData = null;
  let currentSlideIndex = 0;
  let isAudioPlaying = false;
  let deferredPrompt = null;

  // Multi-Language Translations Dictionary
  const translations = {
    id: {
      flag: '🇮🇩',
      langCode: 'ID',
      placeholder: 'Tempel tautan video TikTok di sini...',
      badgeText: 'Ultra Fast & Lossless Quality',
      heroTitle1: 'Download Video TikTok',
      heroTitle2: 'Super HD Tanpa Watermark',
      heroSubtitle: 'Simpan video, sound MP3, dan slide foto TikTok dengan kualitas tertinggi. Lengkap dengan preview video, deskripsi caption, dan statistik video.',
      paste: 'Paste',
      processVideo: 'Proses Video',
      analyzing: 'Menganalisis...',
      feat1: '1080p / 4K Super HD',
      feat2: '100% No Watermark',
      feat3: 'Audio MP3 & Slide Foto',
      feat4: 'Preview Video & Stats',
      errorEmptyUrl: 'Harap masukkan tautan video TikTok terlebih dahulu!',
      errorFetchFail: 'Gagal mengambil data video. Pastikan link masih aktif dan akun tidak diprivat.',
      copiedToast: 'Deskripsi berhasil disalin ke clipboard!',
      waCodeCopied: 'Kode unik berhasil disalin! Kirimkan ke WhatsApp Bot kami.',
      zipCreating: 'Membuat ZIP...',
      zipSuccessToast: 'ZIP seluruh foto berhasil diunduh!',
      zipFailedToast: 'Gagal mengunduh ZIP foto. Silakan coba download satuan.',
      emptyHistory: 'Belum ada riwayat download.',
      footerDisclaimer: 'Enchant Downloader tidak berafiliasi dengan TikTok atau ByteDance Ltd. Seluruh hak cipta video dan musik milik kreator aslinya.'
    },
    en: {
      flag: '🇬🇧',
      langCode: 'EN',
      placeholder: 'Paste TikTok video link here...',
      badgeText: 'Ultra Fast & Lossless Quality',
      heroTitle1: 'Download TikTok Video',
      heroTitle2: 'Super HD No Watermark',
      heroSubtitle: 'Save TikTok videos, MP3 audio sounds, and photo slides in the highest quality. Features video preview, caption copier, and full post statistics.',
      paste: 'Paste',
      processVideo: 'Process Video',
      analyzing: 'Analyzing...',
      feat1: '1080p / 4K Super HD',
      feat2: '100% No Watermark',
      feat3: 'MP3 Audio & Slide Photos',
      feat4: 'Live Preview & Stats',
      errorEmptyUrl: 'Please insert a valid TikTok video link first!',
      errorFetchFail: 'Failed to retrieve video. Ensure the video is public and the link is active.',
      copiedToast: 'Caption copied to clipboard!',
      waCodeCopied: 'Session code copied! Send it to our WhatsApp Bot.',
      zipCreating: 'Creating ZIP...',
      zipSuccessToast: 'All photos ZIP downloaded successfully!',
      zipFailedToast: 'Failed to download ZIP. Try downloading individually.',
      emptyHistory: 'No download history yet.',
      footerDisclaimer: 'Enchant Downloader is not affiliated with TikTok or ByteDance Ltd. All copyrights of videos and music belong to their respective owners.'
    }
  };

  let currentLang = localStorage.getItem('enchant_lang') || 'id';

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('enchant_lang', lang);
    const t = translations[lang];

    if (langBtnId) langBtnId.classList.toggle('active', lang === 'id');
    if (langBtnEn) langBtnEn.classList.toggle('active', lang === 'en');

    if (urlInput) urlInput.placeholder = t.placeholder;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        el.innerHTML = t[key];
      }
    });

    const processText = downloadBtn?.querySelector('.btn-text span');
    if (processText) processText.textContent = t.processVideo;

    const analyzingText = downloadBtn?.querySelector('.btn-spinner span');
    if (analyzingText) analyzingText.textContent = t.analyzing;
  }

  if (langBtnId) langBtnId.addEventListener('click', () => applyLanguage('id'));
  if (langBtnEn) langBtnEn.addEventListener('click', () => applyLanguage('en'));
  applyLanguage(currentLang);

  // Theme Management (Neon Dark vs Sakura Light)
  let currentTheme = localStorage.getItem('enchant_theme') || 'neon';

  function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    localStorage.setItem('enchant_theme', theme);

    if (window.AndroidBridge && typeof window.AndroidBridge.setNativeTheme === 'function') {
      window.AndroidBridge.setNativeTheme(theme);
    }

    if (themeIcon && themeLabel) {
      if (theme === 'neon') {
        themeIcon.textContent = '⚡';
        themeLabel.textContent = 'Neon';
      } else {
        themeIcon.textContent = '🌸';
        themeLabel.textContent = 'Sakura';
      }
    }
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'neon' ? 'sakura' : 'neon';
    setTheme(nextTheme);
    showToast(`Tema diubah ke ${nextTheme.toUpperCase()}`);
    if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate();
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  setTheme(currentTheme);

  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('✨ Service Worker registered:', reg.scope);
      }).catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
    });
  }

  // PWA Install Prompt Handler
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isNativeApp && pwaInstallBtn) {
      pwaInstallBtn.classList.remove('hidden');
    }
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Aplikasi Enchant berhasil dipasang!');
        }
        deferredPrompt = null;
      } else {
        showToast('Buka menu browser Anda (titik 3) lalu pilih "Tambahkan ke Layar Utama" / "Install App"');
      }
    });
  }

  // Input event listeners
  urlInput.addEventListener('input', () => {
    if (urlInput.value.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    urlInput.focus();
  });

  // Paste Action (Native Bridge + Web Clipboard API)
  async function handlePaste() {
    try {
      let text = '';
      if (window.AndroidBridge && typeof window.AndroidBridge.getClipboardText === 'function') {
        text = window.AndroidBridge.getClipboardText();
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      if (text && text.trim().length > 0) {
        urlInput.value = text.trim();
        clearBtn.classList.remove('hidden');
        showToast('📋 Link berhasil ditempel!');
        if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate();
        processUrl();
      } else {
        showToast('Papan klip (clipboard) kosong!', true);
      }
    } catch (err) {
      showToast('Gagal membaca clipboard. Silakan tempel secara manual.', true);
    }
  }

  if (pasteBtn) {
    pasteBtn.addEventListener('click', handlePaste);
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      processUrl();
    });
  }

  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      processUrl();
    }
  });

  if (closeErrorBtn) {
    closeErrorBtn.addEventListener('click', () => {
      errorAlert.classList.add('hidden');
    });
  }

  // Bottom Navigation Bar Actions (3 Main Tabs)
  const heroSection = document.querySelector('.hero-section');
  const inputSection = document.querySelector('.input-section');
  const featuresSection = document.getElementById('featuresSection') || document.querySelector('.features-grid')?.parentElement;
  const tutorialSection = document.getElementById('tutorialSection') || document.querySelector('.tutorial-steps')?.parentElement;
  const faqSection = document.querySelector('.faq-section');
  const appTabHistory = document.getElementById('appTabHistory');
  const appTabSettings = document.getElementById('appTabSettings');
  const appHistoryList = document.getElementById('appHistoryList');
  const btnAppClearHistory = document.getElementById('btnAppClearHistory');
  const navSettings = document.getElementById('navSettings');

  // Settings Elements
  const settingThemeNeon = document.getElementById('settingThemeNeon');
  const settingThemeSakura = document.getElementById('settingThemeSakura');
  const settingLangId = document.getElementById('settingLangId');
  const settingLangEn = document.getElementById('settingLangEn');

  function switchTab(tabName) {
    if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate();

    // Reset sections visibility
    if (tabName === 'home') {
      if (heroSection) heroSection.classList.remove('hidden');
      if (inputSection) inputSection.classList.remove('hidden');
      if (featuresSection) featuresSection.classList.remove('hidden');
      if (tutorialSection) tutorialSection.classList.remove('hidden');
      if (faqSection) faqSection.classList.remove('hidden');
      if (currentVideoData && resultSection) resultSection.classList.remove('hidden');
      if (appTabHistory) appTabHistory.classList.add('hidden');
      if (appTabSettings) appTabSettings.classList.add('hidden');
      setActiveNav(navHome);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabName === 'history') {
      if (heroSection) heroSection.classList.add('hidden');
      if (inputSection) inputSection.classList.add('hidden');
      if (featuresSection) featuresSection.classList.add('hidden');
      if (tutorialSection) tutorialSection.classList.add('hidden');
      if (faqSection) faqSection.classList.add('hidden');
      if (resultSection) resultSection.classList.add('hidden');
      if (loadingSection) loadingSection.classList.add('hidden');
      if (appTabSettings) appTabSettings.classList.add('hidden');
      if (appTabHistory) appTabHistory.classList.remove('hidden');
      setActiveNav(navHistory);
      renderAppHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabName === 'settings') {
      if (heroSection) heroSection.classList.add('hidden');
      if (inputSection) inputSection.classList.add('hidden');
      if (featuresSection) featuresSection.classList.add('hidden');
      if (tutorialSection) tutorialSection.classList.add('hidden');
      if (faqSection) faqSection.classList.add('hidden');
      if (resultSection) resultSection.classList.add('hidden');
      if (loadingSection) loadingSection.classList.add('hidden');
      if (appTabHistory) appTabHistory.classList.add('hidden');
      if (appTabSettings) appTabSettings.classList.remove('hidden');
      setActiveNav(navSettings);
      updateSettingsUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (navHome) navHome.addEventListener('click', () => switchTab('home'));
  if (navHistory) navHistory.addEventListener('click', () => switchTab('history'));
  if (navSettings) navSettings.addEventListener('click', () => switchTab('settings'));

  function setActiveNav(activeBtn) {
    document.querySelectorAll('.app-bottom-nav .nav-item').forEach(item => item.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
  }

  function updateSettingsUI() {
    if (settingThemeNeon && settingThemeSakura) {
      settingThemeNeon.classList.toggle('active', currentTheme === 'neon');
      settingThemeSakura.classList.toggle('active', currentTheme === 'sakura');
    }
    if (settingLangId && settingLangEn) {
      settingLangId.classList.toggle('active', currentLang === 'id');
      settingLangEn.classList.toggle('active', currentLang === 'en');
    }
  }

  if (settingThemeNeon) {
    settingThemeNeon.addEventListener('click', () => {
      setTheme('neon');
      updateSettingsUI();
      showToast('Tema diubah ke Neon Dark ⚡');
    });
  }

  if (settingThemeSakura) {
    settingThemeSakura.addEventListener('click', () => {
      setTheme('sakura');
      updateSettingsUI();
      showToast('Tema diubah ke Sakura Light 🌸');
    });
  }

  if (settingLangId) {
    settingLangId.addEventListener('click', () => {
      applyLanguage('id');
      updateSettingsUI();
      showToast('Bahasa diubah ke Bahasa Indonesia 🇮🇩');
    });
  }

  if (settingLangEn) {
    settingLangEn.addEventListener('click', () => {
      applyLanguage('en');
      updateSettingsUI();
      showToast('Language changed to English 🇬🇧');
    });
  }

  function renderAppHistory() {
    if (!appHistoryList) return;
    try {
      const history = JSON.parse(localStorage.getItem('enchant_history') || '[]');
      if (history.length === 0) {
        appHistoryList.innerHTML = `
          <div class="history-empty">
            <i class="fa-solid fa-folder-open"></i>
            <p>Belum ada riwayat download.</p>
          </div>`;
        return;
      }

      appHistoryList.innerHTML = '';
      history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <img src="${item.cover || 'https://via.placeholder.com/52'}" class="history-thumb" alt="Cover">
          <div class="history-info">
            <div class="history-info-title">${item.title || 'TikTok Video'}</div>
            <div class="history-info-meta">@${item.author?.uniqueId || 'user'} • ${item.time}</div>
          </div>
          <i class="fa-solid fa-arrow-right" style="color: var(--text-muted); font-size: 13px;"></i>
        `;
        card.addEventListener('click', () => {
          urlInput.value = `https://www.tiktok.com/@${item.author?.uniqueId || 'user'}/video/${item.id}`;
          clearBtn.classList.remove('hidden');
          switchTab('home');
          processUrl();
        });
        appHistoryList.appendChild(card);
      });
    } catch (e) {}
  }

  if (btnAppClearHistory) {
    btnAppClearHistory.addEventListener('click', () => {
      localStorage.removeItem('enchant_history');
      renderAppHistory();
      showToast('Seluruh riwayat download telah dibersihkan.');
    });
  }

  // Process and Analyze TikTok URL
  async function processUrl() {
    const url = urlInput.value.trim();
    const t = translations[currentLang];

    if (!url) {
      showError(t.errorEmptyUrl);
      return;
    }

    // Reset states
    hideError();
    resultSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');
    setButtonLoading(true);

    // Stop existing media playback
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.src = '';
    }
    if (audioElement) {
      audioElement.pause();
      isAudioPlaying = false;
      if (playAudioPreviewBtn) playAudioPreviewBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || t.errorFetchFail);
      }

      currentVideoData = data;
      renderResult(data);
      saveToHistory(data);
    } catch (err) {
      showError(err.message || t.errorFetchFail);
    } finally {
      loadingSection.classList.add('hidden');
      setButtonLoading(false);
    }
  }

  // Render Result UI
  function renderResult(data) {
    // Author Details
    authorAvatar.src = data.author.avatar || 'https://via.placeholder.com/60';
    authorNickname.textContent = data.author.nickname || 'Creator';
    authorUniqueId.textContent = `@${data.author.uniqueId}`;
    authorUniqueId.href = `https://www.tiktok.com/@${data.author.uniqueId}`;
    
    // Post Meta
    if (data.formattedDuration && data.formattedDuration !== '00:00') {
      videoDurationBadge.classList.remove('hidden');
      videoDuration.textContent = data.formattedDuration;
    } else {
      videoDurationBadge.classList.add('hidden');
    }
    postDate.textContent = data.createTime || 'TikTok Post';

    // Caption / Description
    videoCaption.textContent = data.title || 'No description provided.';

    // Statistics
    statViews.textContent = data.stats.views || '0';
    statLikes.textContent = data.stats.likes || '0';
    statComments.textContent = data.stats.comments || '0';
    statShares.textContent = data.stats.shares || '0';

    // Music
    musicTitle.textContent = data.music.title || 'Original Sound';
    musicAuthor.textContent = data.music.author || data.author.nickname;
    if (data.downloads.audio) {
      audioElement.src = `/api/stream?url=${encodeURIComponent(data.downloads.audio)}&type=audio`;
      playAudioPreviewBtn.classList.remove('hidden');
    } else {
      playAudioPreviewBtn.classList.add('hidden');
    }

    const cleanCaption = (data.title || 'Video').substring(0, 45).replace(/[\\/:*?"<>|]/g, ' ').trim();

    // Handle Media Type (Video vs Slide Post)
    if (data.isImagePost && data.images && data.images.length > 0) {
      videoPlayerBox.classList.add('hidden');
      slideshowBox.classList.remove('hidden');
      videoDownloadButtons.classList.add('hidden');
      imageDownloadButtons.classList.remove('hidden');

      initSlideshow(data.images, cleanCaption);
    } else {
      videoPlayerBox.classList.remove('hidden');
      slideshowBox.classList.add('hidden');
      videoDownloadButtons.classList.remove('hidden');
      imageDownloadButtons.classList.add('hidden');

      const previewVideoUrl = data.downloads.hd || data.downloads.superHd || '';
      const streamUrl = `/api/stream?url=${encodeURIComponent(previewVideoUrl)}&type=video`;
      videoPlayer.poster = data.cover ? `/api/stream?url=${encodeURIComponent(data.cover)}&type=image` : '';
      videoPlayer.src = streamUrl;
      videoSource.src = streamUrl;
      videoPlayer.load();

      // Configure video download links with custom filename
      setupDownloadLink(btnSuperHd, data.downloads.superHd || data.downloads.hd, `${cleanCaption} (Super HD)`, 'video');
      setupDownloadLink(btnHd, data.downloads.hd || data.downloads.superHd, `${cleanCaption} (HD)`, 'video');
      
      if (data.downloads.watermark) {
        btnWatermark.classList.remove('hidden');
        setupDownloadLink(btnWatermark, data.downloads.watermark, `${cleanCaption} (Watermark)`, 'video');
      } else {
        btnWatermark.classList.add('hidden');
      }
    }

    // Audio & Cover Download Links
    if (data.downloads.audio) {
      btnAudioMp3.classList.remove('hidden');
      setupDownloadLink(btnAudioMp3, data.downloads.audio, `${cleanCaption} (Audio Sound)`, 'audio');
    } else {
      btnAudioMp3.classList.add('hidden');
    }

    if (data.cover) {
      btnDownloadCover.classList.remove('hidden');
      setupDownloadLink(btnDownloadCover, data.cover, `${cleanCaption} (Thumbnail)`, 'image');
    } else {
      btnDownloadCover.classList.add('hidden');
    }

    // Configure WhatsApp Bot Card
    if (data.sessionCode && waBotCard) {
      waBotCard.classList.remove('hidden');
      waSessionCode.textContent = data.sessionCode;
      
      const botNum = data.waBotNumber || '6285138666547';
      const waMsg = encodeURIComponent(`Halo Enchant, kirimkan video saya dengan kode: ${data.sessionCode}`);
      btnSendToWhatsApp.href = `https://wa.me/${botNum}?text=${waMsg}`;
      
      copyWaCodeBtn.onclick = () => {
        if (window.AndroidBridge && typeof window.AndroidBridge.copyToClipboard === 'function') {
          window.AndroidBridge.copyToClipboard(data.sessionCode);
        } else {
          navigator.clipboard.writeText(data.sessionCode).then(() => {
            showToast(translations[currentLang].waCodeCopied);
          }).catch(() => {
            showToast(data.sessionCode);
          });
        }
      };
    }

    // Show result card with precision smooth scroll
    resultSection.classList.remove('hidden');
    setTimeout(() => {
      const yOffset = -30;
      const elementTop = resultSection.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: Math.max(0, elementTop + yOffset),
        behavior: 'smooth'
      });
    }, 60);
  }

  const downloadProgressModal = document.getElementById('downloadProgressModal');
  const dlModalTitle = document.getElementById('dlModalTitle');
  const dlModalSub = document.getElementById('dlModalSub');
  const dlModalBar = document.getElementById('dlModalBar');
  const dlModalStep = document.getElementById('dlModalStep');

  function showDownloadModal(filename) {
    if (!downloadProgressModal) return;
    dlModalTitle.textContent = 'Sedang Mengunduh...';
    dlModalSub.textContent = filename || 'Super HD 1080p';
    dlModalBar.style.width = '10%';
    dlModalStep.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>Menyiapkan file tanpa watermark...</span>';
    downloadProgressModal.classList.remove('hidden');

    setTimeout(() => {
      dlModalBar.style.width = '50%';
      dlModalTitle.textContent = 'Mengunduh Video...';
      dlModalStep.innerHTML = '<i class="fa-solid fa-download"></i> <span>Menyimpan ke Galeri HP...</span>';
    }, 500);

    setTimeout(() => {
      dlModalBar.style.width = '100%';
      dlModalTitle.textContent = 'Berhasil! ✨';
      dlModalStep.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Video tersimpan di Galeri HP kamu</span>';
    }, 1200);

    setTimeout(() => {
      downloadProgressModal.classList.add('hidden');
    }, 2400);
  }

  // Setup Download Links with Custom Filename & Native Download Manager Bridge
  function setupDownloadLink(element, directUrl, customTitle, type) {
    if (!directUrl) {
      element.classList.add('hidden');
      return;
    }
    element.classList.remove('hidden');

    const cleanTitle = (customTitle || 'TikTok Video')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, '')
      .substring(0, 45)
      .trim();

    const formattedFilename = `Enchant-Downloader - ${cleanTitle}`;
    const proxyUrl = `/api/download?url=${encodeURIComponent(directUrl)}&filename=${encodeURIComponent(formattedFilename)}&type=${type}`;
    element.href = proxyUrl;
    element.setAttribute('download', formattedFilename);

    element.onclick = (e) => {
      // Show beautiful download animation
      showDownloadModal(formattedFilename);
      if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate();
      // Let the <a href> work naturally — WebView's DownloadListener will catch it
    };
  }

  // Slideshow Logic for Image Posts
  function initSlideshow(images, baseFilename) {
    currentSlideIndex = 0;
    slideThumbnails.innerHTML = '';

    function updateSlide(index) {
      currentSlideIndex = index;
      slideCurrentImg.src = images[currentSlideIndex];
      slideCounter.textContent = `${currentSlideIndex + 1} / ${images.length}`;

      const thumbs = slideThumbnails.querySelectorAll('.slide-thumb');
      thumbs.forEach((th, i) => {
        if (i === currentSlideIndex) th.classList.add('active');
        else th.classList.remove('active');
      });

      setupDownloadLink(btnDownloadCurrentSlide, images[currentSlideIndex], `${baseFilename} - Slide ${currentSlideIndex + 1}`, 'image');
    }

    images.forEach((imgUrl, i) => {
      const thumb = document.createElement('img');
      thumb.src = imgUrl;
      thumb.className = 'slide-thumb' + (i === 0 ? ' active' : '');
      thumb.addEventListener('click', () => updateSlide(i));
      slideThumbnails.appendChild(thumb);
    });

    slidePrevBtn.onclick = () => {
      let nextIndex = currentSlideIndex - 1;
      if (nextIndex < 0) nextIndex = images.length - 1;
      updateSlide(nextIndex);
    };

    slideNextBtn.onclick = () => {
      let nextIndex = (currentSlideIndex + 1) % images.length;
      updateSlide(nextIndex);
    };

    btnDownloadAllZip.onclick = async () => {
      const t = translations[currentLang];
      btnDownloadAllZip.disabled = true;
      const originalText = btnDownloadAllZip.innerHTML;
      btnDownloadAllZip.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>${t.zipCreating}</span>`;

      try {
        const response = await fetch('/api/download-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: images,
            author: currentVideoData?.author?.uniqueId || 'tiktok',
            title: currentVideoData?.title || 'photos'
          })
        });

        if (!response.ok) throw new Error(t.zipFailedToast);

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Enchant-Downloader - ${currentVideoData?.author?.uniqueId || 'tiktok'}_photos.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        showToast(t.zipSuccessToast);
      } catch (e) {
        showError(t.zipFailedToast);
      } finally {
        btnDownloadAllZip.disabled = false;
        btnDownloadAllZip.innerHTML = originalText;
      }
    };

    updateSlide(0);
  }

  // Audio Playback Preview
  if (playAudioPreviewBtn) {
    playAudioPreviewBtn.addEventListener('click', () => {
      if (!audioElement.src) return;

      if (isAudioPlaying) {
        audioElement.pause();
        isAudioPlaying = false;
        playAudioPreviewBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      } else {
        audioElement.play();
        isAudioPlaying = true;
        playAudioPreviewBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      }
    });
  }

  audioElement.addEventListener('ended', () => {
    isAudioPlaying = false;
    if (playAudioPreviewBtn) playAudioPreviewBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });

  // Copy Video Caption
  if (copyCaptionBtn) {
    copyCaptionBtn.addEventListener('click', () => {
      const text = videoCaption.textContent;
      if (!text) return;

      if (window.AndroidBridge && typeof window.AndroidBridge.copyToClipboard === 'function') {
        window.AndroidBridge.copyToClipboard(text);
      } else {
        navigator.clipboard.writeText(text).then(() => {
          showToast(translations[currentLang].copiedToast);
        }).catch(() => {
          showToast('Gagal menyalin teks.', true);
        });
      }
    });
  }

  // History Management (Local Storage)
  function saveToHistory(item) {
    try {
      let history = JSON.parse(localStorage.getItem('enchant_history') || '[]');
      history = history.filter(h => h.id !== item.id);
      history.unshift({
        id: item.id,
        title: item.title,
        cover: item.cover,
        author: item.author,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      });
      if (history.length > 20) history.pop();
      localStorage.setItem('enchant_history', JSON.stringify(history));
    } catch (e) {}
  }

  function renderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('enchant_history') || '[]');
      if (history.length === 0) {
        historyList.innerHTML = `
          <div class="history-empty">
            <i class="fa-solid fa-folder-open"></i>
            <p>Belum ada riwayat download.</p>
          </div>`;
        return;
      }

      historyList.innerHTML = '';
      history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
          <img src="${item.cover || 'https://via.placeholder.com/52'}" class="history-thumb" alt="Cover">
          <div class="history-info">
            <div class="history-info-title">${item.title || 'TikTok Video'}</div>
            <div class="history-info-meta">@${item.author?.uniqueId || 'user'} • ${item.time}</div>
          </div>
          <i class="fa-solid fa-arrow-right" style="color: var(--text-muted); font-size: 13px;"></i>
        `;
        card.addEventListener('click', () => {
          urlInput.value = `https://www.tiktok.com/@${item.author?.uniqueId || 'user'}/video/${item.id}`;
          clearBtn.classList.remove('hidden');
          closeHistoryModal();
          processUrl();
        });
        historyList.appendChild(card);
      });
    } catch (e) {}
  }

  function openHistoryModal() {
    renderHistory();
    if (historyModal) historyModal.classList.remove('hidden');
  }

  function closeHistoryModal() {
    if (historyModal) historyModal.classList.add('hidden');
  }

  if (historyBtn) historyBtn.addEventListener('click', openHistoryModal);
  if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', closeHistoryModal);
  if (historyBackdrop) historyBackdrop.addEventListener('click', closeHistoryModal);

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      localStorage.removeItem('enchant_history');
      renderHistory();
      showToast('Riwayat download telah dibersihkan.');
    });
  }

  // UI Helpers
  function setButtonLoading(loading) {
    const btnText = downloadBtn.querySelector('.btn-text');
    const btnSpinner = downloadBtn.querySelector('.btn-spinner');
    if (loading) {
      btnText.classList.add('hidden');
      btnSpinner.classList.remove('hidden');
      downloadBtn.disabled = true;
    } else {
      btnText.classList.remove('hidden');
      btnSpinner.classList.add('hidden');
      downloadBtn.disabled = false;
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
    if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate();
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  function showToast(msg, isError = false) {
    toastMessage.textContent = msg;
    const icon = toastNotification.querySelector('.toast-icon');
    if (icon) {
      icon.className = isError ? 'fa-solid fa-circle-exclamation toast-icon error' : 'fa-solid fa-circle-check toast-icon';
    }
    toastNotification.classList.remove('hidden');
    setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 3200);
  }
});
