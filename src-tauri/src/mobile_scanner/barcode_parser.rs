// Barcode Parser — تطبيع واكتشاف نوع الباركود

/// تطبيع الباركود (إزالة الأصفار الزائدة، توحيد NDC، إلخ)
pub fn normalize_barcode(barcode: &str) -> String {
    let cleaned: String = barcode.chars().filter(|c| c.is_digit(10)).collect();

    // EAN-13 / GTIN-13 — اترك كما هو
    if cleaned.len() == 13 {
        return cleaned;
    }

    // GTIN-14 — احذف أول رقم (indicator)
    if cleaned.len() == 14 {
        return cleaned[1..].to_string();
    }

    // UPC-A (12 رقم) — أضف 0 في البداية
    if cleaned.len() == 12 {
        return format!("0{}", cleaned);
    }

    // NDC (10-11 رقم) — أضف 3 في البداية (NDC prefix)
    if cleaned.len() == 10 || cleaned.len() == 11 {
        return format!("3{}", cleaned);
    }

    cleaned
}

/// اكتشاف نوع الباركود
pub fn detect_barcode_type(barcode: &str) -> String {
    let cleaned: String = barcode.chars().filter(|c| c.is_digit(10)).collect();

    match cleaned.len() {
        13 => {
            if cleaned.starts_with("34009") {
                "CIP13".to_string()
            } else if cleaned.starts_with("200") {
                "INTERNAL".to_string()
            } else if cleaned.starts_with("999") {
                "WHO_EML".to_string()
            } else if cleaned.starts_with("3") {
                "NDC_NORMALIZED".to_string()
            } else {
                "EAN13".to_string()
            }
        }
        14 => "GTIN14".to_string(),
        12 => "UPC".to_string(),
        10 | 11 => "NDC".to_string(),
        _ if cleaned.starts_with("BNN") => "INTERNAL_CODE".to_string(),
        _ => "UNKNOWN".to_string(),
    }
}

/// التحقق من صحة EAN-13 checksum
pub fn validate_ean13(barcode: &str) -> bool {
    if barcode.len() != 13 || !barcode.chars().all(|c| c.is_digit(10)) {
        return false;
    }
    let digits: Vec<u32> = barcode.chars().map(|c| c.to_digit(10).unwrap()).collect();
    let sum: u32 = digits[..12].iter().enumerate()
        .map(|(i, d)| d * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    let check = (10 - (sum % 10)) % 10;
    check == digits[12]
}
