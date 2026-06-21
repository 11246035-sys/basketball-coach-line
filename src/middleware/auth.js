const bcrypt = require('bcryptjs');

/**
 * 驗證後台登入 Session
 * 確保只有登入的管理員才能存取後台 API
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: '請先登入後台' });
}

/**
 * 驗證管理員密碼
 * 支援純文字比對（簡單部署）或 bcrypt 雜湊比對
 */
async function verifyAdminPassword(inputPassword) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD 未設定');

  // 如果密碼以 $2b$ 開頭，表示是 bcrypt 雜湊
  if (adminPassword.startsWith('$2b$') || adminPassword.startsWith('$2a$')) {
    return bcrypt.compare(inputPassword, adminPassword);
  }

  // 否則直接比對（開發階段方便使用）
  return inputPassword === adminPassword;
}

module.exports = { requireAdmin, verifyAdminPassword };
