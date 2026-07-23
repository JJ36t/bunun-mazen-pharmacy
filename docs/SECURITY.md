# 🔒 دليل الأمان — Bunun Mazen Pharmacy

## نظرة عامة

هذا الدليل يوضح الإجراءات الأمنية المطبقة في النظام والمتطلبات للنشر الإنتاجي.

## المصادقة

### كلمات المرور
- **الخوارزمية:** bcrypt (cost 12 — مطابق لتوصيات OWASP)
- **الحد الأدنى:** 6 أحرف (ينصح بـ 8+ للأمان الإنتاجي)
- **كلمات المرور الافتراضية:** تُولَّد عشوائياً عند أول إقلاع وتُعرض في stderr
- **must_change_password:** يُضبط TRUE للمستخدمين الافتراضيين (يجب تغييرها بعد أول دخول)

### الجلسات (Sessions)
- **التوكن:** UUID v4 (122 bits entropy)
- **الانتهاء التفاعلي:** 8 ساعات (يُمدَّد مع كل نشاط)
- **الانتهاء المطلق:** 24 ساعة (لا يُمدَّد — يلغي الجلسة إجبارياً)
- **التنظيف:** الجلسات المنتهية تُعطَّل تلقائياً عند كل إقلاع
- **تسجيل الخروج:** يُعطّل الجلسة فوراً في قاعدة البيانات

### Rate Limiting
- **تسجيل الدخول:** 5 محاولات فاشلة / 5 دقائق / username
- **verify_admin_password:** 5 محاولات فاشلة / 5 دقائق
- **WebSocket pairing:** محاولة واحدة / 2 ثانية / IP

## التفويض (RBAC)

### الأدوار (8)
| الدور | الصلاحيات |
|------|----------|
| Super Admin | الكل |
| Pharmacy Owner | الكل ما عدا system.users |
| Branch Manager | POS + Inventory + Accounting + Reports |
| Pharmacist | POS + Inventory view + Reports + Patients |
| Cashier | POS فقط |
| Inventory Manager | Inventory + Reports |
| Accountant | Accounting + Reports |
| Technical Support | View + Audit + Settings |

## الترخيص

### Ed25519 (النظام الأساسي)
- توقيع غير متماثل بمفتاح عام/خاص
- المفتاح الخاص يجب أن يُولَّد محلياً ولا يُرفع مع الكود
- `keys/manifest.json` يحتوي المفتاح العام فقط

### HMAC Legacy (للتوافق)
- قابل للتعطيل عبر `legacy.enabled = false` في manifest
- يُنصح بالتعطيل بعد هجرة جميع التراخيص إلى Ed25519

## النسخ الاحتياطي

### التشفير
- **الخوارزمية:** AES-256-GCM
- **مفتاح الاشتقاق:** PBKDF2-HMAC-SHA256 (100,000 تكرار)
- **Salt:** 16 بايت عشوائي لكل نسخة
- **Nonce:** 12 بايت عشوائي لكل نسخة

### كلمة مرور النسخ التلقائي
- تُخزَّن في `~/.local/share/BununMazenPharmacy/.backup_key`
- صلاحيات 0600 على Unix
- **ينصح:** نقلها إلى OS keyring في الإنتاج

## WebSocket (الماسح الضوئي)

### الأمان
- يرتبط بـ IP محدد (وليس 0.0.0.0)
- CORS محدود بنفس الأصل
- رسائل scan تتطلب pairing صالح أولاً
- Rate limiting على محاولات الإقتران
- التحقق من طول الباركود (حد أقصى 64 حرف)

## سجل التدقيق

### الحماية
- Triggers تمنع DELETE و UPDATE على `audit_logs`
- كل عملية حساسة تُسجَّل مع user_role + timestamp
- user_role يُشتق من الجلسة (وليس من العميل)

## متغيرات البيئة المطلوبة

| المتغير | الوصف | الإلزامية |
|---------|------|-----------|
| `PHARMACY_DB_PASSWORD` | كلمة مرور PostgreSQL | إلزامي في release |
| `PHARMACY_DB_USER` | مستخدم PostgreSQL | اختياري (default: postgres) |
| `PHARMACY_DB_HOST` | خادم PostgreSQL | اختياري (default: localhost) |
| `PHARMACY_DB_PORT` | منفذ PostgreSQL | اختياري (default: 5432) |

## قبل النشر الإنتاجي

1. ✅ توليد مفتاح Ed25519: `cargo run --bin generate_keys`
2. ✅ إضافة المفتاح العام إلى `keys/manifest.json`
3. ✅ ضبط `legacy.enabled = false` في manifest
4. ✅ توليد مفتاح updater: `npm run tauri signer generate`
5. ✅ ضبط pubkey في `tauri.conf.json`
6. ✅ ضبط `PHARMACY_DB_PASSWORD` كمتغير بيئة
7. ✅ تغيير كلمات المرور الافتراضية فوراً
8. ✅ التأكد من أن `.backup_key` محمي بصلاحيات 0600
