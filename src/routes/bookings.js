const express = require('express');
const { supabase } = require('../utils/supabase');
const { pushMessage, bookingConfirmFlex, textMessage } = require('../utils/line');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── helpers ─────────────────────────────────────────────────────────────────

function nextSlotTime(slot) {
  const [h, m] = slot.split(':').map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function calcEndTime(slot, durationMins) {
  const [h, m] = slot.split(':').map(Number);
  const total = h * 60 + m + durationMins;
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function isSlotInReserved(slot, reserved) {
  if (!reserved || !reserved.length) return false;
  const [h, m] = slot.split(':').map(Number);
  const mins = h * 60 + m;
  return reserved.some(r => {
    const [sh, sm] = r.start_time.split(':').map(Number);
    const [eh, em] = r.end_time.split(':').map(Number);
    return mins >= sh * 60 + sm && mins < eh * 60 + em;
  });
}

function toDbWeekday(jsDay) { return jsDay === 0 ? 7 : jsDay; }

function getSessionLabel(session, durationMins, endTime) {
  const map = { morning: '早上', afternoon: '下午', evening: '晚上' };
  if (map[session]) return map[session];
  const end = endTime || calcEndTime(session, durationMins || 60);
  return `${session}–${end}`;
}

function getSessionStartHour(session) {
  const legacyMap = { morning: 9, afternoon: 13, evening: 18 };
  if (legacyMap[session] !== undefined) return legacyMap[session];
  return parseInt(session.split(':')[0]);
}

async function releaseAvailabilitySlots(bookingId) {
  try {
    await supabase.from('availability')
      .update({ status: 'open', booking_id: null })
      .eq('booking_id', bookingId)
      .eq('status', 'booked');
  } catch (err) {
    console.error('[Bookings] 釋放時段失敗:', err.message);
  }
}

// ── POST /api/bookings ───────────────────────────────────────────────────────

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
    const duration = parseInt(req.body.duration) || 60;

    // 基本驗證
    if (!line_user_id || !student_name || !date || !session) {
      return res.status(400).json({ error: '請填寫完整資料（姓名、日期、時段為必填）' });
    }
    if (!location) {
      return res.status(400).json({ error: '請填寫理想地區，或選擇「未定，與教練討論」' });
    }
    if (![60, 90].includes(duration)) {
      return res.status(400).json({ error: '無效的課程長度（60 或 90 分鐘）' });
    }

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

    const validLegacySessions = ['morning', 'afternoon', 'evening'];
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const isLegacySession = validLegacySessions.includes(session);
    if (!isLegacySession && !timeRegex.test(session)) {
      return res.status(400).json({ error: '無效的時段選擇' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式錯誤' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return res.status(400).json({ error: '不能預約過去的日期' });
    }

    // 1.5 小時只接受 HH:MM 格式時段
    if (duration === 90 && isLegacySession) {
      return res.status(400).json({ error: '1.5 小時課程請選擇具體時段' });
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

    // pending 預約上限
    const { count: pendingCount, error: pendingErr } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', line_user_id)
      .eq('status', 'pending');
    if (pendingErr) throw pendingErr;
    if (pendingCount >= 3) {
      return res.status(400).json({ error: '您目前有 3 筆待確認的預約，請等教練確認後再預約新課程' });
    }

    // 計算結束時間
    const end_time = isLegacySession ? null : calcEndTime(session, duration);

    // 時段衝突檢查（HH:MM 格式才做）
    if (!isLegacySession) {
      const slotsToCheck = [session];
      if (duration === 90) slotsToCheck.push(nextSlotTime(session));

      // 公休日檢查
      const { data: holiday } = await supabase.from('holidays')
        .select('date').eq('date', date).maybeSingle();
      if (holiday) {
        return res.status(400).json({ error: '此日期為公休日，無法預約' });
      }

      // 固定保留時段檢查
      const weekday = toDbWeekday(new Date(date + 'T00:00:00').getDay());
      const { data: reserved } = await supabase.from('reserved_slots')
        .select('*').eq('weekday', weekday);
      for (const slot of slotsToCheck) {
        if (isSlotInReserved(slot, reserved || [])) {
          return res.status(409).json({ error: `${slot} 屬於固定保留時段，無法預約` });
        }
      }

      // availability 開放狀態檢查（race condition guard）
      const { data: availRows } = await supabase.from('availability')
        .select('time_slot, status')
        .eq('date', date)
        .in('time_slot', slotsToCheck);

      for (const slot of slotsToCheck) {
        const row = (availRows || []).find(r => r.time_slot === slot);
        if (!row || row.status !== 'open') {
          const msg = duration === 90 && slot !== session
            ? '此時段組合剛被預約（後半段已被佔用），請重新選擇'
            : '此時段剛被預約，請重新選擇其他時段';
          return res.status(409).json({ error: msg });
        }
      }
    }

    // 寫入預約
    const { data, error } = await supabase
      .from('bookings')
      .insert([{ line_user_id, student_name, grade, level, phone, date, session, location, goal, notes, status: 'pending', duration, end_time }])
      .select()
      .single();

    if (error) {
      console.error('[Bookings] 新增預約失敗:', error.message);
      return res.status(500).json({ error: '預約失敗，請稍後再試' });
    }

    // 將 availability 槽位標記為 booked（含 race condition 最終防線）
    if (!isLegacySession) {
      const slotsToBook = [session];
      if (duration === 90) slotsToBook.push(nextSlotTime(session));

      for (const slot of slotsToBook) {
        const { data: updated } = await supabase.from('availability')
          .update({ status: 'booked', booking_id: data.id })
          .eq('date', date)
          .eq('time_slot', slot)
          .eq('status', 'open')
          .select();

        if (!updated || updated.length === 0) {
          // 搶先被別人訂走 → 回滾並回傳衝突錯誤
          await supabase.from('availability')
            .update({ status: 'open', booking_id: null })
            .eq('booking_id', data.id);
          await supabase.from('bookings').delete().eq('id', data.id);
          return res.status(409).json({ error: '此時段剛被其他人預約，請重新選擇' });
        }
      }
    }

    console.log(`[Bookings] 新預約: ${student_name}，${date} ${session}，${duration}分鐘`);

    // 熟客記憶（async，不影響回應）
    const studentProfile = { line_user_id, name: student_name };
    if (grade) studentProfile.grade = grade;
    if (level) studentProfile.level = level;
    if (phone) studentProfile.phone = phone;
    if (location) studentProfile.location = location;
    if (goal) studentProfile.goal = goal;
    supabase.from('students').upsert(studentProfile, { onConflict: 'line_user_id' })
      .then(() => {}).catch(err => console.error('[Bookings] 更新學生資料失敗:', err.message));

    // 發送確認訊息
    const locationLine = location ? `\n地點：${location}` : '';
    const durationLabel = duration === 90 ? '1.5 小時' : '1 小時';
    await pushMessage(line_user_id, textMessage(
      `✅ 已收到您的預約申請！\n\n學生：${student_name}\n日期：${date}\n時段：${getSessionLabel(session, duration, end_time)}\n課程長度：${durationLabel}${locationLine}\n\n教練確認後會再通知您，請耐心等候。`
    )).catch(err => console.error('[Bookings] 發送確認訊息失敗:', err.message));

    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 未預期錯誤:', err.message);
    res.status(500).json({ error: '系統錯誤' });
  }
});

// ── PATCH /api/bookings/:id/cancel（使用者自助取消）──────────────────────────

router.patch('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const line_user_id = req.body.line_user_id?.trim();
    if (!line_user_id) return res.status(400).json({ error: '缺少 line_user_id' });

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', id).single();
    if (fetchErr || !booking) return res.status(404).json({ error: '找不到此預約' });
    if (booking.line_user_id !== line_user_id) return res.status(403).json({ error: '無權取消此預約' });
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ error: '此預約無法取消' });
    }

    const sessionStartHour = getSessionStartHour(booking.session);
    const classTime = new Date(`${booking.date}T${String(sessionStartHour).padStart(2,'0')}:00:00+08:00`);
    if ((classTime - new Date()) / (1000 * 60 * 60) < 24) {
      return res.status(400).json({ error: '距離上課不足 24 小時，如需取消請直接聯絡教練' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    await releaseAvailabilitySlots(id);
    console.log(`[Bookings] 使用者取消預約 id=${id}，學生：${booking.student_name}`);
    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 取消失敗:', err.message);
    res.status(500).json({ error: '取消失敗，請稍後再試' });
  }
});

// ── GET /api/bookings（後台查詢）────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, date } = req.query;
    let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
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

// ── PATCH /api/bookings/:id（後台更新狀態）──────────────────────────────────

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '無效的狀態值' });
    }

    const { data: booking, error: fetchError } = await supabase
      .from('bookings').select('*').eq('id', id).single();
    if (fetchError || !booking) return res.status(404).json({ error: '找不到此預約' });

    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    // 取消/拒絕時釋放 availability 時段
    if (['cancelled', 'rejected'].includes(status)) {
      await releaseAvailabilitySlots(id);
    }

    if (status === 'confirmed' && booking.line_user_id) {
      await pushMessage(booking.line_user_id, bookingConfirmFlex(booking))
        .catch(err => console.error('[Bookings] 發送確認通知失敗:', err.message));
    }
    if (status === 'rejected' && booking.line_user_id) {
      await pushMessage(booking.line_user_id, textMessage(
        `很抱歉，您的預約申請未能確認。\n\n學生：${booking.student_name}\n日期：${booking.date}\n時段：${getSessionLabel(booking.session, booking.duration, booking.end_time)}\n\n如有疑問請直接聯繫教練。`
      )).catch(err => console.error('[Bookings] 發送拒絕通知失敗:', err.message));
    }

    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('[Bookings] 更新失敗:', err.message);
    res.status(500).json({ error: '更新失敗' });
  }
});

// ── GET /api/bookings/my/:lineUserId（LIFF 個人記錄）────────────────────────

router.get('/my/:lineUserId', async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const { data, error } = await supabase
      .from('bookings').select('*')
      .eq('line_user_id', lineUserId)
      .order('date', { ascending: false });
    if (error) throw error;
    res.json({ bookings: data });
  } catch (err) {
    console.error('[Bookings] 查詢個人預約失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

module.exports = router;
