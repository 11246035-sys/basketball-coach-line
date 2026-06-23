# 🏀 籃球家教 LINE 管理系統

LINE 官方帳號籃球家教管理系統，支援線上預約、課程紀錄查閱、教練後台管理與自動推播通知。

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

## 常見問題

**Q: Webhook Verify 失敗？**
A: 確認 `LINE_CHANNEL_SECRET` 正確，且 Railway 已成功部署（可用 `/health` 確認）。

**Q: LIFF 頁面顯示 `LIFF SDK not initialized`？**
A: 確認 LIFF ID 正確，且 Endpoint URL 與實際網址相符（需 HTTPS）。

**Q: Push Message 發送失敗？**
A: 確認 `LINE_CHANNEL_ACCESS_TOKEN` 正確，且使用者已加入官方帳號好友。

**Q: 圖片上傳後無法顯示？**
A: 確認 Supabase Storage `course-photos` bucket 設定為 Public，且 `SUPABASE_SERVICE_ROLE_KEY` 填寫正確。
