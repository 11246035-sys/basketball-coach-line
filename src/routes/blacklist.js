const express = require('express');
const { supabase } = require('../utils/supabase');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/blacklist
 * 取得黑名單清單（需登入）
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blacklist')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ blacklist: data });
  } catch (err) {
    console.error('[Blacklist] 查詢失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * POST /api/blacklist
 * 新增黑名單（需登入）
 * body: { line_user_id, reason }
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const line_user_id = req.body.line_user_id?.trim();
    const reason = req.body.reason?.trim() || null;

    if (!line_user_id) {
      return res.status(400).json({ error: 'line_user_id 為必填' });
    }

    // 重複檢查
    const { count } = await supabase
      .from('blacklist')
      .select('id', { count: 'exact', head: true })
      .eq('line_user_id', line_user_id);

    if (count > 0) {
      return res.status(409).json({ error: '此 LINE ID 已在黑名單中' });
    }

    const { data, error } = await supabase
      .from('blacklist')
      .insert([{ line_user_id, reason }])
      .select()
      .single();

    if (error) throw error;

    console.log(`[Blacklist] 新增黑名單: ${line_user_id}，原因: ${reason || '未填'}`);
    res.json({ success: true, entry: data });
  } catch (err) {
    console.error('[Blacklist] 新增失敗:', err.message);
    res.status(500).json({ error: '新增失敗' });
  }
});

/**
 * DELETE /api/blacklist/:id
 * 移除黑名單（需登入）
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('blacklist').delete().eq('id', id);
    if (error) throw error;
    console.log(`[Blacklist] 移除黑名單 id=${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Blacklist] 刪除失敗:', err.message);
    res.status(500).json({ error: '刪除失敗' });
  }
});

module.exports = router;
