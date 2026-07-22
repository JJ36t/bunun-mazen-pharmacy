// ========================================
// Enterprise Complete Commands
// ========================================
// Financial Ledger + Quarantine + State Recovery + Historical Pricing +
// Expiry Sales + Feature Flags + System Health

use sqlx::{PgPool, Row};
use serde_json;
use uuid;
use rust_decimal::prelude::FromPrimitive;
use chrono;

// ===== 1. FINANCIAL LEDGER =====

// Phase 6 Fix: record_ledger_entry_inner now accepts a transaction reference
// so callers can wrap multiple entries in a single DB transaction.
// Also adds FOR UPDATE on ledger_accounts to prevent race conditions.
async fn record_ledger_entry_inner(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    transaction_id: uuid::Uuid,
    account_code: &str,
    debit: f64,
    credit: f64,
    description: &str,
    reference_type: &str,
    reference_id: Option<uuid::Uuid>,
    user_role: &str,
) -> Result<(), String> {
    // Phase 6: FOR UPDATE prevents concurrent postings from reading stale balance
    let account = sqlx::query("SELECT id FROM ledger_accounts WHERE account_code = $1 FOR UPDATE")
        .bind(account_code).fetch_one(&mut **tx).await.map_err(|e| e.to_string())?;
    let account_id: uuid::Uuid = account.get(0);
    
    let debit_dec = rust_decimal::Decimal::from_f64(debit).ok_or("Invalid debit")?;
    let credit_dec = rust_decimal::Decimal::from_f64(credit).ok_or("Invalid credit")?;
    
    sqlx::query("INSERT INTO ledger_entries (transaction_id, account_id, debit_amount, credit_amount, description, reference_type, reference_id, user_role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)")
        .bind(transaction_id).bind(account_id)
        .bind(debit_dec).bind(credit_dec)
        .bind(description).bind(reference_type).bind(reference_id).bind(user_role)
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("UPDATE ledger_accounts SET balance = balance + $1 - $2 WHERE id = $3")
        .bind(debit_dec).bind(credit_dec).bind(account_id)
        .execute(&mut **tx).await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn record_ledger_entry_db(state: tauri::State<'_, PgPool>, transaction_id: String, account_code: String, debit: f64, credit: f64, description: String, reference_type: String, reference_id: Option<String>, user_role: String) -> Result<(), String> {
    let tx_id = uuid::Uuid::parse_str(&transaction_id).unwrap_or_else(|_| uuid::Uuid::new_v4());
    let ref_uuid = reference_id.and_then(|s| uuid::Uuid::parse_str(&s).ok());
    // Phase 6: wrap in transaction
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    record_ledger_entry_inner(&mut tx, tx_id, &account_code, debit, credit, &description, &reference_type, ref_uuid, &user_role).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn record_sale_ledger_db(state: tauri::State<'_, PgPool>, invoice_id: String, total_amount: f64, cost_amount: f64, user_role: String) -> Result<(), String> {
    let tx_id = uuid::Uuid::new_v4();
    let inv_uuid = uuid::Uuid::parse_str(&invoice_id).unwrap_or_else(|_| uuid::Uuid::new_v4());
    
    // Phase 6: wrap all 4 entries in a single transaction
    // Previously: 4 separate calls without transaction — single DB hiccup breaks trial balance
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    
    // مدين: الصندوق النقدي (الأصل يزيد)
    record_ledger_entry_inner(&mut tx, tx_id, "1000", total_amount, 0.0, &format!("بيع فاتورة {}", invoice_id), "sale", Some(inv_uuid), &user_role).await?;
    // دائن: المبيعات (الإيراد يزيد)
    record_ledger_entry_inner(&mut tx, tx_id, "4000", 0.0, total_amount, &format!("إيراد مبيعات {}", invoice_id), "sale", Some(inv_uuid), &user_role).await?;
    // مدين: تكلفة البضاعة المباعة
    record_ledger_entry_inner(&mut tx, tx_id, "5000", cost_amount, 0.0, &format!("تكلفة بضاعة مباعة {}", invoice_id), "sale", Some(inv_uuid), &user_role).await?;
    // دائن: المخزون (الأصل ينقص)
    record_ledger_entry_inner(&mut tx, tx_id, "1200", 0.0, cost_amount, &format!("تخفيض مخزون {}", invoice_id), "sale", Some(inv_uuid), &user_role).await?;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_ledger_balance_db(state: tauri::State<'_, PgPool>, account_code: String) -> Result<f64, String> {
    let row = sqlx::query("SELECT balance FROM ledger_accounts WHERE account_code = $1")
        .bind(&account_code).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        Ok(r.get::<rust_decimal::Decimal, _>(0).to_string().parse::<f64>().unwrap_or(0.0))
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub async fn get_ledger_entries_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String, account_code: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(code) = &account_code {
        let row = sqlx::query("SELECT id FROM ledger_accounts WHERE account_code = $1").bind(code).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
        if let Some(r) = row {
            let acc_id: uuid::Uuid = r.get(0);
            sqlx::query("SELECT le.id, le.entry_date, la.account_code, la.account_name, le.debit_amount, le.credit_amount, le.description, le.reference_type, le.user_role FROM ledger_entries le JOIN ledger_accounts la ON le.account_id = la.id WHERE le.entry_date >= $1::timestamp AND le.entry_date <= $2::timestamp AND le.account_id = $3 ORDER BY le.entry_date DESC LIMIT 200")
                .bind(&start_date).bind(&end_date).bind(acc_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
        } else {
            vec![]
        }
    } else {
        sqlx::query("SELECT le.id, le.entry_date, la.account_code, la.account_name, le.debit_amount, le.credit_amount, le.description, le.reference_type, le.user_role FROM ledger_entries le JOIN ledger_accounts la ON le.account_id = la.id WHERE le.entry_date >= $1::timestamp AND le.entry_date <= $2::timestamp ORDER BY le.entry_date DESC LIMIT 200")
            .bind(&start_date).bind(&end_date).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "entryDate": row.get::<chrono::NaiveDateTime, _>(1).to_string(),
            "accountCode": row.get::<String, _>(2),
            "accountName": row.get::<String, _>(3),
            "debit": row.get::<rust_decimal::Decimal, _>(4).to_string().parse::<f64>().unwrap_or(0.0),
            "credit": row.get::<rust_decimal::Decimal, _>(5).to_string().parse::<f64>().unwrap_or(0.0),
            "description": row.get::<Option<String>, _>(6),
            "referenceType": row.get::<Option<String>, _>(7),
            "userRole": row.get::<Option<String>, _>(8),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_trial_balance_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT account_code, account_name, account_type, balance FROM ledger_accounts WHERE is_active = TRUE ORDER BY account_code")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        let balance: rust_decimal::Decimal = row.get(3);
        let balance_f64 = balance.to_string().parse::<f64>().unwrap_or(0.0);
        let account_type: String = row.get(2);

        // Phase 7 Fix: debit/credit split must consider account_type
        // Asset/Expense accounts: positive balance = Debit, negative = Credit
        // Liability/Equity/Revenue accounts: positive balance = Credit, negative = Debit
        let (debit, credit) = if account_type == "asset" || account_type == "expense" {
            if balance_f64 >= 0.0 { (balance_f64, 0.0) } else { (0.0, -balance_f64) }
        } else {
            // liability, equity, revenue
            if balance_f64 >= 0.0 { (0.0, balance_f64) } else { (-balance_f64, 0.0) }
        };

        results.push(serde_json::json!({
            "accountCode": row.get::<String, _>(0),
            "accountName": row.get::<String, _>(1),
            "accountType": account_type,
            "balance": balance_f64,
            "debit": debit,
            "credit": credit,
        }));
    }
    Ok(results)
}

// ===== 2. QUARANTINE SYSTEM =====

#[tauri::command]
pub async fn quarantine_stock_db(state: tauri::State<'_, PgPool>, medicine_id: String, batch_number: Option<String>, quantity: i32, reason: String, notes: String, quarantined_by: String) -> Result<String, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    // Phase 6: wrap INSERT + UPDATE in transaction + FOR UPDATE on medicine
    let mut tx = state.inner().begin().await.map_err(|e| e.to_string())?;
    
    // FOR UPDATE: prevent concurrent modifications during quarantine
    let med_row = sqlx::query("SELECT quantity FROM medicines WHERE id = $1 FOR UPDATE")
        .bind(med_uuid).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let current_qty: i32 = med_row.get(0);
    if current_qty < quantity {
        return Err(format!("الكمية غير كافية للعزل. المتوفر: {}، المطلوب: {}", current_qty, quantity));
    }
    
    let row = sqlx::query("INSERT INTO quarantined_stock (medicine_id, batch_number, quantity, quarantine_reason, notes, quarantined_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id")
        .bind(med_uuid).bind(&batch_number).bind(quantity).bind(&reason).bind(&notes).bind(&quarantined_by)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("UPDATE medicines SET quantity = quantity - $1 WHERE id = $2").bind(quantity).bind(med_uuid)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    let desc = format!("عزل {} وحدة من المخزون (السبب: {})", quantity, reason);
    let _ = sqlx::query("INSERT INTO audit_logs (user_role, action_type, description) VALUES ($1, 'QUARANTINE_STOCK', $2)")
        .bind(&quarantined_by).bind(&desc).execute(&mut *tx).await;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
pub async fn get_quarantined_stock_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT qs.id, m.name_ar, qs.batch_number, qs.quantity, qs.quarantine_reason, qs.quarantine_date, qs.notes, qs.status, qs.resolved_at FROM quarantined_stock qs JOIN medicines m ON qs.medicine_id = m.id WHERE qs.status = 'quarantined' ORDER BY qs.quarantine_date DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "medicineName": row.get::<String, _>(1),
            "batchNumber": row.get::<Option<String>, _>(2),
            "quantity": row.get::<i32, _>(3),
            "reason": row.get::<String, _>(4),
            "quarantineDate": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
            "notes": row.get::<Option<String>, _>(6),
            "status": row.get::<String, _>(7),
            "resolvedAt": row.get::<Option<chrono::NaiveDateTime>, _>(8).map(|d| d.to_string()),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn resolve_quarantine_db(state: tauri::State<'_, PgPool>, quarantine_id: String, resolution: String, notes: String, resolved_by: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&quarantine_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE quarantined_stock SET status = $1, resolved_at = NOW(), resolved_by = $2, resolution_notes = $3 WHERE id = $4")
        .bind(&resolution).bind(&resolved_by).bind(&notes).bind(uuid_id)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    // إذا كان الإصدار "released"، أرجع الكمية للمخزون
    if resolution == "released" {
        let row = sqlx::query("SELECT medicine_id, quantity FROM quarantined_stock WHERE id = $1").bind(uuid_id).fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
        let med_id: uuid::Uuid = row.get(0);
        let qty: i32 = row.get(1);
        sqlx::query("UPDATE medicines SET quantity = quantity + $1 WHERE id = $2").bind(qty).bind(med_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== 3. STATE RECOVERY =====

#[tauri::command]
pub async fn save_draft_session_db(state: tauri::State<'_, PgPool>, session_key: String, session_data: String, user_role: String) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(&session_data).unwrap_or(serde_json::json!({}));
    sqlx::query("INSERT INTO draft_sessions (session_key, session_data, user_role, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (session_key) DO UPDATE SET session_data = $2, user_role = $3, updated_at = NOW(), is_active = TRUE")
        .bind(&session_key).bind(data).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_draft_session_db(state: tauri::State<'_, PgPool>, session_key: String) -> Result<Option<serde_json::Value>, String> {
    let row = sqlx::query("SELECT session_data FROM draft_sessions WHERE session_key = $1 AND is_active = TRUE")
        .bind(&session_key).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        Ok(Some(r.get(0)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn clear_draft_session_db(state: tauri::State<'_, PgPool>, session_key: String) -> Result<(), String> {
    sqlx::query("UPDATE draft_sessions SET is_active = FALSE WHERE session_key = $1")
        .bind(&session_key).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 4. HISTORICAL PRICING =====

#[tauri::command]
pub async fn record_price_change_db(state: tauri::State<'_, PgPool>, medicine_id: String, field_name: String, old_value: f64, new_value: f64, changed_by: String, reason: String) -> Result<(), String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO price_history (medicine_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(med_uuid).bind(&field_name)
        .bind(rust_decimal::Decimal::from_f64(old_value).ok_or("Err")?)
        .bind(rust_decimal::Decimal::from_f64(new_value).ok_or("Err")?)
        .bind(&changed_by).bind(&reason)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_price_history_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<Vec<serde_json::Value>, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT ph.id, ph.field_name, ph.old_value, ph.new_value, ph.change_date, ph.changed_by, ph.reason FROM price_history ph WHERE ph.medicine_id = $1 ORDER BY ph.change_date DESC LIMIT 100")
        .bind(med_uuid).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "fieldName": row.get::<String, _>(1),
            "oldValue": row.get::<Option<rust_decimal::Decimal>, _>(2).map(|d| d.to_string().parse::<f64>().unwrap_or(0.0)),
            "newValue": row.get::<rust_decimal::Decimal, _>(3).to_string().parse::<f64>().unwrap_or(0.0),
            "changeDate": row.get::<chrono::NaiveDateTime, _>(4).to_string(),
            "changedBy": row.get::<Option<String>, _>(5),
            "reason": row.get::<Option<String>, _>(6),
        }));
    }
    Ok(results)
}

// ===== 5. EXPIRY SALES ENGINE =====

#[tauri::command]
pub async fn get_expiry_sale_rules_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, days_until_expiry, discount_percentage, is_active, priority FROM expiry_sale_rules WHERE is_active = TRUE ORDER BY days_until_expiry DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "daysUntilExpiry": row.get::<i32, _>(1),
            "discountPercentage": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "isActive": row.get::<bool, _>(3),
            "priority": row.get::<i32, _>(4),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn calculate_expiry_discount_db(state: tauri::State<'_, PgPool>, medicine_id: String) -> Result<f64, String> {
    let med_uuid = uuid::Uuid::parse_str(&medicine_id).map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT expiry_date FROM medicines WHERE id = $1").bind(med_uuid).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    
    if let Some(r) = row {
        let expiry: Option<chrono::NaiveDate> = r.get(0);
        if let Some(exp) = expiry {
            let now = chrono::Local::now().date_naive();
            let days_until = (exp - now).num_days();
            
            if days_until > 0 {
                // Phase 7 Fix: logic was inverted
                // Old: WHERE days_until_expiry >= $1 ORDER BY days_until_expiry ASC LIMIT 1
                //   This returns the rule with the SMALLEST threshold that is >= current days
                //   e.g. if days=45 and rules are (30→30%, 60→20%, 90→15%):
                //   old query returns 60→20% (smallest >= 45) — WRONG, should give 30% (within 30 days)
                //
                // New: WHERE days_until_expiry <= $1 ORDER BY days_until_expiry DESC LIMIT 1
                //   Returns the rule with the LARGEST threshold that is <= current days
                //   e.g. if days=45: returns 30→30% (largest <= 45) — CORRECT
                let rule_row = sqlx::query("SELECT discount_percentage FROM expiry_sale_rules WHERE is_active = TRUE AND days_until_expiry <= $1 ORDER BY days_until_expiry DESC LIMIT 1")
                    .bind(days_until).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
                
                if let Some(rule) = rule_row {
                    let discount: rust_decimal::Decimal = rule.get(0);
                    return Ok(discount.to_string().parse::<f64>().unwrap_or(0.0));
                }
            }
        }
    }
    Ok(0.0)
}

// ===== 6. FEATURE FLAGS =====

#[tauri::command]
pub async fn get_feature_flags_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, flag_name, display_name, description, is_enabled, category FROM feature_flags ORDER BY category, flag_name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "flagName": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "description": row.get::<Option<String>, _>(3),
            "isEnabled": row.get::<bool, _>(4),
            "category": row.get::<Option<String>, _>(5),
        }));
    }
    Ok(results)
}

#[tauri::command]
pub async fn toggle_feature_flag_db(state: tauri::State<'_, PgPool>, flag_id: String, is_enabled: bool) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&flag_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE feature_flags SET is_enabled = $1, updated_at = NOW() WHERE id = $2")
        .bind(is_enabled).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn check_feature_flag_db(state: tauri::State<'_, PgPool>, flag_name: String) -> Result<bool, String> {
    let result: Option<bool> = sqlx::query_scalar("SELECT is_enabled FROM feature_flags WHERE flag_name = $1")
        .bind(&flag_name).fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(result.unwrap_or(false))
}

// ===== 7. SYSTEM HEALTH =====

#[tauri::command]
pub async fn get_system_health_db(state: tauri::State<'_, PgPool>) -> Result<serde_json::Value, String> {
    // فحص صحة قاعدة البيانات
    let db_check: Option<i64> = sqlx::query_scalar("SELECT 1::BIGINT").fetch_optional(state.inner()).await.ok().flatten();
    let db_healthy = db_check.is_some();

    // عدد الجداول
    let table_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
        .fetch_one(state.inner()).await.unwrap_or(0);

    // Phase 13 Fix: use pg_class.reltuples for approximate counts (1000x faster than COUNT(*))
    let medicines_count: i64 = sqlx::query_scalar(
        "SELECT GREATEST(reltuples, 0)::BIGINT FROM pg_class WHERE relname = 'medicines'"
    ).fetch_one(state.inner()).await.unwrap_or(0);
    let invoices_count: i64 = sqlx::query_scalar(
        "SELECT GREATEST(reltuples, 0)::BIGINT FROM pg_class WHERE relname = 'invoices'"
    ).fetch_one(state.inner()).await.unwrap_or(0);
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT GREATEST(reltuples, 0)::BIGINT FROM pg_class WHERE relname = 'audit_logs'"
    ).fetch_one(state.inner()).await.unwrap_or(0);
    let global_meds_count: i64 = sqlx::query_scalar(
        "SELECT GREATEST(reltuples, 0)::BIGINT FROM pg_class WHERE relname = 'global_medicines'"
    ).fetch_one(state.inner()).await.unwrap_or(0);
    // quarantined is small — COUNT is fine
    let quarantined_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quarantined_stock WHERE status = 'quarantined'").fetch_one(state.inner()).await.unwrap_or(0);

    Ok(serde_json::json!({
        "dbHealthy": db_healthy,
        "tableCount": table_count,
        "medicinesCount": medicines_count,
        "invoicesCount": invoices_count,
        "auditLogsCount": audit_count,
        "globalMedicinesCount": global_meds_count,
        "quarantinedCount": quarantined_count,
        "pendingTasks": 0,
        "unreadNotifications": 0,
        "status": if db_healthy { "healthy" } else { "critical" },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

// ===== 8. BATCH EXCHANGE RATE =====

#[tauri::command]
pub async fn update_batch_exchange_rate_db(state: tauri::State<'_, PgPool>, batch_id: String, purchase_currency: String, exchange_rate: f64, original_cost: Option<f64>) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&batch_id).map_err(|e| e.to_string())?;
    let rate_dec = rust_decimal::Decimal::from_f64(exchange_rate).ok_or("Err")?;
    let cost_dec = original_cost.and_then(|c| rust_decimal::Decimal::from_f64(c));
    let landed = if let Some(cost) = cost_dec {
        Some(cost * rate_dec)
    } else { None };
    
    sqlx::query("UPDATE medicine_batches SET purchase_currency = $1, exchange_rate_at_purchase = $2, original_cost = $3, landed_cost = $4 WHERE id = $5")
        .bind(&purchase_currency).bind(rate_dec).bind(cost_dec).bind(landed).bind(uuid_id)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}
