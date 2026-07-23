# 🚀 دليل النشر — Bunun Mazen Pharmacy

## المتطلبات

### البرمجيات
- Node.js 18+
- Rust (via rustup)
- PostgreSQL 14+
- Tauri CLI prerequisites (انظر tauri.app)

### النظام
- Windows 10/11 (للنسخة Windows)
- macOS 12+ (للنسخة macOS)
- Ubuntu 22.04+ (للنسخة Linux)

## خطوات النشر

### 1. إعداد قاعدة البيانات

```sql
-- أنشئ قاعدة البيانات (التطبيق يفعل ذلك تلقائياً إذا لم تكن موجودة)
CREATE DATABASE pharmacy_db;

-- أنشئ المستخدم (اختياري — يمكن استخدام postgres)
CREATE USER pharmacy_user WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE pharmacy_db TO pharmacy_user;
```

### 2. إعداد متغيرات البيئة

```bash
# Linux/macOS
export PHARMACY_DB_PASSWORD="your_strong_password"
export PHARMACY_DB_USER="pharmacy_user"  # أو postgres
export PHARMACY_DB_HOST="localhost"
export PHARMACY_DB_PORT="5432"

# Windows PowerShell
$env:PHARMACY_DB_PASSWORD = "your_strong_password"
$env:PHARMACY_DB_USER = "pharmacy_user"
$env:PHARMACY_DB_HOST = "localhost"
$env:PHARMACY_DB_PORT = "5432"
```

### 3. توليد مفاتيح الترخيص

```bash
cd src-tauri

# توليد مفتاح Ed25519
cargo run --bin generate_keys
# انسخ المفتاح العام وأضفه إلى keys/manifest.json

# ضبط legacy.enabled = false في manifest بعد إضافة المفتاح
```

### 4. توليد مفتاح التحديثات

```bash
npm run tauri signer generate -- -w ~/.tauri/pharmacy-updater.key
# انسخ المفتاح العام والصقه في tauri.conf.json > plugins.updater.pubkey
```

### 5. بناء التطبيق

```bash
# تثبيت الاعتماديات
npm install

# البناء للإنتاج
npm run tauri build
```

### 6. النشر

- **Windows:** ملف `.msi` أو `.exe` في `src-tauri/target/release/bundle/`
- **macOS:** ملف `.dmg` في `src-tauri/target/release/bundle/`
- **Linux:** ملف `.deb` أو `.AppImage` في `src-tauri/target/release/bundle/`

## بعد التثبيت

### أول إقلاع
1. التطبيق ينشئ قاعدة البيانات تلقائياً
2. التطبيق يطبّق جميع الـ migrations
3. التطبيق يولّد كلمات مرور عشوائية لـ admin و cashier
4. **اقرأ كلمات المرور من الـ terminal (stderr)**
5. سجّل الدخول وغيّر كلمات المرور فوراً

### النسخ الاحتياطي التلقائي
- يعمل كل 24 ساعة تلقائياً
- يحفظ آخر 7 نسخ في `Desktop/PharmacyBackups/`
- مشفّر بـ AES-256-GCM
- كلمة المرور في `~/.local/share/BununMazenPharmacy/.backup_key`

### الاستعادة
1. اذهب إلى الإعدادات > النسخ الاحتياطي
2. اختر ملف النسخة
3. أدخل كلمة المرور
4. اضغط استعادة
5. أعد تشغيل التطبيق

## استكشاف الأخطاء

### "PHARMACY_DB_PASSWORD not set"
- ضبط متغير البيئة قبل تشغيل التطبيق

### "Could not connect to database"
- تأكد أن PostgreSQL يعمل
- تأكد من صحة كلمة المرور والمستخدم

### "License not valid"
- شغّل `cargo run --bin generate_device_license` على الجهاز الهدف
- أدخل المفتاح المُولَّد في شاشة الترخيص

### "Session expired"
- أعد تسجيل الدخول (الجلسة تنتهي بعد 24 ساعة كحد أقصى)
