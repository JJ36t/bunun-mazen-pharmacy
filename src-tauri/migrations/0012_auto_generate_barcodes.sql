-- ========================================
-- Migration 0012: توليد باركودات EAN-13 تلقائياً للأدوية بدون باركود
-- ========================================
-- صيدلية بنين مازن
-- المشكلة: المستخدم لديه 3000 دواء بدون باركود، فعندما يمسح أي دواء لا يُعثر عليه
-- الحل: نولّد باركود EAN-13 صالح (prefix 200 = استخدام داخلي حسب GS1) لكل دواء بدون باركود
-- بهذا يمكن للمستخدم طباعة الملصقات ومسحها لاحقاً
-- ========================================

-- ===== 1. تأكد من وجود دالة compute_ean13_check_digit =====
-- (موجودة من migration 0001، نعيد تعريفها هنا بأمان لو لم تكن موجودة)
CREATE OR REPLACE FUNCTION compute_ean13_check_digit(prefix_12 VARCHAR) RETURNS INTEGER AS $$
DECLARE
    total INTEGER := 0;
    i INTEGER;
    digit INTEGER;
    weight INTEGER;
BEGIN
    IF LENGTH(prefix_12) != 12 OR prefix_12 !~ '^[0-9]{12}$' THEN
        RETURN -1;
    END IF;
    FOR i IN 1..12 LOOP
        digit := CAST(SUBSTRING(prefix_12 FROM i FOR 1) AS INTEGER);
        weight := CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END;
        total := total + digit * weight;
    END LOOP;
    RETURN (10 - (total % 10)) % 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===== 2. توليد باركود EAN-13 صالح لكل دواء بدون باركود =====
-- نستخدم prefix 200 (محجوز للاستخدام الداخلي في GS1) + 9 خانات تسلسلية + check digit
-- مثال: 2000000000017, 2000000000024, ...
DO $$
DECLARE
    med RECORD;
    base_seq BIGINT := 0;
    base_12 VARCHAR;
    check_digit INTEGER;
    final_barcode VARCHAR;
    current_max BIGINT;
BEGIN
    -- ابحث عن أعلى رقم تسلسلي مستخدم في باركودات 200xxxxxxxxx
    SELECT COALESCE(MAX(CAST(SUBSTRING(barcode FROM 4 FOR 9) AS BIGINT)), 0)
    INTO current_max
    FROM medicines
    WHERE barcode LIKE '200%' AND LENGTH(barcode) = 13
      AND SUBSTRING(barcode FROM 4 FOR 9) ~ '^[0-9]{9}$';

    base_seq := current_max;

    -- اكرر على كل دواء بدون باركود (أو بباركود فارغ)
    FOR med IN
        SELECT id FROM medicines
        WHERE (barcode IS NULL OR barcode = '' OR LENGTH(TRIM(barcode)) = 0)
          AND is_deleted = FALSE
        ORDER BY created_at
    LOOP
        base_seq := base_seq + 1;
        base_12 := '200' || LPAD(base_seq::TEXT, 9, '0');
        check_digit := compute_ean13_check_digit(base_12);

        IF check_digit >= 0 THEN
            final_barcode := base_12 || check_digit::TEXT;

            -- حدّث باركود الدواء
            UPDATE medicines SET barcode = final_barcode, updated_at = NOW()
            WHERE id = med.id AND (barcode IS NULL OR barcode = '');

            -- أضف الباركود لجدول medicine_barcodes (الموحد)
            INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, normalized_barcode, is_primary, source, learned_at)
            VALUES (med.id, final_barcode, 'EAN13', 'internal', final_barcode, TRUE, 'auto_generated', NOW())
            ON CONFLICT (barcode, barcode_type) DO NOTHING;
        END IF;
    END LOOP;

    RAISE NOTICE 'تم توليد الباركودات. آخر تسلسل: %', base_seq;
END $$;

-- ===== 3. إعادة بناء normalized_barcode لكل الباركودات الموجودة =====
UPDATE medicine_barcodes
SET normalized_barcode = barcode
WHERE normalized_barcode IS NULL AND barcode IS NOT NULL;

-- ===== 4. التحقق =====
DO $$
DECLARE
    total_meds INTEGER;
    with_barcode INTEGER;
    without_barcode INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_meds FROM medicines WHERE is_deleted = FALSE;
    SELECT COUNT(*) INTO with_barcode FROM medicines WHERE is_deleted = FALSE AND barcode IS NOT NULL AND barcode != '';
    SELECT COUNT(*) INTO without_barcode FROM medicines WHERE is_deleted = FALSE AND (barcode IS NULL OR barcode = '');

    RAISE NOTICE '===== إحصائيات الباركودات =====';
    RAISE NOTICE 'إجمالي الأدوية: %', total_meds;
    RAISE NOTICE 'أدوية بباركود: %', with_barcode;
    RAISE NOTICE 'أدوية بدون باركود: %', without_barcode;
END $$;
