-- ====================================================================
-- AKSARA BACKEND DATABASE MIGRATION SCRIPT
-- Script ini aman dijalankan di Supabase SQL Editor (Tidak menghapus data lama)
-- ====================================================================

-- 1. TABEL PENGGUNA (Profil Mahasiswa & Minat Akademik)
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS nama TEXT;
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS nim TEXT;
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS prodi TEXT;
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS angkatan INTEGER;
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS kode_kelas TEXT;
ALTER TABLE IF EXISTS pengguna ADD COLUMN IF NOT EXISTS minat TEXT[] DEFAULT '{}';

-- 2. TABEL REPORT (Status Laporan, Catatan Admin, & Tanggal)
ALTER TABLE IF EXISTS report ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'baru';
ALTER TABLE IF EXISTS report ADD COLUMN IF NOT EXISTS catatan_admin TEXT;
ALTER TABLE IF EXISTS report ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3. TABEL RESOURCE (Statistik, Alasan Penolakan, & Format File)
ALTER TABLE IF EXISTS resource ADD COLUMN IF NOT EXISTS alasan_penolakan TEXT;
ALTER TABLE IF EXISTS resource ADD COLUMN IF NOT EXISTS jumlah_unduhan INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS resource ADD COLUMN IF NOT EXISTS jumlah_dilihat INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS resource ADD COLUMN IF NOT EXISTS format_file TEXT;

-- 4. TABEL EXPERIENCE (Wawasan: Sub Judul, Kategori, Tags, Sampul, Tanggal, & Jumlah Dibaca)
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS sub_judul TEXT;
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS kategori TEXT;
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS sampul TEXT;
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS jumlah_dibaca INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS experience ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 5. TABEL RATING_REVIEW & BOOKMARK (Dukungan untuk Wawasan / Experience)
ALTER TABLE IF EXISTS rating_review ADD COLUMN IF NOT EXISTS experience_id UUID REFERENCES experience(experience_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS rating_review ALTER COLUMN resource_id DROP NOT NULL;

ALTER TABLE IF EXISTS bookmark ADD COLUMN IF NOT EXISTS experience_id UUID REFERENCES experience(experience_id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS bookmark ALTER COLUMN resource_id DROP NOT NULL;

-- 6. INDEKS UNTUK OPTIMASI PERFORMA QUERY
CREATE INDEX IF NOT EXISTS idx_pengguna_nim ON pengguna(nim);
CREATE INDEX IF NOT EXISTS idx_resource_status ON resource(status);
CREATE INDEX IF NOT EXISTS idx_report_status ON report(status);
CREATE INDEX IF NOT EXISTS idx_experience_status ON experience(status);
CREATE INDEX IF NOT EXISTS idx_rating_review_experience ON rating_review(experience_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_experience ON bookmark(experience_id);

-- ====================================================================
-- FILTER PROGRAM STUDI: HANYA SISAKAN 4 JURUSAN FAKULTAS INFORMATIKA (FIF)
-- ====================================================================
DELETE FROM program_studi 
WHERE nama_prodi NOT IN (
  'S1 Informatika', 
  'S1 Rekayasa Perangkat Lunak', 
  'S1 Data Sains', 
  'S1 Teknologi Informasi'
);

-- ====================================================================
-- PEMBERSIHAN DATA SESUAI DOKUMEN KEKURANGAN AKSARA (OPSIONAL/JIKA DIPERLUKAN)
-- ====================================================================

-- Update kategori default untuk 3 resource awal yang belum memiliki category_id:
-- UPDATE resource 
-- SET category_id = (SELECT category_id FROM kategori LIMIT 1) 
-- WHERE category_id IS NULL;

-- Hapus data uji integrasi jika ada:
-- DELETE FROM bookmark WHERE user_id IN (SELECT user_id FROM pengguna WHERE email = 'uji.aksara.109b8b@example.com');
-- DELETE FROM resource WHERE user_id IN (SELECT user_id FROM pengguna WHERE email = 'uji.aksara.109b8b@example.com');
-- DELETE FROM pengguna WHERE email = 'uji.aksara.109b8b@example.com';
