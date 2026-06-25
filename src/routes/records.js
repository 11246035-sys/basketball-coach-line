const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../utils/supabase');
const { pushMessage, newRecordFlex } = require('../utils/line');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

// 統一處理照片與影片的 multer（50MB 上限涵蓋影片）
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 8
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photos' && file.mimetype.startsWith('image/')) return cb(null, true);
    if (file.fieldname === 'videos' && ALLOWED_VIDEO_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('不支援的檔案格式（照片請用 jpg/png，影片請用 mp4/mov/webm）'), false);
  }
});

const mediaFields = uploadMedia.fields([
  { name: 'photos', maxCount: 5 },
  { name: 'videos', maxCount: 3 }
]);

/**
 * GET /api/records
 * 取得課程紀錄列表（公開，LIFF 頁面使用）
 */
router.get('/', async (req, res) => {
  try {
    const { line_user_id, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('records')
      .select(`
        id, date, description, student_name, created_at,
        photos (id, url, thumbnail_url, order_index),
        videos (id, url, order_index)
      `)
      .order('date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

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
        photos (id, url, thumbnail_url, order_index),
        videos (id, url, order_index)
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
 * 新增課程紀錄 + 上傳照片/影片（需登入）
 */
router.post('/', requireAdmin, (req, res, next) => {
  mediaFields(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '影片檔案過大，單支限制 50MB' });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { date, description, student_name, notify } = req.body;
    let line_user_id = req.body.line_user_id?.trim() || null;

    if (!date || !student_name) {
      return res.status(400).json({ error: '日期與學生姓名為必填' });
    }

    if (!line_user_id && student_name) {
      const { data: student } = await supabase.from('students')
        .select('line_user_id').eq('name', student_name.trim()).maybeSingle();
      if (student?.line_user_id) line_user_id = student.line_user_id;
    }

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

    // 上傳照片
    const photoFiles = req.files?.photos || [];
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];
      const ext = file.originalname.split('.').pop().toLowerCase();
      const fileName = `records/${record.id}/${uuidv4()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('course-photos')
        .upload(fileName, file.buffer, { contentType: file.mimetype, cacheControl: '3600' });

      if (storageError) {
        console.error('[Records] 圖片上傳失敗:', storageError.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from('course-photos').getPublicUrl(fileName);
      const photoUrl = urlData.publicUrl;
      if (i === 0) firstPhotoUrl = photoUrl;

      const { data: photoRecord } = await supabase
        .from('photos')
        .insert([{ record_id: record.id, url: photoUrl, thumbnail_url: photoUrl, order_index: i }])
        .select().single();

      if (photoRecord) uploadedPhotos.push(photoRecord);
    }

    const uploadedVideos = [];

    // 上傳影片
    const videoFiles = req.files?.videos || [];
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const ext = file.originalname.split('.').pop().toLowerCase() || 'mp4';
      const fileName = `videos/${record.id}/${uuidv4()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('course-photos')
        .upload(fileName, file.buffer, { contentType: file.mimetype, cacheControl: '3600' });

      if (storageError) {
        console.error('[Records] 影片上傳失敗:', storageError.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from('course-photos').getPublicUrl(fileName);
      const videoUrl = urlData.publicUrl;

      const { data: videoRecord } = await supabase
        .from('videos')
        .insert([{ record_id: record.id, url: videoUrl, order_index: i }])
        .select().single();

      if (videoRecord) uploadedVideos.push(videoRecord);
    }

    console.log(`[Records] 新課程紀錄: ${student_name}，日期: ${date}，照片: ${uploadedPhotos.length}，影片: ${uploadedVideos.length}`);

    if (notify !== 'false' && line_user_id) {
      await pushMessage(line_user_id, newRecordFlex({ ...record, student_name }, firstPhotoUrl))
        .catch(err => console.error('[Records] 發送紀錄通知失敗:', err.message));
    }

    res.json({ success: true, record: { ...record, photos: uploadedPhotos, videos: uploadedVideos } });
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

    // 查詢照片與影片路徑，一起從 Storage 刪除
    const [{ data: photos }, { data: videos }] = await Promise.all([
      supabase.from('photos').select('url').eq('record_id', id),
      supabase.from('videos').select('url').eq('record_id', id)
    ]);

    const extractPath = (url, bucketName) => {
      try {
        const u = new URL(url);
        return u.pathname.split(`/${bucketName}/`)[1];
      } catch { return null; }
    };

    const photoPaths = (photos || []).map(p => extractPath(p.url, 'course-photos')).filter(Boolean);
    const videoPaths = (videos || []).map(v => extractPath(v.url, 'course-photos')).filter(Boolean);
    const allPaths = [...photoPaths, ...videoPaths];

    if (allPaths.length > 0) {
      await supabase.storage.from('course-photos').remove(allPaths);
    }

    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('[Records] 刪除失敗:', err.message);
    res.status(500).json({ error: '刪除失敗' });
  }
});

module.exports = router;
