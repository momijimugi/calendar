/**
 * Main Application Orchestrator
 */
import { getConfig, saveConfig, isGoogleConfigured, validateGoogleClientId } from './config.js';
import { initGoogleAuth, requestLogin, logout, isAuthenticated, getAccessToken, getUserProfile } from './auth.js';
import { fetchCalendarList, fetchEvents } from './calendar-api.js';
import { initCalendar, updateCalendarEvents, refreshCalendarSize } from './calendar-ui.js';
import { initSlotsList, updateSlotsData } from './list-ui.js';
import { initMailParser, showToast } from './mail-parser-ui.js';
import { formatTimeRange } from './slot-filter.js';

let appState = {
  events: [],
  calendars: [],
  selectedCalendarId: getConfig().selectedCalendarId || 'primary',
  activeTab: 'tab-calendar'
};

document.addEventListener('DOMContentLoaded', () => {
  setupNavigationTabs();
  setupSettingsDialog();
  setupEventDetailDialog();
  setupAuthControls();

  // Initialize UI components
  initCalendar('calendar-root', {
    onEventClick: openEventDetailDialog,
    onDateSelect: (info) => {
      console.log('Date selected:', info);
    }
  });

  initSlotsList(document.getElementById('tab-slots'), {
    onEventClick: openEventDetailDialog
  });

  initMailParser({
    onEventCreated: (newEvent, shouldSwitchTab = false) => {
      appState.events.unshift(newEvent);
      refreshDataViews();
      if (shouldSwitchTab) switchTab('tab-calendar');
    },
    onEventDeleted: (deletedId, shouldSwitchTab = false) => {
      appState.events = appState.events.filter(e => e.id !== deletedId);
      refreshDataViews();
      if (shouldSwitchTab) switchTab('tab-calendar');
    },
    onEventUpdated: (updatedEvent, shouldSwitchTab = false) => {
      const idx = appState.events.findIndex(e => e.id === updatedEvent.id);
      if (idx !== -1) {
        appState.events[idx] = updatedEvent;
      }
      refreshDataViews();
      if (shouldSwitchTab) switchTab('tab-calendar');
    },
    getEvents: () => appState.events
  });

  // Setup refresh button
  const refreshBtn = document.getElementById('btn-refresh-data');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadCalendarData();
    });
  }

  // Check auth & initial load
  initGoogleAuth();
  updateAuthStatusUI();

  // Load initial events ONLY if authenticated; never display events or demo data when unauthenticated
  if (isAuthenticated()) {
    loadCalendarData();
  } else {
    clearAllEvents();
  }

  // Listen for config changes (only update UI badges, avoid re-fetching loop)
  window.addEventListener('configChanged', () => {
    updateAuthStatusUI();
  });

  // Listen for auth state changes
  window.addEventListener('authStateChanged', (e) => {
    updateAuthStatusUI();
    if (e.detail.isAuthenticated) {
      showToast('Googleアカウントにログインしました', 'success');
      loadCalendarData();
    } else {
      clearAllEvents();
      if (e.detail.error) {
        showToast(`認証エラー: ${e.detail.error}`, 'error');
      }
    }
  });
});

/**
 * Switch tabs between Calendar, Slots List, and AI Mail Parser
 */
function setupNavigationTabs() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      switchTab(targetId);
    });
  });
}

function switchTab(targetTabId) {
  appState.activeTab = targetTabId;

  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === targetTabId);
  });

  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === targetTabId);
  });

  if (targetTabId === 'tab-calendar') {
    // FullCalendar needs refresh on tab visibility change
    setTimeout(refreshCalendarSize, 50);
  }
}

/**
 * Handle Google Auth Button & Status Display
 */
function setupAuthControls() {
  const loginBtn = document.getElementById('btn-google-login');
  const logoutBtn = document.getElementById('btn-google-logout');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      try {
        const config = getConfig();
        if (!config.googleClientId) {
          openSettingsDialog();
          showToast('まずはGoogle Client IDを設定してください', 'info');
          return;
        }
        requestLogin();
      } catch (err) {
        console.error('Login request error:', err);
        showToast(err.message, 'error');
        openSettingsDialog();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      showToast('ログアウトしました', 'info');
      clearAllEvents();
    });
  }

  // Calendar dropdown change
  const calSelect = document.getElementById('calendar-selector');
  if (calSelect) {
    calSelect.addEventListener('change', (e) => {
      appState.selectedCalendarId = e.target.value;
      saveConfig({ selectedCalendarId: e.target.value });
      loadCalendarData();
    });
  }
}

function updateAuthStatusUI() {
  const isAuth = isAuthenticated();
  const loginBtn = document.getElementById('btn-google-login');
  const userProfileEl = document.getElementById('user-profile-badge');
  const userEmailEl = document.getElementById('user-email-text');
  const userAvatarEl = document.getElementById('user-avatar-img');

  if (isAuth) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (userProfileEl) userProfileEl.style.display = 'inline-flex';

    const profile = getUserProfile();
    if (profile && userEmailEl) {
      userEmailEl.textContent = profile.email || profile.name || '連携中';
      if (userAvatarEl && profile.picture) {
        userAvatarEl.src = profile.picture;
        userAvatarEl.style.display = 'block';
      }
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (userProfileEl) userProfileEl.style.display = 'none';
  }
}

let isLoadingCalendar = false;

/**
 * Load Google Calendar Data
 */
async function loadCalendarData() {
  if (isLoadingCalendar) {
    return;
  }
  isLoadingCalendar = true;

  const token = getAccessToken();
  if (!token || !isAuthenticated()) {
    clearAllEvents();
    isLoadingCalendar = false;
    return;
  }

  const refreshBtn = document.getElementById('btn-refresh-data');
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    // 1. Fetch Calendar List
    const calendars = await fetchCalendarList(token);
    appState.calendars = calendars;
    populateCalendarDropdown(calendars);

    // 2. Fetch Events
    const calId = appState.selectedCalendarId || config.selectedCalendarId || 'primary';
    
    // Default fetch range: 1 month past to 2 months future
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

    const events = await fetchEvents(calId, timeMin, timeMax, token);
    appState.events = events;

    refreshDataViews();
    showToast(`${events.length} 件の予定を同期しました`, 'success');

    // Remove warning banner if previously shown
    const existingBanner = document.getElementById('api-enable-notice-banner');
    if (existingBanner) existingBanner.remove();
  } catch (err) {
    console.error('Failed to load Google Calendar data:', err);
    if (err.message && err.message.includes('Google Calendar API has not been used')) {
      const match = err.message.match(/https:\/\/[^\s]+/);
      const url = match ? match[0] : 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com';
      showToast('⚠️ Google Calendar APIが無効です。有効化リンクを開いてください', 'error');
      showApiEnableNotice(url);
    } else {
      showToast(`カレンダーデータ取得エラー: ${err.message}`, 'error');
    }
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('loading');
    isLoadingCalendar = false;
  }
}

function showApiEnableNotice(enableUrl) {
  let banner = document.getElementById('api-enable-notice-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'api-enable-notice-banner';
    banner.style.cssText = `
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      padding: 1rem 1.25rem;
      border-radius: var(--radius-lg);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      box-shadow: var(--shadow-sm);
    `;
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
      mainContainer.prepend(banner);
    }
  }

  banner.innerHTML = `
    <div>
      <div style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem;">
        <span>🚨</span> Google Calendar API を有効化してください
      </div>
      <div style="font-size: 0.825rem; margin-top: 0.25rem; color: #7f1d1d;">
        Google Cloud プロジェクトで Google Calendar API がまだ有効化されていません。下のボタンから「有効にする」をクリックしてください。
      </div>
    </div>
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <a href="${enableUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-danger btn-sm" style="background: #dc2626; color: white;">
        Google Cloud で「有効にする」↗
      </a>
      <button id="btn-retry-after-enable" class="btn btn-secondary btn-sm">
        🔄 有効化後に再試行
      </button>
    </div>
  `;

  document.getElementById('btn-retry-after-enable')?.addEventListener('click', () => {
    loadCalendarData();
  });
}

/**
 * Clear All Events and Calendars (When unauthenticated)
 */
function clearAllEvents() {
  appState.calendars = [];
  appState.events = [];
  populateCalendarDropdown([]);
  refreshDataViews();
}

function refreshDataViews() {
  updateCalendarEvents(appState.events);
  updateSlotsData(appState.events);
}

function populateCalendarDropdown(calendars) {
  const calSelect = document.getElementById('calendar-selector');
  if (!calSelect) return;

  if (!calendars || calendars.length === 0) {
    calSelect.innerHTML = '<option value="">(未ログイン)</option>';
    calSelect.disabled = true;
    return;
  }

  calSelect.disabled = false;

  // Retrieve saved preference from localStorage
  const savedCalId = localStorage.getItem('cal_app_selected_calendar_id') || 'primary';
  const match = calendars.find(c => c.id === savedCalId);
  const currentSelection = match 
    ? match.id 
    : (calendars.find(c => c.primary)?.id || calendars[0]?.id || 'primary');

  appState.selectedCalendarId = currentSelection;
  if (savedCalId !== currentSelection) {
    localStorage.setItem('cal_app_selected_calendar_id', currentSelection);
  }

  calSelect.innerHTML = calendars.map(c => `
    <option value="${c.id}" ${c.id === currentSelection ? 'selected' : ''}>
      ${escapeHtml(c.summary)} ${c.primary ? '(主)' : ''}
    </option>
  `).join('');

  calSelect.value = currentSelection;
}

/**
 * Event Detail Dialog Handling
 */
function setupEventDetailDialog() {
  const dialog = document.getElementById('dialog-event-detail');
  const closeBtn = document.getElementById('btn-close-detail');

  if (closeBtn && dialog) {
    closeBtn.addEventListener('click', () => dialog.close());
  }

  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
}

function openEventDetailDialog(event) {
  const dialog = document.getElementById('dialog-event-detail');
  if (!dialog) return;

  const titleEl = document.getElementById('detail-event-title');
  const timeEl = document.getElementById('detail-event-time');
  const locationEl = document.getElementById('detail-event-location');
  const descEl = document.getElementById('detail-event-description');
  const linkBtn = document.getElementById('btn-detail-gcal-link');

  const startIso = event.start?.dateTime || event.start?.date;
  const endIso = event.end?.dateTime || event.end?.date;

  if (titleEl) titleEl.textContent = event.summary || '(無題)';
  if (timeEl) timeEl.textContent = formatTimeRange(startIso, endIso);
  if (locationEl) {
    locationEl.textContent = event.location ? `📍 ${event.location}` : '場所の指定なし';
  }
  if (descEl) {
    descEl.textContent = event.description || '詳細・メモなし';
  }
  if (linkBtn) {
    const rawLink = event.htmlLink || 'https://calendar.google.com';
    linkBtn.href = (rawLink.startsWith('https://') || rawLink.startsWith('http://')) ? rawLink : 'https://calendar.google.com';
    linkBtn.target = '_blank';
    linkBtn.rel = 'noopener noreferrer';
  }

  dialog.showModal();
}

/**
 * Settings Dialog Handling
 */
function setupSettingsDialog() {
  const dialog = document.getElementById('dialog-settings');
  const openBtn = document.getElementById('btn-open-settings');
  const closeBtn = document.getElementById('btn-close-settings');
  const saveBtn = document.getElementById('btn-save-settings');

  if (openBtn && dialog) {
    openBtn.addEventListener('click', openSettingsDialog);
  }

  if (closeBtn && dialog) {
    closeBtn.addEventListener('click', () => dialog.close());
  }

  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  const clientIdInput = document.getElementById('setting-client-id');
  const feedbackEl = document.getElementById('setting-client-id-feedback');

  if (clientIdInput && feedbackEl) {
    clientIdInput.addEventListener('input', () => {
      const val = clientIdInput.value.trim();
      if (!val) {
        feedbackEl.style.display = 'none';
        return;
      }
      const validation = validateGoogleClientId(val);
      feedbackEl.style.display = 'block';
      if (validation.valid) {
        feedbackEl.innerHTML = '<span style="color: #16a34a; font-weight: 500;">✅ 有効なクライアントID形式です</span>';
      } else {
        feedbackEl.innerHTML = `<span style="color: #dc2626; font-weight: 500;">⚠️ ${validation.error}</span>`;
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const clientId = document.getElementById('setting-client-id')?.value || '';
      const apiKey = document.getElementById('setting-gemini-key')?.value || '';
      const lessonKeywords = document.getElementById('setting-lesson-keywords')?.value || '';
      const shiftKeywords = document.getElementById('setting-shift-keywords')?.value || '';

      if (clientId) {
        const validation = validateGoogleClientId(clientId);
        if (!validation.valid) {
          showToast(validation.error, 'error');
          return;
        }
      }

      saveConfig({
        googleClientId: clientId,
        geminiApiKey: apiKey,
        lessonKeywords,
        shiftKeywords
      });

      initGoogleAuth();
      showToast('設定を保存しました', 'success');
      dialog.close();
    });
  }

  const copyOriginBtn = document.getElementById('btn-copy-origin');
  if (copyOriginBtn) {
    copyOriginBtn.addEventListener('click', () => {
      const origin = window.location.origin;
      navigator.clipboard.writeText(origin).then(() => {
        showToast(`オリジン「${origin}」をコピーしました`, 'success');
      }).catch(() => {
        showToast(`コピーに失敗しました: ${origin}`, 'info');
      });
    });
  }
}

function openSettingsDialog() {
  const dialog = document.getElementById('dialog-settings');
  if (!dialog) return;

  const originEl = document.getElementById('current-origin-display');
  if (originEl) {
    originEl.textContent = window.location.origin;
  }

  const config = getConfig();
  setFormVal('setting-client-id', config.googleClientId);
  setFormVal('setting-gemini-key', config.geminiApiKey);
  setFormVal('setting-lesson-keywords', config.lessonKeywords);
  setFormVal('setting-shift-keywords', config.shiftKeywords);

  dialog.showModal();
}

function setFormVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
