const express = require('express');
const { verifyAdminPassword, signAdminToken } = require('../middleware/auth');

const router = express.Router();

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

    const token = signAdminToken();
    res.json({ success: true, token });
  } catch (err) {
    console.error('[Admin] 登入錯誤:', err.message);
    res.status(500).json({ error: '登入失敗' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: '已登出' });
});

router.get('/check', (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.json({ isAdmin: false });
  }
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.SESSION_SECRET || 'basketball-coach-secret';
    jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ isAdmin: true });
  } catch {
    res.json({ isAdmin: false });
  }
});

module.exports = router;
