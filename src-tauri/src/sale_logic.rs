// ========================================
// Sale Logic — Pure Function for Sale Calculations
// ========================================
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;

/// دالة نقية لحساب الإجمالي النهائي والربح بعد الخصم
pub fn calculate_sale_totals(
    subtotal: Decimal,
    total_profit: Decimal,
    discount_percentage: f64,
    discount_amount_param: Option<f64>,
) -> (Decimal, Decimal, Decimal) {
    let discount_factor = Decimal::from_f64(discount_percentage).unwrap_or(Decimal::ZERO)
        / Decimal::from(100);

    let discount_amount = match discount_amount_param {
        Some(amt) if amt > 0.0 => {
            Decimal::from_f64(amt).unwrap_or(subtotal * discount_factor)
        }
        _ => subtotal * discount_factor,
    };

    let final_total = subtotal - discount_amount;
    let final_profit = total_profit - discount_amount;

    (final_total, final_profit, discount_amount)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_percentage_discount_10_percent() {
        let (total, profit, discount) = calculate_sale_totals(d(10000), d(3000), 10.0, None);
        assert_eq!(discount, d(1000));
        assert_eq!(total, d(9000));
        assert_eq!(profit, d(2000));
    }

    #[test]
    fn test_absolute_discount_1000() {
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
}
