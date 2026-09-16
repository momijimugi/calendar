/**
 * Google Identity Services (OAuth 2.0 Token Client)
 */
import { getConfig, validateGoogleClientId } from './config.js';

let tokenClient = null;
let currentAccessToken = null;
let tokenExpiresAt = 0;
let userProfile = null;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

/**
 * Initializes Google Identity Services Client
 */
export function initGoogleAuth() {
  const config = getConfig();
  tokenClient = null;

  if (!config.googleClientId || typeof window.google === 'undefined' || !window.google.accounts) {
    return false;
  }

  const validation = validateGoogleClientId(config.googleClientId);
  if (!validation.valid) {
    console.warn('Invalid Google Client ID format:', validation.error);
    return false;
  }

  try {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: validation.cleaned,
      scope: SCOPES,
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          currentAccessToken = tokenResponse.access_token;
          const expiresIn = Number(tokenResponse.expires_in || 3600);
          tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
          sessionStorage.setItem('google_access_token', currentAccessToken);
          sessionStorage.setItem('google_token_expiry', String(tokenExpiresAt));

          await fetchUserProfile(currentAccessToken);
          notifyAuthChange(true);
        } else if (tokenResponse && tokenResponse.error) {
          console.error('OAuth token error:', tokenResponse);
          notifyAuthChange(false, tokenResponse.error_description || tokenResponse.error);
        }
      },
      error_callback: (err) => {
        console.error('OAuth error callback:', err);
        let msg = err.message || '認証エラーが発生しました';
        if (err.type === 'popup_failed_to_open') {
          msg = 'ポップアップブロックが有効になっている可能性があります。ブラウザの設定でポップアップを許可してください。';
        }
        notifyAuthChange(false, msg);
      }
    });

    // Check existing stored token in session
    const savedToken = sessionStorage.getItem('google_access_token');
    const savedExpiry = Number(sessionStorage.getItem('google_token_expiry') || '0');
    if (savedToken && Date.now() < savedExpiry) {
      currentAccessToken = savedToken;
      tokenExpiresAt = savedExpiry;
      fetchUserProfile(currentAccessToken).then(() => {
        notifyAuthChange(true);
      });
    }

    return true;
  } catch (err) {
    console.error('Failed to initTokenClient:', err);
    return false;
  }
}

/**
 * Request Access Token via Google Popup
 */
export function requestLogin() {
  const config = getConfig();
  if (!config.googleClientId) {
    throw new Error('Google Client IDが未設定です。右上の設定画面からClient IDを入力してください。');
  }

  const validation = validateGoogleClientId(config.googleClientId);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Check origin warning
  if (window.location.hostname === '127.0.0.1') {
    throw new Error('現在「127.0.0.1」でアクセスされています。Google OAuthの承認元に合わせて「http://localhost:5173」でアクセスしてください。');
  }

  if (!tokenClient) {
    const initialized = initGoogleAuth();
    if (!initialized || !tokenClient) {
      throw new Error('Google認証ライブラリの初期化に失敗しました。ページを再読み込みするか、Client IDを確認してください。');
    }
  }

  // Prompt consent if no token or expired
  tokenClient.requestAccessToken({ prompt: currentAccessToken ? '' : 'select_account' });
}

/**
 * Log out
 */
export function logout() {
  if (currentAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(currentAccessToken, () => {
        console.log('Token revoked');
      });
    } catch (e) {
      console.warn('Revoke warning:', e);
    }
  }
  currentAccessToken = null;
  tokenExpiresAt = 0;
  userProfile = null;
  sessionStorage.removeItem('google_access_token');
  sessionStorage.removeItem('google_token_expiry');
  sessionStorage.removeItem('google_user_profile');
  notifyAuthChange(false);
}

/**
 * Get current valid access token or null
 */
export function getAccessToken() {
  if (currentAccessToken && Date.now() < tokenExpiresAt) {
    return currentAccessToken;
  }
  return null;
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export function getUserProfile() {
  if (!userProfile) {
    const cached = sessionStorage.getItem('google_user_profile');
    if (cached) {
      try {
        userProfile = JSON.parse(cached);
      } catch (e) {
        userProfile = null;
      }
    }
  }
  return userProfile;
}

async function fetchUserProfile(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      userProfile = await res.json();
      sessionStorage.setItem('google_user_profile', JSON.stringify(userProfile));
    }
  } catch (err) {
    console.warn('Could not fetch user profile info:', err);
  }
}

function notifyAuthChange(isLoggedIn, error = null) {
  window.dispatchEvent(new CustomEvent('authStateChanged', {
    detail: {
      isAuthenticated: isLoggedIn,
      user: userProfile,
      error
    }
  }));
}
