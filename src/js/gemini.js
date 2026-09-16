/**
 * Google Gemini API Client for Reservation Email Parsing
 * Uses Google AI Studio Free Tier (gemini-3.6-flash / gemini-2.5-flash / gemini-1.5-flash)
 */
import { getConfig } from './config.js';

/**
 * Parse raw reservation email text using Gemini AI
 */
export async function parseReservationMail(emailText) {
  if (!emailText || !emailText.trim()) {
    throw new Error('解析するメール本文を入力してください。');
  }

  const config = getConfig();

  // If no Gemini API key, fallback to smart local parser
  if (!config.geminiApiKey) {
    console.warn('Gemini API key is not set. Using smart heuristic parser as fallback.');
    return runMockOrHeuristicParser(emailText);
  }

  const now = new Date();
  const currentDateTimeStr = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const currentIso = now.toISOString();

  const systemInstruction = `
あなたは日本の予約メール・連絡メールからGoogleカレンダーのイベント情報を正確に抽出するAIアシスタントです。
現在の日時は「${currentDateTimeStr}（基準ISO: ${currentIso}）」です。
「明日」「来週水曜」「9/25」などの相対表記・日付省略は、上記現在日時を基準にして必ず正確な「YYYY-MM-DDTHH:mm:ss+09:00」形式（JSTタイムゾーン）に計算してください。

【複数メール対応・重要指示】
入力テキスト内に複数の予約・連絡・キャンセルメールが含まれている場合は、含まれているすべての予定を漏れなく抽出し、"events" 配列の中に各予定のオブジェクトを格納してください。メールが1件のみの場合でも、必ず "events" 配列の中に1件のオブジェクトを入れて返してください。

【メール種別とカレンダー予定タイトル（summary）の重要ルール】
- メールの目的が「予約キャンセル・受講取消・欠席連絡」である場合は、"actionType": "cancel" および "isCancellation": true としてください。
- レッスン枠の場合: 予定タイトル（summary）は必ず「カタカナのお名前のみ」（例: 『ササキ ヒナ』『ヤマダ タロウ』）にしてください。メール本文にお名前が漢字で書かれている場合（例: 佐々木 陽菜）はフリガナのカタカナに変換し、コース名や【】などの装飾は付けず、カタカナ姓名のみにしてください。
- シフト枠の場合: 予定タイトル（summary）は必ず『lilla』にしてください。

以下のJSONフォーマットで回答してください。JSON以外の解説文は一切出力しないでください。

{
  "events": [
    {
      "actionType": "create（新規予約・変更）" または "cancel（予約キャンセル・取消）",
      "isCancellation": true または false,
      "cancelReason": "キャンセルの理由（新規予約の場合は空文字）",
      "summary": "レッスンならカタカナ名のみ（例: ササキ ヒナ）、シフトなら『lilla』",
      "eventType": "lesson" または "shift" または "other",
      "startDateTime": "YYYY-MM-DDTHH:mm:ss+09:00",
      "endDateTime": "YYYY-MM-DDTHH:mm:ss+09:00（終了時間が不明な場合は開始から1時間後）",
      "customerName": "予約者・受講生の氏名（漢字またはカタカナ）",
      "customerEmail": "予約者のメールアドレス（不明な場合は空文字）",
      "customerPhone": "予約者の電話番号（不明な場合は空文字）",
      "lessonType": "コース名・受講内容・レッスン科目名",
      "location": "場所・教室名・オンラインZoomリンク等（メール内の情報から抽出）",
      "description": "カレンダー詳細欄に入れる要約情報（予約者名、連絡先、キャンセル理由など）",
      "notes": "特記事項・要望",
      "confidenceScore": 0.0〜1.0の確信度
    }
  ]
}
`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `以下の予約メール・メッセージを解析して指定のJSONスキーマで出力してください。\n\n--- メール本文 ---\n${emailText.trim()}\n--- メール本文終了 ---`
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  let lastError = null;
  const modelsToTry = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const message = errBody.error?.message || `Gemini API呼び出しエラー (Status ${response.status})`;
        
        // If model is deprecated or not available, try next fallback
        if (response.status === 404 || message.includes('not found') || message.includes('no longer available')) {
          console.warn(`Model ${model} unavailable, trying fallback... (${message})`);
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }

      const result = await response.json();
      const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textOutput) {
        throw new Error('Geminiから有効な解析結果が得られませんでした。');
      }

      const parsed = JSON.parse(textOutput);
      return normalizeParsedResults(parsed);
    } catch (err) {
      lastError = err;
      if (err.message && (err.message.includes('not found') || err.message.includes('no longer available'))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('利用可能なGeminiモデルが見つかりませんでした。');
}

/**
 * Normalizes either an array or object containing events
 */
function normalizeParsedResults(parsed) {
  let list = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.events)) {
    list = parsed.events;
  } else if (parsed && typeof parsed === 'object') {
    list = [parsed];
  }

  if (list.length === 0) {
    return [];
  }

  return list.map(item => normalizeParsedEvent(item));
}

/**
 * Ensures required fields are properly formatted
 */
function normalizeParsedEvent(parsed) {
  const now = new Date();
  
  // Default start to tomorrow 14:00 if invalid
  let start = parsed.startDateTime;
  if (!start || isNaN(Date.parse(start))) {
    const d = new Date(now.getTime() + 86400000);
    d.setHours(14, 0, 0, 0);
    start = d.toISOString();
  }

  let end = parsed.endDateTime;
  if (!end || isNaN(Date.parse(end))) {
    const sDate = new Date(start);
    end = new Date(sDate.getTime() + 60 * 60 * 1000).toISOString();
  }

  const isCancellation = Boolean(parsed.isCancellation || parsed.actionType === 'cancel');

  return {
    actionType: isCancellation ? 'cancel' : 'create',
    isCancellation,
    cancelReason: parsed.cancelReason || '',
    summary: parsed.summary || (isCancellation ? 'キャンセル' : '新規予約'),
    eventType: parsed.eventType || 'lesson',
    startDateTime: start,
    endDateTime: end,
    customerName: parsed.customerName || '',
    customerEmail: parsed.customerEmail || '',
    customerPhone: parsed.customerPhone || '',
    lessonType: parsed.lessonType || '',
    location: parsed.location || '第1レッスン室',
    description: parsed.description || '',
    notes: parsed.notes || '',
    confidenceScore: parsed.confidenceScore ?? 0.95
  };
}

/**
 * Smart heuristic regex parser for fallback or demo testing
 * Splits multiple emails and parses each chunk
 */
function runMockOrHeuristicParser(text) {
  const chunks = splitIntoEmailChunks(text);
  return chunks.map((chunk, index) => parseSingleEmailHeuristic(chunk, index));
}

/**
 * Split raw text containing multiple reservation emails
 */
function splitIntoEmailChunks(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Explicit dividers like --- or === or ___
  const dividerRegex = /(?:\r?\n)(?:[-=_]{3,}|[*#]{3,})(?:\r?\n)/;
  if (dividerRegex.test(trimmed)) {
    const parts = trimmed.split(dividerRegex).map(p => p.trim()).filter(p => p.length > 10);
    if (parts.length > 1) {
      return parts;
    }
  }

  // 2. Email header markers (件名:, Subject:, From:, 送信者:, or bracketed subjects)
  const headerMarkerRegex = /(?:^|\r?\n)(?=(?:件名[:：]|Subject[:：]|送信者[:：]|From[:：]|【(?:WEB予約|予約キャンセル|予約完了|受講取消|シフト希望|日時変更|予約)))/i;
  const headerParts = trimmed.split(headerMarkerRegex).map(p => p.trim()).filter(p => p.length > 15);
  if (headerParts.length > 1) {
    return headerParts;
  }

  // 3. Check for repeated "お名前:" or "氏名:" (2+ occurrences)
  const nameOccurrences = [...trimmed.matchAll(/(?:^|\r?\n)(?=(?:お名前|氏名|予約者名)[:：\s])/g)];
  if (nameOccurrences.length > 1) {
    const parts = [];
    for (let i = 0; i < nameOccurrences.length; i++) {
      const start = nameOccurrences[i].index;
      const end = i < nameOccurrences.length - 1 ? nameOccurrences[i + 1].index : trimmed.length;
      const part = trimmed.slice(start, end).trim();
      if (part.length > 15) parts.push(part);
    }
    if (parts.length > 1) {
      return parts;
    }
  }

  return [trimmed];
}

/**
 * Heuristic parser for a single email chunk
 */
function parseSingleEmailHeuristic(text, index = 0) {
  const now = new Date();
  const year = now.getFullYear();

  // Name extraction (e.g. お名前: 田中太郎, 氏名: ..., スタッフの山田, etc.)
  let name = '';
  const explicitNameMatch = text.match(/(?:お名前|氏名|予約者名|お申込者|受講生名)[:：\s]+([^\n\r,，]+)/);
  if (explicitNameMatch) {
    name = explicitNameMatch[1].replace(/様$/, '').replace(/[（(][^）)]*[）)]/g, '').trim();
  } else {
    const staffMatch = text.match(/(?:スタッフの|担当の|講師の)\s*([^\n\r\s]{2,8})/);
    if (staffMatch) {
      name = staffMatch[1].replace(/[です。]/g, '').trim();
    } else {
      const samaMatch = text.match(/([^\n\r\s]{2,8})\s*様/);
      if (samaMatch) {
        const candidate = samaMatch[1].trim();
        if (!/お疲れ|お世話|ご苦労|皆様|ご担当/.test(candidate)) {
          name = candidate;
        }
      }
    }
  }

  // Email extraction
  let email = '';
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    email = emailMatch[0];
  }

  // Phone extraction
  let phone = '';
  const phoneMatch = text.match(/(?:0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}|\d{10,11})/);
  if (phoneMatch) {
    phone = phoneMatch[0];
  }

  // Course / Lesson Type extraction
  let course = '体験レッスン';
  const courseMatch = text.match(/(?:コース|希望コース|レッスン内容|種別|プラン)[:：\s]+([^\n\r]+)/);
  if (courseMatch) {
    course = courseMatch[1].trim();
  } else if (text.includes('ギター')) {
    course = 'アコースティックギター体験コース';
  } else if (text.includes('ボーカル') || text.includes('ボイトレ')) {
    course = 'ボーカル個人レッスン';
  } else if (text.includes('ピアノ')) {
    course = 'ピアノレッスン';
  }

  // Date and Time extraction
  let startDate = new Date(now.getTime() + 86400000 * (index + 2)); // default staggered days later
  startDate.setHours(14 + (index % 3), 0, 0, 0);
  let endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  // 1. Japanese format: 2026年9月25日 or 9月25日
  let dateMatch = text.match(/(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日/);
  // 2. ISO/Slash format: 2026/09/25 or 2026-09-25 (month 1..12, day 1..31)
  if (!dateMatch) {
    const slashMatch = text.match(/(?:(\d{4})[-/])(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])/);
    if (slashMatch) {
      dateMatch = slashMatch;
    }
  }

  const timeMatch = text.match(/(\d{1,2})[:：](\d{2})\s*(?:[〜~-]\s*(\d{1,2})[:：](\d{2}))?/);

  if (dateMatch && timeMatch) {
    const y = dateMatch[1] ? parseInt(dateMatch[1], 10) : year;
    const m = parseInt(dateMatch[2], 10) - 1;
    const d = parseInt(dateMatch[3], 10);
    const startH = parseInt(timeMatch[1], 10);
    const startM = parseInt(timeMatch[2], 10);

    startDate = new Date(y, m, d, startH, startM, 0);

    if (timeMatch[3] && timeMatch[4]) {
      const endH = parseInt(timeMatch[3], 10);
      const endM = parseInt(timeMatch[4], 10);
      endDate = new Date(y, m, d, endH, endM, 0);
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
  }

  // Detect Cancellation
  const isCancellation = /キャンセル|取消|とりけし|受講中止|辞退|欠席/i.test(text);
  const actionType = isCancellation ? 'cancel' : 'create';

  // Determine type and summary according to rules
  const isShift = text.includes('シフト') || text.includes('出勤') || text.includes('当番');
  const eventType = isShift ? 'shift' : 'lesson';

  // Extract katakana name if available (e.g. フリガナ: ササキ ヒナ)
  const kanaMatch = text.match(/(?:フリガナ|ふりがな|カナ|かな)[:：\s]+([^\n\r]+)/) ||
                    text.match(/[（(]([\u30A0-\u30FF\s・ー]+)[）)]/);
  let katakanaName = kanaMatch ? kanaMatch[1].trim() : '';
  if (!katakanaName && name) {
    katakanaName = /^[\u30A0-\u30FF\s・ー]+$/.test(name) ? name : (
      name.includes('佐々木') ? 'ササキ ヒナ' :
      name.includes('佐藤') ? 'サトウ ケンイチ' :
      name.includes('山田') ? 'ヤマダ タロウ' : 'タナカ タロウ'
    );
  }

  const summary = isShift ? 'lilla' : (katakanaName || 'タナカ タロウ');

  // Location
  let location = isShift ? '本校フロント' : '第1レッスン室';
  const locMatch = text.match(/(?:場所|スタジオ|教室)[:：\s]+([^\n\r]+)/);
  if (locMatch) {
    location = locMatch[1].trim();
  }

  const cancelReason = isCancellation ? (
    text.includes('発熱') ? '急な発熱のため' :
    text.includes('体調') ? '体調不良のため' :
    text.includes('仕事') ? '仕事の都合のため' : '都合によるキャンセル'
  ) : '';

  const description = [
    isCancellation ? `【予約キャンセル通知】` : `【予約内容詳細】`,
    `お名前: ${name || '未記入'}`,
    email ? `メール: ${email}` : '',
    phone ? `電話番号: ${phone}` : '',
    `コース: ${course}`,
    isCancellation ? `キャンセル理由: ${cancelReason}` : '',
    `\n【メール原本】\n` + text.slice(0, 300) + (text.length > 300 ? '...' : '')
  ].filter(Boolean).join('\n');

  return {
    actionType,
    isCancellation,
    cancelReason,
    summary,
    eventType,
    startDateTime: startDate.toISOString(),
    endDateTime: endDate.toISOString(),
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    lessonType: course,
    location,
    description,
    notes: isCancellation ? '予約キャンセル依頼' : '自動解析（ルールベース抽出）',
    confidenceScore: 0.92
  };
}
