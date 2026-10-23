import 'dotenv/config';
import express from 'express';

// mengambil fungsi createClient (paten yaa) dari supabasenya ini menjembatani antara express dengan supabase
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import authMiddleware from './middleware/authmiddleware.js';
import roleMiddleware from './middleware/roleMiddleware.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger.js';
const app = express();
const PORT = process.env.PORT || 3000;
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// agar server bisa membaca data berformat JSON dari client
app.use(express.json())
app.use(cors());

// (Endpoint GET )

/**
 * @swagger
 * /:
 *   get:
 *     summary: Memeriksa endpoint utama server
 *     description: Mengembalikan pesan awal dari backend.
 *     tags:
 *       - General
 *     responses:
 *       200:
 *         description: Server merespons permintaan
 */

app.get('/', (req, res) => {
    res.send('Halo! Back-end Telkom Share sudah aktif!');

});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // Maksimal 10 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak diizinkan.'));
    }
  }
});

// mengambil fungsi createClient (paten yaa) dari supabasenya ini menjembatani antara express dengan supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// memanggil fungsi keduanya
const supabase = createClient(supabaseUrl, supabaseKey)
const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});


/**
 * @swagger
 * /register:
 *   post:
 *     summary: Registrasi pengguna
 *     description: Mendaftarkan pengguna melalui Supabase Auth dan menyimpan data profil lengkap (nama, nim, prodi, angkatan, kode kelas, minat) dengan role mahasiswa.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: mahasiswa@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *               nama:
 *                 type: string
 *                 example: Neila Ezry
 *               nim:
 *                 type: string
 *                 example: 1301213000
 *               prodi:
 *                 type: string
 *                 example: S1 Informatika
 *               angkatan:
 *                 type: integer
 *                 example: 2025
 *               kelas:
 *                 type: string
 *                 example: "03"
 *               kode_kelas:
 *                 type: string
 *                 example: IF-49-03
 *               minat:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Software Engineering", "Web Development"]
 *     responses:
 *       201:
 *         description: Registrasi berhasil
 *       400:
 *         description: Registrasi gagal
 *       500:
 *         description: Terjadi kesalahan saat menyimpan data pengguna atau pada server
 */


app.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      nama, 
      nim, 
      prodi, 
      angkatan, 
      kelas, 
      kode_kelas: custom_kode_kelas, 
      minat 
    } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    // 1. Tentukan kode program studi (IF, TI, RPL, DS)
    let prodiCode = 'IF';
    const prodiStr = String(prodi || '').toLowerCase();
    if (prodiStr.includes('rekayasa') || prodiStr.includes('rpl')) {
      prodiCode = 'RPL';
    } else if (prodiStr.includes('teknologi informasi') || prodiStr.includes('ti')) {
      prodiCode = 'TI';
    } else if (prodiStr.includes('data') || prodiStr.includes('ds')) {
      prodiCode = 'DS';
    } else if (prodiStr.includes('informatika') || prodiStr.includes('if')) {
      prodiCode = 'IF';
    }

    // 2. Tentukan kode angkatan (rumus: tahun - 1976, e.g. 2024 -> 48, 2025 -> 49, 2026 -> 50)
    let angkatanCode = '';
    const tahunNum = parseInt(angkatan, 10);
    if (!isNaN(tahunNum) && tahunNum >= 1976) {
      angkatanCode = String(tahunNum - 1976);
    } else if (angkatan) {
      angkatanCode = String(angkatan).slice(-2);
    }

    // 3. Tentukan nomor kelas 2 digit (misal 3 -> 03)
    let nomorKelas = '';
    if (kelas !== undefined && kelas !== null && kelas !== '') {
      nomorKelas = String(kelas).trim();
      if (/^\d+$/.test(nomorKelas)) {
        nomorKelas = nomorKelas.padStart(2, '0');
      }
    }

    // 4. Susun kode kelas format standar (contoh: IF-49-03)
    let finalKodeKelas = custom_kode_kelas || '';
    if (!finalKodeKelas && prodiCode && angkatanCode && nomorKelas) {
      finalKodeKelas = `${prodiCode}-${angkatanCode}-${nomorKelas}`;
    } else if (!finalKodeKelas && nomorKelas) {
      finalKodeKelas = nomorKelas;
    }

    // 5. Normalisasi minat akademik menjadi array
    let minatArray = [];
    if (Array.isArray(minat)) {
      minatArray = minat;
    } else if (typeof minat === 'string' && minat.trim() !== '') {
      minatArray = minat.split(',').map(m => m.trim()).filter(Boolean);
    }

    // 6. Siapkan data lengkap pengguna
    const userData = {
      user_id: data.user.id,
      email: email,
      role: 'mahasiswa',
      nama: nama || null,
      nim: nim || null,
      prodi: prodi || null,
      angkatan: tahunNum || null,
      kode_kelas: finalKodeKelas || null,
      minat: minatArray
    };

    // Simpan data user ke tabel pengguna
    const { error: penggunaError } = await supabaseAdmin
      .from('pengguna')
      .insert([userData]);

    if (penggunaError) {
      console.error('Error saat menyimpan profil pengguna:', penggunaError);

      return res.status(500).json({
        error: penggunaError.message
      });
    }

    res.status(201).json({
      message: "Registrasi berhasil!",
      data: {
        ...data,
        profile: userData
      }
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});


/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login pengguna
 *     description: Memverifikasi email dan password pengguna melalui Supabase Auth serta mengembalikan data profil dan peran (role) lengkap.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: mahasiswa@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login berhasil beserta data profil
 *       401:
 *         description: Email atau password gagal diverifikasi
 *       500:
 *         description: Terjadi kesalahan pada server
 */


app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        error: error.message
      });
    }

    // Ambil data profil dari tabel pengguna
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('pengguna')
      .select('*')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Gagal mengambil profil saat login:', profileError.message);
    }

    res.status(200).json({
      message: "Login berhasil!",
      data: {
        ...data,
        profile: profile || null
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});


/**
 * @swagger
 * /me:
 *   get:
 *     summary: Mengambil profil pengguna yang sedang login
 *     description: Mengembalikan data profil lengkap pengguna yang sedang aktif berdasarkan Bearer token.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profil berhasil diambil
 *       401:
 *         description: Token tidak valid atau belum login
 *       500:
 *         description: Terjadi kesalahan server
 */
app.get('/me', authMiddleware, async (req, res) => {
  try {
    return res.status(200).json({
      message: 'Profil pengguna berhasil diambil',
      data: req.user
    });
  } catch (err) {
    console.error('Gagal mengambil data /me:', err);
    return res.status(500).json({
      error: err.message
    });
  }
});


/**
 * @swagger
 * /admin/report:
 *   get:
 *     summary: Mengambil daftar laporan
 *     description: Mengambil seluruh data laporan beserta status, catatan admin, tanggal laporan, dan data pelapor. Hanya admin yang dapat mengakses endpoint ini.
 *     tags:
 *       - Admin - Report
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Data report berhasil diambil
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       500:
 *         description: Gagal mengambil data report
 */

app.get(
  '/admin/report',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('report')
        .select(`
          report_id,
          alasan,
          status,
          catatan_admin,
          created_at,
          user_id,
          pengguna:user_id (
            nama,
            nim,
            prodi,
            email
          ),
          resource_id,
          experience_id
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({
        message: 'Data report berhasil diambil!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Gagal mengambil data report'
      });
    }
  }
);


/**
 * @swagger
 * /admin/report/{id}:
 *   get:
 *     summary: Mengambil detail laporan
 *     description: Mengambil detail laporan beserta data pelapor dan resource atau experience yang dilaporkan.
 *     tags:
 *       - Admin - Report
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID laporan yang ingin dilihat
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail laporan berhasil diambil
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       404:
 *         description: Laporan tidak ditemukan
 *       500:
 *         description: Gagal mengambil detail laporan
 */

app.get(
  '/admin/report/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data: report, error } = await supabaseAdmin
        .from('report')
        .select(`
          report_id,
          alasan,
          status,
          catatan_admin,
          created_at,
          user_id,
          pengguna:user_id (
            nama,
            nim,
            prodi,
            email
          ),
          resource_id,
          experience_id
        `)
        .eq('report_id', id)
        .maybeSingle();

      if (error) throw error;

      if (!report) {
        return res.status(404).json({
          error: 'Laporan tidak ditemukan'
        });
      }

      let kontenDilaporkan = null;

      if (report.resource_id) {
        const { data, error } = await supabaseAdmin
          .from('resource')
          .select(`
            resource_id, 
            judul, 
            deskripsi, 
            sumber, 
            status, 
            created_at,
            format_file,
            pengguna:user_id (
              nama,
              nim,
              prodi,
              email
            )
          `)
          .eq('resource_id', report.resource_id)
          .maybeSingle();

        if (error) throw error;
        kontenDilaporkan = data;
      } else if (report.experience_id) {
        const { data, error } = await supabaseAdmin
          .from('experience')
          .select(`
            experience_id, 
            judul, 
            sub_judul,
            konten, 
            status,
            created_at,
            sampul,
            pengguna:user_id (
              nama,
              nim,
              prodi,
              email
            )
          `)
          .eq('experience_id', report.experience_id)
          .maybeSingle();

        if (error) throw error;
        kontenDilaporkan = data;
      }

      return res.status(200).json({
        message: 'Detail laporan berhasil diambil!',
        data: {
          ...report,
          konten_dilaporkan: kontenDilaporkan
        }
      });

    } catch (err) {
      console.error('Gagal mengambil detail laporan:', err);

      return res.status(500).json({
        error: 'Gagal mengambil detail laporan'
      });
    }
  }
);


/**
 * @swagger
 * /admin/report/{id}/status:
 *   put:
 *     summary: Memperbarui status laporan
 *     description: Mengubah status laporan menjadi baru, ditinjau, atau selesai dan menambahkan catatan admin.
 *     tags:
 *       - Admin - Report
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID laporan yang akan diperbarui
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [baru, ditinjau, selesai]
 *                 example: selesai
 *               catatan_admin:
 *                 type: string
 *                 example: Laporan telah ditindaklanjuti dan konten bermasalah telah dihapus.
 *     responses:
 *       200:
 *         description: Status laporan berhasil diperbarui
 *       400:
 *         description: Status tidak valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Bukan admin
 *       500:
 *         description: Terjadi kesalahan server
 */
app.put(
  '/admin/report/:id/status',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, catatan_admin } = req.body;

      if (!status) {
        return res.status(400).json({
          error: 'Status wajib diisi'
        });
      }

      const statusAllowed = ['baru', 'ditinjau', 'selesai'];
      if (!statusAllowed.includes(status)) {
        return res.status(400).json({
          error: 'Status harus bernilai baru, ditinjau, atau selesai'
        });
      }

      const updatePayload = { status };
      if (catatan_admin !== undefined) {
        updatePayload.catatan_admin = catatan_admin;
      }

      const { data, error } = await supabaseAdmin
        .from('report')
        .update(updatePayload)
        .eq('report_id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        message: 'Status laporan berhasil diperbarui!',
        data
      });
    } catch (err) {
      console.error('Gagal memperbarui status laporan:', err);
      return res.status(500).json({
        error: 'Gagal memperbarui status laporan'
      });
    }
  }
);


/**
 * @swagger
 * /admin/experience:
 *   get:
 *     summary: Mengambil daftar experience
 *     description: Mengambil daftar experience beserta judul, konten, status, dan pemiliknya. Hanya admin yang dapat mengakses endpoint ini.
 *     tags:
 *       - Admin - Experience
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Data experience berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Data experience berhasil diambil!
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       experience_id:
 *                         type: string
 *                       judul:
 *                         type: string
 *                       konten:
 *                         type: string
 *                       status:
 *                         type: string
 *                       user_id:
 *                         type: string
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       500:
 *         description: Gagal mengambil data experience
 */

app.get(
  '/admin/experience',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('experience')
        .select(`
          experience_id,
          judul,
          sub_judul,
          konten,
          kategori,
          tags,
          sampul,
          jumlah_dibaca,
          status,
          created_at,
          user_id,
          pengguna:user_id (
            nama,
            nim,
            prodi,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.status(200).json({
        message: 'Data experience berhasil diambil!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Gagal mengambil data experience'
      });
    }
  }
);


/**
 * @swagger
 * /admin/experience/{id}/status:
 *   put:
 *     summary: Memperbarui status experience
 *     description: Mengubah status experience menjadi approved atau rejected. Hanya admin yang dapat mengakses endpoint ini.
 *     tags:
 *       - Admin - Experience
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID experience yang statusnya akan diubah
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum:
 *                   - approved
 *                   - rejected
 *                 example: approved
 *     responses:
 *       200:
 *         description: Status experience berhasil diperbarui
 *       400:
 *         description: Status wajib diisi atau nilainya tidak valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       500:
 *         description: Gagal memperbarui status experience
 */


app.put(
  '/admin/experience/:id/status',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          error: 'Status wajib diisi'
        });
      }

      const statusAllowed = ['approved', 'rejected'];

      if (!statusAllowed.includes(status)) {
        return res.status(400).json({
          error: 'Status harus approved atau rejected'
        });
      }

      const { data, error } = await supabaseAdmin
        .from('experience')
        .update({ status })
        .eq('experience_id', id)
        .select()
        .single();

      if (error) throw error;

      res.status(200).json({
        message: 'Status experience berhasil diperbarui!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Gagal memperbarui status experience'
      });
    }
  }
);


/**
 * @swagger
 * /admin/resource/{id}/status:
 *   put:
 *     summary: Memperbarui status resource
 *     description: Mengubah status resource menjadi approved, rejected, atau hidden. Jika rejected, admin dapat menyertakan alasan_penolakan. Hanya admin yang dapat mengakses endpoint ini.
 *     tags:
 *       - Admin - Resource
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID resource yang statusnya akan diubah
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum:
 *                   - approved
 *                   - rejected
 *                   - hidden
 *                 example: rejected
 *               alasan_penolakan:
 *                 type: string
 *                 example: File tidak terbaca atau melanggar hak cipta
 *     responses:
 *       200:
 *         description: Status resource berhasil diperbarui
 *       400:
 *         description: Status wajib diisi atau nilainya tidak valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       500:
 *         description: Gagal memperbarui status resource
 */


/* ADMIN - UPDATE STATUS RESOURCE */
app.put(
  '/admin/resource/:id/status',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, alasan_penolakan } = req.body;

      if (!status) {
        return res.status(400).json({
          error: 'Status wajib diisi'
        });
      }

      const statusAllowed = ['approved', 'rejected', 'hidden'];

      if (!statusAllowed.includes(status)) {
        return res.status(400).json({
          error: 'Status harus approved, rejected, atau hidden'
        });
      }

      const updateData = { status };
      if (alasan_penolakan !== undefined) {
        updateData.alasan_penolakan = alasan_penolakan;
      }

      const { data, error } = await supabaseAdmin
        .from('resource')
        .update(updateData)
        .eq('resource_id', id)
        .select()
        .single();

      if (error) throw error;

      res.status(200).json({
        message: 'Status resource berhasil diperbarui!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Gagal memperbarui status resource'
      });
    }
  }
);


/**
 * @swagger
 * /admin/resource/{id}:
 *   delete:
 *     summary: Menghapus resource oleh admin
 *     description: Menghapus resource yang melanggar (plagiasi/hak cipta) secara permanen beserta seluruh bookmark, ulasan, laporan terkait, dan file fisik di storage. Hanya admin yang dapat mengakses endpoint ini.
 *     tags:
 *       - Admin - Resource
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID resource yang akan dihapus
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Resource dan data terkait berhasil dihapus
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki role admin
 *       404:
 *         description: Resource tidak ditemukan
 *       500:
 *         description: Gagal menghapus resource
 */
app.delete(
  '/admin/resource/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // 1. Ambil info resource terlebih dahulu (terutama link_file)
      const { data: resource, error: getErr } = await supabaseAdmin
        .from('resource')
        .select('resource_id, link_file')
        .eq('resource_id', id)
        .maybeSingle();

      if (getErr) throw getErr;

      if (!resource) {
        return res.status(404).json({
          error: 'Resource tidak ditemukan'
        });
      }

      // 2. Bersihkan bookmark terkait
      await supabaseAdmin
        .from('bookmark')
        .delete()
        .eq('resource_id', id);

      // 3. Bersihkan ulasan / rating terkait
      await supabaseAdmin
        .from('rating_review')
        .delete()
        .eq('resource_id', id);

      // 4. Bersihkan laporan terkait
      await supabaseAdmin
        .from('report')
        .delete()
        .eq('resource_id', id);

      // 5. Hapus file fisik dari storage jika ada
      if (resource.link_file) {
        try {
          await supabaseAdmin
            .storage
            .from('materi-files')
            .remove([resource.link_file]);
        } catch (storageErr) {
          console.warn('File fisik di storage gagal dihapus:', storageErr.message);
        }
      }

      // 6. Hapus resource utama dari database
      const { error: deleteErr } = await supabaseAdmin
        .from('resource')
        .delete()
        .eq('resource_id', id);

      if (deleteErr) throw deleteErr;

      return res.status(200).json({
        message: 'Resource dan seluruh data terkait berhasil dihapus oleh admin'
      });

    } catch (err) {
      console.error('Gagal menghapus resource oleh admin:', err);
      return res.status(500).json({
        error: 'Terjadi kesalahan saat menghapus resource'
      });
    }
  }
);


/**
 * @swagger
 * /test-mahasiswa:
 *   get:
 *     summary: Menguji autentikasi dan akses mahasiswa
 *     description: Endpoint pengujian middleware autentikasi dan role mahasiswa.
 *     tags:
 *       - Testing
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Autentikasi dan role mahasiswa valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna bukan mahasiswa
 */


app.get(
  '/test-mahasiswa',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  (req, res) => {
    res.status(200).json({
      message: 'Akses mahasiswa berhasil!',
      user: req.user
    });
  }
);

/**
 * @swagger
 * /resource:
 *   post:
 *     summary: Upload resource pembelajaran
 *     description: >
 *       Mahasiswa mengunggah resource pembelajaran.
 *       Resource yang berhasil diunggah akan memiliki status pending
 *       dan menunggu moderasi admin. File maksimal 10 MB.
 *     tags:
 *       - Resource
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - judul
 *               - deskripsi
 *               - sumber
 *               - file
 *             properties:
 *               judul:
 *                 type: string
 *                 description: Judul resource pembelajaran
 *                 example: Materi Sistem Operasi
 *               deskripsi:
 *                 type: string
 *                 description: Deskripsi resource pembelajaran
 *                 example: Materi pengantar sistem operasi
 *               sumber:
 *                 type: string
 *                 description: Sumber resource
 *                 example: Dosen Sistem Operasi
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: >
 *                   File PDF, DOC, DOCX, PPT, PPTX, JPEG, PNG,
 *                   atau WEBP dengan ukuran maksimal 10 MB.
 *               category_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID kategori (opsional)
 *               matkul_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID mata kuliah (opsional)
 *               semester_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID semester (opsional)
 *               prodi_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID program studi (opsional)
 *               fakultas_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID fakultas (opsional)
 *     responses:
 *       201:
 *         description: Resource berhasil diunggah dengan status pending
 *       400:
 *         description: >
 *           Input wajib belum lengkap, file tidak valid,
 *           atau referensi data tidak valid.
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Pengguna tidak memiliki hak akses mahasiswa
 *       413:
 *         description: Ukuran file melebihi batas maksimal 10 MB
 *       500:
 *         description: Terjadi kesalahan pada server
 */

// POST RESOURCE
app.post(
  '/resource',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  upload.single('file'),
  async (req, res) => {
    try {
      const {
        judul,
        deskripsi,
        sumber,
        category_id,
        matkul_id,
        semester_id,
        prodi_id,
        fakultas_id
      } = req.body;

      // 1. Validasi data wajib
      if (!judul || !deskripsi || !sumber) {
        return res.status(400).json({
          error: 'Judul, deskripsi, dan sumber wajib diisi'
        });
      }

      // 2. File wajib ada
      if (!req.file) {
        return res.status(400).json({
          error: 'File resource wajib di-upload'
        });
      }

      // 3. Ambil user_id dari user yang sedang login
      const user_id = req.user.user_id;

      // 4. Siapkan file
      let fileBuffer = req.file.buffer;
      const originalName = req.file.originalname;
      let contentType = req.file.mimetype;

      let fileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;

      // 5. Kalau gambar, kompres
      
if (contentType && contentType.startsWith('image/')) {
  try {
    fileBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({
        width: 1200,
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80,
        mozjpeg: true
      })
      .toBuffer();

    // Hasil kompresi selalu berformat JPEG
    contentType = 'image/jpeg';

    // Ganti ekstensi file menjadi .jpg
    const safeName = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/\s+/g, '_');

    fileName = `${Date.now()}-${safeName}.jpg`;

    console.log('Gambar berhasil dikompres menjadi JPEG.');
  } catch (sharpErr) {
    console.error('Gagal kompres gambar:', sharpErr.message);

    return res.status(400).json({
      error: 'Gambar tidak dapat diproses. Periksa file yang diunggah.'
    });
  }
}

      // 6. Upload file ke Supabase Storage
      const { error: storageError } = await supabaseAdmin
        .storage
        .from('materi-files')
        .upload(`resource/${fileName}`, fileBuffer, {
          contentType,
          upsert: false
        });

      if (storageError) {
        throw storageError;
      }

      // 7. Ambil URL file dan deteksi format file
      const link_file = `resource/${fileName}`;
      let format_file = 'OTHER';
      if (originalName) {
        const ext = originalName.split('.').pop().toUpperCase();
        if (['PDF', 'DOCX', 'DOC', 'PPTX', 'PPT', 'XLSX', 'XLS', 'ZIP', 'RAR', 'PNG', 'JPG', 'JPEG'].includes(ext)) {
          format_file = ext;
        }
      }

      // 8. Simpan data resource ke database
      const { data, error: dbError } = await supabaseAdmin
        .from('resource')
        .insert([
          {
            judul,
            deskripsi,
            sumber,
            link_file,
            format_file,
            jumlah_unduhan: 0,
            jumlah_dilihat: 0,
            status: 'pending',
            user_id,
            category_id,
            matkul_id: matkul_id || null,
            semester_id: semester_id || null,
            prodi_id: prodi_id || null,
            fakultas_id: fakultas_id || null
          }
        ])
        .select();

      
if (dbError) {
  // Hapus file jika penyimpanan data resource gagal
  const { error: deleteError } = await supabaseAdmin
    .storage
    .from('materi-files')
    .remove([`resource/${fileName}`]);

  if (deleteError) {
    console.error(
      'Gagal menghapus file dari Storage:',
      deleteError.message
    );
  }

  throw dbError;
}


      // 9. Response
      res.status(201).json({
        message: 'Resource berhasil di-upload!',
        data
      });

    
} catch (err) {
  console.error('Gagal membuat resource:', err.message);

  // Error foreign key: ID kategori, matkul, dan lainnya tidak valid
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Kategori, mata kuliah, semester, program studi, fakultas, atau pengguna tidak valid.'
    });
  }

  return res.status(500).json({
    error: 'Terjadi kesalahan saat mengunggah resource.'
  });
}

  }
);


/**
 * @swagger
 * /kategori:
 *   get:
 *     summary: Mengambil semua kategori
 *     description: Mengambil daftar kategori dan mengurutkannya berdasarkan nama kategori secara menaik.
 *     tags:
 *       - Kategori
 *     responses:
 *       200:
 *         description: Data kategori berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Data kategori berhasil diambil!
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category_id:
 *                         type: string
 *                         format: uuid
 *                       nama_kategori:
 *                         type: string
 *       500:
 *         description: Terjadi kesalahan saat mengambil data kategori
 */


 // GET SEMUA KATEGORI
app.get('/kategori', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .select('category_id, nama_kategori')
      .order('nama_kategori', { ascending: true });

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Data kategori berhasil diambil!',
      data
    });

  } catch (err) {
    console.error('Gagal mengambil data kategori:', err.message);

    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data kategori.'
    });
  }
});


/**
 * @swagger
 * /mata-kuliah:
 *   get:
 *     summary: Mengambil semua mata kuliah
 *     description: Mengambil daftar mata kuliah dan mengurutkannya berdasarkan nama mata kuliah secara menaik.
 *     tags:
 *       - Mata Kuliah
 *     responses:
 *       200:
 *         description: Data mata kuliah berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Data mata kuliah berhasil diambil!
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       matkul_id:
 *                         type: string
 *                         format: uuid
 *                       nama_matkul:
 *                         type: string
 *                       kode_matkul:
 *                         type: string
 *                       sks:
 *                         type: integer
 *                       prodi_id:
 *                         type: string
 *                         format: uuid
 *                       semester_id:
 *                         type: string
 *                         format: uuid
 *       500:
 *         description: Terjadi kesalahan saat mengambil data mata kuliah
 */


// GET SEMUA MATA KULIAH
app.get('/mata-kuliah', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('mata_kuliah')
      .select('matkul_id, nama_matkul, kode_matkul, sks, prodi_id, semester_id')
      .order('nama_matkul', { ascending: true });

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Data mata kuliah berhasil diambil!',
      data
    });

  } catch (err) {
    console.error('Gagal mengambil data mata kuliah:', err.message);

    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data mata kuliah.'
    });
  }
});


/**
 * @swagger
 * /prodi:
 *   get:
 *     summary: Mengambil semua program studi
 *     description: Mengambil daftar program studi untuk dropdown form pendaftaran, unggah materi, dan filter eksplorasi.
 *     tags:
 *       - Master Data
 *     responses:
 *       200:
 *         description: Data program studi berhasil diambil
 *       500:
 *         description: Terjadi kesalahan server
 */
app.get('/prodi', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('program_studi')
      .select('prodi_id, nama_prodi')
      .order('nama_prodi', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      message: 'Data program studi berhasil diambil!',
      data
    });
  } catch (err) {
    console.error('Gagal mengambil data prodi:', err.message);
    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data program studi.'
    });
  }
});


/**
 * @swagger
 * /semester:
 *   get:
 *     summary: Mengambil semua semester
 *     description: Mengambil daftar semester untuk dropdown filter eksplorasi dan unggah resource.
 *     tags:
 *       - Master Data
 *     responses:
 *       200:
 *         description: Data semester berhasil diambil
 *       500:
 *         description: Terjadi kesalahan server
 */
app.get('/semester', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('semester')
      .select('semester_id, nama_semester')
      .order('nama_semester', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      message: 'Data semester berhasil diambil!',
      data
    });
  } catch (err) {
    console.error('Gagal mengambil data semester:', err.message);
    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data semester.'
    });
  }
});


/**
 * @swagger
 * /resource:
 *   get:
 *     summary: Mendapatkan daftar resource yang disetujui
 *     description: Mengambil daftar resource berstatus approved beserta nama pengunggah, format file, dan statistik unduhan/view.
 *     tags:
 *       - Resource
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar resource berhasil diambil
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       500:
 *         description: Terjadi kesalahan pada server
 */


// GET SEMUA RESOURCE
app.get('/resource',  authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        status,
        format_file,
        jumlah_unduhan,
        jumlah_dilihat,
        created_at,
        user_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        ),
        category_id,
        matkul_id,
        kategori (
            category_id,
            nama_kategori
        ),
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Data resource berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data resource.'
    });
  }
});



/**
 * @swagger
 * /resource-relevan:
 *   get:
 *     summary: Mencari dan memfilter resource relevan
 *     description: Endpoint publik untuk mencari resource yang disetujui, memfilter berdasarkan kategori, mata kuliah, semester, program studi, fakultas, format, tahun, dan rata-rata rating, serta mengurutkan dan melakukan pagination. Field link_file tidak disertakan.
 *     tags:
 *       - Resource
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Kata kunci judul atau deskripsi
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan kategori
 *       - in: query
 *         name: matkul_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan mata kuliah
 *       - in: query
 *         name: semester_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan semester
 *       - in: query
 *         name: prodi_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan program studi
 *       - in: query
 *         name: fakultas_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan fakultas
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, doc, ppt, zip]
 *         description: Filter berdasarkan format file
 *       - in: query
 *         name: tahun
 *         schema:
 *           type: integer
 *           minimum: 2000
 *           maximum: 2100
 *         description: Filter berdasarkan tahun
 *       - in: query
 *         name: rating_min
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *         description: Batas minimum rata-rata rating
 *       - in: query
 *         name: rating_max
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *         description: Batas maksimum rata-rata rating
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [terbaru, terlama, judul_asc, judul_desc]
 *           default: terbaru
 *         description: Urutan berdasarkan waktu atau judul
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Nomor halaman
 *     responses:
 *       200:
 *         description: Pencarian dan filter berhasil
 *       400:
 *         description: Parameter pencarian, filter, sorting, atau pagination tidak valid
 *       500:
 *         description: Terjadi kesalahan pada server
 */


 // GET RESOURCE RELEVAN (PUBLIK)
app.get('/resource-relevan', async (req, res) => {
  try {
    const {
      q,
      category_id,
      matkul_id,
      semester_id,
      prodi_id,
      fakultas_id,
      format,
      tahun,
      rating_min,
      rating_max,
      sort = 'terbaru',
      page: pageQuery
    } = req.query;

    const page = pageQuery === undefined ? 1 : Number(pageQuery);
    const limit = 12;

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        error: 'Nomor halaman harus berupa bilangan bulat minimal 1.'
      });
    }

    const sorting = {
      terbaru: { column: 'created_at', ascending: false },
      terlama: { column: 'created_at', ascending: true },
      judul_asc: { column: 'judul', ascending: true },
      judul_desc: { column: 'judul', ascending: false }
    };

    if (!sorting[sort]) {
      return res.status(400).json({
        error: 'Pilihan sorting tidak valid.'
      });
    }

    // Validasi pencarian
    if (q !== undefined &&
        (typeof q !== 'string' || !q.trim())) {
      return res.status(400).json({
        error: 'Kata pencarian tidak boleh kosong.'
      });
    }

    // Validasi format
    const formatYangDidukung = {
      pdf: ['pdf'],
      doc: ['doc', 'docx'],
      ppt: ['ppt', 'pptx'],
      zip: ['zip']
    };

    if (format !== undefined) {
      if (
        typeof format !== 'string' ||
        !formatYangDidukung[format.toLowerCase()]
      ) {
        return res.status(400).json({
          error: 'Format harus pdf, doc, ppt, atau zip.'
        });
      }
    }

    // Validasi tahun
    if (tahun !== undefined) {
      if (
        typeof tahun !== 'string' ||
        !/^\d{4}$/.test(tahun) ||
        Number(tahun) < 2000 ||
        Number(tahun) > 2100
      ) {
        return res.status(400).json({
          error: 'Tahun upload harus berupa tahun yang valid.'
        });
      }
    }

    // Validasi rentang rating
    const minRating =
      rating_min === undefined ? null : Number(rating_min);
    const maxRating =
      rating_max === undefined ? null : Number(rating_max);

    if (
      (rating_min !== undefined &&
        (rating_min.trim() === '' ||
          !Number.isFinite(minRating) ||
          minRating < 1 ||
          minRating > 5)) ||
      (rating_max !== undefined &&
        (rating_max.trim() === '' ||
          !Number.isFinite(maxRating) ||
          maxRating < 1 ||
          maxRating > 5)) ||
      (minRating !== null &&
        maxRating !== null &&
        minRating > maxRating)
    ) {
      return res.status(400).json({
        error: 'Rentang rating harus berada antara 1 sampai 5 dan nilai minimum tidak boleh melebihi maksimum.'
      });
    }

    // Ambil resource yang sudah disetujui
    let query = supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        created_at,
        category_id,
        matkul_id,
        semester_id,
        prodi_id,
        fakultas_id,
        link_file,
        kategori (
          category_id,
          nama_kategori
        )
      `)
      .eq('status', 'approved');

    if (category_id) query = query.eq('category_id', category_id);
    if (matkul_id) query = query.eq('matkul_id', matkul_id);
    if (semester_id) query = query.eq('semester_id', semester_id);
    if (prodi_id) query = query.eq('prodi_id', prodi_id);
    if (fakultas_id) query = query.eq('fakultas_id', fakultas_id);

    if (tahun !== undefined) {
      query = query
        .gte('created_at', `${tahun}-01-01T00:00:00.000Z`)
        .lt(
          'created_at',
          `${Number(tahun) + 1}-01-01T00:00:00.000Z`
        );
    }

    const { data: resourceData, error: resourceError } = await query;

    if (resourceError) throw resourceError;

    // Filter pencarian dan format tanpa .or() yang saling menimpa
    let resources = resourceData ?? [];

    if (q !== undefined) {
      const keyword = q.trim().toLowerCase();

      resources = resources.filter(resource =>
        `${resource.judul ?? ''} ${resource.deskripsi ?? ''}`
          .toLowerCase()
          .includes(keyword)
      );
    }

    if (format !== undefined) {
      const ekstensiYangDidukung =
        formatYangDidukung[format.toLowerCase()];

      resources = resources.filter(resource => {
        const namaFile = (resource.link_file ?? '')
          .split('?')[0]
          .toLowerCase();

        return ekstensiYangDidukung.some(ext =>
          namaFile.endsWith(`.${ext}`)
        );
      });
    }

    // Ambil data rating
    const { data: ratingData, error: ratingError } =
      await supabaseAdmin
        .from('rating_review')
        .select('resource_id, nilai_rating');

    if (ratingError) throw ratingError;

    // Hitung rata-rata rating per resource
    const rekapRating = {};

    for (const item of ratingData ?? []) {
      if (
        item.resource_id == null ||
        item.nilai_rating == null
      ) {
        continue;
      }

      if (!rekapRating[item.resource_id]) {
        rekapRating[item.resource_id] = {
          total: 0,
          jumlah: 0
        };
      }

      rekapRating[item.resource_id].total +=
        Number(item.nilai_rating);

      rekapRating[item.resource_id].jumlah += 1;
    }

    const rataRating = {};

    for (const [resourceId, nilai] of Object.entries(rekapRating)) {
      rataRating[resourceId] = nilai.total / nilai.jumlah;
    }

    // Tambahkan rata-rata rating pada resource
    resources = resources.map(resource => ({
      ...resource,
      rating_rata_rata:
        rataRating[resource.resource_id] ?? null
    }));

    // Filter berdasarkan rata-rata rating
    if (minRating !== null || maxRating !== null) {
      resources = resources.filter(resource => {
        const rating = resource.rating_rata_rata;

        if (rating === null) return false;
        if (minRating !== null && rating < minRating) return false;
        if (maxRating !== null && rating > maxRating) return false;

        return true;
      });
    }

    // Sorting
    const { column, ascending } = sorting[sort];

    resources.sort((a, b) => {
      let hasil;

      if (column === 'judul') {
        hasil = (a.judul ?? '').localeCompare(b.judul ?? '');
      } else {
        hasil = new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime();
      }

      return ascending ? hasil : -hasil;
    });

    // Pagination dilakukan setelah semua filter
    const totalData = resources.length;
    const totalHalaman = Math.ceil(totalData / limit);
    const from = (page - 1) * limit;

    const dataHalaman = resources
      .slice(from, from + limit)
      .map(({ link_file, ...resource }) => resource);

    return res.status(200).json({
      message: 'Data resource relevan berhasil diambil!',
      pagination: {
        halaman: page,
        per_halaman: limit,
        total_data: totalData,
        total_halaman: totalHalaman
      },
      filters: {
        q: q?.trim() || null,
        category_id: category_id || null,
        matkul_id: matkul_id || null,
        semester_id: semester_id || null,
        prodi_id: prodi_id || null,
        fakultas_id: fakultas_id || null,
        format: format || null,
        tahun: tahun || null,
        rating_min: minRating,
        rating_max: maxRating,
        sort
      },
      data: dataHalaman
    });
  } catch (err) {
    console.error(
      'Gagal mengambil resource relevan:',
      err.message
    );

    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil resource relevan.'
    });
  }
});



/**
 * @swagger
 * /resource/search:
 *   get:
 *     summary: Mencari resource
 *     description: Mencari resource yang telah disetujui berdasarkan judul atau deskripsi.
 *     tags: [Resource]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Kata kunci pencarian
 *     responses:
 *       200:
 *         description: Hasil pencarian berhasil diambil
 *       400:
 *         description: Kata pencarian wajib diisi
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       500:
 *         description: Terjadi kesalahan saat mencari resource
 */

 // SEARCH RESOURCE
app.get('/resource/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        error: 'Kata pencarian wajib diisi'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        status,
        user_id,
        category_id,
        matkul_id,
        kategori (
          category_id,
          nama_kategori
        ),
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .eq('status', 'approved')
      .or(`judul.ilike.%${q.trim()}%,deskripsi.ilike.%${q.trim()}%`);

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Hasil pencarian resource berhasil diambil!',
      data
    });

  } catch (err) {
    console.error('Gagal mencari resource:', err.message);

    res.status(500).json({
      error: 'Terjadi kesalahan saat mencari resource.'
    });
  }
});


/**
 * @swagger
 * /resource/filter:
 *   get:
 *     summary: Memfilter resource
 *     description: Memfilter resource yang telah disetujui berdasarkan kategori, mata kuliah, semester, program studi, atau fakultas.
 *     tags: [Resource]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: matkul_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: semester_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: prodi_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: fakultas_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Resource berhasil difilter
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       500:
 *         description: Terjadi kesalahan saat memfilter resource
 */


 // FILTER RESOURCE
app.get('/resource/filter', authMiddleware, async (req, res) => {
  try {
    const {
      category_id,
      matkul_id,
      semester_id,
      prodi_id,
      fakultas_id
    } = req.query;

    let query = supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        status,
        user_id,
        category_id,
        matkul_id,
        kategori (
          category_id,
          nama_kategori
        ),
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .eq('status', 'approved');

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (matkul_id) {
      query = query.eq('matkul_id', matkul_id);
    }

    if (semester_id) {
      query = query.eq('semester_id', semester_id);
    }

    if (prodi_id) {
      query = query.eq('prodi_id', prodi_id);
    }

    if (fakultas_id) {
      query = query.eq('fakultas_id', fakultas_id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Resource berhasil difilter!',
      data
    });

  } catch (err) {
    console.error('Gagal memfilter resource:', err.message);

    res.status(500).json({
      error: 'Terjadi kesalahan saat memfilter resource.'
    });
  }
});



/**
 * @swagger
 * /resource/{id}:
 *   get:
 *     summary: Mengambil detail resource
 *     description: Mengambil detail resource yang telah disetujui tanpa menyertakan link_file.
 *     tags: [Resource]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail resource berhasil diambil
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       404:
 *         description: Resource tidak ditemukan
 *       500:
 *         description: Terjadi kesalahan saat mengambil detail resource
 */


// GET DETAIL RESOURCE
app.get('/resource/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        link_file,
        format_file,
        jumlah_unduhan,
        jumlah_dilihat,
        created_at,
        status,
        user_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        ),
        category_id,
        kategori (
          category_id,
          nama_kategori
        ),
        matkul_id,
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .eq('resource_id', id)
      .eq('status', 'approved')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        error: 'Resource tidak ditemukan'
      });
    }

    // Auto-increment jumlah_dilihat
    const currentViews = data.jumlah_dilihat || 0;
    await supabaseAdmin
      .from('resource')
      .update({ jumlah_dilihat: currentViews + 1 })
      .eq('resource_id', id);

    const { link_file, ...detailResource } = data;
    detailResource.jumlah_dilihat = currentViews + 1;

    res.status(200).json({
      message: 'Detail resource berhasil diambil!',
      data: detailResource
    });

  } catch (err) {
    console.error('Gagal mengambil detail resource:', err.message);

    res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil detail resource.'
    });
  }
});



/**
 * @swagger
 * /resource/{id}/file:
 *   get:
 *     summary: Mengakses file resource (pratinjau atau unduh)
 *     description: Membuat signed URL sementara untuk file resource (berlaku 60 detik). Admin dan pemilik dapat mengakses file dengan status apapun. Counter jumlah_unduhan hanya bertambah jika parameter action=download disertakan dan pengakses bukan admin.
 *     tags: [Resource]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [preview, download]
 *         description: Tentukan 'download' untuk mencatat unduhan, atau biarkan kosong / 'preview' untuk pratinjau tanpa menambah unduhan
 *       - in: query
 *         name: download
 *         schema:
 *           type: boolean
 *         description: Alternatif flag boolean, jika true maka menambah counter unduhan
 *     responses:
 *       200:
 *         description: Akses file berhasil dibuat
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Dokumen belum disetujui dan pengguna tidak berhak mengakses
 *       404:
 *         description: Resource atau file tidak ditemukan
 *       500:
 *         description: Terjadi kesalahan saat mengakses file
 */


/* GET FILE RESOURCE — WAJIB LOGIN */
app.get('/resource/:id/file', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, download } = req.query;

    // Ambil data resource beserta user_id untuk memeriksa hak akses
    const { data: resource, error } = await supabaseAdmin
      .from('resource')
      .select('resource_id, link_file, status, jumlah_unduhan, user_id')
      .eq('resource_id', id)
      .maybeSingle();

    if (error) throw error;

    if (!resource || !resource.link_file) {
      return res.status(404).json({
        error: 'Resource atau file tidak ditemukan'
      });
    }

    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && req.user.user_id === resource.user_id;

    // Jika bukan admin dan bukan pemilik file, dokumen WAJIB berstatus approved
    if (resource.status !== 'approved' && !isAdmin && !isOwner) {
      return res.status(403).json({
        error: 'Dokumen belum disetujui dan hanya dapat diakses oleh admin atau pengunggah.'
      });
    }

    // Auto-increment jumlah_unduhan HANYA JIKA aksi unduh (Opsi A) dan pengakses bukan admin
    const isDownloadAction = action === 'download' || download === 'true';
    if (isDownloadAction && !isAdmin) {
      const currentDownloads = resource.jumlah_unduhan || 0;
      await supabaseAdmin
        .from('resource')
        .update({ jumlah_unduhan: currentDownloads + 1 })
        .eq('resource_id', id);
    }

    // Buat URL sementara untuk file (berlaku 60 detik)
    const { data, error: storageError } = await supabaseAdmin
      .storage
      .from('materi-files')
      .createSignedUrl(resource.link_file, 60);

    if (storageError) throw storageError;

    return res.status(200).json({
      message: 'Akses file berhasil dibuat',
      data: {
        file_url: data.signedUrl
      }
    });
  } catch (err) {
    console.error('Gagal mengakses file resource:', err.message);
    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengakses file'
    });
  }
});


/**
 * @swagger
 * /bookmark:
 *   post:
 *     summary: Menambahkan bookmark
 *     description: Menambahkan resource atau wawasan (experience) ke bookmark mahasiswa.
 *     tags: [Bookmark]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resource_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID resource yang akan dibookmark (opsional jika experience_id diisi)
 *               experience_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID wawasan/experience yang akan dibookmark (opsional jika resource_id diisi)
 *     responses:
 *       201:
 *         description: Berhasil ditambahkan ke bookmark
 *       400:
 *         description: resource_id atau experience_id wajib diisi
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       404:
 *         description: Resource atau wawasan tidak ditemukan
 *       409:
 *         description: Konten sudah ada di bookmark
 *       500:
 *         description: Terjadi kesalahan saat menambahkan bookmark
 */


 // TAMBAH BOOKMARK
app.post(
  '/bookmark',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const { resource_id, experience_id } = req.body;
      const user_id = req.user.user_id;

      if (!resource_id && !experience_id) {
        return res.status(400).json({
          error: 'resource_id atau experience_id wajib diisi'
        });
      }

      // Bookmark untuk Resource
      if (resource_id) {
        // Cek keberadaan resource
        const { data: resData, error: resErr } = await supabaseAdmin
          .from('resource')
          .select('resource_id')
          .eq('resource_id', resource_id)
          .maybeSingle();

        if (resErr) throw resErr;
        if (!resData) {
          return res.status(404).json({
            error: 'Resource tidak ditemukan'
          });
        }

        // Periksa apakah bookmark sudah ada
        const { data: existingBookmarks, error: checkError } =
          await supabaseAdmin
            .from('bookmark')
            .select('user_id, resource_id')
            .eq('user_id', user_id)
            .eq('resource_id', resource_id)
            .limit(1);

        if (checkError) throw checkError;

        if (existingBookmarks && existingBookmarks.length > 0) {
          return res.status(409).json({
            error: 'Resource sudah ada di bookmark!'
          });
        }

        const { data, error } = await supabaseAdmin
          .from('bookmark')
          .insert([
            {
              user_id,
              resource_id
            }
          ])
          .select();

        if (error) throw error;

        return res.status(201).json({
          message: 'Resource berhasil ditambahkan ke bookmark!',
          data
        });
      }

      // Bookmark untuk Experience (Wawasan)
      if (experience_id) {
        // Cek keberadaan wawasan
        const { data: expData, error: expErr } = await supabaseAdmin
          .from('experience')
          .select('experience_id')
          .eq('experience_id', experience_id)
          .maybeSingle();

        if (expErr) throw expErr;
        if (!expData) {
          return res.status(404).json({
            error: 'Wawasan tidak ditemukan'
          });
        }

        // Periksa apakah bookmark wawasan sudah ada
        const { data: existingBookmarks, error: checkError } =
          await supabaseAdmin
            .from('bookmark')
            .select('user_id, experience_id')
            .eq('user_id', user_id)
            .eq('experience_id', experience_id)
            .limit(1);

        if (checkError) throw checkError;

        if (existingBookmarks && existingBookmarks.length > 0) {
          return res.status(409).json({
            error: 'Wawasan sudah ada di bookmark!'
          });
        }

        const { data, error } = await supabaseAdmin
          .from('bookmark')
          .insert([
            {
              user_id,
              experience_id
            }
          ])
          .select();

        if (error) throw error;

        return res.status(201).json({
          message: 'Wawasan berhasil ditambahkan ke bookmark!',
          data
        });
      }

    } catch (err) {
      console.error('Gagal menambahkan bookmark:', err.message);

      return res.status(500).json({
        error: 'Terjadi kesalahan saat menambahkan bookmark.'
      });
    }
  }
);


/**
 * @swagger
 * /bookmark:
 *   get:
 *     summary: Mengambil bookmark mahasiswa
 *     description: Mengambil daftar bookmark milik mahasiswa yang sedang login (baik resource maupun wawasan).
 *     tags: [Bookmark]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Data bookmark berhasil diambil
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       500:
 *         description: Terjadi kesalahan saat mengambil bookmark
 */


 // GET BOOKMARK MILIK USER
app.get(
  '/bookmark',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const user_id = req.user.user_id;

      const { data, error } = await supabaseAdmin
        .from('bookmark')
        .select(`
          user_id,
          resource_id,
          experience_id,
          resource (
            resource_id,
            judul,
            deskripsi,
            sumber,
            status,
            format_file,
            semester_id,
            prodi_id,
            fakultas_id
          ),
          experience (
            experience_id,
            judul,
            sub_judul,
            kategori,
            tags,
            sampul,
            jumlah_dibaca,
            status,
            created_at
          )
        `)
        .eq('user_id', user_id);

      if (error) {
        throw error;
      }

      res.status(200).json({
        message: 'Data bookmark berhasil diambil!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);



/**
 * @swagger
 * /bookmark/{resource_id}:
 *   delete:
 *     summary: Menghapus bookmark
 *     description: Menghapus bookmark milik mahasiswa berdasarkan ID resource atau ID wawasan/experience.
 *     tags: [Bookmark]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resource_id
 *         required: true
 *         description: ID resource atau ID wawasan (experience) yang akan dihapus dari bookmark
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Bookmark berhasil dihapus
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       404:
 *         description: Bookmark tidak ditemukan
 *       500:
 *         description: Terjadi kesalahan saat menghapus bookmark
 */


 // HAPUS BOOKMARK
app.delete(
  '/bookmark/:resource_id',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const { resource_id } = req.params;
      const user_id = req.user.user_id;

      // Hapus berdasarkan resource_id atau experience_id
      const { data, error } = await supabaseAdmin
        .from('bookmark')
        .delete()
        .eq('user_id', user_id)
        .or(`resource_id.eq.${resource_id},experience_id.eq.${resource_id}`)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return res.status(404).json({
          error: 'Bookmark tidak ditemukan.'
        });
      }

      return res.status(200).json({
        message: 'Bookmark berhasil dihapus!'
      });

    } catch (err) {
      console.error('Gagal menghapus bookmark:', err.message);

      return res.status(500).json({
        error: 'Terjadi kesalahan saat menghapus bookmark.'
      });
    }
  }
);



/**
 * @swagger
 * /experience:
 *   post:
 *     summary: Mengirim experience
 *     description: Mahasiswa mengirim experience baru dengan status awal pending.
 *     tags: [Experience]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [judul, konten]
 *             properties:
 *               judul:
 *                 type: string
 *               konten:
 *                 type: string
 *     responses:
 *       201:
 *         description: Experience berhasil dikirim
 *       400:
 *         description: Judul dan konten wajib diisi
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       500:
 *         description: Terjadi kesalahan saat mengirim experience
 */


// TAMBAH EXPERIENCE
app.post(
  '/experience',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  upload.single('sampul'),
  async (req, res) => {
    try {
      const {
        judul,
        sub_judul,
        konten,
        kategori,
        tags,
        sampul: sampulBody
      } = req.body;

      const user_id = req.user.user_id;

      if (!judul || !konten) {
        return res.status(400).json({
          error: 'Judul dan konten wajib diisi'
        });
      }

      let sampulLink = sampulBody || null;

      // Upload file gambar sampul jika dilampirkan
      if (req.file) {
        try {
          let fileBuffer = req.file.buffer;
          const originalName = req.file.originalname;
          const safeName = originalName.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_');
          const fileName = `${Date.now()}-${safeName}.jpg`;

          if (req.file.mimetype.startsWith('image/')) {
            fileBuffer = await sharp(req.file.buffer)
              .rotate()
              .resize({ width: 1200, withoutEnlargement: true })
              .jpeg({ quality: 80, mozjpeg: true })
              .toBuffer();
          }

          const { error: storageError } = await supabaseAdmin
            .storage
            .from('uploads')
            .upload(`experience/${fileName}`, fileBuffer, {
              contentType: 'image/jpeg',
              upsert: false
            });

          if (storageError) {
            console.error('Gagal upload gambar sampul:', storageError);
          } else {
            const { data: pubData } = supabaseAdmin
              .storage
              .from('uploads')
              .getPublicUrl(`experience/${fileName}`);

            sampulLink = pubData?.publicUrl || `experience/${fileName}`;
          }
        } catch (uploadErr) {
          console.warn('Gagal memproses file sampul wawasan:', uploadErr.message);
        }
      }

      // Format tags menjadi array
      let tagsArray = [];
      if (Array.isArray(tags)) {
        tagsArray = tags;
      } else if (typeof tags === 'string' && tags.trim() !== '') {
        try {
          const parsed = JSON.parse(tags);
          if (Array.isArray(parsed)) tagsArray = parsed;
          else tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
        } catch (_) {
          tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      }

      const { data, error } = await supabaseAdmin
        .from('experience')
        .insert([
          {
            judul,
            sub_judul: sub_judul || null,
            konten,
            kategori: kategori || null,
            tags: tagsArray,
            sampul: sampulLink,
            jumlah_dibaca: 0,
            status: 'pending',
            user_id
          }
        ])
        .select();

      if (error) {
        throw error;
      }

      res.status(201).json({
        message: 'Experience berhasil dikirim!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);



/**
 * @swagger
 * /experience:
 *   get:
 *     summary: Mengambil experience yang disetujui
 *     description: Mengambil daftar experience dengan status approved beserta informasi penulis, sub_judul, kategori, tags, dan sampul.
 *     tags: [Experience]
 *     responses:
 *       200:
 *         description: Data experience berhasil diambil
 *       500:
 *         description: Terjadi kesalahan saat mengambil data experience
 */


app.get('/experience', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('experience')
      .select(`
        experience_id,
        judul,
        sub_judul,
        konten,
        kategori,
        tags,
        sampul,
        jumlah_dibaca,
        status,
        created_at,
        user_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        )
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Ambil rekap rating wawasan
    let experiencesWithRating = data;
    try {
      const { data: ratingData } = await supabaseAdmin
        .from('rating_review')
        .select('experience_id, nilai_rating')
        .not('experience_id', 'is', null);

      if (ratingData && ratingData.length > 0) {
        const rekap = {};
        for (const item of ratingData) {
          if (!item.experience_id || item.nilai_rating == null) continue;
          if (!rekap[item.experience_id]) {
            rekap[item.experience_id] = { total: 0, jumlah: 0 };
          }
          rekap[item.experience_id].total += Number(item.nilai_rating);
          rekap[item.experience_id].jumlah += 1;
        }

        experiencesWithRating = (data || []).map(exp => ({
          ...exp,
          rating_rata_rata: rekap[exp.experience_id]
            ? rekap[exp.experience_id].total / rekap[exp.experience_id].jumlah
            : null,
          total_ulasan: rekap[exp.experience_id]?.jumlah || 0
        }));
      }
    } catch (_) {}

    return res.status(200).json({
      message: 'Data experience berhasil diambil!',
      data: experiencesWithRating
    });

  } catch (err) {
    console.error('Gagal mengambil data experience:', err.message);

    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil data experience.'
    });
  }
});


/**
 * @swagger
 * /experience/{id}:
 *   get:
 *     summary: Mengambil detail satu experience
 *     description: Mengambil detail satu tulisan experience yang disetujui beserta data penulis, rating rata-rata, dan menambah counter jumlah_dibaca.
 *     tags: [Experience]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail experience berhasil diambil
 *       404:
 *         description: Experience tidak ditemukan
 *       500:
 *         description: Terjadi kesalahan server
 */
app.get('/experience/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('experience')
      .select(`
        experience_id,
        judul,
        sub_judul,
        konten,
        kategori,
        tags,
        sampul,
        jumlah_dibaca,
        status,
        created_at,
        user_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        )
      `)
      .eq('experience_id', id)
      .eq('status', 'approved')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        error: 'Experience tidak ditemukan'
      });
    }

    // Auto-increment jumlah_dibaca
    const currentReads = data.jumlah_dibaca || 0;
    await supabaseAdmin
      .from('experience')
      .update({ jumlah_dibaca: currentReads + 1 })
      .eq('experience_id', id);

    data.jumlah_dibaca = currentReads + 1;

    // Ambil statistik rating & review wawasan ini
    try {
      const { data: ratingRows } = await supabaseAdmin
        .from('rating_review')
        .select('nilai_rating')
        .eq('experience_id', id);

      if (ratingRows && ratingRows.length > 0) {
        const total = ratingRows.reduce((acc, curr) => acc + Number(curr.nilai_rating), 0);
        data.rating_rata_rata = total / ratingRows.length;
        data.total_ulasan = ratingRows.length;
      } else {
        data.rating_rata_rata = null;
        data.total_ulasan = 0;
      }
    } catch (_) {
      data.rating_rata_rata = null;
      data.total_ulasan = 0;
    }

    return res.status(200).json({
      message: 'Detail experience berhasil diambil!',
      data
    });

  } catch (err) {
    console.error('Gagal mengambil detail experience:', err.message);

    return res.status(500).json({
      error: 'Terjadi kesalahan saat mengambil detail experience.'
    });
  }
});



/**
 * @swagger
 * /report:
 *   post:
 *     summary: Mengirim report
 *     description: Mahasiswa melaporkan satu resource atau satu experience.
 *     tags: [Report]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [alasan]
 *             properties:
 *               alasan:
 *                 type: string
 *               resource_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               experience_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Report berhasil dikirim
 *       400:
 *         description: Alasan atau target report tidak valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       500:
 *         description: Terjadi kesalahan saat mengirim report
 */


// TAMBAH REPORT
app.post(
  '/report',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const {
        alasan,
        resource_id,
        experience_id
      } = req.body;

      const user_id = req.user.user_id;

     
if (typeof alasan !== 'string' || !alasan.trim()) {
  return res.status(400).json({
    error: 'Alasan report wajib diisi'
  });
}


      if (!resource_id && !experience_id) {
        return res.status(400).json({
          error: 'resource_id atau experience_id wajib diisi'
        });
      }

      if (resource_id && experience_id) {
        return res.status(400).json({
          error: 'Report hanya boleh ditujukan ke resource atau experience'
        });
      }

      const { data, error } = await supabaseAdmin
        .from('report')
        .insert([
          {
            alasan,
            user_id,
            resource_id: resource_id || null,
            experience_id: experience_id || null
          }
        ])
        .select();

      if (error) {
        throw error;
      }

      res.status(201).json({
        message: 'Report berhasil dikirim!',
        data
      });

    

} catch (err) {
  console.error('Gagal mengirim report:', err.message);

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Resource atau experience yang dilaporkan tidak valid.'
    });
  }

  return res.status(500).json({
    error: 'Terjadi kesalahan saat mengirim report.'
  });
}


  }
);



/**
 * @swagger
 * /rating-review:
 *   post:
 *     summary: Mengirim atau memperbarui rating dan review
 *     description: Mahasiswa memberikan rating 1 sampai 5 dan review opsional untuk resource atau wawasan (experience).
 *     tags: [Rating & Review]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nilai_rating]
 *             properties:
 *               resource_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID resource yang dinilai (opsional jika experience_id diisi)
 *               experience_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID wawasan/experience yang dinilai (opsional jika resource_id diisi)
 *               nilai_rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               isi_review:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Rating dan review berhasil dikirim
 *       400:
 *         description: Input tidak valid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses hanya untuk mahasiswa
 *       404:
 *         description: Resource atau wawasan tidak ditemukan
 *       500:
 *         description: Terjadi kesalahan saat mengirim rating dan review
 */


 // TAMBAH / UPDATE RATING & REVIEW
app.post(
  '/rating-review',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const {
        resource_id,
        experience_id,
        nilai_rating,
        isi_review
      } = req.body;

      const user_id = req.user.user_id;

      // Validasi wajib salah satu target diisi
      if (!resource_id && !experience_id) {
        return res.status(400).json({
          error: 'resource_id atau experience_id serta nilai_rating wajib diisi'
        });
      }

      if (
        nilai_rating === undefined ||
        nilai_rating === null ||
        nilai_rating === ''
      ) {
        return res.status(400).json({
          error: 'nilai_rating wajib diisi'
        });
      }

      // Validasi tipe rating
      if (
        typeof nilai_rating !== 'number' ||
        !Number.isInteger(nilai_rating)
      ) {
        return res.status(400).json({
          error: 'Nilai rating harus berupa bilangan bulat antara 1 sampai 5'
        });
      }

      // Validasi rentang rating
      if (nilai_rating < 1 || nilai_rating > 5) {
        return res.status(400).json({
          error: 'Nilai rating harus antara 1 sampai 5'
        });
      }
      
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      // Rating untuk Resource
      if (resource_id) {
        if (!uuidRegex.test(resource_id)) {
          return res.status(400).json({
            error: 'Format resource_id tidak valid'
          });
        }

        const { data: resource, error: resourceError } = await supabaseAdmin
          .from('resource')
          .select('resource_id')
          .eq('resource_id', resource_id)
          .maybeSingle();

        if (resourceError) throw resourceError;
        if (!resource) {
          return res.status(404).json({
            error: 'Resource tidak ditemukan'
          });
        }

        const { data: existingReview, error: findErr } = await supabaseAdmin
          .from('rating_review')
          .select('rating_id')
          .eq('user_id', user_id)
          .eq('resource_id', resource_id)
          .maybeSingle();

        if (findErr) throw findErr;

        let resultData;
        if (existingReview) {
          const { data, error } = await supabaseAdmin
            .from('rating_review')
            .update({
              nilai_rating,
              isi_review: isi_review || null
            })
            .eq('rating_id', existingReview.rating_id)
            .select();

          if (error) throw error;
          resultData = data;
        } else {
          const { data, error } = await supabaseAdmin
            .from('rating_review')
            .insert([
              {
                resource_id,
                nilai_rating,
                isi_review: isi_review || null,
                user_id
              }
            ])
            .select();

          if (error) throw error;
          resultData = data;
        }

        return res.status(201).json({
          message: 'Rating dan review berhasil dikirim!',
          data: resultData
        });
      }

      // Rating untuk Experience (Wawasan)
      if (experience_id) {
        if (!uuidRegex.test(experience_id)) {
          return res.status(400).json({
            error: 'Format experience_id tidak valid'
          });
        }

        const { data: exp, error: expError } = await supabaseAdmin
          .from('experience')
          .select('experience_id')
          .eq('experience_id', experience_id)
          .maybeSingle();

        if (expError) throw expError;
        if (!exp) {
          return res.status(404).json({
            error: 'Wawasan tidak ditemukan'
          });
        }

        const { data: existingReview, error: findErr } = await supabaseAdmin
          .from('rating_review')
          .select('rating_id')
          .eq('user_id', user_id)
          .eq('experience_id', experience_id)
          .maybeSingle();

        if (findErr) throw findErr;

        let resultData;
        if (existingReview) {
          const { data, error } = await supabaseAdmin
            .from('rating_review')
            .update({
              nilai_rating,
              isi_review: isi_review || null
            })
            .eq('rating_id', existingReview.rating_id)
            .select();

          if (error) throw error;
          resultData = data;
        } else {
          const { data, error } = await supabaseAdmin
            .from('rating_review')
            .insert([
              {
                experience_id,
                nilai_rating,
                isi_review: isi_review || null,
                user_id
              }
            ])
            .select();

          if (error) throw error;
          resultData = data;
        }

        return res.status(201).json({
          message: 'Rating dan review wawasan berhasil dikirim!',
          data: resultData
        });
      }

    } catch (err) {
      console.error('Gagal mengirim rating dan review:', err.message);

      return res.status(500).json({
        error: 'Terjadi kesalahan saat mengirim rating dan review.'
      });
    }
  }
);


/**
 * @swagger
 * /rating-review/{resource_id}:
 *   get:
 *     summary: Mengambil rating dan review (resource atau wawasan)
 *     description: Mengambil daftar rating dan review berdasarkan ID resource atau ID wawasan. Dapat diakses tanpa login.
 *     tags: [Rating & Review]
 *     parameters:
 *       - in: path
 *         name: resource_id
 *         required: true
 *         description: ID resource atau ID wawasan
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rating dan review berhasil diambil
 *       500:
 *         description: Terjadi kesalahan saat mengambil rating dan review
 */


// GET RATING & REVIEW (RESOURCE ATAU WAWASAN)
app.get('/rating-review/:resource_id', async (req, res) => {
  try {
    const { resource_id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('rating_review')
      .select(`
        rating_id,
        nilai_rating,
        isi_review,
        user_id,
        resource_id,
        experience_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        )
      `)
      .or(`resource_id.eq.${resource_id},experience_id.eq.${resource_id}`);

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Rating dan review berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});


// GET RATING & REVIEW KHUSUS WAWASAN
app.get('/rating-review/experience/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('rating_review')
      .select(`
        rating_id,
        nilai_rating,
        isi_review,
        user_id,
        experience_id,
        pengguna:user_id (
          nama,
          nim,
          prodi
        )
      `)
      .eq('experience_id', id);

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Rating dan review wawasan berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});


/**
 * @swagger
 * /admin/resource:
 *   get:
 *     summary: Mengambil semua resource untuk admin
 *     description: Mengambil seluruh data resource beserta informasi kategori yang terkait. Hanya dapat diakses oleh admin.
 *     tags:
 *       - Admin - Resource
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Data resource berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Data resource berhasil diambil!
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       resource_id:
 *                         type: string
 *                         format: uuid
 *                       judul:
 *                         type: string
 *                       deskripsi:
 *                         type: string
 *                       sumber:
 *                         type: string
 *                       link_file:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         type: string
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       category_id:
 *                         type: string
 *                         format: uuid
 *                       kategori:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           category_id:
 *                             type: string
 *                             format: uuid
 *                           nama_kategori:
 *                             type: string
 *                       matkul_id:
 *                         type: string
 *                         format: uuid
 *                       semester_id:
 *                         type: string
 *                         format: uuid
 *                       prodi_id:
 *                         type: string
 *                         format: uuid
 *                       fakultas_id:
 *                         type: string
 *                         format: uuid
 *       401:
 *         description: Token tidak valid atau tidak tersedia
 *       403:
 *         description: Akses ditolak karena pengguna bukan admin
 *       500:
 *         description: Terjadi kesalahan pada server
 */


// ADMIN - GET SEMUA RESOURCE
app.get(
  '/admin/resource',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('resource')
        .select(`
          resource_id,
          judul,
          deskripsi,
          sumber,
          link_file,
          format_file,
          jumlah_unduhan,
          jumlah_dilihat,
          alasan_penolakan,
          status,
          created_at,
          user_id,
          pengguna:user_id (
            nama,
            nim,
            prodi,
            email
          ),
          category_id,
          kategori (
              category_id,
              nama_kategori
          ),
          matkul_id,
          semester_id,
          prodi_id,
          fakultas_id
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      res.status(200).json({
        message: 'Data resource berhasil diambil!',
        data
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);


app.use((err, req, res, next) => {
  console.error(err.message);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'Ukuran file maksimal 10 MB'
    });
  }

  if (err.message === 'Format file tidak diizinkan.') {
    return res.status(400).json({
      error: 'Format file tidak diizinkan. Gunakan PDF, Word, PowerPoint, JPEG, PNG, atau WebP.'
    });
  }

  return res.status(500).json({
    error: 'Terjadi kesalahan pada server'
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({
    message: "Backend AKSARA berjalan dengan baik",
  });
});


app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});