// ========================================
// PharmIQ Commands (Cleaned)
// ========================================
// الأوامر الأساسية فقط: باركود + مدفوعات + وصفات + جرد + عملات
// باقي الأوامر المحذوفة كانت لجداول لم تعد موجودة

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;
use chrono;

// ===== 1. BARCODE COMMANDS =====

#[tauri::command]
pub async fn lookup_barcode_db(state: tauri::State<'_, PgPool>, barcode: String) -> Result<Option<serde_json::Value>, String> {
    let trimmed = barcode.trim();
    if trimmed.is_empty() { return Ok(None); }

    // البحث في medicine_barcodes + medicines.barcode
    let row = sqlx::query(
        "SELECT m.id, m.name_ar, m.price, m.quantity, m.barcode,
                mb.barcode_type, mb.barcode_scope, mb.batch_number, mb.expiry_date
         FROM medicine_barcodes mb
         JOIN medicines m ON mb.medicine_id = m.id
         WHERE mb.barcode = $1 AND mb.is_active = TRUE AND m.is_deleted = FALSE
         UNION ALL
         SELECT m.id, m.name_ar, m.price, m.quantity, m.barcode,
                NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::DATE
         FROM medicines m
         WHERE m.barcode = $1 AND m.is_deleted = FALSE
           AND NOT EXISTS (
             SELECT 1 FROM medicine_barcodes mb2
             WHERE mb2.barcode = m.barcode AND mb2.is_active = TRUE
           )
         LIMIT 1"
    )
    .bind(trimmed)
    .fetch_optional(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some(r) = row {
        Ok(Some(serde_json::json!({
            "medicineId": r.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": r.get::<String, _>(1),
            "price": r.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "quantity": r.get::<i32, _>(3),
            "barcode": r.get::<String, _>(4),
            "barcodeType": r.get::<Option<String>, _>(5).unwrap_or_else(|| "EAN13".to_string()),
            "barcodeScope": r.get::<Option<String>, _>(6).unwrap_or_else(|| "internal".to_string()),
            "batchNumber": r.get::<Option<String>, _>(7),
            "expiryDate": r.get::<Option<chrono::NaiveDate>, _>(8).map(|d| d.to_string()),
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
    let pool = state.inner();

    // التحقق من وجود باركود سابق
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT barcode FROM medicines WHERE id = $1 AND barcode IS NOT NULL AND barcode != ''"
    )
    .bind(med_uuid).fetch_optional(pool).await.map_err(|e| e.to_string())?;
    if let Some(b) = existing {
        return Ok(b);
    }

    // توليد EAN-13: بادئة 200 (GS1 in-store) + 9 أرقام تسلسلية
    let max_seq: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 4 FOR 9) AS BIGINT)), 0)
         FROM medicines
         WHERE barcode LIKE '200%' AND LENGTH(barcode) = 13"
    )
    .fetch_one(pool).await.unwrap_or(0);

    let base_12 = format!("200{:09}", max_seq + 1);

    let check_digit: i32 = sqlx::query_scalar("SELECT compute_ean13_check_digit($1)")
        .bind(&base_12).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let barcode = format!("{}{}", base_12, check_digit);

    sqlx::query("UPDATE medicines SET barcode = $1 WHERE id = $2")
        .bind(&barcode).bind(med_uuid)
        .execute(pool).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
         VALUES ($1, $2, 'EAN13', 'internal', NOW())
         ON CONFLICT (barcode, barcode_type) DO NOTHING"
    )
    .bind(med_uuid).bind(&barcode)
    .execute(pool).await.map_err(|e| e.to_string())?;

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

    Ok(serde_json::json!({
        "totalScans": total_scans,
        "successfulScans": successful_scans,
        "unknownScans": unknown_scans,
        "avgScanTime": avg_scan_time,
    }))
}

// ===== 2. PAYMENT METHODS =====

#[tauri::command]
pub async fn get_payment_methods_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, is_active FROM payment_methods WHERE is_active = TRUE ORDER BY name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "isActive": row.get::<bool, _>(3),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn record_invoice_payment_db(state: tauri::State<'_, PgPool>, invoice_id: String, payment_method_id: String, amount: f64, reference_number: Option<String>, cheque_date: Option<String>, bank_name: Option<String>) -> Result<(), String> {
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    let method_uuid = uuid::Uuid::parse_str(&payment_method_id).map_err(|e| e.to_string())?;
    let cheque = cheque_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());
    sqlx::query("INSERT INTO invoice_payments (invoice_id, payment_method_id, amount, reference_number, cheque_date, bank_name) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(inv_uuid).bind(method_uuid)
        .bind(rust_decimal::Decimal::from_f64(amount).ok_or("Invalid amount")?)
        .bind(&reference_number).bind(cheque).bind(&bank_name)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 3. PRESCRIPTIONS =====

#[tauri::command]
pub async fn add_prescription_db(state: tauri::State<'_, PgPool>, patient_id: String, doctor_name: String, doctor_license: Option<String>, prescription_date: String, diagnosis: Option<String>, notes: Option<String>, is_antibiotic: bool, items_json: String) -> Result<String, String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    let date = chrono::NaiveDate::parse_from_str(&prescription_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let items: Vec<serde_json::Value> = serde_json::from_str(&items_json).map_err(|e| e.to_string())?;

    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    let row = sqlx::query("INSERT INTO prescriptions (patient_id, doctor_name, doctor_license, prescription_date, diagnosis, notes, is_antibiotic) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id")
        .bind(pat_uuid).bind(&doctor_name).bind(&doctor_license).bind(date)
        .bind(&diagnosis).bind(&notes).bind(is_antibiotic)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let presc_id: uuid::Uuid = row.get(0);

    for item in &items {
        let med_name = item["medicineName"].as_str().ok_or("Missing medicine name")?;
        let dosage = item["dosage"].as_str().unwrap_or("");
        let duration = item["duration"].as_str().unwrap_or("");
        let instructions = item["instructions"].as_str().unwrap_or("");
        sqlx::query("INSERT INTO prescription_items (prescription_id, medicine_name, dosage, duration, instructions) VALUES ($1, $2, $3, $4, $5)")
            .bind(presc_id).bind(med_name).bind(dosage).bind(duration).bind(instructions)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(presc_id.to_string())
}

#[tauri::command]
pub async fn get_prescriptions_db(state: tauri::State<'_, PgPool>, patient_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    // Phase 13 Fix: eliminate N+1 — single query with json_agg for items
    let rows = if let Some(pid) = patient_id {
        let pat_uuid = uuid::Uuid::parse_str(&pid).map_err(|e| e.to_string())?;
        sqlx::query(
            "SELECT p.id, p.patient_id, p.doctor_name, p.doctor_license, p.prescription_date, \
             p.diagnosis, p.notes, p.is_antibiotic, pat.name as patient_name, \
             COALESCE(json_agg(json_build_object('medicineName', pi.medicine_name, 'dosage', pi.dosage, 'duration', pi.duration, 'instructions', pi.instructions)) FILTER (WHERE pi.id IS NOT NULL), '[]'::json)::text as items \
             FROM prescriptions p \
             JOIN patients pat ON p.patient_id = pat.id \
             LEFT JOIN prescription_items pi ON pi.prescription_id = p.id \
             WHERE p.patient_id = $1 \
             GROUP BY p.id, p.patient_id, p.doctor_name, p.doctor_license, p.prescription_date, p.diagnosis, p.notes, p.is_antibiotic, pat.name \
             ORDER BY p.prescription_date DESC"
        ).bind(pat_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            "SELECT p.id, p.patient_id, p.doctor_name, p.doctor_license, p.prescription_date, \
             p.diagnosis, p.notes, p.is_antibiotic, pat.name as patient_name, \
             COALESCE(json_agg(json_build_object('medicineName', pi.medicine_name, 'dosage', pi.dosage, 'duration', pi.duration, 'instructions', pi.instructions)) FILTER (WHERE pi.id IS NOT NULL), '[]'::json)::text as items \
             FROM prescriptions p \
             JOIN patients pat ON p.patient_id = pat.id \
             LEFT JOIN prescription_items pi ON pi.prescription_id = p.id \
             GROUP BY p.id, p.patient_id, p.doctor_name, p.doctor_license, p.prescription_date, p.diagnosis, p.notes, p.is_antibiotic, pat.name \
             ORDER BY p.prescription_date DESC LIMIT 100"
        ).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };

    let mut results = Vec::new();
    for row in rows {
        let presc_id: uuid::Uuid = row.get(0);
        let items_str: String = row.get(9);
        let items: serde_json::Value = serde_json::from_str(&items_str).unwrap_or(serde_json::Value::Array(vec![]));
        results.push(serde_json::json!({
            "id": presc_id.to_string(),
            "patientId": row.get::<uuid::Uuid, _>(1).to_string(),
            "doctorName": row.get::<String, _>(2),
            "doctorLicense": row.get::<Option<String>, _>(3),
            "prescriptionDate": row.get::<chrono::NaiveDate, _>(4).to_string(),
            "diagnosis": row.get::<Option<String>, _>(5),
            "notes": row.get::<Option<String>, _>(6),
            "isAntibiotic": row.get::<bool, _>(7),
            "patientName": row.get::<String, _>(8),
            "items": items,
        }));
    }
    Ok(results)
}

// ===== 4. PATIENT LOYALTY =====

#[tauri::command]
pub async fn get_patient_loyalty_db(state: tauri::State<'_, PgPool>, patient_id: String) -> Result<serde_json::Value, String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    let total_points: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(points), 0) FROM customer_loyalty_transactions WHERE patient_id = $1")
        .bind(pat_uuid).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "patientId": patient_id,
        "totalPoints": total_points,
    }))
}

#[tauri::command]
pub async fn redeem_loyalty_points_db(state: tauri::State<'_, PgPool>, patient_id: String, points: i32, description: String) -> Result<(), String> {
    let pat_uuid = uuid::Uuid::parse_str(&patient_id).map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO customer_loyalty_transactions (patient_id, points, transaction_type, description) VALUES ($1, $2, 'redeem', $3)")
        .bind(pat_uuid).bind(-points).bind(&description)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 5. STOCK COUNT (الجرد) =====

#[tauri::command]
pub async fn create_stock_count_db(state: tauri::State<'_, PgPool>, count_type: String, started_by: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO stock_counts (count_type, started_by) VALUES ($1, $2) RETURNING id")
        .bind(&count_type).bind(&started_by)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn update_stock_count_item_db(state: tauri::State<'_, PgPool>, item_id: String, counted_quantity: i32, notes: Option<String>) -> Result<(), String> {
    let item_uuid = uuid::Uuid::parse_str(&item_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE stock_count_items SET counted_quantity = $1, notes = $2 WHERE id = $3")
        .bind(counted_quantity).bind(&notes).bind(item_uuid)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn complete_stock_count_db(state: tauri::State<'_, PgPool>, count_id: String) -> Result<serde_json::Value, String> {
    let count_uuid = uuid::Uuid::parse_str(&count_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    let items = sqlx::query("SELECT medicine_id, expected_quantity, counted_quantity FROM stock_count_items WHERE stock_count_id = $1")
        .bind(count_uuid).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;

    let mut adjusted = 0;
    for item in items {
        let med_id: uuid::Uuid = item.get(0);
        let expected: i32 = item.get(1);
        let counted: Option<i32> = item.get(2);
        if let Some(c) = counted {
            // Phase 6 Fix: use delta (counted - expected) instead of absolute assignment
            // Previously: SET quantity = $1 (overwrites concurrent sales during count)
            // Now: SET quantity = quantity + (counted - expected) (preserves concurrent changes)
            let delta = c - expected;
            // FOR UPDATE: lock medicine row during update
            let _ = sqlx::query("SELECT quantity FROM medicines WHERE id = $1 FOR UPDATE")
                .bind(med_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE medicines SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2")
                .bind(delta).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            adjusted += 1;
        }
    }

    sqlx::query("UPDATE stock_counts SET status = 'completed', completed_at = NOW() WHERE id = $1")
        .bind(count_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "countId": count_id,
        "adjustedItems": adjusted,
    }))
}

// ===== 6. CONTROLLED MEDICINE CHECK =====

#[tauri::command]
pub async fn check_controlled_medicine_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<serde_json::Value, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT name_ar, scientific_name FROM medicines WHERE id = $1")
        .bind(med_uuid).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;

    if let Some(r) = row {
        let name: String = r.get(0);
        let scientific: Option<String> = r.get(1);
        let name_lower = name.to_lowercase();
        let sci_lower = scientific.unwrap_or_default().to_lowercase();

        let controlled_keywords = ["morphine", "tramadol", "codeine", "diazepam", "lorazepam",
            "alprazolam", "clonazepam", "phenobarbital", "pentazocine", "methadone",
            "pethidine", "fentanyl", "oxycodone", "morph"];
        let is_controlled = controlled_keywords.iter().any(|k| name_lower.contains(k) || sci_lower.contains(k));

        Ok(serde_json::json!({
            "medicineId": medicine_id,
            "medicineName": name,
            "isControlled": is_controlled,
            "requiresPrescription": is_controlled,
        }))
    } else {
        Ok(serde_json::json!({
            "medicineId": medicine_id,
            "isControlled": false,
            "requiresPrescription": false,
        }))
    }
}

// ===== 7. SEED IRAQI MEDICINES (للاستيراد) =====

#[tauri::command]
pub async fn seed_iraqi_medicines_db(state: tauri::State<'_, PgPool>) -> Result<i64, String> {
    let pool = state.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // قائمة الأدوية العراقية الأساسية (مختصرة)
    let iraqi_meds = vec![
        ("باراسيتامول 500mg", "Paracetamol", "Paracetamol", "500mg", "tablet", "analgesics", true, false),
        ("بنادول 500mg", "Panadol", "Paracetamol", "500mg", "tablet", "analgesics", true, false),
        ("بنادول اكسترا", "Panadol Extra", "Paracetamol+Caffeine", "500mg+65mg", "tablet", "analgesics", true, false),
        ("ايبوبروفين 400mg", "Ibuprofen", "Ibuprofen", "400mg", "tablet", "analgesics", true, false),
        ("بروفين 400mg", "Brufen", "Ibuprofen", "400mg", "tablet", "analgesics", true, false),
        ("اسبرين 100mg", "Aspirin", "Acetylsalicylic Acid", "100mg", "tablet", "analgesics", true, false),
        ("ديكلوفيناك 50mg", "Diclofenac", "Diclofenac Sodium", "50mg", "tablet", "analgesics", false, true),
        ("فولتارين 50mg", "Voltaren", "Diclofenac Sodium", "50mg", "tablet", "analgesics", false, true),
        ("اموكسيسيلين 500mg", "Amoxicillin", "Amoxicillin", "500mg", "capsule", "antibiotics", false, true),
        ("أوغمنتين 1g", "Augmentin", "Amoxicillin+Clavulanic Acid", "1g", "tablet", "antibiotics", false, true),
        ("ازيثرومايسين 500mg", "Azithromycin", "Azithromycin", "500mg", "tablet", "antibiotics", false, true),
        ("سيبروفلوكساسين 500mg", "Ciprofloxacin", "Ciprofloxacin", "500mg", "tablet", "antibiotics", false, true),
        ("اوميبرازول 20mg", "Omeprazole", "Omeprazole", "20mg", "capsule", "gi", false, true),
        ("ميتفورمين 500mg", "Metformin", "Metformin", "500mg", "tablet", "diabetes", false, true),
        ("اتورفاستاتين 20mg", "Atorvastatin", "Atorvastatin", "20mg", "tablet", "cardiovascular", false, true),
        ("أملوديبين 5mg", "Amlodipine", "Amlodipine", "5mg", "tablet", "cardiovascular", false, true),
        ("لوسارتان 50mg", "Losartan", "Losartan", "50mg", "tablet", "cardiovascular", false, true),
        ("انالبريل 10mg", "Enalapril", "Enalapril", "10mg", "tablet", "cardiovascular", false, true),
        ("فوروسيميد 40mg", "Furosemide", "Furosemide", "40mg", "tablet", "diuretics", false, true),
        ("وارفارين 5mg", "Warfarin", "Warfarin", "5mg", "tablet", "anticoagulants", false, true),
        ("ليفوثيروكسين 50mcg", "Levothyroxine", "Levothyroxine", "50mcg", "tablet", "thyroid", false, true),
        ("بريدنيزولون 5mg", "Prednisolone", "Prednisolone", "5mg", "tablet", "steroids", false, true),
        ("ديازيبام 5mg", "Diazepam", "Diazepam", "5mg", "tablet", "sedatives", false, true),
        ("ترامادول 50mg", "Tramadol", "Tramadol", "50mg", "capsule", "analgesics", false, true),
        ("سيتيريزين 10mg", "Cetirizine", "Cetirizine", "10mg", "tablet", "antihistamines", true, false),
        ("لوراتادين 10mg", "Loratadine", "Loratadine", "10mg", "tablet", "antihistamines", true, false),
        ("رانيتيدين 150mg", "Ranitidine", "Ranitidine", "150mg", "tablet", "gi", false, true),
        ("فيتامين C 1000mg", "Vitamin C", "Ascorbic Acid", "1000mg", "tablet", "vitamins", true, false),
        ("فيتامين D3 5000IU", "Vitamin D3", "Cholecalciferol", "5000IU", "capsule", "vitamins", true, false),
        ("كالسيوم 600mg", "Calcium", "Calcium Carbonate", "600mg", "tablet", "supplements", true, false),
    ];

    let mut inserted: i64 = 0;
    for (name_ar, name_en, scientific, _strength, _form, _category, _is_otc, _is_rx) in iraqi_meds {
        // التحقق من عدم وجود الدواء مسبقاً (بالمطابقة على الاسم العربي)
        let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM medicines WHERE name_ar = $1 AND is_deleted = FALSE")
            .bind(name_ar).fetch_one(&mut *tx).await.unwrap_or(0);

        if existing > 0 {
            // الدواء موجود مسبقاً — تخطّاه (لا تكرار)
            continue;
        }

        // توليد باركود EAN-13 تلقائياً
        let max_seq: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 4 FOR 9) AS BIGINT)), 0)
             FROM medicines WHERE barcode LIKE '200%' AND LENGTH(barcode) = 13"
        ).fetch_one(&mut *tx).await.unwrap_or(0);
        let base_12 = format!("200{:09}", max_seq + 1);
        let check_digit: i32 = sqlx::query_scalar("SELECT compute_ean13_check_digit($1)")
            .bind(&base_12).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        let barcode = format!("{}{}", base_12, check_digit);

        // توليد تاريخ انتهاء عشوائي (بين 1 و 3 سنوات من الآن)
        let expiry = chrono::Local::now().date_naive()
            + chrono::Duration::days(365 + (max_seq % 730)); // 1-3 سنوات

        // توليد سعر متنوع (500-3000 د.ع)
        let price = 500 + ((max_seq % 26) * 100) as i32; // 500, 600, 700, ..., 3000
        let cost = price - 200;
        let wholesale = price - 100;

        let result = sqlx::query("INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES ($1, $2, $3, $4, $5, $6, $7, 50, $8, $9)")
            .bind(name_ar).bind(name_en).bind(scientific).bind(&barcode)
            .bind(rust_decimal::Decimal::from(price))
            .bind(rust_decimal::Decimal::from(wholesale))
            .bind(rust_decimal::Decimal::from(cost))
            .bind(format!("BATCH-{:04}", max_seq + 1))
            .bind(expiry)
            .execute(&mut *tx).await;

        if result.is_ok() {
            inserted += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(inserted)
}

// ===== 8. CURRENCY (للموردين) =====

#[tauri::command]
pub async fn convert_currency_db(state: tauri::State<'_, PgPool>, amount: f64, from_currency: String, to_currency: String) -> Result<f64, String> {
    if from_currency == to_currency { return Ok(amount); }
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
