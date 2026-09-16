/**
 * Lesson & Shift Slots Manager UI
 */
import {
  classifyEvent,
  filterEvents,
  calculateSlotStats,
  formatTimeRange,
  exportSlotsToCsv
} from './slot-filter.js';

let allEvents = [];
let currentFilter = {
  category: 'all',
  range: 'all',
  query: ''
};
let onEventSelectCallback = null;

export function initSlotsList(containerEl, { onEventClick }) {
  onEventSelectCallback = onEventClick;
  setupFilterEventListeners();
}

export function updateSlotsData(events) {
  allEvents = events || [];
  renderMetrics();
  renderTable();
}

function setupFilterEventListeners() {
  // Category filter pills
  const pillContainer = document.getElementById('slot-category-pills');
  if (pillContainer) {
    pillContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;

      pillContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      currentFilter.category = btn.dataset.category || 'all';
      renderTable();
    });
  }

  // Date range selector
  const rangeSelect = document.getElementById('slot-date-range-select');
  if (rangeSelect) {
    rangeSelect.addEventListener('change', (e) => {
      currentFilter.range = e.target.value;
      renderTable();
      renderMetrics();
    });
  }

  // Search input
  const searchInput = document.getElementById('slot-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter.query = e.target.value;
      renderTable();
    });
  }

  // CSV Export button
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const filtered = filterEvents(allEvents, currentFilter);
      if (filtered.length === 0) {
        alert('出力対象の枠がありません。');
        return;
      }
      exportSlotsToCsv(filtered);
    });
  }
}

/**
 * Render Metric cards
 */
function renderMetrics() {
  // Filter events by current date range for the metrics
  const rangeFiltered = filterEvents(allEvents, { category: 'all', range: currentFilter.range, query: '' });
  const stats = calculateSlotStats(rangeFiltered);

  const lessonCountEl = document.getElementById('metric-lesson-count');
  const lessonHoursEl = document.getElementById('metric-lesson-hours');
  const shiftCountEl = document.getElementById('metric-shift-count');
  const shiftHoursEl = document.getElementById('metric-shift-hours');
  const openCountEl = document.getElementById('metric-open-count');

  if (lessonCountEl) lessonCountEl.textContent = `${stats.lessonCount} 枠`;
  if (lessonHoursEl) lessonHoursEl.textContent = `${stats.lessonHours} 時間`;
  if (shiftCountEl) shiftCountEl.textContent = `${stats.shiftCount} 枠 (${stats.shiftHours} 時間)`;
  if (shiftHoursEl) shiftHoursEl.textContent = `${stats.totalHours} 時間`;
  if (openCountEl) openCountEl.textContent = `${stats.lessonOpenCount} 枠`;
}

/**
 * Render Table rows
 */
function renderTable() {
  const tableBody = document.getElementById('slots-table-body');
  const emptyState = document.getElementById('slots-table-empty');
  if (!tableBody) return;

  const filtered = filterEvents(allEvents, currentFilter);

  // Update tab badge count
  const badgeEl = document.getElementById('tab-badge-slots');
  if (badgeEl) {
    badgeEl.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  tableBody.innerHTML = filtered.map(event => {
    const classification = classifyEvent(event);
    const startIso = event.start?.dateTime || event.start?.date;
    const endIso = event.end?.dateTime || event.end?.date;
    const timeFormatted = formatTimeRange(startIso, endIso);

    let typeBadgeClass = 'badge-other';
    let typeLabel = 'その他';
    if (classification.type === 'lesson') {
      typeBadgeClass = classification.isOpenSlot ? 'badge-open' : 'badge-lesson';
      typeLabel = classification.badgeLabel;
    } else if (classification.type === 'shift') {
      typeBadgeClass = 'badge-shift';
      typeLabel = 'シフト枠';
    }

    const statusBadge = classification.isOpenSlot
      ? `<span class="badge badge-status-vacant">● 空き枠</span>`
      : classification.type === 'lesson'
        ? `<span class="badge badge-status-booked">✓ 予約済</span>`
        : `<span class="badge">確定</span>`;

    return `
      <tr data-event-id="${event.id}" style="cursor: pointer;">
        <td>
          <span class="badge ${typeBadgeClass}">${typeLabel}</span>
        </td>
        <td>
          <strong>${statusBadge}</strong>
        </td>
        <td style="white-space: nowrap; font-weight: 500;">
          ${timeFormatted}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(event.summary || '(無題)')}</div>
          ${event.location ? `<div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 2px;">📍 ${escapeHtml(event.location)}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm btn-view-slot" data-event-id="${event.id}">
            詳細
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Row click handlers
  tableBody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      const eventId = tr.dataset.eventId;
      const ev = allEvents.find(item => item.id === eventId);
      if (ev && onEventSelectCallback) {
        onEventSelectCallback(ev);
      }
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
