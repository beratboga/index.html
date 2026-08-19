// CLOUDFLARE FUNCTIONS BACKEND MOTORU
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
  const db = env.DB; // Cloudflare D1 veritabanı

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json;charset=UTF-8"
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. GİRİŞ YAPMA (LOGIN)
    if (path === "login" && method === "POST") {
      const { username, password } = await request.json();
      
      // Hem düz şifreyi hem hashli şifreyi kontrol eder
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

    // 3. HERKESE AÇIK: ONAYLI BLOGLARI GETİR
    if (path === "public-blogs" && method === "GET") {
      const blogs = await db.prepare(
        "SELECT b.id, b.title, b.content, b.created_at, bs.name as business_name FROM blogs b JOIN businesses bs ON b.business_id = bs.id WHERE b.status = 'approved' ORDER BY b.created_at DESC"
      ).all();
      return new Response(JSON.stringify(blogs.results || []), { headers: corsHeaders });
    }

    // GÜVENLİK KONTROLÜ
    const auth = await verifyAuth(request);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401, headers: corsHeaders });
    }

    // 4. RANDEVULARI LİSTELE
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

    // 5. RANDEVU SİL (Silinse de kim sildi ne zaman sildi loglar)
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

    // 6. BLOG YAZISI GÖNDER (Süper Admin Onayına Düşer)
    if (path === "create-blog" && method === "POST") {
      const { title, content } = await request.json();
      await db.prepare(
        "INSERT INTO blogs (business_id, title, content, status) VALUES (?, ?, ?, 'pending')"
      ).bind(auth.id, title, content).run();

      return new Response(JSON.stringify({ success: true, message: "Yazınız Süper Admin onayına iletildi." }), { headers: corsHeaders });
    }

    // 7. SÜPER ADMİN: BLOGLARI ONAYLA / REDDET
    if (path === "moderate-blog" && method === "POST") {
      if (auth.role !== "superadmin") return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 403, headers: corsHeaders });
      const { id, status } = await request.json();

      await db.prepare("UPDATE blogs SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 8. ŞİFRE DEĞİŞTİRME (İşletme kendininkini, Süper Admin herkesinkini)
    if (path === "change-password" && method === "POST") {
      const { target_business_id, new_password } = await request.json();
      const targetId = (auth.role === "superadmin" && target_business_id) ? target_business_id : auth.id;

      await db.prepare("UPDATE businesses SET password_hash = ? WHERE id = ?").bind(new_password, targetId).run();
      
      await db.prepare(
        "INSERT INTO audit_logs (business_id, action, details, performed_by) VALUES (?, ?, ?, ?)"
      ).bind(targetId, "CHANGE_PASSWORD", "Şifre güncellendi.", auth.name).run();

      return new Response(JSON.stringify({ success: true, message: "Şifre başarıyla güncellendi." }), { headers: corsHeaders });
    }

    // 9. SÜPER ADMİN: TÜM İŞLETME BİLGİLERİ VE LOGLAR
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
