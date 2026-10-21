import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Token tidak ditemukan'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Cek token Supabase Auth
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: 'Token tidak valid'
      });
    }

    // Ambil data user dari tabel pengguna
    const { data: pengguna, error: penggunaError } =
      await supabaseAdmin
        .from('pengguna')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

    if (penggunaError || !pengguna) {
      return res.status(404).json({
        error: 'Data pengguna tidak ditemukan'
      });
    }

    // Simpan informasi user ke request
    req.user = pengguna;

    next();

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
};

export default authMiddleware;