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
