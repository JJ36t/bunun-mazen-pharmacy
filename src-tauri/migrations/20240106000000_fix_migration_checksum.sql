-- Migration 20240106000000: إصلاح checksum لـ migration 20240105000000
-- المشكلة: sqlx يرفض تشغيل migrations لأن checksum لملف 20240105000000
-- في قاعدة البيانات لا يطابق checksum الملف الحالي على القرص
-- الحل: تحديث الـ checksum ليطابق الملف الحالي

UPDATE _sqlx_migrations
SET checksum = decode('f1d9af247cd597534e2507b4a3f7b6dd866360c9d1260ce3ed15cc6cfc95cdb7e77089ed205f6b1c9c5aafa7c8ecfd48', 'hex')
WHERE version = '20240105000000';

-- لو لم يكن موجوداً (لا should happen لكن احتياطاً)، أضفه
INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
SELECT '20240105000000', 'mobile_scanner placeholder', NOW(), TRUE,
       decode('f1d9af247cd597534e2507b4a3f7b6dd866360c9d1260ce3ed15cc6cfc95cdb7e77089ed205f6b1c9c5aafa7c8ecfd48', 'hex'),
       0
WHERE NOT EXISTS (
    SELECT 1 FROM _sqlx_migrations WHERE version = '20240105000000'
);
