CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name_ar VARCHAR(255) NOT NULL, 
    name_en VARCHAR(255), 
    scientific_name VARCHAR(255), 
    barcode VARCHAR(100), 
    price DECIMAL(10,2) NOT NULL, 
    wholesale_price DECIMAL(10,2) NOT NULL DEFAULT 0, 
    cost_price DECIMAL(10,2) NOT NULL, 
    quantity INTEGER NOT NULL DEFAULT 0, 
    batch_number VARCHAR(100), 
    expiry_date DATE, 
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    total_amount DECIMAL(12,2) NOT NULL, 
    profit_amount DECIMAL(12,2) NOT NULL, 
    user_role VARCHAR(50), 
    is_reversed BOOLEAN DEFAULT FALSE, -- لدعم التراجع عن المرتجع
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE, 
    medicine_id UUID, 
    name_ar VARCHAR(255) NOT NULL, 
    quantity INTEGER NOT NULL, 
    price DECIMAL(10,2) NOT NULL, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    description VARCHAR(255) NOT NULL, 
    amount DECIMAL(12,2) NOT NULL, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY, 
    value TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    user_role VARCHAR(50) NOT NULL, 
    action_type VARCHAR(50) NOT NULL, 
    description TEXT NOT NULL, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    customer_name VARCHAR(255) NOT NULL, 
    amount DECIMAL(12,2) NOT NULL, 
    is_paid BOOLEAN NOT NULL DEFAULT FALSE, 
    note TEXT, 
    created_at TIMESTAMP DEFAULT NOW(), 
    paid_date TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name VARCHAR(255) NOT NULL, 
    phone VARCHAR(50), 
    balance DECIMAL(12,2) NOT NULL DEFAULT 0, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    username VARCHAR(50) UNIQUE NOT NULL, 
    password VARCHAR(255) NOT NULL, 
    role VARCHAR(50) NOT NULL, 
    is_active BOOLEAN DEFAULT TRUE, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    user_role VARCHAR(50) NOT NULL, 
    start_time TIMESTAMP DEFAULT NOW(), 
    end_time TIMESTAMP, 
    opening_amount DECIMAL(12,2) NOT NULL, 
    closing_amount DECIMAL(12,2), 
    status VARCHAR(10) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS suspended_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    user_role VARCHAR(50) NOT NULL, 
    items_json TEXT NOT NULL, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    name VARCHAR(255) NOT NULL, 
    national_id VARCHAR(50) UNIQUE NOT NULL, 
    phone VARCHAR(50), 
    notes TEXT, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE, 
    batch_number VARCHAR(100), 
    expiry_date DATE, 
    quantity INTEGER NOT NULL DEFAULT 0, 
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicines_name_ar ON medicines (name_ar);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines (barcode);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_batches_med_expiring ON medicine_batches (medicine_id, expiry_date);