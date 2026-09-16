/**
 * AI Reservation & Cancellation Mail Parser UI (Multi-email Batch Support)
 */
import { parseReservationMail } from './gemini.js';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from './calendar-api.js';
import { getAccessToken, isAuthenticated } from './auth.js';
import { getConfig } from './config.js';
import { formatTimeRange } from './slot-filter.js';

// Sample presets for quick testing
const SAMPLES = {
  batchSample: `件名: 【WEB予約】体験レッスンのご予約が入りました
送信者: reservation-system@example.com

WEBサイトより以下の通り体験レッスンのご予約がありました。

【予約内容】
・お名前: 佐々木 陽菜 様
・フリガナ: ササキ ヒナ
・メールアドレス: hina.sasaki@example.com
・電話番号: 090-8888-9999
・ご希望コース: アコースティックギター体験コース（60分）
・日時: 2026年9月22日(火) 15:00〜16:00
・場所: 渋谷校 第2レッスン室
・ご要望・備考:
ギターは持っていないのでレンタル希望です。まったくの初心者ですがよろしくお願いします。

--------------------------------------------------

件名: 【予約キャンセル】9月23日 レッスンキャンセルのお願い
送信者: sato.music@example.com

いつもお世話になっております。
受講生の 佐藤 健一（サトウ ケンイチ）です。

大変申し訳ありませんが、急な発熱のため、以下の予約をキャンセルさせていただけますでしょうか。

【キャンセル希望の予約】
・受講生名: 佐藤 健一（サトウ ケンイチ）
・日時: 2026年9月23日(水) 14:00〜15:00
・コース: ボーカル個人レッスン
・場所: 渋谷校 第1レッスン室

直前の連絡でご迷惑をおかけして大変申し訳ありません。何卒よろしくお願いいたします。

--------------------------------------------------

件名: 9月第4週シフト希望提出（山田）
送信者: yamada.staff@example.com

お疲れ様です。スタッフの山田です。
来週のシフト希望を提出いたします。

【希望日程】
・2026年9月25日(金) 13:00〜18:00
・業務内容: 受付業務・スタジオ機材メンテナンス

よろしくお願いいたします。`,

  trialLesson: `件名: 【WEB予約】体験レッスンのご予約が入りました
送信者: reservation-system@example.com

WEBサイトより以下の通り体験レッスンのご予約がありました。

【予約内容】
・お名前: 佐々木 陽菜 様
・フリガナ: ササキ ヒナ
・メールアドレス: hina.sasaki@example.com
・電話番号: 090-8888-9999
・ご希望コース: アコースティックギター体験コース（60分）
・日時: 2026年9月22日(火) 15:00〜16:00
・場所: 渋谷校 第2レッスン室
・ご要望・備考:
ギターは持っていないのでレンタル希望です。まったくの初心者ですがよろしくお願いします。`,

  cancellation: `件名: 【予約キャンセル】9月22日 レッスンキャンセルのお願い
送信者: hina.sasaki@example.com

いつもお世話になっております。
受講生の 佐々木 陽菜（ササキ ヒナ）です。

大変申し訳ありませんが、急な発熱のため、以下の予約をキャンセルさせていただけますでしょうか。

【キャンセル希望の予約】
・受講生名: 佐々木 陽菜（ササキ ヒナ）
・日時: 2026年9月22日(火) 15:00〜16:00
・コース: アコースティックギター体験コース
・場所: 渋谷校 第2レッスン室

直前の連絡でご迷惑をおかけして大変申し訳ありません。何卒よろしくお願いいたします。`,

  reschedule: `件名: レッスン日時の変更のお願い（佐藤）
送信者: sato.music@example.com

いつもお世話になっております。
ボーカルコース受講中の佐藤です。

次回のレッスンですが、仕事の都合により日時を変更していただくことは可能でしょうか。
希望日時は以下の通りです。

【希望日時】
2026年9月24日(木) 18:30〜19:30
※第1スタジオまたはオンラインでの受講を希望します。

直前の連絡で申し訳ありませんが、ご確認のほどよろしくお願いいたします。`,

  shiftRequest: `件名: 9月第4週シフト希望提出（山田）
送信者: yamada.staff@example.com

お疲れ様です。スタッフの山田です。
来週のシフト希望を提出いたします。

【希望日程】
・2026年9月25日(金) 13:00〜18:00
・業務内容: 受付業務・スタジオ機材メンテナンス

よろしくお願いいたします。`
};

let parsedEventsList = [];
let onEventCreatedCallback = null;
let onEventDeletedCallback = null;
let onEventUpdatedCallback = null;
let getEventsCallback = null;

export function initMailParser({ onEventCreated, onEventDeleted, onEventUpdated, getEvents }) {
  onEventCreatedCallback = onEventCreated;
  onEventDeletedCallback = onEventDeleted;
  onEventUpdatedCallback = onEventUpdated;
  getEventsCallback = getEvents;

  setupPresetButtons();
  setupParserForm();
}

function setupPresetButtons() {
  const textarea = document.getElementById('email-input-text');
  if (!textarea) return;

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      if (SAMPLES[presetKey]) {
        textarea.value = SAMPLES[presetKey];
        textarea.focus();
      }
    });
  });
}

function setupParserForm() {
  const parseBtn = document.getElementById('btn-parse-email');
  const textarea = document.getElementById('email-input-text');
  const parseStatus = document.getElementById('parse-status-indicator');

  if (parseBtn) {
    parseBtn.addEventListener('click', async () => {
      const text = textarea?.value?.trim();
      if (!text) {
        showToast('メール本文を貼り付けてください', 'error');
        textarea?.focus();
        return;
      }

      try {
        parseBtn.disabled = true;
        parseBtn.innerHTML = `<span class="spinner"></span> 解析中...`;
        if (parseStatus) parseStatus.textContent = 'Gemini AI がメール内容を解析中...';

        const results = await parseReservationMail(text);
        const eventsArray = Array.isArray(results) ? results : [results];

        if (eventsArray.length === 0) {
          showToast('予定情報を抽出できませんでした。メール本文をご確認ください。', 'warning');
          return;
        }

        // Match existing calendar events for cancellations
        const currentCalEvents = getEventsCallback ? getEventsCallback() : [];
        parsedEventsList = eventsArray.map((ev, index) => {
          const matched = ev.isCancellation ? findMatchingCalendarEvent(ev, currentCalEvents) : null;
          return {
            id: index,
            data: { ...ev },
            matchedEvent: matched,
            status: 'pending', // 'pending' | 'registered' | 'deleted' | 'opened' | 'cancelled'
            selected: !ev.isCancellation,
            isEditing: eventsArray.length === 1 && !ev.isCancellation // auto expand edit if only 1 item
          };
        });

        renderPreviewContainer();

        const cancelCount = parsedEventsList.filter(item => item.data.isCancellation).length;
        const createCount = parsedEventsList.length - cancelCount;

        if (eventsArray.length > 1) {
          showToast(`複数メール解析完了！ ${eventsArray.length}件の予定を検出しました（新規: ${createCount}件, キャンセル: ${cancelCount}件）`, 'success');
        } else if (cancelCount > 0) {
          showToast('予約キャンセルメールを検知しました', 'warning');
        } else {
          showToast('AI解析が完了しました！内容を確認してください', 'success');
        }
      } catch (err) {
        console.error('Mail parse failed:', err);
        showToast(`解析エラー: ${err.message}`, 'error');
      } finally {
        parseBtn.disabled = false;
        parseBtn.innerHTML = `✨ AIで解析する`;
        if (parseStatus) parseStatus.textContent = '';
      }
    });
  }
}

/**
 * Render the whole preview container containing the summary, batch actions, and event cards
 */
function renderPreviewContainer() {
  const container = document.getElementById('ai-preview-container');
  const emptyState = document.getElementById('ai-preview-empty');
  const countBadge = document.getElementById('ai-preview-count-badge');

  if (!container) return;

  if (parsedEventsList.length === 0) {
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    if (countBadge) countBadge.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  if (countBadge) {
    countBadge.style.display = 'inline-flex';
    countBadge.textContent = `${parsedEventsList.length}件検出`;
  }

  const cancelCount = parsedEventsList.filter(item => item.data.isCancellation).length;
  const createItems = parsedEventsList.filter(item => !item.data.isCancellation);
  const pendingCreateCount = createItems.filter(item => item.status !== 'registered').length;
  const selectedCreateCount = createItems.filter(item => item.status !== 'registered' && item.selected).length;

  let html = `
    <div class="ai-preview-meta-bar">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span class="ai-badge">Google Gemini 構造化解析</span>
        <div class="ai-summary-pill">
          検出: <strong>${parsedEventsList.length}件</strong>
          (新規登録: ${createItems.length}件 / キャンセル: ${cancelCount}件)
        </div>
      </div>
      <button type="button" id="btn-goto-calendar" class="btn btn-secondary btn-xs" style="display: inline-flex; align-items: center; gap: 0.3rem;">
        📅 カレンダー画面を見る
      </button>
    </div>
  `;

  // Bulk action bar if there are multiple items or pending create events
  if (createItems.length > 0) {
    html += `
      <div class="ai-batch-bar">
        <label class="batch-select-all">
          <input type="checkbox" id="ai-batch-select-all" ${selectedCreateCount === pendingCreateCount && pendingCreateCount > 0 ? 'checked' : ''} ${pendingCreateCount === 0 ? 'disabled' : ''}>
          <span>新規予定を全選択 (${selectedCreateCount}/${pendingCreateCount})</span>
        </label>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" id="btn-batch-register" class="btn btn-primary btn-sm" ${selectedCreateCount === 0 ? 'disabled' : ''}>
            ⚡ 選択した新規予定を一括登録 (${selectedCreateCount}件)
          </button>
          <button type="button" id="btn-preview-clear" class="btn btn-secondary btn-sm" title="プレビューをクリア">
            クリア
          </button>
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 0.75rem;">
        <button type="button" id="btn-preview-clear" class="btn btn-secondary btn-sm">クリア</button>
      </div>
    `;
  }

  // Cards List
  html += `<div class="ai-cards-list" id="ai-cards-list">`;
  parsedEventsList.forEach(item => {
    html += renderEventCard(item);
  });
  html += `</div>`;

  container.innerHTML = html;

  // Bind dynamic event listeners
  bindPreviewEvents();
}

/**
 * Render a single event card
 */
function renderEventCard(item) {
  const { id, data, matchedEvent, status, selected, isEditing } = item;
  const isCancel = data.isCancellation;
  const isProcessed = status !== 'pending';

  let cardTypeClass = 'card-lesson';
  let badgeClass = 'badge-lesson';
  let badgeLabel = '🎓 レッスン枠';

  if (isCancel) {
    cardTypeClass = 'card-cancellation';
    badgeClass = 'badge-danger';
    badgeLabel = '🚨 予約キャンセル';
  } else if (data.eventType === 'shift') {
    cardTypeClass = 'card-shift';
    badgeClass = 'badge-shift';
    badgeLabel = '⏱️ シフト枠';
  }

  if (isProcessed) {
    cardTypeClass += ' card-processed';
  }

  const timeDisplay = formatTimeRange(data.startDateTime, data.endDateTime);

  return `
    <div class="ai-event-card ${cardTypeClass}" id="ai-card-${id}">
      <!-- Card Header -->
      <div class="ai-card-header">
        <div class="ai-card-header-left">
          ${!isCancel ? `
            <input type="checkbox" class="ai-event-checkbox" data-id="${id}" ${selected ? 'checked' : ''} ${status === 'registered' ? 'disabled' : ''}>
          ` : ''}
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <span class="ai-card-title">${escapeHtml(data.summary)}</span>
        </div>
        <div class="ai-card-header-right">
          ${renderStatusBadge(status)}
        </div>
      </div>

      <!-- Time & Location -->
      <div class="ai-card-datetime">
        <span>📅 ${escapeHtml(timeDisplay)}</span>
        ${data.location ? `<span> | 📍 ${escapeHtml(data.location)}</span>` : ''}
      </div>

      <!-- Main Body: Cancel vs Booking -->
      ${isCancel ? `
        <!-- Cancellation Details -->
        <div class="ai-card-cancel-box">
          <div class="cancel-reason-text">
            キャンセル理由: ${escapeHtml(data.cancelReason || '体調不良または都合によるキャンセル')}
          </div>

          <div class="matched-event-box">
            ${matchedEvent ? `
              <span class="matched-tag">カレンダー上の該当予定:</span>
              <strong>📅 ${escapeHtml(matchedEvent.summary)}</strong>
              <span class="matched-time">${escapeHtml(formatTimeRange(matchedEvent.start?.dateTime || matchedEvent.start?.date, matchedEvent.end?.dateTime || matchedEvent.end?.date))}</span>
            ` : `
              <div class="matched-not-found">
                ⚠️ カレンダー上に該当する日時の既存予定が見つかりませんでした。
              </div>
            `}
          </div>

          ${status === 'pending' ? `
            <div style="font-size: 0.775rem; font-weight: 700; color: #991b1b; margin-bottom: 0.4rem;">処理を選択してください:</div>
            <div class="cancel-actions-group">
              <button type="button" class="btn btn-danger btn-xs btn-action-delete" data-id="${id}">
                🗑️ この予定を削除
              </button>
              <button type="button" class="btn btn-secondary btn-xs btn-action-to-open" data-id="${id}" style="color: #0f766e; border-color: #0d9488; background: #f0fdfa;">
                ✨ 「[空き枠]」に変更
              </button>
              <button type="button" class="btn btn-secondary btn-xs btn-action-mark" data-id="${id}">
                🏷️ 「[キャンセル]」と記録
              </button>
            </div>
          ` : `
            <div style="font-weight: 700; color: #047857; font-size: 0.85rem; margin-top: 0.25rem;">
              ✓ キャンセル処理が完了しました
            </div>
          `}
        </div>
      ` : `
        <!-- Booking Info Grid -->
        <div class="ai-card-details-grid">
          <div><strong>予約者:</strong> ${escapeHtml(data.customerName || '未記入')}</div>
          <div><strong>コース:</strong> ${escapeHtml(data.lessonType || '-')}</div>
          ${data.customerEmail ? `<div><strong>メール:</strong> ${escapeHtml(data.customerEmail)}</div>` : ''}
          ${data.customerPhone ? `<div><strong>電話:</strong> ${escapeHtml(data.customerPhone)}</div>` : ''}
        </div>

        ${data.notes ? `
          <div class="ai-card-notes"><strong>備考:</strong> ${escapeHtml(data.notes)}</div>
        ` : ''}

        <!-- Inline Edit Form -->
        <div class="ai-card-edit-form" id="ai-edit-form-${id}" style="display: ${isEditing ? 'block' : 'none'};">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.75rem; font-weight: 700;">予定タイトル（レッスン枠: カタカナ姓名 / シフト枠: シフト名）</label>
            <input type="text" class="form-input edit-field-title" data-id="${id}" value="${escapeHtml(data.summary)}">
          </div>
          <div class="form-row" style="margin-bottom: 0.5rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">開始日時</label>
              <input type="datetime-local" class="form-input edit-field-start" data-id="${id}" value="${toDatetimeLocalValue(data.startDateTime)}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">終了日時</label>
              <input type="datetime-local" class="form-input edit-field-end" data-id="${id}" value="${toDatetimeLocalValue(data.endDateTime)}">
            </div>
          </div>
          <div class="form-row" style="margin-bottom: 0.5rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">予約者名</label>
              <input type="text" class="form-input edit-field-customer" data-id="${id}" value="${escapeHtml(data.customerName)}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">コース・内容</label>
              <input type="text" class="form-input edit-field-course" data-id="${id}" value="${escapeHtml(data.lessonType)}">
            </div>
          </div>
          <div class="form-row" style="margin-bottom: 0.5rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">メール</label>
              <input type="email" class="form-input edit-field-email" data-id="${id}" value="${escapeHtml(data.customerEmail)}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">電話番号</label>
              <input type="tel" class="form-input edit-field-phone" data-id="${id}" value="${escapeHtml(data.customerPhone)}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.75rem;">場所・スタジオ</label>
            <input type="text" class="form-input edit-field-location" data-id="${id}" value="${escapeHtml(data.location)}">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem;">備考メモ</label>
            <textarea class="form-textarea edit-field-notes" data-id="${id}" rows="2">${escapeHtml(data.notes || '')}</textarea>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="ai-card-action-bar">
          <button type="button" class="btn btn-secondary btn-xs btn-toggle-edit" data-id="${id}">
            ${isEditing ? '✕ 編集を閉じる' : '✏️ 詳細を編集'}
          </button>
          <div>
            ${status === 'registered' ? `
              <span class="registered-check">✅ カレンダー登録済</span>
            ` : `
              <button type="button" class="btn btn-primary btn-sm btn-action-register" data-id="${id}">
                📅 この予定を登録
              </button>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}

function renderStatusBadge(status) {
  switch (status) {
    case 'registered':
      return `<span class="badge badge-status-success">✅ 登録完了</span>`;
    case 'deleted':
      return `<span class="badge badge-status-danger">🗑️ 削除完了</span>`;
    case 'opened':
      return `<span class="badge badge-status-success">✨ 空き枠に変更済</span>`;
    case 'cancelled':
      return `<span class="badge badge-status-danger">🏷️ キャンセル記録済</span>`;
    case 'pending':
    default:
      return `<span class="badge badge-status-pending">未処理</span>`;
  }
}

/**
 * Bind interactive events for batch registration, checkboxes, inline edits, and cancellations
 */
function bindPreviewEvents() {
  // Batch Select All
  const selectAll = document.getElementById('ai-batch-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      parsedEventsList.forEach(item => {
        if (!item.data.isCancellation && item.status !== 'registered') {
          item.selected = isChecked;
        }
      });
      renderPreviewContainer();
    });
  }

  // Individual item checkboxes
  document.querySelectorAll('.ai-event-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) {
        item.selected = e.target.checked;
        renderPreviewContainer();
      }
    });
  });

  // Batch Register Button
  const batchRegisterBtn = document.getElementById('btn-batch-register');
  if (batchRegisterBtn) {
    batchRegisterBtn.addEventListener('click', async () => {
      await handleBatchRegister();
    });
  }

  // Clear Button
  const clearBtn = document.getElementById('btn-preview-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      resetParserUI();
    });
  }

  // Go to Calendar Tab Button
  const gotoCalBtn = document.getElementById('btn-goto-calendar');
  if (gotoCalBtn) {
    gotoCalBtn.addEventListener('click', () => {
      const tabBtn = document.querySelector('[data-tab="tab-calendar"]');
      if (tabBtn) tabBtn.click();
    });
  }

  // Single Item Register Buttons
  document.querySelectorAll('.btn-action-register').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      await handleRegisterSingle(id, btn);
    });
  });

  // Toggle Edit Form Buttons
  document.querySelectorAll('.btn-toggle-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) {
        item.isEditing = !item.isEditing;
        renderPreviewContainer();
      }
    });
  });

  // Edit Field Change Listeners
  bindEditFieldListeners();

  // Cancellation Actions
  document.querySelectorAll('.btn-action-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      await handleDeleteCancellation(id);
    });
  });

  document.querySelectorAll('.btn-action-to-open').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      await handleToOpenCancellation(id);
    });
  });

  document.querySelectorAll('.btn-action-mark').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      await handleMarkCancellation(id);
    });
  });
}

function bindEditFieldListeners() {
  document.querySelectorAll('.edit-field-title').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.summary = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-start').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item && e.target.value) {
        item.data.startDateTime = new Date(e.target.value).toISOString();
      }
    });
  });

  document.querySelectorAll('.edit-field-end').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item && e.target.value) {
        item.data.endDateTime = new Date(e.target.value).toISOString();
      }
    });
  });

  document.querySelectorAll('.edit-field-customer').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.customerName = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-course').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.lessonType = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-email').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.customerEmail = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-phone').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.customerPhone = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-location').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.location = e.target.value.trim();
    });
  });

  document.querySelectorAll('.edit-field-notes').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const item = parsedEventsList.find(it => it.id === id);
      if (item) item.data.notes = e.target.value;
    });
  });
}

/**
 * Register a single event
 */
async function handleRegisterSingle(id, btnElement) {
  const item = parsedEventsList.find(it => it.id === id);
  if (!item) return;

  const data = item.data;
  if (!data.summary || !data.startDateTime || !data.endDateTime) {
    showToast('タイトルと日時は必須項目です', 'error');
    return;
  }

  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerHTML = `<span class="spinner"></span> 登録中...`;
  }

  const config = getConfig();
  const token = getAccessToken();
  const isAuth = isAuthenticated();

  if (!isAuth || !token) {
    showToast('カレンダーに登録するにはGoogleアカウントへのログインが必要です', 'warning');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerHTML = `📅 この予定を登録`;
    }
    return;
  }

  const descriptionParts = [
    `【AI自動登録情報】`,
    data.customerName ? `予約者名: ${data.customerName}` : '',
    data.customerEmail ? `メール: ${data.customerEmail}` : '',
    data.customerPhone ? `電話番号: ${data.customerPhone}` : '',
    data.lessonType ? `コース: ${data.lessonType}` : '',
    data.notes ? `\n【備考・詳細】\n${data.notes}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    summary: data.summary,
    location: data.location || '',
    description: descriptionParts,
    start: { dateTime: data.startDateTime },
    end: { dateTime: data.endDateTime }
  };

  try {
    const calendarId = config.selectedCalendarId || 'primary';
    const createdEvent = await createCalendarEvent(calendarId, payload, token);

    if (onEventCreatedCallback) onEventCreatedCallback(createdEvent);
    item.status = 'registered';
    item.selected = false;
    showToast(`予定「${data.summary}」をカレンダーに登録しました！`, 'success');
    renderPreviewContainer();
  } catch (err) {
    console.error('Failed to create event:', err);
    showToast(`カレンダー登録失敗: ${err.message}`, 'error');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerHTML = `📅 この予定を登録`;
    }
  }
}

/**
 * Register multiple selected events in sequence
 */
async function handleBatchRegister() {
  const selectedItems = parsedEventsList.filter(it => !it.data.isCancellation && it.selected && it.status !== 'registered');
  if (selectedItems.length === 0) {
    showToast('登録する新規予定が選択されていません', 'warning');
    return;
  }

  const batchBtn = document.getElementById('btn-batch-register');
  if (batchBtn) {
    batchBtn.disabled = true;
    batchBtn.innerHTML = `<span class="spinner"></span> 一括登録中 (0/${selectedItems.length})...`;
  }

  const config = getConfig();
  const token = getAccessToken();
  const isAuth = isAuthenticated();

  if (!isAuth || !token) {
    showToast('カレンダーに登録するにはGoogleアカウントへのログインが必要です', 'warning');
    if (batchBtn) {
      batchBtn.disabled = false;
      batchBtn.innerHTML = `⚡ 選択した新規予定を一括登録`;
    }
    return;
  }

  const calendarId = config.selectedCalendarId || 'primary';

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedItems.length; i++) {
    const item = selectedItems[i];
    const data = item.data;

    if (batchBtn) {
      batchBtn.innerHTML = `<span class="spinner"></span> 一括登録中 (${i + 1}/${selectedItems.length})...`;
    }

    const descriptionParts = [
      `【AI自動登録情報】`,
      data.customerName ? `予約者名: ${data.customerName}` : '',
      data.customerEmail ? `メール: ${data.customerEmail}` : '',
      data.customerPhone ? `電話番号: ${data.customerPhone}` : '',
      data.lessonType ? `コース: ${data.lessonType}` : '',
      data.notes ? `\n【備考・詳細】\n${data.notes}` : ''
    ].filter(Boolean).join('\n');

    const payload = {
      summary: data.summary,
      location: data.location || '',
      description: descriptionParts,
      start: { dateTime: data.startDateTime },
      end: { dateTime: data.endDateTime }
    };

    try {
      const createdEvent = await createCalendarEvent(calendarId, payload, token);
      if (onEventCreatedCallback) onEventCreatedCallback(createdEvent);
      item.status = 'registered';
      item.selected = false;
      successCount++;
    } catch (err) {
      console.error(`Batch register failed for ${data.summary}:`, err);
      failCount++;
    }
  }

  renderPreviewContainer();

  if (failCount === 0) {
    showToast(`${successCount}件の予定を一括でカレンダーに登録しました！`, 'success');
  } else {
    showToast(`${successCount}件の登録に成功し、${failCount}件が失敗しました。`, 'warning');
  }
}

/**
 * Delete event for cancellation
 */
async function handleDeleteCancellation(id) {
  const item = parsedEventsList.find(it => it.id === id);
  if (!item || !item.matchedEvent) {
    showToast('対象の既存予定がカレンダー上に見つかりません', 'error');
    return;
  }

  if (!confirm(`カレンダーから予定「${item.matchedEvent.summary}」を完全に削除しますか？`)) {
    return;
  }

  const config = getConfig();
  const token = getAccessToken();
  const isAuth = isAuthenticated();

  if (!isAuth || !token) {
    showToast('カレンダーの予定を削除するにはGoogleアカウントへのログインが必要です', 'warning');
    return;
  }

  try {
    const calendarId = config.selectedCalendarId || 'primary';
    await deleteCalendarEvent(calendarId, item.matchedEvent.id, token);

    if (onEventDeletedCallback) onEventDeletedCallback(item.matchedEvent.id);
    item.status = 'deleted';
    showToast(`予定「${item.matchedEvent.summary}」を削除しました`, 'success');
    renderPreviewContainer();
  } catch (err) {
    console.error('Delete failed:', err);
    showToast(`削除失敗: ${err.message}`, 'error');
  }
}

/**
 * Change event to [空き枠]
 */
async function handleToOpenCancellation(id) {
  const item = parsedEventsList.find(it => it.id === id);
  if (!item || !item.matchedEvent) {
    showToast('対象の既存予定がカレンダー上に見つかりません', 'error');
    return;
  }

  const mEvent = item.matchedEvent;
  const startIso = mEvent.start?.dateTime || mEvent.start?.date;
  const endIso = mEvent.end?.dateTime || mEvent.end?.date;
  const timeStr = formatTimeRange(startIso, endIso).split(' ')[1] || '';
  const openTitle = timeStr ? `[空き枠] ${timeStr}` : '[空き枠] 予約受付中';

  if (!confirm(`予定を「${openTitle}」に変更して再募集枠にしますか？`)) {
    return;
  }

  const config = getConfig();
  const token = getAccessToken();
  const isAuth = isAuthenticated();

  if (!isAuth || !token) {
    showToast('カレンダーの予定を更新するにはGoogleアカウントへのログインが必要です', 'warning');
    return;
  }

  const patchPayload = {
    summary: openTitle,
    description: `【キャンセル再募集枠】\n元予約者: ${mEvent.summary}\n${mEvent.description || ''}`
  };

  try {
    const calendarId = config.selectedCalendarId || 'primary';
    const updated = await updateCalendarEvent(calendarId, mEvent.id, patchPayload, token);

    if (onEventUpdatedCallback) onEventUpdatedCallback(updated);
    item.status = 'opened';
    showToast(`予定を「${openTitle}」に変更しました`, 'success');
    renderPreviewContainer();
  } catch (err) {
    console.error('Update failed:', err);
    showToast(`更新失敗: ${err.message}`, 'error');
  }
}

/**
 * Mark event title as [キャンセル]
 */
async function handleMarkCancellation(id) {
  const item = parsedEventsList.find(it => it.id === id);
  if (!item || !item.matchedEvent) {
    showToast('対象の既存予定がカレンダー上に見つかりません', 'error');
    return;
  }

  const mEvent = item.matchedEvent;
  const cleanOldTitle = mEvent.summary.replace(/^\[キャンセル\]\s*/, '');
  const cancelTitle = `[キャンセル] ${cleanOldTitle}`;

  if (!confirm(`予定タイトルを「${cancelTitle}」に変更しますか？`)) {
    return;
  }

  const config = getConfig();
  const token = getAccessToken();
  const isAuth = isAuthenticated();

  if (!isAuth || !token) {
    showToast('カレンダーの予定を更新するにはGoogleアカウントへのログインが必要です', 'warning');
    return;
  }

  const patchPayload = {
    summary: cancelTitle,
    description: `【キャンセル済】\n理由: ${item.data?.cancelReason || '都合によるキャンセル'}\n${mEvent.description || ''}`
  };

  try {
    const calendarId = config.selectedCalendarId || 'primary';
    const updated = await updateCalendarEvent(calendarId, mEvent.id, patchPayload, token);

    if (onEventUpdatedCallback) onEventUpdatedCallback(updated);
    item.status = 'cancelled';
    showToast(`予定を「${cancelTitle}」に変更しました`, 'success');
    renderPreviewContainer();
  } catch (err) {
    console.error('Update failed:', err);
    showToast(`更新失敗: ${err.message}`, 'error');
  }
}

/**
 * Search calendar events for matching reservation to cancel
 */
function findMatchingCalendarEvent(parsedData, events) {
  if (!parsedData || !events || events.length === 0) return null;

  const targetDateStr = parsedData.startDateTime ? parsedData.startDateTime.slice(0, 10) : '';
  const targetHour = parsedData.startDateTime ? new Date(parsedData.startDateTime).getHours() : -1;

  const nameKey = (parsedData.summary || parsedData.customerName || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();

  // 1. Match same day + name match
  if (targetDateStr && nameKey) {
    const match = events.find(ev => {
      const evStart = ev.start?.dateTime || ev.start?.date;
      if (!evStart || !evStart.startsWith(targetDateStr)) return false;

      const evSummary = (ev.summary || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
      const evDesc = (ev.description || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
      return evSummary.includes(nameKey) || nameKey.includes(evSummary) || evDesc.includes(nameKey);
    });
    if (match) return match;
  }

  // 2. Match same day + same hour
  if (targetDateStr && targetHour >= 0) {
    const match = events.find(ev => {
      const evStart = ev.start?.dateTime || ev.start?.date;
      if (!evStart || !evStart.startsWith(targetDateStr)) return false;
      const d = new Date(evStart);
      return Math.abs(d.getHours() - targetHour) <= 1;
    });
    if (match) return match;
  }

  // 3. Fallback: match by name anywhere
  if (nameKey) {
    const match = events.find(ev => {
      const evSummary = (ev.summary || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
      return evSummary.includes(nameKey) || nameKey.includes(evSummary);
    });
    if (match) return match;
  }

  return null;
}

function resetParserUI() {
  const textarea = document.getElementById('email-input-text');
  if (textarea) textarea.value = '';

  const countBadge = document.getElementById('ai-preview-count-badge');
  if (countBadge) countBadge.style.display = 'none';

  parsedEventsList = [];
  renderPreviewContainer();
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D}T${h}:${m}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}
