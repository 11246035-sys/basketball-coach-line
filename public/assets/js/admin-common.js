/* 後台共用 JS */

/**
 * 確認登入狀態，未登入則跳轉登入頁
 * @param {Function} callback - 登入後執行的初始化函式
 */
async function requireLogin(callback) {
  try {
    const res = await fetch('/api/admin/check');
    const data = await res.json();
    if (!data.isAdmin) {
      location.href = '/admin/index.html';
      return;
    }
    if (typeof callback === 'function') callback();
  } catch (err) {
    console.error('認證檢查失敗:', err);
    location.href = '/admin/index.html';
  }
}

// 登出按鈕
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (!confirm('確認登出？')) return;
      await fetch('/api/admin/logout', { method: 'POST' });
      location.href = '/admin/index.html';
    });
  }
});

/**
 * 顯示 Toast 通知
 * @param {string} msg - 訊息
 * @param {string} type - 'success' | 'error'
 */
function showToast(msg, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast${type === 'error' ? ' error' : ''}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3000);
}
