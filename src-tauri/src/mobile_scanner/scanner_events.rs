// Scanner Events — معالجة أحداث المسح
use sqlx::{PgPool, Row};
use crate::mobile_scanner::barcode_parser;

/// فحص الباركود من الـ POS (استدعاء مباشر بدون WebSocket)
#[tauri::command]
pub async fn scan_barcode_direct(
    state: tauri::State<'_, PgPool>,
    barcode: String,
    device_name: Option<String>,
    user_role: Option<String>,
) -> Result<serde_json::Value, String> {
    let normalized = crate::mobile_scanner::barcode_parser::normalize_barcode(&barcode);
    let barcode_type = crate::mobile_scanner::barcode_parser::detect_barcode_type(&barcode);

    // ابحث في medicine_barcodes
    let med_row = sqlx::query(
        "SELECT m.id, m.name_ar, m.price, m.quantity, m.barcode, m.scientific_name
         FROM medicine_barcodes mb
         JOIN medicines m ON mb.medicine_id = m.id
         WHERE (mb.barcode = $1 OR mb.normalized_barcode = $2)
           AND m.is_deleted = FALSE
         LIMIT 1"
    )
    .bind(&barcode).bind(&normalized)
    .fetch_optional(state.inner()).await
    .map_err(|e| e.to_string())?;

    if let Some(r) = med_row {
        let med_id: uuid::Uuid = r.get(0);
        let name: String = r.get(1);
        let price: rust_decimal::Decimal = r.get(2);
        let qty: i32 = r.get(3);

        // سجل المسح
        let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, user_role, barcode_scanned, barcode_type, normalized_barcode, scan_result, matched_medicine_id, matched_medicine_name) VALUES ($1, $2, $3, $4, $5, 'success', $6, $7)")
            .bind(&device_name).bind(&user_role).bind(&barcode).bind(&barcode_type).bind(&normalized).bind(med_id).bind(&name)
            .execute(state.inner()).await;

        return Ok(serde_json::json!({
            "status": "found",
            "medicineId": med_id.to_string(),
            "nameAr": name,
            "price": price.to_string().parse::<f64>().unwrap_or(0.0),
            "quantity": qty,
            "barcodeType": barcode_type,
        }));
    }

    // ابحث في global_medicines
    let global_row = sqlx::query(
        "SELECT barcode, name_fr, active_ingredient, brand_name, dosage_form, dosage_form_ar, strength
         FROM global_medicines WHERE barcode = $1 LIMIT 1"
    )
    .bind(&barcode).fetch_optional(state.inner()).await
    .map_err(|e| e.to_string())?;

    if let Some(r) = global_row {
        let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, user_role, barcode_scanned, barcode_type, normalized_barcode, scan_result, matched_medicine_name) VALUES ($1, $2, $3, $4, $5, 'global_found', $6)")
            .bind(&device_name).bind(&user_role).bind(&barcode).bind(&barcode_type).bind(&normalized)
            .bind(r.get::<Option<String>, _>(1).unwrap_or_default())
            .execute(state.inner()).await;

        return Ok(serde_json::json!({
            "status": "global_found",
            "name": r.get::<String, _>(1),
            "activeIngredient": r.get::<Option<String>, _>(2),
            "brandName": r.get::<Option<String>, _>(3),
            "dosageForm": r.get::<Option<String>, _>(4),
            "dosageFormAr": r.get::<Option<String>, _>(5),
            "strength": r.get::<Option<String>, _>(6),
            "barcodeType": barcode_type,
        }));
    }

    // غير موجود
    let _ = sqlx::query("INSERT INTO scan_audit_logs (device_name, user_role, barcode_scanned, barcode_type, normalized_barcode, scan_result) VALUES ($1, $2, $3, $4, $5, 'not_found')")
        .bind(&device_name).bind(&user_role).bind(&barcode).bind(&barcode_type).bind(&normalized)
        .execute(state.inner()).await;

    Ok(serde_json::json!({
        "status": "not_found",
        "barcode": barcode,
        "normalized": normalized,
        "barcodeType": barcode_type,
    }))
}
