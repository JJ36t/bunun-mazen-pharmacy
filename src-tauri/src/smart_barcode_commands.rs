// ========================================
// Smart Barcode Lookup Commands
// ========================================
// البحث اللحظي عن الباركودات غير المعروفة في مصادر خارجية:
// 1. global_medicines (القاعدة المحلية — الفرنسية + OpenFDA)
// 2. OpenFoodFacts API (مجاني)
// 3. GS1 Verified API (محدود 30/يوم)

use sqlx::{PgPool, Row};
use serde_json;
use std::time::Duration;
use rust_decimal::prelude::FromPrimitive;

/// HTTP client helper
async fn http_get_json(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("BununMazenPharmacy/2.3 (https://github.com/JJ36t/bunun-mazen-pharmacy)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if text.is_empty() {
        return Err("Empty response".to_string());
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// 1. البحث في القاعدة المحلية (global_medicines)
#[tauri::command]
pub async fn lookup_in_global_db(state: tauri::State<'_, PgPool>, barcode: String) -> Result<Option<serde_json::Value>, String> {
    lookup_in_global_db_inner(state.inner(), barcode).await
}

/// Inner helper that takes &PgPool (callable from other commands)
async fn lookup_in_global_db_inner(pool: &PgPool, barcode: String) -> Result<Option<serde_json::Value>, String> {
    let trimmed = barcode.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let row = sqlx::query(
        "SELECT barcode, name_fr, name_ar, active_ingredient, brand_name,
                dosage_form, dosage_form_ar, route, strength, manufacturer, source
         FROM global_medicines
         WHERE barcode = $1
         LIMIT 1"
    )
    .bind(trimmed)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(r) = row {
        Ok(Some(serde_json::json!({
            "source": "local_database",
            "barcode": r.get::<String, _>(0),
            "name": r.get::<String, _>(1),
            "nameAr": r.get::<Option<String>, _>(2),
            "activeIngredient": r.get::<Option<String>, _>(3),
            "brandName": r.get::<Option<String>, _>(4),
            "dosageForm": r.get::<Option<String>, _>(5),
            "dosageFormAr": r.get::<Option<String>, _>(6),
            "route": r.get::<Option<String>, _>(7),
            "strength": r.get::<Option<String>, _>(8),
            "manufacturer": r.get::<Option<String>, _>(9),
            "dbSource": r.get::<Option<String>, _>(10),
        })))
    } else {
        Ok(None)
    }
}

/// 2. البحث في OpenFoodFacts / OpenBeautyFacts
#[tauri::command]
pub async fn lookup_in_openfoodfacts(barcode: String) -> Result<Option<serde_json::Value>, String> {
    let trimmed = barcode.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    // Try OpenFoodFacts first, then OpenBeautyFacts (some meds are there)
    let urls = [
        format!("https://world.openfoodfacts.org/api/v2/product/{}.json", trimmed),
        format!("https://world.openbeautyfacts.org/api/v2/product/{}.json", trimmed),
    ];

    for url in urls {
        match http_get_json(&url).await {
            Ok(data) => {
                let status = data.get("status").and_then(|s| s.as_i64()).unwrap_or(0);
                if status == 1 {
                    if let Some(product) = data.get("product") {
                        let name = product.get("product_name").and_then(|v| v.as_str()).unwrap_or("");
                        let brands = product.get("brands").and_then(|v| v.as_str()).unwrap_or("");
                        let categories = product.get("categories").and_then(|v| v.as_str()).unwrap_or("");
                        let quantity = product.get("quantity").and_then(|v| v.as_str()).unwrap_or("");
                        let image_url = product.get("image_front_url").and_then(|v| v.as_str()).unwrap_or("");

                        if !name.is_empty() {
                            return Ok(Some(serde_json::json!({
                                "source": "openfoodfacts",
                                "barcode": trimmed,
                                "name": name,
                                "brandName": brands,
                                "categories": categories,
                                "quantity": quantity,
                                "imageUrl": image_url,
                            })));
                        }
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Ok(None)
}

/// 3. البحث في GS1 Verified (محاكاة — يحتاج API key للحقيقي)
/// ملاحظة: GS1 يسمح بـ 30 searches/day مجاناً، نحاول استدعاء endpoint العام
#[tauri::command]
pub async fn lookup_in_gs1(barcode: String) -> Result<Option<serde_json::Value>, String> {
    let trimmed = barcode.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    // GS1 doesn't have a public REST API. The "Verified by GS1" is web-only.
    // However, we can extract company prefix info from the barcode itself.

    // EAN-13 structure:
    // - First 3 digits: GS1 country prefix (e.g., 30-37 = France, 34009 = French pharma)
    // - Next 4-6 digits: company prefix
    // - Next 3-5 digits: product code
    // - Last digit: checksum

    if trimmed.len() != 13 || !trimmed.chars().all(|c| c.is_numeric()) {
        return Ok(None);
    }

    let prefix = &trimmed[..3];
    let country = match prefix {
        "340" => "France (Pharmaceutical - CIP13)",
        "300" | "301" | "302" | "303" | "304" | "305" | "306" | "307" | "308" | "309" |
        "310" | "311" | "312" | "313" | "314" | "315" | "316" | "317" | "318" | "319" |
        "320" | "321" | "322" | "323" | "324" | "325" | "326" | "327" | "328" | "329" |
        "330" | "331" | "332" | "333" | "334" | "335" | "336" | "337" | "338" | "339" |
        "341" | "342" | "343" | "344" | "345" | "346" | "347" | "348" | "349" |
        "350" | "351" | "352" | "353" | "354" | "355" | "356" | "357" | "358" | "359" |
        "360" | "361" | "362" | "363" | "364" | "365" | "366" | "367" | "368" | "369" |
        "370" | "371" | "372" | "373" | "374" | "375" | "376" | "377" | "378" | "379" => "France",
        "400" | "401" | "402" | "403" | "404" | "405" | "406" | "407" | "408" | "409" |
        "410" | "411" | "412" | "413" | "414" | "415" | "416" | "417" | "418" | "419" |
        "420" | "421" | "422" | "423" | "424" | "425" | "426" | "427" | "428" | "429" |
        "430" | "431" | "432" | "433" | "434" | "435" | "436" | "437" | "438" | "439" |
        "440" | "441" | "442" | "443" | "444" => "Germany",
        "500" | "501" | "502" | "503" | "504" | "505" | "506" | "507" | "508" | "509" => "United Kingdom",
        "626" => "Iran",
        "628" => "Saudi Arabia",
        "629" => "United Arab Emirates",
        "625" => "Jordan",
        "621" => "Syria",
        "622" => "Egypt",
        "624" => "Libya",
        "690" | "691" | "692" | "693" | "694" | "695" => "China",
        "880" => "South Korea",
        "890" => "India",
        "893" => "Vietnam",
        _ => "Unknown",
    };

    // Detect French pharmaceutical barcode (34009 prefix)
    let is_pharma = trimmed.starts_with("34009");

    Ok(Some(serde_json::json!({
        "source": "gs1_prefix_analysis",
        "barcode": trimmed,
        "countryOfOrigin": country,
        "isPharmaceutical": is_pharma,
        "note": if is_pharma {
            "French pharmaceutical barcode (CIP-13). Likely in global_medicines table."
        } else {
            "Country detected from prefix. For full product info, register at verifiedbygs1.org"
        },
    })))
}

/// 4. البحث الشامل — يجرب كل المصادر بالترتيب
#[tauri::command]
pub async fn smart_barcode_lookup(
    state: tauri::State<'_, PgPool>,
    barcode: String,
) -> Result<serde_json::Value, String> {
    let trimmed = barcode.trim();
    if trimmed.is_empty() {
        return Err("Empty barcode".to_string());
    }

    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // 1. ابحث في القاعدة المحلية أولاً (الأسرع)
    match lookup_in_global_db_inner(state.inner(), trimmed.to_string()).await {
        Ok(Some(r)) => results.push(r),
        Ok(None) => {},
        Err(e) => errors.push(format!("local: {}", e)),
    }

    // 2. ابحث في OpenFoodFacts (متوازي مع GS1)
    let off_result = tokio::spawn(lookup_in_openfoodfacts(trimmed.to_string())).await;
    match off_result {
        Ok(Ok(Some(r))) => results.push(r),
        Ok(Ok(None)) => {},
        Ok(Err(e)) => errors.push(format!("openfoodfacts: {}", e)),
        Err(e) => errors.push(format!("openfoodfacts spawn: {}", e)),
    }

    // 3. تحليل GS1 prefix (محلي، سريع)
    match lookup_in_gs1(trimmed.to_string()).await {
        Ok(Some(r)) => results.push(r),
        Ok(None) => {},
        Err(e) => errors.push(format!("gs1: {}", e)),
    }

    Ok(serde_json::json!({
        "barcode": trimmed,
        "found": !results.is_empty(),
        "results": results,
        "errors": errors,
    }))
}

/// 5. إضافة دواء جديد من نتيجة البحث اللحظي
/// يستقبل بيانات الدواء + السعر + الكمية ويضيفه لـ medicines
#[tauri::command]
pub async fn add_medicine_from_global_db(
    state: tauri::State<'_, PgPool>,
    barcode: String,
    name: String,
    active_ingredient: Option<String>,
    dosage_form: Option<String>,
    strength: Option<String>,
    price: f64,
    cost_price: f64,
    quantity: i32,
    batch_number: Option<String>,
    expiry_date: Option<String>,
    user_role: String,
) -> Result<String, String> {
    let pool = state.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let expiry = expiry_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

    // توليد باركود داخلي لو الـ barcode فاضي
    let final_barcode = if barcode.trim().is_empty() {
        let max_seq: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 4 FOR 9) AS BIGINT)), 0)
             FROM medicines WHERE barcode LIKE '200%' AND LENGTH(barcode) = 13"
        ).fetch_one(&mut *tx).await.unwrap_or(0);
        let base_12 = format!("200{:09}", max_seq + 1);
        let check_digit: i32 = sqlx::query_scalar("SELECT compute_ean13_check_digit($1)")
            .bind(&base_12).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        format!("{}{}", base_12, check_digit)
    } else {
        barcode.trim().to_string()
    };

    // تحويل الشكل الدوائي للعربي
    let dosage_form_ar = match dosage_form.as_deref() {
        Some("tablet") | Some("comprimé") | Some("comprimé pelliculé") => Some("قرص".to_string()),
        Some("capsule") | Some("gélule") => Some("كبسولة".to_string()),
        Some("syrup") | Some("sirop") | Some("solution buvable") => Some("شراب".to_string()),
        Some("injection") | Some("solution injectable") => Some("حقنة".to_string()),
        Some("cream") | Some("crème") | Some("pommade") => Some("كريم/مرهم".to_string()),
        Some("gel") => Some("جل".to_string()),
        Some("suppository") | Some("suppositoire") => Some("تحميلة".to_string()),
        Some("eye_drops") | Some("collyre") => Some("قطرة عين".to_string()),
        Some("inhaler") | Some("aérosol") => Some("بخاخ".to_string()),
        _ => dosage_form.clone(),
    };

    // اسم عربي (نستخدم الاسم العلمي كاسم عربي مؤقتاً)
    let name_ar = active_ingredient.clone().unwrap_or_else(|| name.clone());

    let row = sqlx::query(
        "INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9) RETURNING id"
    )
    .bind(&name_ar)
    .bind(&name)
    .bind(&active_ingredient)
    .bind(&final_barcode)
    .bind(rust_decimal::Decimal::from_f64(price).ok_or("Invalid price")?)
    .bind(rust_decimal::Decimal::from_f64((price + cost_price) / 2.0).ok_or("Invalid wholesale")?)
    .bind(rust_decimal::Decimal::from_f64(cost_price).ok_or("Invalid cost")?)
    .bind(&batch_number)
    .bind(expiry)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let med_id: uuid::Uuid = row.get(0);

    // إضافة الباركود لـ medicine_barcodes
    let _ = sqlx::query(
        "INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
         VALUES ($1, $2, 'EAN13', 'manufacturer', NOW())
         ON CONFLICT (barcode, barcode_type) DO NOTHING"
    )
    .bind(med_id).bind(&final_barcode)
    .execute(&mut *tx).await;

    // إضافة دفعة مخزون
    if quantity > 0 {
        sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, $2, $3, $4)")
            .bind(med_id).bind(&batch_number).bind(expiry).bind(quantity)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("UPDATE medicines SET quantity = $1 WHERE id = $2")
            .bind(quantity).bind(med_id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // سجل تدقيق
    let desc = format!("إضافة دواء من القاعدة العالمية: {} (باركود: {})", name, final_barcode);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'ADD_MEDICINE_GLOBAL', $2)")
        .bind(&user_role).bind(&desc)
        .execute(&mut *tx).await;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(med_id.to_string())
}
