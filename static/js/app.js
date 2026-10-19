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
  fetchSystemStorage();
  fetchTelegramStatus();
  fetchTasks();
  pollingInterval = setInterval(fetchTasks, 1500);
  setInterval(() => { fetchSystemStorage(); fetchGDriveInfo(); }, 8000);
});

// Toast notification system
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  while (container.children.length > 10) container.removeChild(container.firstChild);
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

  // Home Disk pill triggers refresh
  const vmPill = document.getElementById('vm-status-card');
  if (vmPill) {
    vmPill.addEventListener('click', () => {
      fetchSystemStorage();
      showToast('Refreshed Home disk status', 'info');
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

// Fetch VM / System Storage Information
async function fetchSystemStorage() {
  try {
    const res = await fetch('/api/system/storage');
    const data = await res.json();
    if (data.success && data.storage) {
      const s = data.storage;
      const progressEl = document.getElementById('vm-storage-progress');
      const textEl = document.getElementById('vm-storage-text');
      const statFreeEl = document.getElementById('stat-vm-free');
      const statDetailEl = document.getElementById('stat-vm-detail');
      const indicatorEl = document.getElementById('vm-disk-indicator');

      if (progressEl) progressEl.style.width = `${Math.min(100, s.percent_used)}%`;
      if (textEl) textEl.textContent = `${s.free_str} free`;
      if (statFreeEl) statFreeEl.textContent = s.free_str;
      if (statDetailEl) {
        statDetailEl.textContent = `${s.used_str} / ${s.total_str} (${s.percent_used}%)`;
      }

      if (indicatorEl) {
        if (s.is_low_space) {
          indicatorEl.className = 'h-2 w-2 rounded-full bg-rose-500 animate-pulse';
          if (progressEl) progressEl.className = 'bg-rose-500 h-1.5 rounded transition-all duration-300';
        } else if (s.percent_used > 85) {
          indicatorEl.className = 'h-2 w-2 rounded-full bg-amber-400';
          if (progressEl) progressEl.className = 'bg-amber-500 h-1.5 rounded transition-all duration-300';
        } else {
          indicatorEl.className = 'h-2 w-2 rounded-full bg-emerald-400';
          if (progressEl) progressEl.className = 'bg-orange-500 h-1.5 rounded transition-all duration-300';
        }
      }
    }
  } catch (err) {
    console.error('Failed to query system storage:', err);
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
    const password = document.getElementById('input-tg-password').value;

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

function safeSetInputValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el && document.activeElement !== el) {
    el.value = value;
  }
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
        if (status.settings.api_id) safeSetInputValue('input-tg-api-id', status.settings.api_id);
        if (status.settings.default_chat) {
          safeSetInputValue('input-tg-default-chat', status.settings.default_chat);
          safeSetInputValue('input-tg-chat', status.settings.default_chat);
          safeSetInputValue('input-upload-tg-chat', status.settings.default_chat);
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
let isFetching = false;

async function fetchTasks() {
  if (isFetching) return;
  isFetching = true;
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
  } finally {
    isFetching = false;
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

// Track task IDs that currently have inline stream tray expanded
const openStreamTasks = new Set();
const openDriveStreamIds = new Set();

// Render Tasks List with Smart Stable DOM Reconciliation
function renderTasks(tasks) {
  const container = document.getElementById('tasks-container');
  if (!container) return;
  
  let filtered = tasks;
  if (currentFilter === 'active') {
    // Keep active tasks, plus any task currently being streamed so it never abruptly vanishes!
    filtered = tasks.filter(t => ['downloading', 'uploading', 'queued'].includes(t.status) || openStreamTasks.has(t.id));
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
        <h3 class="text-sm font-semibold text-zinc-200">No tasks in this view</h3>
        <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Try selecting "All" or adding a new transfer above.</p>
      </div>
    `;
    lucide.createIcons({ root: container });
    return;
  }

  // Check if we can perform stable in-place updates without rebuilding the DOM
  const existingCards = container.querySelectorAll('.task-card-item');
  const existingIds = Array.from(existingCards).map(el => el.dataset.taskId);
  const newIds = filtered.map(t => t.id);

  const isSameList = existingIds.length === newIds.length && existingIds.every((id, i) => id === newIds[i]);
  if (isSameList && existingCards.length > 0) {
    // Stable in-place update: preserves video playback, inputs, focus and scroll position!
    filtered.forEach(task => updateTaskCardInPlace(task));
    return;
  }

  // Structural update needed: build card elements
  const html = filtered.map(task => createTaskCardHtml(task)).join('');
  container.innerHTML = html;
  lucide.createIcons({ root: container });

  // Re-attach active inline stream trays
  filtered.forEach(task => {
    if (openStreamTasks.has(task.id)) {
      renderInlineStreamTray(task.id);
    }
  });
}

function getTaskBadgeInfo(task) {
  const isDownloading = task.status === 'downloading';
  const isUploading = task.status === 'uploading';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isCancelled = task.status === 'cancelled';

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

  return { badgeClass, badgeText, badgeIcon };
}

function updateTaskCardInPlace(task) {
  const card = document.getElementById(`task-card-${task.id}`);
  if (!card) return;

  if (card.dataset.taskStatus !== task.status) {
    card.outerHTML = createTaskCardHtml(task);
    const newCard = document.getElementById(`task-card-${task.id}`);
    if (newCard) {
      newCard.dataset.taskStatus = task.status;
      lucide.createIcons({ root: newCard });
      if (openStreamTasks.has(task.id)) {
        renderInlineStreamTray(task.id);
      }
    }
    return;
  }

  card.dataset.taskStatus = task.status;

  const { badgeClass, badgeText } = getTaskBadgeInfo(task);

  // Update badge
  const badgeEl = document.getElementById(`task-badge-${task.id}`);
  if (badgeEl && badgeEl.textContent.trim() !== badgeText) {
    badgeEl.className = `inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${badgeClass}`;
    badgeEl.innerHTML = `<span class="h-1.5 w-1.5 rounded-full ${task.status === 'completed' ? 'bg-emerald-400' : 'bg-orange-500'}"></span><span>${escapeHtml(badgeText)}</span>`;
  }

  // Update progress bar
  const barEl = document.getElementById(`task-bar-${task.id}`);
  if (barEl) {
    barEl.style.width = `${task.progress}%`;
    if (task.status === 'completed') {
      barEl.className = 'bg-emerald-600 h-full rounded transition-all duration-300';
    } else if (task.status === 'failed') {
      barEl.className = 'bg-rose-600 h-full rounded transition-all duration-300';
    } else {
      barEl.className = 'bg-orange-600 progress-flat-orange h-full rounded transition-all duration-300';
    }
  }

  // Update sizes & stats
  const sizeEl = document.getElementById(`task-size-${task.id}`);
  if (sizeEl) {
    sizeEl.textContent = `${task.downloaded_size_str} / ${task.total_size_str}`;
  }

  const speedEl = document.getElementById(`task-speed-${task.id}`);
  if (speedEl) {
    if (task.speed !== '0 B/s' && task.status !== 'completed') {
      speedEl.textContent = task.speed;
      speedEl.classList.remove('hidden');
    } else {
      speedEl.classList.add('hidden');
    }
  }

  const etaEl = document.getElementById(`task-eta-${task.id}`);
  if (etaEl) {
    if (task.eta !== '--' && task.status !== 'completed') {
      etaEl.textContent = `ETA: ${task.eta}`;
      etaEl.classList.remove('hidden');
    } else {
      etaEl.classList.add('hidden');
    }
  }

  // Reveal Stream Button if task has completed and streamable media is present
  const streamBtn = document.getElementById(`task-stream-btn-${task.id}`);
  const hasStreamable = (task.telegram_media && task.telegram_media.length > 0) || (task.upload_target === 'gdrive' && task.status === 'completed' && /\.(mp4|mkv|webm|mov|avi|mp3|m4a|flac)$/i.test(task.name));
  if (streamBtn) {
    if (hasStreamable) {
      streamBtn.classList.remove('hidden');
    } else {
      streamBtn.classList.add('hidden');
    }
  }

  // Reveal STREAMABLE pill
  const streamPill = document.getElementById(`task-stream-pill-${task.id}`);
  if (streamPill) {
    if (hasStreamable) {
      streamPill.classList.remove('hidden');
    } else {
      streamPill.classList.add('hidden');
    }
  }
}

function createTaskCardHtml(task) {
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isCancelled = task.status === 'cancelled';
  const isDownloading = task.status === 'downloading';
  const isUploading = task.status === 'uploading';
  const isQueued = task.status === 'queued';

  const { badgeClass, badgeText, badgeIcon } = getTaskBadgeInfo(task);

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

  let fileIcon = 'file';
  const nameLower = task.name.toLowerCase();
  if (task.source_type === 'torrent' || nameLower.endsWith('.torrent')) fileIcon = 'zap';
  else if (/\.(mp4|mkv|avi|mov|flv|webm)$/.test(nameLower)) fileIcon = 'film';
  else if (/\.(mp3|wav|flac|aac|m4a)$/.test(nameLower)) fileIcon = 'music';
  else if (/\.(zip|tar|gz|rar|7z|bz2|iso)$/.test(nameLower)) fileIcon = 'archive';
  else if (/\.(jpg|png|webp|gif|svg)$/.test(nameLower)) fileIcon = 'image';

  let targetPill = '';
  if (task.upload_target === 'telegram') {
    targetPill = `<span class="text-orange-400 bg-orange-950/40 border border-orange-800/60 px-1.5 py-0.5 rounded text-[11px] font-mono">✈️ TG: ${escapeHtml(task.telegram_chat || 'me')}</span>`;
  } else if (task.upload_target === 'both') {
    targetPill = `<span class="text-orange-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] font-mono">☁️ Drive + ✈️ TG</span>`;
  } else {
    targetPill = `<span class="text-zinc-300 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] font-mono">☁️ ${escapeHtml(task.remote)}${escapeHtml(task.dest_folder)}/</span>`;
  }

  const hasStreamable = (task.telegram_media && task.telegram_media.length > 0) || (task.upload_target === 'gdrive' && isCompleted && /\.(mp4|mkv|webm|mov|avi|mp3|m4a|flac)$/i.test(task.name));

  return `
    <div id="task-card-${task.id}" class="task-card-item flat-panel rounded-xl p-4 transition-colors" data-task-id="${task.id}" data-task-status="${task.status}">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        <!-- Left info -->
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="w-9 h-9 rounded-lg bg-[#18181b] border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="${fileIcon}" class="w-4 h-4 text-orange-400"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="text-sm font-bold text-white truncate max-w-md sm:max-w-lg" title="${escapeHtml(task.name)}">
                ${escapeHtml(task.name)}
              </h4>
              <span id="task-badge-${task.id}" class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${badgeClass}">
                <i data-lucide="${badgeIcon}" class="w-3 h-3"></i>
                ${badgeText}
              </span>
              <span id="task-stream-pill-${task.id}" class="${hasStreamable ? '' : 'hidden'} inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400">
                <span class="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                STREAMABLE
              </span>
            </div>
            <div class="flex items-center gap-2 text-xs text-zinc-400 mt-1 flex-wrap">
              <span class="text-zinc-500 font-medium">Dest:</span>
              ${targetPill}
              <span class="text-zinc-600">•</span>
              <span id="task-size-${task.id}" class="font-mono text-zinc-300">${escapeHtml(task.downloaded_size_str)} / ${escapeHtml(task.total_size_str)}</span>
              <span id="task-speed-${task.id}" class="${task.speed !== '0 B/s' && !isCompleted ? '' : 'hidden'} text-orange-400 font-bold font-mono">${escapeHtml(task.speed)}</span>
              <span id="task-eta-${task.id}" class="${task.eta !== '--' && !isCompleted ? '' : 'hidden'} text-zinc-400 font-mono">ETA: ${escapeHtml(task.eta)}</span>
            </div>
          </div>
        </div>

        <!-- Right actions -->
        <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          <button id="task-stream-btn-${task.id}" onclick="toggleInlineStream('${task.id}')" title="Play & Stream Media (Never leaves dashboard)"
            class="${hasStreamable ? '' : 'hidden'} px-2.5 py-1 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
            <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
            <span>Stream</span>
          </button>

          <button onclick="copyTaskNameById('${task.id}')" title="Copy Filename" class="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors">
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
          <div id="task-bar-${task.id}" class="${barColor} ${animClass} h-full rounded transition-all duration-300" style="width: ${task.progress}%"></div>
        </div>
      </div>

      ${isFailed && task.error_message ? `
        <div class="mt-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded flex items-center gap-2">
          <i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0 text-rose-400"></i>
          <span class="truncate">${escapeHtml(task.error_message)}</span>
        </div>
      ` : ''}

      <!-- Inline Stream Tray (Expands inside the card without hiding any listing!) -->
      <div id="stream-tray-${task.id}" class="hidden mt-3 pt-3 border-t border-zinc-800 space-y-3">
      </div>

    </div>
  `;
}

// Inline Stream Player Tray Logic (100% stable, keeps all listings in place)
function toggleInlineStream(taskId) {
  const tray = document.getElementById(`stream-tray-${taskId}`);
  if (!tray) return;

  if (!tray.classList.contains('hidden')) {
    closeInlineStream(taskId);
    return;
  }

  openStreamTasks.add(taskId);
  tray.classList.remove('hidden');
  renderInlineStreamTray(taskId);
}

function closeInlineStream(taskId) {
  openStreamTasks.delete(taskId);
  const tray = document.getElementById(`stream-tray-${taskId}`);
  if (tray) {
    const video = tray.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
    }
    const iframe = tray.querySelector('iframe');
    if (iframe) {
      iframe.src = '';
    }
    tray.classList.add('hidden');
    tray.innerHTML = '';
  }
}

function renderInlineStreamTray(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  const tray = document.getElementById(`stream-tray-${taskId}`);
  if (!task || !tray) return;

  // Handle Telegram media
  if (task.telegram_media && task.telegram_media.length > 0) {
    const media = task.telegram_media[0];
    const streamUrl = window.location.origin + media.stream_url;
    const embedUrl = media.embed_url || (window.location.origin + media.player_url);
    const playerUrl = window.location.origin + media.player_url;
    const embedCode = media.embed_code || `<iframe src="${playerUrl}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

    tray.innerHTML = `
      <div class="bg-black/90 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
        
        <!-- Tray Header Bar -->
        <div class="px-4 py-2.5 bg-[#121215] border-b border-zinc-800 flex items-center justify-between">
          <div class="flex items-center space-x-2 truncate pr-2">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600/20 text-orange-400 border border-orange-500/30">
              <span class="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></span>
              STREAMABLE PLAYER
            </span>
            <span class="text-xs font-semibold text-zinc-200 truncate">${escapeHtml(media.filename || task.name)}</span>
            ${media.dimensions ? `<span class="text-[10px] text-zinc-500 font-mono hidden sm:inline">(${escapeHtml(media.dimensions)})</span>` : ''}
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            ${media.embed_url ? `
              <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[11px]">
                <button onclick="switchTrayMode('${taskId}', 'embed')" id="btn-tray-embed-${taskId}" class="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-600 text-white">
                  Telegram Player
                </button>
                <button onclick="switchTrayMode('${taskId}', 'native')" id="btn-tray-native-${taskId}" class="px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-white">
                  Native HTML5
                </button>
              </div>
            ` : ''}

            <a href="${playerUrl}" target="_blank" title="Open Fullscreen in New Tab" class="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors">
              <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-orange-400"></i>
            </a>

            ${media.tme_url ? `
              <a href="${media.tme_url}" target="_blank" title="Open in Telegram" class="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors">
                <i data-lucide="send" class="w-3.5 h-3.5 text-orange-400"></i>
              </a>
            ` : ''}

            <button onclick="closeInlineStream('${taskId}')" title="Close Stream Tray" class="p-1.5 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800 transition-colors">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Player Viewport -->
        <div class="relative bg-black flex items-center justify-center min-h-[280px] sm:min-h-[400px] max-h-[55vh] w-full overflow-hidden">
          
          <!-- Iframe container (default if official embed available) -->
          <div id="tray-iframe-box-${taskId}" class="${media.embed_url ? '' : 'hidden'} w-full h-[400px]">
            ${media.embed_url ? `<iframe src="${media.embed_url}" class="w-full h-full border-0" allow="autoplay; fullscreen" allowfullscreen></iframe>` : ''}
          </div>

          <!-- Video container -->
          <div id="tray-video-box-${taskId}" class="${media.embed_url ? 'hidden' : ''} w-full h-full">
            <video id="tray-video-${taskId}" controls playsinline class="w-full h-full max-h-[55vh] object-contain">
              <source src="${streamUrl}" type="video/mp4">
              Your browser does not support HTML5 video streaming.
            </video>
          </div>

        </div>

        <!-- Action Toolbar -->
        <div class="px-4 py-3 bg-[#121215] border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
          <div class="flex-1 flex items-center gap-2 min-w-0">
            <span class="text-zinc-500 font-mono text-[11px] shrink-0">Embed:</span>
            <input type="text" readonly value="${escapeHtml(embedCode)}"
              class="flex-1 bg-[#18181b] border border-zinc-800 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-300 select-all focus:outline-none">
            <button onclick="copyToClipboard('${escapeHtml(embedCode)}', 'Embed code copied!')" class="px-2.5 py-1 text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-orange-400 rounded border border-zinc-700 flex items-center gap-1 shrink-0">
              <i data-lucide="copy" class="w-3 h-3"></i>
              <span>Copy Embed</span>
            </button>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button onclick="copyToClipboard('${escapeHtml(streamUrl)}', 'Streamable link copied!')" class="px-2.5 py-1 text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded border border-zinc-700 flex items-center gap-1">
              <i data-lucide="link" class="w-3 h-3 text-orange-400"></i>
              <span>Copy Stream Link</span>
            </button>
          </div>
        </div>

      </div>
    `;
    lucide.createIcons({ root: tray });
    return;
  }

  // Handle Google Drive task stream
  if (task.upload_target === 'gdrive' && task.status === 'completed') {
    fetch(`/api/gdrive/files?folder=${encodeURIComponent(task.dest_folder || 'TorCloud')}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.files) {
          const match = data.files.find(f => f.name.toLowerCase() === task.name.toLowerCase());
          if (match && match.id) {
            const previewUrl = `https://drive.google.com/file/d/${match.id}/preview`;
            const playerUrl = `${window.location.origin}/player/gdrive?id=${match.id}&name=${encodeURIComponent(match.name)}`;
            const embedCode = `<iframe src="${previewUrl}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

            tray.innerHTML = `
              <div class="bg-black/90 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                <div class="px-4 py-2.5 bg-[#121215] border-b border-zinc-800 flex items-center justify-between">
                  <span class="text-xs font-semibold text-zinc-200 truncate">Google Drive Stream: ${escapeHtml(match.name)}</span>
                  <div class="flex items-center gap-1.5">
                    <a href="${playerUrl}" target="_blank" title="Open Fullscreen" class="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors">
                      <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-orange-400"></i>
                    </a>
                    <button onclick="closeInlineStream('${taskId}')" class="p-1.5 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800 transition-colors">
                      <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </div>
                <div class="w-full h-[400px] bg-black">
                  <iframe src="${previewUrl}" class="w-full h-full border-0" allow="autoplay; fullscreen" allowfullscreen></iframe>
                </div>
                <div class="px-4 py-3 bg-[#121215] border-t border-zinc-800 flex items-center justify-between gap-2 text-xs">
                  <input type="text" readonly value="${escapeHtml(embedCode)}" class="flex-1 bg-[#18181b] border border-zinc-800 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-300 select-all">
                  <button onclick="copyToClipboard('${escapeHtml(embedCode)}', 'Drive embed code copied!')" class="px-2.5 py-1 text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-orange-400 rounded border border-zinc-700 flex items-center gap-1">
                    <i data-lucide="copy" class="w-3 h-3"></i>
                    <span>Copy Embed</span>
                  </button>
                </div>
              </div>
            `;
            lucide.createIcons({ root: tray });
          }
        }
      });
  }
}

function switchTrayMode(taskId, mode) {
  const btnEmbed = document.getElementById(`btn-tray-embed-${taskId}`);
  const btnNative = document.getElementById(`btn-tray-native-${taskId}`);
  const iframeBox = document.getElementById(`tray-iframe-box-${taskId}`);
  const videoBox = document.getElementById(`tray-video-box-${taskId}`);
  const video = document.getElementById(`tray-video-${taskId}`);

  if (mode === 'embed') {
    if (btnEmbed) btnEmbed.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-orange-600 text-white';
    if (btnNative) btnNative.className = 'px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-white';
    if (iframeBox) iframeBox.classList.remove('hidden');
    if (videoBox) videoBox.classList.add('hidden');
    if (video) video.pause();
  } else {
    if (btnNative) btnNative.className = 'px-2 py-0.5 rounded text-[11px] font-medium bg-orange-600 text-white';
    if (btnEmbed) btnEmbed.className = 'px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-white';
    if (iframeBox) iframeBox.classList.add('hidden');
    if (videoBox) videoBox.classList.remove('hidden');
    if (video) video.play();
  }
}

// Safe Copy Filename without quote escaping hazards
function copyTaskNameById(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (task && navigator.clipboard) {
    navigator.clipboard.writeText(task.name);
    showToast(`Copied "${task.name}"`, 'info');
  }
}

function copyToClipboard(text, msg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    showToast(msg || 'Copied to clipboard!', 'success');
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
    closeInlineStream(taskId);
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

// Modals Setup
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

// Google Drive Browser with Inline Stream Preview (Zero listing disappearance)
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
        lucide.createIcons({ root: listContainer });
        return;
      }

      listContainer.innerHTML = data.files.map(item => {
        const isMedia = !item.is_dir && /\.(mp4|mkv|webm|mov|avi|mp3|m4a|flac|ogg)$/i.test(item.name);
        return `
        <div class="bg-[#18181b] border border-zinc-800 rounded-lg p-3 transition-colors">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                <i data-lucide="${item.is_dir ? 'folder' : (isMedia ? 'film' : 'file')}" class="w-3.5 h-3.5 ${item.is_dir ? 'text-amber-400' : (isMedia ? 'text-orange-400' : 'text-zinc-400')}"></i>
              </div>
              <span class="text-xs sm:text-sm font-semibold text-zinc-200 truncate">${escapeHtml(item.name)}</span>
            </div>
            <div class="flex items-center gap-2 sm:gap-3 text-xs text-zinc-400 font-mono shrink-0">
              <span class="text-zinc-300">${escapeHtml(item.size_str)}</span>
              ${(isMedia && item.id) ? `
                <button onclick="toggleDriveInlinePreview('${item.id}', '${escapeHtml(item.name)}')" title="Streamable Drive Embed" class="px-2 py-1 text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded flex items-center gap-1 transition-colors shadow-sm">
                  <i data-lucide="play" class="w-3 h-3 fill-current"></i>
                  <span>Stream</span>
                </button>
              ` : ''}
              <span class="text-zinc-600 hidden sm:inline">•</span>
              <span class="text-zinc-500 hidden sm:inline">${escapeHtml(item.mod_time)}</span>
            </div>
          </div>

          <!-- Inline Drive Preview Tray (Keeps Drive list fully intact!) -->
          <div id="drive-tray-${item.id}" class="hidden mt-3 pt-3 border-t border-zinc-800 space-y-2">
          </div>
        </div>
      `;
      }).join('');
      lucide.createIcons({ root: listContainer });
    }
  } catch (err) {
    listContainer.innerHTML = '<div class="text-center py-8 text-rose-400 text-xs">Failed to load files</div>';
  }
}

function toggleDriveInlinePreview(fileId, fileName) {
  const tray = document.getElementById(`drive-tray-${fileId}`);
  if (!tray) return;

  if (!tray.classList.contains('hidden')) {
    tray.classList.add('hidden');
    tray.innerHTML = '';
    return;
  }

  const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
  const embedCode = `<iframe src="${previewUrl}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  const playerUrl = `${window.location.origin}/player/gdrive?id=${fileId}&name=${encodeURIComponent(fileName)}`;

  tray.classList.remove('hidden');
  tray.innerHTML = `
    <div class="bg-black/95 rounded-lg border border-zinc-800 overflow-hidden">
      <div class="px-3 py-1.5 bg-[#121215] border-b border-zinc-800 flex items-center justify-between text-xs">
        <span class="text-zinc-300 font-semibold truncate">Preview: ${escapeHtml(fileName)}</span>
        <div class="flex items-center gap-2">
          <a href="${playerUrl}" target="_blank" title="Open Fullscreen" class="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800">
            <i data-lucide="maximize-2" class="w-3.5 h-3.5 text-orange-400"></i>
          </a>
          <button onclick="toggleDriveInlinePreview('${fileId}', '')" class="p-1 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <div class="h-80 w-full bg-black">
        <iframe src="${previewUrl}" class="w-full h-full border-0" allow="autoplay; fullscreen" allowfullscreen></iframe>
      </div>
      <div class="px-3 py-2 bg-[#121215] border-t border-zinc-800 flex items-center justify-between gap-2 text-xs">
        <input type="text" readonly value="${escapeHtml(embedCode)}" class="flex-1 bg-[#18181b] border border-zinc-800 rounded px-2 py-0.5 text-[11px] font-mono text-zinc-300 select-all">
        <button onclick="copyToClipboard('${escapeHtml(embedCode)}', 'Drive embed code copied!')" class="px-2 py-1 text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-orange-400 rounded border border-zinc-700 flex items-center gap-1 shrink-0">
          <i data-lucide="copy" class="w-3 h-3"></i>
          <span>Copy Embed</span>
        </button>
      </div>
    </div>
  `;
  lucide.createIcons({ root: tray });
}

function setupPlayerModal() {
  // Empty stub for backwards-compatibility with DOMContentLoaded
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

