const express = require('express');
const { supabase } = require('../utils/supabase');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/students
 * 取得學生清單（需登入）
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ students: data });
  } catch (err) {
    console.error('[Students] 查詢失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * POST /api/students
 * 新增學生（需登入）
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, line_user_id, parent_name, phone, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: '學生姓名為必填' });
    }

    const { data, error } = await supabase
      .from('students')
      .insert([{ name, line_user_id: line_user_id || null, parent_name: parent_name || null, phone: phone || null, notes: notes || null }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: '此 LINE ID 已綁定其他學生' });
      }
      throw error;
    }

    res.json({ success: true, student: data });
  } catch (err) {
    console.error('[Students] 新增失敗:', err.message);
    res.status(500).json({ error: '新增失敗' });
  }
});

/**
 * PATCH /api/students/:id
 * 更新學生資料（需登入）
 */
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, line_user_id, parent_name, phone, notes } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (line_user_id !== undefined) updates.line_user_id = line_user_id;
    if (parent_name !== undefined) updates.parent_name = parent_name;
    if (phone !== undefined) updates.phone = phone;
    if (notes !== undefined) updates.notes = notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '找不到此學生' });

    res.json({ success: true, student: data });
  } catch (err) {
    console.error('[Students] 更新失敗:', err.message);
    res.status(500).json({ error: '更新失敗' });
  }
});

/**
 * DELETE /api/students/:id
 * 刪除學生（需登入）
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[Students] 刪除失敗:', err.message);
    res.status(500).json({ error: '刪除失敗' });
  }
});

module.exports = router;
