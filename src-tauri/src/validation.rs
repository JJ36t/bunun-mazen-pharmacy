// ========================================
// Validation — دوال تحقق مركزية
// ========================================
use crate::errors::{AppResult, AppError};

pub fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < 6 {
        return Err(AppError::validation("كلمة المرور يجب أن تكون 6 أحرف على الأقل"));
    }
    Ok(())
}

pub fn validate_username(username: &str) -> AppResult<()> {
    if username.trim().is_empty() {
        return Err(AppError::validation("اسم المستخدم مطلوب"));
    }
    if username.len() < 3 {
        return Err(AppError::validation("اسم المستخدم يجب أن يكون 3 أحرف على الأقل"));
    }
    Ok(())
}

pub fn validate_amount(amount: f64, field_name: &str) -> AppResult<()> {
    if amount.is_nan() || amount.is_infinite() {
        return Err(format!("{} غير صالح", field_name).into());
    }
    if amount < 0.0 {
        return Err(format!("{} لا يمكن أن يكون سالباً", field_name).into());
    }
    Ok(())
}

pub fn validate_quantity(qty: i32) -> AppResult<()> {
    if qty <= 0 {
        return Err(AppError::validation("الكمية يجب أن تكون أكبر من صفر"));
    }
    Ok(())
}

pub fn validate_barcode(barcode: &str) -> AppResult<()> {
    if barcode.is_empty() {
        return Err(AppError::validation("الباركود مطلوب"));
    }
    if !barcode.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::validation("الباركود يجب أن يحتوي على أرقام فقط"));
    }
    Ok(())
}
