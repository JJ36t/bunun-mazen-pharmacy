// ========================================
// Mobile Scanner Module — WebSocket Gateway
// ========================================
// Enterprise Wireless Barcode Scanner System
// يعمل داخل LAN بدون polling

pub mod websocket_server;
pub mod pairing;
pub mod scanner_events;
pub mod barcode_parser;
pub mod rate_limiter;

use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::RwLock;

/// حالة السيرفر المشتركة
pub struct ScannerState {
    pub pool: PgPool,
    pub pairing_token: Arc<RwLock<Option<String>>>,
    pub connected_devices: Arc<RwLock<Vec<ConnectedDevice>>>,
}

#[derive(Clone)]
pub struct ConnectedDevice {
    pub device_id: String,
    pub device_name: String,
    pub device_ip: String,
    pub paired_at: chrono::NaiveDateTime,
    pub last_seen: chrono::NaiveDateTime,
}

/// بدء سيرفر WebSocket
#[tauri::command]
pub async fn start_scanner_server(
    state: tauri::State<'_, PgPool>,
) -> Result<serde_json::Value, String> {
    let port: i64 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'mobile_scanner_port'")
        .fetch_one(state.inner()).await.unwrap_or(8080);

    let ws_state = ScannerState {
        pool: state.inner().clone(),
        pairing_token: Arc::new(RwLock::new(None)),
        connected_devices: Arc::new(RwLock::new(Vec::new())),
    };

    // ابدأ السيرفر في background
    let port_usize = port as usize;
    let pool_clone = state.inner().clone();
    tokio::spawn(async move {
        let _ = websocket_server::run_server(port_usize, pool_clone).await;
    });

    // احصل على IP المحلي
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    Ok(serde_json::json!({
        "status": "running",
        "port": port,
        "ip": local_ip,
        "wsUrl": format!("ws://{}:{}", local_ip, port),
        "mobileUrl": format!("http://{}:{}/mobile", local_ip, port),
    }))
}

/// إيقاف السيرفر
#[tauri::command]
pub async fn stop_scanner_server() -> Result<(), String> {
    // السيرفر يعمل في background task — سيُغلق عند إغلاق التطبيق
    Ok(())
}

/// حالة السيرفر
#[tauri::command]
pub async fn get_scanner_server_status(
    state: tauri::State<'_, PgPool>,
) -> Result<serde_json::Value, String> {
    let port: i64 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'mobile_scanner_port'")
        .fetch_one(state.inner()).await.unwrap_or(8080);
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    Ok(serde_json::json!({
        "port": port,
        "ip": local_ip,
        "wsUrl": format!("ws://{}:{}", local_ip, port),
        "mobileUrl": format!("http://{}:{}/mobile", local_ip, port),
    }))
}

/// توليد QR code للإقتران
#[tauri::command]
pub async fn generate_pairing_qr(
    state: tauri::State<'_, PgPool>,
) -> Result<serde_json::Value, String> {
    let port: i64 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'mobile_scanner_port'")
        .fetch_one(state.inner()).await.unwrap_or(8080);
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    // توليد token عشوائي
    let token = pairing::generate_pairing_token();

    // حفظ في قاعدة البيانات
    sqlx::query("INSERT INTO mobile_pairing_sessions (pairing_token, expires_at) VALUES ($1, NOW() + INTERVAL '10 minutes')")
        .bind(&token)
        .execute(state.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mobile_url = format!("http://{}:{}/mobile?token={}", local_ip, port, token);

    // توليد QR code كـ base64
    let qr = qrcode::QrCode::new(&mobile_url).map_err(|e| e.to_string())?;
    let image = qr.render::<image::Luma<u8>>().min_dimensions(300, 300).build();
    let mut buf = Vec::new();
    image::DynamicImage::ImageLuma8(image).write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let qr_base64 = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&buf));

    Ok(serde_json::json!({
        "token": token,
        "url": mobile_url,
        "qrCode": qr_base64,
        "expiresIn": 600,
    }))
}

/// الأجهزة المتصلة
#[tauri::command]
pub async fn get_connected_devices(
    state: tauri::State<'_, PgPool>,
) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, device_name, device_ip, paired_at, last_seen FROM mobile_pairing_sessions WHERE is_active = TRUE ORDER BY paired_at DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;

    let mut devices = Vec::new();
    for r in rows {
        devices.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "deviceName": r.get::<Option<String>, _>(1).unwrap_or_default(),
            "deviceIp": r.get::<Option<String>, _>(2).unwrap_or_default(),
            "pairedAt": r.get::<chrono::NaiveDateTime, _>(3).to_string(),
            "lastSeen": r.get::<Option<chrono::NaiveDateTime>, _>(4).map(|d| d.to_string()),
        }));
    }
    Ok(devices)
}

/// سجل عمليات المسح
#[tauri::command]
pub async fn get_scan_audit_logs(
    state: tauri::State<'_, PgPool>,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let lim = limit.unwrap_or(100);
    let rows = sqlx::query("SELECT id, device_name, device_ip, user_role, barcode_scanned, barcode_type, scan_result, matched_medicine_name, created_at FROM scan_audit_logs ORDER BY created_at DESC LIMIT $1")
        .bind(lim).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for r in rows {
        logs.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "deviceName": r.get::<Option<String>, _>(1).unwrap_or_default(),
            "deviceIp": r.get::<Option<String>, _>(2).unwrap_or_default(),
            "userRole": r.get::<Option<String>, _>(3).unwrap_or_default(),
            "barcode": r.get::<String, _>(4),
            "barcodeType": r.get::<Option<String>, _>(5).unwrap_or_default(),
            "scanResult": r.get::<String, _>(6),
            "matchedMedicine": r.get::<Option<String>, _>(7).unwrap_or_default(),
            "createdAt": r.get::<chrono::NaiveDateTime, _>(8).to_string(),
        }));
    }
    Ok(logs)
}

/// الحصول على IP المحلي
fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}
