/**
 * Configuration & Local Storage Management
 */

const STORAGE_KEYS = {
  GOOGLE_CLIENT_ID: 'cal_app_google_client_id',
  GEMINI_API_KEY: 'cal_app_gemini_api_key',
  SELECTED_CALENDAR_ID: 'cal_app_selected_calendar_id',
  LESSON_KEYWORDS: 'cal_app_lesson_keywords',
  SHIFT_KEYWORDS: 'cal_app_shift_keywords',
  DEMO_MODE: 'cal_app_demo_mode',
};

const DEFAULT_CONFIG = {
  googleClientId: '',
  geminiApiKey: '',
  selectedCalendarId: 'primary',
  lessonKeywords: 'レッスン, Lesson, 授業, 指導, 受講, 体験, 枠',
  shiftKeywords: 'シフト, Shift, 勤務, 当番, 出勤, 待機',
  demoMode: false,
};

export function cleanCredential(str) {
  if (!str) return '';
  return str.trim().replace(/^["']|["']$/g, '').trim();
}

export function validateGoogleClientId(clientId) {
  const cleaned = cleanCredential(clientId);
  if (!cleaned) {
    return { valid: false, error: 'クライアントIDが入力されていません。' };
  }
  if (cleaned.startsWith('AIzaSy')) {
    return {
      valid: false,
      error: '【注意】入力された文字列はGemini等のAPIキーです。「OAuth 2.0 クライアント ID」を入力してください。'
    };
  }
  if (cleaned.startsWith('GOCSPX-')) {
    return {
      valid: false,
      error: '【注意】入力された文字列はクライアントシークレットです。「クライアント ID」を入力してください。'
    };
  }
  if (!cleaned.includes('.apps.googleusercontent.com')) {
    return {
      valid: false,
      error: 'クライアントIDの末尾は「.apps.googleusercontent.com」である必要があります。コピー漏れがないか確認してください。'
    };
  }
  return { valid: true, cleaned };
}

export function getConfig() {
  return {
    googleClientId: cleanCredential(localStorage.getItem(STORAGE_KEYS.GOOGLE_CLIENT_ID) || DEFAULT_CONFIG.googleClientId),
    geminiApiKey: cleanCredential(localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || DEFAULT_CONFIG.geminiApiKey),
    selectedCalendarId: localStorage.getItem(STORAGE_KEYS.SELECTED_CALENDAR_ID) || DEFAULT_CONFIG.selectedCalendarId,
    lessonKeywords: localStorage.getItem(STORAGE_KEYS.LESSON_KEYWORDS) || DEFAULT_CONFIG.lessonKeywords,
    shiftKeywords: localStorage.getItem(STORAGE_KEYS.SHIFT_KEYWORDS) || DEFAULT_CONFIG.shiftKeywords,
    demoMode: localStorage.getItem(STORAGE_KEYS.DEMO_MODE) === 'true',
  };
}

export function saveConfig(updates) {
  if (updates.googleClientId !== undefined) {
    const cleaned = cleanCredential(updates.googleClientId);
    localStorage.setItem(STORAGE_KEYS.GOOGLE_CLIENT_ID, cleaned);
  }
  if (updates.geminiApiKey !== undefined) {
    const cleaned = cleanCredential(updates.geminiApiKey);
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, cleaned);
  }
  if (updates.selectedCalendarId !== undefined) {
    localStorage.setItem(STORAGE_KEYS.SELECTED_CALENDAR_ID, updates.selectedCalendarId);
  }
  if (updates.lessonKeywords !== undefined) {
    localStorage.setItem(STORAGE_KEYS.LESSON_KEYWORDS, updates.lessonKeywords);
  }
  if (updates.shiftKeywords !== undefined) {
    localStorage.setItem(STORAGE_KEYS.SHIFT_KEYWORDS, updates.shiftKeywords);
  }
  if (updates.demoMode !== undefined) {
    localStorage.setItem(STORAGE_KEYS.DEMO_MODE, String(updates.demoMode));
  }

  window.dispatchEvent(new CustomEvent('configChanged', { detail: getConfig() }));
}

export function isGoogleConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.googleClientId && cfg.googleClientId.includes('.apps.googleusercontent.com'));
}

export function isGeminiConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.geminiApiKey && cfg.geminiApiKey.length > 5);
}
