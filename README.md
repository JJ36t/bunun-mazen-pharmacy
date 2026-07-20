# 💊 Bunun Mazen Pharmacy — نظام إدارة الصيدلية

نظام إدارة صيدلية متكامل مبني بأحدث التقنيات مع تركيز على الأمان وسلامة البيانات المالية.

---

## 🚀 التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| **Frontend** | React 19 + TypeScript + Tailwind CSS + Zustand |
| **Backend** | Rust + Tauri 2 |
| **Database** | PostgreSQL + sqlx |
| **الأمان** | Ed25519 + AES-256-GCM + PBKDF2 + bcrypt |
| **الاختبارات** | 43+ Rust unit/integration tests |

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
- مصادقة بـ session tokens مخزّنة في قاعدة البيانات
- Rate limiting على تسجيل الدخول (5 محاولات/5 دقائق)
- Rate limiting على تفعيل الترخيص (10 محاولات/ساعة)
- RBAC كامل (8 أدوار، 22 صلاحية)
- سجل تدقيق (Audit Log) على كل عملية حساسة
- تشفير AES-256-GCM للنسخ الاحتياطي مع PBKDF2 (100k iterations)
- ترخيص Ed25519 غير متماثل مع fallback HMAC للتوافق
- كلمات مرور عشوائية عند أول تثبيت مع إجبار التغيير
- XSS prevention في كل تصدير PDF/CSV

### البنية التحتية
- 23 migration منظّمة مع auto-recovery
- Materialized views للتقارير السريعة
- 43+ اختبار وحدة وتكامل
- CI pipeline جاهز (GitHub Actions)
- Pre-release security check script
- API documentation كامل
- إدارة ورديات (Shifts) مع موازنة الصندوق
- ماسح باركود لاسلكي via WebSocket (HTTPS/WSS)
- نسخ احتياطي تلقائي يومي مع تدوير (7 نسخ)
- استعادة نسخ احتياطية لقاعدة البيانات
- كاش طبقة ذاكرة مع SWR (Stale-While-Revalidate)
- Crash recovery مع circuit breaker + exponential backoff

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

### أول تشغيل
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

## 📊 الإحصائيات

| المقياس | القيمة |
|---------|--------|
| أسطر Rust | ~5000 |
| أسطر TypeScript | ~8000 |
| Tauri commands | 100+ |
| Database tables | 40+ |
| Migrations | 23 |
| Unit/Integration tests | 43+ |
| TypeScript interfaces | 25+ |
| `any` في الكود | 0 |

---

## 📄 الترخيص

حقوق الطبع محفوظة © 2026 Bunun Mazen Pharmacy
