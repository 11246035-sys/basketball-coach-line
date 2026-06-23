const line = require('@line/bot-sdk');

// lineConfig 同時用於 Webhook 簽章驗證與 Messaging API 呼叫
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

/**
 * 傳送 Push Message 給指定使用者
 * @param {string} userId - LINE 使用者 ID
 * @param {Array|Object} messages - 訊息物件
 */
async function pushMessage(userId, messages) {
  try {
    const msgs = Array.isArray(messages) ? messages : [messages];
    await client.pushMessage({ to: userId, messages: msgs });
    console.log(`[LINE] Push Message 成功，userId: ${userId}`);
  } catch (err) {
    console.error(`[LINE] Push Message 失敗，userId: ${userId}`, err.message);
    throw err;
  }
}

/**
 * 回覆訊息（用於 Webhook reply）
 * @param {string} replyToken - Webhook 事件的 replyToken
 * @param {Array|Object} messages - 訊息物件
 */
async function replyMessage(replyToken, messages) {
  try {
    const msgs = Array.isArray(messages) ? messages : [messages];
    await client.replyMessage({ replyToken, messages: msgs });
    console.log(`[LINE] Reply Message 成功`);
  } catch (err) {
    console.error(`[LINE] Reply Message 失敗`, err.message);
    throw err;
  }
}

/**
 * 建立文字訊息物件
 */
function textMessage(text) {
  return { type: 'text', text };
}

/**
 * 建立 Flex Message（氣泡卡片）
 */
function flexMessage(altText, contents) {
  return {
    type: 'flex',
    altText,
    contents
  };
}

/**
 * 建立預約確認通知的 Flex 卡片（橘色主題）
 * 教練在後台「確認」預約後，自動 push 給家長
 */
function bookingConfirmFlex(booking) {
  const sessionMap = { morning: '早上 (09:00-12:00)', afternoon: '下午 (13:00-17:00)', evening: '晚上 (18:00-21:00)' };
  return flexMessage(`✅ 課程預約已確認`, {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'text',
        text: '✅ 課程預約已確認',
        weight: 'bold',
        color: '#ffffff',
        size: 'md'
      }],
      backgroundColor: '#f97316'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: `學生姓名：${booking.student_name}`, size: 'sm', color: '#333333' },
        { type: 'text', text: `上課日期：${booking.date}`, size: 'sm', color: '#333333' },
        { type: 'text', text: `上課時段：${sessionMap[booking.session] || booking.session}`, size: 'sm', color: '#333333' },
        booking.notes ? { type: 'text', text: `備註：${booking.notes}`, size: 'sm', color: '#666666', wrap: true } : null
      ].filter(Boolean)
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'text',
        text: '如需更改請聯繫教練',
        size: 'xs',
        color: '#aaaaaa',
        align: 'center'
      }]
    }
  });
}

/**
 * 建立新課程紀錄通知的 Flex 卡片（藍色主題，附照片 Hero）
 * 教練上傳課程紀錄後，自動 push 給家長；photoUrl 可為 null
 */
function newRecordFlex(record, photoUrl) {
  const contents = [
    { type: 'text', text: `上課日期：${record.date}`, size: 'sm', color: '#333333' },
    { type: 'text', text: `學生姓名：${record.student_name || ''}`, size: 'sm', color: '#333333' },
    record.description ? {
      type: 'text', text: record.description, size: 'sm', color: '#666666', wrap: true
    } : null
  ].filter(Boolean);

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'text',
        text: '📸 新課程紀錄已上傳',
        weight: 'bold',
        color: '#ffffff',
        size: 'md'
      }],
      backgroundColor: '#3b82f6'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'button',
        action: {
          type: 'uri',
          label: '查看課程紀錄',
          uri: `https://liff.line.me/${process.env.LINE_LIFF_ID_RECORDS}`
        },
        style: 'primary',
        color: '#3b82f6'
      }]
    }
  };

  // 如果有照片，加入圖片
  if (photoUrl) {
    bubble.hero = {
      type: 'image',
      url: photoUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover'
    };
  }

  return flexMessage('📸 新課程紀錄已上傳', bubble);
}

module.exports = {
  lineConfig,
  client,
  pushMessage,
  replyMessage,
  textMessage,
  flexMessage,
  bookingConfirmFlex,
  newRecordFlex
};
