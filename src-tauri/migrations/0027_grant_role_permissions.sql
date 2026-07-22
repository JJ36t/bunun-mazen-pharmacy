-- ========================================
-- Migration 0027: Grant permissions to 4 empty roles
-- ========================================
-- Root cause: migration 0020 added 4 new roles but granted permissions
-- ONLY to Super Admin, Pharmacy Owner, and Cashier.
-- Branch Manager, Inventory Manager, Accountant, Technical Support
-- all have ZERO permissions — users with these roles can't do anything.
--
-- Fix: Grant appropriate permissions to each role.
-- Also re-grant Manager and Pharmacist permissions (from 0002) with
-- the expanded permission set from 0020.
-- ========================================

-- Branch Manager: POS + Inventory + Accounting + Reports (no system.users)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Branch Manager'
  AND p.name IN (
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'accounting.view', 'accounting.expenses', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export',
    'system.audit', 'system.patients'
  )
ON CONFLICT DO NOTHING;

-- Inventory Manager: Inventory + Reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Inventory Manager'
  AND p.name IN (
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'reports.view', 'reports.export'
  )
ON CONFLICT DO NOTHING;

-- Accountant: Accounting + Reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Accountant'
  AND p.name IN (
    'accounting.view', 'accounting.expenses', 'accounting.closing', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export'
  )
ON CONFLICT DO NOTHING;

-- Technical Support: View + Audit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Technical Support'
  AND p.name IN (
    'inventory.view', 'reports.view', 'system.audit', 'system.settings'
  )
ON CONFLICT DO NOTHING;

-- Manager: re-grant with expanded permissions (from 0002, updated for 0020)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager'
  AND p.name != 'system.users'
ON CONFLICT DO NOTHING;

-- Pharmacist: POS + Inventory view + Reports + Patients
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Pharmacist'
  AND p.name IN (
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust',
    'reports.view',
    'system.patients'
  )
ON CONFLICT DO NOTHING;
