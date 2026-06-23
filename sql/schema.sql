-- ============================================================
-- 籃球家教管理系統 - Supabase 資料表結構
-- 執行順序：依下方順序貼入 Supabase SQL Editor 執行
-- ============================================================

-- 啟用 UUID 擴展（Supabase 預設已啟用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. 學生資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,                  -- 學生姓名
  line_user_id  VARCHAR(100) UNIQUE,                    -- LINE 用戶 ID（發送通知用）
  parent_name   VARCHAR(100),                           -- 家長姓名
  phone         VARCHAR(20),                            -- 聯絡電話
  notes         TEXT,                                   -- 備註（健康狀況、特殊需求等）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. 預約資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id  VARCHAR(100) NOT NULL,                  -- 家長 LINE ID
  student_name  VARCHAR(100) NOT NULL,                  -- 學生姓名（允許非已建檔學生）
  date          DATE NOT NULL,                          -- 預約日期
  session       VARCHAR(20) NOT NULL CHECK (session IN ('morning', 'afternoon', 'evening')),
  notes         TEXT,                                   -- 備註
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：加速按日期與狀態查詢
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_line_user_id ON bookings(line_user_id);

-- ============================================================
-- 3. 課程紀錄資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          DATE NOT NULL,                          -- 上課日期
  student_name  VARCHAR(100) NOT NULL,                  -- 學生姓名
  line_user_id  VARCHAR(100),                           -- 家長 LINE ID（用於推播通知）
  description   TEXT,                                   -- 課程說明與心得
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：加速按日期排序
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date DESC);
CREATE INDEX IF NOT EXISTS idx_records_line_user_id ON records(line_user_id);

-- ============================================================
-- 4. 照片資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS photos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id      UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,                         -- 原始圖片 URL（Supabase Storage）
  thumbnail_url  TEXT,                                  -- 縮圖 URL（可與 url 相同）
  order_index    INTEGER NOT NULL DEFAULT 0,            -- 照片排列順序
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：加速按 record_id 查詢
CREATE INDEX IF NOT EXISTS idx_photos_record_id ON photos(record_id);

-- ============================================================
-- 5. 自動更新 updated_at 的觸發器
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 套用至 students 表
DROP TRIGGER IF EXISTS set_updated_at_students ON students;
CREATE TRIGGER set_updated_at_students
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 套用至 bookings 表
DROP TRIGGER IF EXISTS set_updated_at_bookings ON bookings;
CREATE TRIGGER set_updated_at_bookings
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 套用至 records 表
DROP TRIGGER IF EXISTS set_updated_at_records ON records;
CREATE TRIGGER set_updated_at_records
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 6. Row Level Security (RLS) 設定
-- 後端使用 Service Role Key，不受 RLS 限制
-- 前端 LIFF 使用 Anon Key，只能讀取公開資料
-- ============================================================

-- 啟用 RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- 允許已認證的 Service Role 完整存取（後端）
-- Service Role 預設繞過 RLS，無需額外設定

-- 允許匿名讀取課程紀錄和照片（LIFF 公開頁面）
DROP POLICY IF EXISTS "公開讀取課程紀錄" ON records;
CREATE POLICY "公開讀取課程紀錄" ON records
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "公開讀取照片" ON photos;
CREATE POLICY "公開讀取照片" ON photos
  FOR SELECT TO anon USING (true);

-- 允許匿名新增預約（LIFF 預約表單）
DROP POLICY IF EXISTS "允許匿名新增預約" ON bookings;
CREATE POLICY "允許匿名新增預約" ON bookings
  FOR INSERT TO anon WITH CHECK (true);

-- 允許讀取預約
DROP POLICY IF EXISTS "讀取自己的預約" ON bookings;
CREATE POLICY "讀取自己的預約" ON bookings
  FOR SELECT TO anon USING (true);

-- ============================================================
-- 7. Supabase Storage Bucket 設定
-- 請在 Supabase Dashboard > Storage 手動建立，或執行以下 SQL
-- ============================================================

-- 建立 course-photos bucket（公開讀取）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-photos',
  'course-photos',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 允許公開讀取照片
DROP POLICY IF EXISTS "公開讀取Storage照片" ON storage.objects;
CREATE POLICY "公開讀取Storage照片" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'course-photos');

-- 只允許 Service Role 上傳與刪除（後台）
DROP POLICY IF EXISTS "允許後台上傳照片" ON storage.objects;
CREATE POLICY "允許後台上傳照片" ON storage.objects
  FOR INSERT TO authenticated USING (bucket_id = 'course-photos');

DROP POLICY IF EXISTS "允許後台刪除照片" ON storage.objects;
CREATE POLICY "允許後台刪除照片" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'course-photos');
