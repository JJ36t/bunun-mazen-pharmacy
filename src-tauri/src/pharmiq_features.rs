// ========================================
// Drug Interaction + Daily Checks + Printer Settings Commands
// ========================================

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;

// ============================================================
// ===== 1. DRUG INTERACTION ENGINE =====
// ============================================================

/// فحص تفاعلات الأدوية — يستقبل قائمة المواد الفعالة ويرجع التفاعلات
#[tauri::command]
pub async fn check_drug_interactions_db(state: tauri::State<'_, PgPool>, drug_names_json: String) -> Result<Vec<serde_json::Value>, String> {
    let drug_names: Vec<String> = serde_json::from_str(&drug_names_json).map_err(|e| e.to_string())?;
    if drug_names.len() < 2 {
        return Ok(vec![]);
    }

    let mut warnings = Vec::new();
    for i in 0..drug_names.len() {
        for j in (i + 1)..drug_names.len() {
            let d1 = drug_names[i].trim();
            let d2 = drug_names[j].trim();
            if d1.is_empty() || d2.is_empty() { continue; }

            // البحث بأي اتجاه (drug_a=A, drug_b=B) أو (drug_a=B, drug_b=A)
            let row = sqlx::query(
                "SELECT id, drug_a, drug_b, severity, description, recommendation
                 FROM drug_interactions
                 WHERE (LOWER(drug_a) = LOWER($1) AND LOWER(drug_b) = LOWER($2))
                    OR (LOWER(drug_a) = LOWER($2) AND LOWER(drug_b) = LOWER($1))
                 LIMIT 1"
            )
            .bind(d1).bind(d2)
            .fetch_optional(state.inner())
            .await
            .map_err(|e| e.to_string())?;

            if let Some(r) = row {
                warnings.push(serde_json::json!({
                    "interactionId": r.get::<uuid::Uuid, _>(0).to_string(),
                    "drugA": r.get::<String, _>(1),
                    "drugB": r.get::<String, _>(2),
                    "severity": r.get::<String, _>(3),
                    "description": r.get::<String, _>(4),
                    "recommendation": r.get::<Option<String>, _>(5).unwrap_or_default(),
                }));
            }
        }
    }

    // ترتيب حسب الخطورة (High → Medium → Low)
    let severity_order = |s: &str| match s {
        "High" => 0,
        "Medium" => 1,
        _ => 2,
    };
    warnings.sort_by_key(|w| {
        let sev = w.get("severity").and_then(|s| s.as_str()).unwrap_or("Low");
        severity_order(sev)
    });

    Ok(warnings)
}

/// تسجيل تجاوز تفاعل دوائي (مع سبب إلزامي)
#[tauri::command]
pub async fn log_interaction_override_db(
    state: tauri::State<'_, PgPool>,
    interaction_id: String,
    user_role: String,
    reason: String,
    invoice_id: Option<String>,
) -> Result<(), String> {
    if reason.trim().is_empty() {
        return Err("سبب التجاوز إلزامي".to_string());
    }
    let int_uuid = uuid::Uuid::parse_str(&interaction_id).map_err(|e| e.to_string())?;
    let inv_uuid = invoice_id.and_then(|s| uuid::Uuid::parse_str(&s).ok());

    sqlx::query(
        "INSERT INTO interaction_overrides (interaction_id, user_role, reason, invoice_id)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(int_uuid).bind(&user_role).bind(&reason).bind(inv_uuid)
    .execute(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    let desc = format!("تجاوز تفاعل دوائي: {}", reason);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'INTERACTION_OVERRIDE', $2)")
        .bind(&user_role).bind(&desc)
        .execute(state.inner()).await;

    Ok(())
}

/// الحصول على كل تفاعلات الأدوية (للإدارة)
#[tauri::command]
pub async fn get_all_drug_interactions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, drug_a, drug_b, severity, description, recommendation, created_at FROM drug_interactions ORDER BY CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, drug_a")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for r in rows {
        results.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "drugA": r.get::<String, _>(1),
            "drugB": r.get::<String, _>(2),
            "severity": r.get::<String, _>(3),
            "description": r.get::<String, _>(4),
            "recommendation": r.get::<Option<String>, _>(5).unwrap_or_default(),
            "createdAt": r.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(results)
}

// ============================================================
// ===== 2. DAILY CHECKS (فحص يومي عند بدء التطبيق) =====
// ============================================================

/// فحص شامل للمخزون: منتهي، قارب الانتهاء، منخفض
#[tauri::command]
pub async fn get_daily_inventory_checks_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    // اقرأ إعدادات التنبيهات
    let expiry_days: i64 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'expiry_warning_days'")
        .fetch_one(state.inner()).await.unwrap_or(30);
    let low_stock: i64 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'low_stock_threshold'")
        .fetch_one(state.inner()).await.unwrap_or(20);

    // منتهي الصلاحية
    let expired = sqlx::query("SELECT id, name_ar, barcode, expiry_date, quantity FROM medicines WHERE is_deleted = FALSE AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE ORDER BY expiry_date ASC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut expired_list = Vec::new();
    for r in expired {
        expired_list.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "nameAr": r.get::<String, _>(1),
            "barcode": r.get::<Option<String>, _>(2),
            "expiryDate": r.get::<Option<chrono::NaiveDate>, _>(3).map(|d| d.to_string()),
            "quantity": r.get::<i32, _>(4),
        }));
    }

    // قارب الانتهاء (خلال X يوم) — استعلام معلمات آمن
    let expiring_soon = sqlx::query(
        "SELECT id, name_ar, barcode, expiry_date, quantity, CAST((expiry_date - CURRENT_DATE) AS BIGINT) as days_left
         FROM medicines
         WHERE is_deleted = FALSE AND expiry_date IS NOT NULL
           AND expiry_date >= CURRENT_DATE
           AND expiry_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
         ORDER BY expiry_date ASC"
    )
    .bind(expiry_days.to_string())
    .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut expiring_list = Vec::new();
    for r in expiring_soon {
        expiring_list.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "nameAr": r.get::<String, _>(1),
            "barcode": r.get::<Option<String>, _>(2),
            "expiryDate": r.get::<Option<chrono::NaiveDate>, _>(3).map(|d| d.to_string()),
            "quantity": r.get::<i32, _>(4),
            "daysLeft": r.get::<i64, _>(5),
        }));
    }

    // مخزون منخفض — استعلام معلمات آمن
    let low_stock_rows = sqlx::query(
        "SELECT id, name_ar, barcode, quantity FROM medicines WHERE is_deleted = FALSE AND quantity <= $1 ORDER BY quantity ASC"
    )
    .bind(low_stock as i32)
    .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut low_stock_list = Vec::new();
    for r in low_stock_rows {
        low_stock_list.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "nameAr": r.get::<String, _>(1),
            "barcode": r.get::<Option<String>, _>(2),
            "quantity": r.get::<i32, _>(3),
            "threshold": low_stock,
        }));
    }

    Ok(serde_json::json!({
        "expired": expired_list,
        "expiringSoon": expiring_list,
        "lowStock": low_stock_list,
        "summary": {
            "expiredCount": expired_list.len(),
            "expiringSoonCount": expiring_list.len(),
            "lowStockCount": low_stock_list.len(),
            "totalAlerts": expired_list.len() + expiring_list.len() + low_stock_list.len(),
        }
    }))
}

// ============================================================
// ===== 3. PRINTER SETTINGS =====
// ============================================================

/// حفظ إعدادات الطابعة
#[tauri::command]
pub async fn save_printer_settings_db(
    state: tauri::State<'_, PgPool>,
    receipt_printer: Option<String>,
    labels_printer: Option<String>,
    a4_printer: Option<String>,
    receipt_size: Option<String>,
) -> Result<(), String> {
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    let updates = [
        ("printer_receipt", receipt_printer),
        ("printer_labels", labels_printer),
        ("printer_a4", a4_printer),
        ("receipt_size", receipt_size),
    ];

    for (key, value) in &updates {
        if let Some(v) = value {
            sqlx::query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()")
                .bind(key).bind(v)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// الحصول على إعدادات الطابعة
#[tauri::command]
pub async fn get_printer_settings_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    let rows = sqlx::query("SELECT key, value FROM settings WHERE key IN ('printer_receipt', 'printer_labels', 'printer_a4', 'receipt_size')")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;

    let mut settings = serde_json::json!({
        "receiptPrinter": "",
        "labelsPrinter": "",
        "a4Printer": "",
        "receiptSize": "80mm",
    });

    for r in rows {
        let key: String = r.get(0);
        let value: String = r.get(1);
        match key.as_str() {
            "printer_receipt" => settings["receiptPrinter"] = serde_json::Value::String(value),
            "printer_labels" => settings["labelsPrinter"] = serde_json::Value::String(value),
            "printer_a4" => settings["a4Printer"] = serde_json::Value::String(value),
            "receipt_size" => settings["receiptSize"] = serde_json::Value::String(value),
            _ => {}
        }
    }

    Ok(settings)
}

// ============================================================
// ===== 4. SUPPLIER ORDERS (طلبات الشراء) =====
// ============================================================

#[tauri::command]
pub async fn create_supplier_order_db(
    state: tauri::State<'_, PgPool>,
    supplier_id: String,
    items_json: String,
    expected_delivery: Option<String>,
    notes: Option<String>,
    created_by: String,
) -> Result<String, String> {
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    let expected = expected_delivery.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

    // توليد رقم الطلب
    let order_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM supplier_orders")
        .fetch_one(state.inner()).await.unwrap_or(0);
    let order_number = format!("PO-{:06}", order_count + 1);

    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "INSERT INTO supplier_orders (supplier_id, order_number, expected_delivery, notes, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id"
    )
    .bind(sup_uuid).bind(&order_number).bind(expected).bind(&notes).bind(&created_by)
    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let order_id: uuid::Uuid = row.get(0);

    let mut total: f64 = 0.0;
    for item in &items {
        let med_name = item["medicineName"].as_str().unwrap_or("");
        let med_id = item["medicineId"].as_str().and_then(|s| uuid::Uuid::parse_str(s).ok());
        let qty = item["quantity"].as_i64().unwrap_or(0) as i32;
        let unit_cost = item["unitCost"].as_f64().unwrap_or(0.0);
        let line_total = qty as f64 * unit_cost;
        total += line_total;

        sqlx::query(
            "INSERT INTO supplier_order_items (order_id, medicine_id, medicine_name, quantity, unit_cost, total_cost)
             VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(order_id).bind(med_id).bind(med_name).bind(qty)
        .bind(rust_decimal::Decimal::from_f64(unit_cost).ok_or("Invalid cost")?)
        .bind(rust_decimal::Decimal::from_f64(line_total).ok_or("Invalid total")?)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    sqlx::query("UPDATE supplier_orders SET total_amount = $1 WHERE id = $2")
        .bind(rust_decimal::Decimal::from_f64(total).ok_or("Invalid total")?)
        .bind(order_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let desc = format!("إنشاء طلب شراء {} بقيمة {} د.ع", order_number, total as i64);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'CREATE_PURCHASE_ORDER', $2)")
        .bind(&created_by).bind(&desc).execute(state.inner()).await;

    Ok(order_id.to_string())
}

#[tauri::command]
pub async fn get_supplier_orders_db(
    state: tauri::State<'_, PgPool>,
    status_filter: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(status) = &status_filter {
        sqlx::query(
            "SELECT so.id, so.order_number, s.name as supplier_name, so.status, so.total_amount,
                    so.expected_delivery, so.received_date, so.notes, so.created_by, so.created_at
             FROM supplier_orders so
             LEFT JOIN suppliers s ON so.supplier_id = s.id
             WHERE so.status = $1
             ORDER BY so.created_at DESC LIMIT 200"
        )
        .bind(status).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            "SELECT so.id, so.order_number, s.name as supplier_name, so.status, so.total_amount,
                    so.expected_delivery, so.received_date, so.notes, so.created_by, so.created_at
             FROM supplier_orders so
             LEFT JOIN suppliers s ON so.supplier_id = s.id
             ORDER BY so.created_at DESC LIMIT 200"
        )
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };

    let mut results = Vec::new();
    for r in rows {
        let expected: Option<chrono::NaiveDate> = r.get(5);
        let received: Option<chrono::NaiveDateTime> = r.get(6);
        let notes: Option<String> = r.get(7);
        let created_by: Option<String> = r.get(8);
        results.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "orderNumber": r.get::<String, _>(1),
            "supplierName": r.get::<Option<String>, _>(2).unwrap_or_default(),
            "status": r.get::<String, _>(3),
            "totalAmount": r.get::<rust_decimal::Decimal, _>(4).to_string().parse::<f64>().unwrap_or(0.0),
            "expectedDelivery": expected.map(|d| d.to_string()),
            "receivedDate": received.map(|d| d.to_string()),
            "notes": notes,
            "createdBy": created_by,
            "createdAt": r.get::<chrono::NaiveDateTime, _>(9).to_string(),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn update_supplier_order_status_db(
    state: tauri::State<'_, PgPool>,
    order_id: String,
    new_status: String,
    user_role: String,
) -> Result<(), String> {
    let order_uuid = uuid::Uuid::parse_str(&order_id).map_err(|e| e.to_string())?;

    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    // لو الحالة "received"، حدّث المخزون تلقائياً
    if new_status == "received" {
        let items = sqlx::query("SELECT medicine_id, medicine_name, received_quantity, quantity FROM supplier_order_items WHERE order_id = $1")
            .bind(order_uuid).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;

        for item in items {
            let med_id: Option<uuid::Uuid> = item.get(0);
            let med_name: Option<String> = item.get(1);
            let received: i32 = item.get::<Option<i32>, _>(2).unwrap_or_else(|| item.get(3));

            // لو عنده medicine_id، حدّث الكمية
            if let Some(mid) = med_id {
                sqlx::query("UPDATE medicines SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2")
                    .bind(received).bind(mid)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            } else if let Some(name) = med_name {
                // لو ما عنده ID، ابحث بالاسم
                let existing: Option<uuid::Uuid> = sqlx::query_scalar("SELECT id FROM medicines WHERE name_ar = $1 AND is_deleted = FALSE")
                    .bind(&name).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;
                if let Some(eid) = existing {
                    sqlx::query("UPDATE medicines SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2")
                        .bind(received).bind(eid)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                }
            }
        }

        sqlx::query("UPDATE supplier_orders SET status = $1, received_date = NOW() WHERE id = $2")
            .bind(&new_status).bind(order_uuid)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query("UPDATE supplier_orders SET status = $1 WHERE id = $2")
            .bind(&new_status).bind(order_uuid)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let desc = format!("تحديث حالة طلب شراء إلى: {}", new_status);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'UPDATE_ORDER_STATUS', $2)")
        .bind(&user_role).bind(&desc).execute(state.inner()).await;

    Ok(())
}

// ============================================================
// ===== 5. INVENTORY VALUE + LOW STOCK STATS =====
// ============================================================

#[tauri::command]
pub async fn get_inventory_value_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    // عتبة المخزون المنخفض من الإعدادات (default 20)
    let low_stock_threshold: i32 = sqlx::query_scalar("SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'low_stock_threshold'")
        .fetch_optional(state.inner()).await.unwrap_or(None).unwrap_or(20);
    let row = sqlx::query(
        "SELECT
            COUNT(*) as total_items,
            COALESCE(SUM(quantity * cost_price), 0) as total_cost_value,
            COALESCE(SUM(quantity * price), 0) as total_sell_value,
            COALESCE(SUM(quantity), 0) as total_units,
            COUNT(CASE WHEN quantity <= $1 THEN 1 END) as low_stock_count,
            COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN 1 END) as expired_count,
            COUNT(CASE WHEN expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 day' THEN 1 END) as expiring_soon_count
         FROM medicines WHERE is_deleted = FALSE"
    )
    .bind(low_stock_threshold)
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "totalItems": row.get::<i64, _>(0),
        "totalCostValue": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
        "totalSellValue": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
        "totalUnits": row.get::<i64, _>(3),
        "lowStockCount": row.get::<i64, _>(4),
        "expiredCount": row.get::<i64, _>(5),
        "expiringSoonCount": row.get::<i64, _>(6),
    }))
}
