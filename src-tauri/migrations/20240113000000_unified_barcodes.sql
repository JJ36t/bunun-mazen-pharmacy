-- ========================================
-- Migration 13: Unified Barcode System (EAN-13)
-- توحيد جميع الباركودات بصيغة EAN-13 (13 رقم مع checksum)
-- هذه هي الصيغة المستخدمة في جميع الكاشيرات عالمياً
-- ========================================

-- ===== 1. دالة حساب رقم التحقق لـ EAN-13 =====
-- خوارزمية GS1/EAN-13 الرسمية:
-- المواضع الفردية (1, 3, 5, ...) تضرب في 1
-- المواضع الزوجية (2, 4, 6, ...) تضرب في 3
-- رقم التحقق = (10 - (المجموع % 10)) % 10
CREATE OR REPLACE FUNCTION compute_ean13_check_digit(prefix_12 VARCHAR) RETURNS INTEGER AS $$
DECLARE
    total INTEGER := 0;
    i INTEGER;
    digit INTEGER;
    weight INTEGER;
BEGIN
    IF LENGTH(prefix_12) != 12 OR prefix_12 !~ '^[0-9]{12}$' THEN
        RAISE EXCEPTION 'EAN-13 prefix must be exactly 12 digits, got: %', prefix_12;
    END IF;
    FOR i IN 1..12 LOOP
        digit := CAST(SUBSTRING(prefix_12 FROM i FOR 1) AS INTEGER);
        weight := CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END;
        total := total + digit * weight;
    END LOOP;
    RETURN (10 - (total % 10)) % 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===== 2. دالة توليد باركود EAN-13 كامل من 12 رقم =====
CREATE OR REPLACE FUNCTION generate_ean13_barcode(prefix_12 VARCHAR) RETURNS VARCHAR AS $$
DECLARE
    check_digit INTEGER;
BEGIN
    check_digit := compute_ean13_check_digit(prefix_12);
    RETURN prefix_12 || check_digit::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===== 3. دالة التحقق من صحة باركود EAN-13 =====
CREATE OR REPLACE FUNCTION validate_ean13(barcode VARCHAR) RETURNS BOOLEAN AS $$
DECLARE
    expected_check INTEGER;
    actual_check VARCHAR;
    prefix_12 VARCHAR;
BEGIN
    IF LENGTH(barcode) != 13 OR barcode !~ '^[0-9]{13}$' THEN
        RETURN FALSE;
    END IF;
    prefix_12 := SUBSTRING(barcode FROM 1 FOR 12);
    actual_check := SUBSTRING(barcode FROM 13 FOR 1);
    expected_check := compute_ean13_check_digit(prefix_12);
    RETURN actual_check = expected_check::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===== 4. توليد باركود EAN-13 لكل دواء بدون باركود =====
-- استخدام بادئة 200 (مخصصة للاستخدام الداخلي وفق GS1)
-- + 9 أرقام متسلسلة فريدة لكل دواء
DO $$
DECLARE
    med RECORD;
    base_12 VARCHAR;
    full_barcode VARCHAR;
    counter INTEGER := 0;
    seq_num INTEGER;
BEGIN
    -- الحصول على أعلى رقم تسلسلي موجود
    seq_num := 0;
    FOR med IN
        SELECT id, barcode FROM medicines
        WHERE barcode LIKE '200%'
          AND LENGTH(barcode) = 13
          AND is_deleted = FALSE
        ORDER BY barcode DESC
    LOOP
        seq_num := GREATEST(seq_num, CAST(SUBSTRING(med.barcode FROM 4 FOR 9) AS INTEGER));
    END LOOP;

    FOR med IN
        SELECT id FROM medicines
        WHERE (barcode IS NULL OR barcode = '' OR LENGTH(barcode) < 8)
          AND is_deleted = FALSE
    LOOP
        seq_num := seq_num + 1;
        -- 12 رقم: 200 (prefix) + 9 أرقام تسلسلية
        base_12 := '200' || LPAD(seq_num::TEXT, 9, '0');
        full_barcode := generate_ean13_barcode(base_12);

        UPDATE medicines SET barcode = full_barcode WHERE id = med.id;

        -- إدخال في medicine_barcodes أيضاً
        INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
        VALUES (med.id, full_barcode, 'EAN13', 'internal', NOW())
        ON CONFLICT (barcode, barcode_type) DO NOTHING;

        counter := counter + 1;
    END LOOP;
    RAISE NOTICE 'Generated EAN-13 barcodes for % medicines', counter;
END;
$$;

-- ===== 5. مزامنة medicine_barcodes مع medicines.barcode =====
INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
SELECT m.id, m.barcode, 'EAN13',
       CASE WHEN m.barcode LIKE '200%' THEN 'internal' ELSE 'manufacturer' END,
       NOW()
FROM medicines m
WHERE m.barcode IS NOT NULL
  AND m.barcode != ''
  AND m.is_deleted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM medicine_barcodes mb
    WHERE mb.barcode = m.barcode AND mb.medicine_id = m.id
  )
ON CONFLICT (barcode, barcode_type) DO NOTHING;

-- ===== 6. فهارس إضافية لتسريع البحث =====
CREATE INDEX IF NOT EXISTS idx_medicines_barcode_active
    ON medicines (barcode)
    WHERE is_deleted = FALSE AND barcode IS NOT NULL;
