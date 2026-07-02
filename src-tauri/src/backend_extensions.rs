// ========================================
// Rust Backend Extensions
// ========================================
// ملف يضاف لنهاية main.rs يحتوي على جميع الأوامر الجديدة

// ملاحظة: هذا الملف يُستخدم كمرجع للأوامر التي يجب إضافتها لـ main.rs
// الأوامر المطلوب إضافتها:

/*

// ===== 1. Session Management =====
#[tauri::command]
async fn start_session_db(state: tauri::State<'_, PgPool>, user_id: String, username: String, device_info: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO user_sessions (user_id, username, device_info, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id")
        .bind(uuid::Uuid::parse_str(&user_id).map_err(|e| e.to_string())?)
        .bind(&username).bind(&device_info)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn end_session_db(state: tauri::State<'_, PgPool>, session_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&session_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE user_sessions SET is_active = FALSE, logout_at = NOW() WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_session_activity_db(state: tauri::State<'_, PgPool>, session_id: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&session_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE user_sessions SET last_activity = NOW() WHERE id = $1")
        .bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_active_sessions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, username, login_at, last_activity, device_info FROM user_sessions WHERE is_active = TRUE ORDER BY last_activity DESC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "username": row.get::<String, _>(1),
            "loginAt": row.get::<chrono::NaiveDateTime, _>(2).to_string(),
            "lastActivity": row.get::<chrono::NaiveDateTime, _>(3).to_string(),
            "deviceInfo": row.get::<String, _>(4),
        }));
    }
    Ok(sessions)
}

// ===== 2. Fraud Detection =====
#[tauri::command]
async fn create_fraud_alert_db(state: tauri::State<'_, PgPool>, alert_type: String, severity: String, user_role: String, description: String, related_id: Option<String>, metadata: String) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO fraud_alerts (alert_type, severity, user_role, description, related_id, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id")
        .bind(&alert_type).bind(&severity).bind(&user_role).bind(&description)
        .bind(related_id).bind(metadata)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_fraud_alerts_db(state: tauri::State<'_, PgPool>, unresolved_only: bool) -> Result<Vec<serde_json::Value>, String> {
    let rows = if unresolved_only {
        sqlx::query("SELECT id, alert_type, severity, user_role, description, related_id, metadata, is_resolved, created_at FROM fraud_alerts WHERE is_resolved = FALSE ORDER BY created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, alert_type, severity, user_role, description, related_id, metadata, is_resolved, created_at FROM fraud_alerts ORDER BY created_at DESC LIMIT 100")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut alerts = Vec::new();
    for row in rows {
        alerts.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "alertType": row.get::<String, _>(1),
            "severity": row.get::<String, _>(2),
            "userRole": row.get::<String, _>(3),
            "description": row.get::<String, _>(4),
            "relatedId": row.get::<Option<String>, _>(5),
            "metadata": row.get::<Option<String>, _>(6),
            "isResolved": row.get::<bool, _>(7),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(8).to_string(),
        }));
    }
    Ok(alerts)
}

#[tauri::command]
async fn resolve_fraud_alert_db(state: tauri::State<'_, PgPool>, alert_id: String, resolved_by: String) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&alert_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE fraud_alerts SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW() WHERE id = $2")
        .bind(&resolved_by).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 3. Plugin Management =====
#[tauri::command]
async fn get_plugins_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, version, description, is_enabled, config, installed_at FROM plugins ORDER BY installed_at")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut plugins = Vec::new();
    for row in rows {
        plugins.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "version": row.get::<String, _>(3),
            "description": row.get::<Option<String>, _>(4),
            "isEnabled": row.get::<bool, _>(5),
            "config": row.get::<Option<serde_json::Value>, _>(6),
            "installedAt": row.get::<chrono::NaiveDateTime, _>(7).to_string(),
        }));
    }
    Ok(plugins)
}

#[tauri::command]
async fn toggle_plugin_db(state: tauri::State<'_, PgPool>, plugin_id: String, is_enabled: bool) -> Result<(), String> {
    let uuid_id = uuid::Uuid::parse_str(&plugin_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE plugins SET is_enabled = $1, updated_at = NOW() WHERE id = $2")
        .bind(is_enabled).bind(uuid_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 4. Crash Recovery Journal =====
#[tauri::command]
async fn create_journal_entry_db(state: tauri::State<'_, PgPool>, operation_type: String, operation_id: String, payload: String, user_role: String) -> Result<(), String> {
    sqlx::query("INSERT INTO operation_journal (operation_type, operation_id, payload, user_role, status) VALUES ($1, $2, $3, $4, 'pending')")
        .bind(&operation_type).bind(&operation_id).bind(&payload).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn complete_journal_entry_db(state: tauri::State<'_, PgPool>, operation_id: String) -> Result<(), String> {
    sqlx::query("UPDATE operation_journal SET status = 'completed', completed_at = NOW() WHERE operation_id = $1")
        .bind(&operation_id).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn fail_journal_entry_db(state: tauri::State<'_, PgPool>, operation_id: String, error_message: String) -> Result<(), String> {
    sqlx::query("UPDATE operation_journal SET status = 'failed', completed_at = NOW(), error_message = $2 WHERE operation_id = $1")
        .bind(&operation_id).bind(&error_message).execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_pending_journal_entries_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, operation_type, operation_id, payload, user_role, started_at FROM operation_journal WHERE status = 'pending' ORDER BY started_at ASC")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "operation_type": row.get::<String, _>(1),
            "operation_id": row.get::<String, _>(2),
            "payload": row.get::<String, _>(3),
            "user_role": row.get::<String, _>(4),
            "started_at": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
        }));
    }
    Ok(entries)
}

// ===== 5. Print Queue =====
#[tauri::command]
async fn create_print_job_db(state: tauri::State<'_, PgPool>, job_type: String, printer_name: String, content: String, related_invoice_id: Option<String>) -> Result<String, String> {
    let row = sqlx::query("INSERT INTO print_jobs (job_type, printer_name, content, related_invoice_id, status) VALUES ($1, $2, $3, $4, 'queued') RETURNING id")
        .bind(&job_type).bind(&printer_name).bind(&content).bind(related_invoice_id)
        .fetch_one(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(row.get::<uuid::Uuid, _>(0).to_string())
}

#[tauri::command]
async fn get_print_jobs_db(state: tauri::State<'_, PgPool>, status_filter: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(status) = status_filter {
        sqlx::query("SELECT id, job_type, printer_name, status, retry_count, error_message, created_at FROM print_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT 50")
            .bind(&status).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, job_type, printer_name, status, retry_count, error_message, created_at FROM print_jobs ORDER BY created_at DESC LIMIT 50")
            .fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "jobType": row.get::<String, _>(1),
            "printerName": row.get::<String, _>(2),
            "status": row.get::<String, _>(3),
            "retryCount": row.get::<i32, _>(4),
            "errorMessage": row.get::<Option<String>, _>(5),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(6).to_string(),
        }));
    }
    Ok(jobs)
}

// ===== 6. Backup History =====
#[tauri::command]
async fn get_backup_history_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, backup_type, file_path, file_size, status, error_message, user_role, created_at FROM backup_history ORDER BY created_at DESC LIMIT 50")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut history = Vec::new();
    for row in rows {
        history.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "backupType": row.get::<String, _>(1),
            "filePath": row.get::<String, _>(2),
            "fileSize": row.get::<Option<i64>, _>(3),
            "status": row.get::<String, _>(4),
            "errorMessage": row.get::<Option<String>, _>(5),
            "userRole": row.get::<Option<String>, _>(6),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(7).to_string(),
        }));
    }
    Ok(history)
}

#[tauri::command]
async fn record_backup_history_db(state: tauri::State<'_, PgPool>, backup_type: String, file_path: String, file_size: i64, status: String, error_message: Option<String>, user_role: String) -> Result<(), String> {
    sqlx::query("INSERT INTO backup_history (backup_type, file_path, file_size, status, error_message, user_role) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(&backup_type).bind(&file_path).bind(file_size).bind(&status).bind(error_message).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 7. Auto-Backup (with rotation) =====
#[tauri::command]
async fn create_auto_backup_db(state: tauri::State<'_, PgPool>, user_role: String) -> Result<String, String> {
    // جمع البيانات
    let medicines = sqlx::query("SELECT * FROM medicines WHERE is_deleted = FALSE").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let invoices = sqlx::query("SELECT * FROM invoices").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let expenses = sqlx::query("SELECT * FROM expenses").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let settings = sqlx::query("SELECT * FROM settings").fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let backup_data = serde_json::json!({
        "backupDate": chrono::Utc::now().to_rfc3339(),
        "version": "2.3.0",
        "medicines_count": medicines.len(),
        "invoices_count": invoices.len(),
        "expenses_count": expenses.len(),
        "settings_count": settings.len(),
    }).to_string();
    
    // تشفير وحفظ (نفس منطق create_backup)
    let password = "AUTO_BACKUP_2024_BUNUN_MAZEN"; // كلمة مرور ثابتة للنسخ التلقائي
    let encrypted = encrypt_data(&backup_data, password)?;
    
    let desktop_dir = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let backup_dir = format!("{}\\Desktop\\PharmacyBackups", desktop_dir);
    std::fs::create_dir_all(&backup_dir).ok();
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let path = format!("{}\\auto_backup_{}.enc", backup_dir, timestamp);
    
    std::fs::write(&path, encrypted_data.as_bytes()).map_err(|e| e.to_string())?;
    
    // تدوير النسخ القديمة (إبقاء آخر 7 نسخ فقط)
    let mut backups: Vec<_> = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("auto_backup_"))
        .collect();
    backups.sort_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()));
    
    while backups.len() > 7 {
        if let Some(old) = backups.first() {
            let _ = std::fs::remove_file(old.path());
            backups.remove(0);
        } else {
            break;
        }
    }
    
    // تسجيل في التاريخ
    let file_size = std::fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
    sqlx::query("INSERT INTO backup_history (backup_type, file_path, file_size, status, user_role) VALUES ('auto', $1, $2, 'success', $3)")
        .bind(&path).bind(file_size).bind(&user_role)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    // تحديث آخر نسخة احتياطية
    sqlx::query("INSERT INTO settings (key, value) VALUES ('last_backup', $1) ON CONFLICT (key) DO UPDATE SET value = $1")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    
    Ok(path)
}

// ===== 8. RBAC - Roles & Permissions =====
#[tauri::command]
async fn get_roles_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, description, is_system FROM roles ORDER BY name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut roles = Vec::new();
    for row in rows {
        roles.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "description": row.get::<Option<String>, _>(3),
            "isSystem": row.get::<bool, _>(4),
        }));
    }
    Ok(roles)
}

#[tauri::command]
async fn get_permissions_db(state: tauri::State<'_, PgPool>) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("SELECT id, name, display_name, category FROM permissions ORDER BY category, name")
        .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut perms = Vec::new();
    for row in rows {
        perms.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "name": row.get::<String, _>(1),
            "displayName": row.get::<String, _>(2),
            "category": row.get::<String, _>(3),
        }));
    }
    Ok(perms)
}

#[tauri::command]
async fn get_role_permissions_db(state: tauri::State<'_, PgPool>, role_id: String) -> Result<Vec<String>, String> {
    let uuid_id = uuid::Uuid::parse_str(&role_id).map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = $1")
        .bind(uuid_id).fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    let mut perms = Vec::new();
    for row in rows {
        perms.push(row.get::<String, _>(0));
    }
    Ok(perms)
}

#[tauri::command]
async fn check_permission_db(state: tauri::State<'_, PgPool>, username: String, permission_name: String) -> Result<bool, String> {
    let result: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.id JOIN role_permissions rp ON r.id = rp.role_id JOIN permissions p ON rp.permission_id = p.id WHERE u.username = $1 AND p.name = $2 AND u.is_active = TRUE"
    )
    .bind(&username).bind(&permission_name)
    .fetch_optional(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(result.unwrap_or(0) > 0)
}

// ===== 9. Performance Metrics =====
#[tauri::command]
async fn record_performance_metric_db(state: tauri::State<'_, PgPool>, metric_name: String, metric_value: f64, unit: String, context: Option<String>) -> Result<(), String> {
    sqlx::query("INSERT INTO performance_metrics (metric_name, metric_value, unit, context) VALUES ($1, $2, $3, $4)")
        .bind(&metric_name).bind(metric_value).bind(&unit).bind(context)
        .execute(state.inner()).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_performance_metrics_db(state: tauri::State<'_, PgPool>, metric_name: Option<String>, limit: i64) -> Result<Vec<serde_json::Value>, String> {
    let rows = if let Some(name) = metric_name {
        sqlx::query("SELECT id, metric_name, metric_value, unit, context, created_at FROM performance_metrics WHERE metric_name = $1 ORDER BY created_at DESC LIMIT $2")
            .bind(&name).bind(limit).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, metric_name, metric_value, unit, context, created_at FROM performance_metrics ORDER BY created_at DESC LIMIT $1")
            .bind(limit).fetch_all(state.inner()).await.map_err(|e| e.to_string())?
    };
    let mut metrics = Vec::new();
    for row in rows {
        metrics.push(serde_json::json!({
            "id": row.get::<uuid::Uuid, _>(0).to_string(),
            "metricName": row.get::<String, _>(1),
            "metricValue": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "unit": row.get::<String, _>(3),
            "context": row.get::<Option<String>, _>(4),
            "createdAt": row.get::<chrono::NaiveDateTime, _>(5).to_string(),
        }));
    }
    Ok(metrics)
}

// ===== 10. Additional Reports =====
#[tauri::command]
async fn get_inventory_movement_report_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String) -> Result<Vec<serde_json::Value>, String> {
    // حركة المخزون: المبيعات + المرتجعات + المشتريات
    let rows = sqlx::query("
        SELECT m.name_ar, m.barcode,
            COALESCE(sold.qty, 0) as sold_qty,
            COALESCE(refunded.qty, 0) as refunded_qty,
            COALESCE(purchased.qty, 0) as purchased_qty,
            m.quantity as current_qty
        FROM medicines m
        LEFT JOIN (
            SELECT ii.medicine_id, SUM(ii.quantity) as qty
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date AND i.total_amount > 0
            GROUP BY ii.medicine_id
        ) sold ON m.id = sold.medicine_id
        LEFT JOIN (
            SELECT ii.medicine_id, SUM(ii.quantity) as qty
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date AND i.total_amount < 0
            GROUP BY ii.medicine_id
        ) refunded ON m.id = refunded.medicine_id
        LEFT JOIN (
            SELECT medicine_id, SUM(quantity) as qty
            FROM medicine_batches
            WHERE created_at::date >= $1::date AND created_at::date <= $2::date
            GROUP BY medicine_id
        ) purchased ON m.id = purchased.medicine_id
        WHERE m.is_deleted = FALSE
        ORDER BY sold_qty DESC NULLS LAST
    ").bind(&start_date).bind(&end_date)
    .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "nameAr": row.get::<String, _>(0),
            "barcode": row.get::<Option<String>, _>(1),
            "soldQty": row.get::<i64, _>(2),
            "refundedQty": row.get::<i64, _>(3),
            "purchasedQty": row.get::<i64, _>(4),
            "currentQty": row.get::<i32, _>(5),
        }));
    }
    Ok(results)
}

#[tauri::command]
async fn get_supplier_report_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("
        SELECT s.name, s.phone, s.balance,
            COUNT(DISTINCT mb.id) as batch_count,
            COALESCE(SUM(mb.quantity), 0) as total_purchased
        FROM suppliers s
        LEFT JOIN medicine_batches mb ON mb.medicine_id IN (SELECT id FROM medicines) 
            AND mb.created_at::date >= $1::date AND mb.created_at::date <= $2::date
        GROUP BY s.id, s.name, s.phone, s.balance
        ORDER BY total_purchased DESC
    ").bind(&start_date).bind(&end_date)
    .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "name": row.get::<String, _>(0),
            "phone": row.get::<Option<String>, _>(1),
            "balance": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "batchCount": row.get::<i64, _>(3),
            "totalPurchased": row.get::<i64, _>(4),
        }));
    }
    Ok(results)
}

#[tauri::command]
async fn get_cashier_report_db(state: tauri::State<'_, PgPool>, start_date: String, end_date: String) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query("
        SELECT i.user_role,
            COUNT(i.id) as invoice_count,
            COALESCE(SUM(i.total_amount), 0) as total_sales,
            COALESCE(SUM(CASE WHEN i.total_amount < 0 THEN 1 ELSE 0 END), 0) as refund_count,
            COALESCE(SUM(i.profit_amount), 0) as total_profit
        FROM invoices i
        WHERE i.created_at::date >= $1::date AND i.created_at::date <= $2::date
        GROUP BY i.user_role
        ORDER BY total_sales DESC
    ").bind(&start_date).bind(&end_date)
    .fetch_all(state.inner()).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(serde_json::json!({
            "userRole": row.get::<Option<String>, _>(0).unwrap_or_else(|| "N/A".to_string()),
            "invoiceCount": row.get::<i64, _>(1),
            "totalSales": row.get::<rust_decimal::Decimal, _>(2).to_string().parse::<f64>().unwrap_or(0.0),
            "refundCount": row.get::<i64, _>(3),
            "totalProfit": row.get::<rust_decimal::Decimal, _>(4).to_string().parse::<f64>().unwrap_or(0.0),
        }));
    }
    Ok(results)
}

// ===== إضافة هذه للأوامر المسجّلة في main() =====
// تضاف لقائمة invoke_handler:
// start_session_db, end_session_db, update_session_activity_db, get_active_sessions_db,
// create_fraud_alert_db, get_fraud_alerts_db, resolve_fraud_alert_db,
// get_plugins_db, toggle_plugin_db,
// create_journal_entry_db, complete_journal_entry_db, fail_journal_entry_db, get_pending_journal_entries_db,
// create_print_job_db, get_print_jobs_db,
// get_backup_history_db, record_backup_history_db, create_auto_backup_db,
// get_roles_db, get_permissions_db, get_role_permissions_db, check_permission_db,
// record_performance_metric_db, get_performance_metrics_db,
// get_inventory_movement_report_db, get_supplier_report_db, get_cashier_report_db

*/
