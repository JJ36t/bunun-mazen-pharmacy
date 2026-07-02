# 🏥 صيدلية بنين مازن - نظام الإدارة المؤسسي

<div dir="rtl">

نظام إدارة صيدليات مؤسسي شامل، مصمم خصيصاً للسوق العراقي، يعمل بشكل offline-first مع أداء عالٍ ومتانة مؤسسية.

![Version](https://img.shields.io/badge/version-2.3.0-purple)
![License](https://img.shields.io/badge/license-Commercial-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-green)
![Stack](https://img.shields.io/badge/stack-Tauri%20%2B%20React%20%2B%20Rust-orange)

---

## 📋 المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [الميزات الرئيسية](#الميزات-الرئيسية)
3. [التقنيات المستخدمة](#التقنيات-المستخدمة)
4. [التثبيت](#التثبيت)
5. [الاستخدام](#الاستخدام)
6. [بنية المشروع](#بنية-المشروع)
7. [قاعدة البيانات](#قاعدة-البيانات)
8. [الأنظمة المؤسسية](#الأنظمة-المؤسسية)
9. [الأمان والترخيص](#الأمان-والترخيص)
10. [المساهمة](#المساهمة)

---

## 🎯 نظرة عامة

نظام **صيدلية بنين مازن** هو منصة تشغيل صيدليات مؤسسية متكاملة، تجمع بين السرعة والمتانة والذكاء التشغيلي. صُمم النظام ليكون:

- ⚡ **سريعاً جداً**: عمليات نقاط البيع تحت 100ms
- 🏗️ **متيناً**: يتحمل سنوات من الاستخدام المكثف
- 🔒 **آمناً**: تشفير AES-256 + ترخيص مرتبط بالجهاز
- 🌐 **offline-first**: يعمل بالكامل بدون إنترنت
- 🇮🇶 **مخصص للعراق**: دعم كامل للعربية + الدينار العراقي

---

## ✨ الميزات الرئيسية

### 🛒 نقاط البيع (POS)
- بحث فوري عن الأدوية (أقل من 50ms)
- دعم قارئ الباركود (USB Scanner)
- فواتير معلقة (Suspended Invoices)
- خصومات مع حدود صلاحية
- دعم الديون والآجل
- طباعة حرارية مباشرة (ESC/POS)
- اختصارات لوحة المفاتيح (F1 للدفع، F2 للتعليق)

### 💊 ذكاء الأدوية
- **قاعدة بيانات الأدوية الذكية** (منفصلة عن المخزون)
- **48 دواء عراقي جاهز** (زر إدراج بنقرة واحدة)
- **مجموعات الأدوية الأم** (Parent Drug Groups)
- **محرّك البدائل** (Substitute Intelligence)
- **فحص التفاعلات الدوائية** (severe/moderate/allergy)
- **الأدوية المضبوطة** (Controlled Medicines)
- **تطبيع عربي** متقدم (ة/ه، ي/ى، إ transliteration)
- **بحث ضبابي** (Fuzzy Search) مع تحمّل الأخطاء

### 📦 إدارة المخزون
- تتبع الدفعات (Batch Tracking)
- **FEFO** (First-Expire-First-Out)
- تنبيهات نقص المخزون
- تنبيهات قرب انتهاء الصلاحية (90 يوم)
- **جرد متقدم** مع مقارنة فعلي/نظري
- تحليل الأدوية الراكدة (Dead Stock)
- استيراد CSV/Excel

### 🔐 الذكاء الأمني
- **8 أدوار** بصلاحيات دقيقة (RBAC)
  - مدير عام، مالك الصيدلية، مدير فرع، صيدلي، كاشير، مدير مخزون، محاسب، دعم فني
- **22 صلاحية** قابلة للتخصيص
- **كشف الاحتيال** (Fraud Detection)
  - خصومات مشبوهة
  - مرتجعات متكررة
  - حذفات متتالية
  - نشاط في ساعات متأخرة
- **سجل تدقيق** غير قابل للحذف
- **تتبع الجلسات** (Session Tracking)

### 💰 المحاسبة
- صندوق نقدي + مصاريف
- ديون الزبائن + سداد
- أرصدة الموردين
- **إغلاق يومي** مع تصفير
- **موازنة درج النقدية** (Cash Drawer Balancing)
- تقارير الأرباح والخسائر
- **محرك الربح الذكي** (Smart Profit Engine)

### 🏪 الموردون والمشتريات
- إدارة الموردين + أرصدة
- تسجيل فواتير الشراء
- **ذكاء الموردين** (Reliability Score)
- **تاريخ أسعار الموردين**
- **مرتجعات الموردين**
- اقتراحات الشراء التلقائية

### 📊 التقارير والتحليلات
- تقارير المبيعات (يومي/أسبوعي/شهري)
- تقارير الأرباح
- **التنبؤ بالطلب** (Demand Forecasting)
- **تحليل الموسمية** (Seasonal Analysis)
- **تحليل خسائر الصلاحية**
- **اقتراحات إيقاف الشراء**
- **اقتراحات نقل الصلاحية**
- تصدير PDF/Excel/CSV

### 🏷️ ذكاء الباركود
- دعم EAN-13, UPC, Code128, GS1-128, QR, DataMatrix
- **باركود متعدد** لكل دواء (manufacturer/internal/pack/carton)
- **توليد باركود داخلي** (BNN-0000001)
- **محرك تعلّم الباركود** (ربط سريع)
- **تحليلات الباركود** (نسبة النجاح، متوسط الوقت)
- **5 أوضاع مسح** (POS/Inventory/Receiving/Expiry/Batch)
- **أصوات تفاعلية** (نجاح/فشل/تحذير)
- **طباعة الملصقات** (باركود/رف/دواء/دفعة)

### 👥 إدارة العملاء (CRM)
- قاعدة بيانات المرضى
- **نقاط الولاء** (Loyalty Points)
- تاريخ المشتريات
- تتبع الأدوية المزمنة
- **الوصفات الطبية الإلكترونية**
  - تسجيل الوصفات
  - تتبع المضادات الحيوية
  - ربط بالمريض

### 💳 طرق الدفع المتعددة
- نقدي (Cash)
- بطاقة (Card - مدى/Visa)
- شيك (Cheque) مع تاريخ استحقاق
- تحويل بنكي
- آجل (Credit)
- **دفع مقسّم** (Mixed Payment)

### 💱 عملات متعددة
- الدينار العراقي (IQD) - الافتراضي
- الدولار الأمريكي (USD)
- تحويل فوري بسعر صرف يومي

### 🔌 بنية الإضافات (Plugin Architecture)
- 3 إضافات تجريبية جاهزة:
  - **Cloud Sync** (مزامنة سحابية للمستقبل)
  - **WhatsApp Integration** (إرسال الفواتير)
  - **AI Insights** (رؤى ذكية)
- إضافة/تعطيل الإضافات من الواجهة
- ربط تلقائي بالأحداث (Event Bus)

### 🏢 جاهزية متعدد الفروع
- بنية معمارية تدعم الفروع المتعددة
- `branch_id` في كل الجداول الرئيسية
- إدارة الفروع من الواجهة

---

## 🛠️ التقنيات المستخدمة

| الطبقة | التقنية | الإصدار |
|--------|---------|---------|
| **Desktop Runtime** | Tauri | 2.x |
| **Frontend** | React | 19.x |
| **Language** | TypeScript | 5.8 |
| **Styling** | Tailwind CSS | 3.4 |
| **State Management** | Zustand | 5.x |
| **Backend** | Rust | 2021 edition |
| **Database** | PostgreSQL | 14+ |
| **ORM** | SQLx | 0.7 |
| **Icons** | Lucide React | 1.x |
| **Charts** | Recharts | 3.x |
| **Notifications** | Sonner | 2.x |
| **Date Handling** | date-fns | 4.x |

### مكتبات Rust الإضافية:
- `ring` - للتشفير (HMAC-SHA256)
- `aes-gcm` - لتشفير النسخ الاحتياطي (AES-256)
- `bcrypt` - لتشفير كلمات المرور
- `obfstr` - لتشويش السلاسل النصية (Anti-Piracy)
- `subtle` - للمقارنة الآمنة (Constant-Time Eq)
- `tauri-plugin-updater` - للتحديثات التلقائية
- `sysinfo` - لبصمة الجهاز

---

## 📥 التثبيت

### المتطلبات الأساسية

1. **Node.js** 18+ 
2. **Rust** (via [rustup](https://rustup.rs))
3. **PostgreSQL** 14+
4. **Tauri CLI** prerequisites (انظر [tauri.app](https://tauri.app/v1/guides/getting-started/prerequisites))

### خطوات التثبيت

```bash
# 1. استنساخ المستودع
git clone https://github.com/JJ36t/bunun-mazen-pharmacy.git
cd bunun-mazen-pharmacy

# 2. تثبيت اعتماديات Node
npm install

# 3. إعداد قاعدة البيانات
# - أنشئ قاعدة بيانات باسم pharmacy_db في PostgreSQL
# - عدّل connection string في src-tauri/src/main.rs إذا لزم

# 4. تشغيل في وضع التطوير
npm run tauri dev

# 5. بناء ملف التثبيت النهائي
npm run tauri build
```

### حسابات المستخدمين الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|------------|------|
| `admin` | `admin123` | مدير عام |
| `cashier` | `cashier123` | كاشير |

---

## 🚀 الاستخدام

### اختصارات لوحة المفاتيح

| الاختصار | الوظيفة |
|----------|---------|
| `F1` | إتمام البيع (في POS) |
| `F2` | تعليق الفاتورة (في POS) |
| `Enter` | بحث/إضافة للسلة |

### التدفقات الرئيسية

#### 1. عملية بيع سريعة
1. افتح تبويب **نقاط البيع**
2. اكتب اسم الدواء أو امسح الباركود
3. اضغط Enter لإضافة للسلة
4. اضغط F1 للدفع
5. سيتم طباعة الفاتورة تلقائياً

#### 2. إضافة دواء جديد
1. افتح تبويب **المخزون** → **إضافة دواء جديد**
2. املأ البيانات (الاسم، الباركود، السعر، الكمية، الانتهاء)
3. احفظ

#### 3. إدراج الأدوية العراقية الجاهزة
1. افتح تبويب **ذكاء الأدوية**
2. اضغط **إدراج الأدوية العراقية**
3. سيتم إدراج 48 دواءً تلقائياً

#### 4. الجرد
1. افتح تبويب **الجرد** → **بدء جرد جديد**
2. أدخل الكميات الفعلية
3. اضغط **إكمال الجرد** (سيتم تحديث المخزون تلقائياً)

---

## 📁 بنية المشروع

```
bunun-mazen-pharmacy/
├── src/                          # Frontend (React + TypeScript)
│   ├── App.tsx                   # المكوّن الرئيسي
│   ├── MainDashboard.tsx         # لوحة التحكم
│   ├── domains/                  # المجالات المنطقية
│   │   ├── pos/                  # نقاط البيع
│   │   ├── inventory/            # المخزون
│   │   ├── accounting/           # المحاسبة
│   │   ├── suppliers/            # الموردون
│   │   ├── patients/             # المرضى
│   │   ├── reporting/            # التقارير
│   │   ├── security/             # الأمان + تسجيل الدخول
│   │   ├── settings/             # الإعدادات + الإضافات
│   │   └── intelligence/         # 🧠 ذكاء الأدوية + الباركود + الجرد
│   ├── lib/                      # المكتبات الأساسية
│   │   ├── core/                 # الأنظمة الأساسية
│   │   │   ├── eventBus.ts       # نظام الأحداث
│   │   │   ├── rbac.ts           # الصلاحيات (8 أدوار)
│   │   │   ├── pluginRegistry.ts # نظام الإضافات
│   │   │   ├── sessionManager.ts # إدارة الجلسات
│   │   │   ├── fraudDetector.ts  # كشف الاحتيال
│   │   │   ├── crashRecovery.ts  # استرجاع الأعطال
│   │   │   └── printQueue.ts     # طابور الطباعة
│   │   ├── services/             # طبقة الخدمات
│   │   │   ├── index.ts          # الخدمات الأساسية
│   │   │   ├── pharmiq.ts        # خدمات PharmIQ
│   │   │   └── pharmiq_complete.ts # خدمات مكتملة
│   │   ├── cache/                # طبقة الكاش
│   │   │   └── MemoryCache.ts    # كاش في الذاكرة
│   │   ├── hooks/                # React Hooks
│   │   │   └── usePagination.tsx # Pagination + Virtualization
│   │   ├── perf/                 # مراقبة الأداء
│   │   │   └── PerformanceMonitor.ts
│   │   └── utils/                # أدوات مساعدة
│   │       ├── search.ts         # بحث عربي + ضبابي
│   │       ├── pdfExport.ts      # تصدير PDF
│   │       └── export.ts         # تصدير CSV
│   ├── plugins/                  # الإضافات
│   │   ├── cloudSync.tsx         # مزامنة سحابية (تجريبي)
│   │   ├── whatsapp.tsx          # تكامل WhatsApp (تجريبي)
│   │   ├── aiInsights.tsx        # رؤى AI (تجريبي)
│   │   └── index.ts              # تهيئة الإضافات
│   └── assets/                   # الصور
│       └── pharmacy-logo.png
│
├── src-tauri/                    # Backend (Rust + Tauri)
│   ├── src/
│   │   ├── main.rs               # النقطة الرئيسية (130+ أمر)
│   │   └── modules/
│   │       ├── pharmiq_commands.rs    # أوامر PharmIQ
│   │       └── pharmiq_complete.rs    # أوامر مكتملة
│   ├── migrations/               # هجرات قاعدة البيانات
│   │   ├── 20240101000000_init.sql                    # 13 جدول أساسي
│   │   ├── 20240102000000_enterprise_enhancements.sql # 11 جدول مؤسسي
│   │   ├── 20240103000000_pharmiq_intelligence.sql    # 26 جدول ذكاء
│   │   └── 20240104000000_pharmiq_complete.sql        # 19 جدول مكتمل
│   ├── icons/                    # أيقونات التطبيق
│   ├── Cargo.toml                # اعتماديات Rust
│   └── tauri.conf.json           # إعدادات Tauri
│
├── tests/                        # الاختبارات
│   └── stress/
│       └── performance.spec.ts   # اختبارات الأداء
│
├── public/                       # الملفات العامة
│   ├── favicon.png
│   ├── logo.png
│   └── apple-touch-icon.png
│
├── package.json
├── tailwind.config.js            # إعدادات Tailwind + الألوان
├── tsconfig.json
└── README.md
```

---

## 🗄️ قاعدة البيانات

### الإحصائيات:
- **4 migrations** بإجمالي **69 جدول**
- **60+ فهارس (indexes)** للأداء العالي
- **UUID** للمفاتيح الأساسية
- **DECIMAL** للحقول المالية (دقة كاملة)
- **JSONB** للبيانات المرنة

### الجداول الرئيسية:

#### الأساسية (13 جدول):
`medicines`, `invoices`, `invoice_items`, `expenses`, `settings`, `audit_logs`, `customer_debts`, `suppliers`, `users`, `shifts`, `suspended_invoices`, `patients`, `medicine_batches`

#### المؤسسية (11 جدول):
`roles`, `permissions`, `role_permissions`, `plugins`, `plugin_events`, `operation_journal`, `user_sessions`, `fraud_alerts`, `print_jobs`, `backup_history`, `performance_metrics`

#### ذكاء الأدوية (26 جدول):
`drug_master`, `drug_aliases`, `drug_substitutes`, `drug_interactions`, `drug_recalls`, `drug_pack_sizes`, `medicine_barcodes`, `barcode_scan_logs`, `pricing_tiers`, `medicine_pricing`, `supplier_orders`, `purchase_suggestions`, `demand_forecasts`, `dead_stock_analysis`, `expiry_risk_assessment`, `hardware_devices`, `branches`, `task_queue`, `notifications`, `payment_methods`, `invoice_payments`, `customer_loyalty_transactions`, `prescriptions`, `prescription_items`, `stock_counts`, `stock_count_items`

#### مكتملة (19 جدول):
`refund_reasons`, `supplier_pricing_history`, `supplier_returns`, `expiry_losses`, `expiry_transfer_suggestions`, `stop_purchase_suggestions`, `cash_drawer_events`, `cash_drawer_balancing`, `label_print_jobs`, `scan_mode_config`, `demand_forecast_models`, `parent_drug_groups`, `dosage_compatibility`, `gs1_parsed_barcodes`, `multi_pack_barcodes`, `profit_calculations` + إعدادات إضافية

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
- **HMAC-SHA256** للتحقق من المفاتيح
- **تشفير السر** بـ `obfstr` (compile-time obfuscation)
- **مقارنة آمنة** بـ `subtle::ConstantTimeEq`

### مكافحة القرصنة
- السر مشفّر في الـ binary
- لا يمكن استخراجه بسهولة
- الترخيص مرتبط بالجهاز

### تشفير البيانات
- كلمات المرور: `bcrypt` (8 rounds)
- النسخ الاحتياطية: `AES-256-GCM`
- الاتصال بـ DB: `rustls` (TLS)

---

## 📊 إحصائيات المشروع

| المقياس | القيمة |
|---------|--------|
| ملفات TypeScript/TSX | 35+ |
| ملفات Rust | 4 |
| أوامر Tauri | 130+ |
| جداول قاعدة البيانات | 69 |
| الإضافات (Plugins) | 3 |
| اختبارات الأداء | 15+ |
| الأسطر البرمجية | 12,000+ |

---

## 🎨 لقطات الشاشة

### صفحة تسجيل الدخول
- خلفية بنفسجية متدرجة
- شعار الصيدلية
- إظهار/إخفاء كلمة المرور

### لوحة التحكم الرئيسية
- 4 بطاقات إحصائية
- رسم بياني للمبيعات (AreaChart)
- تنبيهات نقص المخزون
- تنبيهات قرب الانتهاء

### نقاط البيع (POS)
- بحث فوري
- سلة جانبية أنيقة
- اختصارات لوحة المفاتيح
- طباعة فورية

---

## 🤝 المساهمة

هذا مشروع تجاري. للمساهمة:

1. Fork المشروع
2. أنشئ فرعاً جديداً (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push للفرع (`git push origin feature/amazing-feature`)
5. افتح Pull Request

---

## 📝 الترخيص

© 2026 صيدلية بنين مازن. جميع الحقوق محفوظة.

هذا المشروع ملكية تجارية - لا يمكن نسخه أو توزيعه بدون إذن.

---

## 📞 التواصل

- **المطور**: JJ36t
- **المستودع**: [GitHub](https://github.com/JJ36t/bunun-mazen-pharmacy)
- **الإصدار**: 2.3.0

---

<div align="center">

**صُنع بـ ❤️ للسوق العراقي**

</div>

</div>
