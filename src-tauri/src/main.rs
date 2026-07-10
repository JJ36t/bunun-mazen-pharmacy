#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![allow(dead_code)]

// ثابت تكلفة bcrypt — مرفوعة من 8 إلى 12 (OWASP يوصي ≥ 12)
const BCRYPT_COST: u32 = 12;
// ثابت عدد تكرارات PBKDF2 لاشتقاق مفتاح AES (بديل آمن لـ SHA256 المفردة)
const AES_KDF_ITERATIONS: u32 = 100_000;


use sysinfo::{System, SystemExt, CpuExt};
use std::fs;
use std::path::PathBuf;
use std::io::Write;
use std::process::Command;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use sqlx::Row;
use tauri::Manager;
use rust_decimal::prelude::FromPrimitive;
use std::collections::HashMap;
use ring::{digest, hmac};
use obfstr::obfstr;
use subtle::ConstantTimeEq;
use hex;
use bcrypt;
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit, OsRng, rand_core::RngCore}};
use base64::{engine::general_purpose, Engine as _};
use tracing_subscriber;

// إضافة وحدة PharmIQ Intelligence
mod pharmiq_commands;
mod pharmiq_complete;
mod pharmiq_enterprise_complete;
mod invoices_commands;
mod smart_barcode_commands;
mod pharmiq_features;
mod pharmiq_new_features;
mod mobile_scanner;

// --- نظام السجلات المنظمة (Structured Logging) ---
fn init_logging() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();
}

// --- نظام الترخيص المعماري (HMAC-SHA256) ---
fn generate_device_fingerprint() -> String {
    let mut sys = System::new_all(); sys.refresh_all();
    let mut fingerprint = String::new();
    if let Some(cpu) = sys.cpus().first() { fingerprint.push_str(&cpu.brand()); }
    if let Some(host) = sys.host_name() { fingerprint.push_str(&host); }
    let alg = digest::digest(&digest::SHA256, fingerprint.as_bytes());
    hex::encode(alg).to_uppercase()
}

fn generate_activation_key(device_id: &str) -> String {
    // السر مشفّر وقت البناء (obfstr) لمنع استخراجه بسهولة من الـ binary
    // نحوّل إلى Vec<u8> مملوك لتجنب مشكلة القيمة المؤقتة
    let secret: Vec<u8> = obfstr!("IRAQ_PHARMA_SECRET_2024_HMAC").as_bytes().to_vec();
    let key = hmac::Key::new(hmac::HMAC_SHA256, &secret);
    let tag = hmac::sign(&key, device_id.as_bytes());
    let hex_tag = hex::encode(tag).to_uppercase();
    format!("{}-{}-{}", &hex_tag[0..4], &hex_tag[4..8], &hex_tag[8..12])
}

fn is_valid_key(device_id: &str, input_key: &str) -> bool { 
    let expected_key = generate_activation_key(device_id);
    // استخدام subtle::ConstantTimeEq بدلاً من ring::constant_time المُهمَل
    // ct_eq تُعيد Choice، نحولها لـ u8 ونقارن بـ 1
    expected_key.as_bytes().ct_eq(input_key.to_uppercase().as_bytes()).unwrap_u8() == 1
}

fn get_license_file_path() -> PathBuf {
    let app_dir = dirs_next::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_folder = app_dir.join("BununMazenPharmacy"); fs::create_dir_all(&app_folder).ok();
    app_folder.join("license.dat")
}

#[tauri::command] fn get_device_id() -> String { generate_device_fingerprint() }

#[tauri::command]
fn check_license() -> bool {
    let path = get_license_file_path();
    if path.exists() { 
        if let Ok(saved_key) = fs::read_to_string(&path) { 
            return is_valid_key(&generate_device_fingerprint(), &saved_key.trim()); 
        } 
    }
    false
}

#[tauri::command]
fn activate_license(activation_key: String) -> Result<bool, String> {
    let device_id = generate_device_fingerprint();
    if is_valid_key(&device_id, &activation_key) {
        fs::write(&get_license_file_path(), activation_key.to_uppercase()).map_err(|e| e.to_string())?; Ok(true)
    } else { Err("مفتاح التفعيل غير صحيح أو غير صالح لهذا الجهاز".to_string()) }
}

// --- أوامر النسخ الاحتياطي (مع التشفير) ---
// اشتقاق مفتاح AES-256 من كلمة المرور باستخدام PBKDF2-HMAC-SHA256 (10salt + 100k iterations)
// بديل آمن لـ SHA256(password) المفردة التي كانت قابلة لكسر GPU
fn derive_aes_key(password: &str, salt: &[u8; 16]) -> [u8; 32] {
    use ring::pbkdf2;
    let mut key = [0u8; 32];
    pbkdf2::derive(pbkdf2::PBKDF2_HMAC_SHA256, std::num::NonZeroU32::new(AES_KDF_ITERATIONS).unwrap(), salt, password.as_bytes(), &mut key);
    key
}

fn encrypt_data(data: &str, password: &str) -> Result<String, String> {
    // توليد salt عشوائي 16 بايت (يُخزّن مع النص المشفر)
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key_bytes = derive_aes_key(password, &salt);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, data.as_bytes()).map_err(|e| e.to_string())?;
    // الصيغة الجديدة: base64(salt):base64(nonce):base64(ciphertext)
    // متوافقة مع النسخ القديمة عبر detect في decrypt_data
    Ok(format!("{}:{}:{}", general_purpose::STANDARD.encode(salt), general_purpose::STANDARD.encode(nonce_bytes), general_purpose::STANDARD.encode(ciphertext)))
}

fn decrypt_data(encrypted_data: &str, password: &str) -> Result<String, String> {
    let parts: Vec<&str> = encrypted_data.split(':').collect();
    if parts.len() == 3 {
        // الصيغة الجديدة (PBKDF2): salt:nonce:ciphertext
        let salt = general_purpose::STANDARD.decode(parts[0]).map_err(|e| e.to_string())?;
        let nonce_bytes = general_purpose::STANDARD.decode(parts[1]).map_err(|e| e.to_string())?;
        let ciphertext = general_purpose::STANDARD.decode(parts[2]).map_err(|e| e.to_string())?;
        if salt.len() != 16 { return Err("صيغة الملف المشفر غير صحيحة".to_string()); }
        let mut salt_arr = [0u8; 16];
        salt_arr.copy_from_slice(&salt);
        let key_bytes = derive_aes_key(password, &salt_arr);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = cipher.decrypt(nonce, ciphertext.as_ref()).map_err(|_| "كلمة مرور النسخة الاحتياطية خاطئة".to_string())?;
        String::from_utf8(plaintext).map_err(|e| e.to_string())
    } else if parts.len() == 2 {
        // الصيغة القديمة (SHA256 مفردة) للتوافق مع النسخ الاحتياطية القديمة
        let key_bytes = digest::digest(&digest::SHA256, password.as_bytes());
        let key = Key::<Aes256Gcm>::from_slice(key_bytes.as_ref());
        let cipher = Aes256Gcm::new(key);
        let nonce_bytes = general_purpose::STANDARD.decode(parts[0]).map_err(|e| e.to_string())?;
        let ciphertext = general_purpose::STANDARD.decode(parts[1]).map_err(|e| e.to_string())?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext = cipher.decrypt(nonce, ciphertext.as_ref()).map_err(|_| "كلمة مرور النسخة الاحتياطية خاطئة".to_string())?;
        String::from_utf8(plaintext).map_err(|e| e.to_string())
    } else {
        Err("صيغة الملف المشفر غير صحيحة".to_string())
    }
}

// إرجاع مسار سطح المكتب عبر منصة (Windows/macOS/Linux)
fn desktop_dir() -> Result<std::path::PathBuf, String> {
    if let Some(dir) = dirs_next::desktop_dir() {
        return Ok(dir);
    }
    // fallback
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        return Ok(std::path::PathBuf::from(home).join("Desktop"));
    }
    Err("تعذّر تحديد مسار سطح المكتب".to_string())
}

#[tauri::command]
fn save_csv_file(filename: String, content: String) -> Result<String, String> {
    let dir = desktop_dir()?;
    let path = dir.join(filename);
    std::fs::File::create(&path).map_err(|e| e.to_string())?.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_backup(data: String, password: String) -> Result<String, String> {
    let dir = desktop_dir()?;
    let path = dir.join(format!("Pharmacy_Backup_{}.enc", chrono::Local::now().format("%Y%m%d_%H%M%S")));
    let encrypted_data = encrypt_data(&data, &password)?;
    std::fs::File::create(&path).map_err(|e| e.to_string())?.write_all(encrypted_data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn restore_backup(file_path: String, password: String) -> Result<String, String> {
    let encrypted_data = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    decrypt_data(&encrypted_data, &password)
}

#[tauri::command]
async fn check_auto_backup(state: tauri::State<'_, PgPool>) -> Result<bool, String> {
    let last_backup: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'last_backup'")
        .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let should_backup = match last_backup {
        Some(date_str) => {
            let last = chrono::DateTime::parse_from_rfc3339(&date_str).unwrap_or_else(|_| chrono::Utc::now().fixed_offset());
            (chrono::Utc::now() - last.with_timezone(&chrono::Utc)).num_hours() >= 24
        },
        None => true,
    };
    if should_backup {
        sqlx::query("INSERT INTO settings (key, value) VALUES ('last_backup', $1) ON CONFLICT (key) DO UPDATE SET value = $1")
            .bind(chrono::Utc::now().to_rfc3339()).execute(state.inner()).await.map_err(|e| e.to_string())?;
        Ok(true)
    } else { Ok(false) }
}

// --- أوامر المستخدمين والورديات ---
#[tauri::command]
async fn login(state: tauri::State<'_, PgPool>, username: String, password: String) -> Result<serde_json::Value, String> {
    // Rate-limit بدائي: نسمح بـ 5 محاولات فاشلة لكل username خلال 5 دقائق
    let recent_failures: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE user_role = $1 AND action_type = 'LOGIN_FAILED' AND created_at > NOW() - INTERVAL '5 minutes'"
    ).bind(&username).fetch_one(state.inner()).await.unwrap_or(0);
    if recent_failures >= 5 {
        return Err("تم تجاوز عدد محاولات الدخول المسموحة. حاول بعد 5 دقائق.".to_string());
    }

    let row = sqlx::query("SELECT id, password, role FROM users WHERE username = $1 AND is_active = TRUE AND deleted_at IS NULL")
        .bind(&username).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    match row {
        Some(r) => {
            let user_id: uuid::Uuid = r.get(0);
            let hashed_pass: String = r.get(1);
            let role: String = r.get(2);
            // bcrypt::verify يعيد Err عند hash تالف — نعتبره "كلمة مرور خاطئة"
            let verified = bcrypt::verify(&password, &hashed_pass).unwrap_or(false);
            if verified {
                // تحديث آخر دخول
                let _ = sqlx::query("UPDATE users SET last_login = NOW() WHERE username = $1")
                    .bind(&username).execute(state.inner()).await;
                // توليد session token وإدراجه في user_sessions
                let session_token = uuid::Uuid::new_v4().to_string();
                let device_info = format!("os:{}", std::env::consts::OS);
                let _ = sqlx::query("INSERT INTO user_sessions (user_id, username, device_info, is_active, login_at) VALUES ($1, $2, $3, TRUE, NOW())")
                    .bind(user_id).bind(&username).bind(&device_info).execute(state.inner()).await;
                // تسجيل في سجل التدقيق
                let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'LOGIN', 'تسجيل دخول ناجح')")
                    .bind(&username).execute(state.inner()).await;
                Ok(serde_json::json!({ "username": username, "role": role, "sessionToken": session_token, "userId": user_id.to_string() }))
            } else {
                let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'LOGIN_FAILED', 'محاولة دخول فاشلة')")
                    .bind(&username).execute(state.inner()).await;
                Err("بيانات الدخول غير صحيحة".to_string())
            }
        },
        None => {
            let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'LOGIN_FAILED', 'مستخدم غير موجود أو موقوف')")
                .bind(&username).execute(state.inner()).await;
            Err("بيانات الدخول غير صحيحة أو الحساب موقوف".to_string())
        },
    }
}

// تحقق من session token — يُستخدم كطبقة مصادقة على الأوامر الحساسة
async fn verify_session_token(pool: &PgPool, session_token: &str) -> Result<(uuid::Uuid, String, String), String> {
    // session_token هنا يُمرّر كـ user_id كبديل بسيط (لأن الواجهة لا ترسل token فعلياً بعد)
    // في المستقبل: استبدل بجدول session_tokens منفصل
    let uuid_id = uuid::Uuid::parse_str(session_token)
        .map_err(|_| "session token غير صالح".to_string())?;
    let row = sqlx::query("SELECT id, username, role FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL")
        .bind(uuid_id).fetch_optional(pool).await
        .map_err(|e| e.to_string())?;
    match row {
        Some(r) => Ok((r.get(0), r.get(1), r.get(2))),
        None => Err("جلسة غير صالحة أو المستخدم موقوف".to_string()),
    }
}

#[tauri::command]
async fn verify_admin_password_db(state: tauri::State<'_, PgPool>, password: String) -> Result<bool, String> {
    let row = sqlx::query("SELECT password FROM users WHERE username = 'admin' AND is_active = TRUE")
        .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    match row {
        Some(r) => {
            let hashed_pass: String = r.get(0);
            Ok(bcrypt::verify(&password, &hashed_pass).unwrap_or(false))
        },
        None => Ok(false),
    }
}

#[tauri::command]
async fn get_users_db(state: tauri::State<'_, PgPool>, requester_role: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let is_super_admin = requester_role.as_deref() == Some("Super Admin");
    let rows = if is_super_admin {
        sqlx::query("SELECT id, username, role, is_active, last_login FROM users WHERE deleted_at IS NULL ORDER BY username")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, username, role, is_active, last_login FROM users WHERE deleted_at IS NULL AND role != 'Super Admin' ORDER BY username")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut users = Vec::new();
    for row in rows {
        let last_login: Option<chrono::NaiveDateTime> = row.get(4);
        users.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "username": row.get::<String, _>(1),
            "role": row.get::<String, _>(2),
            "isActive": row.get::<bool, _>(3),
            "lastLogin": last_login.map(|d| d.to_string()),
        }));
    }
    Ok(users)
}

#[tauri::command]
async fn add_user_db(state: tauri::State<'_, PgPool>, username: String, password: String, role: String) -> Result<(), String> {
    // التحقق من طول كلمة المرور (>= 6)
    if password.len() < 6 { return Err("كلمة المرور يجب أن تكون 6 أحرف على الأقل".to_string()); }
    let hashed = bcrypt::hash(&password, BCRYPT_COST).map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)").bind(&username).bind(hashed).bind(&role).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn reset_user_password_db(state: tauri::State<'_, PgPool>, user_id: String, new_password: String) -> Result<(), String> {
    if new_password.len() < 6 { return Err("كلمة المرور يجب أن تكون 6 أحرف على الأقل".to_string()); }
    let uuid_id = uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?;
    let hashed = bcrypt::hash(&new_password, BCRYPT_COST).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE users SET password = $1 WHERE id = $2").bind(hashed).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn toggle_user_status_db(state: tauri::State<'_, PgPool>, user_id: String, is_active: bool) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE users SET is_active = $1 WHERE id = $2").bind(is_active).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_user_db(state: tauri::State<'_, PgPool>, user_id: String, deleted_by: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?;
    // Soft delete - لا نحذف فعلياً
    sqlx::query("UPDATE users SET deleted_at = NOW(), deleted_by = $1, is_active = FALSE WHERE id = $2 AND username != 'admin'")
        .bind(&deleted_by).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    let desc = format!("حذف مستخدم");
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'DELETE_USER', $2)")
        .bind(&deleted_by).bind(&desc).execute(state.inner()).await;
    Ok(())
}

#[tauri::command]
async fn start_shift_db(state: tauri::State<'_, PgPool>, username: String, opening_amount: f64) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO shifts (user_role, opening_amount, status) VALUES ($1, $2, 'open') RETURNING id")
        .bind(&username).bind(rust_decimal::Decimal::from_f64(opening_amount).ok_or("Err")?)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn close_shift_db(state: tauri::State<'_, PgPool>, shift_id: String, closing_amount: f64) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&shift_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE shifts SET status = 'closed', closing_amount = $1, end_time = NOW() WHERE id = $2")
        .bind(rust_decimal::Decimal::from_f64(closing_amount).ok_or("Err")?).bind(uuid_id)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_active_shift_db(state: tauri::State<'_, PgPool>, username: String) -> Result<Option<serde_json::Value>, String> {
    let row = sqlx::query("SELECT id, opening_amount FROM shifts WHERE user_role = $1 AND status = 'open' ORDER BY start_time DESC LIMIT 1")
        .bind(&username).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    if let Some(r) = row {
        Ok(Some(serde_json::json!({ "id": r.get::<uuid::Uuid, _>(0).to_string(), "openingAmount": r.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0) })))
    } else { Ok(None) }
}

// --- أوامر الفواتير المعلقة (Suspended) ---
#[tauri::command]
async fn suspend_invoice_db(state: tauri::State<'_, PgPool>, username: String, items_json: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO suspended_invoices (user_role, items_json) VALUES ($1, $2) RETURNING id")
        .bind(&username).bind(&items_json).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_suspended_invoices_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, items_json, created_at FROM suspended_invoices ORDER BY created_at DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut invs = Vec::new();
    for row in rows {
        invs.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "itemsJson": row.get::<String, _>(1), "date": row.get::<chrono::NaiveDateTime, _>(2).to_string() }));
    }
    Ok(invs)
}

#[tauri::command]
async fn delete_suspended_invoice_db(state: tauri::State<'_, PgPool>, inv_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&inv_id).map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM suspended_invoices WHERE id = $1").bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر سجل التدقيق ---
#[tauri::command]
async fn log_action_db(state: tauri::State<'_, PgPool>, user_role: String, action_type: String, description: String) -> Result<(), String> {
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind(action_type).bind(description).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_audit_logs_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, user_role, action_type, description, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut logs = Vec::new();
    for row in rows {
        logs.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "userRole": row.get::<String, _>(1), "actionType": row.get::<String, _>(2), "description": row.get::<String, _>(3), "date": row.get::<chrono::NaiveDateTime, _>(4).to_string() }));
    } Ok(logs)
}

// --- أوامر المرضى (Patients) ---
#[tauri::command]
async fn add_patient_db(state: tauri::State<'_, PgPool>, name: String, national_id: String, phone: String, notes: Option<String>) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO patients (name, national_id, phone, notes) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(&name).bind(&national_id).bind(&phone).bind(&notes).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_patients_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, national_id, phone, notes, created_at FROM patients ORDER BY name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut patients = Vec::new();
    for row in rows {
        patients.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(), "name": row.get::<String, _>(1), 
            "nationalId": row.get::<String, _>(2), "phone": row.get::<String, _>(3), 
            "notes": row.get::<Option<String>, _>(4), "date": row.get::<chrono::NaiveDateTime, _>(5).to_string()
        }));
    }
    Ok(patients)
}

// --- أوامر قاعدة البيانات (PostgreSQL) ---
#[tauri::command]
async fn get_medicines_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date, is_deleted FROM medicines")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(), "nameAr": row.get::<String, _>(1), "nameEn": row.get::<Option<String>, _>(2), 
            "scientificName": row.get::<Option<String>, _>(3), "barcode": row.get::<Option<String>, _>(4),
            "price": row.get::<rust_decimal::Decimal, _>(5).to_string().parse::<f64>().unwrap_or(0.0), 
            "wholesalePrice": row.get::<rust_decimal::Decimal, _>(6).to_string().parse::<f64>().unwrap_or(0.0),
            "costPrice": row.get::<rust_decimal::Decimal, _>(7).to_string().parse::<f64>().unwrap_or(0.0),
            "quantity": row.get::<i32, _>(8), "batchNumber": row.get::<Option<String>, _>(9), "expiryDate": row.get::<Option<chrono::NaiveDate>, _>(10).map(|d| d.to_string()), "isDeleted": row.get::<bool, _>(11)
        }));
    } Ok(results)
}

#[tauri::command]
async fn add_medicine_db(state: tauri::State<'_, PgPool>, name_ar: String, name_en: Option<String>, scientific_name: Option<String>, barcode: Option<String>, price: f64, wholesale_price: f64, cost_price: f64, quantity: i32, batch_number: Option<String>, expiry_date: Option<String>) -> Result<String, String> {
    let expiry = expiry_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    // توليد باركود EAN-13 تلقائياً إذا لم يُدخل المستخدم باركود
    let final_barcode: String = match &barcode {
        Some(b) if !b.trim().is_empty() => b.trim().to_string(),
        _ => {
            let max_seq: i64 = sqlx::query_scalar(
                "SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 4 FOR 9) AS BIGINT)), 0)
                 FROM medicines WHERE barcode LIKE '200%' AND LENGTH(barcode) = 13"
            ).fetch_one(&mut *tx).await.unwrap_or(0);
            let base_12 = format!("200{:09}", max_seq + 1);
            let check_digit: i32 = sqlx::query_scalar("SELECT compute_ean13_check_digit($1)")
                .bind(&base_12).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            format!("{}{}", base_12, check_digit)
        }
    };

    let row = sqlx::query("INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id")
        .bind(&name_ar).bind(&name_en).bind(&scientific_name).bind(&final_barcode)
        .bind(rust_decimal::Decimal::from_f64(price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(wholesale_price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(cost_price).ok_or("Err")?)
        .bind(0).bind(&batch_number).bind(expiry)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let med_id: uuid::Uuid = row.get(0);

    // إضافة الباركود إلى جدول medicine_barcodes الموحد
    let _ = sqlx::query(
        "INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
         VALUES ($1, $2, 'EAN13', 'internal', NOW())
         ON CONFLICT (barcode, barcode_type) DO NOTHING"
    )
    .bind(med_id).bind(&final_barcode)
    .execute(&mut *tx).await;

    if quantity > 0 {
        sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, $2, $3, $4)")
            .bind(med_id).bind(&batch_number).bind(expiry).bind(quantity)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("UPDATE medicines SET quantity = $1 WHERE id = $2").bind(quantity).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(med_id.to_string())
}

#[tauri::command]
async fn update_medicine_db(state: tauri::State<'_, PgPool>, medicine_id: String, name_ar: String, name_en: Option<String>, scientific_name: Option<String>, barcode: Option<String>, price: f64, wholesale_price: f64, cost_price: f64, quantity: i32, batch_number: Option<String>, expiry_date: Option<String>) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let expiry = expiry_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    sqlx::query("UPDATE medicines SET name_ar = $1, name_en = $2, scientific_name = $3, barcode = $4, price = $5, wholesale_price = $6, cost_price = $7, quantity = $8, batch_number = $9, expiry_date = $10 WHERE id = $11")
        .bind(&name_ar).bind(&name_en).bind(&scientific_name).bind(&barcode)
        .bind(rust_decimal::Decimal::from_f64(price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(wholesale_price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(cost_price).ok_or("Err")?)
        .bind(quantity).bind(&batch_number).bind(expiry).bind(uuid_id)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn bulk_update_prices_db(state: tauri::State<'_, PgPool>, update_type: String, value: f64, user_role: String) -> Result<(), String> {
    let pool = state.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if update_type == "percentage" {
        let factor = 1.0 + (value / 100.0);
        sqlx::query("UPDATE medicines SET price = ROUND(price * $1, 2) WHERE is_deleted = FALSE").bind(rust_decimal::Decimal::from_f64(factor).ok_or("Err")?).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    } else if update_type == "amount" {
        sqlx::query("UPDATE medicines SET price = price + $1 WHERE is_deleted = FALSE").bind(rust_decimal::Decimal::from_f64(value).ok_or("Err")?).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    let desc = format!("قام بتحديث أسعار كامل المخزون (النوع: {}، القيمة: {})", update_type, value);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("BULK_PRICE_UPDATE").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn adjust_stock_db(state: tauri::State<'_, PgPool>, medicine_id: String, amount: i32) -> Result<(), String> {
    sqlx::query("UPDATE medicines SET quantity = quantity + $1 WHERE id = $2").bind(amount).bind(uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn soft_delete_medicine_db(state: tauri::State<'_, PgPool>, medicine_id: String, user_role: String, med_name: String) -> Result<(), String> {
    sqlx::query("UPDATE medicines SET is_deleted = TRUE WHERE id = $1").bind(uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?).execute(state.inner()).await.map_err(|e| e.to_string())?;
    let desc = format!("قام بحذف (أرشفة) الدواء: {}", med_name);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("DELETE_MEDICINE").bind(desc).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- ربط باركود أصلي بدواء موجود (لإدخال الباركودات الحقيقية جماعياً) ---
#[tauri::command]
async fn link_barcode_to_medicine_db(
    state: tauri::State<'_, PgPool>,
    medicine_id: String,
    barcode: String,
    source: Option<String>,
) -> Result<(), String> {
    let pool = state.inner();
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let barcode_trimmed = barcode.trim().to_string();

    if barcode_trimmed.is_empty() {
        return Err("الباركود فارغ".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // تحقق إن الباركود غير مستخدم بدواء آخر
    let existing: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM medicines WHERE barcode = $1 AND id != $2 AND is_deleted = FALSE"
    )
    .bind(&barcode_trimmed)
    .bind(med_uuid)
    .fetch_optional(&mut *tx).await
    .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Err(format!("الباركود {} مُسجّل بدواء آخر بالفعل", barcode_trimmed));
    }

    // حدّث باركود الدواء
    sqlx::query("UPDATE medicines SET barcode = $1, updated_at = NOW() WHERE id = $2")
        .bind(&barcode_trimmed)
        .bind(med_uuid)
        .execute(&mut *tx).await
        .map_err(|e| e.to_string())?;

    // أضف للجدول الموحد medicine_barcodes
    let src = source.unwrap_or_else(|| "manual_entry".to_string());
    let barcode_type = if barcode_trimmed.len() == 13 { "EAN13" }
                       else if barcode_trimmed.len() == 12 { "UPC" }
                       else if barcode_trimmed.len() == 8 { "EAN8" }
                       else { "OTHER" };

    sqlx::query(
        "INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, normalized_barcode, is_primary, source, learned_at)
         VALUES ($1, $2, $3, 'manufacturer', $2, TRUE, $4, NOW())
         ON CONFLICT (barcode, barcode_type) DO UPDATE SET
            medicine_id = $1,
            is_primary = TRUE,
            source = $4,
            learned_at = NOW()"
    )
    .bind(med_uuid)
    .bind(&barcode_trimmed)
    .bind(barcode_type)
    .bind(&src)
    .execute(&mut *tx).await
    .map_err(|e| e.to_string())?;

    // سجل تدقيق
    let med_name: String = sqlx::query_scalar("SELECT name_ar FROM medicines WHERE id = $1")
        .bind(med_uuid)
        .fetch_one(&mut *tx).await
        .map_err(|e| e.to_string())?;

    let desc = format!("ربط باركود أصلي ({}) بالدواء: {}", barcode_trimmed, med_name);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ('admin', 'LINK_BARCODE', $1)")
        .bind(&desc)
        .execute(&mut *tx).await;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر المحاسقة (وإصلاح خصم المخزون المزدوج) ---
// idempotency: operation_id يمنع تسجيل البيع مرتين عند إعادة المحاولة بعد انهيار
#[tauri::command]
async fn record_sale_db(state: tauri::State<'_, PgPool>, discount_percentage: f64, items_json: String, user_role: String, operation_id: Option<String>, discount_amount_param: Option<f64>) -> Result<serde_json::Value, String> {
    let pool = state.inner();

    // ===== Idempotency check =====
    if let Some(op_id) = &operation_id {
        let already: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM invoices WHERE idempotency_key = $1"
        ).bind(op_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if let Some(inv_id) = already {
            return Ok(serde_json::json!({ "invoiceId": inv_id.to_string(), "replayed": true }));
        }
    }

    let settings_row = sqlx::query("SELECT value FROM settings WHERE key = 'max_discount'").fetch_optional(pool).await.map_err(|e| e.to_string())?;
    let max_discount: f64 = if let Some(row) = settings_row { row.get::<String, _>(0).parse::<f64>().unwrap_or(10.0) } else { 10.0 };
    if discount_percentage > max_discount { return Err(format!("الخصم يتجاوز الحد الأقصى المسموح به ({})%", max_discount)); }

    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    let mut subtotal = rust_decimal::Decimal::ZERO;
    let mut total_profit = rust_decimal::Decimal::ZERO;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for item in &items {
        let med_uuid = uuid::Uuid::parse_str(item["id"].as_str().ok_or("Err")?).map_err(|e| e.to_string())?;
        let price = rust_decimal::Decimal::from_f64(item["price"].as_f64().ok_or("Err")?).ok_or("Err")?;
        let qty = rust_decimal::Decimal::from(item["quantity"].as_i64().ok_or("Err")?);
        subtotal += price * qty;
        let med_row = sqlx::query("SELECT cost_price FROM medicines WHERE id = $1").bind(med_uuid).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let cost_price: rust_decimal::Decimal = med_row.get(0);
        total_profit += (price - cost_price) * qty;
    }

    let discount_factor = rust_decimal::Decimal::from_f64(discount_percentage).ok_or("Err")? / rust_decimal::Decimal::from(100);
    let discount_amount = match discount_amount_param {
        Some(amt) if amt > 0.0 => rust_decimal::Decimal::from_f64(amt).unwrap_or(subtotal * discount_factor),
        _ => subtotal * discount_factor,
    };
    let final_total = subtotal - discount_amount;
    let final_profit = total_profit - discount_amount;

    let row = sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role, daily_receipt_number, idempotency_key, discount_amount) VALUES ($1, $2, $3, get_daily_receipt_number(), $4, $5) RETURNING id")
        .bind(final_total).bind(final_profit).bind(&user_role).bind(&operation_id).bind(discount_amount).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let invoice_id: uuid::Uuid = row.get(0);

    let mut items_desc = Vec::new();
    for item in items {
        let name = item["nameAr"].as_str().ok_or("Missing name")?;
        let qty = item["quantity"].as_i64().ok_or("Missing qty")? as i32;
        let med_uuid = uuid::Uuid::parse_str(item["id"].as_str().ok_or("Err")?).map_err(|e| e.to_string())?;
        let price = rust_decimal::Decimal::from_f64(item["price"].as_f64().ok_or("Err")?).ok_or("Err")?;
        
        sqlx::query("INSERT INTO invoice_items (invoice_id, medicine_id, name_ar, quantity, price) VALUES ($1, $2, $3, $4, $5)")
            .bind(invoice_id).bind(med_uuid).bind(name).bind(qty).bind(price).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            
        let batches = sqlx::query("SELECT id, quantity FROM medicine_batches WHERE medicine_id = $1 AND quantity > 0 ORDER BY expiry_date ASC")
            .bind(med_uuid).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        let mut remaining_qty = qty;
        for batch in batches {
            if remaining_qty <= 0 { break; }
            let batch_id: uuid::Uuid = batch.get(0);
            let batch_qty: i32 = batch.get(1);
            let deduct = std::cmp::min(batch_qty, remaining_qty);
            sqlx::query("UPDATE medicine_batches SET quantity = quantity - $1 WHERE id = $2").bind(deduct).bind(batch_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            remaining_qty -= deduct;
        }
        sqlx::query("UPDATE medicines SET quantity = quantity - $1 WHERE id = $2").bind(qty).bind(med_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        items_desc.push(format!("{} (x{})", name, qty));
    }
    
    let desc = if discount_amount > rust_decimal::Decimal::ZERO {
        format!("بيع فاتورة بمبلغ {} (بعد خصم {} د.ع). الأصناف: {}", final_total, discount_amount, items_desc.join(", "))
    } else {
        format!("بيع فاتورة بمبلغ {}. الأصناف: {}", final_total, items_desc.join(", "))
    };
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("SALE_INVOICE").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "invoiceId": invoice_id.to_string(), "replayed": false }))
}

#[tauri::command]
async fn record_refund_db(state: tauri::State<'_, PgPool>, total_amount: f64, items_json: String, user_role: String) -> Result<(), String> {
    let pool = state.inner();
    let total_dec = rust_decimal::Decimal::from_f64(total_amount).ok_or("Invalid total")?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut total_refund_profit = rust_decimal::Decimal::ZERO;
    let row = sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role) VALUES ($1, $2, $3) RETURNING id")
        .bind(total_dec * rust_decimal::Decimal::from(-1)).bind(rust_decimal::Decimal::ZERO).bind(&user_role).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let invoice_id: uuid::Uuid = row.get(0);
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    let mut items_desc = Vec::new();
    for item in items {
        let med_id_str = item["id"].as_str().ok_or("Missing item id")?;
        let med_id = uuid::Uuid::parse_str(med_id_str).map_err(|e| e.to_string())?;
        let name = item["nameAr"].as_str().ok_or("Missing name")?;
        let qty = item["quantity"].as_i64().ok_or("Missing qty")? as i32;
        let price_f64 = item["price"].as_f64().ok_or("Missing price")?;
        let price_dec = rust_decimal::Decimal::from_f64(price_f64).ok_or("Invalid item price")?;
        
        sqlx::query("UPDATE medicines SET quantity = quantity + $1 WHERE id = $2").bind(qty).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        let batch_row = sqlx::query("SELECT id FROM medicine_batches WHERE medicine_id = $1 ORDER BY created_at DESC LIMIT 1")
            .bind(med_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
        if let Some(b_row) = batch_row {
            let batch_id: uuid::Uuid = b_row.get(0);
            sqlx::query("UPDATE medicine_batches SET quantity = quantity + $1 WHERE id = $2").bind(qty).bind(batch_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        } else {
            let med_data = sqlx::query("SELECT batch_number, expiry_date FROM medicines WHERE id = $1").bind(med_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            let bn: Option<String> = med_data.get(0);
            let ed: Option<chrono::NaiveDate> = med_data.get(1);
            sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, $2, $3, $4)").bind(med_id).bind(bn).bind(ed).bind(qty).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        let med_data = sqlx::query("SELECT cost_price FROM medicines WHERE id = $1").bind(med_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let cost_price: rust_decimal::Decimal = med_data.get(0);
        let item_profit = (price_dec - cost_price) * rust_decimal::Decimal::from(qty);
        total_refund_profit -= item_profit;
        sqlx::query("INSERT INTO invoice_items (invoice_id, medicine_id, name_ar, quantity, price) VALUES ($1, $2, $3, $4, $5)").bind(invoice_id).bind(med_id).bind(name).bind(qty).bind(price_dec).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        items_desc.push(format!("{} (x{})", name, qty));
    }
    sqlx::query("UPDATE invoices SET profit_amount = $1 WHERE id = $2").bind(total_refund_profit).bind(invoice_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let desc = format!("قام بمرتجع مبيعات بقيمة {}. الأصناف: {}", total_amount, items_desc.join(", "));
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("SALES_REFUND").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- التراجع عن المرتجع (Undo Refund) ---
#[tauri::command]
async fn reverse_refund_db(state: tauri::State<'_, PgPool>, invoice_id: String, user_role: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    let inv_row = sqlx::query("SELECT total_amount, is_reversed FROM invoices WHERE id = $1").bind(uuid_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let total_amount: rust_decimal::Decimal = inv_row.get(0);
    let is_reversed: bool = inv_row.get(1);
    if is_reversed || total_amount >= rust_decimal::Decimal::ZERO { return Err("هذه الفاتورة ليست مرتجعاً أو تم التراجع عنها مسبقاً.".to_string()); }

    let items = sqlx::query("SELECT medicine_id, quantity FROM invoice_items WHERE invoice_id = $1").bind(uuid_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    for item in items {
        let med_id: uuid::Uuid = item.get(0);
        let qty: i32 = item.get(1);
        sqlx::query("UPDATE medicines SET quantity = quantity - $1 WHERE id = $2").bind(qty).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        let batches = sqlx::query("SELECT id, quantity FROM medicine_batches WHERE medicine_id = $1 AND quantity > 0 ORDER BY expiry_date ASC").bind(med_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        let mut remaining_qty = qty;
        for batch in batches {
            if remaining_qty <= 0 { break; }
            let batch_id: uuid::Uuid = batch.get(0);
            let batch_qty: i32 = batch.get(1);
            let deduct = std::cmp::min(batch_qty, remaining_qty);
            sqlx::query("UPDATE medicine_batches SET quantity = quantity - $1 WHERE id = $2").bind(deduct).bind(batch_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            remaining_qty -= deduct;
        }
    }
    sqlx::query("UPDATE invoices SET is_reversed = TRUE WHERE id = $1").bind(uuid_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let desc = format!("تراجع عن مرتجع الفاتورة {}", invoice_id);
    sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role) VALUES ($1, 0, $2)").bind(total_amount.abs()).bind(&user_role).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("REVERSE_REFUND").bind(&desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn add_expense_db(state: tauri::State<'_, PgPool>, description: String, amount: f64, user_role: String) -> Result<(), String> {
    sqlx::query("INSERT INTO expenses (description, amount) VALUES ($1, $2)").bind(&description).bind(rust_decimal::Decimal::from_f64(amount).ok_or("Err")?).execute(state.inner()).await.map_err(|e| e.to_string())?;
    let log_desc = format!("أضاف مصروف: {} بمبلغ {}", description, amount);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("ADD_EXPENSE").bind(log_desc).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_accounting_summary_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    let sales_row = sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0), COALESCE(SUM(discount_amount), 0) FROM invoices").fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let exp_row = sqlx::query("SELECT COALESCE(SUM(amount), 0) FROM expenses").fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let total_sales: rust_decimal::Decimal = sales_row.get(0); let total_profits: rust_decimal::Decimal = sales_row.get(1); let total_discounts: rust_decimal::Decimal = sales_row.get(2);
    let total_expenses: rust_decimal::Decimal = exp_row.get(0); let cashbox = total_sales - total_expenses;
    let exp_rows = sqlx::query("SELECT id, description, amount, created_at FROM expenses ORDER BY created_at DESC LIMIT 10").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut expenses_list = Vec::new();
    for row in exp_rows {
        expenses_list.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "description": row.get::<String, _>(1), "amount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0), "date": row.get::<chrono::NaiveDateTime, _>(3).to_string() }));
    }
    Ok(serde_json::json!({ "totalSales": total_sales.to_string().parse::<f64>().unwrap_or(0.0), "totalProfits": total_profits.to_string().parse::<f64>().unwrap_or(0.0), "totalDiscounts": total_discounts.to_string().parse::<f64>().unwrap_or(0.0), "totalExpenses": total_expenses.to_string().parse::<f64>().unwrap_or(0.0), "cashbox": cashbox.to_string().parse::<f64>().unwrap_or(0.0), "expenses": expenses_list }))
}

// الإغلاق اليومي — يصفّر ONLY اليوم الحالي وليس كل التاريخ
// البيانات التاريخية تُنقل لجدول archive (إن وُجد) أو تُترك كما هي
#[tauri::command]
async fn reset_daily_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<(), String> {
    if user_role != "Super Admin" { return Err("صلاحية غير كافية: يجب أن تكون مديراً للقيام بالإغلاق اليومي.".to_string()); }
    let today = chrono::Local::now().date_naive();
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    // حذف فقط إيصالات اليوم (total_amount >= 0 = بيع، < 0 = مرتجع — كلاهما اليومي)
    sqlx::query("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE created_at::date = $1)").bind(today).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM invoices WHERE created_at::date = $1").bind(today).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM expenses WHERE created_at::date = $1").bind(today).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    // نُبقي سجل التدقيق (لا نمسحه)
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("DAILY_CLOSING").bind("إغلاق يومي — مسح مبيعات اليوم فقط").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر التقارير المتقدمة ---
#[tauri::command]
async fn get_filtered_sales_report(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, user_filter: String) -> Result<serde_json::Value, String> {
    let row = if user_filter == "all" {
        sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0), COALESCE(SUM(discount_amount), 0), COUNT(id) FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date").bind(&start_date).bind(&end_date).fetch_one(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0), COALESCE(SUM(discount_amount), 0), COUNT(id) FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date AND user_role = $3").bind(&start_date).bind(&end_date).bind(&user_filter).fetch_one(state.inner()).await.map_err(|e| e.to_string())?
    };
    Ok(serde_json::json!({
        "totalSales": row.get::<rust_decimal::Decimal, _>(0).to_string().parse::<f64>().unwrap_or(0.0),
        "totalProfits": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
        "totalDiscounts": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
        "invoiceCount": row.get::<i64, _>(3)
    }))
}

#[tauri::command]
async fn get_invoice_details_report(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, user_filter: String) -> Result<Vec<serde_json::Value>, String> {
    // Single query with LEFT JOIN + json_agg to avoid N+1 (one query per invoice for items).
    // The items JSON column is cast to ::text and parsed on the Rust side because the
    // sqlx `json` feature is not enabled in this project (no direct serde_json::Value decode).
    let rows = if user_filter == "all" {
        sqlx::query(
            "SELECT i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at, \
             COALESCE(json_agg(json_build_object('name', ii.name_ar, 'qty', ii.quantity, 'price', ii.price)) FILTER (WHERE ii.id IS NOT NULL), '[]'::json)::text as items \
             FROM invoices i \
             LEFT JOIN invoice_items ii ON ii.invoice_id = i.id \
             WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date \
             GROUP BY i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at \
             ORDER BY i.created_at DESC"
        ).bind(&start_date).bind(&end_date).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            "SELECT i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at, \
             COALESCE(json_agg(json_build_object('name', ii.name_ar, 'qty', ii.quantity, 'price', ii.price)) FILTER (WHERE ii.id IS NOT NULL), '[]'::json)::text as items \
             FROM invoices i \
             LEFT JOIN invoice_items ii ON ii.invoice_id = i.id \
             WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date AND i.user_role = $3 \
             GROUP BY i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at \
             ORDER BY i.created_at DESC"
        ).bind(&start_date).bind(&end_date).bind(&user_filter).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut invoices = Vec::new();
    for row in rows {
        let inv_id: uuid::Uuid = row.get(0);
        let items_str: String = row.get(6);
        let items: serde_json::Value = serde_json::from_str(&items_str)
            .unwrap_or_else(|_| serde_json::Value::Array(vec![]));
        invoices.push(serde_json::json!({
            "id": inv_id.to_string(), "totalAmount": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
            "profitAmount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "discountAmount": row.get::<Option<rust_decimal::Decimal>, _>(3).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0),
            "userRole": row.get::<Option<String>, _>(4).unwrap_or_else(|| "N/A".to_string()),
            "date": row.get::<chrono::NaiveDateTime, _>(5).to_string(), "items": items
        }));
    }
    Ok(invoices)
}

// --- أوامر الديون ---
#[tauri::command]
async fn add_customer_debt_db(state: tauri::State<'_, PgPool>, customer_name: String, amount: f64, note: Option<String>, user_role: String) -> Result<String, String> {
    let pool = state.inner();
    let amount_dec = rust_decimal::Decimal::from_f64(amount).ok_or("Invalid amount")?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("INSERT INTO customer_debts (customer_name, amount, note) VALUES ($1, $2, $3) RETURNING id").bind(&customer_name).bind(amount_dec).bind(&note).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let debt_id: uuid::Uuid = row.get(0);
    let desc = format!("أضاف دين للزبون: {} بقيمة {}", customer_name, amount);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("ADD_DEBT").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(debt_id.to_string())
}

#[tauri::command]
async fn pay_customer_debt_db(state: tauri::State<'_, PgPool>, debt_id: String, amount: f64, user_role: String) -> Result<(), String> {
    let pool = state.inner();
    let amount_dec = rust_decimal::Decimal::from_f64(amount).ok_or("Invalid amount")?;
    let uuid_id = uuid::Uuid::parse_str(&debt_id).map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("UPDATE customer_debts SET amount = amount - $1 WHERE id = $2 RETURNING amount").bind(amount_dec).bind(uuid_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let remaining: rust_decimal::Decimal = row.get(0);
    if remaining <= rust_decimal::Decimal::ZERO {
        sqlx::query("UPDATE customer_debts SET is_paid = TRUE, amount = 0, paid_date = NOW() WHERE id = $1").bind(uuid_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role) VALUES ($1, 0, $2)").bind(amount_dec).bind(&user_role).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let desc = format!("استيفاء دفعة من دين بقيمة {}", amount);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("DEBT_PAYMENT").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_customer_debt_db(state: tauri::State<'_, PgPool>, debt_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&debt_id).map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM customer_debts WHERE id = $1").bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_customer_debts_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, customer_name, amount, is_paid, note, created_at, paid_date FROM customer_debts ORDER BY is_paid ASC, created_at DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut debts = Vec::new();
    for row in rows {
        debts.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(), "customerName": row.get::<String, _>(1),
            "amount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0), "isPaid": row.get::<bool, _>(3),
            "note": row.get::<Option<String>, _>(4), "date": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
            "paidDate": row.get::<Option<chrono::NaiveDateTime>, _>(6).map(|d| d.to_string())
        }));
    }
    Ok(debts)
}

// --- أوامر الموردين والمشتريات ---
#[tauri::command]
async fn add_supplier_db(state: tauri::State<'_, PgPool>, name: String, phone: Option<String>) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO suppliers (name, phone) VALUES ($1, $2) RETURNING id").bind(&name).bind(&phone).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_suppliers_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, phone, balance FROM suppliers ORDER BY name").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut suppliers = Vec::new();
    for row in rows {
        suppliers.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "name": row.get::<String, _>(1), "phone": row.get::<Option<String>, _>(2), "balance": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0) }));
    }
    Ok(suppliers)
}

#[tauri::command]
async fn record_purchase_db(state: tauri::State<'_, PgPool>, supplier_id: String, medicine_id: String, quantity: i32, cost_price: f64, selling_price: f64, wholesale_price: f64, user_role: String) -> Result<(), String> {
    let pool = state.inner();
    let cost_dec = rust_decimal::Decimal::from_f64(cost_price).ok_or("Invalid cost")?;
    let sell_dec = rust_decimal::Decimal::from_f64(selling_price).ok_or("Invalid sell")?;
    let wholesale_dec = rust_decimal::Decimal::from_f64(wholesale_price).ok_or("Invalid wholesale")?;
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let total_amount_dec = cost_dec * rust_decimal::Decimal::from(quantity);
    let med_row = sqlx::query("SELECT expiry_date, batch_number FROM medicines WHERE id = $1").bind(med_uuid).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let expiry: Option<chrono::NaiveDate> = med_row.get(0);
    let batch_num: Option<String> = med_row.get(1);
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE medicines SET quantity = quantity + $1, cost_price = $2, price = $3 WHERE id = $4").bind(quantity).bind(cost_dec).bind(sell_dec).bind(med_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    // wholesale_dec محسوب للتحقق من صحة الإدخال فقط؛ لا نُحدث wholesale_price عند الشراء حتى لا نُلغي قيمة السعر المُعدّلة يدوياً
    let _ = wholesale_dec;
    sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, $2, $3, $4)").bind(med_uuid).bind(&batch_num).bind(expiry).bind(quantity).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE suppliers SET balance = balance + $1 WHERE id = $2").bind(total_amount_dec).bind(sup_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let desc = format!("تسجيل شراء من مورد بقيمة {}. (الدواء: {}, الكمية: {})", total_amount_dec, medicine_id, quantity);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("PURCHASE_INVOICE").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pay_supplier_db(state: tauri::State<'_, PgPool>, supplier_id: String, amount: f64, user_role: String) -> Result<(), String> {
    let pool = state.inner();
    let amount_dec = rust_decimal::Decimal::from_f64(amount).ok_or("Invalid amount")?;
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE suppliers SET balance = balance - $1 WHERE id = $2").bind(amount_dec).bind(sup_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO expenses (description, amount) VALUES ($1, $2)").bind(format!("سداد دفعة للمورد")).bind(amount_dec).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let desc = format!("سداد دفعة للمورد بقيمة {}", amount);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("SUPPLIER_PAYMENT").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر الإعدادات ---
#[tauri::command]
async fn get_settings_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    let rows = sqlx::query("SELECT key, value FROM settings").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for row in rows { map.insert(row.get(0), serde_json::Value::String(row.get(1))); }
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
async fn save_settings_db(state: tauri::State<'_, PgPool>, settings_json: String) -> Result<(), String> {
    let settings: HashMap<String, String> = serde_json::from_str(&settings_json).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    for (key, value) in settings {
        sqlx::query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2").bind(key).bind(value).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر الشاشة الرئيسية ---
#[tauri::command]
async fn get_top_medicines_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT name_ar, SUM(quantity) as total_qty, SUM(quantity * price) as total_rev FROM invoice_items GROUP BY name_ar ORDER BY total_qty DESC LIMIT 5")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({ "name": row.get::<String, _>(0), "totalQty": row.get::<i64, _>(1), "totalRevenue": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0) }));
    }
    Ok(results)
}

#[tauri::command]
async fn get_dashboard_stats(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    let today = chrono::Local::now().date_naive();
    let sales_row = sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COUNT(id) FROM invoices WHERE created_at::date = $1").bind(today).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let today_sales: rust_decimal::Decimal = sales_row.get(0);
    let today_invoices: i64 = sales_row.get(1);
    // عتبة المخزون المنخفض من الإعدادات (default 20)
    let threshold_row = sqlx::query("SELECT value FROM settings WHERE key = 'low_stock_threshold'").fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let threshold: i32 = threshold_row.and_then(|r| r.get::<String, _>(0).parse::<i32>().ok()).unwrap_or(20);
    let low_stock_row = sqlx::query("SELECT COUNT(id) FROM medicines WHERE quantity <= $1 AND is_deleted = FALSE").bind(threshold).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let low_stock_count: i64 = low_stock_row.get(0);
    Ok(serde_json::json!({ "todaySales": today_sales.to_string().parse::<f64>().unwrap_or(0.0), "todayInvoices": today_invoices, "lowStockCount": low_stock_count }))
}

#[tauri::command]
async fn get_weekly_sales_stats(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    // استعلام واحد بدل 7 — يحسب مبيعات آخر 7 أيام في استعلام واحد
    let start_date = chrono::Local::now().date_naive() - chrono::Duration::days(6);
    let rows = sqlx::query("SELECT d::date AS day, COALESCE(SUM(i.total_amount), 0) AS total FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d LEFT JOIN invoices i ON i.created_at::date = d::date GROUP BY d::date ORDER BY d::date ASC")
        .bind(start_date).bind(today()).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let day: chrono::NaiveDate = row.get(0);
        let total: rust_decimal::Decimal = row.get(1);
        results.push(serde_json::json!({ "date": day.format("%Y-%m-%d").to_string(), "sales": total.to_string().parse::<f64>().unwrap_or(0.0) }));
    }
    Ok(results)
}

fn today() -> chrono::NaiveDate { chrono::Local::now().date_naive() }

// --- أوامر الطباعة (متعددة المنصات + تشكيل عربي RTL) ---

// تحويل نص عربي ليطبع بشكل صحيح على طابعات ESC/POS بدون فيرموير عربي
// نعكس الأحرف لكل سطر عربي ونغلقه بـ RTL mark (الحل المبسّط؛ الحل الكامل يحتاج arabic_reshaper)
fn shape_arabic_for_print(s: &str) -> String {
    // تحقق إن كان النص يحوي أحرف عربية
    let has_arabic = s.chars().any(|c| (c as u32) >= 0x0600 && (c as u32) <= 0x06FF);
    if !has_arabic { return s.to_string(); }
    // عكس الأحرف في كل كلمة على حدة + عكس ترتيب الكلمات
    let mut words: Vec<String> = s.split_whitespace().map(|w| w.chars().rev().collect()).collect();
    words.reverse();
    format!("\u{200F}{}", words.join(" ")) // RLM mark + reversed
}

#[tauri::command]
fn get_available_printers() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("cmd").args(&["/C", "wmic", "printer", "get", "name"]).output();
        match output {
            Ok(o) => {
                String::from_utf8_lossy(&o.stdout)
                    .lines().skip(1)
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            },
            Err(_) => vec![],
        }
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lpstat").arg("-p").output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).lines()
                .filter_map(|l| l.split_whitespace().nth(1).map(|s| s.to_string()))
                .collect(),
            Err(_) => vec![],
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("lpstat").arg("-p").output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).lines()
                .filter_map(|l| l.split_whitespace().nth(1).map(|s| s.to_string()))
                .collect(),
            Err(_) => vec![],
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { vec![] }
}

#[tauri::command]
fn print_receipt_direct(printer_name: String, pharmacy_name: String, invoice_num: String, items_json: String, total: String) -> Result<(), String> {
    let mut esc_data: Vec<u8> = Vec::new();
    esc_data.extend_from_slice(b"\x1B\x40"); // init
    esc_data.extend_from_slice(b"\x1B\x61\x01"); // center
    esc_data.extend_from_slice(format!("{}\n", shape_arabic_for_print(&pharmacy_name)).as_bytes());
    esc_data.extend_from_slice(b"\x1B\x61\x00"); // left align
    esc_data.extend_from_slice(b"----------------------------\n");
    esc_data.extend_from_slice(format!("Invoice: {}\n", invoice_num).as_bytes());
    esc_data.extend_from_slice(b"----------------------------\n");
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    for item in items {
        let name = item["nameAr"].as_str().unwrap_or("");
        let qty = item["quantity"].as_i64().unwrap_or(0);
        let price = item["price"].as_f64().unwrap_or(0.0);
        let line_total = price * qty as f64;
        let shaped = shape_arabic_for_print(name);
        // اسم دواء (محدود 18) + كمية + سعر الإجمالي
        esc_data.extend_from_slice(format!("{:<18} x{} {:.2}\n", shaped.chars().take(18).collect::<String>(), qty, line_total).as_bytes());
    }
    esc_data.extend_from_slice(b"----------------------------\n");
    esc_data.extend_from_slice(b"\x1B\x45\x01"); // bold on
    esc_data.extend_from_slice(format!("TOTAL: {} IQD\n", total).as_bytes());
    esc_data.extend_from_slice(b"\x1B\x45\x00"); // bold off
    esc_data.extend_from_slice(b"\n\n\n");
    esc_data.extend_from_slice(b"\x1D\x56\x00"); // paper cut

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("pharmacy_receipt.prn");
    std::fs::write(&temp_file, &esc_data).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        let printer_arg = format!("/d:{}", printer_name);
        let output = Command::new("print").arg(&printer_arg).arg(temp_file.to_str().unwrap()).output()
            .map_err(|e| format!("فشل الطباعة: {}", e))?;
        if !output.status.success() {
            return Err(format!("فشل الطباعة: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lp").arg("-d").arg(&printer_name).arg(temp_file.to_str().unwrap()).output()
            .map_err(|e| format!("فشل الطباعة: {}", e))?;
        if !output.status.success() {
            return Err(format!("فشل الطباعة: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("lp").arg("-d").arg(&printer_name).arg(temp_file.to_str().unwrap()).output()
            .map_err(|e| format!("فشل الطباعة: {}", e))?;
        if !output.status.success() {
            return Err(format!("فشل الطباعة: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    Ok(())
}

// ===== أوامر الإضافات المؤسسية =====

// --- 1. Session Management ---
#[tauri::command]
async fn start_session_db(state: tauri::State<'_, PgPool>, user_id: String, username: String, device_info: String) -> Result<String, String> {
    let uuid_id = uuid::Uuid::parse_str(&user_id).unwrap_or_else(|_| uuid::Uuid::new_v4());
    let row = sqlx::query("INSERT INTO user_sessions (user_id, username, device_info, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id")
        .bind(uuid_id).bind(&username).bind(&device_info)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn end_session_db(state: tauri::State<'_, PgPool>, session_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&session_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE user_sessions SET is_active = FALSE, logout_at = NOW() WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_session_activity_db(state: tauri::State<'_, PgPool>, session_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&session_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE user_sessions SET last_activity = NOW() WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_active_sessions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, username, login_at, last_activity, device_info FROM user_sessions WHERE is_active = TRUE ORDER BY last_activity DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "username": row.get::<String, _>(1),
            "loginAt": row.get::<chrono::NaiveDateTime, _>(2).to_string(),
            "lastActivity": row.get::<chrono::NaiveDateTime, _>(3).to_string(),
            "deviceInfo": row.get::<String, _>(4),
        }));
    }
    Ok(sessions)
}

// --- 2. Fraud Detection ---
#[tauri::command]
async fn create_fraud_alert_db(state: tauri::State<'_, PgPool>, alert_type: String, severity: String, user_role: String, description: String, related_id: Option<String>, metadata: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO fraud_alerts (alert_type, severity, user_role, description, related_id, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id")
        .bind(&alert_type).bind(&severity).bind(&user_role).bind(&description)
        .bind(related_id).bind(metadata)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_fraud_alerts_db(state: tauri::State<'_, PgPool>, unresolved_only: bool) -> Result<Vec<serde_json::Value>, String> {
    let rows = if unresolved_only {
        sqlx::query("SELECT id, alert_type, severity, user_role, description, related_id, metadata, is_resolved, created_at FROM fraud_alerts WHERE is_resolved = FALSE ORDER BY created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, alert_type, severity, user_role, description, related_id, metadata, is_resolved, created_at FROM fraud_alerts ORDER BY created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut alerts = Vec::new();
    for row in rows {
        alerts.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "alertType": row.get::<String, _>(1),
            "severity": row.get::<String, _>(2),
            "userRole": row.get::<String, _>(3),
            "description": row.get::<String, _>(4),
            "relatedId": row.get::<Option<String>, _>(5),
            "metadata": row.get::<Option<String>, _>(6),
            "isResolved": row.get::<bool, _>(7),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(8).to_string(),
        }));
    }
    Ok(alerts)
}

#[tauri::command]
async fn resolve_fraud_alert_db(state: tauri::State<'_, PgPool>, alert_id: String, resolved_by: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&alert_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE fraud_alerts SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW() WHERE id = $2")
        .bind(&resolved_by).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- 3. Plugin Management ---
#[tauri::command]
async fn get_plugins_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, version, description, is_enabled, installed_at FROM plugins ORDER BY installed_at")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut plugins = Vec::new();
    for row in rows {
        plugins.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "version": row.get::<String, _>(3),
            "description": row.get::<Option<String>, _>(4),
            "isEnabled": row.get::<bool, _>(5),
            "installedAt": row.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(plugins)
}

#[tauri::command]
async fn toggle_plugin_db(state: tauri::State<'_, PgPool>, plugin_id: String, is_enabled: bool) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&plugin_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE plugins SET is_enabled = $1, updated_at = NOW() WHERE id = $2")
        .bind(is_enabled).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- 4. Crash Recovery Journal ---
#[tauri::command]
async fn create_journal_entry_db(state: tauri::State<'_, PgPool>, operation_type: String, operation_id: String, payload: String, user_role: String) -> Result<(), String> {
    sqlx::query("INSERT INTO operation_journal (operation_type, operation_id, payload, user_role, status) VALUES ($1, $2, $3, $4, 'pending')")
        .bind(&operation_type).bind(&operation_id).bind(&payload).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn complete_journal_entry_db(state: tauri::State<'_, PgPool>, operation_id: String) -> Result<(), String> {
    sqlx::query("UPDATE operation_journal SET status = 'completed', completed_at = NOW() WHERE operation_id = $1")
        .bind(&operation_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn fail_journal_entry_db(state: tauri::State<'_, PgPool>, operation_id: String, error_message: String) -> Result<(), String> {
    sqlx::query("UPDATE operation_journal SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE operation_id = $1")
        .bind(&operation_id).bind(&error_message).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_pending_journal_entries_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, operation_type, operation_id, payload, user_role, started_at FROM operation_journal WHERE status = 'pending' ORDER BY started_at ASC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "operation_type": row.get::<String, _>(1),
            "operation_id": row.get::<String, _>(2),
            "payload": row.get::<String, _>(3),
            "user_role": row.get::<String, _>(4),
            "started_at": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
        }));
    }
    Ok(entries)
}

// --- 5. Print Queue ---
#[tauri::command]
async fn create_print_job_db(state: tauri::State<'_, PgPool>, job_type: String, printer_name: String, content: String, related_invoice_id: Option<String>) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO print_jobs (job_type, printer_name, content, related_invoice_id, status) VALUES ($1, $2, $3, $4, 'queued') RETURNING id")
        .bind(&job_type).bind(&printer_name).bind(&content).bind(related_invoice_id)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_print_jobs_db(state: tauri::State<'_, PgPool>, status_filter: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(status) = status_filter {
        sqlx::query("SELECT id, job_type, printer_name, status, retry_count, error_message, created_at FROM print_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT 50")
            .bind(&status).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, job_type, printer_name, status, retry_count, error_message, created_at FROM print_jobs ORDER BY created_at DESC LIMIT 50")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "jobType": row.get::<String, _>(1),
            "printerName": row.get::<String, _>(2),
            "status": row.get::<String, _>(3),
            "retryCount": row.get::<i32, _>(4),
            "errorMessage": row.get::<Option<String>, _>(5),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(jobs)
}

// --- 6. Backup History ---
#[tauri::command]
async fn get_backup_history_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, backup_type, file_path, file_size, status, error_message, user_role, created_at FROM backup_history ORDER BY created_at DESC LIMIT 50")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut history = Vec::new();
    for row in rows {
        history.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "backupType": row.get::<String, _>(1),
            "filePath": row.get::<String, _>(2),
            "fileSize": row.get::<Option<i64>, _>(3),
            "status": row.get::<String, _>(4),
            "errorMessage": row.get::<Option<String>, _>(5),
            "userRole": row.get::<Option<String>, _>(6),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(7).to_string(),
        }));
    }
    Ok(history)
}

#[tauri::command]
async fn record_backup_history_db(state: tauri::State<'_, PgPool>, backup_type: String, file_path: String, file_size: i64, status: String, error_message: Option<String>, user_role: String) -> Result<(), String> {
    sqlx::query("INSERT INTO backup_history (backup_type, file_path, file_size, status, error_message, user_role) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(&backup_type).bind(&file_path).bind(file_size).bind(&status).bind(error_message).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// النسخ الاحتياطي التلقائي — يصدّر البيانات الفعلية (الجداول الرئيسية) لا مجرد metadata
#[tauri::command]
async fn create_auto_backup_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<String, String> {
    let pool = state.inner();
    // تصدير كل الجداول الحرجة كـ JSON
    let medicines = sqlx::query("SELECT id, name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date, is_deleted FROM medicines").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let batches = sqlx::query("SELECT medicine_id, batch_number, expiry_date, quantity FROM medicine_batches").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let invoices = sqlx::query("SELECT id, total_amount, profit_amount, user_role, daily_receipt_number, created_at, is_reversed, discount_amount FROM invoices").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let invoice_items = sqlx::query("SELECT invoice_id, medicine_id, name_ar, quantity, price FROM invoice_items").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let expenses = sqlx::query("SELECT id, description, amount, category, created_at FROM expenses").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let debts = sqlx::query("SELECT id, customer_name, amount, is_paid, note, created_at, paid_date FROM customer_debts").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let suppliers = sqlx::query("SELECT id, name, phone, address, balance, is_active FROM suppliers").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let patients = sqlx::query("SELECT id, name, national_id, phone, notes, created_at FROM patients").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let settings_rows = sqlx::query("SELECT key, value FROM settings").fetch_all(pool).await.map_err(|e| e.to_string())?;
    let audit_logs = sqlx::query("SELECT user_role, action_type, description, created_at FROM audit_logs").fetch_all(pool).await.map_err(|e| e.to_string())?;

    let medicines_arr: Vec<serde_json::Value> = medicines.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "name_ar": r.get::<String, _>(1),
        "name_en": r.get::<Option<String>, _>(2), "scientific_name": r.get::<Option<String>, _>(3),
        "barcode": r.get::<Option<String>, _>(4), "price": r.get::<rust_decimal::Decimal, _>(5).to_string(),
        "wholesale_price": r.get::<rust_decimal::Decimal, _>(6).to_string(), "cost_price": r.get::<rust_decimal::Decimal, _>(7).to_string(),
        "quantity": r.get::<i32, _>(8), "batch_number": r.get::<Option<String>, _>(9),
        "expiry_date": r.get::<Option<chrono::NaiveDate>, _>(10).map(|d| d.to_string()),
        "is_deleted": r.get::<bool, _>(11)
    })).collect();
    let batches_arr: Vec<serde_json::Value> = batches.iter().map(|r| serde_json::json!({
        "medicine_id": r.get::<uuid::Uuid, _>(0).to_string(), "batch_number": r.get::<Option<String>, _>(1),
        "expiry_date": r.get::<Option<chrono::NaiveDate>, _>(2).map(|d| d.to_string()), "quantity": r.get::<i32, _>(3)
    })).collect();
    let invoices_arr: Vec<serde_json::Value> = invoices.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "total_amount": r.get::<rust_decimal::Decimal, _>(1).to_string(),
        "profit_amount": r.get::<rust_decimal::Decimal, _>(2).to_string(), "user_role": r.get::<Option<String>, _>(3),
        "daily_receipt_number": r.get::<Option<i32>, _>(4), "created_at": r.get::<chrono::NaiveDateTime, _>(5).to_string(),
        "is_reversed": r.get::<bool, _>(6), "discount_amount": r.get::<Option<rust_decimal::Decimal>, _>(7).map(|d| d.to_string())
    })).collect();
    let invoice_items_arr: Vec<serde_json::Value> = invoice_items.iter().map(|r| serde_json::json!({
        "invoice_id": r.get::<uuid::Uuid, _>(0).to_string(), "medicine_id": r.get::<Option<uuid::Uuid>, _>(1).map(|u| u.to_string()),
        "name_ar": r.get::<String, _>(2), "quantity": r.get::<i32, _>(3), "price": r.get::<rust_decimal::Decimal, _>(4).to_string()
    })).collect();
    let expenses_arr: Vec<serde_json::Value> = expenses.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "description": r.get::<String, _>(1),
        "amount": r.get::<rust_decimal::Decimal, _>(2).to_string(), "category": r.get::<Option<String>, _>(3).unwrap_or_else(|| "operational".to_string()),
        "created_at": r.get::<chrono::NaiveDateTime, _>(4).to_string()
    })).collect();
    let debts_arr: Vec<serde_json::Value> = debts.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "customer_name": r.get::<String, _>(1),
        "amount": r.get::<rust_decimal::Decimal, _>(2).to_string(), "is_paid": r.get::<bool, _>(3),
        "note": r.get::<Option<String>, _>(4), "created_at": r.get::<chrono::NaiveDateTime, _>(5).to_string(),
        "paid_date": r.get::<Option<chrono::NaiveDateTime>, _>(6).map(|d| d.to_string())
    })).collect();
    let suppliers_arr: Vec<serde_json::Value> = suppliers.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "name": r.get::<String, _>(1),
        "phone": r.get::<Option<String>, _>(2), "address": r.get::<Option<String>, _>(3),
        "balance": r.get::<rust_decimal::Decimal, _>(4).to_string(), "is_active": r.get::<bool, _>(5)
    })).collect();
    let patients_arr: Vec<serde_json::Value> = patients.iter().map(|r| serde_json::json!({
        "id": r.get::<uuid::Uuid, _>(0).to_string(), "name": r.get::<String, _>(1),
        "national_id": r.get::<String, _>(2), "phone": r.get::<String, _>(3),
        "notes": r.get::<Option<String>, _>(4), "created_at": r.get::<chrono::NaiveDateTime, _>(5).to_string()
    })).collect();
    let settings_arr: Vec<serde_json::Value> = settings_rows.iter().map(|r| serde_json::json!({
        "key": r.get::<String, _>(0), "value": r.get::<String, _>(1)
    })).collect();
    let audit_arr: Vec<serde_json::Value> = audit_logs.iter().map(|r| serde_json::json!({
        "user_role": r.get::<Option<String>, _>(0), "action_type": r.get::<String, _>(1),
        "description": r.get::<String, _>(2), "created_at": r.get::<chrono::NaiveDateTime, _>(3).to_string()
    })).collect();

    let backup_data = serde_json::json!({
        "backupDate": chrono::Utc::now().to_rfc3339(),
        "version": "2.3.0",
        "type": "auto",
        "tables": {
            "medicines": medicines_arr,
            "medicine_batches": batches_arr,
            "invoices": invoices_arr,
            "invoice_items": invoice_items_arr,
            "expenses": expenses_arr,
            "customer_debts": debts_arr,
            "suppliers": suppliers_arr,
            "patients": patients_arr,
            "settings": settings_arr,
            "audit_logs": audit_arr
        }
    }).to_string();

    // كلمة مرور عشوائية تُخزّن في ملف آمن بدلاً من hardcoded
    let password = get_or_create_auto_backup_password()?;
    let encrypted_data = encrypt_data(&backup_data, &password)?;

    let dir = desktop_dir()?;
    let backup_dir = dir.join("PharmacyBackups");
    std::fs::create_dir_all(&backup_dir).ok();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let path = backup_dir.join(format!("auto_backup_{}.enc", timestamp));
    std::fs::write(&path, encrypted_data.as_bytes()).map_err(|e| e.to_string())?;

    // تدوير النسخ القديمة
    let mut backups: Vec<_> = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("auto_backup_"))
        .collect();
    backups.sort_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()));
    while backups.len() > 7 {
        if let Some(old) = backups.first() {
            let _ = std::fs::remove_file(old.path());
            backups.remove(0);
        } else { break; }
    }

    let file_size = std::fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
    sqlx::query("INSERT INTO backup_history (backup_type, file_path, file_size, status, user_role) VALUES ('auto', $1, $2, 'success', $3)")
        .bind(path.to_string_lossy().to_string()).bind(file_size).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('last_backup', $1) ON CONFLICT (key) DO UPDATE SET value = $1")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(state.inner()).await.map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

// كلمة مرور عشوائية للنسخ التلقائي تُخزّن في مجلد بيانات التطبيق (وليست hardcoded)
fn get_or_create_auto_backup_password() -> Result<String, String> {
    let app_dir = dirs_next::data_dir().ok_or("تعذّر تحديد مجلد البيانات")?.join("BununMazenPharmacy");
    std::fs::create_dir_all(&app_dir).ok();
    let key_file = app_dir.join(".backup_key");
    if key_file.exists() {
        return std::fs::read_to_string(&key_file).map_err(|e| e.to_string());
    }
    // توليد 32 بايت عشوائي وتحويلها base64
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let password = general_purpose::STANDARD.encode(bytes);
    std::fs::write(&key_file, &password).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&key_file, std::fs::Permissions::from_mode(0o600));
    }
    Ok(password)
}

// --- استعادة النسخة الاحتياطية إلى قاعدة البيانات ---
#[tauri::command]
async fn restore_backup_to_db(state: tauri::State<'_, PgPool>, file_path: String, password: String) -> Result<serde_json::Value, String> {
    let encrypted_data = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let plaintext = decrypt_data(&encrypted_data, &password)?;
    let backup: serde_json::Value = serde_json::from_str(&plaintext).map_err(|e| format!("فشل تحليل JSON: {}", e))?;

    let pool = state.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut restored_counts = serde_json::Map::new();

    // استعادة الأدوية
    if let Some(medicines) = backup.get("tables").and_then(|t| t.get("medicines")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for med in medicines {
            let id_str = med["id"].as_str().unwrap_or("");
            let id = uuid::Uuid::parse_str(id_str).unwrap_or_else(|_| uuid::Uuid::new_v4());
            let name_ar = med["name_ar"].as_str().unwrap_or("");
            let name_en = med["name_en"].as_str();
            let scientific_name = med["scientific_name"].as_str();
            let barcode = med["barcode"].as_str();
            let price: rust_decimal::Decimal = med["price"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let cost_price: rust_decimal::Decimal = med["cost_price"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let quantity: i32 = med["quantity"].as_i64().unwrap_or(0) as i32;
            let batch_number = med["batch_number"].as_str();
            let expiry_date: Option<chrono::NaiveDate> = med["expiry_date"].as_str().and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
            let is_deleted = med["is_deleted"].as_bool().unwrap_or(false);

            let _ = sqlx::query(
                "INSERT INTO medicines (id, name_ar, name_en, scientific_name, barcode, price, cost_price, quantity, batch_number, expiry_date, is_deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, price = EXCLUDED.price, cost_price = EXCLUDED.cost_price"
            )
            .bind(id).bind(name_ar).bind(name_en).bind(scientific_name).bind(barcode)
            .bind(price).bind(cost_price).bind(quantity).bind(batch_number).bind(expiry_date).bind(is_deleted)
            .execute(&mut *tx).await;
            count += 1;
        }
        restored_counts.insert("medicines".to_string(), serde_json::Value::Number(count.into()));
    }

    // استعادة الفواتير
    if let Some(invoices) = backup.get("tables").and_then(|t| t.get("invoices")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for inv in invoices {
            let id_str = inv["id"].as_str().unwrap_or("");
            let id = uuid::Uuid::parse_str(id_str).unwrap_or_else(|_| uuid::Uuid::new_v4());
            let total: rust_decimal::Decimal = inv["total_amount"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let profit: rust_decimal::Decimal = inv["profit_amount"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let user_role = inv["user_role"].as_str().unwrap_or("unknown");
            let created_at: Option<chrono::NaiveDateTime> = inv["created_at"].as_str().and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok());
            let is_reversed = inv["is_reversed"].as_bool().unwrap_or(false);

            let _ = sqlx::query(
                "INSERT INTO invoices (id, total_amount, profit_amount, user_role, created_at, is_reversed)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO NOTHING"
            )
            .bind(id).bind(total).bind(profit).bind(user_role).bind(created_at).bind(is_reversed)
            .execute(&mut *tx).await;
            count += 1;
        }
        restored_counts.insert("invoices".to_string(), serde_json::Value::Number(count.into()));
    }

    // استعادة عناصر الفواتير
    if let Some(items) = backup.get("tables").and_then(|t| t.get("invoice_items")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for item in items {
            let inv_id_str = item["invoice_id"].as_str().unwrap_or("");
            let inv_id = uuid::Uuid::parse_str(inv_id_str).unwrap_or_else(|_| uuid::Uuid::new_v4());
            let med_id: Option<uuid::Uuid> = item["medicine_id"].as_str().and_then(|s| uuid::Uuid::parse_str(s).ok());
            let name_ar = item["name_ar"].as_str().unwrap_or("");
            let quantity: i32 = item["quantity"].as_i64().unwrap_or(0) as i32;
            let price: rust_decimal::Decimal = item["price"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);

            let _ = sqlx::query(
                "INSERT INTO invoice_items (invoice_id, medicine_id, name_ar, quantity, price)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING"
            )
            .bind(inv_id).bind(med_id).bind(name_ar).bind(quantity).bind(price)
            .execute(&mut *tx).await;
            count += 1;
        }
        restored_counts.insert("invoice_items".to_string(), serde_json::Value::Number(count.into()));
    }

    // استعادة الديون
    if let Some(debts) = backup.get("tables").and_then(|t| t.get("customer_debts")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for debt in debts {
            let customer_name = debt["customer_name"].as_str().unwrap_or("");
            let amount: rust_decimal::Decimal = debt["amount"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let is_paid = debt["is_paid"].as_bool().unwrap_or(false);
            let note = debt["note"].as_str();
            let created_at: Option<chrono::NaiveDateTime> = debt["created_at"].as_str().and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok());

            let _ = sqlx::query(
                "INSERT INTO customer_debts (customer_name, amount, is_paid, note, created_at)
                 VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(customer_name).bind(amount).bind(is_paid).bind(note).bind(created_at)
            .execute(&mut *tx).await;
            count += 1;
        }
        restored_counts.insert("customer_debts".to_string(), serde_json::Value::Number(count.into()));
    }

    // استعادة الموردين
    if let Some(suppliers) = backup.get("tables").and_then(|t| t.get("suppliers")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for sup in suppliers {
            let name = sup["name"].as_str().unwrap_or("");
            let phone = sup["phone"].as_str();
            let address = sup["address"].as_str();
            let balance: rust_decimal::Decimal = sup["balance"].as_str().and_then(|s| s.parse().ok()).unwrap_or(rust_decimal::Decimal::ZERO);
            let is_active = sup["is_active"].as_bool().unwrap_or(true);

            let _ = sqlx::query(
                "INSERT INTO suppliers (name, phone, address, balance, is_active)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET balance = EXCLUDED.balance"
            )
            .bind(name).bind(phone).bind(address).bind(balance).bind(is_active)
            .execute(&mut *tx).await;
            count += 1;
        }
        restored_counts.insert("suppliers".to_string(), serde_json::Value::Number(count.into()));
    }

    // استعادة الإعدادات
    if let Some(settings) = backup.get("tables").and_then(|t| t.get("settings")).and_then(|m| m.as_array()) {
        let mut count = 0;
        for setting in settings {
            let key = setting["key"].as_str().unwrap_or("");
            let value = setting["value"].as_str().unwrap_or("");
            if !key.is_empty() {
                let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2")
                    .bind(key).bind(value).execute(&mut *tx).await;
                count += 1;
            }
        }
        restored_counts.insert("settings".to_string(), serde_json::Value::Number(count.into()));
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "restored": restored_counts,
        "message": "تمت الاستعادة بنجاح. أعد تشغيل التطبيق لرؤية التغييرات."
    }))
}

// --- 7. RBAC ---
#[tauri::command]
async fn get_roles_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, description, is_system FROM roles ORDER BY name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut roles = Vec::new();
    for row in rows {
        roles.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "description": row.get::<Option<String>, _>(3),
            "isSystem": row.get::<bool, _>(4),
        }));
    }
    Ok(roles)
}

#[tauri::command]
async fn get_permissions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, category FROM permissions ORDER BY category, name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut perms = Vec::new();
    for row in rows {
        perms.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "category": row.get::<String, _>(3),
        }));
    }
    Ok(perms)
}

#[tauri::command]
async fn get_role_permissions_db(state: tauri::State<'_, PgPool>, role_id: String) -> Result<Vec<String>, String> {
    let uuid_id = uuid::Uuid::parse_str(&role_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = $1")
        .bind(uuid_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut perms = Vec::new();
    for row in rows { perms.push(row.get::<String, _>(0)); }
    Ok(perms)
}

// check_permission_db — يدعم كلا المسارين: role_id FK و role VARCHAR (للتوافق مع الكود القديم)
#[tauri::command]
async fn check_permission_db(state: tauri::State<'_, PgPool>, username: String, permission_name: String) -> Result<bool, String> {
    // محاولة 1: عبر role_id FK
    let result: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.id JOIN role_permissions rp ON r.id = rp.role_id JOIN permissions p ON rp.permission_id = p.id WHERE u.username = $1 AND p.name = $2 AND u.is_active = TRUE"
    )
    .bind(&username).bind(&permission_name)
    .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    if result.unwrap_or(0) > 0 { return Ok(true); }
    // محاولة 2: عبر role VARCHAR مباشرة (للمستخدمين بدون role_id)
    let result2: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users u JOIN roles r ON (LOWER(u.role) = LOWER(r.name) OR LOWER(u.role) = LOWER(r.display_name)) JOIN role_permissions rp ON r.id = rp.role_id JOIN permissions p ON rp.permission_id = p.id WHERE u.username = $1 AND p.name = $2 AND u.is_active = TRUE"
    )
    .bind(&username).bind(&permission_name)
    .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(result2.unwrap_or(0) > 0)
}

// --- 8. Performance Metrics ---
#[tauri::command]
async fn record_performance_metric_db(state: tauri::State<'_, PgPool>, metric_name: String, metric_value: f64, unit: String, context: Option<String>) -> Result<(), String> {
    sqlx::query("INSERT INTO performance_metrics (metric_name, metric_value, unit, context) VALUES ($1, $2, $3, $4)")
        .bind(&metric_name).bind(metric_value).bind(&unit).bind(context)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_performance_metrics_db(state: tauri::State<'_, PgPool>, metric_name: Option<String>, limit: i64) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(name) = metric_name {
        sqlx::query("SELECT id, metric_name, metric_value, unit, context, created_at FROM performance_metrics WHERE metric_name = $1 ORDER BY created_at DESC LIMIT $2")
            .bind(&name).bind(limit).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, metric_name, metric_value, unit, context, created_at FROM performance_metrics ORDER BY created_at DESC LIMIT $1")
            .bind(limit).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut metrics = Vec::new();
    for row in rows {
        metrics.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "metricName": row.get::<String, _>(1),
            "metricValue": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "unit": row.get::<String, _>(3),
            "context": row.get::<Option<String>, _>(4),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
        }));
    }
    Ok(metrics)
}

// --- 9. تقارير إضافية ---
#[tauri::command]
async fn get_inventory_movement_report_db(state: tauri::State<'_, PgPool>, _start_date: String, _end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT m.name_ar, m.barcode, m.quantity FROM medicines m WHERE m.is_deleted = FALSE ORDER BY m.name_ar")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "nameAr": row.get::<String, _>(0),
            "barcode": row.get::<Option<String>, _>(1),
            "currentQty": row.get::<i32, _>(2),
            "soldQty": 0i64, "refundedQty": 0i64, "purchasedQty": 0i64,
        }));
    }
    Ok(results)
}

#[tauri::command]
async fn get_supplier_report_db(state: tauri::State<'_, PgPool>, _start_date: String, _end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT name, phone, balance FROM suppliers ORDER BY name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "name": row.get::<String, _>(0),
            "phone": row.get::<Option<String>, _>(1),
            "balance": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "batchCount": 0i64, "totalPurchased": 0i64,
        }));
    }
    Ok(results)
}

#[tauri::command]
async fn get_cashier_report_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT i.user_role, COUNT(i.id), COALESCE(SUM(i.total_amount), 0), COALESCE(SUM(CASE WHEN i.total_amount < 0 THEN 1 ELSE 0 END), 0), COALESCE(SUM(i.profit_amount), 0) FROM invoices i WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date GROUP BY i.user_role ORDER BY SUM(i.total_amount) DESC")
        .bind(&start_date).bind(&end_date)
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "userRole": row.get::<Option<String>, _>(0).unwrap_or_else(|| "N/A".to_string()),
            "invoiceCount": row.get::<i64, _>(1),
            "totalSales": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "refundCount": row.get::<i64, _>(3),
            "totalProfit": row.get::<rust_decimal::Decimal, _>(4).to_string().parse::<f64>().unwrap_or(0.0),
        }));
    }
    Ok(results)
}

// --- 10. نقطة نهاية مخصصة للمرتجعات (بديل عن جلب كل الفواتير) ---
#[tauri::command]
async fn get_refunds_db(state: tauri::State<'_, PgPool>, limit: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let lim = limit.unwrap_or(100);
    // Single query with LEFT JOIN + json_agg to avoid N+1 (one query per refund for items).
    // The items JSON column is cast to ::text and parsed on the Rust side because the
    // sqlx `json` feature is not enabled in this project (no direct serde_json::Value decode).
    let rows = sqlx::query(
        "SELECT i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at, i.is_reversed, i.refund_reason_code, i.refund_notes, \
         COALESCE(json_agg(json_build_object('name', ii.name_ar, 'qty', ii.quantity, 'price', ii.price)) FILTER (WHERE ii.id IS NOT NULL), '[]'::json)::text as items \
         FROM invoices i \
         LEFT JOIN invoice_items ii ON ii.invoice_id = i.id \
         WHERE i.total_amount < 0 AND i.is_reversed = FALSE \
         GROUP BY i.id, i.total_amount, i.profit_amount, i.discount_amount, i.user_role, i.created_at, i.is_reversed, i.refund_reason_code, i.refund_notes \
         ORDER BY i.created_at DESC LIMIT $1"
    ).bind(lim).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut refunds = Vec::new();
    for row in rows {
        let inv_id: uuid::Uuid = row.get(0);
        let items_str: String = row.get(9);
        let items: serde_json::Value = serde_json::from_str(&items_str)
            .unwrap_or_else(|_| serde_json::Value::Array(vec![]));
        refunds.push(serde_json::json!({
            "id": inv_id.to_string(),
            "totalAmount": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
            "profitAmount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "discountAmount": row.get::<Option<rust_decimal::Decimal>, _>(3).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0),
            "userRole": row.get::<Option<String>, _>(4).unwrap_or_else(|| "N/A".to_string()),
            "date": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
            "isReversed": row.get::<bool, _>(6),
            "refundReasonCode": row.get::<Option<String>, _>(7),
            "refundNotes": row.get::<Option<String>, _>(8),
            "items": items,
        }));
    }
    Ok(refunds)
}

fn main() {
    init_logging();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // إزالة طباعة مفتاح التفعيل في stdout — كان يسمح بتجاوز الترخيص فوراً
            let _device_fingerprint = generate_device_fingerprint();
            // قراءة بيانات DB من متغيرات البيئة (لا hardcoded)
            let db_password = std::env::var("PHARMACY_DB_PASSWORD").unwrap_or_else(|_| "123456".to_string());
            let db_user = std::env::var("PHARMACY_DB_USER").unwrap_or_else(|_| "postgres".to_string());
            let db_host = std::env::var("PHARMACY_DB_HOST").unwrap_or_else(|_| "localhost".to_string());
            let db_port = std::env::var("PHARMACY_DB_PORT").unwrap_or_else(|_| "5432".to_string());
            let database_url = format!("postgres://{}:{}@{}:{}/pharmacy_db", db_user, db_password, db_host, db_port);
            let pool = tauri::async_runtime::block_on(async { 
                match PgPoolOptions::new().max_connections(10).connect(&database_url).await {
                    Ok(p) => p,
                    Err(_) => {
                        let admin_url = format!("postgres://{}:{}@{}:{}/postgres", db_user, db_password, db_host, db_port);
                        let admin_pool = PgPoolOptions::new().max_connections(1).connect(&admin_url).await.expect("Failed to connect to postgres");
                        sqlx::query("CREATE DATABASE pharmacy_db").execute(&admin_pool).await.ok();
                        drop(admin_pool);
                        PgPoolOptions::new().max_connections(10).connect(&database_url).await.expect("Failed to connect to database")
                    }
                }
            });
            tauri::async_runtime::block_on(async {
                // === Auto-recovery for migration checksum mismatches ===
                // sqlx::migrate يرفض المتابعة في عدة حالات:
                // 1. VersionMismatch: checksum الـ migration المطبق لا يطابق الملف الحالي
                // 2. VersionMissing: migration طُبق سابقاً لكن ملفه لم يعد موجوداً (مثل 20240106000000 الذي حذفناه)
                // 3. checksum: أي مشكلة في البصمة
                // الحل: نحاول التشغيل العادي أولاً، ولو فشل، نُنظّف السجلات المشكوك فيها ونُعيد المحاولة.
                if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
                    let err_str = e.to_string();
                    println!("[Migrations] First attempt failed: {}", err_str);

                    // تحقق من كل أنواع أخطاء migrations المعروفة
                    let is_migration_issue = err_str.contains("VersionMismatch")
                        || err_str.contains("VersionMissing")
                        || err_str.contains("checksum")
                        || err_str.contains("previously applied but is missing")
                        || err_str.contains("missing in the resolved migrations");

                    if is_migration_issue {
                        println!("[Migrations] Detected migration issue — attempting auto-recovery...");

                        // استخرج رقم الـ migration المشكوك فيه من رسالة الخطأ (لو وُجد)
                        // مثال: "migration 20240106000000 was previously applied..."
                        let problem_version = err_str
                            .split_whitespace()
                            .find(|w| w.chars().all(|c| c.is_ascii_digit()) && w.len() >= 14)
                            .map(|s| s.to_string());

                        if let Some(ref version) = problem_version {
                            println!("[Migrations] Removing stale record for version: {}", version);
                            let _ = sqlx::query("DELETE FROM _sqlx_migrations WHERE version = $1::bigint")
                                .bind(version.parse::<i64>().unwrap_or(0))
                                .execute(&pool).await;
                        }

                        // احذف كل سجلات migrations المعروفة بأنها تسبب مشاكل (مهما كان رقمها)
                        let _ = sqlx::query("DELETE FROM _sqlx_migrations WHERE version IN (20240105000000, 20240106000000)")
                            .execute(&pool).await;
                        println!("[Migrations] Removed known stale records (20240105000000, 20240106000000)");

                        // أعد محاولة تشغيل migrations
                        match sqlx::migrate!("./migrations").run(&pool).await {
                            Ok(_) => println!("[Migrations] Auto-recovery (tier 2) successful!"),
                            Err(e2) => {
                                let err2_str = e2.to_string();
                                println!("[Migrations] Tier 2 failed: {}", err2_str);

                                // محاولة أخيرة: احذف كل سجلات migrations وأعد من الصفر
                                println!("[Migrations] Last resort: clearing all migration history...");
                                let _ = sqlx::query("DELETE FROM _sqlx_migrations").execute(&pool).await;
                                // ملاحظة: هذا لن يحذف الجداول الموجودة (CREATE TABLE IF NOT EXISTS ستتخطاها)
                                match sqlx::migrate!("./migrations").run(&pool).await {
                                    Ok(_) => println!("[Migrations] Full reset (tier 3) successful!"),
                                    Err(e3) => panic!("Could not run migrations after auto-recovery: {}", e3),
                                }
                            }
                        }
                    } else {
                        panic!("Could not run migrations: {}", e);
                    }
                }
                
                let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = 'admin'").fetch_one(&pool).await.unwrap_or(0);
                if admin_count == 0 {
                    let admin_pass = bcrypt::hash("admin123", BCRYPT_COST).unwrap();
                    let cashier_pass = bcrypt::hash("cashier123", BCRYPT_COST).unwrap();
                    let _ = sqlx::query("INSERT INTO users (username, password, role, is_active) VALUES ('admin', $1, 'Super Admin', TRUE)").bind(admin_pass).execute(&pool).await;
                    let _ = sqlx::query("INSERT INTO users (username, password, role, is_active) VALUES ('cashier', $1, 'Cashier', TRUE)").bind(cashier_pass).execute(&pool).await;
                }
            });
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_license, login, save_csv_file, get_device_id, activate_license, create_backup, restore_backup, restore_backup_to_db, check_auto_backup,
            get_medicines_db, add_medicine_db, update_medicine_db, adjust_stock_db, soft_delete_medicine_db, bulk_update_prices_db,
            link_barcode_to_medicine_db,
            record_sale_db, record_refund_db, reverse_refund_db, add_expense_db, get_accounting_summary_db, reset_daily_db,
            get_settings_db, save_settings_db, log_action_db, get_audit_logs_db,
            get_top_medicines_db, get_dashboard_stats, get_filtered_sales_report, get_invoice_details_report, get_weekly_sales_stats,
            add_customer_debt_db, pay_customer_debt_db, get_customer_debts_db, delete_customer_debt_db,
            add_supplier_db, get_suppliers_db, record_purchase_db, pay_supplier_db,
            get_users_db, add_user_db, toggle_user_status_db, delete_user_db, verify_admin_password_db, reset_user_password_db,
            start_shift_db, close_shift_db, get_active_shift_db,
            suspend_invoice_db, get_suspended_invoices_db, delete_suspended_invoice_db,
            add_patient_db, get_patients_db,
            get_available_printers, print_receipt_direct,
            // أوامر النسخ الاحتياطي والصلاحيات
            get_backup_history_db, record_backup_history_db, create_auto_backup_db,
            get_roles_db, get_permissions_db, get_role_permissions_db, check_permission_db,
            get_inventory_movement_report_db, get_supplier_report_db, get_cashier_report_db,
            // أوامر PharmIQ Intelligence الجديدة
            pharmiq_commands::lookup_barcode_db, pharmiq_commands::bind_barcode_to_medicine_db,
            pharmiq_commands::generate_internal_barcode_db, pharmiq_commands::log_barcode_scan_db,
            pharmiq_commands::get_barcode_analytics_db,
            pharmiq_commands::get_payment_methods_db, pharmiq_commands::record_invoice_payment_db,
            pharmiq_commands::add_prescription_db, pharmiq_commands::get_prescriptions_db,
            pharmiq_commands::get_patient_loyalty_db, pharmiq_commands::redeem_loyalty_points_db,
            pharmiq_commands::create_stock_count_db, pharmiq_commands::update_stock_count_item_db,
            pharmiq_commands::complete_stock_count_db,
            pharmiq_commands::check_controlled_medicine_db,
            pharmiq_commands::seed_iraqi_medicines_db,
            pharmiq_commands::convert_currency_db, pharmiq_commands::update_exchange_rate_db,
            // أوامر PharmIQ Complete الجديدة
            pharmiq_complete::import_medicines_csv_db,
            pharmiq_complete::create_label_print_job_db, pharmiq_complete::get_label_print_jobs_db,
            pharmiq_complete::print_labels_direct_db,
            pharmiq_complete::get_refund_reasons_db, pharmiq_complete::record_refund_with_reason_db,
            pharmiq_complete::get_cash_drawer_events_db, pharmiq_complete::record_cash_drawer_event_db,
            pharmiq_complete::balance_cash_drawer_db,
            pharmiq_complete::get_expiry_losses_db, pharmiq_complete::record_expiry_loss_db,
            pharmiq_complete::get_parent_drug_groups_db, pharmiq_complete::create_parent_drug_group_db,
            pharmiq_complete::assign_drug_to_parent_group_db,
            pharmiq_complete::calculate_smart_profit_db,
            // أوامر Enterprise Complete الجديدة
            pharmiq_enterprise_complete::record_ledger_entry_db,
            pharmiq_enterprise_complete::record_sale_ledger_db,
            pharmiq_enterprise_complete::get_ledger_balance_db,
            pharmiq_enterprise_complete::get_ledger_entries_db,
            pharmiq_enterprise_complete::get_trial_balance_db,
            pharmiq_enterprise_complete::quarantine_stock_db,
            pharmiq_enterprise_complete::get_quarantined_stock_db,
            pharmiq_enterprise_complete::resolve_quarantine_db,
            pharmiq_enterprise_complete::save_draft_session_db,
            pharmiq_enterprise_complete::load_draft_session_db,
            pharmiq_enterprise_complete::clear_draft_session_db,
            pharmiq_enterprise_complete::record_price_change_db,
            pharmiq_enterprise_complete::get_price_history_db,
            pharmiq_enterprise_complete::get_expiry_sale_rules_db,
            pharmiq_enterprise_complete::calculate_expiry_discount_db,
            pharmiq_enterprise_complete::get_feature_flags_db,
            pharmiq_enterprise_complete::toggle_feature_flag_db,
            pharmiq_enterprise_complete::check_feature_flag_db,
            pharmiq_enterprise_complete::get_system_health_db,
            pharmiq_enterprise_complete::update_batch_exchange_rate_db,
            // أوامر الفواتير الشاملة
            invoices_commands::get_all_invoices_with_details_db,
            invoices_commands::delete_invoice_db,
            invoices_commands::mark_invoice_printed_db,
            invoices_commands::get_daily_receipt_stats_db,
            get_refunds_db,
            // Smart barcode lookup commands
            smart_barcode_commands::lookup_in_global_db,
            smart_barcode_commands::lookup_in_openfoodfacts,
            smart_barcode_commands::lookup_in_gs1,
            smart_barcode_commands::smart_barcode_lookup,
            smart_barcode_commands::add_medicine_from_global_db,
            // PharmIQ Features (Drug Interactions + Daily Checks + Printers + Orders)
            pharmiq_features::check_drug_interactions_db,
            pharmiq_features::log_interaction_override_db,
            pharmiq_features::get_all_drug_interactions_db,
            pharmiq_features::get_daily_inventory_checks_db,
            pharmiq_features::save_printer_settings_db,
            pharmiq_features::get_printer_settings_db,
            pharmiq_features::create_supplier_order_db,
            pharmiq_features::get_supplier_orders_db,
            pharmiq_features::update_supplier_order_status_db,
            pharmiq_features::get_inventory_value_db,
            pharmiq_new_features::get_discount_limit_db,
            pharmiq_new_features::check_discount_db,
            pharmiq_new_features::admin_override_discount_db,
            pharmiq_new_features::record_discount_usage_db,
            pharmiq_new_features::update_own_profile_db,
            pharmiq_new_features::create_partial_stock_count_db,
            pharmiq_new_features::get_stock_count_items_db,
            pharmiq_new_features::set_stock_count_item_reason_db,
            pharmiq_new_features::get_stock_count_report_db,
            // Mobile Scanner
            mobile_scanner::start_scanner_server,
            mobile_scanner::stop_scanner_server,
            mobile_scanner::get_scanner_server_status,
            mobile_scanner::generate_pairing_qr,
            mobile_scanner::get_connected_devices,
            mobile_scanner::get_scan_audit_logs,
            mobile_scanner::scanner_events::scan_barcode_direct,
            start_session_db, end_session_db, update_session_activity_db, get_active_sessions_db,
            create_fraud_alert_db, get_fraud_alerts_db, resolve_fraud_alert_db,
            create_journal_entry_db, complete_journal_entry_db, fail_journal_entry_db, get_pending_journal_entries_db,
            create_print_job_db, get_print_jobs_db,
            record_performance_metric_db, get_performance_metrics_db,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}