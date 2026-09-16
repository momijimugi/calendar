/**
 * Slot Classification, Filtering, and Statistics Service
 */
import { getConfig } from './config.js';

/**
 * Classify a Google Calendar event into 'lesson' | 'shift' | 'other'
 * 
 * Rules:
 * 1. "lilla" のみの予定 = シフト枠 (Shift)
 * 2. カタカナの名前のみの予定 = レッスン枠 (Lesson)
 * 3. キーワード（設定値）や空き枠表記による補足判定
 */
export function classifyEvent(event) {
  const config = getConfig();
  const rawSummary = (event.summary || '').trim();
  const normalizedSummary = rawSummary.normalize('NFKC').trim();
  const lowerSummary = normalizedSummary.toLowerCase();

  const description = (event.description || '').normalize('NFKC').toLowerCase();
  const fullText = `${lowerSummary} ${description}`;

  // 1. Check Shift rule: "lilla" only (case-insensitive, e.g. "lilla", "Lilla", "LILLA")
  const isLillaOnly = lowerSummary === 'lilla';

  const shiftKeywords = (config.shiftKeywords || 'lilla,シフト,shift,勤務,当番,出勤')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);

  const isShift = isLillaOnly || shiftKeywords.some(kw => lowerSummary === kw || fullText.includes(kw));

  if (isShift) {
    return {
      type: 'shift',
      badgeLabel: 'シフト枠 (lilla)',
      badgeColor: 'amber',
      isOpenSlot: false,
      isLilla: isLillaOnly
    };
  }

  // 2. Check Lesson rule: "カタカナの名前のみ" (Katakana name only)
  // Matches pure Katakana with optional spaces (\s, fullwidth space), nakaguro (・), chōonpu (ー), and optional "様"
  // E.g.: "タナカ", "タナカ タロウ", "タナカタロウ", "ヤマダ", "サトウ ミサキ様"
  const katakanaNamePattern = /^[\u30A0-\u30FF\s・ー]+(?:様)?$/;
  const nonNameKatakanaWords = ['ミーティング', 'キャンセル', 'テスト', 'スタジオ', 'イベント', 'リハーサル'];
  
  const isKatakanaNameOnly = katakanaNamePattern.test(normalizedSummary) &&
                             /[\u30A0-\u30FF]/.test(normalizedSummary) &&
                             !nonNameKatakanaWords.includes(normalizedSummary);

  const lessonKeywords = (config.lessonKeywords || 'レッスン,lesson,授業,指導,体験')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);

  const isLessonByKeyword = lessonKeywords.some(kw => fullText.includes(kw));
  const isOpenSlot = /空き|未定|募集中|受付中|open|vacant/i.test(fullText);

  if (isKatakanaNameOnly || isLessonByKeyword || isOpenSlot) {
    return {
      type: 'lesson',
      badgeLabel: isOpenSlot ? 'レッスン空き枠' : 'レッスン枠',
      badgeColor: isOpenSlot ? 'teal' : 'indigo',
      isOpenSlot,
      isKatakanaName: isKatakanaNameOnly
    };
  }

  return {
    type: 'other',
    badgeLabel: '通常予定',
    badgeColor: 'slate',
    isOpenSlot: false
  };
}

/**
 * Filter list of events by category, date range, and search query
 */
export function filterEvents(events, { category = 'all', range = 'all', query = '' }) {
  const now = new Date();
  
  return events.filter(event => {
    const classification = classifyEvent(event);
    
    // 1. Category filter
    if (category === 'lesson' && classification.type !== 'lesson') return false;
    if (category === 'open' && (!classification.isOpenSlot || classification.type !== 'lesson')) return false;
    if (category === 'shift' && classification.type !== 'shift') return false;
    if (category === 'slots_only' && classification.type === 'other') return false;

    // 2. Date Range filter
    const startIso = event.start?.dateTime || event.start?.date;
    if (!startIso) return true;
    const eventDate = new Date(startIso);

    if (range === 'this_week') {
      const startOfWeek = new Date(now);
      const day = now.getDay() || 7; // Japanese Monday = 1
      startOfWeek.setDate(now.getDate() - day + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      if (eventDate < startOfWeek || eventDate > endOfWeek) return false;
    } else if (range === 'this_month') {
      if (eventDate.getFullYear() !== now.getFullYear() || eventDate.getMonth() !== now.getMonth()) {
        return false;
      }
    } else if (range === 'next_month') {
      const nextMonth = (now.getMonth() + 1) % 12;
      const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      if (eventDate.getFullYear() !== nextMonthYear || eventDate.getMonth() !== nextMonth) {
        return false;
      }
    }

    // 3. Search query
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      const matchText = `${event.summary || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Calculate summary metrics for events
 */
export function calculateSlotStats(events) {
  let lessonCount = 0;
  let lessonOpenCount = 0;
  let lessonBookedCount = 0;
  let lessonMinutes = 0;

  let shiftCount = 0;
  let shiftMinutes = 0;

  events.forEach(event => {
    const classification = classifyEvent(event);
    const startStr = event.start?.dateTime || event.start?.date;
    const endStr = event.end?.dateTime || event.end?.date;
    
    let durationMins = 60;
    if (startStr && endStr) {
      const diffMs = new Date(endStr).getTime() - new Date(startStr).getTime();
      if (diffMs > 0) durationMins = Math.round(diffMs / 60000);
    }

    if (classification.type === 'lesson') {
      lessonCount++;
      if (classification.isOpenSlot) {
        lessonOpenCount++;
      } else {
        lessonBookedCount++;
      }
      lessonMinutes += durationMins;
    } else if (classification.type === 'shift') {
      shiftCount++;
      shiftMinutes += durationMins;
    }
  });

  return {
    lessonCount,
    lessonOpenCount,
    lessonBookedCount,
    lessonHours: (lessonMinutes / 60).toFixed(1),
    shiftCount,
    shiftHours: (shiftMinutes / 60).toFixed(1),
    totalSlots: lessonCount + shiftCount,
    totalHours: ((lessonMinutes + shiftMinutes) / 60).toFixed(1)
  };
}

/**
 * Format datetime nicely in Japanese
 */
export function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const day = weekdays[d.getDay()];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  // If it's a date-only event
  if (isoString.length <= 10) {
    return `${d.getFullYear()}/${month}/${date} (${day}) 終日`;
  }

  return `${month}/${date} (${day}) ${hours}:${minutes}`;
}

/**
 * Format event time duration
 */
export function formatTimeRange(startIso, endIso) {
  if (!startIso) return '-';
  const start = new Date(startIso);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const m = start.getMonth() + 1;
  const d = start.getDate();
  const day = weekdays[start.getDay()];
  const sH = String(start.getHours()).padStart(2, '0');
  const sM = String(start.getMinutes()).padStart(2, '0');

  if (!endIso) {
    return `${m}/${d}(${day}) ${sH}:${sM}`;
  }

  const end = new Date(endIso);
  const eH = String(end.getHours()).padStart(2, '0');
  const eM = String(end.getMinutes()).padStart(2, '0');

  return `${m}/${d}(${day}) ${sH}:${sM} 〜 ${eH}:${eM}`;
}

/**
 * Export filtered slots to CSV
 */
export function exportSlotsToCsv(events) {
  const header = ['種別', 'ステータス', '開始日時', '終了日時', 'タイトル', '場所', '詳細'];
  const rows = events.map(event => {
    const classification = classifyEvent(event);
    const type = classification.type === 'lesson' ? 'レッスン' : classification.type === 'shift' ? 'シフト' : 'その他';
    const status = classification.isOpenSlot ? '空き枠' : '予約済/確定';
    const start = event.start?.dateTime || event.start?.date || '';
    const end = event.end?.dateTime || event.end?.date || '';
    const title = (event.summary || '').replace(/"/g, '""');
    const location = (event.location || '').replace(/"/g, '""');
    const desc = (event.description || '').replace(/"/g, '""').replace(/\n/g, ' ');

    return `"${type}","${status}","${start}","${end}","${title}","${location}","${desc}"`;
  });

  const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `レッスン・シフト枠一覧_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
