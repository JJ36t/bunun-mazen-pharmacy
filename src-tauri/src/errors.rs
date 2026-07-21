// ========================================
// AppError — Enterprise Error Architecture
// ========================================
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("خطأ قاعدة البيانات: {0}")]
    Database(String),
    #[error("المخزون غير كافٍ: {0}")]
    InsufficientStock(String),
    #[error("صلاحية غير كافية")]
    Unauthorized,
    #[error("جلسة غير صالحة. يرجى إعادة تسجيل الدخول.")]
    InvalidSession,
    #[error("مدخلات غير صالحة: {0}")]
    Validation(String),
    #[error("العنصر غير موجود: {0}")]
    NotFound(String),
    #[error("خطأ داخلي: {0}")]
    Internal(String),
    #[error("خطأ تشفير: {0}")]
    Crypto(String),
    #[error("خطأ في الملفات: {0}")]
    Io(String),
    #[error("خطأ تحويل: {0}")]
    Parse(String),
    #[error("خطأ الماسح: {0}")]
    Scanner(String),
    #[error("خطأ الترخيص: {0}")]
    License(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound("السجل غير موجود".into()),
            sqlx::Error::Database(ref db_err) => {
                let msg = db_err.message().to_string();
                if msg.contains("chk_quantity_nonneg") || msg.contains("chk_batch_qty_nonneg") {
                    AppError::InsufficientStock("الكمية لا يمكن أن تكون سالبة".into())
                } else if msg.contains("unique") || msg.contains("duplicate") {
                    AppError::Validation(format!("قيمة مكررة: {}", msg))
                } else if msg.contains("foreign key") {
                    AppError::Validation(format!("مرجع غير موجود: {}", msg))
                } else {
                    AppError::Database(msg)
                }
            }
            sqlx::Error::PoolTimedOut => AppError::Database("انتهت مهلة الاتصال بقاعدة البيانات".into()),
            _ => AppError::Database(e.to_string()),
        }
    }
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(e: sqlx::migrate::MigrateError) -> Self {
        AppError::Database(format!("Migration: {}", e))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { AppError::Parse(format!("JSON: {}", e)) }
}

impl From<uuid::Error> for AppError {
    fn from(e: uuid::Error) -> Self { AppError::Parse(format!("UUID: {}", e)) }
}

impl From<bcrypt::BcryptError> for AppError {
    fn from(e: bcrypt::BcryptError) -> Self { AppError::Crypto(format!("bcrypt: {}", e)) }
}

impl From<chrono::ParseError> for AppError {
    fn from(e: chrono::ParseError) -> Self { AppError::Parse(format!("التاريخ: {}", e)) }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
}

impl From<std::num::ParseFloatError> for AppError {
    fn from(e: std::num::ParseFloatError) -> Self { AppError::Parse(format!("رقم: {}", e)) }
}

impl From<std::num::ParseIntError> for AppError {
    fn from(e: std::num::ParseIntError) -> Self { AppError::Parse(format!("رقم صحيح: {}", e)) }
}

impl From<std::str::Utf8Error> for AppError {
    fn from(e: std::str::Utf8Error) -> Self { AppError::Parse(format!("UTF-8: {}", e)) }
}

impl From<std::string::FromUtf8Error> for AppError {
    fn from(e: std::string::FromUtf8Error) -> Self { AppError::Parse(format!("UTF-8: {}", e)) }
}

impl From<rust_decimal::Error> for AppError {
    fn from(e: rust_decimal::Error) -> Self { AppError::Parse(format!("Decimal: {}", e)) }
}

impl From<ring::error::KeyRejected> for AppError {
    fn from(e: ring::error::KeyRejected) -> Self { AppError::Crypto(format!("مفتاح مرفوض: {}", e)) }
}

impl From<ring::error::Unspecified> for AppError {
    fn from(_: ring::error::Unspecified) -> Self { AppError::Crypto("عملية تشفير فشلت".into()) }
}

impl From<base64::DecodeError> for AppError {
    fn from(e: base64::DecodeError) -> Self { AppError::Parse(format!("Base64: {}", e)) }
}

impl From<hex::FromHexError> for AppError {
    fn from(e: hex::FromHexError) -> Self { AppError::Parse(format!("Hex: {}", e)) }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self { AppError::Scanner(format!("HTTP: {}", e)) }
}

impl From<aes_gcm::Error> for AppError {
    fn from(e: aes_gcm::Error) -> Self { AppError::Crypto(format!("AES-GCM: {}", e)) }
}

impl From<tokio_tungstenite::tungstenite::Error> for AppError {
    fn from(e: tokio_tungstenite::tungstenite::Error) -> Self { AppError::Scanner(format!("WebSocket: {}", e)) }
}

impl From<qrcode::types::QrError> for AppError {
    fn from(e: qrcode::types::QrError) -> Self { AppError::Internal(format!("QR: {}", e)) }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        // Check InsufficientStock first (more specific than Unauthorized)
        if (s.contains("الكمية") && s.contains("كاف")) || s.contains("غير كاف") {
            AppError::InsufficientStock(s.into())
        } else if s.contains("صلاحية") || s.contains("غير كافية") {
            AppError::Unauthorized
        } else if s.contains("غير موجود") || s.contains("لا يوجد") {
            AppError::NotFound(s.into())
        } else {
            AppError::Validation(s.into())
        }
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self { s.as_str().into() }
}

impl From<(String, String)> for AppError {
    fn from((kind, msg): (String, String)) -> Self {
        match kind.as_str() {
            "db" => AppError::Database(msg),
            "validation" => AppError::Validation(msg),
            "not_found" => AppError::NotFound(msg),
            _ => AppError::Internal(msg),
        }
    }
}

impl AppError {
    pub fn db(msg: impl Into<String>) -> Self { AppError::Database(msg.into()) }
    pub fn validation(msg: impl Into<String>) -> Self { AppError::Validation(msg.into()) }
    pub fn not_found(msg: impl Into<String>) -> Self { AppError::NotFound(msg.into()) }
    pub fn internal(msg: impl Into<String>) -> Self { AppError::Internal(msg.into()) }
    pub fn insufficient_stock(msg: impl Into<String>) -> Self { AppError::InsufficientStock(msg.into()) }
}

// Implement From<AppError> for String so existing code that returns Result<T, String> still works
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        match e {
            AppError::Database(msg) => msg,
            AppError::InsufficientStock(msg) => msg,
            AppError::Unauthorized => "صلاحية غير كافية".to_string(),
            AppError::InvalidSession => "جلسة غير صالحة. يرجى إعادة تسجيل الدخول.".to_string(),
            AppError::Validation(msg) => msg,
            AppError::NotFound(msg) => msg,
            AppError::Internal(msg) => msg,
            AppError::Crypto(msg) => msg,
            AppError::Io(msg) => msg,
            AppError::Parse(msg) => msg,
            AppError::Scanner(msg) => msg,
            AppError::License(msg) => msg,
        }
    }
}
