import express from 'express';

// mengambil fungsi createClient (paten yaa) dari supabasenya ini menjembatani antara express dengan supabase
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';
const app = express();
const PORT = 3000;

// agar server bisa membaca data berformat JSON dari client
app.use(express.json())

// (Endpoint GET )
app.get('/', (req, res) => {
    res.send('Halo! Back-end Telkom Share sudah aktif!');

});

const upload = multer({ storage: multer.memoryStorage()});

// mengambil fungsi createClient (paten yaa) dari supabasenya ini menjembatani antara express dengan supabase
const supabaseUrl = 'https://yhugjfkseyitmlhwaszo.supabase.co'
const supabaseKey = 'sb_publishable_FFi9IcXhnRkl4OXV0PJ3JQ_tRyDnUrE'

// memanggil fungsi keduanya
const supabase = createClient(supabaseUrl, supabaseKey)

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

// Menyalakan server di komputer lokal
app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
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