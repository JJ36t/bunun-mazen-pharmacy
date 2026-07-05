-- ========================================
-- Migration 0006: Drug Interactions + Supplier Orders + last_login
-- ========================================

-- ===== 1. drug_interactions: قاعدة تفاعلات الأدوية =====
CREATE TABLE IF NOT EXISTS drug_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_a VARCHAR(200) NOT NULL,           -- المادة الفعالة الأولى (مثلاً: Warfarin)
    drug_b VARCHAR(200) NOT NULL,           -- المادة الفعالة الثانية (مثلاً: Aspirin)
    severity VARCHAR(20) NOT NULL,          -- High / Medium / Low
    description TEXT NOT NULL,              -- وصف التفاعل
    recommendation TEXT,                    -- التوصية (تجنب، مراقبة، إلخ)
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_a ON drug_interactions (drug_a);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_b ON drug_interactions (drug_b);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_interactions_pair
    ON drug_interactions (LEAST(drug_a, drug_b), GREATEST(drug_a, drug_b));

-- ===== 2. interaction_overrides: تسجيل تجاوزات التفاعلات =====
CREATE TABLE IF NOT EXISTS interaction_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID REFERENCES drug_interactions(id) ON DELETE CASCADE,
    user_role VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,                   -- سبب التجاوز (إلزامي)
    invoice_id UUID,                        -- الفاتورة المرتبطة (اختياري)
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===== 3. supplier_orders: طلبات الشراء من الموردين =====
CREATE TABLE IF NOT EXISTS supplier_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE,        -- رقم الطلب
    status VARCHAR(20) DEFAULT 'pending',   -- pending / sent / partial / received / cancelled
    total_amount DECIMAL(12,2) DEFAULT 0,
    expected_delivery DATE,                 -- تاريخ التسليم المتوقع
    received_date TIMESTAMP,                -- تاريخ الاستلام الفعلي
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON supplier_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders (status);

-- ===== 4. supplier_order_items: عناصر طلب الشراء =====
CREATE TABLE IF NOT EXISTS supplier_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES supplier_orders(id) ON DELETE CASCADE,
    medicine_name VARCHAR(200),
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(12,2),
    received_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_order_items_order ON supplier_order_items (order_id);

-- ===== 5. users: إضافة last_login =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- ===== 6. settings: إعداد حد التنبيهات =====
INSERT INTO settings (key, value, description) VALUES
    ('low_stock_threshold', '20', 'حد التنبيه لنقص المخزون'),
    ('expiry_warning_days', '30', 'عدد الأيام للتنبيه قبل الانتهاء'),
    ('printer_receipt', '', 'طابعة الإيصالات الافتراضية'),
    ('printer_labels', '', 'طابعة الملصقات الافتراضية'),
    ('printer_a4', '', 'طابعة A4 الافتراضية'),
    ('receipt_size', '80mm', 'حجم ورق الإيصال (58mm أو 80mm)')
ON CONFLICT (key) DO NOTHING;

-- ===== 7. بيانات تفاعلات الأدوية الأساسية =====
-- أهم التفاعلات الشائعة في الصيدليات العراقية
INSERT INTO drug_interactions (drug_a, drug_b, severity, description, recommendation) VALUES
    -- تفاعلات عالية الخطورة
    ('Warfarin', 'Aspirin', 'High', 'زيادة خطر النزيف بشكل كبير عند استخدام Warfarin مع Aspirin',
     'تجنب الاستخدام المتزامن. إذا اضطررت، راقب INR ونزيف المرضى عن قرب'),
    ('Warfarin', 'Ibuprofen', 'High', 'مضادات الالتهاب غير الستيرويدية تزيد خطر النزيف مع Warfarin',
     'تجنب الاستخدام المتزامن. استخدم Paracetamol كبديل آمن'),
    ('Warfarin', 'Diclofenac', 'High', 'زيادة خطر النزيف المعوي',
     'تجنب الاستخدام المتزامن. استخدم Paracetamol للألم'),
    ('Warfarin', 'Naproxen', 'High', 'زيادة كبيرة في خطر النزيف',
     'تجنب الاستخدام المتزامن تماماً'),
    ('Warfarin', 'Ketoconazole', 'High', 'يزيد من تركيز Warfarin في الدم',
     'تجنب الاستخدام المتزامن أو راقب INR يومياً'),
    ('Warfarin', 'Rifampin', 'High', 'يقلل من فعالية Warfarin بشكل كبير',
     'راقب INR يومياً واضبط جرعة Warfarin'),
    ('Warfarin', 'Fluconazole', 'High', 'يزيد من تركيز Warfarin في الدم',
     'راقب INR عن قرب واضبط الجرعة'),
    ('Amiodarone', 'Warfarin', 'High', 'يزيد من تركيز Warfarin بشكل كبير',
     'قلل جرعة Warfarin بنسبة 30-50% وراقب INR'),
    ('Clarithromycin', 'Simvastatin', 'High', 'يزيد من تركيز Simvastatin مما يسبب ألم عضلي خطير (Rhabdomyolysis)',
     'تجنب الاستخدام المتزامن. أوقف Simvastatin أثناء العلاج'),
    ('Clarithromycin', 'Atorvastatin', 'High', 'يزيد من تركيز Atorvastatin',
     'استخدم Rosuvastatin بدلاً من ذلك أثناء العلاج'),
    ('Clarithromycin', 'Colchicine', 'High', 'زيادة سمية Colchicine خاصة في كبار السن',
     'تجنب الاستخدام المتزامن خاصة في مرضى الكلى'),
    ('Simvastatin', 'Diltiazem', 'High', 'يزيد من تركيز Simvastatin',
     'لا تتجاوز جرعة 10mg من Simvastatin يومياً'),
    ('Cyclosporine', 'Ketoconazole', 'High', 'يزيد من تركيز Cyclosporine بشكل خطير',
     'راقب مستويات Cyclosporine واضبط الجرعة'),
    ('Cyclosporine', 'Tacrolimus', 'High', 'تأثيرات مناعية مفرطة وسمية كلوية',
     'تجنب الاستخدام المتزامن'),
    ('Lithium', 'Ibuprofen', 'High', 'مضادات الالتهاب تزيد من سمية Lithium',
     'راقب مستويات Lithium في الدم'),
    ('Lithium', 'Naproxen', 'High', 'زيادة خطر سمية Lithium',
     'تجنب الاستخدام المتزامن'),
    ('Methotrexate', 'Trimethoprim', 'High', 'زيادة سمية Methotrexate الخطيرة',
     'تجنب الاستخدام المتزامن تماماً'),
    ('Theophylline', 'Ciprofloxacin', 'High', 'يزيد من تركيز Theophylline',
     'راقب مستويات Theophylline واضبط الجرعة'),
    ('Digoxin', 'Verapamil', 'High', 'يزيد من تركيز Digoxin',
     'راقب مستويات Digoxin و ECG'),
    ('Allopurinol', 'Azathioprine', 'High', 'يزيد من سمية Azathioprine الخطيرة',
     'قلل جرعة Azathioprine بنسبة 67-75%'),
    ('SSRIs', 'MAOIs', 'High', 'خطر متلازمة السيروتونين (Serotonin Syndrome)',
     'فترة فصل 14 يوم على الأقل بين الأدوية'),
    ('Tramadol', 'MAOIs', 'High', 'خطر متلازمة السيروتونين والنوبات',
     'تجنب الاستخدام المتزامن تماماً'),
    ('Tramadol', 'SSRIs', 'High', 'زيادة خطر النوبات ومتلازمة السيروتونين',
     'تجنب الاستخدام المتزامن'),
    ('Pseudoephedrine', 'MAOIs', 'High', 'أزمة ارتفاع ضغط الدم الخطيرة',
     'تجنب الاستخدام المتزامن. فترة فصل 14 يوم'),
    ('Sumatriptan', 'Ergotamine', 'High', 'تشنج الأوعية الدموية الخطير',
     'تجنب الاستخدام المتزامن تماماً'),

    -- تفاعلات متوسطة الخطورة
    ('Metformin', 'Contrast Media', 'Medium', 'خطر الحماض اللبني (Lactic Acidosis)',
     'أوقف Metformin قبل وبعد الأشعة بـ 48 ساعة'),
    ('ACE Inhibitors', 'Potassium', 'Medium', 'زيادة خطيرة في البوتاسيوم',
     'راقب مستويات البوتاسيوم بانتظام'),
    ('Spironolactone', 'Potassium', 'Medium', 'خطر فرط بوتاسيوم الدم',
     'تجنب مكملات البوتاسيوم وراقب المستويات'),
    ('Ciprofloxacin', 'Antacids', 'Medium', 'الأنتاسيد يقلل امتصاص Ciprofloxacin',
     'خذ Ciprofloxacin قبل أو بعد 2 ساعة من الأنتاسيد'),
    ('Tetracycline', 'Dairy', 'Medium', 'الكالسيوم يقلل امتصاص Tetracycline',
     'تجنب منتجات الألبان قبل وبعد 2 ساعة'),
    ('Doxycycline', 'Iron', 'Medium', 'الحديد يقلل امتصاص Doxycycline',
     'خذ Doxycycline قبل أو بعد 3 ساعات من الحديد'),
    ('Levothyroxine', 'Iron', 'Medium', 'الحديد يقلل امتصاص Levothyroxine',
     'خذ Levothyroxine قبل 4 ساعات من الحديد'),
    ('Levothyroxine', 'Calcium', 'Medium', 'الكالسيوم يقلل امتصاص Levothyroxine',
     'خذ Levothyroxine قبل 4 ساعات من الكالسيوم'),
    ('Alendronate', 'Calcium', 'Medium', 'الكالسيوم يقلل امتصاص Alendronate',
     'خذ Alendronate قبل 30 دقيقة من الكالسيوم'),
    ('Omeprazole', 'Clopidogrel', 'Medium', 'Omeprazole يقلل فعالية Clopidogrel',
     'استخدم Pantoprazole بدلاً من Omeprazole'),
    ('Amoxicillin', 'Oral Contraceptives', 'Medium', 'قد يقلل المضاد الحيوي من فعالية موانع الحمل',
     'استخدم طريقة إضافية لمنع الحمل أثناء العلاج وبعده بـ 7 أيام'),
    ('Rifampin', 'Oral Contraceptives', 'Medium', 'يقلل من فعالية موانع الحمل',
     'استخدم طريقة إضافية لمنع الحمل طوال فترة العلاج'),
    ('Phenytoin', 'Phenobarbital', 'Medium', 'تعديل في مستويات الأدوية',
     'راقب مستويات Phenytoin في الدم'),
    ('Carbamazepine', 'Oral Contraceptives', 'Medium', 'يقلل من فعالية موانع الحمل',
     'استخدم طريقة إضافية لمنع الحمل'),
    ('Corticosteroids', 'NSAIDs', 'Medium', 'زيادة خطر النزيف المعوي',
     'استخدم مع Paracetamol بدلاً من NSAIDs'),
    ('Diuretics', 'Lithium', 'Medium', 'مدرات البول تزيد من سمية Lithium',
     'راقب مستويات Lithium'),
    ('Statins', 'Fibrates', 'Medium', 'زيادة خطر ألم عضلي (Myopathy)',
     'راقب علامات ألم العضلات'),
    ('ACE Inhibitors', 'Diuretics', 'Medium', 'انخفاض ضغط الدم',
     'راقب ضغط الدم وضبط الجرعات'),

    -- تفاعلات منخفضة الخطورة
    ('Paracetamol', 'Alcohol', 'Low', 'الاستهلاك المفرط للكحول يزيد سمية Paracetamol',
     'تجنب الاستهلاك المفرط للكحول'),
    ('Antihistamines', 'Alcohol', 'Low', 'زيادة النعاس والاكتئاب',
     'تجنب الكحول أثناء تناول مضادات الهيستامين'),
    ('Benzodiazepines', 'Alcohol', 'Low', 'زيادة التثبيط العصبي',
     'تجنب الكحول تماماً أثناء العلاج'),
    ('Codeine', 'Alcohol', 'Low', 'زيادة خطر الاكتئاب التنفسي',
     'تجنب الكحول تماماً'),
    ('Metformin', 'Alcohol', 'Low', 'زيادة خطر الحماض اللبني',
     'تجنب الاستهلاك المفرط للكحول'),
    ('Aspirin', 'Alcohol', 'Low', 'زيادة خطر النزيف المعوي',
     'تجنب الاستهلاك المفرط للكحول'),
    ('Vitamin C', 'Iron', 'Low', 'فيتامين C يزيد امتصاص الحديد',
     'يمكن استخدامه بشكل مفيد لتعزيز امتصاص الحديد'),
    ('Antacids', 'Fluoroquinolones', 'Low', 'الأنتاسيد يقلل امتصاص الفلوروكينولون',
     'خذ الدواء قبل أو بعد 2 ساعة من الأنتاسيد'),
    ('Caffeine', 'Theophylline', 'Low', 'زيادة خطر آثار جانبية عصبية',
     'قلل استهلاك الكافيين'),
    ('Omeprazole', 'Vitamin B12', 'Low', 'استخدام طويل يقلل امتصاص B12',
     'راقب مستويات B12 في الاستخدام طويل الأمد')
ON CONFLICT DO NOTHING;
