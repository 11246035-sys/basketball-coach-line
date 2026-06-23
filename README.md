# 🏀 籃球家教 LINE 管理系統

LINE 官方帳號籃球家教管理系統，支援線上預約、課程紀錄查閱、教練後台管理與自動推播通知。

---

## ⚡ 回來後要做的事（快速清單）

> 按照以下順序完成，大約 30–45 分鐘可以全部跑通。

### Step 1 — Supabase 建立資料庫

1. 前往 [supabase.com](https://supabase.com) → 建立新專案
2. 進入 **SQL Editor** → 貼入 `sql/schema.sql` 全部內容 → **Run**
3. 進入 **Storage** → 確認 `course-photos` bucket 已建立且設為 Public
4. 進入 **Settings > API** → 複製下列三個值備用：
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2 — LINE Developers 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/) → 建立 **Messaging API** channel
2. 複製備用：
   - **Channel Secret** → `LINE_CHANNEL_SECRET`
   - **Channel Access Token**（長期）→ `LINE_CHANNEL_ACCESS_TOKEN`
3. 在 **LIFF** 頁籤建立三個 LIFF App（網址先填假的，部署後再改）：

   | 名稱 | Size | Endpoint URL（暫填） |
   |------|------|---------------------|
   | 預約課程 | Full | `https://example.com/liff/booking.html` |
   | 課程紀錄 | Full | `https://example.com/liff/records.html` |
   | 上課須知 | Tall | `https://example.com/liff/notice.html` |

4. 複製三個 LIFF ID 備用：
   - `LINE_LIFF_ID_BOOKING`
   - `LINE_LIFF_ID_RECORDS`
   - `LINE_LIFF_ID_NOTICE`

### Step 3 — Railway 部署

1. 前往 [railway.app](https://railway.app) → **New Project > Deploy from GitHub repo** → 選此 repo
2. 進入 **Variables** 頁面，填入以下所有環境變數：

   ```
   LINE_CHANNEL_ACCESS_TOKEN=
   LINE_CHANNEL_SECRET=
   LINE_LIFF_ID_BOOKING=
   LINE_LIFF_ID_RECORDS=
   LINE_LIFF_ID_NOTICE=
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ADMIN_PASSWORD=（自訂後台密碼）
   SESSION_SECRET=（執行 openssl rand -base64 32 取得）
   BASE_URL=（部署後 Railway 給的網址，例如 https://xxx.railway.app）
   ```

3. 等部署完成 → 複製 Railway 網址 → 填入 `BASE_URL`
4. 確認 `https://你的網址/health` 回傳 `{"status":"ok"}`

### Step 4 — 更新 LIFF Endpoint URL

1. 回到 LINE Developers Console → LIFF 頁籤
2. 將三個 LIFF App 的 Endpoint URL 改為 Railway 真實網址：
   - 預約課程：`https://你的網址/liff/booking.html`
   - 課程紀錄：`https://你的網址/liff/records.html`
   - 上課須知：`https://你的網址/liff/notice.html`

### Step 5 — 設定 LINE Webhook

1. LINE Developers Console → Messaging API → **Webhook URL** 填入：
   `https://你的網址/webhook`
2. 點 **Verify** → 應出現 ✅ 成功
3. 開啟 **Use webhook**
4. 關閉「Auto-reply messages」和「Greeting messages」

### Step 6 — 上傳 Rich Menu

1. 準備 **2500 × 843 px** PNG 圖片（三格：左預約、中須知、右紀錄）
2. 存為 `richmenu/richmenu-image.png`
3. 執行：
   ```bash
   cp .env.example .env
   # 編輯 .env 填入所有值
   ./setup.sh
   ```

### Step 7 — 驗證一切正常

- [ ] LINE 掃 QR 加好友 → 收到歡迎訊息
- [ ] 底部 Rich Menu 正常顯示
- [ ] 點「預約課程」→ LIFF 頁面開啟
- [ ] 填表送出 → 收到 LINE 確認訊息
- [ ] 開後台 `https://你的網址/admin/index.html` → 登入成功
- [ ] 後台確認預約 → 家長收到 LINE 通知
- [ ] 後台上傳課程紀錄 → 家長收到 LINE 通知

---

## 功能特色

- 📅 **LIFF 預約表單**：家長在 LINE 內直接填寫預約
- 📸 **LIFF 課程紀錄**：家長查看照片與文字紀錄
- 📋 **LIFF 上課須知**：靜態資訊頁面
- 🖥️ **教練後台**：管理預約、上傳紀錄、學生清單
- 🔔 **自動 LINE 通知**：預約確認、課程紀錄上傳即時推播

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端 | Node.js + Express |
| 資料庫 | Supabase (PostgreSQL) |
| 圖片儲存 | Supabase Storage |
| LINE 整合 | @line/bot-sdk + LIFF |
| 部署 | Railway |

---

## 部署步驟

### 一、Supabase 設定

1. 前往 [supabase.com](https://supabase.com) 建立新專案

2. 進入 **SQL Editor**，貼入 `sql/schema.sql` 全部內容並執行

3. 進入 **Storage**，確認已建立 `course-photos` bucket（schema.sql 已包含建立指令）
   - 若未自動建立，手動建立：名稱 `course-photos`，設為 **Public**

4. 前往 **Settings > API**，記錄以下資訊：
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 二、LINE Developers 設定

#### 2-1 建立 Messaging API Channel

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立或選擇 Provider
3. 建立 **Messaging API** channel
4. 記錄：
   - `Channel Secret` → `LINE_CHANNEL_SECRET`
   - `Channel Access Token`（長期 Token）→ `LINE_CHANNEL_ACCESS_TOKEN`

#### 2-2 建立 LIFF Apps

1. 在同一個 Channel 進入 **LIFF** 頁籤
2. 建立三個 LIFF App：

   | 名稱 | Endpoint URL | Size | 備註 |
   |------|-------------|------|------|
   | 預約課程 | `https://你的網址/liff/booking.html` | Full | 需要 profile 權限 |
   | 課程紀錄 | `https://你的網址/liff/records.html` | Full | 需要 profile 權限 |
   | 上課須知 | `https://你的網址/liff/notice.html` | Tall | 不需要特定權限 |

3. 記錄各 LIFF App 的 LIFF ID

### 三、Railway 部署

1. 前往 [railway.app](https://railway.app) 並登入

2. 點選 **New Project > Deploy from GitHub repo**，選擇此 repository

3. 進入專案 **Variables** 頁面，新增以下環境變數：

   ```
   LINE_CHANNEL_ACCESS_TOKEN=你的Token
   LINE_CHANNEL_SECRET=你的Secret
   LINE_LIFF_ID_BOOKING=LIFF預約頁ID
   LINE_LIFF_ID_RECORDS=LIFF紀錄頁ID
   LINE_LIFF_ID_NOTICE=LIFF須知頁ID
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=你的anon_key
   SUPABASE_SERVICE_ROLE_KEY=你的service_role_key
   ADMIN_PASSWORD=你的後台密碼
   SESSION_SECRET=隨機字串（可用 openssl rand -base64 32 產生）
   BASE_URL=https://你的railway網址.railway.app
   ```

4. 等待部署完成，記錄 Railway 給的網址（即 `BASE_URL`）

5. **回到 LIFF 設定**，將 Endpoint URL 換成 Railway 的真實網址

### 四、設定 LINE Webhook

1. 進入 LINE Developers Console > Messaging API 設定
2. **Webhook URL** 填入：`https://你的railway網址/webhook`
3. 點選 **Verify**，應回傳 200 OK
4. 開啟 **Use webhook**（啟用 Webhook）
5. 建議**關閉**「Auto-reply messages」和「Greeting messages」

### 五、上傳 Rich Menu

1. 準備一張 **2500 × 843 px** 的 PNG 圖片，分三等份（由左到右）：
   - 左：📅 預約課程
   - 中：📋 上課須知
   - 右：📸 課程紀錄

2. 將圖片存為 `richmenu/richmenu-image.png`

3. 複製並填寫環境變數：
   ```bash
   cp .env.example .env
   # 編輯 .env 填入所有值
   ```

4. 執行上傳腳本：
   ```bash
   ./setup.sh
   ```

### 六、驗證功能

- [ ] 用 LINE 加入官方帳號，確認出現歡迎訊息
- [ ] 確認 Rich Menu 顯示在聊天底部
- [ ] 點選「預約課程」，確認 LIFF 頁面開啟
- [ ] 填寫預約表單送出，確認收到 LINE 確認訊息
- [ ] 開啟後台 `https://你的網址/admin/index.html` 並登入
- [ ] 在後台確認預約，確認家長收到 LINE 通知
- [ ] 在後台上傳課程紀錄，確認家長收到通知

---

## 專案結構

```
basketball-coach-line/
├── server.js              # 主程式入口
├── package.json
├── .env.example           # 環境變數範本
├── setup.sh               # Rich Menu 設定腳本
├── src/
│   ├── webhook.js         # LINE Webhook 處理
│   ├── routes/
│   │   ├── admin.js       # 後台登入/登出
│   │   ├── bookings.js    # 預約 CRUD
│   │   ├── records.js     # 課程紀錄 CRUD
│   │   └── students.js    # 學生管理 CRUD
│   ├── middleware/
│   │   └── auth.js        # 後台認證
│   └── utils/
│       ├── line.js        # LINE SDK 工具函式
│       └── supabase.js    # Supabase 客戶端
├── public/
│   ├── liff/
│   │   ├── booking.html   # LIFF 預約表單
│   │   ├── records.html   # LIFF 課程紀錄
│   │   └── notice.html    # LIFF 上課須知
│   ├── admin/
│   │   ├── index.html     # 後台登入頁
│   │   ├── dashboard.html # 後台總覽
│   │   ├── bookings.html  # 預約管理
│   │   ├── records.html   # 課程紀錄管理
│   │   └── students.html  # 學生管理
│   └── assets/
│       ├── css/
│       │   ├── common.css
│       │   └── admin.css
│       └── js/
│           └── admin-common.js
├── scripts/
│   └── setup-richmenu.js  # Rich Menu 上傳腳本
├── sql/
│   └── schema.sql         # 資料庫 Schema
└── richmenu/
    ├── richmenu.json      # Rich Menu 設定
    └── richmenu-image.png # 選單圖片（需自行準備）
```

## API 端點

### 公開 API（LIFF 使用）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/bookings` | 提交預約 |
| GET | `/api/bookings/my/:lineUserId` | 查詢個人預約 |
| GET | `/api/records` | 查詢課程紀錄 |
| GET | `/api/records/:id` | 查詢單筆紀錄 |

### 後台 API（需登入）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/admin/login` | 後台登入 |
| POST | `/api/admin/logout` | 後台登出 |
| GET | `/api/admin/check` | 確認登入狀態 |
| GET | `/api/bookings` | 查詢所有預約 |
| PATCH | `/api/bookings/:id` | 更新預約狀態 |
| POST | `/api/records` | 新增課程紀錄 |
| DELETE | `/api/records/:id` | 刪除課程紀錄 |
| GET | `/api/students` | 查詢學生清單 |
| POST | `/api/students` | 新增學生 |
| PATCH | `/api/students/:id` | 更新學生資料 |
| DELETE | `/api/students/:id` | 刪除學生 |

### LINE Webhook

| 路徑 | 說明 |
|------|------|
| POST | `/webhook` - LINE 事件接收端點 |

## 常見問題排除

**Q: Webhook Verify 失敗？**
A: 確認 `LINE_CHANNEL_SECRET` 正確，且 Railway 已成功部署（可用 `/health` 確認）。

**Q: LIFF 頁面顯示 `LIFF SDK not initialized`？**
A: 確認 LIFF ID 正確，且 Endpoint URL 與實際網址相符（需 HTTPS）。

**Q: Push Message 發送失敗？**
A: 確認 `LINE_CHANNEL_ACCESS_TOKEN` 正確，且使用者已加入官方帳號好友。

**Q: 圖片上傳後無法顯示？**
A: 確認 Supabase Storage `course-photos` bucket 設定為 Public，且 `SUPABASE_SERVICE_ROLE_KEY` 填寫正確。

**Q: 後台登入後立刻跳回登入頁？**
A: JWT Token 存在 localStorage。請確認瀏覽器未開啟無痕模式（無痕模式不允許 localStorage）。

**Q: Railway 部署後出現 `Cannot find module 'express-rate-limit'`？**
A: 在 Railway Variables 確認有設定 `NODE_ENV=production`，然後重新部署一次讓 npm install 安裝新依賴。

**Q: 預約送出後家長沒收到 LINE 確認訊息？**
A: Push Message 是非阻塞的（.catch 吞錯誤），請查看 Railway 部署日誌，搜尋 `[Bookings] 發送確認訊息失敗`。

**Q: 課程紀錄頁只顯示「範例」資料？**
A: 這是正常的，表示後端 `/api/records` 回傳空陣列。請在後台新增至少一筆課程紀錄，範例資料就會自動消失。

---

## 日常維護說明

### 更換 LINE Channel Access Token

1. 前往 LINE Developers Console → Messaging API → 重新發行 Access Token
2. 到 Railway Variables 更新 `LINE_CHANNEL_ACCESS_TOKEN`
3. Railway 會自動重新部署，無需手動重啟

### 新增課程時段

目前可用時段在兩處定義，兩者需同步修改：

1. **前端**：`public/liff/booking.html` 中的 `PERIODS` 物件
2. **後端**：`src/routes/bookings.js` 中的 `timeRegex` 仍會接受任何 HH:MM 格式，無需修改

### 更換 Rich Menu 圖片

```bash
# 建立新 Rich Menu 並上傳圖片
curl -X POST "https://api.line.me/v2/bot/richmenu" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @richmenu/richmenu.json

# 設定為預設選單（替換 RICHMENU_ID）
curl -X POST "https://api.line.me/v2/bot/user/all/richmenu/RICHMENU_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Length: 0"
```

### 監控請求日誌

Railway 部署後可在 Logs 頁面即時查看：
- `[GET] /api/records → 200 (45ms)` — 正常請求
- `[POST] /api/bookings → 429` — 觸發 rate limit（正常防護）
- `[Bookings] 新預約: 王小明，日期: 2026-07-01，時段: 10:00` — 新預約
- `[LINE] Push Message 失敗` — 需要排查 LINE Token

---

## 未來擴充建議

| 功能 | 說明 | 難度 |
|------|------|------|
| 課程費用管理 | 在後台新增費率設定，自動計算月結帳單 | 中 |
| 行事曆整合 | 將確認預約同步至 Google Calendar | 中 |
| 預約衝突偵測 | 後端檢查同一時段是否已有預約 | 低 |
| 家長評分回饋 | 課後自動發送評分 Flex Message，收集 1-5 星評價 | 中 |
| 多教練支援 | 新增 `coach_id` 欄位，支援多位教練共用系統 | 高 |
| 自動提醒 | 上課前 24 小時自動 push 提醒訊息（需排程任務） | 中 |
| LINE Pay 整合 | 在 LIFF 頁面直接完成付款 | 高 |
| 出缺席紀錄 | 每堂課打卡，累計出席率統計 | 低 |
