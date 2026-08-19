// CLOUDFLARE BACKEND - RANDEVU, BLOG, LOG & ÇALIŞMA SAATLERİ MOTORU
const JWT_SECRET = "04agri-super-secret-key-2026-secure";

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

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
    return JSON.parse(base64ToUtf8(payloadB64));
  } catch (e) {
    return null;
  }
}

async function createToken(payload) {
  const payloadB64 = utf8ToBase64(JSON.stringify(payload));
  const sig = await hashPassword(payloadB64 + JWT_SECRET);
  return `${payloadB64}.${sig}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
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
    // 1. KURULUM ROTASI (Veritabanı Güncelleme)
    // -----------------------------------------------------------
    if (pathname.includes("setup")) {
      await db.prepare(`CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'business', phone TEXT, email TEXT, address TEXT, is_frozen INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, business_id TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT, customer_note TEXT, appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL, status TEXT DEFAULT 'Bekliyor', is_deleted INTEGER DEFAULT 0, deleted_by TEXT, deleted_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, working_days TEXT DEFAULT '["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"]', slot_duration INTEGER DEFAULT 30, blocked_hours TEXT DEFAULT '[]')`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS blogs (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, status TEXT DEFAULT 'pending', rejection_reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, approved_at DATETIME)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, action TEXT NOT NULL, details TEXT NOT NULL, performed_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();

      const businesses = [
        ['superadmin', 'Süper Yönetici (Sen)', 'admin', 'superadmin', 'Agri04SuperAdmin!', 'superadmin', '05400000000', 'admin@04agri.com'],
        ['sevval-tasdemir', 'Şevval Taşdemir (Dil Terapisti)', 'saglik', 'dktsevval', 'Sevval04!', 'business', '05412410704', 'sevval@04agri.com'],
        ['dilek-polat', 'Dilek Polat (Psikolog)', 'saglik', 'pskdilek', 'Dilek04!', 'business', '05400000001', 'dilek@04agri.com'],
        ['bilge-igan', 'Uzm. Dyt. Bilge İgan Yıldırım', 'saglik', 'dytbilge', 'Bilge04!', 'business', '04722150184', 'bilge@04agri.com'],
        ['berika-kurucay', 'Dyt. Berika Kuruçay', 'saglik', 'dytberika', 'Berika04!', 'business', '05400000002', 'berika@04agri.com'],
        ['seda-nur-dursun', 'Dyt. Seda Nur Dursun', 'saglik', 'dytseda', 'Seda04!', 'business', '05400000003', 'seda@04agri.com'],
        ['seher-issi', 'Dyt. Seher Issi', 'saglik', 'dytseher', 'Seher04!', 'business', '05400000004', 'seher@04agri.com'],
        ['hamiyet-sahin', 'Dyt. Hamiyet Şahin', 'saglik', 'dythamiyet', 'Hamiyet04!', 'business', '05400000005', 'hamiyet@04agri.com'],
        ['melike-cukadar', 'Melike Çukadar (Ergoterapist)', 'saglik', 'ergomelike', 'Melike04!', 'business', '05513421108', 'melike@04agri.com'],
        ['dr-nilay', 'Dr. Nilay Dinçgözoğlu', 'saglik', 'drnilay', 'Nilay04!', 'business', '04725021282', 'nilay@04agri.com'],
        ['club-maxfit', 'Club Maxfit Spor Salonu', 'spor', 'maxfit04', 'Maxfit04!', 'business', '05303453304', 'maxfit@04agri.com'],
        ['elit-dil', 'E.L.I.T Dil Kursu', 'egitim', 'elitdil', 'Elit04!', 'business', '05338958255', 'elit@04agri.com'],
        ['bright-english', 'Bright English (İrem Kaya)', 'egitim', 'brightenglish', 'Bright04!', 'business', '05400000006', 'bright@04agri.com'],
        ['nevra-basci', 'Nevra Başcı (Matematik)', 'egitim', 'nevramat', 'Nevra04!', 'business', '05400000007', 'nevra@04agri.com'],
        ['emir-hoca', 'Emir Hoca (Matematik)', 'egitim', 'emirhocamat', 'Emir04!', 'business', '05466129809', 'emir@04agri.com'],
        ['canan-hoca', 'Canan Hoca (Matematik)', 'egitim', 'cananhocamat', 'Canan04!', 'business', '05533803545', 'canan@04agri.com'],
        ['muhammed-hoca', 'Muhammed Hoca (Müzik)', 'egitim', 'muhammedmuzik', 'Muhammed04!', 'business', '05459712132', 'muhammed@04agri.com'],
        ['merve-hoca', 'Merve Hoca (Piyano/Flüt)', 'egitim', 'mervemuzik', 'Merve04!', 'business', '05400000008', 'merve@04agri.com'],
        ['bahar-igan', 'Bahar İgan Bağan (Yaşam Koçu)', 'danismanlik', 'baharkoc', 'Bahar04!', 'business', '05400000009', 'bahar@04agri.com'],
        ['ozge-nur-celik', 'Özge Nur Çelik (Çocuk Gelişimi)', 'danismanlik', 'ozgegelisim', 'Ozge04!', 'business', '05400000010', 'ozge@04agri.com'],
        ['berivan-hoca', 'Berivan Hoca (Çocuk Gelişimi)', 'danismanlik', 'berivangelisim', 'Berivan04!', 'business', '05400000011', 'berivan@04agri.com'],
        ['omer-hoca', 'Ömer Hoca (Hareket Eğitimi)', 'danismanlik', 'omerhareket', 'Omer04!', 'business', '05466630461', 'omer@04agri.com'],
        ['seastarsoft', 'SeaStarSoft', 'yazilim', 'seastarsoft', 'Seastar04!', 'business', '05400000012', 'seastar@04agri.com'],
        ['bluversea', 'Bluversea', 'yazilim', 'bluversea', 'Bluversea04!', 'business', '05400000013', 'bluversea@04agri.com']
      ];

      for (const b of businesses) {
        await db.prepare(`INSERT OR REPLACE INTO businesses (id, name, category, username, password_hash, role, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(...b).run();
      }

      return new Response(JSON.stringify({ success: true, message: "Sistem ve Veritabanı %100 Güncellendi." }), { headers: corsHeaders });
    }

    // -----------------------------------------------------------
    // 2. GİRİŞ YAPMA (LOGIN)
    // -----------------------------------------------------------
    if (pathname.includes("login") && method === "POST") {
      const { username, password } = await request.json();
      const user = await db.prepare("SELECT * FROM businesses WHERE username = ?").bind(username).first();

      if (!user || user.is_frozen === 1) {
        return new Response(JSON.stringify({ error: user?.is_frozen ? "Hesabınız dondurulmuştur!" : "Kullanıcı adı veya şifre hatalı!" }), { status: 401, headers: corsHeaders });
      }

      const inputHash = await hashPassword(password);
      const isMatch = (user.password_hash === password) || (user.password_hash === inputHash);

      if (!isMatch) {
        return new Response(JSON.stringify({ error: "Kullanıcı adı veya şifre hatalı!" }), { status: 401, headers: corsHeaders });
      }

      const token = await createToken({ id: user.id, role: user.role, name: user.name });
      return new Response(JSON.stringify({ success: true, token, user: { id: user.id, name: user.name, role: user.role, username: user.username, phone: user.phone, email: user.email } }), { headers: corsHeaders });
    }

    // -----------------------------------------------------------
    // 3. HERKESE AÇIK: RANDEVU ALMA
    // -----------------------------------------------------------
    if (pathname.includes("book-appointment") && method === "POST") {
      const data = await request.json();
      const { business_id, customer_name, customer_phone, customer_email, customer_note, appointment_date, appointment_time } = data;
      const code = "AGR-" + Math.floor(1000 + Math.random() * 9000);

      await db.prepare(
        "INSERT INTO appointments (code, business_id, customer_name, customer_phone, customer_email, customer_note, appointment_date, appointment_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(code, business_id, customer_name, customer_phone, customer_email || "", customer_note || "", appointment_date, appointment_time).run();

      await db.prepare(
        "INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'NEW_APPOINTMENT', ?, ?)"
      ).bind(business_id, `Yeni randevu alındı (${customer_name} - ${appointment_date} ${appointment_time})`, customer_name).run();

      return new Response(JSON.stringify({ success: true, code, message: "Randevunuz oluşturuldu." }), { headers: corsHeaders });
    }

    // -----------------------------------------------------------
    // 4. HERKESE AÇIK: MÜŞTERİ KOD İLE İPTAL
    // -----------------------------------------------------------
    if (pathname.includes("cancel-by-code") && method === "POST") {
      const { code, phone } = await request.json();
      const appt = await db.prepare("SELECT * FROM appointments WHERE code = ? AND customer_phone LIKE ? AND is_deleted = 0").bind(code, `%${phone.replace(/\s/g,'')}%`).first();

      if (!appt) {
        return new Response(JSON.stringify({ error: "Geçersiz randevu kodu veya telefon numarası!" }), { status: 404, headers: corsHeaders });
      }

      const now = new Date().toISOString();
      await db.prepare("UPDATE appointments SET is_deleted = 1, deleted_by = 'Kullanıcı (Müşteri İptali)', deleted_at = ? WHERE id = ?").bind(now, appt.id).run();

      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'CUSTOMER_CANCEL', ?, ?)")
        .bind(appt.business_id, `Müşteri randevusunu iptal etti (Kod: ${code})`, appt.customer_name).run();

      return new Response(JSON.stringify({ success: true, message: "Randevunuz başarıyla iptal edildi." }), { headers: corsHeaders });
    }

    // -----------------------------------------------------------
    // 5. HERKESE AÇIK: ONAYLI BLOGLAR
    // -----------------------------------------------------------
    if (pathname.includes("public-blogs") && method === "GET") {
      const blogs = await db.prepare(
        "SELECT b.id, b.title, b.content, b.created_at, bs.name as business_name FROM blogs b JOIN businesses bs ON b.business_id = bs.id WHERE b.status = 'approved' ORDER BY b.created_at DESC"
      ).all();
      return new Response(JSON.stringify(blogs.results || []), { headers: corsHeaders });
    }

    // -----------------------------------------------------------
    // GÜVENLİK DOĞRULAMA (Aşağıdakiler Token Gerektirir)
    // -----------------------------------------------------------
    const auth = await verifyAuth(request);
    if (!auth) return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401, headers: corsHeaders });

    // 6. RANDEVULARI GETİR (İşletme veya Superadmin)
    if (pathname.includes("appointments") && method === "GET") {
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

    // 7. RANDEVU SİL / ONAYLA (İşletme / Superadmin)
    if (pathname.includes("delete-appointment") && method === "POST") {
      const { id } = await request.json();
      const now = new Date().toISOString();

      await db.prepare("UPDATE appointments SET is_deleted = 1, deleted_by = ?, deleted_at = ? WHERE id = ?")
        .bind(`${auth.name} (${auth.role})`, now, id).run();

      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'DELETE_APPOINTMENT', ?, ?)")
        .bind(auth.id, `Randevu (#${id}) silindi.`, auth.name).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (pathname.includes("approve-appointment") && method === "POST") {
      const { id } = await request.json();
      await db.prepare("UPDATE appointments SET status = 'Onaylandı' WHERE id = ?").bind(id).run();
      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'APPROVE_APPOINTMENT', ?, ?)")
        .bind(auth.id, `Randevu (#${id}) onaylandı.`, auth.name).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 8. ÇALIŞMA SAATLERİ & SEANS SÜRESİ YÖNETİMİ
    if (pathname.includes("get-schedule") && method === "GET") {
      const sch = await db.prepare("SELECT * FROM schedules WHERE business_id = ?").bind(auth.id).first();
      return new Response(JSON.stringify(sch || { working_days: '["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"]', slot_duration: 30, blocked_hours: '[]' }), { headers: corsHeaders });
    }

    if (pathname.includes("save-schedule") && method === "POST") {
      const { working_days, slot_duration, blocked_hours } = await request.json();
      await db.prepare("INSERT OR REPLACE INTO schedules (business_id, working_days, slot_duration, blocked_hours) VALUES (?, ?, ?, ?)")
        .bind(auth.id, JSON.stringify(working_days), slot_duration, JSON.stringify(blocked_hours)).run();
      return new Response(JSON.stringify({ success: true, message: "Çalışma saatleri kaydedildi." }), { headers: corsHeaders });
    }

    // 9. BLOG İŞLEMLERİ
    if (pathname.includes("my-blogs") && method === "GET") {
      const blogs = await db.prepare("SELECT * FROM blogs WHERE business_id = ? ORDER BY created_at DESC").bind(auth.id).all();
      return new Response(JSON.stringify(blogs.results || []), { headers: corsHeaders });
    }

    if (pathname.includes("create-blog") && method === "POST") {
      const { title, content } = await request.json();
      await db.prepare("INSERT INTO blogs (business_id, title, content, status) VALUES (?, ?, ?, 'pending')")
        .bind(auth.id, title, content).run();
      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'NEW_BLOG', ?, ?)")
        .bind(auth.id, `Yeni blog onaya gönderildi (${title})`, auth.name).run();
      return new Response(JSON.stringify({ success: true, message: "Yazınız Süper Admin onayına iletildi." }), { headers: corsHeaders });
    }

    if (pathname.includes("delete-blog") && method === "POST") {
      const { id } = await request.json();
      await db.prepare("DELETE FROM blogs WHERE id = ? AND (business_id = ? OR ? = 'superadmin')")
        .bind(id, auth.id, auth.role).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 10. SÜPER ADMİN BLOG ONAY / RET (Gerekçeli)
    if (pathname.includes("moderate-blog") && method === "POST") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });
      const { id, status, rejection_reason } = await request.json();

      await db.prepare("UPDATE blogs SET status = ?, rejection_reason = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(status, rejection_reason || "", id).run();

      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES ('superadmin', 'MODERATE_BLOG', ?, 'Süper Admin')")
        .bind(`Blog (#${id}) durumu: ${status} (Gerekçe: ${rejection_reason || 'Yok'})`).run();

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 11. PROFİL & ŞİFRE GÜNCELLEME
    if (pathname.includes("update-profile") && method === "POST") {
      const { username, password, phone, email } = await request.json();
      
      let query = "UPDATE businesses SET username = ?, phone = ?, email = ?";
      let params = [username, phone, email];

      if (password && password.trim() !== "") {
        query += ", password_hash = ?";
        params.push(password.trim());
      }
      query += " WHERE id = ?";
      params.push(auth.id);

      await db.prepare(query).bind(...params).run();
      await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'UPDATE_PROFILE', 'Profil bilgileri güncellendi.', ?)")
        .bind(auth.id, auth.name).run();

      return new Response(JSON.stringify({ success: true, message: "Bilgileriniz başarıyla güncellendi." }), { headers: corsHeaders });
    }

    // 12. SÜPER ADMİN TÜM YÖNETİM VERİLERİ
    if (pathname.includes("superadmin-data") && method === "GET") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });

      const businesses = await db.prepare("SELECT * FROM businesses ORDER BY role DESC, name ASC").all();
      const logs = await db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").all();
      const blogs = await db.prepare("SELECT b.*, bs.name as business_name FROM blogs b JOIN businesses bs ON b.business_id = bs.id ORDER BY b.created_at DESC").all();

      return new Response(JSON.stringify({
        businesses: businesses.results || [],
        logs: logs.results || [],
        blogs: blogs.results || []
      }), { headers: corsHeaders });
    }

    // 13. SÜPER ADMİN MÜDAHALE (İşletme Dondurma, Şifre Değiştirme)
    if (pathname.includes("superadmin-action") && method === "POST") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });
      const { action, target_id, value, value2 } = await request.json();

      if (action === "change_creds") {
        await db.prepare("UPDATE businesses SET username = ?, password_hash = ? WHERE id = ?").bind(value, value2, target_id).run();
        await db.prepare("INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, 'ADMIN_OVERRIDE', 'Kullanıcı adı ve şifre süperadmin tarafından değiştirildi.', 'Süper Admin')").bind(target_id).run();
      } else if (action === "toggle_freeze") {
        await db.prepare("UPDATE businesses SET is_frozen = ? WHERE id = ?").bind(value ? 1 : 0, target_id).run();
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "API rotası bulunamadı" }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
