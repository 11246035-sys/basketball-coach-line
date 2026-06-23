const express = require('express');
const line = require('@line/bot-sdk');
const { lineConfig, replyMessage, textMessage } = require('./utils/line');

const router = express.Router();

// LINE SDK 中介軟體：驗證 Webhook 簽章，必須使用原始 body
const middleware = line.middleware(lineConfig);

// 上課須知文字內容
const NOTICE_TEXT = `📋 上課須知

📍 上課地點：請洽詢教練確認場地

💰 課程費用：
• 單堂體驗課：請詢問教練
• 月費方案：請詢問教練

⏰ 課程時段：
• 早上：09:00 - 12:00
• 下午：13:00 - 17:00
• 晚上：18:00 - 21:00

📝 注意事項：
1. 請提前 10 分鐘到達
2. 穿著舒適運動服裝及球鞋
3. 自備飲水，保持充足水分
4. 請勿空腹上課
5. 如需取消請提前 24 小時告知
6. 課程中如有不適請立即告知教練

如有任何問題，歡迎直接在此留言！`;

/**
 * 處理 LINE Webhook 事件
 */
router.post('/', middleware, async (req, res) => {
  // 立即回覆 200，防止 LINE 重送請求
  res.status(200).json({ status: 'ok' });

  const events = req.body.events;
  if (!events || events.length === 0) return;

  // 平行處理所有事件
  await Promise.all(events.map(event => handleEvent(event).catch(err => {
    console.error('[Webhook] 事件處理錯誤:', err.message, '事件類型:', event.type);
  })));
});

/**
 * 根據事件類型分派處理函式
 */
async function handleEvent(event) {
  console.log(`[Webhook] 收到事件: ${event.type}`);

  switch (event.type) {
    case 'message':
      return handleMessage(event);
    case 'follow':
      return handleFollow(event);
    case 'postback':
      return handlePostback(event);
    default:
      console.log(`[Webhook] 未處理的事件類型: ${event.type}`);
  }
}

/**
 * 處理文字訊息
 */
async function handleMessage(event) {
  if (event.message.type !== 'text') return;

  const text = event.message.text.trim();
  console.log(`[Webhook] 收到訊息: "${text}"`);

  // 關鍵字觸發
  if (text.includes('上課須知') || text.includes('注意事項') || text === '須知') {
    return replyMessage(event.replyToken, textMessage(NOTICE_TEXT));
  }

  if (text.includes('預約') || text.includes('報名')) {
    return replyMessage(event.replyToken, {
      type: 'text',
      text: '請點選下方選單的「📅 預約課程」按鈕進行預約！'
    });
  }

  if (text.includes('紀錄') || text.includes('照片')) {
    return replyMessage(event.replyToken, {
      type: 'text',
      text: '請點選下方選單的「📸 課程紀錄」按鈕查看紀錄！'
    });
  }

  // 非指令訊息：一律給予預設回覆，確保任何用戶（含新用戶）都有回應
  return replyMessage(event.replyToken, textMessage(
    `感謝您的訊息！教練會盡快回覆您 🏀\n您也可以使用下方選單快速預約課程或查看紀錄。`
  ));
}

/**
 * 處理加入好友事件
 */
async function handleFollow(event) {
  const welcomeText = `🏀 歡迎加入籃球家教！
請使用下方選單開始使用：
📅 預約課程 - 填寫預約表單
📋 上課須知 - 查看課程相關資訊
📸 課程紀錄 - 查看上課照片與紀錄
如有任何問題請直接留言，教練會盡快回覆！`;

  return replyMessage(event.replyToken, textMessage(welcomeText));
}

/**
 * 處理 Postback 事件
 */
async function handlePostback(event) {
  const data = event.postback.data;
  console.log(`[Webhook] Postback data: ${data}`);
}

module.exports = router;
