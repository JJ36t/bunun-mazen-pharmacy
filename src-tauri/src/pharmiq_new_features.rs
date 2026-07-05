// ========================================
// Discount + User Visibility + Stock Count Features
// ========================================

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;

// ===== 1. DISCOUNT SYSTEM (IQD with daily limit) =====

/// الحصول على حد الخصم اليومي للكاشير
#[tauri::command]
pub async fn get_discount_limit_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<serde_json::Value, String> {
    let max_amount: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'max_discount_amount'")
        .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let max_val: f64 = max_amount.and_then(|s| s.parse().ok()).unwrap_or(1000.0);

    // ما استخدمه اليوم
    let today_used: Option<rust_decimal::Decimal> = sqlx::query_scalar(
        "SELECT total_used FROM daily_discount_usage WHERE user_role = $1 AND usage_date = CURRENT_DATE"
    )
    .bind(&user_role).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let used: f64 = today_used.map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);
    let remaining = (max_val - used).max(0.0);

    Ok(serde_json::json!({
        "maxAmount": max_val,
        "usedToday": used,
        "remaining": remaining,
    }))
}

/// التحقق من الخصم قبل البيع
#[tauri::command]
pub async fn check_discount_db(state: tauri::State<'_, PgPool>, user_role: String, discount_amount: f64) -> Result<serde_json::Value, String> {
    let limit_info = get_discount_limit_db_inner(state.inner(), &user_role).await?;
    let remaining = limit_info["remaining"].as_f64().unwrap_or(0.0);

    if discount_amount > remaining {
        return Ok(serde_json::json!({
            "allowed": false,
            "remaining": remaining,
            "message": format!("الخصم يتجاوز الحد المتبقي اليوم ({:.0} د.ع). راجع المدير.", remaining),
        }));
    }

    Ok(serde_json::json!({
        "allowed": true,
        "remaining": remaining,
    }))
}

/// خصم مدير (يتجاوز الحد)
#[tauri::command]
pub async fn admin_override_discount_db(state: tauri::State<'_, PgPool>, password: String, discount_amount: f64, user_role: String) -> Result<bool, String> {
    // تحقق من كلمة مرور المدير
    let row = sqlx::query("SELECT password FROM users WHERE role = 'Super Admin' AND is_active = TRUE AND deleted_at IS NULL LIMIT 1")
        .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let admin_pass: String = row.ok_or("لا يوجد حساب مدير عام")?.get(0);
    if !bcrypt::verify(&password, &admin_pass).unwrap_or(false) {
        return Err("كلمة مرور المدير غير صحيحة".to_string());
    }
    Ok(true)
}

async fn get_discount_limit_db_inner(pool: &PgPool, user_role: &str) -> Result<serde_json::Value, String> {
    let max_amount: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'max_discount_amount'")
        .fetch_optional(pool).await.map_err(|e| e.to_string())?;
    let max_val: f64 = max_amount.and_then(|s| s.parse().ok()).unwrap_or(1000.0);

    let today_used: Option<rust_decimal::Decimal> = sqlx::query_scalar(
        "SELECT total_used FROM daily_discount_usage WHERE user_role = $1 AND usage_date = CURRENT_DATE"
    )
    .bind(user_role).fetch_optional(pool).await.map_err(|e| e.to_string())?;
    let used: f64 = today_used.map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);

    Ok(serde_json::json!({
        "maxAmount": max_val,
        "usedToday": used,
        "remaining": (max_val - used).max(0.0),
    }))
}

/// تسجيل استخدام الخصم (يُستدعى بعد record_sale_db)
#[tauri::command]
pub async fn record_discount_usage_db(state: tauri::State<'_, PgPool>, user_role: String, amount: f64) -> Result<(), String> {
    let amount_dec = rust_decimal::Decimal::from_f64(amount).ok_or("Invalid amount")?;
    sqlx::query(
        "INSERT INTO daily_discount_usage (user_role, usage_date, total_used)
         VALUES ($1, CURRENT_DATE, $2)
         ON CONFLICT (user_role, usage_date)
         DO UPDATE SET total_used = daily_discount_usage.total_used + $2"
    )
    .bind(&user_role).bind(amount_dec)
    .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 2. USER VISIBILITY (hide admins from non-admins) =====

/// تعديل بيانات المستخدم الخاصة (الاسم، اسم المستخدم، كلمة المرور)
#[tauri::command]
pub async fn update_own_profile_db(
    state: tauri::State<'_, PgPool>,
    user_id: String,
    new_username: Option<String>,
    new_password: Option<String>,
    current_password: String,
) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?;

    // تحقق من كلمة المرور الحالية
    let row = sqlx::query("SELECT password FROM users WHERE id = $1 AND deleted_at IS NULL")
        .bind(uuid_id).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    let current_hashed: String = row.ok_or("المستخدم غير موجود")?.get(0);
    if !bcrypt::verify(&current_password, &current_hashed).unwrap_or(false) {
        return Err("كلمة المرور الحالية غير صحيحة".to_string());
    }

    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;

    if let Some(username) = &new_username {
        if !username.trim().is_empty() {
            sqlx::query("UPDATE users SET username = $1 WHERE id = $2")
                .bind(username.trim()).bind(uuid_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    if let Some(password) = &new_password {
        if !password.trim().is_empty() {
            let hashed = bcrypt::hash(password, 8).map_err(|e| e.to_string())?;
            sqlx::query("UPDATE users SET password = $1 WHERE id = $2")
                .bind(hashed).bind(uuid_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 3. STOCK COUNT FEATURES =====

/// إنشاء جرد جزئي (بفئة معينة أو أدوية مختارة)
#[tauri::command]
pub async fn create_partial_stock_count_db(
    state: tauri::State<'_, PgPool>,
    count_type: String,
    category_filter: Option<String>,
    medicine_ids_json: Option<String>,
    started_by: String,
) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO stock_counts (count_type, started_by) VALUES ($1, $2) RETURNING id")
        .bind(&count_type).bind(&started_by)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    let count_id: uuid::Uuid = row.get(0);

    // إنشاء عناصر الجرد بناءً على الفلتر
    let items_query = if let Some(ids_json) = medicine_ids_json {
        let ids: Vec<String> = serde_json::from_str(&ids_json).map_err(|e| e.to_string())?;
        let mut query = String::from("SELECT id, quantity FROM medicines WHERE is_deleted = FALSE AND id = ANY($1)");
        // نفذها بشكل منفصل
        for id_str in &ids {
            if let Ok(id) = uuid::Uuid::parse_str(id_str) {
                sqlx::query("INSERT INTO stock_count_items (stock_count_id, medicine_id, expected_quantity) SELECT $1, id, quantity FROM medicines WHERE id = $2 AND is_deleted = FALSE ON CONFLICT DO NOTHING")
                    .bind(count_id).bind(id)
                    .execute(state.inner()).await.map_err(|e| e.to_string())?;
            }
        }
        return Ok(count_id.to_string());
    } else if let Some(category) = &category_filter {
        format!("SELECT id, quantity FROM medicines WHERE is_deleted = FALSE AND name_ar ILIKE '%{}%'", category)
    } else {
        "SELECT id, quantity FROM medicines WHERE is_deleted = FALSE".to_string()
    };

    // للفلتر بالفئة أو جرد كامل
    let items = sqlx::query(&items_query).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    for item in items {
        let med_id: uuid::Uuid = item.get(0);
        let expected: i32 = item.get(1);
        sqlx::query("INSERT INTO stock_count_items (stock_count_id, medicine_id, expected_quantity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
            .bind(count_id).bind(med_id).bind(expected)
            .execute(state.inner()).await.map_err(|e| e.to_string())?;
    }

    Ok(count_id.to_string())
}

/// الحصول على عناصر الجرد
#[tauri::command]
pub async fn get_stock_count_items_db(state: tauri::State<'_, PgPool>, count_id: String) -> Result<Vec<serde_json::Value>, String> {
    let count_uuid = uuid::Uuid::parse_str(&count_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        "SELECT sci.id, sci.medicine_id, m.name_ar, m.barcode, sci.expected_quantity, sci.counted_quantity, sci.notes
         FROM stock_count_items sci
         JOIN medicines m ON sci.medicine_id = m.id
         WHERE sci.stock_count_id = $1
         ORDER BY m.name_ar"
    )
    .bind(count_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for r in rows {
        let expected: i32 = r.get(3);
        let counted: Option<i32> = r.get(4);
        let difference = counted.map(|c| c - expected).unwrap_or(0);
        results.push(serde_json::json!({
            "id": r.get::<uuid::Uuid, _>(0).to_string(),
            "medicineId": r.get::<uuid::Uuid, _>(1).to_string(),
            "nameAr": r.get::<String, _>(2),
            "barcode": r.get::<Option<String>, _>(3),
            "expectedQuantity": expected,
            "countedQuantity": counted,
            "difference": difference,
            "notes": r.get::<Option<String>, _>(5),
        }));
    }
    Ok(results)
}

/// تسجيل سبب الفرق للصنف في الجرد
#[tauri::command]
pub async fn set_stock_count_item_reason_db(
    state: tauri::State<'_, PgPool>,
    item_id: String,
    counted_quantity: i32,
    reason: String,
) -> Result<(), String> {
    let item_uuid = uuid::Uuid::parse_str(&item_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE stock_count_items SET counted_quantity = $1, notes = $2 WHERE id = $3")
        .bind(counted_quantity).bind(&reason).bind(item_uuid)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// تقرير الجرد بعد الإكمال
#[tauri::command]
pub async fn get_stock_count_report_db(state: tauri::State<'_, PgPool>, count_id: String) -> Result<serde_json::Value, String> {
    let count_uuid = uuid::Uuid::parse_str(&count_id).map_err(|e| e.to_string())?;

    let row = sqlx::query(
        "SELECT
            COUNT(*) as total_items,
            COUNT(CASE WHEN counted_quantity IS NOT NULL THEN 1 END) as counted_items,
            COUNT(CASE WHEN counted_quantity IS NOT NULL AND counted_quantity != expected_quantity THEN 1 END) as items_with_diff,
            COUNT(CASE WHEN counted_quantity IS NOT NULL AND counted_quantity > expected_quantity THEN 1 END) as items_surplus,
            COUNT(CASE WHEN counted_quantity IS NOT NULL AND counted_quantity < expected_quantity THEN 1 END) as items_shortage
         FROM stock_count_items WHERE stock_count_id = $1"
    )
    .bind(count_uuid)
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "totalItems": row.get::<i64, _>(0),
        "countedItems": row.get::<i64, _>(1),
        "itemsWithDiff": row.get::<i64, _>(2),
        "itemsSurplus": row.get::<i64, _>(3),
        "itemsShortage": row.get::<i64, _>(4),
    }))
}
