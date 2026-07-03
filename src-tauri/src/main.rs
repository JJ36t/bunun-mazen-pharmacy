#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

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
fn encrypt_data(data: &str, password: &str) -> Result<String, String> {
    let key_bytes = digest::digest(&digest::SHA256, password.as_bytes());
    let key = Key::<Aes256Gcm>::from_slice(key_bytes.as_ref());
    let cipher = Aes256Gcm::new(key);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!("{}:{}", general_purpose::STANDARD.encode(nonce_bytes), general_purpose::STANDARD.encode(ciphertext)))
}

fn decrypt_data(encrypted_data: &str, password: &str) -> Result<String, String> {
    let key_bytes = digest::digest(&digest::SHA256, password.as_bytes());
    let key = Key::<Aes256Gcm>::from_slice(key_bytes.as_ref());
    let cipher = Aes256Gcm::new(key);
    let parts: Vec<&str> = encrypted_data.split(':').collect();
    if parts.len() != 2 { return Err("صيغة الملف المشفر غير صحيحة".to_string()); }
    let nonce_bytes = general_purpose::STANDARD.decode(parts[0]).map_err(|e| e.to_string())?;
    let ciphertext = general_purpose::STANDARD.decode(parts[1]).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext.as_ref()).map_err(|_| "كلمة مرور النسخة الاحتياطية خاطئة".to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_csv_file(filename: String, content: String) -> Result<String, String> {
    let desktop_dir = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let path = format!("{}\\Desktop\\{}", desktop_dir, filename);
    std::fs::File::create(&path).map_err(|e| e.to_string())?.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
fn create_backup(data: String, password: String) -> Result<String, String> {
    let desktop_dir = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let path = format!("{}\\Desktop\\Pharmacy_Backup_{}.enc", desktop_dir, chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let encrypted_data = encrypt_data(&data, &password)?;
    std::fs::File::create(&path).map_err(|e| e.to_string())?.write_all(encrypted_data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path)
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
    let row = sqlx::query("SELECT password, role FROM users WHERE username = $1 AND is_active = TRUE")
        .bind(&username).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    match row {
        Some(r) => {
            let hashed_pass: String = r.get(0);
            let role: String = r.get(1);
            if bcrypt::verify(&password, &hashed_pass).unwrap_or(false) {
                Ok(serde_json::json!({ "username": username, "role": role }))
            } else { Err("بيانات الدخول غير صحيحة".to_string()) }
        },
        None => Err("بيانات الدخول غير صحيحة أو الحساب موقوف".to_string()),
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
async fn get_users_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, username, role, is_active FROM users WHERE deleted_at IS NULL ORDER BY username")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut users = Vec::new();
    for row in rows {
        users.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "username": row.get::<String, _>(1), "role": row.get::<String, _>(2), "isActive": row.get::<bool, _>(3) }));
    }
    Ok(users)
}

#[tauri::command]
async fn add_user_db(state: tauri::State<'_, PgPool>, username: String, password: String, role: String) -> Result<(), String> {
    let hashed = bcrypt::hash(&password, 8).map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)").bind(&username).bind(hashed).bind(&role).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn reset_user_password_db(state: tauri::State<'_, PgPool>, user_id: String, new_password: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?;
    let hashed = bcrypt::hash(&new_password, 8).map_err(|e| e.to_string())?;
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
    let row = sqlx::query("INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id")
        .bind(&name_ar).bind(&name_en).bind(&scientific_name).bind(&barcode)
        .bind(rust_decimal::Decimal::from_f64(price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(wholesale_price).ok_or("Err")?).bind(rust_decimal::Decimal::from_f64(cost_price).ok_or("Err")?)
        .bind(0).bind(&batch_number).bind(expiry)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let med_id: uuid::Uuid = row.get(0);

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

// --- أوامر المحاسقة (وإصلاح خصم المخزون المزدوج) ---
#[tauri::command]
async fn record_sale_db(state: tauri::State<'_, PgPool>, discount_percentage: f64, items_json: String, user_role: String) -> Result<(), String> {
    let pool = state.inner();
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
    let discount_amount = subtotal * discount_factor;
    let final_total = subtotal - discount_amount;
    let final_profit = total_profit - discount_amount;

    let row = sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role, daily_receipt_number) VALUES ($1, $2, $3, get_daily_receipt_number()) RETURNING id")
        .bind(final_total).bind(final_profit).bind(&user_role).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
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
    
    let desc = format!("بيع فاتورة بمبلغ {}. الأصناف: {}", final_total, items_desc.join(", "));
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("SALE_INVOICE").bind(desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
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
    let sales_row = sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0) FROM invoices").fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let exp_row = sqlx::query("SELECT COALESCE(SUM(amount), 0) FROM expenses").fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let total_sales: rust_decimal::Decimal = sales_row.get(0); let total_profits: rust_decimal::Decimal = sales_row.get(1);
    let total_expenses: rust_decimal::Decimal = exp_row.get(0); let cashbox = total_sales - total_expenses;
    let exp_rows = sqlx::query("SELECT id, description, amount, created_at FROM expenses ORDER BY created_at DESC LIMIT 10").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut expenses_list = Vec::new();
    for row in exp_rows {
        expenses_list.push(serde_json::json!({ "id": row.get::<uuid::Uuid, _>(0).to_string(), "description": row.get::<String, _>(1), "amount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0), "date": row.get::<chrono::NaiveDateTime, _>(3).to_string() }));
    }
    Ok(serde_json::json!({ "totalSales": total_sales.to_string().parse::<f64>().unwrap_or(0.0), "totalProfits": total_profits.to_string().parse::<f64>().unwrap_or(0.0), "totalExpenses": total_expenses.to_string().parse::<f64>().unwrap_or(0.0), "cashbox": cashbox.to_string().parse::<f64>().unwrap_or(0.0), "expenses": expenses_list }))
}

#[tauri::command]
async fn reset_daily_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<(), String> {
    if user_role != "Super Admin" { return Err("صلاحية غير كافية: يجب أن تكون مديراً للقيام بالإغلاق اليومي.".to_string()); }
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("TRUNCATE TABLE invoice_items RESTART IDENTITY").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("TRUNCATE TABLE invoices RESTART IDENTITY").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("TRUNCATE TABLE expenses RESTART IDENTITY").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("TRUNCATE TABLE audit_logs RESTART IDENTITY").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, $2, $3)").bind(user_role).bind("DAILY_CLOSING").bind("إغلاق يومي وتصفير العدادات").execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// --- أوامر التقارير المتقدمة ---
#[tauri::command]
async fn get_filtered_sales_report(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, user_filter: String) -> Result<serde_json::Value, String> {
    let row = if user_filter == "all" {
        sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0), COUNT(id) FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date").bind(&start_date).bind(&end_date).fetch_one(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(profit_amount), 0), COUNT(id) FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date AND user_role = $3").bind(&start_date).bind(&end_date).bind(&user_filter).fetch_one(state.inner()).await.map_err(|e| e.to_string())?
    };
    Ok(serde_json::json!({
        "totalSales": row.get::<rust_decimal::Decimal, _>(0).to_string().parse::<f64>().unwrap_or(0.0),
        "totalProfits": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
        "invoiceCount": row.get::<i64, _>(2)
    }))
}

#[tauri::command]
async fn get_invoice_details_report(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, user_filter: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = if user_filter == "all" {
        sqlx::query("SELECT id, total_amount, profit_amount, user_role, created_at FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date ORDER BY created_at DESC").bind(&start_date).bind(&end_date).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, total_amount, profit_amount, user_role, created_at FROM invoices WHERE created_at::date >= $1::date AND created_at::date <= $2::date AND user_role = $3 ORDER BY created_at DESC").bind(&start_date).bind(&end_date).bind(&user_filter).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut invoices = Vec::new();
    for row in rows {
        let inv_id: uuid::Uuid = row.get(0);
        let item_rows = sqlx::query("SELECT name_ar, quantity, price FROM invoice_items WHERE invoice_id = $1").bind(inv_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for ir in item_rows {
            items.push(serde_json::json!({ "name": ir.get::<String, _>(0), "qty": ir.get::<i32, _>(1), "price": ir.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0) }));
        }
        invoices.push(serde_json::json!({
            "id": inv_id.to_string(), "totalAmount": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
            "profitAmount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0), 
            "userRole": row.get::<Option<String>, _>(3).unwrap_or_else(|| "N/A".to_string()),
            "date": row.get::<chrono::NaiveDateTime, _>(4).to_string(), "items": items
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
    sqlx::query("UPDATE medicines SET quantity = quantity + $1, cost_price = $2, price = $3, wholesale_price = $4 WHERE id = $5").bind(quantity).bind(cost_dec).bind(sell_dec).bind(wholesale_dec).bind(med_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
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
    let low_stock_row = sqlx::query("SELECT COUNT(id) FROM medicines WHERE quantity < 50 AND is_deleted = FALSE").fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let low_stock_count: i64 = low_stock_row.get(0);
    Ok(serde_json::json!({ "todaySales": today_sales.to_string().parse::<f64>().unwrap_or(0.0), "todayInvoices": today_invoices, "lowStockCount": low_stock_count }))
}

#[tauri::command]
async fn get_weekly_sales_stats(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let mut results = Vec::new();
    for i in 0..7 {
        let date = chrono::Local::now().date_naive() - chrono::Duration::days(i);
        let row = sqlx::query("SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE created_at::date = $1").bind(date).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
        let total: rust_decimal::Decimal = row.get(0);
        results.push(serde_json::json!({ "date": date.format("%Y-%m-%d").to_string(), "sales": total.to_string().parse::<f64>().unwrap_or(0.0) }));
    }
    Ok(results)
}

// --- أوامر الطباعة المباشرة (ESC/POS) ---

#[tauri::command]
fn get_available_printers() -> Vec<String> {
    let output = Command::new("cmd")
        .args(&["/C", "wmic printer get name"])
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines()
                .skip(1)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        },
        Err(_) => vec![],
    }
}

#[tauri::command]
fn print_receipt_direct(printer_name: String, pharmacy_name: String, invoice_num: String, items_json: String, total: String) -> Result<(), String> {
    let mut esc_data: Vec<u8> = Vec::new();
    
    esc_data.extend_from_slice(b"\x1B\x40"); 
    esc_data.extend_from_slice(b"\x1B\x61\x01"); 
    esc_data.extend_from_slice(format!("{}\n", pharmacy_name).as_bytes());
    esc_data.extend_from_slice(b"\x1B\x61\x00"); 
    esc_data.extend_from_slice(b"----------------------------\n");
    esc_data.extend_from_slice(format!("Invoice: {}\n", invoice_num).as_bytes());
    esc_data.extend_from_slice(b"----------------------------\n");
    
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    for item in items {
        let name = item["nameAr"].as_str().unwrap_or("");
        let qty = item["quantity"].as_i64().unwrap_or(0);
        let price = item["price"].as_f64().unwrap_or(0.0);
        esc_data.extend_from_slice(format!("{:<20} x{} {:.2}\n", name, qty, price * qty as f64).as_bytes());
    }
    
    esc_data.extend_from_slice(b"----------------------------\n");
    esc_data.extend_from_slice(b"\x1B\x45\x01"); 
    esc_data.extend_from_slice(format!("TOTAL: {} IQD\n", total).as_bytes());
    esc_data.extend_from_slice(b"\x1B\x45\x00"); 
    esc_data.extend_from_slice(b"\n\n\n");
    esc_data.extend_from_slice(b"\x1D\x56\x00"); 

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("pharmacy_receipt.prn");
    std::fs::write(&temp_file, &esc_data).map_err(|e| e.to_string())?;

    let printer_arg = format!("/d:{}", printer_name);
    let output = Command::new("print")
        .arg(&printer_arg)
        .arg(temp_file.to_str().unwrap())
        .output()
        .map_err(|e| format!("فشل الطباعة: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("فشل الطباعة: {}", err_msg));
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

#[tauri::command]
async fn create_auto_backup_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<String, String> {
    let backup_data = serde_json::json!({
        "backupDate": chrono::Utc::now().to_rfc3339(),
        "version": "2.3.0",
        "type": "auto"
    }).to_string();
    
    let password = "AUTO_BACKUP_2024_BUNUN_MAZEN";
    let encrypted_data = encrypt_data(&backup_data, password)?;
    
    let desktop_dir = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let backup_dir = format!("{}\\Desktop\\PharmacyBackups", desktop_dir);
    std::fs::create_dir_all(&backup_dir).ok();
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let path = format!("{}\\auto_backup_{}.enc", backup_dir, timestamp);
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
        .bind(&path).bind(file_size).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('last_backup', $1) ON CONFLICT (key) DO UPDATE SET value = $1")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    Ok(path)
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

#[tauri::command]
async fn check_permission_db(state: tauri::State<'_, PgPool>, username: String, permission_name: String) -> Result<bool, String> {
    let result: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.id JOIN role_permissions rp ON r.id = rp.role_id JOIN permissions p ON rp.permission_id = p.id WHERE u.username = $1 AND p.name = $2 AND u.is_active = TRUE"
    )
    .bind(&username).bind(&permission_name)
    .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(result.unwrap_or(0) > 0)
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

fn main() {
    init_logging();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let device_fingerprint = generate_device_fingerprint();
            println!("==============================\nDevice ID: {}\nValid Activation Key: {}\n==============================", device_fingerprint, generate_activation_key(&device_fingerprint));
            let database_url = "postgres://postgres:123456@localhost:5432/pharmacy_db";
            let pool = tauri::async_runtime::block_on(async { 
                // محاولة الاتصال بقاعدة البيانات الموجودة
                match PgPoolOptions::new().max_connections(5).connect(database_url).await {
                    Ok(p) => p,
                    Err(_) => {
                        // إنشاء قاعدة بيانات جديدة فقط إذا لم تكن موجودة
                        let admin_url = "postgres://postgres:123456@localhost:5432/postgres";
                        let admin_pool = PgPoolOptions::new().max_connections(1).connect(admin_url).await.expect("Failed to connect to postgres");
                        sqlx::query("CREATE DATABASE pharmacy_db").execute(&admin_pool).await.ok();
                        drop(admin_pool);
                        PgPoolOptions::new().max_connections(5).connect(database_url).await.expect("Failed to connect to database")
                    }
                }
            });
            tauri::async_runtime::block_on(async {
                // تشغيل migrations (تستخدم CREATE TABLE IF NOT EXISTS فلا تضارب)
                match sqlx::migrate!("./migrations").run(&pool).await {
                    Ok(_) => println!("Migrations applied successfully."),
                    Err(e) => {
                        println!("Migration error: {}", e);
                        // حذف سجل migrations وإعادة المحاولة
                        let _ = sqlx::query("DROP TABLE IF EXISTS _sqlx_migrations CASCADE").execute(&pool).await;
                        match sqlx::migrate!("./migrations").run(&pool).await {
                            Ok(_) => println!("Migrations applied after reset."),
                            Err(e2) => panic!("Could not run migrations: {}", e2),
                        }
                    }
                }
                
                // إنشاء المستخدمين الافتراضيين فقط إذا لم يكونوا موجودين
                let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = 'admin'").fetch_one(&pool).await.unwrap_or(0);
                if admin_count == 0 {
                    let admin_pass = bcrypt::hash("admin123", 8).unwrap();
                    let cashier_pass = bcrypt::hash("cashier123", 8).unwrap();
                    let _ = sqlx::query("INSERT INTO users (username, password, role, is_active) VALUES ('admin', $1, 'Super Admin', TRUE)").bind(admin_pass).execute(&pool).await;
                    let _ = sqlx::query("INSERT INTO users (username, password, role, is_active) VALUES ('cashier', $1, 'Cashier', TRUE)").bind(cashier_pass).execute(&pool).await;
                    println!("Default users created: admin/admin123, cashier/cashier123");
                }
            });
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_license, login, save_csv_file, get_device_id, activate_license, create_backup, restore_backup, check_auto_backup,
            get_medicines_db, add_medicine_db, update_medicine_db, adjust_stock_db, soft_delete_medicine_db, bulk_update_prices_db,
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
            // أوامر الإضافات المؤسسية الجديدة
            start_session_db, end_session_db, update_session_activity_db, get_active_sessions_db,
            create_fraud_alert_db, get_fraud_alerts_db, resolve_fraud_alert_db,
            get_plugins_db, toggle_plugin_db,
            create_journal_entry_db, complete_journal_entry_db, fail_journal_entry_db, get_pending_journal_entries_db,
            create_print_job_db, get_print_jobs_db,
            get_backup_history_db, record_backup_history_db, create_auto_backup_db,
            get_roles_db, get_permissions_db, get_role_permissions_db, check_permission_db,
            record_performance_metric_db, get_performance_metrics_db,
            get_inventory_movement_report_db, get_supplier_report_db, get_cashier_report_db,
            // أوامر PharmIQ Intelligence الجديدة
            pharmiq_commands::get_drug_master_db, pharmiq_commands::add_drug_master_db,
            pharmiq_commands::search_drug_master_db, pharmiq_commands::get_drug_substitutes_db,
            pharmiq_commands::check_drug_interactions_db,
            pharmiq_commands::lookup_barcode_db, pharmiq_commands::bind_barcode_to_medicine_db,
            pharmiq_commands::generate_internal_barcode_db, pharmiq_commands::log_barcode_scan_db,
            pharmiq_commands::get_barcode_analytics_db,
            pharmiq_commands::get_pricing_tiers_db, pharmiq_commands::get_medicine_pricing_db,
            pharmiq_commands::get_supplier_intelligence_db,
            pharmiq_commands::get_purchase_suggestions_db,
            pharmiq_commands::analyze_dead_stock_db, pharmiq_commands::get_expiry_risk_assessment_db,
            pharmiq_commands::get_hardware_devices_db, pharmiq_commands::add_hardware_device_db,
            pharmiq_commands::set_default_hardware_device_db,
            pharmiq_commands::get_branches_db, pharmiq_commands::add_branch_db,
            pharmiq_commands::enqueue_task_db, pharmiq_commands::get_task_queue_db,
            pharmiq_commands::update_task_status_db,
            pharmiq_commands::get_notifications_db, pharmiq_commands::create_notification_db,
            pharmiq_commands::mark_notification_read_db, pharmiq_commands::dismiss_notification_db,
            pharmiq_commands::get_payment_methods_db, pharmiq_commands::record_invoice_payment_db,
            pharmiq_commands::add_prescription_db, pharmiq_commands::get_prescriptions_db,
            pharmiq_commands::get_patient_loyalty_db, pharmiq_commands::redeem_loyalty_points_db,
            pharmiq_commands::create_stock_count_db, pharmiq_commands::update_stock_count_item_db,
            pharmiq_commands::complete_stock_count_db,
            pharmiq_commands::check_controlled_medicine_db,
            pharmiq_commands::seed_iraqi_medicines_db,
            pharmiq_commands::convert_currency_db, pharmiq_commands::update_exchange_rate_db,
            pharmiq_commands::sync_drug_master_to_medicines_db,
            // أوامر PharmIQ Complete الجديدة
            pharmiq_complete::import_medicines_csv_db,
            pharmiq_complete::create_label_print_job_db, pharmiq_complete::get_label_print_jobs_db,
            pharmiq_complete::print_labels_direct_db,
            pharmiq_complete::get_refund_reasons_db, pharmiq_complete::record_refund_with_reason_db,
            pharmiq_complete::get_cash_drawer_events_db, pharmiq_complete::record_cash_drawer_event_db,
            pharmiq_complete::balance_cash_drawer_db,
            pharmiq_complete::get_expiry_losses_db, pharmiq_complete::record_expiry_loss_db,
            pharmiq_complete::get_expiry_transfer_suggestions_db,
            pharmiq_complete::get_stop_purchase_suggestions_db,
            pharmiq_complete::get_supplier_pricing_history_db,
            pharmiq_complete::create_supplier_return_db, pharmiq_complete::get_supplier_returns_db,
            pharmiq_complete::get_seasonal_demand_analysis_db,
            pharmiq_complete::calculate_demand_forecast_db,
            pharmiq_complete::get_parent_drug_groups_db, pharmiq_complete::create_parent_drug_group_db,
            pharmiq_complete::assign_drug_to_parent_group_db,
            pharmiq_complete::check_dosage_compatibility_db,
            pharmiq_complete::parse_gs1_barcode_db,
            pharmiq_complete::get_multi_pack_barcodes_db, pharmiq_complete::add_multi_pack_barcode_db,
            pharmiq_complete::calculate_smart_profit_db,
            pharmiq_complete::get_drug_aliases_db, pharmiq_complete::add_drug_alias_db,
            pharmiq_complete::get_scan_modes_db, pharmiq_complete::update_scan_mode_db,
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
            invoices_commands::get_daily_receipt_stats_db
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}