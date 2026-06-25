require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const webhookRouter = require('./src/webhook');
const bookingsRouter = require('./src/routes/bookings');
const recordsRouter = require('./src/routes/records');
const studentsRouter = require('./src/routes/students');
const adminRouter = require('./src/routes/admin');
const blacklistRouter = require('./src/routes/blacklist');
const availabilityRouter = require('./src/routes/availability');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway/Render 等平台使用 reverse proxy，需信任 proxy 才能正確處理 secure cookie
app.set('trust proxy', 1);

// CORS 設定（允許 LIFF 頁面跨域請求）
app.use(cors({
  origin: true,
  credentials: true
}));

// Session 設定（用於後台登入驗證）
app.use(session({
  secret: process.env.SESSION_SECRET || 'basketball-coach-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 請求日誌（排除 webhook 路由避免 body 洩漏 LINE 簽章資料）
app.use((req, res, next) => {
  if (req.path === '/webhook') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${req.method}] ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// LINE Webhook 必須在 express.json() 之前，因為需要原始 body 來驗簽
app.use('/webhook', webhookRouter);

// 一般 JSON 解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 動態提供前端設定（LIFF ID 等公開設定）
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.APP_CONFIG = {
    liffIdBooking: "${process.env.LINE_LIFF_ID_BOOKING || ''}",
    liffIdRecords: "${process.env.LINE_LIFF_ID_RECORDS || ''}",
    liffIdNotice: "${process.env.LINE_LIFF_ID_NOTICE || ''}"
  };`);
});

// 靜態檔案（LIFF 頁面與後台）
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting：預約送出每 IP 每 15 分鐘最多 10 次，防止濫發
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting：後台登入每 IP 每 15 分鐘最多 20 次，防止暴力破解
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '嘗試次數過多，請 15 分鐘後再試' },
  standardHeaders: true,
  legacyHeaders: false
});

// API 路由（POST /api/bookings 與 POST /api/admin/login 套用 rate limit）
app.post('/api/bookings', bookingLimiter);
app.post('/api/admin/login', loginLimiter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/blacklist', blacklistRouter);
app.use('/api/availability', availabilityRouter);

// 健康檢查（Railway 部署時使用）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 根路由導向後台登入頁
app.get('/', (req, res) => {
  res.redirect('/admin/index.html');
});

// 全域錯誤處理，防止伺服器崩潰
app.use((err, req, res, next) => {
  console.error('[錯誤]', err.stack);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

app.listen(PORT, () => {
  console.log(`🏀 籃球家教管理系統啟動，Port: ${PORT}`);
  console.log(`📡 Webhook URL: ${process.env.BASE_URL}/webhook`);
  console.log(`🖥️  後台網址: ${process.env.BASE_URL}/admin/index.html`);
});

module.exports = app;
