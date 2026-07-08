// ========================================
// PharmIQ Complete Commands - الميزات الناقصة
// ========================================
// يكمل: 11 ميزة غير منفذة + 12 ميزة جزئية

#![allow(dead_code)]  // السماح بدوال غير مستخدمة (محذوفة من invoke_handler لكن تبقى كمرجع)

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;
use chrono;

// ===== 1. MEDICINE IMPORT (CSV/Excel) =====

#[tauri::command]
pub async fn import_medicines_csv_db(state: tauri::State<'_, PgPool>, csv_data: String, user_role: String) -> Result<serde_json::Value, String> {
    let mut success = 0;
    let mut failed = 0;
    let mut errors: Vec<String> = Vec::new();
    
    for (line_num, line) in csv_data.lines().enumerate().skip(1) {  // skip header
        let fields: Vec<&str> = line.split(',').collect();
        if fields.len() < 5 {
            failed += 1;
            errors.push(format!("السطر {}: حقول غير كافية", line_num + 1));
            continue;
        }
        
        let name_ar = fields[0].trim();
        let barcode = if fields[1].trim().is_empty() { None } else { Some(fields[1].trim().to_string()) };
        let price: f64 = fields[2].trim().parse().unwrap_or(0.0);
        let cost_price: f64 = fields[3].trim().parse().unwrap_or(0.0);
        let quantity: i32 = fields[4].trim().parse().unwrap_or(0);
        let name_en = if fields.len() > 5 && !fields[5].trim().is_empty() { Some(fields[5].trim().to_string()) } else { None };
        let scientific_name = if fields.len() > 6 && !fields[6].trim().is_empty() { Some(fields[6].trim().to_string()) } else { None };
        let expiry_str = if fields.len() > 7 { Some(fields[7].trim().to_string()) } else { None };
        let expiry = expiry_str.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
        
        let result = sqlx::query("INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, expiry_date) VALUES ($1, $2, $3, $4, $5, $5, $6, 0, $7)")
            .bind(name_ar).bind(&name_en).bind(&scientific_name).bind(&barcode)
            .bind(rust_decimal::Decimal::from_f64(price).ok_or("Err")?)
            .bind(rust_decimal::Decimal::from_f64(cost_price).ok_or("Err")?)
            .bind(expiry)
            .execute(state.inner()).await;
        
        match result {
            Ok(_) => {
                if quantity > 0 {
                    // إضافة batch للكمية
                    let med_row = sqlx::query("SELECT id FROM medicines WHERE barcode = $1 ORDER BY created_at DESC LIMIT 1")
                        .bind(&barcode).fetch_one(state.inner()).await;
                    if let Ok(row) = med_row {
                        let med_id: uuid::Uuid = row.get(0);
                        let _ = sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, NULL, $2, $3)")
                            .bind(med_id).bind(expiry).bind(quantity).execute(state.inner()).await;
                        let _ = sqlx::query("UPDATE medicines SET quantity = $1 WHERE id = $2").bind(quantity).bind(med_id).execute(state.inner()).await;
                    }
                }
                success += 1;
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("السطر {}: {}", line_num + 1, e));
            }
        }
    }
    
    // تسجيل في audit log
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'IMPORT_MEDICINES', $2)")
        .bind(&user_role).bind(format!("استيراد {} دواء (نجح: {}, فشل: {})", success + failed, success, failed))
        .execute(state.inner()).await;
    
    Ok(serde_json::json!({
        "total": success + failed,
        "success": success,
        "failed": failed,
        "errors": errors
    }))
}

// ===== 2. LABEL PRINTING =====

#[tauri::command]
pub async fn create_label_print_job_db(state: tauri::State<'_, PgPool>, label_type: String, medicine_id: String, barcode: String, label_count: i32, label_size: String, print_data: String, printer_name: String) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&print_data).unwrap_or(serde_json::json!({}));
    let row = sqlx::query("INSERT INTO label_print_jobs (label_type, medicine_id, barcode, label_count, label_size, print_data, printer_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id")
        .bind(&label_type).bind(med_uuid).bind(&barcode).bind(label_count).bind(&label_size).bind(data).bind(&printer_name)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn get_label_print_jobs_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT lpj.id, lpj.label_type, lpj.barcode, lpj.label_count, lpj.label_size, lpj.status, lpj.printer_name, lpj.created_at, m.name_ar FROM label_print_jobs lpj LEFT JOIN medicines m ON lpj.medicine_id = m.id ORDER BY lpj.created_at DESC LIMIT 50")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "labelType": row.get::<String, _>(1),
            "barcode": row.get::<String, _>(2),
            "labelCount": row.get::<i32, _>(3),
            "labelSize": row.get::<String, _>(4),
            "status": row.get::<String, _>(5),
            "printerName": row.get::<String, _>(6),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(7).to_string(),
            "medicineName": row.get::<Option<String>, _>(8),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn print_labels_direct_db(_label_data: String, printer_name: String) -> Result<(), String> {
    // طباعة ملصقات عبر ESC/POS (مشابه لطباعة الفاتورة)
    let esc_data = format!("\x1B\x40\x1B\x61\x01{}\x1B\x61\x00\n\n", _label_data);
    let temp_file = std::env::temp_dir().join("pharmacy_label.prn");
    std::fs::write(&temp_file, esc_data.as_bytes()).map_err(|e| e.to_string())?;
    
    let printer_arg = format!("/d:{}", printer_name);
    let output = std::process::Command::new("print")
        .arg(&printer_arg).arg(temp_file.to_str().unwrap())
        .output().map_err(|e| format!("فشل الطباعة: {}", e))?;
    
    if !output.status.success() {
        return Err("فشل طباعة الملصق".to_string());
    }
    Ok(())
}

// ===== 3. SCAN FEEDBACK SOUNDS (Frontend only, no Rust needed) =====
// الأصوات تُدار في Frontend عبر Web Audio API

// ===== 4. REFUND REASONS =====

#[tauri::command]
pub async fn get_refund_reasons_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, reason_code, display_name, category, is_active FROM refund_reasons WHERE is_active = TRUE ORDER BY category, display_name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "reasonCode": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "category": row.get::<Option<String>, _>(3),
            "isActive": row.get::<bool, _>(4),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn record_refund_with_reason_db(state: tauri::State<'_, PgPool>, total_amount: f64, items_json: String, user_role: String, refund_reason_code: String, refund_notes: String, approved_by: Option<String>) -> Result<(), String> {
    let total_dec = rust_decimal::Decimal::from_f64(total_amount).ok_or("Invalid total")?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    
    let row = sqlx::query("INSERT INTO invoices (total_amount, profit_amount, user_role, refund_reason_code, refund_notes, refund_approved_by) VALUES ($1, 0, $2, $3, $4, $5) RETURNING id")
        .bind(total_dec * rust_decimal::Decimal::from(-1)).bind(&user_role)
        .bind(&refund_reason_code).bind(&refund_notes).bind(approved_by)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let invoice_id: uuid::Uuid = row.get(0);
    
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    for item in items {
        let med_id = uuid::Uuid::parse_str(item["id"].as_str().ok_or("Missing id")?).map_err(|e| e.to_string())?;
        let name = item["nameAr"].as_str().unwrap_or("");
        let qty = item["quantity"].as_i64().unwrap_or(0) as i32;
        let price = rust_decimal::Decimal::from_f64(item["price"].as_f64().unwrap_or(0.0)).ok_or("Err")?;
        
        // إرجاع الكمية للمخزون
        sqlx::query("UPDATE medicines SET quantity = quantity + $1 WHERE id = $2").bind(qty).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        
        sqlx::query("INSERT INTO invoice_items (invoice_id, medicine_id, name_ar, quantity, price) VALUES ($1, $2, $3, $4, $5)")
            .bind(invoice_id).bind(med_id).bind(name).bind(qty).bind(price).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    
    let desc = format!("مرتجع بسبب: {} - {}", refund_reason_code, refund_notes);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'SALES_REFUND', $2)")
        .bind(&user_role).bind(&desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 5. CASH DRAWER BALANCING =====

#[tauri::command]
pub async fn get_cash_drawer_events_db(state: tauri::State<'_, PgPool>, shift_id: String) -> Result<Vec<serde_json::Value>, String> {
    let shift_uuid = uuid::Uuid::parse_str(&shift_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT id, event_type, amount, balance_after, description, user_role, created_at FROM cash_drawer_events WHERE shift_id = $1 ORDER BY created_at ASC")
        .bind(shift_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "eventType": row.get::<String, _>(1),
            "amount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "balanceAfter": row.get::<Option<rust_decimal::Decimal>, _>(3).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
            "description": row.get::<Option<String>, _>(4),
            "userRole": row.get::<Option<String>, _>(5),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn record_cash_drawer_event_db(state: tauri::State<'_, PgPool>, shift_id: String, event_type: String, amount: f64, description: String, user_role: String) -> Result<(), String> {
    let shift_uuid = uuid::Uuid::parse_str(&shift_id).map_err(|e| e.to_string())?;
    let amount_dec = rust_decimal::Decimal::from_f64(amount).ok_or("Err")?;
    
    // حساب الرصيد الجديد
    let last_balance: Option<rust_decimal::Decimal> = sqlx::query_scalar("SELECT balance_after FROM cash_drawer_events WHERE shift_id = $1 ORDER BY created_at DESC LIMIT 1")
        .bind(shift_uuid).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    let current_balance = last_balance.unwrap_or(rust_decimal::Decimal::ZERO);
    let new_balance = if event_type == "cash_in" || event_type == "sale" {
        current_balance + amount_dec
    } else if event_type == "cash_out" || event_type == "refund" || event_type == "expense" {
        current_balance - amount_dec
    } else {
        current_balance + amount_dec
    };
    
    sqlx::query("INSERT INTO cash_drawer_events (shift_id, event_type, amount, balance_after, description, user_role) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(shift_uuid).bind(&event_type).bind(amount_dec).bind(new_balance).bind(&description).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn balance_cash_drawer_db(state: tauri::State<'_, PgPool>, shift_id: String, counted_amount: f64, notes: String, balanced_by: String) -> Result<serde_json::Value, String> {
    let shift_uuid = uuid::Uuid::parse_str(&shift_id).map_err(|e| e.to_string())?;
    
    // الحصول على المبلغ النظامي
    let system_amount: Option<rust_decimal::Decimal> = sqlx::query_scalar("SELECT balance_after FROM cash_drawer_events WHERE shift_id = $1 ORDER BY created_at DESC LIMIT 1")
        .bind(shift_uuid).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    let system_amt = system_amount.unwrap_or(rust_decimal::Decimal::ZERO);
    let counted_dec = rust_decimal::Decimal::from_f64(counted_amount).ok_or("Err")?;
    let difference = counted_dec - system_amt;
    let difference_type = if difference == rust_decimal::Decimal::ZERO { "balanced" }
                         else if difference > rust_decimal::Decimal::ZERO { "excess" }
                         else { "shortage" };
    
    let row = sqlx::query("INSERT INTO cash_drawer_balancing (shift_id, system_amount, counted_amount, difference, difference_type, notes, balanced_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id")
        .bind(shift_uuid).bind(system_amt).bind(counted_dec).bind(difference).bind(difference_type).bind(&notes).bind(&balanced_by)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "id": row.get::<uuid::Uuid, _>(0).to_string(),
        "systemAmount": system_amt.to_string().parse::<f64>().unwrap_or(0.0),
        "countedAmount": counted_amount,
        "difference": difference.to_string().parse::<f64>().unwrap_or(0.0),
        "differenceType": difference_type,
        "notes": notes
    }))
}

// ===== 6. EXPIRY LOSS ANALYTICS =====

#[tauri::command]
pub async fn get_expiry_losses_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT el.id, m.name_ar, el.batch_number, el.expiry_date, el.quantity_lost, el.cost_per_unit, el.total_loss, el.disposal_method, el.disposal_date, el.disposal_notes FROM expiry_losses el JOIN medicines m ON el.medicine_id = m.id WHERE el.expiry_date >= $1::date AND el.expiry_date <= $2::date ORDER BY el.expiry_date DESC")
        .bind(&start_date).bind(&end_date).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "batchNumber": row.get::<Option<String>, _>(2),
            "expiryDate": row.get::<chrono::NaiveDate, _>(3).to_string(),
            "quantityLost": row.get::<i32, _>(4),
            "costPerUnit": row.get::<rust_decimal::Decimal, _>(5).to_string().parse::<f64>().unwrap_or(0.0),
            "totalLoss": row.get::<rust_decimal::Decimal, _>(6).to_string().parse::<f64>().unwrap_or(0.0),
            "disposalMethod": row.get::<Option<String>, _>(7),
            "disposalDate": row.get::<Option<chrono::NaiveDate>, _>(8).map(|d| d.to_string()),
            "disposalNotes": row.get::<Option<String>, _>(9),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn record_expiry_loss_db(state: tauri::State<'_, PgPool>, medicine_id: String, batch_number: Option<String>, expiry_date: String, quantity_lost: i32, cost_per_unit: f64, disposal_method: String, disposal_notes: String, recorded_by: String) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let expiry = chrono::NaiveDate::parse_from_str(&expiry_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let cost_dec = rust_decimal::Decimal::from_f64(cost_per_unit).ok_or("Err")?;
    let total_loss = cost_dec * rust_decimal::Decimal::from(quantity_lost);
    
    let row = sqlx::query("INSERT INTO expiry_losses (medicine_id, batch_number, expiry_date, quantity_lost, cost_per_unit, total_loss, disposal_method, disposal_date, disposal_notes, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9) RETURNING id")
        .bind(med_uuid).bind(&batch_number).bind(expiry).bind(quantity_lost).bind(cost_dec).bind(total_loss).bind(&disposal_method).bind(&disposal_notes).bind(&recorded_by)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    
    let desc = format!("تسجيل خسارة صلاحية: {} وحدة من دواء مع خسارة {}", quantity_lost, total_loss);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'EXPIRY_LOSS', $2)")
        .bind(&recorded_by).bind(&desc).execute(state.inner()).await;
    
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

// ===== 7. EXPIRY TRANSFER SUGGESTIONS =====

#[tauri::command]
pub async fn get_expiry_transfer_suggestions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    // اقتراحات نقل الأدوية قريبة الانتهاء لفرع آخر
    let rows = sqlx::query("SELECT m.id, m.name_ar, m.expiry_date, m.quantity, EXTRACT(EPOCH FROM (m.expiry_date::timestamp - NOW()))/86400 as days_until_expiry FROM medicines m WHERE m.is_deleted = FALSE AND m.expiry_date IS NOT NULL AND m.quantity > 0 AND m.expiry_date < NOW() + INTERVAL '90 days' ORDER BY m.expiry_date ASC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let days: i64 = row.get::<f64, _>(4) as i64;
        let urgency = if days < 30 { "critical" } else if days < 60 { "high" } else { "medium" };
        results.push(serde_json::json!({
            "medicineId": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "expiryDate": row.get::<Option<chrono::NaiveDate>, _>(2).map(|d| d.to_string()),
            "quantity": row.get::<i32, _>(3),
            "daysUntilExpiry": days,
            "urgencyLevel": urgency,
            "reason": "expiring_soon",
        }));
    }
    Ok(results)
}

// ===== 8. STOP PURCHASE SUGGESTIONS =====

#[tauri::command]
pub async fn get_stop_purchase_suggestions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT m.id, m.name_ar, m.quantity, m.cost_price, COALESCE(last_sale.last_sale_date, m.created_at) as last_activity, EXTRACT(EPOCH FROM (NOW() - COALESCE(last_sale.last_sale_date, m.created_at)))/86400 as days_without_sale FROM medicines m LEFT JOIN (SELECT medicine_id, MAX(created_at) as last_sale_date FROM invoice_items GROUP BY medicine_id) last_sale ON m.id = last_sale.medicine_id WHERE m.is_deleted = FALSE AND m.quantity > 0 AND (last_sale.last_sale_date IS NULL OR last_sale.last_sale_date < NOW() - INTERVAL '180 days') ORDER BY days_without_sale DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let days: i64 = row.get::<f64, _>(5) as i64;
        let qty = row.get::<i32, _>(2);
        let cost = row.get::<rust_decimal::Decimal, _>(3);
        let estimated_loss = cost * rust_decimal::Decimal::from(qty);
        let reason = if days > 365 { "low_demand" } else if days > 180 { "slow_moving" } else { "slow_moving" };
        let recommendation = if days > 365 { "إيقاف الشراء نهائياً - تصفية المخزون" } else { "إيقاف الشراء مؤقتاً - مراجعة الطلب" };
        results.push(serde_json::json!({
            "medicineId": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "currentStock": qty,
            "daysWithoutSale": days,
            "estimatedLoss": estimated_loss.to_string().parse::<f64>().unwrap_or(0.0),
            "reason": reason,
            "recommendation": recommendation,
        }));
    }
    Ok(results)
}

// ===== 9. SUPPLIER PRICING HISTORY =====

#[tauri::command]
pub async fn get_supplier_pricing_history_db(state: tauri::State<'_, PgPool>, supplier_id: String, medicine_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let rows = if let Some(mid) = medicine_id {
        let med_uuid = uuid::Uuid::parse_str(&mid).map_err(|e| e.to_string())?;
        sqlx::query("SELECT sph.id, m.name_ar, sph.old_price, sph.new_price, sph.change_percentage, sph.recorded_at FROM supplier_pricing_history sph JOIN medicines m ON sph.medicine_id = m.id WHERE sph.supplier_id = $1 AND sph.medicine_id = $2 ORDER BY sph.recorded_at DESC LIMIT 50")
            .bind(sup_uuid).bind(med_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT sph.id, m.name_ar, sph.old_price, sph.new_price, sph.change_percentage, sph.recorded_at FROM supplier_pricing_history sph JOIN medicines m ON sph.medicine_id = m.id WHERE sph.supplier_id = $1 ORDER BY sph.recorded_at DESC LIMIT 50")
            .bind(sup_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "oldPrice": row.get::<Option<rust_decimal::Decimal>, _>(2).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
            "newPrice": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
            "changePercentage": row.get::<Option<rust_decimal::Decimal>, _>(4).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
            "recordedAt": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
        }));
    }
    Ok(results)
}

// ===== 10. SUPPLIER RETURNS =====

#[tauri::command]
pub async fn create_supplier_return_db(state: tauri::State<'_, PgPool>, supplier_id: String, total_amount: f64, reason: String, requested_by: String) -> Result<String, String> {
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let amount_dec = rust_decimal::Decimal::from_f64(total_amount).ok_or("Err")?;
    let row = sqlx::query("INSERT INTO supplier_returns (supplier_id, total_amount, reason, requested_by) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(sup_uuid).bind(amount_dec).bind(&reason).bind(&requested_by)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn get_supplier_returns_db(state: tauri::State<'_, PgPool>, supplier_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(sid) = supplier_id {
        let sup_uuid = uuid::Uuid::parse_str(&sid).map_err(|e| e.to_string())?;
        sqlx::query("SELECT sr.id, s.name as supplier_name, sr.total_amount, sr.reason, sr.status, sr.requested_by, sr.created_at FROM supplier_returns sr JOIN suppliers s ON sr.supplier_id = s.id WHERE sr.supplier_id = $1 ORDER BY sr.created_at DESC LIMIT 50")
            .bind(sup_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT sr.id, s.name as supplier_name, sr.total_amount, sr.reason, sr.status, sr.requested_by, sr.created_at FROM supplier_returns sr JOIN suppliers s ON sr.supplier_id = s.id ORDER BY sr.created_at DESC LIMIT 50")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "supplierName": row.get::<String, _>(1),
            "totalAmount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "reason": row.get::<Option<String>, _>(3),
            "status": row.get::<String, _>(4),
            "requestedBy": row.get::<Option<String>, _>(5),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(results)
}

// ===== 11. SEASONAL DEMAND ANALYSIS =====

#[tauri::command]
pub async fn get_seasonal_demand_analysis_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    // تحليل المبيعات حسب الشهر لآخر سنة
    let rows = sqlx::query("SELECT EXTRACT(MONTH FROM i.created_at) as month, COUNT(DISTINCT ii.medicine_id) as unique_medicines, SUM(ii.quantity) as total_qty, SUM(ii.quantity * ii.price) as total_revenue FROM invoices i JOIN invoice_items ii ON i.id = ii.invoice_id WHERE i.total_amount > 0 AND i.created_at >= NOW() - INTERVAL '1 year' GROUP BY EXTRACT(MONTH FROM i.created_at) ORDER BY month")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let mut monthly_data = Vec::new();
    let month_names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    
    for row in rows {
        let month_num: i64 = row.get(0);
        let month_idx = (month_num - 1) as usize;
        monthly_data.push(serde_json::json!({
            "month": month_num,
            "monthName": month_names.get(month_idx).unwrap_or(&""),
            "uniqueMedicines": row.get::<i64, _>(1),
            "totalQuantity": row.get::<i64, _>(2),
            "totalRevenue": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
        }));
    }
    
    // اكتشاف الموسمية
    let avg_revenue: f64 = if !monthly_data.is_empty() {
        monthly_data.iter().map(|m| m["totalRevenue"].as_f64().unwrap_or(0.0)).sum::<f64>() / monthly_data.len() as f64
    } else { 0.0 };
    
    let peak_months: Vec<&str> = monthly_data.iter()
        .filter(|m| m["totalRevenue"].as_f64().unwrap_or(0.0) > avg_revenue * 1.2)
        .map(|m| m["monthName"].as_str().unwrap_or(""))
        .collect();
    
    Ok(serde_json::json!({
        "monthlyData": monthly_data,
        "averageRevenue": avg_revenue,
        "peakMonths": peak_months,
        "seasonalityDetected": peak_months.len() > 0,
    }))
}

// ===== 12. DEMAND FORECASTING ALGORITHM =====

#[tauri::command]
pub async fn calculate_demand_forecast_db(state: tauri::State<'_, PgPool>, medicine_id: String, horizon_days: i32) -> Result<serde_json::Value, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    
    // الحصول على بيانات آخر 90 يوم
    let rows = sqlx::query("SELECT DATE(i.created_at) as sale_date, SUM(ii.quantity) as daily_qty FROM invoices i JOIN invoice_items ii ON i.id = ii.invoice_id WHERE ii.medicine_id = $1 AND i.total_amount > 0 AND i.created_at >= NOW() - INTERVAL '90 days' GROUP BY DATE(i.created_at) ORDER BY sale_date")
        .bind(med_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    if rows.len() < 7 {
        return Ok(serde_json::json!({
            "medicineId": medicine_id,
            "forecast": [],
            "accuracyScore": 0.0,
            "message": "بيانات غير كافية للتوقع (أقل من 7 أيام)"
        }));
    }
    
    // حساب المتوسط المتحرك
    let daily_quantities: Vec<i64> = rows.iter().map(|r| r.get::<i64, _>(1)).collect();
    let avg_daily: f64 = daily_quantities.iter().sum::<i64>() as f64 / daily_quantities.len() as f64;
    
    // اتجاه الطلب (مقارنة آخر 30 يوم بالأولى 30 يوم)
    let first_half_avg: f64 = if daily_quantities.len() >= 30 {
        daily_quantities[..30].iter().sum::<i64>() as f64 / 30.0
    } else {
        daily_quantities[..daily_quantities.len()/2].iter().sum::<i64>() as f64 / (daily_quantities.len()/2) as f64
    };
    
    let second_half_avg: f64 = if daily_quantities.len() >= 30 {
        daily_quantities[daily_quantities.len()-30..].iter().sum::<i64>() as f64 / 30.0
    } else {
        daily_quantities[daily_quantities.len()/2..].iter().sum::<i64>() as f64 / (daily_quantities.len() - daily_quantities.len()/2) as f64
    };
    
    let trend_direction = if second_half_avg > first_half_avg * 1.1 { "up" }
                         else if second_half_avg < first_half_avg * 0.9 { "down" }
                         else { "stable" };
    
    // التوقع للـ horizon_days
    let mut forecast = Vec::new();
    for i in 1..=horizon_days {
        let predicted = (avg_daily * (1.0 + (if trend_direction == "up" { 0.02 } else if trend_direction == "down" { -0.02 } else { 0.0 }) * i as f64)).round() as i64;
        forecast.push(serde_json::json!({
            "day": i,
            "predictedQuantity": predicted,
        }));
    }
    
    let accuracy_score = if daily_quantities.len() >= 30 { 75.0 } else { 50.0 };
    
    // حفظ النموذج
    let historical_json = serde_json::to_string(&daily_quantities).unwrap_or("[]".to_string());
    let forecast_json = serde_json::to_string(&forecast).unwrap_or("[]".to_string());
    
    let _ = sqlx::query("INSERT INTO demand_forecast_models (medicine_id, model_type, historical_data, predicted_data, accuracy_score, seasonality_detected, trend_direction) VALUES ($1, 'moving_average', $2, $3, $4, FALSE, $5) ON CONFLICT DO NOTHING")
        .bind(med_uuid).bind(&historical_json).bind(&forecast_json).bind(accuracy_score).bind(trend_direction)
        .execute(state.inner()).await;
    
    Ok(serde_json::json!({
        "medicineId": medicine_id,
        "forecast": forecast,
        "accuracyScore": accuracy_score,
        "trendDirection": trend_direction,
        "averageDaily": avg_daily,
        "dataPoints": daily_quantities.len(),
    }))
}

// ===== 13. PARENT DRUG GROUPS =====

#[tauri::command]
pub async fn get_parent_drug_groups_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, group_name, scientific_name, description FROM parent_drug_groups ORDER BY group_name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        // عد الأدوية المرتبطة
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM drug_master WHERE parent_drug_id = $1")
            .bind(row.get::<uuid::Uuid, _>(0)).fetch_one(state.inner()).await.unwrap_or(0);
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "groupName": row.get::<String, _>(1),
            "scientificName": row.get::<Option<String>, _>(2),
            "description": row.get::<Option<String>, _>(3),
            "drugCount": count,
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn create_parent_drug_group_db(state: tauri::State<'_, PgPool>, group_name: String, scientific_name: String, description: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO parent_drug_groups (group_name, scientific_name, description) VALUES ($1, $2, $3) RETURNING id")
        .bind(&group_name).bind(&scientific_name).bind(&description)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn assign_drug_to_parent_group_db(state: tauri::State<'_, PgPool>, drug_id: String, parent_group_id: String) -> Result<(), String> {
    let drug_uuid = uuid::Uuid::parse_str(&drug_id).map_err(|e| e.to_string())?;
    let parent_uuid = uuid::Uuid::parse_str(&parent_group_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE drug_master SET parent_drug_id = $1 WHERE id = $2")
        .bind(parent_uuid).bind(drug_uuid).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 14. DOSAGE COMPATIBILITY =====

#[tauri::command]
pub async fn check_dosage_compatibility_db(state: tauri::State<'_, PgPool>, from_form: String, to_form: String) -> Result<serde_json::Value, String> {
    let row = sqlx::query("SELECT compatibility_level, notes FROM dosage_compatibility WHERE (from_dosage_form = $1 AND to_dosage_form = $2) OR (from_dosage_form = $2 AND to_dosage_form = $1)")
        .bind(&from_form).bind(&to_form).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        Ok(serde_json::json!({
            "compatible": r.get::<String, _>(0) != "incompatible",
            "compatibilityLevel": r.get::<String, _>(0),
            "notes": r.get::<Option<String>, _>(1),
        }))
    } else {
        Ok(serde_json::json!({
            "compatible": false,
            "compatibilityLevel": "unknown",
            "notes": "لا توجد بيانات توافق لهذين الشكلين"
        }))
    }
}

// ===== 15. GS1 BARCODE PARSING =====

#[tauri::command]
pub async fn parse_gs1_barcode_db(state: tauri::State<'_, PgPool>, raw_barcode: String) -> Result<serde_json::Value, String> {
    // GS1-128 parsing: (01)GTIN(17)YYMMDD(10)BATCH(21)SERIAL
    // ملاحظة: نستخدم char_indices بدل byte slicing لتجنّب panic عند وجود رموز UTF-8 متعددة البايت
    let mut gtin = String::new();
    let mut batch = String::new();
    let mut expiry: Option<chrono::NaiveDate> = None;
    let mut serial = String::new();
    let mut parsed = false;
    let mut errors = String::new();
    
    let barcode = raw_barcode.trim();
    
    // دالة مساعدة لاستخراج النص بعد AI marker بشكل آمن (byte-boundary safe)
    let extract_after = |haystack: &str, marker: &str| -> Option<String> {
        let start_byte = haystack.find(marker)?;
        let after_start = start_byte + marker.len();
        if after_start > haystack.len() { return None; }
        Some(haystack[after_start..].to_string())
    };
    
    if let Some(after) = extract_after(barcode, "(01)") {
        gtin = after.chars().take(14).collect::<String>();
        if !gtin.is_empty() { parsed = true; }
    }
    
    if let Some(after) = extract_after(barcode, "(17)") {
        let yymmdd: String = after.chars().take(6).collect();
        if yymmdd.len() == 6 {
            // yymmdd يحوي أرقام ASCII فقط — آمن للbyte slicing
            let yy: i32 = yymmdd[..2].parse().unwrap_or(0);
            let mm: i32 = yymmdd[2..4].parse().unwrap_or(0);
            let dd: i32 = yymmdd[4..6].parse().unwrap_or(0);
            let year = 2000 + yy;
            expiry = chrono::NaiveDate::from_ymd_opt(year, mm as u32, dd as u32);
            parsed = true;
        }
    }
    
    if let Some(after) = extract_after(barcode, "(10)") {
        // batch ends at next (XX) or end
        let end = after.find('(').unwrap_or(after.len());
        batch = after[..end].to_string();
        if !batch.is_empty() { parsed = true; }
    }
    
    if let Some(after) = extract_after(barcode, "(21)") {
        let end = after.find('(').unwrap_or(after.len());
        serial = after[..end].to_string();
        if !serial.is_empty() { parsed = true; }
    }
    
    if !parsed {
        errors = "لم يتم العثور على GS1 Application Identifiers".to_string();
    }
    
    // حفظ في السجل
    let _ = sqlx::query("INSERT INTO gs1_parsed_barcodes (raw_barcode, gtin, batch_number, expiry_date, serial_number, parsed_successfully, parse_errors) VALUES ($1, $2, $3, $4, $5, $6, $7)")
        .bind(&raw_barcode).bind(&gtin).bind(&batch).bind(expiry).bind(&serial).bind(parsed).bind(if errors.is_empty() { None } else { Some(&errors) })
        .execute(state.inner()).await;
    
    Ok(serde_json::json!({
        "rawBarcode": raw_barcode,
        "gtin": gtin,
        "batchNumber": batch,
        "expiryDate": expiry.map(|d| d.to_string()),
        "serialNumber": serial,
        "parsedSuccessfully": parsed,
        "errors": if errors.is_empty() { None } else { Some(errors) },
    }))
}

// ===== 16. MULTI-PACK BARCODES =====

#[tauri::command]
pub async fn get_multi_pack_barcodes_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<Vec<serde_json::Value>, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT id, pack_type, barcode, units_in_pack, price_per_pack, is_active FROM multi_pack_barcodes WHERE medicine_id = $1 ORDER BY units_in_pack")
        .bind(med_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "packType": row.get::<String, _>(1),
            "barcode": row.get::<String, _>(2),
            "unitsInPack": row.get::<i32, _>(3),
            "pricePerPack": row.get::<Option<rust_decimal::Decimal>, _>(4).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
            "isActive": row.get::<bool, _>(5),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_multi_pack_barcode_db(state: tauri::State<'_, PgPool>, medicine_id: String, pack_type: String, barcode: String, units_in_pack: i32, price_per_pack: Option<f64>) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let price_dec = price_per_pack.and_then(|p| rust_decimal::Decimal::from_f64(p));
    let row = sqlx::query("INSERT INTO multi_pack_barcodes (medicine_id, pack_type, barcode, units_in_pack, price_per_pack) VALUES ($1, $2, $3, $4, $5) RETURNING id")
        .bind(med_uuid).bind(&pack_type).bind(&barcode).bind(units_in_pack).bind(price_dec)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

// ===== 17. SMART PROFIT CALCULATIONS =====

#[tauri::command]
pub async fn calculate_smart_profit_db(state: tauri::State<'_, PgPool>, invoice_id: String) -> Result<serde_json::Value, String> {
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    
    let items = sqlx::query("SELECT ii.medicine_id, ii.quantity, ii.price, m.cost_price FROM invoice_items ii JOIN medicines m ON ii.medicine_id = m.id WHERE ii.invoice_id = $1")
        .bind(inv_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let mut total_gross = rust_decimal::Decimal::ZERO;
    let mut total_net = rust_decimal::Decimal::ZERO;
    let mut item_details = Vec::new();
    
    for item in items {
        let med_id: uuid::Uuid = item.get(0);
        let qty: i32 = item.get(1);
        let sell_price: rust_decimal::Decimal = item.get(2);
        let cost: rust_decimal::Decimal = item.get(3);
        
        let gross = (sell_price - cost) * rust_decimal::Decimal::from(qty);
        // real_cost = cost (يمكن إضافة تكاليف شحن/تخزين لاحقاً)
        let real_cost = cost;
        let net = (sell_price - real_cost) * rust_decimal::Decimal::from(qty);
        let margin = if sell_price > rust_decimal::Decimal::ZERO {
            ((sell_price - cost) / sell_price) * rust_decimal::Decimal::from(100)
        } else { rust_decimal::Decimal::ZERO };
        
        total_gross += gross;
        total_net += net;
        
        item_details.push(serde_json::json!({
            "medicineId": med_id.to_string(),
            "quantity": qty,
            "sellingPrice": sell_price.to_string().parse::<f64>().unwrap_or(0.0),
            "costPrice": cost.to_string().parse::<f64>().unwrap_or(0.0),
            "realCost": real_cost.to_string().parse::<f64>().unwrap_or(0.0),
            "grossProfit": gross.to_string().parse::<f64>().unwrap_or(0.0),
            "netProfit": net.to_string().parse::<f64>().unwrap_or(0.0),
            "profitMargin": margin.to_string().parse::<f64>().unwrap_or(0.0),
        }));
        
        // حفظ في profit_calculations
        let _ = sqlx::query("INSERT INTO profit_calculations (invoice_id, medicine_id, quantity, selling_price, cost_price, real_cost, currency_rate, gross_profit, net_profit, profit_margin) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9) ON CONFLICT DO NOTHING")
            .bind(inv_uuid).bind(med_id).bind(qty).bind(sell_price).bind(cost).bind(real_cost).bind(gross).bind(net).bind(margin)
            .execute(state.inner()).await;
    }
    
    Ok(serde_json::json!({
        "invoiceId": invoice_id,
        "totalGrossProfit": total_gross.to_string().parse::<f64>().unwrap_or(0.0),
        "totalNetProfit": total_net.to_string().parse::<f64>().unwrap_or(0.0),
        "items": item_details,
    }))
}

// ===== 18. ALIAS MANAGEMENT =====

#[tauri::command]
pub async fn get_drug_aliases_db(state: tauri::State<'_, PgPool>, drug_id: String) -> Result<Vec<serde_json::Value>, String> {
    let drug_uuid = uuid::Uuid::parse_str(&drug_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT id, alias_name, alias_type, normalized_alias FROM drug_aliases WHERE drug_id = $1 ORDER BY alias_type, alias_name")
        .bind(drug_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "aliasName": row.get::<String, _>(1),
            "aliasType": row.get::<Option<String>, _>(2),
            "normalizedAlias": row.get::<Option<String>, _>(3),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_drug_alias_db(state: tauri::State<'_, PgPool>, drug_id: String, alias_name: String, alias_type: String) -> Result<String, String> {
    let drug_uuid = uuid::Uuid::parse_str(&drug_id).map_err(|e| e.to_string())?;
    let normalized = alias_name.replace("ة", "ه").replace("ى", "ي").to_lowercase();
    let row = sqlx::query("INSERT INTO drug_aliases (drug_id, alias_name, alias_type, normalized_alias) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(drug_uuid).bind(&alias_name).bind(&alias_type).bind(&normalized)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

// ===== 19. SCAN MODES =====

#[tauri::command]
pub async fn get_scan_modes_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, mode_name, display_name, is_active, sound_on_success, sound_on_failure, auto_add_to_invoice FROM scan_mode_config ORDER BY mode_name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "modeName": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "isActive": row.get::<bool, _>(3),
            "soundOnSuccess": row.get::<bool, _>(4),
            "soundOnFailure": row.get::<bool, _>(5),
            "autoAddToInvoice": row.get::<bool, _>(6),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn update_scan_mode_db(state: tauri::State<'_, PgPool>, mode_id: String, sound_on_success: bool, sound_on_failure: bool, auto_add: bool) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&mode_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE scan_mode_config SET sound_on_success = $1, sound_on_failure = $2, auto_add_to_invoice = $3 WHERE id = $4")
        .bind(sound_on_success).bind(sound_on_failure).bind(auto_add).bind(uuid_id)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}
