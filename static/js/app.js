// TorCloud Pro Client Application

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
  
  const bgColors = {
    info: 'bg-gray-900 border-white/10 text-slate-100',
    success: 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500/30 text-rose-200',
    warning: 'bg-amber-950/90 border-amber-500/30 text-amber-200'
  };

  const icons = {
    info: 'info',
    success: 'check-circle-2',
    error: 'alert-triangle',
    warning: 'alert-circle'
  };

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md text-xs font-semibold transition-all transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
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
    btnUrl.className = 'tab-btn flex-1 sm:flex-none px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600/90 text-white shadow-md flex items-center justify-center gap-2 transition-all';
    btnUpload.className = 'tab-btn flex-1 sm:flex-none px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 transition-all';
    panelUrl.classList.remove('hidden');
    panelUpload.classList.add('hidden');
  });

  btnUpload.addEventListener('click', () => {
    btnUpload.className = 'tab-btn flex-1 sm:flex-none px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600/90 text-white shadow-md flex items-center justify-center gap-2 transition-all';
    btnUrl.className = 'tab-btn flex-1 sm:flex-none px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 transition-all';
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
      display.classList.remove('italic', 'text-slate-400');
      display.classList.add('text-indigo-300', 'font-semibold');
      submitBtn.removeAttribute('disabled');
    } else {
      display.textContent = 'No file selected';
      display.classList.add('italic', 'text-slate-400');
      display.classList.remove('text-indigo-300', 'font-semibold');
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
    btnSubmitUpload.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Uploading to Server...</span>`;
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
        document.getElementById('selected-file-display').classList.add('italic', 'text-slate-400');
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
      document.getElementById('remote-indicator').className = 'h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
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
        headerText.className = 'text-sky-400 font-semibold truncate max-w-[120px]';
        authIcon.className = 'w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
        sessionUser.textContent = `Authorized: ${status.name} (@${status.username || status.id})`;
        sessionDetail.textContent = status.is_bot ? 'Connected via Telegram Bot Token' : 'Connected via User Account Session';
        btnLogout.classList.remove('hidden');
      } else {
        headerText.textContent = 'Connect TG';
        headerText.className = 'text-slate-400 font-normal';
        authIcon.className = 'w-3.5 h-3.5 rounded-full bg-rose-500';
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
        b.className = 'filter-btn px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-slate-200 transition-colors';
      });
      btn.className = 'filter-btn px-2.5 py-1 rounded-lg font-medium bg-indigo-600 text-white shadow-sm transition-colors';
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
      <div id="empty-state" class="text-center py-20 glass-panel rounded-3xl border border-white/5">
        <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3 ring-1 ring-indigo-500/20">
          <i data-lucide="inbox" class="w-7 h-7"></i>
        </div>
        <h3 class="text-sm font-semibold text-slate-200">No tasks in this view</h3>
        <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Try clearing search filters or launching a new download above.</p>
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
    let badgeClass = 'bg-gray-800 text-slate-300 border-white/10';
    let badgeText = 'Queued';
    let badgeIcon = 'clock';

    if (isDownloading) {
      badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
      badgeText = `Downloading ${task.progress}%`;
      badgeIcon = 'arrow-down-circle';
    } else if (isUploading) {
      if (task.phase === 'telegram') {
        badgeClass = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
        badgeText = `Uploading to Telegram ${task.progress}%`;
        badgeIcon = 'send';
      } else {
        badgeClass = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
        badgeText = `Syncing to Drive ${task.progress}%`;
        badgeIcon = 'cloud-upload';
      }
    } else if (isCompleted) {
      badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      badgeText = task.upload_target === 'telegram' ? 'Sent to Telegram' : (task.upload_target === 'both' ? 'Drive & TG Synced' : 'Synced to Drive');
      badgeIcon = 'check-circle';
    } else if (isFailed) {
      badgeClass = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      badgeText = 'Failed';
      badgeIcon = 'x-circle';
    } else if (isCancelled) {
      badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      badgeText = 'Cancelled';
      badgeIcon = 'slash';
    }

    // Progress bar color
    let barColor = 'bg-indigo-500';
    let animClass = '';
    if (isDownloading) {
      barColor = 'bg-indigo-500';
      animClass = 'progress-animated';
    } else if (isUploading) {
      if (task.phase === 'telegram') {
        barColor = 'bg-sky-500';
        animClass = 'progress-animated-tg';
      } else {
        barColor = 'bg-purple-500';
        animClass = 'progress-animated-gd';
      }
    } else if (isCompleted) {
      barColor = 'bg-emerald-500';
    } else if (isFailed) {
      barColor = 'bg-rose-500';
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
      targetPill = `<span class="text-sky-300 bg-sky-950/60 border border-sky-800/80 px-2 py-0.5 rounded-lg text-[11px] font-mono">✈️ TG: ${escapeHtml(task.telegram_chat || 'me')}</span>`;
    } else if (task.upload_target === 'both') {
      targetPill = `<span class="text-indigo-300 bg-gray-950 border border-white/10 px-2 py-0.5 rounded-lg text-[11px] font-mono">☁️ Drive + ✈️ TG</span>`;
    } else {
      targetPill = `<span class="text-slate-300 bg-gray-950 border border-white/10 px-2 py-0.5 rounded-lg text-[11px] font-mono">☁️ ${escapeHtml(task.remote)}${escapeHtml(task.dest_folder)}/</span>`;
    }

    return `
      <div class="glass-panel rounded-2xl p-4 sm:p-5 transition-all shadow-md hover:shadow-xl border border-white/10">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <!-- Left info -->
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-11 h-11 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
              <i data-lucide="${fileIcon}" class="w-5 h-5 text-indigo-400"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="text-sm font-bold text-white truncate max-w-md sm:max-w-lg" title="${escapeHtml(task.name)}">
                  ${escapeHtml(task.name)}
                </h4>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badgeClass}">
                  <i data-lucide="${badgeIcon}" class="w-3 h-3"></i>
                  ${badgeText}
                </span>
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span class="text-slate-500 font-medium">Dest:</span>
                ${targetPill}
                <span class="text-slate-600">•</span>
                <span class="font-mono">${escapeHtml(task.downloaded_size_str)} / ${escapeHtml(task.total_size_str)}</span>
                ${task.speed !== '0 B/s' && !isCompleted ? `<span class="text-slate-600">•</span><span class="text-indigo-400 font-bold font-mono">${escapeHtml(task.speed)}</span>` : ''}
                ${task.eta !== '--' && !isCompleted ? `<span class="text-slate-600">•</span><span class="text-slate-400 font-mono">ETA: ${escapeHtml(task.eta)}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Right actions -->
          <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
            <button onclick="copyTaskName('${escapeHtml(task.name)}')" title="Copy Filename" class="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
              <i data-lucide="copy" class="w-4 h-4"></i>
            </button>

            <button onclick="viewLogs('${task.id}')" title="View Terminal Logs" class="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors">
              <i data-lucide="terminal" class="w-4 h-4"></i>
            </button>

            ${(isDownloading || isUploading || isQueued) ? `
              <button onclick="cancelTask('${task.id}')" title="Cancel Task" class="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors">
                <i data-lucide="stop-circle" class="w-4 h-4"></i>
              </button>
            ` : ''}

            ${(isFailed || isCancelled) ? `
              <button onclick="retryTask('${task.id}')" title="Retry Task" class="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors">
                <i data-lucide="rotate-cw" class="w-4 h-4"></i>
              </button>
            ` : ''}

            <button onclick="deleteTask('${task.id}')" title="Delete Task" class="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

        </div>

        <!-- Progress Bar -->
        <div class="mt-4">
          <div class="w-full bg-gray-950 rounded-full h-2 overflow-hidden border border-white/5 p-px">
            <div class="${barColor} ${animClass} h-full rounded-full transition-all duration-300" style="width: ${task.progress}%"></div>
          </div>
        </div>

        ${isFailed && task.error_message ? `
          <div class="mt-2.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl flex items-center gap-2">
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
    content.innerHTML = `<div class="text-slate-500 italic">No output logged yet.</div>`;
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
  listContainer.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">Loading files...</div>';

  try {
    const res = await fetch(`/api/gdrive/files?folder=${encodeURIComponent(folder)}`);
    const data = await res.json();
    if (data.success) {
      if (data.files.length === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-12 text-slate-500 text-xs">
            <i data-lucide="folder-open" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
            No files found in <code>gdrive:${escapeHtml(folder)}</code>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      listContainer.innerHTML = data.files.map(item => `
        <div class="flex items-center justify-between p-3.5 bg-gray-950/70 border border-white/5 rounded-2xl hover:border-white/10 transition-colors">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center shrink-0">
              <i data-lucide="${item.is_dir ? 'folder' : 'file'}" class="w-4 h-4 ${item.is_dir ? 'text-amber-400' : 'text-indigo-400'}"></i>
            </div>
            <span class="text-xs sm:text-sm font-semibold text-slate-200 truncate">${escapeHtml(item.name)}</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-slate-400 font-mono shrink-0">
            <span class="text-slate-300">${escapeHtml(item.size_str)}</span>
            <span class="text-slate-600 hidden sm:inline">•</span>
            <span class="text-slate-500 hidden sm:inline">${escapeHtml(item.mod_time)}</span>
          </div>
        </div>
      `).join('');
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
