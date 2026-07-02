// ========================================
// PharmIQ Intelligence Commands
// ========================================
// أوامر الـ Drug Master + Barcode + Pricing + Supplier + Demand + Notifications
// ملاحظة: هذا الملف يُدرج كـ mod في main.rs أو يُنسخ مباشرة

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;
use chrono;

// ===== 1. DRUG MASTER COMMANDS =====

#[tauri::command]
pub async fn get_drug_master_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, trade_name, scientific_name, arabic_name, normalized_arabic, active_ingredients, dosage_strength, dosage_form, manufacturer, country_of_origin, category, is_otc, is_prescription, is_controlled, storage_conditions, warning_flags, parent_drug_id FROM drug_master ORDER BY arabic_name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        // قراءة الأعمدة بالترتيب الصحيح:
        // 0=id, 1=trade_name, 2=scientific_name, 3=arabic_name, 4=normalized_arabic
        // 5=active_ingredients (TEXT[]), 6=dosage_strength, 7=dosage_form, 8=manufacturer
        // 9=country_of_origin, 10=category, 11=is_otc, 12=is_prescription, 13=is_controlled
        // 14=storage_conditions (JSONB), 15=warning_flags (TEXT[]), 16=parent_drug_id
        let active_ingredients: Option<Vec<String>> = row.try_get(5).unwrap_or(None);
        let storage: Option<serde_json::Value> = row.try_get(14).unwrap_or(None);
        let warnings: Option<Vec<String>> = row.try_get(15).unwrap_or(None);
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "tradeName": row.get::<String, _>(1),
            "scientificName": row.get::<Option<String>, _>(2),
            "arabicName": row.get::<String, _>(3),
            "normalizedArabic": row.get::<Option<String>, _>(4),
            "activeIngredients": active_ingredients,
            "dosageStrength": row.get::<Option<String>, _>(6),
            "dosageForm": row.get::<Option<String>, _>(7),
            "manufacturer": row.get::<Option<String>, _>(8),
            "countryOfOrigin": row.get::<Option<String>, _>(9),
            "category": row.get::<Option<String>, _>(10),
            "isOtc": row.get::<bool, _>(11),
            "isPrescription": row.get::<bool, _>(12),
            "isControlled": row.get::<bool, _>(13),
            "storageConditions": storage,
            "warningFlags": warnings,
            "parentDrugId": row.get::<Option<uuid::Uuid>, _>(16).map(|u| u.to_string()),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_drug_master_db(state: tauri::State<'_, PgPool>, drug_json: String) -> Result<String, String> {
    let drug: serde_json::Value = serde_json::from_str(&drug_json).map_err(|e| e.to_string())?;
    let row = sqlx::query("INSERT INTO drug_master (trade_name, scientific_name, arabic_name, normalized_arabic, active_ingredients, dosage_strength, dosage_form, manufacturer, country_of_origin, category, is_otc, is_prescription, is_controlled, storage_conditions, warning_flags, parent_drug_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id")
        .bind(drug["tradeName"].as_str().unwrap_or(""))
        .bind(drug["scientificName"].as_str())
        .bind(drug["arabicName"].as_str().unwrap_or(""))
        .bind(drug["normalizedArabic"].as_str())
        .bind(drug["activeIngredients"].as_array().map(|a| a.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect::<Vec<_>>()))
        .bind(drug["dosageStrength"].as_str())
        .bind(drug["dosageForm"].as_str())
        .bind(drug["manufacturer"].as_str())
        .bind(drug["countryOfOrigin"].as_str())
        .bind(drug["category"].as_str())
        .bind(drug["isOtc"].as_bool().unwrap_or(false))
        .bind(drug["isPrescription"].as_bool().unwrap_or(false))
        .bind(drug["isControlled"].as_bool().unwrap_or(false))
        .bind(drug.get("storageConditions").cloned().unwrap_or(serde_json::json!({})))
        .bind(drug["warningFlags"].as_array().map(|a| a.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect::<Vec<_>>()))
        .bind(drug["parentDrugId"].as_str().and_then(|s| uuid::Uuid::parse_str(s).ok()))
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn search_drug_master_db(state: tauri::State<'_, PgPool>, query: String) -> Result<Vec<serde_json::Value>, String> {
    let pattern = format!("%{}%", query.to_lowercase());
    let rows = sqlx::query("SELECT id, trade_name, scientific_name, arabic_name, dosage_strength, dosage_form, category, is_otc, is_prescription, is_controlled FROM drug_master WHERE LOWER(arabic_name) LIKE $1 OR LOWER(trade_name) LIKE $1 OR LOWER(scientific_name) LIKE $1 OR LOWER(COALESCE(normalized_arabic, '')) LIKE $1 LIMIT 50")
        .bind(&pattern)
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "tradeName": row.get::<String, _>(1),
            "scientificName": row.get::<Option<String>, _>(2),
            "arabicName": row.get::<String, _>(3),
            "dosageStrength": row.get::<Option<String>, _>(4),
            "dosageForm": row.get::<Option<String>, _>(5),
            "category": row.get::<Option<String>, _>(6),
            "isOtc": row.get::<bool, _>(7),
            "isPrescription": row.get::<bool, _>(8),
            "isControlled": row.get::<bool, _>(9),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_drug_substitutes_db(state: tauri::State<'_, PgPool>, drug_id: String) -> Result<Vec<serde_json::Value>, String> {
    let uuid_id = uuid::Uuid::parse_str(&drug_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT ds.substitute_id, dm.arabic_name, dm.trade_name, dm.dosage_strength, dm.dosage_form, ds.compatibility_score, ds.reason FROM drug_substitutes ds JOIN drug_master dm ON ds.substitute_id = dm.id WHERE ds.drug_id = $1 ORDER BY ds.compatibility_score DESC")
        .bind(uuid_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "substituteId": row.get::<uuid::Uuid, _>(0).to_string(),
            "arabicName": row.get::<String, _>(1),
            "tradeName": row.get::<Option<String>, _>(2).unwrap_or_default(),
            "dosageStrength": row.get::<Option<String>, _>(3),
            "dosageForm": row.get::<Option<String>, _>(4),
            "compatibilityScore": row.get::<i32, _>(5),
            "reason": row.get::<Option<String>, _>(6),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn check_drug_interactions_db(state: tauri::State<'_, PgPool>, drug_ids_json: String) -> Result<Vec<serde_json::Value>, String> {
    let drug_ids: Vec<String> = serde_json::from_str(&drug_ids_json).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    if drug_ids.len() < 2 { return Ok(results); }
    
    // تحويل لـ UUID
    let uuids: Vec<uuid::Uuid> = drug_ids.iter()
        .filter_map(|s| uuid::Uuid::parse_str(s).ok())
        .collect();
    
    if uuids.len() < 2 { return Ok(results); }
    
    // فحص التفاعلات بين كل زوج
    for i in 0..uuids.len() {
        for j in (i+1)..uuids.len() {
            let rows = sqlx::query("SELECT di.severity, di.interaction_type, di.description, di.clinical_effect, dm1.arabic_name as drug_a, dm2.arabic_name as drug_b FROM drug_interactions di JOIN drug_master dm1 ON di.drug_a_id = dm1.id JOIN drug_master dm2 ON di.drug_b_id = dm2.id WHERE (di.drug_a_id = $1 AND di.drug_b_id = $2) OR (di.drug_a_id = $2 AND di.drug_b_id = $1)")
                .bind(uuids[i]).bind(uuids[j])
                .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
            for row in rows {
                results.push(serde_json::json!({
                    "drugA": row.get::<String, _>(4),
                    "drugB": row.get::<String, _>(5),
                    "severity": row.get::<String, _>(0),
                    "interactionType": row.get::<String, _>(1),
                    "description": row.get::<String, _>(2),
                    "clinicalEffect": row.get::<Option<String>, _>(3),
                }));
            }
        }
    }
    Ok(results)
}

// ===== 2. BARCODE INTELLIGENCE COMMANDS =====

#[tauri::command]
pub async fn lookup_barcode_db(state: tauri::State<'_, PgPool>, barcode: String) -> Result<Option<serde_json::Value>, String> {
    let row = sqlx::query("SELECT mb.id, mb.medicine_id, mb.barcode_type, mb.barcode_scope, mb.batch_number, mb.expiry_date, m.name_ar, m.price, m.quantity FROM medicine_barcodes mb LEFT JOIN medicines m ON mb.medicine_id = m.id WHERE mb.barcode = $1 AND mb.is_active = TRUE")
        .bind(&barcode).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        Ok(Some(serde_json::json!({
            "barcodeId": r.get::<uuid::Uuid, _>(0).to_string(),
            "medicineId": r.get::<Option<uuid::Uuid>, _>(1).map(|u| u.to_string()),
            "barcodeType": r.get::<String, _>(2),
            "barcodeScope": r.get::<String, _>(3),
            "batchNumber": r.get::<Option<String>, _>(4),
            "expiryDate": r.get::<Option<chrono::NaiveDate>, _>(5).map(|d| d.to_string()),
            "medicineName": r.get::<Option<String>, _>(6),
            "price": r.get::<Option<rust_decimal::Decimal>, _>(7).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0),
            "quantity": r.get::<Option<i32>, _>(8).unwrap_or(0),
        })))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn bind_barcode_to_medicine_db(state: tauri::State<'_, PgPool>, barcode: String, medicine_id: String, barcode_type: String, barcode_scope: String, batch_number: Option<String>, expiry_date: Option<String>) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let expiry = expiry_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    let row = sqlx::query("INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, batch_number, expiry_date, learned_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id")
        .bind(med_uuid).bind(&barcode).bind(&barcode_type).bind(&barcode_scope).bind(&batch_number).bind(expiry)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn generate_internal_barcode_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    
    // توليد باركود داخلي بصيغة BNN-0000001
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM medicine_barcodes WHERE barcode_scope = 'internal'")
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let barcode = format!("BNN-{:07}", count + 1);
    
    sqlx::query("INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope) VALUES ($1, $2, 'CODE128', 'internal')")
        .bind(med_uuid).bind(&barcode)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    Ok(barcode)
}

#[tauri::command]
pub async fn log_barcode_scan_db(state: tauri::State<'_, PgPool>, barcode_scanned: String, scan_mode: String, scan_result: String, matched_medicine_id: Option<String>, scan_duration_ms: Option<i32>, user_role: String) -> Result<(), String> {
    let med_uuid = matched_medicine_id.and_then(|s| uuid::Uuid::parse_str(&s).ok());
    sqlx::query("INSERT INTO barcode_scan_logs (barcode_scanned, scan_mode, scan_result, matched_medicine_id, scan_duration_ms, user_role) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(&barcode_scanned).bind(&scan_mode).bind(&scan_result).bind(med_uuid).bind(scan_duration_ms).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_barcode_analytics_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    let total_scans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM barcode_scan_logs").fetch_one(state.inner()).await.unwrap_or(0);
    let successful_scans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM barcode_scan_logs WHERE scan_result = 'success'").fetch_one(state.inner()).await.unwrap_or(0);
    let unknown_scans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM barcode_scan_logs WHERE scan_result = 'unknown'").fetch_one(state.inner()).await.unwrap_or(0);
    let avg_scan_time: Option<f64> = sqlx::query_scalar("SELECT AVG(scan_duration_ms) FROM barcode_scan_logs WHERE scan_duration_ms IS NOT NULL").fetch_one(state.inner()).await.unwrap_or(None);
    
    // أكثر الأدوية مسحاً
    let top_rows = sqlx::query("SELECT m.name_ar, COUNT(*) as scan_count FROM barcode_scan_logs bs JOIN medicines m ON bs.matched_medicine_id = m.id GROUP BY m.name_ar ORDER BY scan_count DESC LIMIT 10")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut top_scanned = Vec::new();
    for row in top_rows {
        top_scanned.push(serde_json::json!({
            "name": row.get::<String, _>(0),
            "count": row.get::<i64, _>(1),
        }));
    }
    
    Ok(serde_json::json!({
        "totalScans": total_scans,
        "successfulScans": successful_scans,
        "unknownScans": unknown_scans,
        "successRate": if total_scans > 0 { (successful_scans as f64 / total_scans as f64) * 100.0 } else { 0.0 },
        "avgScanTimeMs": avg_scan_time,
        "topScannedMedicines": top_scanned,
    }))
}

// ===== 3. PRICING COMMANDS =====

#[tauri::command]
pub async fn get_pricing_tiers_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, discount_percentage, description, is_active FROM pricing_tiers WHERE is_active = TRUE ORDER BY discount_percentage")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "discountPercentage": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
            "description": row.get::<Option<String>, _>(4),
            "isActive": row.get::<bool, _>(5),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_medicine_pricing_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<Vec<serde_json::Value>, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT pt.name, pt.display_name, COALESCE(mp.price, m.price) as price FROM pricing_tiers pt LEFT JOIN medicine_pricing mp ON pt.id = mp.tier_id AND mp.medicine_id = $1, medicines m WHERE m.id = $1 AND pt.is_active = TRUE ORDER BY pt.discount_percentage")
        .bind(med_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "tierName": row.get::<String, _>(0),
            "tierDisplayName": row.get::<String, _>(1),
            "price": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
        }));
    }
    Ok(results)
}

// ===== 4. SUPPLIER INTELLIGENCE =====

#[tauri::command]
pub async fn get_supplier_intelligence_db(state: tauri::State<'_, PgPool>, supplier_id: String) -> Result<serde_json::Value, String> {
    let sup_uuid = uuid::Uuid::parse_str(&supplier_id).map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT name, reliability_score, total_orders, delayed_orders, returned_orders, average_delivery_days, last_order_date FROM suppliers WHERE id = $1")
        .bind(sup_uuid).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    
    let total_orders: i32 = row.get(2);
    let delayed_orders: i32 = row.get(3);
    let on_time_rate = if total_orders > 0 { ((total_orders - delayed_orders) as f64 / total_orders as f64) * 100.0 } else { 0.0 };
    
    Ok(serde_json::json!({
        "name": row.get::<String, _>(0),
        "reliabilityScore": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(50.0),
        "totalOrders": total_orders,
        "delayedOrders": delayed_orders,
        "returnedOrders": row.get::<i32, _>(4),
        "averageDeliveryDays": row.get::<Option<rust_decimal::Decimal>, _>(5).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
        "lastOrderDate": row.get::<Option<chrono::NaiveDateTime>, _>(6).map(|d| d.to_string()),
        "onTimeRate": on_time_rate,
    }))
}

// ===== 5. PURCHASE SUGGESTIONS =====

#[tauri::command]
pub async fn get_purchase_suggestions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    // اقتراحات بناءً على نقص المخزون
    let rows = sqlx::query("SELECT m.id, m.name_ar, m.quantity, m.cost_price, CASE WHEN m.quantity = 0 THEN 'critical' WHEN m.quantity < 50 THEN 'high' WHEN m.quantity < 100 THEN 'medium' ELSE 'low' END as priority, CASE WHEN m.quantity = 0 THEN 100 WHEN m.quantity < 50 THEN 50 WHEN m.quantity < 100 THEN 30 ELSE 10 END as suggested_qty FROM medicines m WHERE m.is_deleted = FALSE AND m.quantity < 150 ORDER BY priority DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "medicineId": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "currentQuantity": row.get::<i32, _>(2),
            "costPrice": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
            "priority": row.get::<String, _>(4),
            "suggestedQuantity": row.get::<i32, _>(5),
            "reason": "low_stock",
        }));
    }
    Ok(results)
}

// ===== 6. DEAD STOCK ANALYSIS =====

#[tauri::command]
pub async fn analyze_dead_stock_db(state: tauri::State<'_, PgPool>, days_threshold: i32) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT m.id, m.name_ar, m.quantity, m.cost_price, COALESCE(last_sale.last_sale_date, m.created_at) as last_activity, EXTRACT(EPOCH FROM (NOW() - COALESCE(last_sale.last_sale_date, m.created_at)))/86400 as days_without_sale FROM medicines m LEFT JOIN (SELECT medicine_id, MAX(created_at) as last_sale_date FROM invoice_items GROUP BY medicine_id) last_sale ON m.id = last_sale.medicine_id WHERE m.is_deleted = FALSE AND m.quantity > 0 AND (last_sale.last_sale_date IS NULL OR last_sale.last_sale_date < NOW() - ($1 || ' days')::interval) ORDER BY days_without_sale DESC")
        .bind(days_threshold)
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let qty = row.get::<i32, _>(2);
        let cost = row.get::<rust_decimal::Decimal, _>(3);
        let frozen_capital = cost * rust_decimal::Decimal::from(qty);
        let days = row.get::<f64, _>(5) as i32;
        let recommendation = if days > 365 { "clearance" } else if days > 180 { "return_to_supplier" } else { "discount" };
        results.push(serde_json::json!({
            "medicineId": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "quantity": qty,
            "costPrice": cost.to_string().parse::<f64>().unwrap_or(0.0),
            "lastActivity": row.get::<chrono::NaiveDateTime, _>(4).to_string(),
            "daysWithoutSale": days,
            "frozenCapital": frozen_capital.to_string().parse::<f64>().unwrap_or(0.0),
            "recommendation": recommendation,
        }));
    }
    Ok(results)
}

// ===== 7. EXPIRY RISK =====

#[tauri::command]
pub async fn get_expiry_risk_assessment_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT m.id, m.name_ar, m.expiry_date, m.quantity, m.cost_price, EXTRACT(EPOCH FROM (m.expiry_date::timestamp - NOW()))/86400 as days_until_expiry FROM medicines m WHERE m.is_deleted = FALSE AND m.expiry_date IS NOT NULL AND m.quantity > 0 ORDER BY m.expiry_date ASC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let days: i64 = row.get::<f64, _>(5) as i64;
        let risk_level = if days < 0 { "expired" } else if days < 30 { "critical" } else if days < 90 { "warning" } else { "safe" };
        let recommended_action = if days < 0 { "dispose" } else if days < 30 { "sell_fast" } else if days < 90 { "discount" } else { "normal" };
        let qty = row.get::<i32, _>(3);
        let cost = row.get::<rust_decimal::Decimal, _>(4);
        let loss = if days < 0 { cost * rust_decimal::Decimal::from(qty) } else { rust_decimal::Decimal::ZERO };
        results.push(serde_json::json!({
            "medicineId": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "expiryDate": row.get::<Option<chrono::NaiveDate>, _>(2).map(|d| d.to_string()),
            "quantity": qty,
            "daysUntilExpiry": days,
            "riskLevel": risk_level,
            "estimatedLoss": loss.to_string().parse::<f64>().unwrap_or(0.0),
            "recommendedAction": recommended_action,
        }));
    }
    Ok(results)
}

// ===== 8. HARDWARE DEVICES =====

#[tauri::command]
pub async fn get_hardware_devices_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, device_type, device_name, connection_type, port, is_active, is_default, config, last_connected FROM hardware_devices ORDER BY device_type, is_default DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "deviceType": row.get::<String, _>(1),
            "deviceName": row.get::<String, _>(2),
            "connectionType": row.get::<Option<String>, _>(3),
            "port": row.get::<Option<String>, _>(4),
            "isActive": row.get::<bool, _>(5),
            "isDefault": row.get::<bool, _>(6),
            "config": row.get::<Option<serde_json::Value>, _>(7),
            "lastConnected": row.get::<Option<chrono::NaiveDateTime>, _>(8).map(|d| d.to_string()),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_hardware_device_db(state: tauri::State<'_, PgPool>, device_type: String, device_name: String, connection_type: String, port: String, config: String) -> Result<String, String> {
    let config_val: serde_json::Value = serde_json::from_str(&config).unwrap_or(serde_json::json!({}));
    let row = sqlx::query("INSERT INTO hardware_devices (device_type, device_name, connection_type, port, config) VALUES ($1, $2, $3, $4, $5) RETURNING id")
        .bind(&device_type).bind(&device_name).bind(&connection_type).bind(&port).bind(config_val)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn set_default_hardware_device_db(state: tauri::State<'_, PgPool>, device_id: String, device_type: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&device_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE hardware_devices SET is_default = FALSE WHERE device_type = $1").bind(&device_type).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE hardware_devices SET is_default = TRUE WHERE id = $1").bind(uuid_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 9. MULTI-BRANCH =====

#[tauri::command]
pub async fn get_branches_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, address, phone, manager, is_active, is_main_branch FROM branches WHERE is_active = TRUE ORDER BY is_main_branch DESC, name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "address": row.get::<Option<String>, _>(2),
            "phone": row.get::<Option<String>, _>(3),
            "manager": row.get::<Option<String>, _>(4),
            "isActive": row.get::<bool, _>(5),
            "isMainBranch": row.get::<bool, _>(6),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_branch_db(state: tauri::State<'_, PgPool>, name: String, address: String, phone: String, manager: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO branches (name, address, phone, manager) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(&name).bind(&address).bind(&phone).bind(&manager)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

// ===== 10. TASK QUEUE =====

#[tauri::command]
pub async fn enqueue_task_db(state: tauri::State<'_, PgPool>, task_type: String, task_name: String, payload: String, priority: i32) -> Result<String, String> {
    let payload_val: serde_json::Value = serde_json::from_str(&payload).unwrap_or(serde_json::json!({}));
    let row = sqlx::query("INSERT INTO task_queue (task_type, task_name, payload, priority) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(&task_type).bind(&task_name).bind(payload_val).bind(priority)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn get_task_queue_db(state: tauri::State<'_, PgPool>, status_filter: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(status) = &status_filter {
        sqlx::query("SELECT id, task_type, task_name, status, priority, progress, error_message, created_at, started_at, completed_at FROM task_queue WHERE status = $1 ORDER BY priority ASC, created_at DESC LIMIT 50")
            .bind(status).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, task_type, task_name, status, priority, progress, error_message, created_at, started_at, completed_at FROM task_queue ORDER BY priority ASC, created_at DESC LIMIT 50")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "taskType": row.get::<String, _>(1),
            "taskName": row.get::<String, _>(2),
            "status": row.get::<String, _>(3),
            "priority": row.get::<i32, _>(4),
            "progress": row.get::<i32, _>(5),
            "errorMessage": row.get::<Option<String>, _>(6),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(7).to_string(),
            "startedAt": row.get::<Option<chrono::NaiveDateTime>, _>(8).map(|d| d.to_string()),
            "completedAt": row.get::<Option<chrono::NaiveDateTime>, _>(9).map(|d| d.to_string()),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn update_task_status_db(state: tauri::State<'_, PgPool>, task_id: String, status: String, progress: i32, error_message: Option<String>) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&task_id).map_err(|e| e.to_string())?;
    if status == "running" {
        sqlx::query("UPDATE task_queue SET status = $1, progress = $2, started_at = NOW() WHERE id = $3")
            .bind(&status).bind(progress).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    } else if status == "completed" || status == "failed" {
        sqlx::query("UPDATE task_queue SET status = $1, progress = $2, completed_at = NOW(), error_message = $3 WHERE id = $4")
            .bind(&status).bind(progress).bind(error_message).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query("UPDATE task_queue SET status = $1, progress = $2 WHERE id = $3")
            .bind(&status).bind(progress).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== 11. NOTIFICATIONS =====

#[tauri::command]
pub async fn get_notifications_db(state: tauri::State<'_, PgPool>, unread_only: bool) -> Result<Vec<serde_json::Value>, String> {
    let rows = if unread_only {
        sqlx::query("SELECT id, notification_type, title, message, severity, priority, category, is_read, action_data, target_user, created_at FROM notifications WHERE is_read = FALSE AND is_dismissed = FALSE ORDER BY priority ASC, created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, notification_type, title, message, severity, priority, category, is_read, action_data, target_user, created_at FROM notifications WHERE is_dismissed = FALSE ORDER BY priority ASC, created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "notificationType": row.get::<String, _>(1),
            "title": row.get::<String, _>(2),
            "message": row.get::<String, _>(3),
            "severity": row.get::<String, _>(4),
            "priority": row.get::<i32, _>(5),
            "category": row.get::<Option<String>, _>(6),
            "isRead": row.get::<bool, _>(7),
            "actionData": row.get::<Option<serde_json::Value>, _>(8),
            "targetUser": row.get::<Option<String>, _>(9),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(10).to_string(),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn create_notification_db(state: tauri::State<'_, PgPool>, notification_type: String, title: String, message: String, severity: String, priority: i32, category: String, action_data: Option<String>, target_user: Option<String>) -> Result<String, String> {
    let action_val: serde_json::Value = action_data.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}));
    let row = sqlx::query("INSERT INTO notifications (notification_type, title, message, severity, priority, category, action_data, target_user) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id")
        .bind(&notification_type).bind(&title).bind(&message).bind(&severity).bind(priority).bind(&category).bind(action_val).bind(target_user)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn mark_notification_read_db(state: tauri::State<'_, PgPool>, notification_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&notification_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn dismiss_notification_db(state: tauri::State<'_, PgPool>, notification_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&notification_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE notifications SET is_dismissed = TRUE WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 12. PAYMENT METHODS =====

#[tauri::command]
pub async fn get_payment_methods_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, icon, is_active, requires_reference, sort_order FROM payment_methods WHERE is_active = TRUE ORDER BY sort_order")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "icon": row.get::<Option<String>, _>(3),
            "isActive": row.get::<bool, _>(4),
            "requiresReference": row.get::<bool, _>(5),
            "sortOrder": row.get::<i32, _>(6),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn record_invoice_payment_db(state: tauri::State<'_, PgPool>, invoice_id: String, payment_method_id: String, amount: f64, reference_number: Option<String>, cheque_date: Option<String>, bank_name: Option<String>) -> Result<(), String> {
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    let pm_uuid = uuid::Uuid::parse_str(&payment_method_id).map_err(|e| e.to_string())?;
    let cheque = cheque_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    sqlx::query("INSERT INTO invoice_payments (invoice_id, payment_method_id, amount, reference_number, cheque_date, bank_name) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(inv_uuid).bind(pm_uuid).bind(rust_decimal::Decimal::from_f64(amount).ok_or("Err")?).bind(reference_number).bind(cheque).bind(bank_name)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 13. PRESCRIPTIONS =====

#[tauri::command]
pub async fn add_prescription_db(state: tauri::State<'_, PgPool>, patient_id: String, doctor_name: String, doctor_license: Option<String>, prescription_date: String, diagnosis: Option<String>, notes: Option<String>, is_antibiotic: bool, items_json: String) -> Result<String, String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    let rx_date = chrono::NaiveDate::parse_from_str(&prescription_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("INSERT INTO prescriptions (patient_id, doctor_name, doctor_license, prescription_date, diagnosis, notes, is_antibiotic) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id")
        .bind(pat_uuid).bind(&doctor_name).bind(doctor_license).bind(rx_date).bind(diagnosis).bind(notes).bind(is_antibiotic)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let rx_id: uuid::Uuid = row.get(0);
    
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;
    for item in items {
        sqlx::query("INSERT INTO prescription_items (prescription_id, medicine_id, drug_name, dosage, frequency, duration, quantity_prescribed) VALUES ($1, $2, $3, $4, $5, $6, $7)")
            .bind(rx_id)
            .bind(item["medicineId"].as_str().and_then(|s| uuid::Uuid::parse_str(s).ok()))
            .bind(item["drugName"].as_str().unwrap_or(""))
            .bind(item["dosage"].as_str())
            .bind(item["frequency"].as_str())
            .bind(item["duration"].as_str())
            .bind(item["quantity"].as_i64().unwrap_or(0) as i32)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(rx_id.to_string())
}

#[tauri::command]
pub async fn get_prescriptions_db(state: tauri::State<'_, PgPool>, patient_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(pid) = patient_id {
        let pat_uuid = uuid::Uuid::parse_str(&pid).map_err(|e| e.to_string())?;
        sqlx::query("SELECT p.id, p.doctor_name, p.prescription_date, p.diagnosis, p.is_antibiotic, p.status, pat.name as patient_name FROM prescriptions p JOIN patients pat ON p.patient_id = pat.id WHERE p.patient_id = $1 ORDER BY p.prescription_date DESC LIMIT 50")
            .bind(pat_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT p.id, p.doctor_name, p.prescription_date, p.diagnosis, p.is_antibiotic, p.status, pat.name as patient_name FROM prescriptions p JOIN patients pat ON p.patient_id = pat.id ORDER BY p.prescription_date DESC LIMIT 50")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "doctorName": row.get::<String, _>(1),
            "prescriptionDate": row.get::<chrono::NaiveDate, _>(2).to_string(),
            "diagnosis": row.get::<Option<String>, _>(3),
            "isAntibiotic": row.get::<bool, _>(4),
            "status": row.get::<String, _>(5),
            "patientName": row.get::<String, _>(6),
        }));
    }
    Ok(results)
}

// ===== 14. LOYALTY =====

#[tauri::command]
pub async fn get_patient_loyalty_db(state: tauri::State<'_, PgPool>, patient_id: String) -> Result<serde_json::Value, String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT loyalty_points, total_purchases, is_chronic FROM patients WHERE id = $1")
        .bind(pat_uuid).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "loyaltyPoints": row.get::<i32, _>(0),
        "totalPurchases": row.get::<rust_decimal::Decimal, _>(1).to_string().parse::<f64>().unwrap_or(0.0),
        "isChronic": row.get::<bool, _>(2),
    }))
}

#[tauri::command]
pub async fn redeem_loyalty_points_db(state: tauri::State<'_, PgPool>, patient_id: String, points: i32, description: String) -> Result<(), String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE patients SET loyalty_points = loyalty_points - $1 WHERE id = $2").bind(points).bind(pat_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO customer_loyalty_transactions (patient_id, transaction_type, points, description) VALUES ($1, 'redeem', $2, $3)")
        .bind(pat_uuid).bind(-points).bind(&description).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 15. STOCK COUNT (الجرد) =====

#[tauri::command]
pub async fn create_stock_count_db(state: tauri::State<'_, PgPool>, count_type: String, started_by: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO stock_counts (count_type, started_by) VALUES ($1, $2) RETURNING id")
        .bind(&count_type).bind(&started_by).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let count_id: uuid::Uuid = row.get(0);
    
    // إدراج جميع الأدوية في stock_count_items
    sqlx::query("INSERT INTO stock_count_items (stock_count_id, medicine_id, system_quantity) SELECT $1, id, quantity FROM medicines WHERE is_deleted = FALSE AND quantity > 0")
        .bind(count_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    Ok(count_id.to_string())
}

#[tauri::command]
pub async fn update_stock_count_item_db(state: tauri::State<'_, PgPool>, item_id: String, counted_quantity: i32, notes: Option<String>) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&item_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE stock_count_items SET counted_quantity = $1, difference = $1 - system_quantity, difference_value = ($1 - system_quantity) * (SELECT cost_price FROM medicines WHERE id = medicine_id), notes = $2 WHERE id = $3")
        .bind(counted_quantity).bind(notes).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn complete_stock_count_db(state: tauri::State<'_, PgPool>, count_id: String) -> Result<serde_json::Value, String> {
    let uuid_id = uuid::Uuid::parse_str(&count_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    
    // تحديث المخزون بالكميات الفعلية
    let items = sqlx::query("SELECT medicine_id, counted_quantity FROM stock_count_items WHERE stock_count_id = $1 AND counted_quantity IS NOT NULL")
        .bind(uuid_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    
    let mut adjusted = 0;
    for item in items {
        let med_id: uuid::Uuid = item.get(0);
        let counted: i32 = item.get(1);
        sqlx::query("UPDATE medicines SET quantity = $1 WHERE id = $2").bind(counted).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        adjusted += 1;
    }
    
    sqlx::query("UPDATE stock_counts SET status = 'completed', completed_at = NOW() WHERE id = $1").bind(uuid_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "adjusted": adjusted,
        "status": "completed"
    }))
}

// ===== 16. CONTROLLED MEDICINES CHECK =====

#[tauri::command]
pub async fn check_controlled_medicine_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<serde_json::Value, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    // فحص إذا كان الدواء مضبوط
    let row = sqlx::query("SELECT m.name_ar, m.scientific_name FROM medicines m WHERE m.id = $1")
        .bind(med_uuid).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        let name = r.get::<String, _>(0);
        let scientific: Option<String> = r.get(1);
        
        // قائمة المهدئات والمخدرات الشائعة (controlled medicines)
        let controlled_keywords = ["diazepam", "morphine", "tramadol", "codeine", "phenobarbital", "alprazolam", "clonazepam", "lorazepam"];
        let is_controlled = scientific.as_ref().map(|s| {
            let lower = s.to_lowercase();
            controlled_keywords.iter().any(|k| lower.contains(k))
        }).unwrap_or(false);
        
        Ok(serde_json::json!({
            "medicineName": name,
            "isControlled": is_controlled,
            "requiresPrescription": true,
            "warning": if is_controlled { Some("هذا دواء مُضبوط - يتطلب وصفة طبية وتسجيل خاص") } else { None }
        }))
    } else {
        Ok(serde_json::json!({
            "isControlled": false,
            "error": "الدواء غير موجود"
        }))
    }
}

// ===== 17. IRAQI MEDICINE SEED =====

#[tauri::command]
pub async fn seed_iraqi_medicines_db(state: tauri::State<'_, PgPool>) -> Result<i64, String> {
    // أدوية عراقية شائعة - إدراج في drug_master
    let medicines = vec![
        ("Paracetamol", "Paracetamol", "باراسيتامول", "500mg", "tablet", "analgesics", false, false),
        ("Panadol", "Paracetamol", "بنادول", "500mg", "tablet", "analgesics", false, false),
        ("Panadol Extra", "Paracetamol+Caffeine", "بنادول اكسترا", "500mg+65mg", "tablet", "analgesics", false, false),
        ("Ibuprofen", "Ibuprofen", "ايبوبروفين", "400mg", "tablet", "analgesics", false, false),
        ("Brufen", "Ibuprofen", "بروفين", "400mg", "tablet", "analgesics", false, false),
        ("Aspirin", "Acetylsalicylic Acid", "اسبرين", "100mg", "tablet", "analgesics", false, false),
        ("Diclofenac", "Diclofenac Sodium", "ديكلوفيناك", "50mg", "tablet", "analgesics", false, false),
        ("Voltaren", "Diclofenac Sodium", "فولتارين", "50mg", "tablet", "analgesics", false, false),
        ("Amoxicillin", "Amoxicillin", "اموكسيسيلين", "500mg", "capsule", "antibiotics", false, true),
        ("Augmentin", "Amoxicillin+Clavulanic Acid", "اوجمنتين", "625mg", "tablet", "antibiotics", false, true),
        ("Azithromycin", "Azithromycin", "ازيثرومايسين", "500mg", "tablet", "antibiotics", false, true),
        ("Ciprofloxacin", "Ciprofloxacin", "سيبروفلوكساسين", "500mg", "tablet", "antibiotics", false, true),
        ("Cefuroxime", "Cefuroxime", "سيفوروكسيم", "500mg", "tablet", "antibiotics", false, true),
        ("Metronidazole", "Metronidazole", "ميترونيدازول", "500mg", "tablet", "antibiotics", false, true),
        ("Doxycycline", "Doxycycline", "دوكسيسيكلين", "100mg", "capsule", "antibiotics", false, true),
        ("Cetirizine", "Cetirizine", "سيتيريزين", "10mg", "tablet", "antihistamines", true, false),
        ("Zyrtec", "Cetirizine", "زيرتك", "10mg", "tablet", "antihistamines", true, false),
        ("Loratadine", "Loratadine", "لوراتادين", "10mg", "tablet", "antihistamines", true, false),
        ("Claritine", "Loratadine", "كلاريتين", "10mg", "tablet", "antihistamines", true, false),
        ("Metformin", "Metformin HCl", "ميتفورمين", "500mg", "tablet", "diabetes", false, true),
        ("Glucophage", "Metformin HCl", "جلوكوفاج", "500mg", "tablet", "diabetes", false, true),
        ("Gliclazide", "Gliclazide", "جليكلازيد", "80mg", "tablet", "diabetes", false, true),
        ("Insulin", "Insulin", "انسولين", "100IU/ml", "injection", "diabetes", false, true),
        ("Amlodipine", "Amlodipine", "املوديبين", "5mg", "tablet", "hypertension", false, true),
        ("Norvasc", "Amlodipine", "نورفاسك", "5mg", "tablet", "hypertension", false, true),
        ("Atenolol", "Atenolol", "اتينولول", "50mg", "tablet", "hypertension", false, true),
        ("Losartan", "Losartan", "لوسارتان", "50mg", "tablet", "hypertension", false, true),
        ("Enalapril", "Enalapril", "انالابريل", "10mg", "tablet", "hypertension", false, true),
        ("Omeprazole", "Omeprazole", "اوميبرازول", "20mg", "capsule", "gastrointestinal", false, true),
        ("Nexium", "Esomeprazole", "نكسيوم", "40mg", "tablet", "gastrointestinal", false, true),
        ("Ranitidine", "Ranitidine", "رانيتيدين", "150mg", "tablet", "gastrointestinal", false, true),
        ("Pantoprazole", "Pantoprazole", "بانتوبرازول", "40mg", "tablet", "gastrointestinal", false, true),
        ("Vitamin C", "Ascorbic Acid", "فيتامين سي", "500mg", "tablet", "vitamins", true, false),
        ("Vitamin D3", "Cholecalciferol", "فيتامين د3", "5000IU", "capsule", "vitamins", true, false),
        ("Vitamin B Complex", "B Vitamins", "فيتامين ب مركب", "complex", "tablet", "vitamins", true, false),
        ("Calcium", "Calcium Carbonate", "كالسيوم", "600mg", "tablet", "vitamins", true, false),
        ("Iron", "Ferrous Sulfate", "حديد", "325mg", "tablet", "vitamins", true, false),
        ("Folic Acid", "Folic Acid", "حمض الفوليك", "5mg", "tablet", "vitamins", true, false),
        ("Diazepam", "Diazepam", "ديازيبام", "5mg", "tablet", "neurological", false, true),
        ("Carbamazepine", "Carbamazepine", "كاربامازيبين", "200mg", "tablet", "neurological", false, true),
        ("Phenobarbital", "Phenobarbital", "فينوباربيتال", "30mg", "tablet", "neurological", false, true),
        ("Hydrocortisone", "Hydrocortisone", "هيدروكورتيزون", "1%", "cream", "dermatology", false, true),
        ("Clotrimazole", "Clotrimazole", "كلوتريمازول", "1%", "cream", "dermatology", true, false),
        ("Betamethasone", "Betamethasone", "بيتاميثازون", "0.1%", "cream", "dermatology", false, true),
        ("Salbutamol", "Salbutamol", "سالبوتامول", "100mcg", "inhaler", "respiratory", false, true),
        ("Prednisolone", "Prednisolone", "بريدنيزولون", "5mg", "tablet", "respiratory", false, true),
        ("ORS", "Oral Rehydration Salts", "محلول معالجة الجفاف", "sachet", "powder", "gastrointestinal", true, false),
        ("Zinc", "Zinc Sulfate", "زنك", "20mg", "tablet", "vitamins", true, false),
        ("Multivitamin", "Multivitamin", "ملتي فيتامين", "complex", "tablet", "vitamins", true, false),
    ];
    
    let mut inserted: i64 = 0;
    for (trade, scientific, arabic, strength, form, category, otc, rx) in medicines {
        let normalized = arabic.replace("ة", "ه").replace("ى", "ي").to_lowercase();
        let result = sqlx::query("INSERT INTO drug_master (trade_name, scientific_name, arabic_name, normalized_arabic, dosage_strength, dosage_form, category, is_otc, is_prescription) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING")
            .bind(trade).bind(scientific).bind(arabic).bind(&normalized).bind(strength).bind(form).bind(category).bind(otc).bind(rx)
            .execute(state.inner()).await;
        if result.is_ok() { inserted += 1; }
    }
    
    Ok(inserted)
}

// ===== 18. MULTI-CURRENCY =====

#[tauri::command]
pub async fn convert_currency_db(state: tauri::State<'_, PgPool>, amount: f64, from_currency: String, to_currency: String) -> Result<f64, String> {
    if from_currency == to_currency { return Ok(amount); }
    
    // الحصول على سعر الصرف
    let rate: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'usd_exchange_rate'")
        .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    let usd_rate: f64 = rate.and_then(|s| s.parse().ok()).unwrap_or(1310.0);
    
    let result = if from_currency == "USD" && to_currency == "IQD" {
        amount * usd_rate
    } else if from_currency == "IQD" && to_currency == "USD" {
        amount / usd_rate
    } else {
        amount
    };
    
    Ok(result)
}

#[tauri::command]
pub async fn update_exchange_rate_db(state: tauri::State<'_, PgPool>, rate: f64) -> Result<(), String> {
    sqlx::query("INSERT INTO settings (key, value) VALUES ('usd_exchange_rate', $1) ON CONFLICT (key) DO UPDATE SET value = $1")
        .bind(rate.to_string()).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}
