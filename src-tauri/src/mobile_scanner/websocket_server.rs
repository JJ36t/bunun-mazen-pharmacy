// WebSocket + HTTP Server for Mobile Scanner
use tauri::Emitter;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};
use sqlx::{PgPool, Row};
use crate::mobile_scanner::barcode_parser;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tokio::io::AsyncWriteExt;

pub async fn run_server(port: usize, pool: PgPool, app_handle: tauri::AppHandle) -> Result<(), String> {
    let http_addr = format!("0.0.0.0:{}", port);
    let http_listener = TcpListener::bind(&http_addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] HTTP server listening on http://0.0.0.0:{}", port);

    let ws_port = port + 1;
    let ws_addr = format!("0.0.0.0:{}", ws_port);
    let ws_listener = TcpListener::bind(&ws_addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] WebSocket server listening on ws://0.0.0.0:{}", ws_port);

    // HTTP server
    tokio::spawn(async move {
        loop {
            if let Ok((stream, _)) = http_listener.accept().await {
                tokio::spawn(async move {
                    let _ = handle_http_request(stream).await;
                });
            }
        }
    });

    // WebSocket server
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        loop {
            if let Ok((stream, addr)) = ws_listener.accept().await {
                let p = pool_clone.clone();
                let h = app_handle.clone();
                tokio::spawn(async move {
                    let _ = handle_ws_connection(stream, addr, p, h).await;
                });
            }
        }
    });

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}

async fn handle_http_request(mut stream: tokio::net::TcpStream) -> Result<(), String> {
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

async fn handle_ws_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    pool: PgPool,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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
/// API: https://world.openfoodfacts.org/api/v0/product/{barcode}.json
async fn lookup_openfoodfacts_api(barcode: &str) -> Option<serde_json::Value> {
    let url = format!("https://world.openfoodfacts.org/api/v0/product/{}.json", barcode);

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
