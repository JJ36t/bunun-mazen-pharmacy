// ========================================
// Invoices Dashboard Commands
// ========================================
// فواتير شاملة مع ترقيم يومي + حذف + تعديل + طباعة

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use chrono;

#[tauri::command]
pub async fn get_all_invoices_with_details_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, user_filter: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = if user_filter == "all" {
        sqlx::query("SELECT i.id, i.daily_receipt_number, i.total_amount, i.profit_amount, i.user_role, i.created_at, i.printed_by, i.printed_at, i.is_reversed FROM invoices i WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date ORDER BY i.created_at DESC LIMIT 500")
            .bind(&start_date).bind(&end_date).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT i.id, i.daily_receipt_number, i.total_amount, i.profit_amount, i.user_role, i.created_at, i.printed_by, i.printed_at, i.is_reversed FROM invoices i WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date AND i.user_role = $3 ORDER BY i.created_at DESC LIMIT 500")
            .bind(&start_date).bind(&end_date).bind(&user_filter).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    
    let mut results = Vec::new();
    for row in rows {
        let inv_id: uuid::Uuid = row.get(0);
        let items = sqlx::query("SELECT name_ar, quantity, price FROM invoice_items WHERE invoice_id = $1")
            .bind(inv_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
        let mut items_list = Vec::new();
        for ir in items {
            items_list.push(serde_json::json!({
                "name": ir.get::<String, _>(0),
                "qty": ir.get::<i32, _>(1),
                "price": ir.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            }));
        }
        results.push(serde_json::json!({
            "id": inv_id.to_string(),
            "dailyReceiptNumber": row.get::<Option<i32>, _>(1).unwrap_or(0),
            "totalAmount": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "profitAmount": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
            "userRole": row.get::<Option<String>, _>(4).unwrap_or_else(|| "N/A".to_string()),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
            "printedBy": row.get::<Option<String>, _>(6),
            "printedAt": row.get::<Option<chrono::NaiveDateTime>, _>(7).map(|d| d.to_string()),
            "isReversed": row.get::<bool, _>(8),
            "items": items_list,
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn delete_invoice_db(state: tauri::State<'_, PgPool>, invoice_id: String, user_role: String) -> Result<(), String> {
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    
    // إرجاع الكميات للمخزون + للدفعات (FIFO) إذا كانت فاتورة بيع
    let items = sqlx::query("SELECT medicine_id, quantity FROM invoice_items WHERE invoice_id = $1")
        .bind(inv_uuid).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    
    let inv_row = sqlx::query("SELECT total_amount FROM invoices WHERE id = $1").bind(inv_uuid).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let total: rust_decimal::Decimal = inv_row.get(0);
    
    // إذا كانت فاتورة بيع (موجبة)، أرجع الكميات للدفعات FIFO (الأقرب انتهاءً أولاً)
    if total > rust_decimal::Decimal::ZERO {
        for item in items {
            let med_id: uuid::Uuid = item.get(0);
            let qty: i32 = item.get(1);
            // إرجاع للدفعات: الأقرب انتهاءً أولاً (FEFO) حتى نستوعب الكمية
            let batches = sqlx::query("SELECT id, quantity FROM medicine_batches WHERE medicine_id = $1 ORDER BY expiry_date ASC")
                .bind(med_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
            let mut remaining = qty;
            for batch in batches {
                if remaining <= 0 { break; }
                let batch_id: uuid::Uuid = batch.get(0);
                sqlx::query("UPDATE medicine_batches SET quantity = quantity + $1 WHERE id = $2")
                    .bind(remaining).bind(batch_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                remaining = 0; // وضع كل الكمية في أول دفعة متاحة
            }
            // إذا لم توجد دفعات، أنشئ واحدة جديدة
            if remaining > 0 {
                let med_data = sqlx::query("SELECT batch_number, expiry_date FROM medicines WHERE id = $1").bind(med_id).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
                let bn: Option<String> = med_data.get(0);
                let ed: Option<chrono::NaiveDate> = med_data.get(1);
                sqlx::query("INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity) VALUES ($1, $2, $3, $4)")
                    .bind(med_id).bind(bn).bind(ed).bind(remaining).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }
            // تحديث إجمالي كمية الدواء
            sqlx::query("UPDATE medicines SET quantity = quantity + $1 WHERE id = $2").bind(qty).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    } else if total < rust_decimal::Decimal::ZERO {
        // فاتورة مرتجع (سالبة): نطرح الكميات من المخزون + الدفعات FIFO
        for item in items {
            let med_id: uuid::Uuid = item.get(0);
            let qty: i32 = item.get(1);
            // طرح من الدفعات FIFO (الأقدم انتهاءً أولاً)
            let batches = sqlx::query("SELECT id, quantity FROM medicine_batches WHERE medicine_id = $1 AND quantity > 0 ORDER BY expiry_date ASC")
                .bind(med_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
            let mut remaining = qty;
            for batch in batches {
                if remaining <= 0 { break; }
                let batch_id: uuid::Uuid = batch.get(0);
                let batch_qty: i32 = batch.get(1);
                let deduct = std::cmp::min(batch_qty, remaining);
                sqlx::query("UPDATE medicine_batches SET quantity = quantity - $1 WHERE id = $2")
                    .bind(deduct).bind(batch_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                remaining -= deduct;
            }
            sqlx::query("UPDATE medicines SET quantity = quantity - $1 WHERE id = $2").bind(qty).bind(med_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }
    
    sqlx::query("DELETE FROM invoice_items WHERE invoice_id = $1").bind(inv_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM invoices WHERE id = $1").bind(inv_uuid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    let desc = format!("حذف فاتورة {}", invoice_id);
    sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'DELETE_INVOICE', $2)")
        .bind(&user_role).bind(&desc).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn mark_invoice_printed_db(state: tauri::State<'_, PgPool>, invoice_id: String, printed_by: String) -> Result<(), String> {
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE invoices SET printed_by = $1, printed_at = NOW() WHERE id = $2")
        .bind(&printed_by).bind(inv_uuid).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_daily_receipt_stats_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    // استخدم CURRENT_DATE من PostgreSQL لضمان التوافق مع get_daily_receipt_number()
    // التي تستخدم CURRENT_DATE أيضاً — هذا يمنع اختلاف التوقيت بين التطبيق وقاعدة البيانات
    let row = sqlx::query(
        "SELECT
            COUNT(*)::BIGINT,
            COALESCE(SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE 0 END), 0),
            COALESCE(MAX(daily_receipt_number), 0)::BIGINT,
            COALESCE(MAX(daily_receipt_number), 0)::BIGINT + 1
         FROM invoices
         WHERE created_at::date = CURRENT_DATE"
    )
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    let count: i64 = row.get(0);
    let total: rust_decimal::Decimal = row.get(1);
    let last_num: i64 = row.get(2);
    let next_num: i64 = row.get(3);
    let total_f64 = total.to_string().parse::<f64>().unwrap_or(0.0);

    Ok(serde_json::json!({
        "todayCount": count,
        "todayTotal": total_f64,
        "lastReceiptNumber": last_num,
        "nextReceiptNumber": next_num,
    }))
}
