const express = require('express');
const { supabase } = require('../utils/supabase');
const { pushMessage, bookingConfirmFlex, textMessage } = require('../utils/line');
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
    const grade = req.body.grade?.trim() || null;
    const level = req.body.level?.trim() || null;
    const phone = req.body.phone?.trim() || null;
    const date = req.body.date?.trim();
    const session = req.body.session?.trim();
    const location = req.body.location?.trim() || null;
    const goal = req.body.goal?.trim() || null;
    const notes = req.body.notes?.trim() || null;

    // 基本驗證
    if (!line_user_id || !student_name || !date || !session) {
      return res.status(400).json({ error: '請填寫完整資料（姓名、日期、時段為必填）' });
    }

    // 新欄位驗證
    const validGrades = ['國小低年級', '國小中年級', '國小高年級', '國中', '高中', '成人'];
    const validLevels = ['初學者', '有基礎', '進階'];
    const phoneRegex = /^[\d\-\+\s\(\)]{8,20}$/;
    if (grade && !validGrades.includes(grade)) {
      return res.status(400).json({ error: '無效的年級選項' });
    }
    if (level && !validLevels.includes(level)) {
      return res.status(400).json({ error: '無效的程度選項' });
    }
    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({ error: '請輸入有效的電話號碼' });
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

    // 黑名單檢查
    const { count: blacklistCount, error: blErr } = await supabase
      .from('blacklist')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', line_user_id);

    if (blErr) throw blErr;
    if (blacklistCount > 0) {
      return res.status(403).json({ error: '無法完成預約，如有疑問請直接聯繫教練' });
    }

    // 同一帳號 pending 預約上限（最多 3 筆）
    const { count: pendingCount, error: pendingErr } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', line_user_id)
      .eq('status', 'pending');

    if (pendingErr) throw pendingErr;
    if (pendingCount >= 3) {
      return res.status(400).json({ error: '您目前有 3 筆待確認的預約，請等教練確認後再預約新課程' });
    }

    // 寫入預約
    const { data, error } = await supabase
      .from('bookings')
      .insert([{ line_user_id, student_name, grade, level, phone, date, session, location, goal, notes, status: 'pending' }])
      .select()
      .single();

    if (error) {
      console.error('[Bookings] 新增預約失敗:', error.message);
      return res.status(500).json({ error: '預約失敗，請稍後再試' });
    }

    console.log(`[Bookings] 新預約: ${student_name}，日期: ${date}，時段: ${session}`);

    // 更新學生基本資料（upsert，熟客自動記憶）
    const studentProfile = { line_user_id, name: student_name };
    if (grade) studentProfile.grade = grade;
    if (level) studentProfile.level = level;
    if (phone) studentProfile.phone = phone;
    if (location) studentProfile.location = location;
    if (goal) studentProfile.goal = goal;
    supabase.from('students').upsert(studentProfile, { onConflict: 'line_user_id' })
      .then(() => {})
      .catch(err => console.error('[Bookings] 更新學生資料失敗:', err.message));

    // 發送確認訊息給家長
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
 * PATCH /api/bookings/:id/cancel
 * LIFF 使用者自助取消預約（公開，需帶 line_user_id 驗證身份）
 */
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const line_user_id = req.body.line_user_id?.trim();

    if (!line_user_id) {
      return res.status(400).json({ error: '缺少 line_user_id' });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    if (booking.line_user_id !== line_user_id) {
      return res.status(403).json({ error: '無權取消此預約' });
    }

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ error: '此預約無法取消' });
    }

    const sessionStartHour = getSessionStartHour(booking.session);
    const classTime = new Date(`${booking.date}T${String(sessionStartHour).padStart(2,'0')}:00:00+08:00`);
    const hoursUntilClass = (classTime - new Date()) / (1000 * 60 * 60);

    if (hoursUntilClass < 24) {
      return res.status(400).json({ error: '距離上課不足 24 小時，如需取消請直接聯絡教練' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Bookings] 使用者取消預約 id=${id}，學生：${booking.student_name}`);
    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 取消失敗:', err.message);
    res.status(500).json({ error: '取消失敗，請稍後再試' });
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
 * 後台更新預約狀態（需登入）
 */
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '無效的狀態值' });
    }

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: '找不到此預約' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (status === 'confirmed' && booking.line_user_id) {
      await pushMessage(booking.line_user_id, bookingConfirmFlex(booking))
        .catch(err => console.error('[Bookings] 發送確認通知失敗:', err.message));
    }

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
 * GET /api/bookings/my/:lineUserId
 * LIFF 查詢個人預約紀錄
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
  const h = parseInt(session.split(':')[0]);
  return `${session}–${String(h + 1).padStart(2,'0')}:00`;
}

function getSessionStartHour(session) {
  const legacyMap = { morning: 9, afternoon: 13, evening: 18 };
  if (legacyMap[session] !== undefined) return legacyMap[session];
  return parseInt(session.split(':')[0]);
}

module.exports = router;
