// WebSocket + HTTP Server for Mobile Scanner (HTTPS/WSS مع شهادة self-signed)
use tauri::Emitter;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};
use sqlx::{PgPool, Row};
use crate::mobile_scanner::barcode_parser;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::io::AsyncWriteExt;
use tokio_rustls::TlsAcceptor;
use rustls::ServerConfig;
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};

/// توليد أو تحميل شهادة self-signed دائمة (لا تُعاد كل إقلاع)
/// تُخزّن في مجلد بيانات التطبيق
fn generate_self_signed_cert(ip: &str) -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), String> {
    let app_dir = dirs_next::data_dir()
        .ok_or("تعذّر تحديد مجلد البيانات")?
        .join("BununMazenPharmacy");
    std::fs::create_dir_all(&app_dir).ok();
    let cert_file = app_dir.join("scanner_cert.der");
    let key_file = app_dir.join("scanner_key.der");

    // إذا وُجدت شهادة محفوظة، حمّلها
    if cert_file.exists() && key_file.exists() {
        if let (Ok(cert_bytes), Ok(key_bytes)) = (
            std::fs::read(&cert_file),
            std::fs::read(&key_file),
        ) {
            println!("[MobileScanner] Loaded persisted self-signed cert");
            let cert = CertificateDer::from(cert_bytes);
            let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key_bytes));
            return Ok((cert, key));
        }
    }

    // توليد شهادة جديدة وحفظها
    println!("[MobileScanner] Generating new self-signed cert for IP: {}", ip);
    let sans = vec!["localhost".to_string(), ip.to_string()];
    let cert = rcgen::generate_simple_self_signed(sans)
        .map_err(|e| format!("rcgen failed: {}", e))?;

    let cert_der = cert.cert.der().to_vec();
    let key_der = cert.key_pair.serialize_der();

    // حفظ للإقلاعات القادمة (صلاحيات 0600 على يونكس)
    let _ = std::fs::write(&cert_file, &cert_der);
    let _ = std::fs::write(&key_file, &key_der);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&key_file, std::fs::Permissions::from_mode(0o600));
    }

    println!("[MobileScanner] Cert generated and persisted");
    Ok((CertificateDer::from(cert_der), PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key_der))))
}

/// إنشاء TLS acceptor لـ HTTPS/WSS
fn create_tls_acceptor(ip: &str) -> Result<TlsAcceptor, String> {
    let (cert, key) = generate_self_signed_cert(ip)?;

    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .map_err(|e| format!("TLS config failed: {}", e))?;

    Ok(TlsAcceptor::from(Arc::new(config)))
}

pub async fn run_server(port: usize, pool: PgPool, app_handle: tauri::AppHandle, cancel_token: tokio_util::sync::CancellationToken) -> Result<(), String> {
    let local_ip = crate::mobile_scanner::get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    println!("[MobileScanner] ====================================");
    println!("[MobileScanner] Starting HTTPS/WSS server");
    println!("[MobileScanner] Local IP: {}", local_ip);
    println!("[MobileScanner] HTTPS port: {} (https://{}:{})", port, local_ip, port);
    println!("[MobileScanner] WSS port: {} (wss://{}:{})", port + 1, local_ip, port + 1);
    println!("[MobileScanner] ====================================");

    // ثبّت CryptoProvider الافتراضي (ring) — مطلوب لـ rustls 0.23
    let _ = rustls::crypto::ring::default_provider().install_default();
    println!("[MobileScanner] CryptoProvider (ring) installed");

    // أنشئ TLS acceptor بشهادة self-signed للـ IP المحلي
    let tls_acceptor = create_tls_acceptor(&local_ip)?;
    println!("[MobileScanner] TLS acceptor created successfully");

    // Security fix: bind to specific LAN IP instead of 0.0.0.0 (all interfaces)
    // Previously bound to 0.0.0.0 — exposed to entire LAN, VPN, Docker, shared WiFi
    // Now binds to the specific local_ip (computed in run_server)
    let https_addr = format!("{}:{}", local_ip, port);
    let https_listener = TcpListener::bind(&https_addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] HTTPS listener bound on https://{}:{}", local_ip, port);

    let wss_port = port + 1;
    let wss_addr = format!("{}:{}", local_ip, wss_port);
    let wss_listener = TcpListener::bind(&wss_addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] WSS listener bound on wss://{}:{}", local_ip, wss_port);

    // HTTPS server
    let tls_acceptor_http = tls_acceptor.clone();
    let cancel_http = cancel_token.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancel_http.cancelled() => {
                    println!("[MobileScanner] HTTPS server shutting down");
                    break;
                }
                accept_result = https_listener.accept() => {
                    if let Ok((stream, peer_addr)) = accept_result {
                        println!("[HTTPS] Connection from {}", peer_addr);
                        let acceptor = tls_acceptor_http.clone();
                        tokio::spawn(async move {
                            match acceptor.accept(stream).await {
                                Ok(tls_stream) => {
                                    println!("[HTTPS] TLS handshake OK");
                                    let _ = handle_http_request(tls_stream).await;
                                }
                                Err(e) => println!("[HTTPS] TLS accept failed: {}", e),
                            }
                        });
                    }
                }
            }
        }
    });

    // WSS server
    let tls_acceptor_ws = tls_acceptor.clone();
    let pool_clone = pool.clone();
    let app_handle_ws = app_handle.clone();
    let cancel_ws = cancel_token.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancel_ws.cancelled() => {
                    println!("[MobileScanner] WSS server shutting down");
                    break;
                }
                accept_result = wss_listener.accept() => {
                    if let Ok((stream, addr)) = accept_result {
                        println!("[WSS] Connection from {}", addr);
                        let acceptor = tls_acceptor_ws.clone();
                        let p = pool_clone.clone();
                        let h = app_handle_ws.clone();
                        tokio::spawn(async move {
                            match acceptor.accept(stream).await {
                                Ok(tls_stream) => {
                                    let _ = handle_ws_connection(tls_stream, addr, p, h).await;
                                }
                                Err(e) => println!("[WSS] TLS accept failed: {}", e),
                            }
                        });
                    }
                }
            }
        }
    });

    // انتظر cancellation بدل sleep forever
    cancel_token.cancelled().await;
    // أعطِ المهام وقتاً قصيراً لإغلاق الـ listeners قبل العودة
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    println!("[MobileScanner] Server fully stopped");
    Ok(())
}

/// معالجة طلب HTTPS — إرجاع صفحة الموبايل
async fn handle_http_request<S>(mut stream: S) -> Result<(), String>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    use tokio::io::AsyncReadExt;
    let mut buf = [0u8; 4096];
    let _ = stream.read(&mut buf).await;

    let html = include_str!("../../mobile_scanner_page.html");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
        html.len(), html
    );

    stream.write_all(response.as_bytes()).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn handle_ws_connection<S>(
    stream: S,
    addr: SocketAddr,
    pool: PgPool,
    app_handle: tauri::AppHandle,
) -> Result<(), String>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let mut ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] Device connected: {}", addr);

    let welcome = serde_json::json!({
        "type": "connected",
        "message": "مرحباً بك في نظام المسح اللاسلكي",
        "serverTime": chrono::Utc::now().to_rfc3339(),
    });
    ws_stream.send(Message::Text(welcome.to_string())).await.map_err(|e| e.to_string())?;

    while let Some(msg) = ws_stream.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                    let msg_type = data.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    match msg_type {
                        "scan" => {
                            let barcode = data.get("barcode").and_then(|b| b.as_str()).unwrap_or("");
                            let device_name = data.get("deviceName").and_then(|d| d.as_str()).unwrap_or("Unknown");
                            let result = process_scan(barcode, &pool, device_name, &addr.to_string()).await;

                            // أرسل النتيجة للموبايل
                            let response = serde_json::json!({ "type": "scan_result", "barcode": barcode, "result": result });
                            ws_stream.send(Message::Text(response.to_string())).await.map_err(|e| e.to_string())?;

                            // أرسل النتيجة للتطبيق المكتبي (POS) عبر Tauri event
                            let _ = app_handle.emit("mobile-scan-received", &result);
                        }
                        "ping" => {
                            ws_stream.send(Message::Text(serde_json::json!({"type": "pong"}).to_string())).await.map_err(|e| e.to_string())?;
                        }
                        "pair" => {
                            let token = data.get("token").and_then(|t| t.as_str()).unwrap_or("");
                            let device_name = data.get("deviceName").and_then(|d| d.as_str()).unwrap_or("Unknown");
                            let valid = validate_pairing_token(token, &pool).await;
                            let response = serde_json::json!({
                                "type": "pair_result",
                                "success": valid,
                                "message": if valid { "تم الإقتران بنجاح" } else { "رمز الإقتران غير صالح" },
                            });
                            ws_stream.send(Message::Text(response.to_string())).await.map_err(|e| e.to_string())?;
                            if valid {
                                sqlx::query("UPDATE mobile_pairing_sessions SET is_active = TRUE, device_name = $1, device_ip = $2, last_seen = NOW() WHERE pairing_token = $3")
                                    .bind(device_name).bind(addr.to_string()).bind(token)
                                    .execute(&pool).await.ok();
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }
    println!("[MobileScanner] Device disconnected: {}", addr);
    Ok(())
}

async fn process_scan(barcode: &str, pool: &PgPool, device_name: &str, device_ip: &str) -> serde_json::Value {
    let normalized = barcode_parser::normalize_barcode(barcode);
    let barcode_type = barcode_parser::detect_barcode_type(barcode);

    let med_row = sqlx::query(
        "SELECT m.id, m.name_ar, m.price, m.quantity, m.barcode
         FROM medicine_barcodes mb
         JOIN medicines m ON mb.medicine_id = m.id
         WHERE (mb.barcode = $1 OR mb.normalized_barcode = $2)
           AND m.is_deleted = FALSE
         LIMIT 1"
    )
    .bind(barcode).bind(&normalized)
    .fetch_optional(pool).await;

    match med_row {
        Ok(Some(r)) => {
            let med_id: uuid::Uuid = r.get(0);
            let name: String = r.get(1);
            let price: rust_decimal::Decimal = r.get(2);
            let qty: i32 = r.get(3);

            let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, device_ip, barcode_scanned, barcode_type, normalized_barcode, scan_result, matched_medicine_id, matched_medicine_name) VALUES ($1, $2, $3, $4, $5, 'success', $6, $7)")
                .bind(device_name).bind(device_ip).bind(barcode).bind(&barcode_type).bind(&normalized).bind(med_id).bind(&name)
                .execute(pool).await;

            serde_json::json!({
                "status": "found",
                "barcode": barcode,
                "medicineId": med_id.to_string(),
                "nameAr": name,
                "price": price.to_string().parse::<f64>().unwrap_or(0.0),
                "quantity": qty,
                "barcodeType": barcode_type,
            })
        }
        _ => {
            let global_row = sqlx::query(
                "SELECT barcode, name_fr, active_ingredient, brand_name, dosage_form, dosage_form_ar, strength
                 FROM global_medicines WHERE barcode = $1 LIMIT 1"
            )
            .bind(barcode).fetch_optional(pool).await;

            match global_row {
                Ok(Some(r)) => {
                    let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, device_ip, barcode_scanned, barcode_type, normalized_barcode, scan_result, matched_medicine_name) VALUES ($1, $2, $3, $4, $5, 'global_found', $6)")
                        .bind(device_name).bind(device_ip).bind(barcode).bind(&barcode_type).bind(&normalized)
                        .bind(r.get::<Option<String>, _>(1).unwrap_or_default())
                        .execute(pool).await;

                    serde_json::json!({
                        "status": "global_found",
                        "barcode": barcode,
                        "name": r.get::<String, _>(1),
                        "activeIngredient": r.get::<Option<String>, _>(2),
                        "brandName": r.get::<Option<String>, _>(3),
                        "dosageForm": r.get::<Option<String>, _>(4),
                        "dosageFormAr": r.get::<Option<String>, _>(5),
                        "strength": r.get::<Option<String>, _>(6),
                        "barcodeType": barcode_type,
                    })
                }
                _ => {
                    // ابحث في OpenFoodFacts API عند عدم وجود الباركود محلياً
                    if let Some(off_data) = lookup_openfoodfacts_api(barcode).await {
                        // حفظ النتيجة في global_medicines لاستخدامها لاحقاً
                        let _ = sqlx::query(
                            "INSERT INTO global_medicines (barcode, name_fr, active_ingredient, brand_name, dosage_form, dosage_form_ar, strength, manufacturer, country, source, verified)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'openfoodfacts_api', TRUE)
                             ON CONFLICT (barcode) DO NOTHING"
                        )
                        .bind(barcode)
                        .bind(&off_data["name"].as_str().unwrap_or("Unknown"))
                        .bind(off_data["active_ingredient"].as_str())
                        .bind(off_data["brand_name"].as_str())
                        .bind(off_data["dosage_form"].as_str())
                        .bind(off_data["dosage_form_ar"].as_str())
                        .bind(off_data["strength"].as_str())
                        .bind(off_data["manufacturer"].as_str())
                        .bind(off_data["country"].as_str())
                        .execute(pool).await;

                        let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, device_ip, barcode_scanned, barcode_type, normalized_barcode, scan_result, matched_medicine_name) VALUES ($1, $2, $3, $4, $5, 'openfoodfacts_found', $6)")
                            .bind(device_name).bind(device_ip).bind(barcode).bind(&barcode_type).bind(&normalized)
                            .bind(off_data["name"].as_str().unwrap_or(""))
                            .execute(pool).await;

                        serde_json::json!({
                            "status": "global_found",
                            "barcode": barcode,
                            "name": off_data["name"].as_str().unwrap_or("Unknown"),
                            "activeIngredient": off_data["active_ingredient"].as_str(),
                            "brandName": off_data["brand_name"].as_str(),
                            "dosageForm": off_data["dosage_form"].as_str(),
                            "dosageFormAr": off_data["dosage_form_ar"].as_str(),
                            "strength": off_data["strength"].as_str(),
                            "manufacturer": off_data["manufacturer"].as_str(),
                            "country": off_data["country"].as_str(),
                            "barcodeType": barcode_type,
                            "source": "openfoodfacts_api",
                        })
                    } else {
                        let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, device_ip, barcode_scanned, barcode_type, normalized_barcode, scan_result) VALUES ($1, $2, $3, $4, $5, 'not_found')")
                            .bind(device_name).bind(device_ip).bind(barcode).bind(&barcode_type).bind(&normalized)
                            .execute(pool).await;

                        serde_json::json!({
                            "status": "not_found",
                            "barcode": barcode,
                            "normalized": normalized,
                            "barcodeType": barcode_type,
                        })
                    }
                }
            }
        }
    }
}

/// ابحث في OpenFoodFacts API عن الباركود
/// API: https://world.openfoodfacts.org/api/v2/product/{barcode}.json (v2 موحّد مع smart_barcode_commands)
async fn lookup_openfoodfacts_api(barcode: &str) -> Option<serde_json::Value> {
    let url = format!("https://world.openfoodfacts.org/api/v2/product/{}.json", barcode);

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("PharmacyBinMazen/2.3 (mobile-scanner)")
        .build() {
        Ok(c) => c,
        Err(_) => return None,
    };

    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => { println!("[OpenFoodFacts] Request failed: {}", e); return None; }
    };

    let body: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return None,
    };

    if body.get("status")?.as_i64()? != 1 {
        return None;
    }

    let product = body.get("product")?;
    let name = product.get("product_name").and_then(|n| n.as_str())
        .or_else(|| product.get("product_name_en").and_then(|n| n.as_str()))
        .or_else(|| product.get("generic_name").and_then(|n| n.as_str()))
        .unwrap_or("Unknown");

    let brands = product.get("brands").and_then(|b| b.as_str()).unwrap_or("");
    let quantity = product.get("quantity").and_then(|q| q.as_str()).unwrap_or("");
    let categories = product.get("categories").and_then(|c| c.as_str()).unwrap_or("");
    let countries = product.get("countries").and_then(|c| c.as_str()).unwrap_or("");
    let manufacturer = product.get("manufacturers").and_then(|m| m.as_str()).unwrap_or(brands);

    // اشتقاق المادة الفعالة من categories أو generic_name
    let active_ingredient = product.get("generic_name").and_then(|g| g.as_str())
        .unwrap_or("");

    // اشتقاق الشكل الدوائي
    let dosage_form = if categories.to_lowercase().contains("tablet") || categories.to_lowercase().contains("قرص") {
        "tablet"
    } else if categories.to_lowercase().contains("capsule") || categories.to_lowercase().contains("كبسول") {
        "capsule"
    } else if categories.to_lowercase().contains("syrup") || categories.to_lowercase().contains("شراب") {
        "syrup"
    } else if categories.to_lowercase().contains("cream") || categories.to_lowercase().contains("كريم") {
        "cream"
    } else if categories.to_lowercase().contains("drop") || categories.to_lowercase().contains("قطرة") {
        "drops"
    } else if categories.to_lowercase().contains("injection") || categories.to_lowercase().contains("حقن") {
        "injection"
    } else {
        "other"
    };

    let dosage_form_ar = match dosage_form {
        "tablet" => "قرص",
        "capsule" => "كبسولة",
        "syrup" => "شراب",
        "cream" => "كريم/مرهم",
        "drops" => "قطرة",
        "injection" => "حقنة",
        _ => "أخرى",
    };

    // اشتقاق التركيز من quantity
    let strength = if quantity.is_empty() {
        // حاول استخراج التركيز من الاسم
        let name_lower = name.to_lowercase();
        let patterns = ["500mg", "250mg", "200mg", "100mg", "50mg", "10mg", "5mg", "150mg", "300mg", "400mg", "600mg", "800mg", "1000mg", "20mg", "75mg", "125mg", "1g", "2g"];
        patterns.iter()
            .find(|p| name_lower.contains(*p))
            .map(|s| s.to_string())
            .unwrap_or_default()
    } else {
        quantity.to_string()
    };

    // اشتقاق الدولة الأولى فقط
    let country = countries.split(',').next().unwrap_or("").trim().to_string();

    Some(serde_json::json!({
        "name": name,
        "active_ingredient": active_ingredient,
        "brand_name": brands.split(',').next().unwrap_or("").trim(),
        "dosage_form": dosage_form,
        "dosage_form_ar": dosage_form_ar,
        "strength": strength,
        "manufacturer": manufacturer.split(',').next().unwrap_or("").trim(),
        "country": country,
    }))
}

async fn validate_pairing_token(token: &str, pool: &PgPool) -> bool {
    let result: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM mobile_pairing_sessions WHERE pairing_token = $1 AND expires_at > NOW())"
    )
    .bind(token).fetch_optional(pool).await.unwrap_or(None);
    result.unwrap_or(false)
}
