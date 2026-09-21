import 'dotenv/config';
import express from 'express';

// mengambil fungsi createClient (paten yaa) dari supabasenya ini menjembatani antara express dengan supabase
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import authMiddleware from './middleware/authMiddleware.js';
import roleMiddleware from './middleware/roleMiddleware.js';
const app = express();
const PORT = 3000;

// agar server bisa membaca data berformat JSON dari client
app.use(express.json())
app.use(cors());

// (Endpoint GET )
app.get('/', (req, res) => {
    res.send('Halo! Back-end Telkom Share sudah aktif!');

});

const upload = multer({ storage: multer.memoryStorage()});

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
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    // Simpan data user ke tabel pengguna
    const { error: penggunaError } = await supabaseAdmin
      .from('pengguna')
      .insert([
        {
          user_id: data.user.id,
          email: email,
          role: 'mahasiswa'
        }
      ]);

    if (penggunaError) {
      console.error(penggunaError);

      return res.status(500).json({
        error: penggunaError.message
      });
    }

    res.status(201).json({
      message: "Registrasi berhasil!",
      data: data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

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

    res.status(200).json({
      message: "Login berhasil!",
      data: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

// 1. Endpoint POST : untuk menyimpan hal baru, ibaratnya menginput data lalu save
app.post('/upload-materi', upload.single('file'), async (req, res) => {
    try {
        // 1. Cek apakah file ada
        if (!req.file) {
            return res.status(400).json({ error: "File tidak ditemukan!" });
        }

        let fileBuffer = req.file.buffer;
        const originalName = req.file.originalname;
        const contentType = req.file.mimetype;
        
        // Buat nama file unik
        let fileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;

        // 2. Cek apakah file berupa gambar (MIME-type berawalan 'image/')
        if (contentType && contentType.startsWith('image/')) {
            try {
                // Kompres gambar dengan sharp secara aman
                fileBuffer = await sharp(req.file.buffer)
                    .resize({ width: 1200, withoutEnlargement: true }) // Batasi lebar max 1200px
                    .jpeg({ quality: 80, mozjpeg: true })             // Atur kualitas 80%
                    .toBuffer();
                
                console.log("Gambar berhasil dikompres!");
            } catch (sharpErr) {
                console.log("Gagal kompres, pakai file asli:", sharpErr.message);
                fileBuffer = req.file.buffer; // Fallback jika kompresi gagal
            }
        } else {
            console.log(`File non-gambar (${contentType}), dilewatkan tanpa kompresi.`);
        }

        // 3. Upload file ke Supabase Storage (bucket: materi-files)
        const { data: storageData, error: storageError } = await supabase.storage
            .from('materi-files')
            .upload(`uploads/${fileName}`, fileBuffer, {
                contentType: contentType,
                upsert: false
            });

        if (storageError) throw storageError;

        // 4. Ambil Public URL
        const { data: publicUrlData } = supabase.storage
            .from('materi-files')
            .getPublicUrl(`uploads/${fileName}`);

        const file_url = publicUrlData.publicUrl;

        // 5. Simpan metadata ke Database PostgreSQL (tabel: materi)
        const { title, course, description } = req.body;
        const { data: dbData, error: dbError } = await supabase
            .from('materi')
            .insert([{ title, course, description, file_url }])
            .select();

        if (dbError) throw dbError;

        // 6. Respon Berhasil
        res.status(201).json({
            message: "File berhasil di-upload dan data tersimpan!",
            file_url,
            data: dbData
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
//2. Endpoint GET
app.get('/materi', async (req,res)=> {
    try {
        // Mengambil semua data dari tabel materi dan mengurutkannya dari yang terbaru
        const {data, error} = await supabase
            .from('materi')
            .select('*')
            .order('created_at', {ascending : false});

        if (error) throw error;
        // Mengirimkan data materi ke client dalam bentuk JSON
        res.status(200).json(data);

    } catch (err) {
        res.status(500).json({error: err.message});
    }
});

app.get('/test-auth', authMiddleware, (req, res) => {
  res.status(200).json({
    message: 'Auth berhasil!',
    user: req.user
  });
});

app.put(
  '/admin/resource/:id/status',
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
        .from('resource')
        .update({ status })
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
          user_id,
          resource_id,
          experience_id
        `);

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
          konten,
          status,
          user_id
        `);

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

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

// 1. UPDATE MATERI BERDASARKAN ID
app.put('/materi/:id', upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, course, description } = req.body;

        // Ambil data lama di database untuk cek apakah ada file lama
        const { data: existingData, error: fetchError } = await supabase
            .from('materi')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existingData) {
            return res.status(404).json({ error: "Materi tidak ditemukan!" });
        }

        let file_url = existingData.file_url; // Default pakai file lama

        // Jika user mengupload file baru saat update
        if (req.file) {
            let fileBuffer = req.file.buffer;
            const originalName = req.file.originalname;
            const contentType = req.file.mimetype;
            let fileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;

            // Kompres jika gambar
            if (contentType && contentType.startsWith('image/')) {
                try {
                    fileBuffer = await sharp(req.file.buffer)
                        .resize({ width: 1200, withoutEnlargement: true })
                        .jpeg({ quality: 80, mozjpeg: true })
                        .toBuffer();
                } catch (err) {
                    console.log("Gagal kompres saat update, pakai file asli.");
                }
            }

            // Upload file baru ke Supabase Storage
            const { error: storageError } = await supabase.storage
                .from('materi-files')
                .upload(`uploads/${fileName}`, fileBuffer, { contentType });

            if (storageError) throw storageError;

            // Dapatkan URL publik file baru
            const { data: publicUrlData } = supabase.storage
                .from('materi-files')
                .getPublicUrl(`uploads/${fileName}`);

            file_url = publicUrlData.publicUrl;
        }

        // Update data di PostgreSQL
        const { data: updatedData, error: updateError } = await supabase
            .from('materi')
            .update({
                title: title || existingData.title,
                course: course || existingData.course,
                description: description || existingData.description,
                file_url: file_url
            })
            .eq('id', id)
            .select();

        if (updateError) throw updateError;

        res.status(200).json({
            message: "Materi berhasil diperbarui!",
            data: updatedData
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. DELETE MATERI BERDASARKAN ID
app.delete('/materi/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Ambil data materi dulu untuk mendapatkan URL file fisiknya
        const { data: materiData, error: fetchError } = await supabase
            .from('materi')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !materiData) {
            return res.status(404).json({ error: "Materi tidak ditemukan!" });
        }

        // Hapus record dari database PostgreSQL
        const { error: deleteDbError } = await supabase
            .from('materi')
            .delete()
            .eq('id', id);

        if (deleteDbError) throw deleteDbError;

        // Ekstraksi nama file dari URL untuk dihapus dari Storage (Opsional)
        if (materiData.file_url) {
            const urlParts = materiData.file_url.split('/materi-files/');
            if (urlParts.length > 1) {
                const filePath = urlParts[1]; // contoh: uploads/1788...docx
                await supabase.storage
                    .from('materi-files')
                    .remove([filePath]);
            }
        }

        res.status(200).json({
            message: `Materi dengan ID ${id} berhasil dihapus beserta file fisiknya!`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});



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
      const contentType = req.file.mimetype;

      const fileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;

      // 5. Kalau gambar, kompres
      if (contentType && contentType.startsWith('image/')) {
        try {
          fileBuffer = await sharp(req.file.buffer)
            .resize({
              width: 1200,
              withoutEnlargement: true
            })
            .jpeg({
              quality: 80,
              mozjpeg: true
            })
            .toBuffer();
        } catch (sharpErr) {
          console.log(
            'Gagal kompres gambar, menggunakan file asli:',
            sharpErr.message
          );

          fileBuffer = req.file.buffer;
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

      // 7. Ambil URL file
      const { data: publicUrlData } = supabaseAdmin
        .storage
        .from('materi-files')
        .getPublicUrl(`resource/${fileName}`);

      const link_file = publicUrlData.publicUrl;

      // 8. Simpan data resource ke database
      const { data, error: dbError } = await supabaseAdmin
        .from('resource')
        .insert([
          {
            judul,
            deskripsi,
            sumber,
            link_file,
            status: 'pending',
            user_id,
            semester_id: semester_id || null,
            prodi_id: prodi_id || null,
            fakultas_id: fakultas_id || null
          }
        ])
        .select();

      if (dbError) {
        throw dbError;
      }

      // 9. Response
      res.status(201).json({
        message: 'Resource berhasil di-upload!',
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

// GET SEMUA RESOURCE
// GET SEMUA RESOURCE
app.get('/resource', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('resource')
      .select(`
        resource_id,
        judul,
        deskripsi,
        sumber,
        link_file,
        status,
        user_id,
        semester_id,
        prodi_id,
        fakultas_id
      `);

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
});

// SEARCH RESOURCE
app.get('/resource/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
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
        link_file,
        status,
        user_id,
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .or(`judul.ilike.%${q}%,deskripsi.ilike.%${q}%`);

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Hasil pencarian resource berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});


// FILTER RESOURCE
app.get('/resource/filter', async (req, res) => {
  try {
    const {
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
        link_file,
        status,
        user_id,
        semester_id,
        prodi_id,
        fakultas_id
      `);

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
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// GET DETAIL RESOURCE
app.get('/resource/:id', async (req, res) => {
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
        status,
        user_id,
        semester_id,
        prodi_id,
        fakultas_id
      `)
      .eq('resource_id', id)
      .single();

    if (error) {
      return res.status(404).json({
        error: 'Resource tidak ditemukan'
      });
    }

    res.status(200).json({
      message: 'Detail resource berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// TAMBAH BOOKMARK
app.post(
  '/bookmark',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const { resource_id } = req.body;
      const user_id = req.user.user_id;

      if (!resource_id) {
        return res.status(400).json({
          error: 'resource_id wajib diisi'
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

      if (error) {
        throw error;
      }

      res.status(201).json({
        message: 'Resource berhasil ditambahkan ke bookmark!',
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
          resource (
            resource_id,
            judul,
            deskripsi,
            sumber,
            link_file,
            status,
            semester_id,
            prodi_id,
            fakultas_id
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

// HAPUS BOOKMARK
app.delete(
  '/bookmark/:resource_id',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const { resource_id } = req.params;
      const user_id = req.user.user_id;

      const { error } = await supabaseAdmin
        .from('bookmark')
        .delete()
        .eq('user_id', user_id)
        .eq('resource_id', resource_id);

      if (error) {
        throw error;
      }

      res.status(200).json({
        message: 'Bookmark berhasil dihapus!'
      });

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);

// TAMBAH EXPERIENCE
app.post(
  '/experience',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const {
        judul,
        konten
      } = req.body;

      const user_id = req.user.user_id;

      if (!judul || !konten) {
        return res.status(400).json({
          error: 'Judul dan konten wajib diisi'
        });
      }

      const { data, error } = await supabaseAdmin
        .from('experience')
        .insert([
          {
            judul,
            konten,
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

app.get('/experience', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('experience')
      .select(`
        experience_id,
        judul,
        konten,
        status,
        user_id
      `)
      .eq('status', 'approved');

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Data experience berhasil diambil!',
      data
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

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

      if (!alasan) {
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
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);

// TAMBAH RATING & REVIEW
app.post(
  '/rating-review',
  authMiddleware,
  roleMiddleware('mahasiswa'),
  async (req, res) => {
    try {
      const {
        resource_id,
        nilai_rating,
        isi_review
      } = req.body;

      const user_id = req.user.user_id;

      if (!resource_id || !nilai_rating) {
        return res.status(400).json({
          error: 'resource_id dan nilai_rating wajib diisi'
        });
      }

      if (nilai_rating < 1 || nilai_rating > 5) {
        return res.status(400).json({
          error: 'Nilai rating harus antara 1 sampai 5'
        });
      }

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

      if (error) {
        throw error;
      }

      res.status(201).json({
        message: 'Rating dan review berhasil dikirim!',
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

// GET RATING & REVIEW RESOURCE
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
        resource_id
      `)
      .eq('resource_id', resource_id);

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
          status,
          user_id,
          semester_id,
          prodi_id,
          fakultas_id
        `);

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