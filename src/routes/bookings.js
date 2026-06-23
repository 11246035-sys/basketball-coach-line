const express = require('express');
const { supabase } = require('../utils/supabase');
const { pushMessage, replyMessage, bookingConfirmFlex, textMessage } = require('../utils/line');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/bookings
 * LIFF 表單提交預約（公開 API）
 */
router.post('/', async (req, res) => {
  try {
    const line_user_id = req.body.line_user_id?.trim();
    const student_name = req.body.student_name?.trim();
    const date = req.body.date?.trim();
    const session = req.body.session?.trim();
    const location = req.body.location?.trim() || null;
    const notes = req.body.notes?.trim() || null;

    // 基本驗證
    if (!line_user_id || !student_name || !date || !session) {
      return res.status(400).json({ error: '請填寫完整資料（姓名、日期、時段為必填）' });
    }

    // 驗證時段：接受舊格式（morning/afternoon/evening）或新格式（HH:MM）
    const validLegacySessions = ['morning', 'afternoon', 'evening'];
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!validLegacySessions.includes(session) && !timeRegex.test(session)) {
      return res.status(400).json({ error: '無效的時段選擇' });
    }

    // 驗證日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式錯誤' });
    }

    // 不能預約過去的日期
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return res.status(400).json({ error: '不能預約過去的日期' });
    }

    // 寫入資料庫
    const { data, error } = await supabase
      .from('bookings')
      .insert([{ line_user_id, student_name, date, session, location, notes, status: 'pending' }])
      .select()
      .single();

    if (error) {
      console.error('[Bookings] 新增預約失敗:', error.message);
      return res.status(500).json({ error: '預約失敗，請稍後再試' });
    }

    console.log(`[Bookings] 新預約: ${student_name}，日期: ${date}，時段: ${session}`);

    // 自動回覆確認訊息給家長
    const locationLine = location ? `\n地點：${location}` : '';
    await pushMessage(line_user_id, textMessage(
      `✅ 已收到您的預約申請！\n\n學生：${student_name}\n日期：${date}\n時段：${getSessionLabel(session)}${locationLine}\n\n教練確認後會再通知您，請耐心等候。`
    )).catch(err => console.error('[Bookings] 發送確認訊息失敗:', err.message));

    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 未預期錯誤:', err.message);
    res.status(500).json({ error: '系統錯誤' });
  }
});

/**
 * GET /api/bookings
 * 後台查看所有預約（需登入）
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, date } = req.query;
    let query = supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (date) query = query.eq('date', date);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ bookings: data });
  } catch (err) {
    console.error('[Bookings] 查詢失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * PATCH /api/bookings/:id
 * 後台更新預約狀態（接受/拒絕）（需登入）
 */
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '無效的狀態值' });
    }

    // 先取得預約資料（需要 line_user_id 發送通知）
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    // 更新狀態
    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // 確認後發送 Push Message 給家長
    if (status === 'confirmed' && booking.line_user_id) {
      await pushMessage(booking.line_user_id, bookingConfirmFlex(booking))
        .catch(err => console.error('[Bookings] 發送確認通知失敗:', err.message));
    }

    // 拒絕時發送通知
    if (status === 'rejected' && booking.line_user_id) {
      await pushMessage(booking.line_user_id, textMessage(
        `很抱歉，您的預約申請未能確認。\n\n學生：${booking.student_name}\n日期：${booking.date}\n時段：${getSessionLabel(booking.session)}\n\n如有疑問請直接聯繫教練。`
      )).catch(err => console.error('[Bookings] 發送拒絕通知失敗:', err.message));
    }

    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 更新失敗:', err.message);
    res.status(500).json({ error: '更新失敗' });
  }
});

/**
 * GET /api/bookings/my
 * LIFF 查詢個人預約紀錄（透過 line_user_id）
 */
router.get('/my/:lineUserId', async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('line_user_id', lineUserId)
      .order('date', { ascending: false });

    if (error) throw error;
    res.json({ bookings: data });
  } catch (err) {
    console.error('[Bookings] 查詢個人預約失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

function getSessionLabel(session) {
  const map = { morning: '早上', afternoon: '下午', evening: '晚上' };
  if (map[session]) return map[session];
  // HH:MM 格式：顯示起訖時間
  const h = parseInt(session.split(':')[0]);
  return `${session}–${String(h + 1).padStart(2,'0')}:00`;
}

module.exports = router;
