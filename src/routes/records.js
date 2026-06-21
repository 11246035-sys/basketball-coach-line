const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../utils/supabase');
const { pushMessage, newRecordFlex } = require('../utils/line');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Multer 設定：存放在記憶體中，再上傳到 Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 最大 10MB
    files: 5 // 最多 5 張照片
  },
  fileFilter: (req, file, cb) => {
    // 只接受圖片
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只能上傳圖片檔案'), false);
    }
  }
});

/**
 * GET /api/records
 * 取得課程紀錄列表（公開，LIFF 頁面使用）
 * 可帶 line_user_id 查詢特定學生的紀錄
 */
router.get('/', async (req, res) => {
  try {
    const { line_user_id, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('records')
      .select(`
        id, date, description, student_name, created_at,
        photos (id, url, thumbnail_url, order_index)
      `)
      .order('date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // 如果帶了 line_user_id，只查詢該用戶相關紀錄
    if (line_user_id) {
      query = query.eq('line_user_id', line_user_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ records: data });
  } catch (err) {
    console.error('[Records] 查詢失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * GET /api/records/:id
 * 取得單筆課程紀錄詳情
 */
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('records')
      .select(`
        *,
        photos (id, url, thumbnail_url, order_index)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '找不到此紀錄' });

    res.json({ record: data });
  } catch (err) {
    console.error('[Records] 查詢詳情失敗:', err.message);
    res.status(500).json({ error: '查詢失敗' });
  }
});

/**
 * POST /api/records
 * 新增課程紀錄 + 上傳照片（需登入）
 */
router.post('/', requireAdmin, upload.array('photos', 5), async (req, res) => {
  try {
    const { date, description, student_name, line_user_id, notify } = req.body;

    if (!date || !student_name) {
      return res.status(400).json({ error: '日期與學生姓名為必填' });
    }

    // 建立課程紀錄
    const { data: record, error: recordError } = await supabase
      .from('records')
      .insert([{
        date,
        description: description || null,
        student_name,
        line_user_id: line_user_id || null
      }])
      .select()
      .single();

    if (recordError) throw recordError;

    const uploadedPhotos = [];
    let firstPhotoUrl = null;

    // 上傳照片到 Supabase Storage
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const fileName = `records/${record.id}/${uuidv4()}.${file.originalname.split('.').pop()}`;

        const { data: storageData, error: storageError } = await supabase.storage
          .from('course-photos')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '3600'
          });

        if (storageError) {
          console.error('[Records] 圖片上傳失敗:', storageError.message);
          continue;
        }

        // 取得公開 URL
        const { data: urlData } = supabase.storage
          .from('course-photos')
          .getPublicUrl(fileName);

        const photoUrl = urlData.publicUrl;
        if (i === 0) firstPhotoUrl = photoUrl;

        // 寫入 photos 資料表
        const { data: photoRecord } = await supabase
          .from('photos')
          .insert([{
            record_id: record.id,
            url: photoUrl,
            thumbnail_url: photoUrl, // 可日後加縮圖處理
            order_index: i
          }])
          .select()
          .single();

        if (photoRecord) uploadedPhotos.push(photoRecord);
      }
    }

    console.log(`[Records] 新課程紀錄: ${student_name}，日期: ${date}，照片數: ${uploadedPhotos.length}`);

    // 發送 LINE 推播通知給家長
    if (notify !== 'false' && line_user_id) {
      await pushMessage(line_user_id, newRecordFlex({ ...record, student_name }, firstPhotoUrl))
        .catch(err => console.error('[Records] 發送紀錄通知失敗:', err.message));
    }

    res.json({ success: true, record: { ...record, photos: uploadedPhotos } });
  } catch (err) {
    console.error('[Records] 新增失敗:', err.message);
    res.status(500).json({ error: '新增失敗' });
  }
});

/**
 * DELETE /api/records/:id
 * 刪除課程紀錄（需登入）
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 先查詢要刪除的照片路徑
    const { data: photos } = await supabase
      .from('photos')
      .select('url')
      .eq('record_id', id);

    // 從 Storage 刪除照片
    if (photos && photos.length > 0) {
      const paths = photos.map(p => {
        const url = new URL(p.url);
        // 取出 Storage 路徑（去掉 bucket 名稱前的部分）
        return url.pathname.split('/course-photos/')[1];
      }).filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from('course-photos').remove(paths);
      }
    }

    // 刪除紀錄（photos 會因為 CASCADE 一起刪除）
    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('[Records] 刪除失敗:', err.message);
    res.status(500).json({ error: '刪除失敗' });
  }
});

module.exports = router;
