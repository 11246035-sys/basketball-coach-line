const express = require('express');
const { supabase } = require('../utils/supabase');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ALL_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00'
];

function toDbWeekday(jsDay) { return jsDay === 0 ? 7 : jsDay; }

function getReservedForSlot(slot, reserved) {
  if (!reserved || reserved.length === 0) return null;
  const [h, m] = slot.split(':').map(Number);
  const mins = h * 60 + m;
  return reserved.find(r => {
    const [sh, sm] = r.start_time.split(':').map(Number);
    const [eh, em] = r.end_time.split(':').map(Number);
    return mins >= sh * 60 + sm && mins < eh * 60 + em;
  }) || null;
}

/**
 * GET /api/availability?date=YYYY-MM-DD
 * Public: 給預約表單用，只回傳 available: true 的時段
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: '請提供日期' });

    const today = new Date().toISOString().split('T')[0];
    if (date < today) return res.json({ slots: [] });

    const weekday = toDbWeekday(new Date(date + 'T00:00:00').getDay());

    const [{ data: avail }, { data: reserved }] = await Promise.all([
      supabase.from('availability').select('time_slot, status').eq('date', date),
      supabase.from('reserved_slots').select('*').eq('weekday', weekday)
    ]);

    const availMap = {};
    (avail || []).forEach(a => { availMap[a.time_slot] = a.status; });

    const slots = ALL_SLOTS
      .filter(slot => {
        const status = availMap[slot] || 'closed';
        const reservedBy = getReservedForSlot(slot, reserved || []);
        return status === 'open' && !reservedBy;
      })
      .map(slot => ({ time_slot: slot }));

    res.json({ slots });
  } catch (err) {
    console.error('[Availability]', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * GET /api/availability/month?year=YYYY&month=MM
 * Admin: 取得整月摘要（availability + reserved + bookings）
 */
router.get('/month', requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year), m = parseInt(month);
    const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const [{ data: avail }, { data: reserved }, { data: bookings }] = await Promise.all([
      supabase.from('availability').select('date, time_slot, status')
        .gte('date', startDate).lte('date', endDate),
      supabase.from('reserved_slots').select('*').order('weekday').order('start_time'),
      supabase.from('bookings').select('id, student_name, date, session, status')
        .gte('date', startDate).lte('date', endDate)
        .in('status', ['pending', 'confirmed'])
    ]);

    res.json({
      availability: avail || [],
      reserved: reserved || [],
      bookings: bookings || []
    });
  } catch (err) {
    console.error('[Availability] month:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * GET /api/availability/day?date=YYYY-MM-DD
 * Admin: 取得單日所有 25 個時段的完整狀態
 */
router.get('/day', requireAdmin, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: '請提供日期' });

    const weekday = toDbWeekday(new Date(date + 'T00:00:00').getDay());

    const [{ data: avail }, { data: reserved }, { data: bookings }] = await Promise.all([
      supabase.from('availability').select('*').eq('date', date),
      supabase.from('reserved_slots').select('*').eq('weekday', weekday),
      supabase.from('bookings').select('id, student_name, session, status')
        .eq('date', date).in('status', ['pending', 'confirmed'])
    ]);

    const availMap = {};
    (avail || []).forEach(a => { availMap[a.time_slot] = a; });

    const bookingMap = {};
    (bookings || []).forEach(b => { bookingMap[b.session] = b; });

    const slots = ALL_SLOTS.map(slot => {
      const row = availMap[slot];
      const reservedBy = getReservedForSlot(slot, reserved || []);
      const booking = bookingMap[slot];

      let status = row ? row.status : 'closed';
      if (booking) status = 'booked';

      return {
        time_slot: slot,
        status,
        reserved: reservedBy ? reservedBy.student_name : null,
        booking: booking ? { id: booking.id, student_name: booking.student_name, status: booking.status } : null
      };
    });

    res.json({ slots });
  } catch (err) {
    console.error('[Availability] day:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * PUT /api/availability/toggle
 * Admin: 切換單一時段 open/closed
 */
router.put('/toggle', requireAdmin, async (req, res) => {
  try {
    const { date, time_slot } = req.body;
    if (!date || !time_slot) return res.status(400).json({ error: '請提供日期和時段' });
    if (!ALL_SLOTS.includes(time_slot)) return res.status(400).json({ error: '無效時段' });

    const { data: existing } = await supabase.from('availability')
      .select('*').eq('date', date).eq('time_slot', time_slot).maybeSingle();

    if (existing?.status === 'booked') {
      return res.status(400).json({ error: '此時段已被預約，無法修改' });
    }

    const isCurrentlyOpen = existing?.status === 'open';

    if (isCurrentlyOpen) {
      await supabase.from('availability').delete().eq('date', date).eq('time_slot', time_slot);
      return res.json({ success: true, status: 'closed' });
    } else {
      const { error } = await supabase.from('availability')
        .upsert({ date, time_slot, status: 'open' }, { onConflict: 'date,time_slot' });
      if (error) throw error;
      return res.json({ success: true, status: 'open' });
    }
  } catch (err) {
    console.error('[Availability] toggle:', err.message);
    res.status(500).json({ error: '操作失敗' });
  }
});

/**
 * PUT /api/availability/batch
 * Admin: 批次設定一天所有時段（全開 / 全關 / 自訂）
 */
router.put('/batch', requireAdmin, async (req, res) => {
  try {
    const { date, action } = req.body; // action: 'open_all' | 'close_all'
    if (!date) return res.status(400).json({ error: '請提供日期' });

    if (action === 'close_all') {
      await supabase.from('availability').delete().eq('date', date).neq('status', 'booked');
      return res.json({ success: true });
    }

    if (action === 'open_all') {
      const rows = ALL_SLOTS.map(slot => ({ date, time_slot: slot, status: 'open' }));
      await supabase.from('availability').delete().eq('date', date).neq('status', 'booked');
      const { error } = await supabase.from('availability').insert(rows);
      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(400).json({ error: '無效的 action' });
  } catch (err) {
    console.error('[Availability] batch:', err.message);
    res.status(500).json({ error: '操作失敗' });
  }
});

module.exports = router;
