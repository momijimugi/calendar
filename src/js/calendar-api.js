/**
 * Google Calendar API v3 Service
 */

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

/**
 * Fetch list of user's Google Calendars
 */
export async function fetchCalendarList(accessToken) {
  const res = await fetch(`${BASE_URL}/users/me/calendarList`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `カレンダー一覧の取得に失敗しました (Status ${res.status})`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Fetch events for a given calendar and time range
 */
export async function fetchEvents(calendarId, timeMin, timeMax, accessToken) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500'
  });

  if (timeMin) params.append('timeMin', timeMin);
  if (timeMax) params.append('timeMax', timeMax);

  const res = await fetch(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `予定の取得に失敗しました (Status ${res.status})`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Create a new event in the specified calendar
 */
export async function createCalendarEvent(calendarId, eventPayload, accessToken) {
  const res = await fetch(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventPayload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `カレンダーへの登録に失敗しました (Status ${res.status})`);
  }

  return await res.json();
}

/**
 * Delete an event in the specified calendar
 */
export async function deleteCalendarEvent(calendarId, eventId, accessToken) {
  const res = await fetch(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok && res.status !== 204) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `予定の削除に失敗しました (Status ${res.status})`);
  }

  return true;
}

/**
 * Patch / update an event in the specified calendar
 */
export async function updateCalendarEvent(calendarId, eventId, patchPayload, accessToken) {
  const res = await fetch(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patchPayload)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `予定の更新に失敗しました (Status ${res.status})`);
  }

  return await res.json();
}

/**
 * Generate rich Mock Data for Demo Mode
 */
export function getMockCalendars() {
  return [
    { id: 'primary', summary: 'メインカレンダー (プライベート)', primary: true, backgroundColor: '#4285F4' },
    { id: 'lesson_shift_cal', summary: 'レッスン＆シフト専用カレンダー', primary: false, backgroundColor: '#0F9D58' },
    { id: 'school_cal', summary: '教室全体スケジュール', primary: false, backgroundColor: '#DB4437' }
  ];
}

export function getMockEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Helper to format ISO string without timezone shifts
  const makeDate = (offsetDays, hour, minute = 0) => {
    const d = new Date(year, month, day + offsetDays, hour, minute, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'mock-1',
      summary: 'タナカ ケンイチ',
      description: '受講生: タナカ ケンイチ\n連絡先: tanaka@example.com / 090-1111-2222\nコース: アコースティックギター初級',
      start: { dateTime: makeDate(-2, 14, 0) },
      end: { dateTime: makeDate(-2, 15, 0) },
      location: '第1レッスン室',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-2',
      summary: 'lilla',
      description: 'シフト勤務（午前当番）',
      start: { dateTime: makeDate(-1, 9, 30) },
      end: { dateTime: makeDate(-1, 13, 30) },
      location: '本校フロント',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-3',
      summary: '[空き枠] 14:00〜15:00',
      description: '体験レッスンまたは通常レッスン枠（空き枠）',
      start: { dateTime: makeDate(0, 14, 0) },
      end: { dateTime: makeDate(0, 15, 0) },
      location: '第2レッスン室',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-4',
      summary: 'サトウ ミサキ',
      description: '受講生: サトウ ミサキ\n連絡先: misaki.sato@example.com\nコース: ボーカル個人レッスン',
      start: { dateTime: makeDate(0, 16, 0) },
      end: { dateTime: makeDate(0, 17, 0) },
      location: '第1レッスン室',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-5',
      summary: 'lilla',
      description: 'シフト勤務（午後・夜間）',
      start: { dateTime: makeDate(1, 13, 0) },
      end: { dateTime: makeDate(1, 20, 0) },
      location: 'フロント・全館',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-sasaki',
      summary: 'ササキ ヒナ',
      description: '受講生: ササキ ヒナ (佐々木 陽菜)\n連絡先: hina.sasaki@example.com / 090-8888-9999\nコース: アコースティックギター体験コース',
      start: { dateTime: makeDate(2, 15, 0) },
      end: { dateTime: makeDate(2, 16, 0) },
      location: '第2レッスン室',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-6',
      summary: '[空き枠] 10:30〜11:30',
      description: '午前空き枠',
      start: { dateTime: makeDate(2, 10, 30) },
      end: { dateTime: makeDate(2, 11, 30) },
      location: '第1レッスン室',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-7',
      summary: 'タカハシ リョウ',
      description: '受講生: タカハシ リョウ\nオンライン受講 (Zoom)',
      start: { dateTime: makeDate(3, 15, 0) },
      end: { dateTime: makeDate(3, 16, 0) },
      location: 'オンライン (Zoom)',
      htmlLink: 'https://calendar.google.com'
    },
    {
      id: 'mock-8',
      summary: 'ミーティング',
      description: '月次ミーティング',
      start: { dateTime: makeDate(4, 11, 0) },
      end: { dateTime: makeDate(4, 12, 30) },
      location: 'カンファレンスルーム',
      htmlLink: 'https://calendar.google.com'
    }
  ];
}
