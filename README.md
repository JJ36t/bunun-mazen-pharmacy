# 💊 Bunun Mazen Pharmacy — نظام إدارة الصيدلية

نظام إدارة صيدلية متكامل مبني بأحدث التقنيات مع تركيز على الأمان وسلامة البيانات المالية.

---

## 🚀 التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| **Frontend** | React 19 + TypeScript + Tailwind CSS + Zustand |
| **Backend** | Rust + Tauri 2 |
| **Database** | PostgreSQL 14+ + sqlx (44 migrations) |
| **الأمان** | Ed25519 + AES-256-GCM + PBKDF2 (600k) + bcrypt (cost 12) |
| **الاختبارات** | 43+ Rust unit tests + 12 property tests + Vitest (frontend) |
| **المراقبة** | HTTP /health endpoint + structured logging (tracing) |

---

## ✨ المميزات

### نقاط البيع (POS)
- بيع سريع مع بحث فوري بالباركود والاسم
- دعم خصم مطلق (دينار عراقي) مع حدود يومية لكل كاشير
- معاملات آمنة مع منع خصم المخزون السالب (FOR UPDATE + CHECK)
- idempotency keys لمنع تكرار البيع عند انهيار النظام
- دعم FEFO (First Expiry First Out) للدفعات
- طباعة فواتير حرارية (ESC/POS) مع تشكيل عربي RTL
- فواتير معلقة (Suspend) واسترجاعها
- فحص تفاعلات الأدوية قبل البيع

### المخزون
- إدارة كاملة للأدوية مع باركود EAN-13 تلقائي
- دفعات (Batches) مع تواريخ انتهاء الصلاحية
- جرد دوري مع تتبع الفروقات
- بحث ذكي في الباركودات العالمية (OpenFoodFacts + GS1)
- استيراد جماعي via CSV
- تقارير حركة المخزون

### المحاسبة
- ملخص محاسبي لحظي (مبيعات، أرباح، خصومات، مصاريف، صندوق)
- إغلاق يومي آمن (أرشفة بدل حذف)
- ديون الزبائن مع تتبع السداد
- إدارة الموردين والأرصدة
- مشتريات مع تحديث الأسعار والتكاليف
- دفتر أستاذ مزدوج القيد (Ledger)
- تقارير مفصلة حسب التاريخ والموظف

### الأمان
- مصادقة بـ session tokens مخزّنة كـ SHA-256 hash في قاعدة البيانات (وليست نصاً صريحاً)
- Rate limiting على تسجيل الدخول (5 محاولات/5 دقائق)
- Rate limiting على تفعيل الترخيص (10 محاولات/ساعة)
- Rate limiting على verify_admin_password (5 محاولات/5 دقائق)
- RBAC كامل (8 أدوار، 22 صلاحية)
- سجل تدقيق (Audit Log) على كل عملية حساسة + مشغّل anti-tampering (BEFORE DELETE/UPDATE)
- تشفير AES-256-GCM للنسخ الاحتياطي مع PBKDF2 (600k iterations — OWASP 2023)
- ترخيص Ed25519 غير متماثل مع fallback HMAC للتوافق (gated behind flag)
- كلمات مرور عشوائية عند أول تثبيت مع إجبار التغيير
- XSS prevention في كل تصدير PDF/CSV
- Session sliding expiry (8h) + absolute max lifetime (24h)
- FOR UPDATE row locking في كل العمليات المالية الحرجة
- 30+ CHECK constraints على أعمدة المال/الكمية
- Audit log partitioning شهري (migration 0044)
- 6 FK + 2 UNIQUE constraints على الجداول الحرجة (migration 0036)
- Path traversal protection في save_csv_file
- WebSocket scanner مع rate limiting + idle timeout + message size limit

### البنية التحتية
- 44 migration منظّمة مع auto-recovery آمن (لا يمسح _sqlx_migrations كاملاً)
- Materialized views للتقارير السريعة + refresh عند الإقلاع
- 43+ اختبار وحدة وتكامل (Rust) + 12 property-based test
- Vitest setup + اختبارات MemoryCache و FraudDetector (frontend)
- CI pipeline جاهز (GitHub Actions): lint + build + clippy + security audit
- Pre-release security check script
- API documentation كامل (docs/API.md)
- إدارة ورديات (Shifts) مع موازنة الصندوق
- ماسح باركود لاسلكي via WebSocket (HTTPS/WSS)
- نسخ احتياطي تلقائي يومي مع تدوير (7 نسخ)
- نسخ احتياطي offsite قابل للتهيئة (PHARMACY_OFFSITE_BACKUP_PATH أو settings)
- استعادة نسخ احتياطية لقاعدة البيانات (TRUNCATE قبل الإدراج لمنع خلط البيانات)
- كاش طبقة ذاكرة مع SWR (Stale-While-Revalidate)
- Crash recovery مع circuit breaker + exponential backoff + jitter
- HTTP /health endpoint على localhost:9191 للمراقبة الخارجية
- Structured logging مع tracing-subscriber
- OpenFoodFacts API cache (7-day TTL في قاعدة البيانات)
- توليد Ed25519 keypair تلقائي عند أول إقلاع (لا حاجة لـ cargo run --bin generate_keys)
- عكس الأحرف العربية الصحيح للطابعات الحرارية (initial/medial/final forms)
- Race-safe daily_receipt_number (pg_advisory_xact_lock)

---

## 📦 التثبيت

### المتطلبات
- Node.js 20+
- Rust (stable)
- PostgreSQL 15+
- Tauri 2 prerequisites (WebView2 على Windows)

### التشغيل

```bash
# 1. استنساخ المشروع
git clone https://github.com/JJ36t/bunun-mazen-pharmacy.git
cd bunun-mazen-pharmacy

# 2. تثبيت dependencies
npm install

# 3. ضبط متغيرات البيئة
export PHARMACY_DB_PASSWORD="your_strong_password"

# 4. تشغيل في وضع التطوير
npm run tauri dev
```

### حسابات المستخدمين الافتراضية

> ⚠️ **تنبيه أمني:** كلمات المرور الافتراضية تُولَّد عشوائياً عند أول إقلاع للتطبيق وتُعرض في سجل الإقلاع (stderr). يجب تغييرها فوراً بعد أول تسجيل دخول. لا توجد كلمات مرور ثابتة في الكود.

عند أول تشغيل، سيطبع التطبيق في terminal:
```
========================================
[INIT] Default credentials generated:
[INIT]   admin   : <random_16_chars>
[INIT]   cashier : <random_12_chars>
[INIT] CHANGE THESE IMMEDIATELY after first login!
========================================
```
**سجّل هذه كلمات المرور** ثم غيّرها بعد أول دخول.

---

## 🔑 توليد مفاتيح الإنتاج

### مفتاح التحديثات (Tauri Updater)
```bash
npm run tauri signer generate -- -w ~/.tauri/pharmacy.key
# ضع المفتاح العام في tauri.conf.json → plugins.updater.pubkey
```

### مفتاح الترخيص (Ed25519)
```bash
cd src-tauri
cargo run --bin generate_keys
# ضع المفتاح العام في keys/manifest.json
```

### توليد ترخيص لجهاز
```bash
cargo run --bin generate_license -- --device-id "DEVICE_ID"
```

---

## 🏗️ البناء للإنتاج

```bash
# ضبط متغيرات البيئة
export PHARMACY_DB_PASSWORD="your_strong_password"
export TAURI_PRIVATE_KEY=$(cat ~/.tauri/pharmacy.key)
export TAURI_KEY_PASSWORD="your_key_password"

# البناء
npm run tauri build
```

الملف النهائي: `src-tauri/target/release/bundle/msi/`

---

## 🧪 الاختبارات

```bash
cd src-tauri

# تشغيل كل الاختبارات
cargo test

# اختبارات محددة
cargo test sale_logic
cargo test validation
cargo test crypto
cargo test licensing
cargo test errors
```

---

## 📁 بنية المشروع

```
bunun-mazen-pharmacy/
├── src/                          # Frontend (React)
│   ├── App.tsx                   # التطبيق الرئيسي
│   ├── domains/                  # مجالات الأعمال
│   │   ├── pos/                  # نقاط البيع
│   │   ├── inventory/            # المخزون
│   │   ├── accounting/           # المحاسبة
│   │   ├── security/             # الأمان والمصادقة
│   │   ├── settings/             # الإعدادات
│   │   ├── suppliers/            # الموردون
│   │   ├── reporting/            # التقارير
│   │   ├── intelligence/         # ميزات متقدمة
│   │   └── mobile-scanner/       # ماسح الباركود اللاسلكي
│   ├── lib/                      # مكتبات مساعدة
│   │   ├── core/                 # طبقة核心 (RBAC, crash recovery, cache)
│   │   ├── services/             # طبقة الخدمات
│   │   ├── utils/                # أدوات (PDF, CSV, search, sanitize)
│   │   └── perf/                 # مراقبة الأداء
│   ├── types/                    # أنواع TypeScript مشتركة
│   └── plugins/                  # إضافات (WhatsApp, AI, Cloud Sync)
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── main.rs               # نقطة الدخول + Tauri commands
│   │   ├── errors.rs             # AppError enum موحّد
│   │   ├── sale_logic.rs         # منطق حساب البيع (pure function)
│   │   ├── validation.rs         # دوال تحقق مركزية
│   │   ├── licensing/            # نظام ترخيص Ed25519
│   │   ├── pharmiq_commands.rs   # أوامر PharmIQ
│   │   ├── pharmiq_complete.rs   # ميزات إضافية
│   │   └── mobile_scanner/       # سيرفر WebSocket للموبايل
│   ├── migrations/               # 23 migration
│   ├── keys/                     # manifest.json للمفاتيح
│   └── tests/                    # اختبارات تكامل
├── docs/                         # توثيق
│   └── API.md                    # توثيق كل الأوامر
└── scripts/                      # سكربتات
    └── pre-release-check.sh       # فحص أمني قبل الإصدار
```

---

## 🔒 الأمان

### ما تم تطبيقه
- ✅ bcrypt cost 12 (OWASP recommended)
- ✅ PBKDF2-HMAC-SHA256 (100k iterations) لاشتقاق مفاتيح AES
- ✅ AES-256-GCM للنسخ الاحتياطي
- ✅ Ed25519 للترخيص (غير متماثل)
- ✅ Constant-time comparison للترخيص
- ✅ Session tokens مخزّنة في DB مع انتهاء صلاحية
- ✅ Rate limiting على login + license activation
- ✅ RBAC كامل (8 أدوار، 22 صلاحية)
- ✅ FOR UPDATE لمنع race conditions
- ✅ CHECK constraints على الكميات
- ✅ Soft delete (لا حذف فيزيائي)
- ✅ Audit logs على كل عملية
- ✅ XSS prevention في PDF/CSV
- ✅ CSP مُضبوط في tauri.conf.json
- ✅ TLS للموبايل سكانر (self-signed)
- ✅ 0 `any` في TypeScript (strict typing)
- ✅ Input sanitization

### ما يحتاج إعداد خارجي
- ⚠️ `tauri signer generate` لمفتاح التحديثات
- ⚠️ `cargo run --bin generate_keys` لمفتاح الترخيص
- ⚠️ PHARMACY_DB_PASSWORD كمتغير بيئة

---

## 🏛️ الأنظمة المؤسسية

### 1. طبقة الخدمات (Service Layer)
طبقة وسيطة بين UI و backend تطبق:
- التحقق من الصلاحيات
- التخزين المؤقت (Caching)
- نشر الأحداث (Event Publishing)
- قياس الأداء

### 2. نظام الأحداث (Event Bus)
نشر/اشتراك للأحداث بين المجالات:
```
InvoiceCreated → StockAdjust + AuditLog + DashboardRefresh + PluginNotify
```

### 3. كشف الاحتيال (Fraud Detection)
يرصد تلقائياً:
- الخصومات المرتفعة (> 30%)
- المرتجعات المتكررة (> 5/يوم)
- الحذفات المتتالية (> 10/ساعة)
- النشاط في ساعات متأخرة
- تلاعب المخزون

### 4. استرجاع الأعطال (Crash Recovery)
- تسجيل كل عملية في `operation_journal`
- عند إعادة التشغيل، يسترجع العمليات المعلقة
- يضمن عدم فقدان البيانات عند الانهيار

### 5. النسخ الاحتياطي التلقائي
- نسخ يومي تلقائي (مشفر AES-256)
- تدوير النسخ القديمة (يبقي آخر 7)
- حفظ في مجلد منفصل
- سجل كامل في `backup_history`

### 6. مراقبة الأداء (Performance Monitor)
يقيس:
- وقت البحث (الهدف < 50ms)
- وقت فتح الفاتورة (الهدف < 100ms)
- وقت بدء التشغيل (الهدف < 3s)
- استهلاك الذاكرة

### 7. طابور المهام (Task Queue)
يمنع تجميد الواجهة عبر:
- الاستيرادات الكبيرة
- توليد التقارير
- النسخ الاحتياطية
- التحليلات

---

## 🔒 الأمان والترخيص

### نظام الترخيص
- **بصمة الجهاز** (Device Fingerprint) - مرتبطة بـ CPU + Hostname
- **Ed25519** للتحقق غير المتماثل من المفاتيح (النظام الأساسي)
- **HMAC-SHA256** للتوافق مع الإصدارات القديمة (قابل للتعطيل)
- **مقارنة آمنة** بـ `subtle::ConstantTimeEq`

### مكافحة القرصنة
- الترخيص مرتبط بالجهاز
- المفاتيح الخاصة لا تُرفع مع الكود (.gitignore)
- `legacy.enabled` flag للتحكم في التوافق مع الإصدارات القديمة

### تشفير البيانات
- كلمات المرور: `bcrypt` (cost 12 — مطابق لتوصيات OWASP)
- النسخ الاحتياطية: `AES-256-GCM` مع `PBKDF2-HMAC-SHA256` (100,000 تكرار)
- الاتصال بـ DB: `rustls` (TLS)

---

## 📊 إحصائيات المشروع

| المقياس | القيمة |
|---------|--------|
| أسطر Rust | ~7,000 |
| أسطر TypeScript | ~10,400 |
| Tauri commands | 84+ |
| Database tables | 54+ |
| Migrations | 38 |
| Unit/Integration tests | 18+ |
| TypeScript interfaces | 21 |
| أوامر تفرض session verification | 43/84 |
| CHECK constraints | 30+ |
| Foreign Key constraints | 20+ |
| Indexes | 30+ |

---

## 📄 الترخيص

حقوق الطبع محفوظة © 2026 Bunun Mazen Pharmacy
