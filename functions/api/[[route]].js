// CLOUDFLARE BACKEND & OTOMATİK KURULUM MOTORU
const JWT_SECRET = "04agri-super-secret-key-2026-secure";

async function hashPassword(password) {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyAuth(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split(" ")[1];
    const [payloadB64, sig] = token.split(".");
    const expectedSig = await hashPassword(payloadB64 + JWT_SECRET);
    if (sig !== expectedSig) return null;
    return JSON.parse(atob(payloadB64));
  } catch (e) {
    return null;
  }
}

async function createToken(payload) {
  const payloadB64 = btoa(JSON.stringify(payload));
  const sig = await hashPassword(payloadB64 + JWT_SECRET);
  return `${payloadB64}.${sig}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/", "");
  const method = request.method;
  const db = env.DB;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json;charset=UTF-8"
  };

  if (method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // -----------------------------------------------------------
    // TEK TIKLA OTOMATİK KURULUM ROTASI (Konsola Gerek Kalmaz!)
    // -----------------------------------------------------------
    if (path === "setup") {
      await db.prepare(`CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'business', phone TEXT, address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_note TEXT, appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL, status TEXT DEFAULT 'Bekliyor', is_deleted INTEGER DEFAULT 0, deleted_by TEXT, deleted_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS blogs (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, approved_at DATETIME)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, action TEXT NOT NULL, details TEXT NOT NULL, performed_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();

      const businesses = [
        ['superadmin', 'Süper Yönetici (Sen)', 'admin', 'superadmin', 'Agri04SuperAdmin!', 'superadmin'],
        ['sevval-tasdemir', 'Şevval Taşdemir (Dil Terapisti)', 'saglik', 'dktsevval', 'Sevval04!', 'business'],
        ['dilek-polat', 'Dilek Polat (Psikolog)', 'saglik', 'pskdilek', 'Dilek04!', 'business'],
        ['bilge-igan', 'Uzm. Dyt. Bilge İgan Yıldırım', 'saglik', 'dytbilge', 'Bilge04!', 'business'],
        ['berika-kurucay', 'Dyt. Berika Kuruçay', 'saglik', 'dytberika', 'Berika04!', 'business'],
        ['seda-nur-dursun', 'Dyt. Seda Nur Dursun', 'saglik', 'dytseda', 'Seda04!', 'business'],
        ['seher-issi', 'Dyt. Seher Issi', 'saglik', 'dytseher', 'Seher04!', 'business'],
        ['hamiyet-sahin', 'Dyt. Hamiyet Şahin', 'saglik', 'dythamiyet', 'Hamiyet04!', 'business'],
        ['melike-cukadar', 'Melike Çukadar (Ergoterapist)', 'saglik', 'ergomelike', 'Melike04!', 'business'],
        ['dr-nilay', 'Dr. Nilay Dinçgözoğlu', 'saglik', 'drnilay', 'Nilay04!', 'business'],
        ['club-maxfit', 'Club Maxfit Spor Salonu', 'spor', 'maxfit04', 'Maxfit04!', 'business'],
        ['elit-dil', 'E.L.I.T Dil Kursu', 'egitim', 'elitdil', 'Elit04!', 'business'],
        ['bright-english', 'Bright English (İrem Kaya)', 'egitim', 'brightenglish', 'Bright04!', 'business'],
        ['nevra-basci', 'Nevra Başcı (Matematik)', 'egitim', 'nevramat', 'Nevra04!', 'business'],
        ['emir-hoca', 'Emir Hoca (Matematik)', 'egitim', 'emirhocamat', 'Emir04!', 'business'],
        ['canan-hoca', 'Canan Hoca (Matematik)', 'egitim', 'cananhocamat', 'Canan04!', 'business'],
        ['muhammed-hoca', 'Muhammed Hoca (Müzik)', 'egitim', 'muhammedmuzik', 'Muhammed04!', 'business'],
        ['merve-hoca', 'Merve Hoca (Piyano/Flüt)', 'egitim', 'mervemuzik', 'Merve04!', 'business'],
        ['bahar-igan', 'Bahar İgan Bağan (Yaşam Koçu)', 'danismanlik', 'baharkoc', 'Bahar04!', 'business'],
        ['ozge-nur-celik', 'Özge Nur Çelik (Çocuk Gelişimi)', 'danismanlik', 'ozgegelisim', 'Ozge04!', 'business'],
        ['berivan-hoca', 'Berivan Hoca (Çocuk Gelişimi)', 'danismanlik', 'berivangelisim', 'Berivan04!', 'business'],
        ['omer-hoca', 'Ömer Hoca (Hareket Eğitimi)', 'danismanlik', 'omerhareket', 'Omer04!', 'business'],
        ['seastarsoft', 'SeaStarSoft', 'yazilim', 'seastarsoft', 'Seastar04!', 'business'],
        ['bluversea', 'Bluversea', 'yazilim', 'bluversea', 'Bluversea04!', 'business']
      ];

      for (const b of businesses) {
        await db.prepare(`INSERT OR REPLACE INTO businesses (id, name, category, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)`).bind(...b).run();
      }

      return new Response(JSON.stringify({ success: true, message: "TEBRİKLER! Veritabanı ve 23 İşletme Başarıyla Kuruldu." }), { headers: corsHeaders });
    }

    // 1. GİRİŞ YAPMA (LOGIN)
    if (path === "login" && method === "POST") {
      const { username, password } = await request.json();
      
      const user = await db.prepare(
        "SELECT id, name, username, password_hash, role FROM businesses WHERE username = ?"
      ).bind(username).first();

      if (!user) {
        return new Response(JSON.stringify({ error: "Kullanıcı adı veya şifre hatalı!" }), { status: 401, headers: corsHeaders });
      }

      const inputHash = await hashPassword(password);
      const isMatch = (user.password_hash === password) || (user.password_hash === inputHash);

      if (!isMatch) {
        return new Response(JSON.stringify({ error: "Kullanıcı adı veya şifre hatalı!" }), { status: 401, headers: corsHeaders });
      }

      const token = await createToken({ id: user.id, role: user.role, name: user.name });
      return new Response(JSON.stringify({ success: true, token, user: { id: user.id, name: user.name, role: user.role } }), { headers: corsHeaders });
    }

    // 2. HERKESE AÇIK: RANDEVU ALMA
    if (path === "book-appointment" && method === "POST") {
      const data = await request.json();
      const { business_id, customer_name, customer_phone, customer_note, appointment_date, appointment_time } = data;

      await db.prepare(
        "INSERT INTO appointments (business_id, customer_name, customer_phone, customer_note, appointment_date, appointment_time) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(business_id, customer_name, customer_phone, customer_note || "", appointment_date, appointment_time).run();

      return new Response(JSON.stringify({ success: true, message: "Randevunuz oluşturuldu." }), { headers: corsHeaders });
    }

    // GÜVENLİK KONTROLÜ
    const auth = await verifyAuth(request);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401, headers: corsHeaders });
    }

    // 3. RANDEVULARI LİSTELE
    if (path === "appointments" && method === "GET") {
      let query = "SELECT a.*, b.name as business_name FROM appointments a JOIN businesses b ON a.business_id = b.id ";
      let params = [];

      if (auth.role !== "superadmin") {
        query += "WHERE a.business_id = ? ";
        params.push(auth.id);
      }
      query += "ORDER BY a.appointment_date DESC, a.appointment_time ASC";

      const rows = await db.prepare(query).bind(...params).all();
      return new Response(JSON.stringify(rows.results || []), { headers: corsHeaders });
    }

    // 4. RANDEVU SİL
    if (path === "delete-appointment" && method === "POST") {
      const { id } = await request.json();
      const now = new Date().toISOString();

      await db.prepare(
        "UPDATE appointments SET is_deleted = 1, deleted_by = ?, deleted_at = ? WHERE id = ?"
      ).bind(auth.name + " (" + auth.role + ")", now, id).run();

      await db.prepare(
        "INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, ?, ?, ?)"
      ).bind(auth.id, "DELETE_APPOINTMENT", `Randevu (#${id}) silindi.`, auth.name).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 5. BLOG GÖNDER
    if (path === "create-blog" && method === "POST") {
      const { title, content } = await request.json();
      await db.prepare(
        "INSERT INTO blogs (business_id, title, content, status) VALUES (?, ?, ?, 'pending')"
      ).bind(auth.id, title, content).run();

      return new Response(JSON.stringify({ success: true, message: "Yazınız Süper Admin onayına iletildi." }), { headers: corsHeaders });
    }

    // 6. BLOG ONAYLA/REDDET
    if (path === "moderate-blog" && method === "POST") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });
      const { id, status } = await request.json();

      await db.prepare("UPDATE blogs SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 7. ŞİFRE DEĞİŞTİR
    if (path === "change-password" && method === "POST") {
      const { target_business_id, new_password } = await request.json();
      const targetId = (auth.role === "superadmin" && target_business_id) ? target_business_id : auth.id;

      await db.prepare("UPDATE businesses SET password_hash = ? WHERE id = ?").bind(new_password, targetId).run();
      
      await db.prepare(
        "INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, ?, ?, ?)"
      ).bind(targetId, "CHANGE_PASSWORD", "Şifre güncellendi.", auth.name).run();

      return new Response(JSON.stringify({ success: true, message: "Şifre güncellendi." }), { headers: corsHeaders });
    }

    // 8. SÜPER ADMİN VERİLERİ
    if (path === "superadmin-data" && method === "GET") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });

      const businesses = await db.prepare("SELECT id, name, category, username, password_hash, role FROM businesses").all();
      const logs = await db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50").all();
      const blogs = await db.prepare("SELECT b.*, bs.name as business_name FROM blogs b JOIN businesses bs ON b.business_id = bs.id ORDER BY b.created_at DESC").all();

      return new Response(JSON.stringify({
        businesses: businesses.results || [],
        logs: logs.results || [],
        blogs: blogs.results || []
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "API rotası bulunamadı" }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
