# 📅 AI Calendar Sync (Googleカレンダー連携＆AI予約メール自動登録)

Googleカレンダーと連携し、特定カレンダー内の**レッスン枠・シフト枠の一覧抽出・集計管理**、および**予約メールをコピペするだけでAI（Google Gemini API 無料枠）が自動解析してGoogleカレンダーへ一括登録**できるモダンなWebカレンダーアプリケーションです。

---

## 🔒 セキュリティ & プライバシー設計（GitHub Pages公開にあたって）

本アプリは、公開リポジトリやGitHub Pages上でも安全にホスティング・利用できるように設計されています。

1. **サーバーレス・完全クライアントサイド動作 (SPA)**:
   - 中継サーバーや外部データベースは一切存在しません。すべての処理はユーザーのブラウザ内で完結します。
2. **認証情報・個人情報の安全な管理**:
   - Google Client ID や Gemini API キーは、ユーザー自身のブラウザ（`localStorage`）にのみ保存されます。リポジトリや外部サーバーへ送信されることは絶対にありません。
   - Google OAuth 2.0 アクセストークンは `sessionStorage` にのみ一時保管され、ブラウザタブを閉じた時点で自動破棄されます。
3. **安全な直接通信 (Zero Third-Party Telemetry)**:
   - 通信先はGoogle公式エンドポイント（`googleapis.com` / `generativelanguage.googleapis.com`）のみです。サードパーティへの追跡・アクセス解析・テレメトリは一切含まれていません。
4. **XSS & インジェクション対策**:
   - メール解析テキストやカレンダー詳細の表示箇所には厳格なHTMLエスケープ処理とプロトコル検証（`https:` チェック、`noopener noreferrer`）を実施しています。

---

## 🚀 主な機能

1. **Googleカレンダー連携 & OAuth 2.0 認証**
   - Googleアカウントで安全にログイン（Google Identity Services）
   - 連携するカレンダーをプルダウンから選択可能（プライベート用、レッスン用、教室用など）
   - 月・週・日・リスト表示に対応した洗練されたカレンダー（FullCalendar v6）

2. **レッスン枠＆シフト枠マネージャー**
   - イベントタイトルから「レッスン枠（カタカナ名）」「シフト枠」「空き枠」を自動分類
   - フィルター機能（すべて / レッスン枠のみ / 空き枠のみ / シフト枠のみ / 今週 / 今月 / 来月 / 検索）
   - 稼働状況サマリーカード（レッスン総枠数、空き枠数、シフト時間、合計稼働時間）
   - Excel対応 UTF-8 BOM付き **CSVエクスポート機能**

3. **予約メール AI自動解析＆カレンダー一括登録**
   - 予約フォーム通知メールや連絡メール、キャンセルメールをそのままコピペ
   - **複数メールの同時一括解析に対応**（複数のメールをまとめて貼り付けて一括抽出）
   - **Google Gemini API (`gemini-3.6-flash` / フォールバック搭載)** が日時（JST自動計算）、お名前、連絡先、コース名、メモを構造化抽出
   - 検出結果のカード表示、個別微調整、および **「⚡ 選択した新規予定を一括登録」**
   - **キャンセルメール自動処理**: 該当する日時のカレンダー予定を自動検知し、「削除」「[空き枠]に変更」「[キャンセル]と記録」を選択可能

---

## 🌐 GitHub Pages への公開手順

本リポジトリには GitHub Actions 用ワークフロー（`.github/workflows/deploy.yml`）が含まれており、GitHub にプッシュするだけで自動デプロイされます。

### 1. GitHubリポジトリを作成してプッシュ
```bash
git init
git add .
git commit -m "feat: initial commit of AI Calendar Sync"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### 2. GitHub Pages を有効化
1. GitHub リポジトリ画面の **「Settings」>「Pages」** を開きます。
2. **Build and deployment** の **Source** を **「GitHub Actions」** に設定します。
3. 数分待つと、Actions が自動実行され、公開URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）が発行されます。

---

## 🔑 初期設定手順（Google連携 ＆ AI利用）

アプリ画面右上の「⚙️ 設定」ボタンから設定します。

### 1. Google OAuth 2.0 クライアントID の取得（無料）
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、プロジェクトを作成（または既存プロジェクトを選択）。
2. **「APIとサービス」>「ライブラリ」** を開き、**「Google Calendar API」** を検索して **「有効にする」** をクリック。
3. **「APIとサービス」>「OAuth 同意画面」** を開き、User Type を「外部」にしてアプリ名・メールアドレスを入力して保存。
4. **「認証情報」>「認証情報を作成」>「OAuth クライアント ID」** を選択。
   - アプリケーションの種類: **ウェブ アプリケーション**
   - **承認済みのJavaScript生成元**:
     - ローカル開発用: `http://localhost:5173`
     - GitHub Pages公開用: `https://<あなたのユーザー名>.github.io` （末尾スラッシュなし）
5. 発行された **クライアントID**（`xxxx.apps.googleusercontent.com`）をコピーし、アプリの設定画面に貼り付けて保存。

### 2. Google Gemini API キーの取得（無料）
1. [Google AI Studio](https://aistudio.google.com/) にアクセス（Googleアカウントでログイン）。
2. **「Get API key」** をクリックし、**「Create API key」** でキーを発行（Gemini 3.6 Flash / 2.5 Flash / 1.5 Flash の無料枠レート制限内でご利用いただけます）。
3. 発行されたキーをアプリの設定画面に貼り付けて保存。

---

## 💻 ローカル開発・起動方法

```bash
# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev

# プロダクションビルド
npm run build
```
ブラウザで `http://localhost:5173` を開いて動作確認できます。

---

## 📁 ディレクトリ構成

```
calendar/
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Pages 自動デプロイワークフロー
├── .gitignore               # node_modules や機密ファイル除外設定
├── index.html               # メインUI（FullCalendar、スロット一覧、AI解析フォーム、ダイアログ）
├── package.json             # 依存関係定義
├── vite.config.js           # Vite設定（相対パス base: './' 指定）
├── README.md                # 本ドキュメント
└── src/
    ├── css/
    │   ├── style.css        # グローバルデザイン・テーマ・ダイアログ
    │   └── calendar.css     # カレンダー・スロットマネージャー・AI解析UI専用スタイル
    └── js/
        ├── app.js           # アプリケーション全体の統括・タブ制御
        ├── auth.js          # Google Identity Services (OAuth2) 認証モジュール
        ├── calendar-api.js  # Google Calendar API 通信 & デモデータ
        ├── calendar-ui.js   # FullCalendar 初期化・イベント描画
        ├── config.js        # localStorage設定管理
        ├── gemini.js        # Google Gemini API メール構造化解析
        ├── list-ui.js       # レッスン・シフト枠リスト＆集計カード制御
        ├── mail-parser-ui.js# メール解析・プレビュー・一括登録UI
        └── slot-filter.js   # スロット分類・時間集計・CSV出力
```
