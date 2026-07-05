-- ========================================
-- Database Reset Script — صيدلية بنين مازن
-- ========================================
-- هذا السكربت يحذف قاعدة البيانات بالكامل ويعيد إنشائها
-- استخدمه قبل تشغيل التطبيق بعد إعادة الهيكلة
-- ========================================
-- ⚠️  تحذير: هذا السكربت يحذف كل البيانات!
-- ⚠️  تأكد من عمل نسخة احتياطية أولاً (pg_dump) إن لزم الأمر
-- ========================================

-- تنفيذ في pgAdmin → Query Tool على قاعدة "pharmacy_db"
-- أو تنفيذ في psql:
--   psql -U postgres -d pharmacy_db -f reset_database.sql

-- ===== 1. حذف كل الجداول والـ sequences والدوال =====
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ===== 2. حذف جدول sqlx_migrations (سيُعاد إنشاؤه تلقائياً) =====
-- تم حذفه مع DROP SCHEMA

-- ===== 3. إعادة تعيين الـ extensions اللازمة =====
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== 4. التحقق =====
SELECT 'Database reset complete. Now run: npm run tauri dev' AS message;
SELECT 'The app will auto-create all tables via migrations.' AS next_step;
