// ========================================
// Integration Tests — اختبارات شاملة
// ========================================

#[cfg(test)]
mod validation_tests {
    use crate::validation;

    #[test]
    fn test_password_valid() {
        assert!(validation::validate_password("123456").is_ok());
        assert!(validation::validate_password("StrongP@ss2024!").is_ok());
    }

    #[test]
    fn test_password_too_short() {
        assert!(validation::validate_password("12345").is_err());
        assert!(validation::validate_password("").is_err());
    }

    #[test]
    fn test_username_valid() {
        assert!(validation::validate_username("admin").is_ok());
        assert!(validation::validate_username("cashier1").is_ok());
    }

    #[test]
    fn test_username_too_short() {
        assert!(validation::validate_username("ab").is_err());
        assert!(validation::validate_username("").is_err());
    }

    #[test]
    fn test_amount_valid() {
        assert!(validation::validate_amount(100.0, "المبلغ").is_ok());
        assert!(validation::validate_amount(0.0, "المبلغ").is_ok());
    }

    #[test]
    fn test_amount_negative() {
        assert!(validation::validate_amount(-1.0, "المبلغ").is_err());
    }

    #[test]
    fn test_amount_nan() {
        assert!(validation::validate_amount(f64::NAN, "المبلغ").is_err());
        assert!(validation::validate_amount(f64::INFINITY, "المبلغ").is_err());
    }

    #[test]
    fn test_quantity_valid() {
        assert!(validation::validate_quantity(1).is_ok());
        assert!(validation::validate_quantity(1000).is_ok());
    }

    #[test]
    fn test_quantity_zero_negative() {
        assert!(validation::validate_quantity(0).is_err());
        assert!(validation::validate_quantity(-1).is_err());
    }

    #[test]
    fn test_barcode_valid() {
        assert!(validation::validate_barcode("1234567890123").is_ok());
    }

    #[test]
    fn test_barcode_invalid() {
        assert!(validation::validate_barcode("").is_err());
        assert!(validation::validate_barcode("12A456").is_err());
    }
}

#[cfg(test)]
mod sale_logic_tests {
    use crate::sale_logic::calculate_sale_totals;
    use rust_decimal::Decimal;
    use rust_decimal::prelude::FromPrimitive;

    fn d(n: i64) -> Decimal { Decimal::from(n) }
    fn df(n: f64) -> Decimal { Decimal::from_f64(n).unwrap() }

    #[test]
    fn test_no_discount() {
        let (total, profit, discount) = calculate_sale_totals(d(10000), d(3000), 0.0, None);
        assert_eq!(total, d(10000));
        assert_eq!(profit, d(3000));
        assert_eq!(discount, d(0));
    }

    #[test]
    fn test_percentage_discount() {
        let (total, profit, discount) = calculate_sale_totals(d(10000), d(3000), 10.0, None);
        assert_eq!(discount, d(1000));
        assert_eq!(total, d(9000));
        assert_eq!(profit, d(2000));
    }

    #[test]
    fn test_absolute_discount() {
        let (total, profit, discount) = calculate_sale_totals(d(10000), d(3000), 0.0, Some(1000.0));
        assert_eq!(discount, d(1000));
        assert_eq!(total, d(9000));
        assert_eq!(profit, d(2000));
    }

    #[test]
    fn test_absolute_overrides_percentage() {
        let (total, _, discount) = calculate_sale_totals(d(10000), d(3000), 10.0, Some(500.0));
        assert_eq!(discount, d(500));
        assert_eq!(total, d(9500));
    }

    #[test]
    fn test_negative_discount_ignored() {
        let (total, _, discount) = calculate_sale_totals(d(10000), d(3000), 0.0, Some(-500.0));
        assert_eq!(discount, d(0));
        assert_eq!(total, d(10000));
    }

    #[test]
    fn test_discount_equals_subtotal() {
        let (total, _, discount) = calculate_sale_totals(d(10000), d(3000), 0.0, Some(10000.0));
        assert_eq!(discount, d(10000));
        assert_eq!(total, d(0));
    }

    #[test]
    fn test_zero_subtotal() {
        let (total, _, discount) = calculate_sale_totals(d(0), d(0), 10.0, None);
        assert_eq!(total, d(0));
        assert_eq!(discount, d(0));
    }

    #[test]
    fn test_large_values() {
        let (total, _, discount) = calculate_sale_totals(d(1_000_000), d(300_000), 0.0, Some(100_000.0));
        assert_eq!(discount, d(100_000));
        assert_eq!(total, d(900_000));
    }

    #[test]
    fn test_decimal_precision() {
        let (total, _, discount) = calculate_sale_totals(df(999.99), df(300.0), 0.0, Some(100.0));
        assert_eq!(discount, d(100));
        assert_eq!(total, df(899.99));
    }

    #[test]
    fn test_total_never_exceeds_subtotal() {
        for pct in [0.0, 5.0, 10.0, 50.0, 100.0].iter() {
            let (total, _, _) = calculate_sale_totals(d(10000), d(3000), *pct, None);
            assert!(total <= d(10000));
        }
    }

    #[test]
    fn test_profit_minus_discount() {
        for sub in [1000, 10000, 100000].iter() {
            for prof in [300, 3000, 30000].iter() {
                for disc in [0.0, 100.0, 500.0].iter() {
                    let (_, final_profit, discount) = calculate_sale_totals(d(*sub), d(*prof), 0.0, Some(*disc));
                    assert_eq!(final_profit, d(*prof) - discount);
                }
            }
        }
    }
}

#[cfg(test)]
mod licensing_tests {
    use crate::licensing;

    #[test]
    fn test_device_fingerprint_consistent() {
        let fp1 = licensing::generate_device_fingerprint();
        let fp2 = licensing::generate_device_fingerprint();
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn test_device_fingerprint_hex_uppercase() {
        let fp = licensing::generate_device_fingerprint();
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(fp, fp.to_uppercase());
    }

    #[test]
    fn test_legacy_hmac_invalid_key() {
        assert!(!licensing::legacy::verify_hmac_license("DEVICE", "AAAA-BBBB-CCCC"));
        assert!(!licensing::legacy::verify_hmac_license("DEVICE", ""));
    }

    #[test]
    fn test_keyring_empty_manifest() {
        let manifest = licensing::Manifest {
            version: 1,
            algorithm: "Ed25519".to_string(),
            keys: vec![],
            legacy: licensing::LegacyConfig {
                algorithm: "HMAC-SHA256".to_string(),
                enabled: false,
                comment: None,
            },
        };
        let keyring = licensing::Keyring::from_manifest(manifest);
        assert!(keyring.is_ok());
    }
}

#[cfg(test)]
mod crypto_tests {
    use crate::crypto::{encrypt_data, decrypt_data, derive_aes_key};

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let data = "بيانات سرية للنسخ الاحتياطي";
        let password = "test_password_123";
        let encrypted = encrypt_data(data, password).unwrap();
        let decrypted = decrypt_data(&encrypted, password).unwrap();
        assert_eq!(data, decrypted);
    }

    #[test]
    fn test_wrong_password_fails() {
        let encrypted = encrypt_data("secret", "correct").unwrap();
        assert!(decrypt_data(&encrypted, "wrong").is_err());
    }

    #[test]
    fn test_different_encryptions_differ() {
        let enc1 = encrypt_data("data", "pass").unwrap();
        let enc2 = encrypt_data("data", "pass").unwrap();
        assert_ne!(enc1, enc2);
    }

    #[test]
    fn test_derive_key_deterministic() {
        let salt = [0u8; 16];
        let k1 = derive_aes_key("password", &salt);
        let k2 = derive_aes_key("password", &salt);
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_derive_key_different_passwords() {
        let salt = [0u8; 16];
        assert_ne!(derive_aes_key("p1", &salt), derive_aes_key("p2", &salt));
    }

    #[test]
    fn test_decrypt_invalid_format() {
        assert!(decrypt_data("invalid", "pass").is_err());
        assert!(decrypt_data("", "pass").is_err());
    }
}

#[cfg(test)]
mod errors_tests {
    use crate::errors::AppError;

    #[test]
    fn test_validation_error_serializes() {
        let err = AppError::Validation("test".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("Validation"));
        assert!(json.contains("test"));
    }

    #[test]
    fn test_insufficient_stock_serializes() {
        let err = AppError::InsufficientStock("aspirin".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("InsufficientStock"));
    }

    #[test]
    fn test_unauthorized_serializes() {
        let err = AppError::Unauthorized;
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("Unauthorized"));
    }

    #[test]
    fn test_from_str_unauthorized() {
        let err: AppError = "صلاحية غير كافية".into();
        assert!(matches!(err, AppError::Unauthorized));
    }

    #[test]
    fn test_from_str_insufficient_stock() {
        let err: AppError = "الكمية غير كافية في المخزون".into();
        assert!(matches!(err, AppError::InsufficientStock(_)));
    }

    #[test]
    fn test_from_str_not_found() {
        let err: AppError = "العنصر غير موجود".into();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_app_error_to_string() {
        let err: String = AppError::Validation("test".into()).into();
        assert_eq!(err, "test");
        let err: String = AppError::Unauthorized.into();
        assert_eq!(err, "صلاحية غير كافية");
    }

    #[test]
    fn test_convenience_constructors() {
        assert!(matches!(AppError::db("x"), AppError::Database(_)));
        assert!(matches!(AppError::validation("x"), AppError::Validation(_)));
        assert!(matches!(AppError::not_found("x"), AppError::NotFound(_)));
        assert!(matches!(AppError::internal("x"), AppError::Internal(_)));
        assert!(matches!(AppError::insufficient_stock("x"), AppError::InsufficientStock(_)));
    }
}
