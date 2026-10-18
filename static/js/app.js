// TorCloud Flat Dark & Orange Client Application

let currentFilter = 'all';
let searchKeyword = '';
let allTasks = [];
let pollingInterval = null;
let currentViewingTaskId = null;

// Initialize on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupTabs();
  setupUploadZone();
  setupForms();
  setupModals();
  setupFilters();
  setupTelegramControls();
  setupShortcutsAndHelpers();
  setupPlayerModal();

  // Initial fetch and start polling
  fetchGDriveInfo();
  fetchTelegramStatus();
  fetchTasks();
  pollingInterval = setInterval(fetchTasks, 1500);
});

// Toast notification system
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const borders = {
    info: 'bg-[#18181b] border-zinc-800 text-zinc-100',
    success: 'bg-[#18181b] border-emerald-500/40 text-emerald-300',
    error: 'bg-[#18181b] border-rose-500/40 text-rose-300',
    warning: 'bg-[#18181b] border-orange-500/40 text-orange-300'
  };

  const icons = {
    info: 'info',
    success: 'check-circle-2',
    error: 'alert-triangle',
    warning: 'alert-circle'
  };

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-xl text-xs font-semibold transition-all transform translate-y-2 opacity-0 ${borders[type] || borders.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Keyboard shortcuts & clipboard paste helpers
function setupShortcutsAndHelpers() {
  const pasteBtn = document.getElementById('btn-paste-url');
  const inputUrl = document.getElementById('input-url');

  if (pasteBtn && navigator.clipboard) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          inputUrl.value = text.trim();
          showToast('Pasted URL from clipboard', 'info');
          inputUrl.focus();
        }
      } catch (err) {
        showToast('Clipboard access not granted', 'warning');
      }
    });
  }

  // Ctrl+Enter or Cmd+Enter to submit
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const panelUrl = document.getElementById('panel-url');
      const panelUpload = document.getElementById('panel-upload');
      if (!panelUrl.classList.contains('hidden')) {
        document.getElementById('form-url-task').dispatchEvent(new Event('submit', { cancelable: true }));
      } else if (!panelUpload.classList.contains('hidden')) {
        const btnUpload = document.getElementById('btn-submit-upload');
        if (!btnUpload.disabled) {
          document.getElementById('form-upload-task').dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    }
  });

  // Search input filter
  const searchInput = document.getElementById('task-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchKeyword = e.target.value.toLowerCase().trim();
      renderTasks(allTasks);
    });
  }

  // Copy logs modal button
  const copyLogsBtn = document.getElementById('btn-copy-logs');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', () => {
      const logContent = document.getElementById('log-modal-content').innerText;
      if (logContent && navigator.clipboard) {
        navigator.clipboard.writeText(logContent);
        showToast('Logs copied to clipboard!', 'success');
      }
    });
  }

  // Drive pill opens modal
  const pill = document.getElementById('gdrive-status-card');
  if (pill) {
    pill.addEventListener('click', () => {
      document.getElementById('modal-gdrive').classList.remove('hidden');
      loadDriveFiles('TorCloud');
    });
  }
}

// Tabs setup
function setupTabs() {
  const btnUrl = document.getElementById('tab-btn-url');
  const btnUpload = document.getElementById('tab-btn-upload');
  const panelUrl = document.getElementById('panel-url');
  const panelUpload = document.getElementById('panel-upload');

  btnUrl.addEventListener('click', () => {
    btnUrl.className = 'tab-btn flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-orange-600 text-white flex items-center justify-center gap-2 transition-colors';
    btnUpload.className = 'tab-btn flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 flex items-center justify-center gap-2 transition-colors';
    panelUrl.classList.remove('hidden');
    panelUpload.classList.add('hidden');
  });

  btnUpload.addEventListener('click', () => {
    btnUpload.className = 'tab-btn flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-orange-600 text-white flex items-center justify-center gap-2 transition-colors';
    btnUrl.className = 'tab-btn flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 flex items-center justify-center gap-2 transition-colors';
    panelUpload.classList.remove('hidden');
    panelUrl.classList.add('hidden');
  });

  // Dynamic target toggles for URL
  const targetUrl = document.getElementById('select-target-url');
  const wrapperGDrive = document.getElementById('wrapper-gdrive-dest');
  const wrapperTG = document.getElementById('wrapper-tg-chat');

  targetUrl.addEventListener('change', () => {
    const val = targetUrl.value;
    if (val === 'gdrive') {
      wrapperGDrive.classList.remove('hidden');
      wrapperTG.classList.add('hidden');
    } else if (val === 'telegram') {
      wrapperGDrive.classList.add('hidden');
      wrapperTG.classList.remove('hidden');
    } else { // both
      wrapperGDrive.classList.remove('hidden');
      wrapperTG.classList.remove('hidden');
    }
  });

  // Dynamic target toggles for Upload
  const targetUpload = document.getElementById('select-target-upload');
  const wrapperUploadGDrive = document.getElementById('wrapper-upload-gdrive-dest');
  const wrapperUploadTG = document.getElementById('wrapper-upload-tg-chat');

  targetUpload.addEventListener('change', () => {
    const val = targetUpload.value;
    if (val === 'gdrive') {
      wrapperUploadGDrive.classList.remove('hidden');
      wrapperUploadTG.classList.add('hidden');
    } else if (val === 'telegram') {
      wrapperUploadGDrive.classList.add('hidden');
      wrapperUploadTG.classList.remove('hidden');
    } else { // both
      wrapperUploadGDrive.classList.remove('hidden');
      wrapperUploadTG.classList.remove('hidden');
    }
  });
}

// Drag & Drop / File Upload Setup
function setupUploadZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const display = document.getElementById('selected-file-display');
  const submitBtn = document.getElementById('btn-submit-upload');

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drop-zone-active');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drop-zone-active');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateFileDisplay();
    }
  });

  fileInput.addEventListener('change', updateFileDisplay);

  function updateFileDisplay() {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      display.textContent = `${file.name} (${formatBytes(file.size)})`;
      display.classList.remove('italic', 'text-zinc-400');
      display.classList.add('text-orange-300', 'font-semibold');
      submitBtn.removeAttribute('disabled');
    } else {
      display.textContent = 'No file selected';
      display.classList.add('italic', 'text-zinc-400');
      display.classList.remove('text-orange-300', 'font-semibold');
      submitBtn.setAttribute('disabled', 'true');
    }
  }
}

// Form submissions
function setupForms() {
  // URL form
  const formUrl = document.getElementById('form-url-task');
  const inputUrl = document.getElementById('input-url');
  const selectMode = document.getElementById('select-mode');
  const selectTarget = document.getElementById('select-target-url');
  const inputDest = document.getElementById('input-dest-folder');
  const inputTgChat = document.getElementById('input-tg-chat');
  const btnSubmitUrl = document.getElementById('btn-submit-url');

  formUrl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = inputUrl.value.trim();
    if (!url) return;

    btnSubmitUrl.disabled = true;
    btnSubmitUrl.classList.add('opacity-70');

    try {
      const res = await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          mode: selectMode.value,
          upload_target: selectTarget.value,
          dest_folder: inputDest.value.trim() || 'TorCloud',
          telegram_chat: inputTgChat.value.trim() || 'me'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Task added! Downloading content...', 'success');
        inputUrl.value = '';
        fetchTasks();
      } else {
        showToast(data.error || 'Failed to add task', 'error');
      }
    } catch (err) {
      showToast('Network error while adding task', 'error');
    } finally {
      btnSubmitUrl.disabled = false;
      btnSubmitUrl.classList.remove('opacity-70');
    }
  });

  // File Upload form
  const formUpload = document.getElementById('form-upload-task');
  const fileInput = document.getElementById('file-input');
  const selectTargetUpload = document.getElementById('select-target-upload');
  const inputUploadDest = document.getElementById('input-upload-dest');
  const inputUploadTgChat = document.getElementById('input-upload-tg-chat');
  const btnSubmitUpload = document.getElementById('btn-submit-upload');

  formUpload.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_target', selectTargetUpload.value);
    formData.append('dest_folder', inputUploadDest.value.trim() || 'TorCloud');
    formData.append('telegram_chat', inputUploadTgChat.value.trim() || 'me');

    btnSubmitUpload.disabled = true;
    btnSubmitUpload.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Uploading...</span>`;
    lucide.createIcons();

    try {
      const res = await fetch('/api/tasks/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Uploaded ${file.name}! Syncing to destination...`, 'success');
        fileInput.value = '';
        document.getElementById('selected-file-display').textContent = 'No file selected';
        document.getElementById('selected-file-display').classList.add('italic', 'text-zinc-400');
        fetchTasks();
      } else {
        showToast(data.error || 'Failed to upload file', 'error');
      }
    } catch (err) {
      showToast('Error uploading file to server', 'error');
    } finally {
      btnSubmitUpload.disabled = false;
      btnSubmitUpload.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i><span>Upload & Sync</span>`;
      lucide.createIcons();
    }
  });

  // Clear finished tasks
  document.getElementById('btn-clear-tasks').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/tasks/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Cleared ${data.cleared_count} finished tasks`, 'info');
        fetchTasks();
      }
    } catch (err) {
      showToast('Failed to clear finished tasks', 'error');
    }
  });
}

// Fetch Google Drive Storage Information
async function fetchGDriveInfo() {
  try {
    const res = await fetch('/api/gdrive/info');
    const data = await res.json();
    if (data.success && data.info.connected) {
      const info = data.info;
      document.getElementById('remote-indicator').className = 'h-2 w-2 rounded-full bg-emerald-400';
      document.getElementById('remote-name').textContent = info.remote;
      document.getElementById('storage-progress').style.width = `${Math.min(100, info.percent_used)}%`;
      document.getElementById('storage-text').textContent = `${info.used_str} / ${info.total_str}`;
      document.getElementById('stat-drive-free').textContent = info.free_str;
    } else {
      document.getElementById('remote-indicator').className = 'h-2 w-2 rounded-full bg-rose-500';
      document.getElementById('storage-text').textContent = 'Disconnected';
      document.getElementById('stat-drive-free').textContent = 'N/A';
    }
  } catch (err) {
    console.error('Failed to query gdrive info:', err);
  }
}

// Telegram Controls & Status
function setupTelegramControls() {
  const modal = document.getElementById('modal-telegram');
  const btnOpen = document.getElementById('btn-open-telegram-modal');
  const btnClose = document.getElementById('btn-close-tg-modal');
  const btnSaveConfig = document.getElementById('btn-save-tg-config');
  const btnSendCode = document.getElementById('btn-send-tg-code');
  const btnVerifyCode = document.getElementById('btn-verify-tg-code');
  const btnBotLogin = document.getElementById('btn-tg-bot-login');
  const btnLogout = document.getElementById('btn-tg-logout');

  btnOpen.addEventListener('click', () => {
    modal.classList.remove('hidden');
    fetchTelegramStatus();
  });

  btnClose.addEventListener('click', () => modal.classList.add('hidden'));

  // Save Config
  btnSaveConfig.addEventListener('click', async () => {
    const apiId = document.getElementById('input-tg-api-id').value.trim();
    const apiHash = document.getElementById('input-tg-api-hash').value.trim();
    const defaultChat = document.getElementById('input-tg-default-chat').value.trim() || 'me';

    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_id: apiId, api_hash: apiHash, default_chat: defaultChat })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Telegram configuration saved!', 'success');
        fetchTelegramStatus();
      } else {
        showToast(data.error || 'Failed to save config', 'error');
      }
    } catch (err) {
      showToast('Error saving Telegram config', 'error');
    }
  });

  // Send Code
  btnSendCode.addEventListener('click', async () => {
    const phone = document.getElementById('input-tg-phone').value.trim();
    if (!phone) {
      showToast('Please enter your phone number with country code', 'warning');
      return;
    }

    btnSendCode.disabled = true;
    btnSendCode.textContent = 'Sending...';

    try {
      const res = await fetch('/api/telegram/send_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Verification code sent to your Telegram app!', 'success');
        document.getElementById('tg-verify-section').classList.remove('hidden');
      } else {
        showToast(data.error || 'Failed to send code', 'error');
      }
    } catch (err) {
      showToast('Network error sending code', 'error');
    } finally {
      btnSendCode.disabled = false;
      btnSendCode.textContent = 'Send Code';
    }
  });

  // Verify Code
  btnVerifyCode.addEventListener('click', async () => {
    const phone = document.getElementById('input-tg-phone').value.trim();
    const code = document.getElementById('input-tg-code').value.trim();
    const password = document.getElementById('input-tg-password').value.trim();

    if (!code) {
      showToast('Please enter the verification code', 'warning');
      return;
    }

    btnVerifyCode.disabled = true;
    btnVerifyCode.textContent = 'Verifying...';

    try {
      const res = await fetch('/api/telegram/verify_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, code: code, password: password })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Authorized as @${data.username || data.id}!`, 'success');
        document.getElementById('tg-verify-section').classList.add('hidden');
        fetchTelegramStatus();
      } else {
        showToast(data.error || 'Verification failed', 'error');
      }
    } catch (err) {
      showToast('Error verifying code', 'error');
    } finally {
      btnVerifyCode.disabled = false;
      btnVerifyCode.textContent = 'Verify Code & Authorize';
    }
  });

  // Bot Login
  btnBotLogin.addEventListener('click', async () => {
    const botToken = document.getElementById('input-tg-bot-token').value.trim();
    if (!botToken) {
      showToast('Please enter your Telegram bot token', 'warning');
      return;
    }

    btnBotLogin.disabled = true;
    btnBotLogin.textContent = 'Connecting...';

    try {
      const res = await fetch('/api/telegram/bot_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: botToken })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Logged in as bot @${data.username}!`, 'success');
        fetchTelegramStatus();
      } else {
        showToast(data.error || 'Bot login failed', 'error');
      }
    } catch (err) {
      showToast('Network error during bot login', 'error');
    } finally {
      btnBotLogin.disabled = false;
      btnBotLogin.textContent = 'Sign In Bot';
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/telegram/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Logged out of Telegram', 'info');
        fetchTelegramStatus();
      }
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  });
}

// Fetch Telegram Status
async function fetchTelegramStatus() {
  try {
    const res = await fetch('/api/telegram/status');
    const data = await res.json();
    if (data.success) {
      const status = data.status;
      const headerText = document.getElementById('header-tg-status');
      const authIcon = document.getElementById('tg-auth-icon');
      const sessionUser = document.getElementById('tg-session-user');
      const sessionDetail = document.getElementById('tg-session-detail');
      const btnLogout = document.getElementById('btn-tg-logout');
      const statTg = document.getElementById('stat-tg-target');

      // Fill settings inputs if present
      if (status.settings) {
        if (status.settings.api_id) document.getElementById('input-tg-api-id').value = status.settings.api_id;
        if (status.settings.default_chat) {
          document.getElementById('input-tg-default-chat').value = status.settings.default_chat;
          document.getElementById('input-tg-chat').value = status.settings.default_chat;
          document.getElementById('input-upload-tg-chat').value = status.settings.default_chat;
          statTg.textContent = status.settings.default_chat.startsWith('@') ? status.settings.default_chat : `@${status.settings.default_chat}`;
        }
      }

      if (status.authorized) {
        headerText.textContent = `@${status.username || status.name || 'Telegram'}`;
        headerText.className = 'text-orange-400 font-semibold truncate max-w-[120px]';
        authIcon.className = 'w-3 h-3 rounded-full bg-emerald-400';
        sessionUser.textContent = `Authorized: ${status.name} (@${status.username || status.id})`;
        sessionDetail.textContent = status.is_bot ? 'Connected via Telegram Bot Token' : 'Connected via User Account Session';
        btnLogout.classList.remove('hidden');
      } else {
        headerText.textContent = 'Connect TG';
        headerText.className = 'text-zinc-400 font-normal';
        authIcon.className = 'w-3 h-3 rounded-full bg-rose-500';
        sessionUser.textContent = 'Not Authorized';
        sessionDetail.textContent = status.message || 'Set API ID & Hash and sign in to enable Telegram sync.';
        btnLogout.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Failed to fetch Telegram status:', err);
  }
}

// Fetch Tasks
async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks');
    const data = await res.json();
    if (data.success) {
      allTasks = data.tasks;
      updateCounts(allTasks);
      renderTasks(allTasks);

      // Auto update open logs modal if currently viewing an active task
      if (currentViewingTaskId) {
        const t = allTasks.find(item => item.id === currentViewingTaskId);
        if (t && t.logs) {
          const content = document.getElementById('log-modal-content');
          const isAtBottom = (content.scrollHeight - content.scrollTop <= content.clientHeight + 50);
          content.innerHTML = t.logs.map(line => `<div>${escapeHtml(line)}</div>`).join('');
          if (isAtBottom) content.scrollTop = content.scrollHeight;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching tasks:', err);
  }
}

// Filter buttons
function setupFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.className = 'filter-btn px-2.5 py-1 rounded font-medium text-zinc-400 hover:text-zinc-200 transition-colors';
      });
      btn.className = 'filter-btn px-2.5 py-1 rounded font-medium bg-orange-600 text-white transition-colors';
      currentFilter = btn.dataset.filter;
      renderTasks(allTasks);
    });
  });
}

function updateCounts(tasks) {
  let active = 0, completed = 0, failed = 0;
  tasks.forEach(t => {
    if (['downloading', 'uploading', 'queued'].includes(t.status)) active++;
    else if (t.status === 'completed') completed++;
    else if (['failed', 'cancelled'].includes(t.status)) failed++;
  });

  document.getElementById('count-all').textContent = tasks.length;
  document.getElementById('count-active').textContent = active;
  document.getElementById('count-completed').textContent = completed;
  document.getElementById('count-failed').textContent = failed;

  // Header quick stats
  document.getElementById('stat-active-count').textContent = active;
  document.getElementById('stat-completed-count').textContent = completed;
}

// Render Tasks List
function renderTasks(tasks) {
  const container = document.getElementById('tasks-container');
  
  let filtered = tasks;
  if (currentFilter === 'active') {
    filtered = tasks.filter(t => ['downloading', 'uploading', 'queued'].includes(t.status));
  } else if (currentFilter === 'completed') {
    filtered = tasks.filter(t => t.status === 'completed');
  } else if (currentFilter === 'failed') {
    filtered = tasks.filter(t => ['failed', 'cancelled'].includes(t.status));
  }

  // Keyword filter
  if (searchKeyword) {
    filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(searchKeyword));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div id="empty-state" class="text-center py-16 flat-panel rounded-xl">
        <div class="w-12 h-12 rounded-lg bg-orange-500/10 text-orange-400 mx-auto flex items-center justify-center mb-2.5 border border-orange-500/20">
          <i data-lucide="inbox" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-semibold text-zinc-200">No active tasks</h3>
        <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Try clearing search filters or launching a new download above.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const html = filtered.map(task => {
    const isCompleted = task.status === 'completed';
    const isFailed = task.status === 'failed';
    const isCancelled = task.status === 'cancelled';
    const isDownloading = task.status === 'downloading';
    const isUploading = task.status === 'uploading';
    const isQueued = task.status === 'queued';

    // Status Badge Styling
    let badgeClass = 'bg-zinc-850 text-zinc-400 border-zinc-700';
    let badgeText = 'Queued';
    let badgeIcon = 'clock';

    if (isDownloading) {
      badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      badgeText = `Downloading ${task.progress}%`;
      badgeIcon = 'arrow-down-circle';
    } else if (isUploading) {
      if (task.phase === 'telegram') {
        badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
        badgeText = `Uploading to Telegram ${task.progress}%`;
        badgeIcon = 'send';
      } else {
        badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
        badgeText = `Syncing to Drive ${task.progress}%`;
        badgeIcon = 'cloud-upload';
      }
    } else if (isCompleted) {
      badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      badgeText = task.upload_target === 'telegram' ? 'Sent to Telegram' : (task.upload_target === 'both' ? 'Drive & TG Synced' : 'Synced to Drive');
      badgeIcon = 'check-circle';
    } else if (isFailed) {
      badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      badgeText = 'Failed';
      badgeIcon = 'x-circle';
    } else if (isCancelled) {
      badgeClass = 'bg-zinc-800 text-zinc-400 border-zinc-700';
      badgeText = 'Cancelled';
      badgeIcon = 'slash';
    }

    // Progress bar color
    let barColor = 'bg-orange-600';
    let animClass = '';
    if (isDownloading || isUploading) {
      barColor = 'bg-orange-600';
      animClass = 'progress-flat-orange';
    } else if (isCompleted) {
      barColor = 'bg-emerald-600';
    } else if (isFailed) {
      barColor = 'bg-rose-600';
    }

    // Icon by extension / source
    let fileIcon = 'file';
    const nameLower = task.name.toLowerCase();
    if (task.source_type === 'torrent' || nameLower.endsWith('.torrent')) fileIcon = 'zap';
    else if (/\.(mp4|mkv|avi|mov|flv|webm)$/.test(nameLower)) fileIcon = 'film';
    else if (/\.(mp3|wav|flac|aac|m4a)$/.test(nameLower)) fileIcon = 'music';
    else if (/\.(zip|tar|gz|rar|7z|bz2|iso)$/.test(nameLower)) fileIcon = 'archive';
    else if (/\.(jpg|png|webp|gif|svg)$/.test(nameLower)) fileIcon = 'image';

    // Target label
    let targetPill = '';
    if (task.upload_target === 'telegram') {
      targetPill = `<span class="text-orange-400 bg-orange-950/40 border border-orange-800/60 px-1.5 py-0.5 rounded text-[11px] font-mono">✈️ TG: ${escapeHtml(task.telegram_chat || 'me')}</span>`;
    } else if (task.upload_target === 'both') {
      targetPill = `<span class="text-orange-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] font-mono">☁️ Drive + ✈️ TG</span>`;
    } else {
      targetPill = `<span class="text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] font-mono">☁️ ${escapeHtml(task.remote)}${escapeHtml(task.dest_folder)}/</span>`;
    }

    return `
      <div class="flat-panel rounded-xl p-4 transition-colors">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <!-- Left info -->
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-9 h-9 rounded-lg bg-[#18181b] border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
              <i data-lucide="${fileIcon}" class="w-4 h-4 text-orange-400"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-sm font-bold text-white truncate max-w-md sm:max-w-lg" title="${escapeHtml(task.name)}">
                  ${escapeHtml(task.name)}
                </h4>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${badgeClass}">
                  <i data-lucide="${badgeIcon}" class="w-3 h-3"></i>
                  ${badgeText}
                </span>
                ${(task.telegram_media && task.telegram_media.length > 0) ? `
                  <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400">
                    <span class="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                    STREAMABLE
                  </span>
                ` : ''}
              </div>
              <div class="flex items-center gap-2 text-xs text-zinc-400 mt-1 flex-wrap">
                <span class="text-zinc-500 font-medium">Dest:</span>
                ${targetPill}
                <span class="text-zinc-600">•</span>
                <span class="font-mono text-zinc-300">${escapeHtml(task.downloaded_size_str)} / ${escapeHtml(task.total_size_str)}</span>
                ${task.speed !== '0 B/s' && !isCompleted ? `<span class="text-zinc-600">•</span><span class="text-orange-400 font-bold font-mono">${escapeHtml(task.speed)}</span>` : ''}
                ${task.eta !== '--' && !isCompleted ? `<span class="text-zinc-600">•</span><span class="text-zinc-400 font-mono">ETA: ${escapeHtml(task.eta)}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Right actions -->
          <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
            ${(task.telegram_media && task.telegram_media.length > 0) ? `
              <button onclick="openTelegramPlayer('${task.id}')" title="Play Streamable Video / Audio" class="px-2.5 py-1 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                <span>Stream</span>
              </button>
            ` : ''}

            ${(task.upload_target === 'gdrive' && isCompleted && /\.(mp4|mkv|webm|mov|avi|mp3|m4a|flac)$/i.test(task.name)) ? `
              <button onclick="openDrivePlayerByName('${escapeHtml(task.name)}')" title="Play via Drive Embed" class="px-2.5 py-1 text-xs font-semibold bg-zinc-800 hover:bg-orange-600 text-zinc-200 hover:text-white border border-zinc-700 hover:border-orange-500 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                <i data-lucide="play" class="w-3.5 h-3.5 fill-current text-orange-400"></i>
                <span>Stream</span>
              </button>
            ` : ''}

            <button onclick="copyTaskName('${escapeHtml(task.name)}')" title="Copy Filename" class="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            </button>

            <button onclick="viewLogs('${task.id}')" title="View Terminal Logs" class="p-1.5 text-zinc-400 hover:text-orange-400 rounded hover:bg-zinc-800 transition-colors">
              <i data-lucide="terminal" class="w-3.5 h-3.5"></i>
            </button>

            ${(isDownloading || isUploading || isQueued) ? `
              <button onclick="cancelTask('${task.id}')" title="Cancel Task" class="p-1.5 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800 transition-colors">
                <i data-lucide="stop-circle" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}

            ${(isFailed || isCancelled) ? `
              <button onclick="retryTask('${task.id}')" title="Retry Task" class="p-1.5 text-zinc-400 hover:text-orange-400 rounded hover:bg-zinc-800 transition-colors">
                <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}

            <button onclick="deleteTask('${task.id}')" title="Delete Task" class="p-1.5 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800 transition-colors">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

        </div>

        <!-- Progress Bar -->
        <div class="mt-3">
          <div class="w-full bg-[#18181b] rounded h-1.5 overflow-hidden border border-zinc-800">
            <div class="${barColor} ${animClass} h-full rounded transition-all duration-300" style="width: ${task.progress}%"></div>
          </div>
        </div>

        ${isFailed && task.error_message ? `
          <div class="mt-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded flex items-center gap-2">
            <i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0 text-rose-400"></i>
            <span class="truncate">${escapeHtml(task.error_message)}</span>
          </div>
        ` : ''}

      </div>
    `;
  }).join('');

  container.innerHTML = html;
  lucide.createIcons();
}

// Helpers
function copyTaskName(name) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(name);
    showToast(`Copied "${name}"`, 'info');
  }
}

// Task Actions
async function cancelTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Task cancelled', 'warning');
      fetchTasks();
    }
  } catch (err) {
    showToast('Failed to cancel task', 'error');
  }
}

async function retryTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/retry`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Task re-queued', 'info');
      fetchTasks();
    }
  } catch (err) {
    showToast('Failed to retry task', 'error');
  }
}

async function deleteTask(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Task removed', 'info');
      fetchTasks();
    }
  } catch (err) {
    showToast('Failed to delete task', 'error');
  }
}

// Logs Modal
function viewLogs(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  currentViewingTaskId = taskId;
  const modal = document.getElementById('modal-logs');
  const title = document.getElementById('log-modal-title');
  const content = document.getElementById('log-modal-content');

  title.textContent = `Logs: ${task.name}`;
  if (task.logs && task.logs.length > 0) {
    content.innerHTML = task.logs.map(line => `<div>${escapeHtml(line)}</div>`).join('');
  } else {
    content.innerHTML = `<div class="text-zinc-500 italic">No output logged yet.</div>`;
  }

  modal.classList.remove('hidden');
  content.scrollTop = content.scrollHeight;
}

// Drive Explorer Modal
function setupModals() {
  const gdriveModal = document.getElementById('modal-gdrive');
  const btnBrowse = document.getElementById('btn-browse-gdrive');
  const btnClose = document.getElementById('btn-close-modal');
  const btnRefresh = document.getElementById('btn-refresh-files');
  const closeLogModal = document.getElementById('btn-close-log-modal');
  const logModal = document.getElementById('modal-logs');

  btnBrowse.addEventListener('click', () => {
    gdriveModal.classList.remove('hidden');
    loadDriveFiles('TorCloud');
  });

  btnClose.addEventListener('click', () => gdriveModal.classList.add('hidden'));
  btnRefresh.addEventListener('click', () => loadDriveFiles('TorCloud'));
  closeLogModal.addEventListener('click', () => {
    logModal.classList.add('hidden');
    currentViewingTaskId = null;
  });

  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target === gdriveModal) gdriveModal.classList.add('hidden');
    if (e.target === logModal) {
      logModal.classList.add('hidden');
      currentViewingTaskId = null;
    }
    if (e.target === document.getElementById('modal-telegram')) {
      document.getElementById('modal-telegram').classList.add('hidden');
    }
  });
}

async function loadDriveFiles(folder = 'TorCloud') {
  const listContainer = document.getElementById('gdrive-file-list');
  const folderPath = document.getElementById('modal-folder-path');
  folderPath.textContent = `gdrive:${folder}`;
  listContainer.innerHTML = '<div class="text-center py-8 text-zinc-400 text-xs">Loading files...</div>';

  try {
    const res = await fetch(`/api/gdrive/files?folder=${encodeURIComponent(folder)}`);
    const data = await res.json();
    if (data.success) {
      if (data.files.length === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-10 text-zinc-500 text-xs">
            <i data-lucide="folder-open" class="w-8 h-8 mx-auto mb-2 text-zinc-600"></i>
            No files found in <code>gdrive:${escapeHtml(folder)}</code>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      listContainer.innerHTML = data.files.map(item => {
        const isMedia = !item.is_dir && /\.(mp4|mkv|webm|mov|avi|mp3|m4a|flac|ogg)$/i.test(item.name);
        return `
        <div class="flex items-center justify-between p-3 bg-[#18181b] border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              <i data-lucide="${item.is_dir ? 'folder' : (isMedia ? 'film' : 'file')}" class="w-3.5 h-3.5 ${item.is_dir ? 'text-amber-400' : (isMedia ? 'text-orange-400' : 'text-zinc-400')}"></i>
            </div>
            <span class="text-xs sm:text-sm font-semibold text-zinc-200 truncate">${escapeHtml(item.name)}</span>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 text-xs text-zinc-400 font-mono shrink-0">
            <span class="text-zinc-300">${escapeHtml(item.size_str)}</span>
            ${(isMedia && item.id) ? `
              <button onclick="openDrivePlayer('${item.id}', '${escapeHtml(item.name)}')" title="Stream via Drive Embed" class="px-2 py-1 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded flex items-center gap-1 transition-colors shadow-sm">
                <i data-lucide="play" class="w-3 h-3 fill-current"></i>
                <span>Stream</span>
              </button>
            ` : ''}
            <span class="text-zinc-600 hidden sm:inline">•</span>
            <span class="text-zinc-500 hidden sm:inline">${escapeHtml(item.mod_time)}</span>
          </div>
        </div>
      `;
      }).join('');
      lucide.createIcons();
    }
  } catch (err) {
    listContainer.innerHTML = '<div class="text-center py-8 text-rose-400 text-xs">Failed to load files</div>';
  }
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ================= Streamable Player Logic =================
let currentPlayerState = {
  mode: 'native',
  media: null
};

function setupPlayerModal() {
  const modal = document.getElementById('modal-player');
  const btnClose = document.getElementById('btn-close-player-modal');
  const btnNative = document.getElementById('btn-mode-native');
  const btnEmbed = document.getElementById('btn-mode-embed');
  const btnCopyEmbed = document.getElementById('btn-copy-embed-code');
  const btnCopyStream = document.getElementById('btn-copy-stream-url');

  if (btnClose) {
    btnClose.addEventListener('click', closePlayerModal);
  }

  window.addEventListener('click', (e) => {
    if (e.target === modal) closePlayerModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closePlayerModal();
    }
  });

  if (btnNative && btnEmbed) {
    btnNative.addEventListener('click', () => switchPlayerMode('native'));
    btnEmbed.addEventListener('click', () => switchPlayerMode('embed'));
  }

  if (btnCopyEmbed) {
    btnCopyEmbed.addEventListener('click', () => {
      const code = document.getElementById('input-embed-code').value;
      if (code && navigator.clipboard) {
        navigator.clipboard.writeText(code);
        showToast('Iframe embed code copied to clipboard!', 'success');
      }
    });
  }

  if (btnCopyStream) {
    btnCopyStream.addEventListener('click', () => {
      const url = document.getElementById('input-stream-url').value;
      if (url && navigator.clipboard) {
        navigator.clipboard.writeText(url);
        showToast('Streamable link copied to clipboard!', 'success');
      }
    });
  }
}

function closePlayerModal() {
  const modal = document.getElementById('modal-player');
  const videoPlayer = document.getElementById('player-video');
  const audioPlayer = document.getElementById('player-audio');
  const iframe = document.getElementById('player-iframe');

  if (modal) modal.classList.add('hidden');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = '';
  }
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.src = '';
  }
  if (iframe) {
    iframe.src = '';
  }
}

function switchPlayerMode(mode) {
  currentPlayerState.mode = mode;
  const btnNative = document.getElementById('btn-mode-native');
  const btnEmbed = document.getElementById('btn-mode-embed');
  const videoPlayer = document.getElementById('player-video');
  const audioContainer = document.getElementById('player-audio-container');
  const iframeContainer = document.getElementById('player-iframe-container');

  if (mode === 'native') {
    btnNative.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-orange-600 text-white transition-colors';
    btnEmbed.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white transition-colors';
    iframeContainer.classList.add('hidden');
    if (currentPlayerState.media && currentPlayerState.media.isAudio) {
      audioContainer.classList.remove('hidden');
      videoPlayer.classList.add('hidden');
    } else {
      videoPlayer.classList.remove('hidden');
      audioContainer.classList.add('hidden');
    }
  } else {
    btnEmbed.className = 'px-2.5 py-1 rounded-md text-xs font-medium bg-orange-600 text-white transition-colors';
    btnNative.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white transition-colors';
    iframeContainer.classList.remove('hidden');
    videoPlayer.classList.add('hidden');
    audioContainer.classList.add('hidden');
  }
}

function openTelegramPlayer(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task || !task.telegram_media || task.telegram_media.length === 0) {
    showToast('No streamable Telegram media found for this task', 'warning');
    return;
  }
  const media = task.telegram_media[0];
  showPlayerModal({
    title: media.filename || task.name,
    streamUrl: window.location.origin + media.stream_url,
    embedUrl: media.embed_url || (window.location.origin + media.player_url),
    embedCode: media.embed_code || `<iframe src="${window.location.origin + media.player_url}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`,
    tmeUrl: media.tme_url,
    isAudio: media.is_audio,
    hasOfficialEmbed: Boolean(media.embed_url)
  });
}

function openDrivePlayer(fileId, fileName) {
  const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
  const embedCode = `<iframe src="${previewUrl}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  const playerUrl = `${window.location.origin}/player/gdrive?id=${fileId}&name=${encodeURIComponent(fileName)}`;

  showPlayerModal({
    title: fileName,
    streamUrl: playerUrl,
    embedUrl: previewUrl,
    embedCode: embedCode,
    tmeUrl: previewUrl,
    isAudio: false,
    hasOfficialEmbed: true,
    forceEmbed: true
  });
}

async function openDrivePlayerByName(name) {
  try {
    const res = await fetch('/api/gdrive/files?folder=TorCloud');
    const data = await res.json();
    if (data.success && data.files) {
      const match = data.files.find(f => f.name.toLowerCase() === name.toLowerCase());
      if (match && match.id) {
        openDrivePlayer(match.id, match.name);
        return;
      }
    }
  } catch (err) {}
  showToast(`Please open Drive Files to stream ${name}`, 'info');
}

function showPlayerModal(options) {
  const modal = document.getElementById('modal-player');
  const title = document.getElementById('player-modal-title');
  const videoPlayer = document.getElementById('player-video');
  const audioContainer = document.getElementById('player-audio-container');
  const audioPlayer = document.getElementById('player-audio');
  const iframeContainer = document.getElementById('player-iframe-container');
  const iframe = document.getElementById('player-iframe');
  const toggle = document.getElementById('player-mode-toggle');
  const btnExternal = document.getElementById('player-btn-external');
  const inputEmbed = document.getElementById('input-embed-code');
  const inputStream = document.getElementById('input-stream-url');

  currentPlayerState.media = options;
  title.textContent = options.title;
  inputEmbed.value = options.embedCode;
  inputStream.value = options.streamUrl;

  if (options.tmeUrl) {
    btnExternal.href = options.tmeUrl;
    btnExternal.classList.remove('hidden');
  } else {
    btnExternal.classList.add('hidden');
  }

  if (options.forceEmbed || !options.streamUrl) {
    toggle.classList.add('hidden');
    videoPlayer.classList.add('hidden');
    audioContainer.classList.add('hidden');
    iframeContainer.classList.remove('hidden');
    iframe.src = options.embedUrl;
  } else if (options.hasOfficialEmbed) {
    toggle.classList.remove('hidden');
    switchPlayerMode('native');
    iframe.src = options.embedUrl;
    if (options.isAudio) {
      audioPlayer.src = options.streamUrl;
      audioPlayer.load();
    } else {
      videoPlayer.src = options.streamUrl;
      videoPlayer.load();
    }
  } else {
    toggle.classList.add('hidden');
    iframeContainer.classList.add('hidden');
    if (options.isAudio) {
      audioContainer.classList.remove('hidden');
      videoPlayer.classList.add('hidden');
      audioPlayer.src = options.streamUrl;
      audioPlayer.load();
    } else {
      videoPlayer.classList.remove('hidden');
      audioContainer.classList.add('hidden');
      videoPlayer.src = options.streamUrl;
      videoPlayer.load();
    }
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

