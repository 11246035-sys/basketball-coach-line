/* 後台共用 JS - JWT 版本 */

function getToken() {
  return localStorage.getItem('admin_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// 覆寫 fetch，自動帶 Authorization header
const _origFetch = window.fetch;
window.fetch = function(url, options = {}) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    options.headers = Object.assign({}, options.headers || {}, {
      'Authorization': `Bearer ${getToken()}`
    });
  }
  return _origFetch(url, options);
};

async function requireLogin(callback) {
  const token = getToken();
  if (!token) {
    location.href = '/admin/index.html';
    return;
  }
  try {
    const res = await fetch('/api/admin/check');
    const data = await res.json();
    if (!data.isAdmin) {
      localStorage.removeItem('admin_token');
      location.href = '/admin/index.html';
      return;
    }
    if (typeof callback === 'function') callback();
  } catch (err) {
    console.error('認證檢查失敗:', err);
    location.href = '/admin/index.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (!confirm('確認登出？')) return;
      localStorage.removeItem('admin_token');
      location.href = '/admin/index.html';
    });
  }
});

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
