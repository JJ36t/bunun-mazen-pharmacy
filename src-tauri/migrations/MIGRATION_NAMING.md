# Migration Naming Convention
# ========================================
# الملفات الحالية تستخدم خليط من نمطين:
#   0001_initial_schema.sql ... 0023_fix_discount_limit.sql (sequential)
#   20240105000000_mobile_scanner.sql ... 20240113000000_unified_barcodes.sql (timestamp)
#
# المعيار الموصى به من sqlx: طابع زمني كامل YYYYMMDDHHMMSS
#
# للمشروع الحالي: الأسماء الحالية تعمل لأن الترتيب الأبجدي يضمن التنفيذ.
# لا تغيّر الأسماء الموجودة لأن ذلك سيكسر جدول _sqlx_migrations.
#
# للإصدارات المستقبلية (إلزامي):
#   20260712120000_new_feature.sql
#   20260712130000_another_change.sql
#
# فحص آلي: python3 scripts/check_migration_naming.py
