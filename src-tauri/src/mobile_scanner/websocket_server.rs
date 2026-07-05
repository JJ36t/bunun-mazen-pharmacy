// WebSocket Server for Mobile Scanner
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};
use sqlx::PgPool;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub async fn run_server(port: usize, pool: PgPool) -> Result<(), String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] WebSocket server listening on ws://0.0.0.0:{}", port);

    // ابدأ HTTP server للموبايل في نفس الوقت
    let http_pool = pool.clone();
    tokio::spawn(async move {
        let _ = run_http_server(port, http_pool).await;
    });

    while let Ok((stream, addr)) = listener.accept().await {
        let pool_clone = pool.clone();
        tokio::spawn(async move {
            let _ = handle_ws_connection(stream, addr, pool_clone).await;
        });
    }
    Ok(())
}

async fn handle_ws_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    pool: PgPool,
) -> Result<(), String> {
    let mut ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;

    println!("[MobileScanner] Device connected: {}", addr);

    // أرسل رسالة ترحيب
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

                            // فحص الباركود
                            let result = process_scan(barcode, &pool, device_name, &addr.to_string()).await;

                            let response = serde_json::json!({
                                "type": "scan_result",
                                "barcode": barcode,
                                "result": result,
                            });
                            ws_stream.send(Message::Text(response.to_string())).await.map_err(|e| e.to_string())?;
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

    // 1. ابحث في medicine_barcodes
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

            // سجل المسح
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
            // 2. ابحث في global_medicines
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

async fn validate_pairing_token(token: &str, pool: &PgPool) -> bool {
    let result: Option<bool> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM mobile_pairing_sessions WHERE pairing_token = $1 AND expires_at > NOW())"
    )
    .bind(token).fetch_optional(pool).await.unwrap_or(None);
    result.unwrap_or(false)
}

async fn run_http_server(port: usize, _pool: PgPool) -> Result<(), String> {
    // HTTP server بسيط لخدمة صفحة الموبايل
    // سيتم خدمة صفحة HTML ثابتة تحتوي على كود المسح
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
    println!("[MobileScanner] HTTP server listening on http://0.0.0.0:{}", port);

    while let Ok((stream, _addr)) = listener.accept().await {
        tokio::spawn(async move {
            let _ = handle_http_request(stream).await;
        });
    }
    Ok(())
}

async fn handle_http_request(stream: tokio::net::TcpStream) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut buf = [0u8; 4096];
    let mut stream = stream;
    let _ = stream.read(&mut buf).await;
    let request = String::from_utf8_lossy(&buf);

    // خدمة صفحة الموبايل
    let html = include_str!("../../mobile_scanner_page.html");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
        html.len(), html
    );

    stream.write_all(response.as_bytes()).await.map_err(|e| e.to_string())?;
    Ok(())
}
