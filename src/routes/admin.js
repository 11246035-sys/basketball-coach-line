const express = require('express');
const { verifyAdminPassword } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/admin/login
 * 後台登入
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: '請輸入密碼' });
    }

    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
      return res.status(401).json({ error: '密碼錯誤' });
    }

    req.session.isAdmin = true;
    req.session.loginAt = new Date().toISOString();
    res.json({ success: true, message: '登入成功' });
  } catch (err) {
    console.error('[Admin] 登入錯誤:', err.message);
    res.status(500).json({ error: '登入失敗' });
  }
});

/**
 * POST /api/admin/logout
 * 後台登出
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: '已登出' });
  });
});

/**
 * GET /api/admin/check
 * 檢查登入狀態（前端頁面初始化時呼叫）
 */
router.get('/check', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ isAdmin: true });
  } else {
    res.json({ isAdmin: false });
  }
});

module.exports = router;
