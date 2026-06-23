const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SESSION_SECRET || 'basketball-coach-secret';

function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '請先登入後台' });
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token 已過期，請重新登入' });
  }
}

async function verifyAdminPassword(inputPassword) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD 未設定');

  if (adminPassword.startsWith('$2b$') || adminPassword.startsWith('$2a$')) {
    return bcrypt.compare(inputPassword, adminPassword);
  }

  return inputPassword === adminPassword;
}

function signAdminToken() {
  return jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { requireAdmin, verifyAdminPassword, signAdminToken };
