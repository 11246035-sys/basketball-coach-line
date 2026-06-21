/**
 * Rich Menu 上傳腳本
 * 執行方式：node scripts/setup-richmenu.js
 *
 * 執行前請確認：
 * 1. .env 已設定 LINE_CHANNEL_ACCESS_TOKEN
 * 2. richmenu/richmenu-image.png 圖片已放置（建議 2500x843 px）
 * 3. LIFF ID 已填入下方或替換 richmenu.json 中的佔位符
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌ 錯誤：請在 .env 設定 LINE_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

// 讀取並替換 LIFF ID 佔位符
let richMenuJson = fs.readFileSync(path.join(__dirname, '../richmenu/richmenu.json'), 'utf-8');
richMenuJson = richMenuJson
  .replace(/__LIFF_ID_BOOKING__/g, process.env.LINE_LIFF_ID_BOOKING || 'YOUR_BOOKING_LIFF_ID')
  .replace(/__LIFF_ID_NOTICE__/g, process.env.LINE_LIFF_ID_NOTICE || 'YOUR_NOTICE_LIFF_ID')
  .replace(/__LIFF_ID_RECORDS__/g, process.env.LINE_LIFF_ID_RECORDS || 'YOUR_RECORDS_LIFF_ID');

const richMenuData = JSON.parse(richMenuJson);

/**
 * 發送 HTTPS 請求的輔助函式
 */
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🚀 開始設定 LINE Rich Menu...\n');

  // ========================================
  // 步驟 1：建立 Rich Menu
  // ========================================
  console.log('📝 步驟 1：建立 Rich Menu...');
  const createRes = await request({
    hostname: 'api.line.me',
    path: '/v2/bot/richmenu',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  }, JSON.stringify(richMenuData));

  if (createRes.statusCode !== 200) {
    console.error('❌ 建立失敗:', createRes.body);
    process.exit(1);
  }

  const richMenuId = createRes.body.richMenuId;
  console.log(`✅ Rich Menu 建立成功！ID: ${richMenuId}\n`);

  // ========================================
  // 步驟 2：上傳圖片
  // ========================================
  const imagePath = path.join(__dirname, '../richmenu/richmenu-image.png');
  if (!fs.existsSync(imagePath)) {
    console.warn('⚠️  警告：找不到 richmenu/richmenu-image.png');
    console.warn('   請準備 2500x843 px 的 Rich Menu 圖片，並放在 richmenu/richmenu-image.png');
    console.warn('   然後執行：node scripts/upload-richmenu-image.js ' + richMenuId);
    console.warn(`\n📌 Rich Menu ID 請記錄：${richMenuId}`);
  } else {
    console.log('🖼️  步驟 2：上傳 Rich Menu 圖片...');
    const imageBuffer = fs.readFileSync(imagePath);
    const uploadRes = await request({
      hostname: 'api-data.line.me',
      path: `/v2/bot/richmenu/${richMenuId}/content`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length
      }
    }, imageBuffer);

    if (uploadRes.statusCode !== 200) {
      console.error('❌ 圖片上傳失敗:', uploadRes.body);
      console.log(`📌 Rich Menu ID：${richMenuId}`);
    } else {
      console.log('✅ 圖片上傳成功！\n');
    }
  }

  // ========================================
  // 步驟 3：設為預設 Rich Menu
  // ========================================
  console.log('🔗 步驟 3：設為預設 Rich Menu...');
  const setDefaultRes = await request({
    hostname: 'api.line.me',
    path: `/v2/bot/user/all/richmenu/${richMenuId}`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (setDefaultRes.statusCode !== 200) {
    console.error('❌ 設定預設失敗:', setDefaultRes.body);
  } else {
    console.log('✅ 已設為預設 Rich Menu！\n');
  }

  console.log('🎉 Rich Menu 設定完成！');
  console.log(`   Rich Menu ID: ${richMenuId}`);
  console.log('\n提示：若需要列出現有 Rich Menu，可執行：');
  console.log('   curl -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" https://api.line.me/v2/bot/richmenu/list');
}

main().catch(err => {
  console.error('❌ 腳本執行失敗:', err.message);
  process.exit(1);
});
