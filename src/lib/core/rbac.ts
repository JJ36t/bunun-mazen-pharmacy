// ========================================
// RBAC - Role-Based Access Control
// ========================================
// 8 أدوار + صلاحيات دقيقة

export type RoleName = 
  | 'super_admin'
  | 'pharmacy_owner'
  | 'branch_manager'
  | 'pharmacist'
  | 'cashier'
  | 'inventory_manager'
  | 'accountant'
  | 'technical_support';

export type Permission = 
  // POS
  | 'pos.use' | 'pos.discount' | 'pos.refund' | 'pos.suspend'
  // Inventory
  | 'inventory.view' | 'inventory.add' | 'inventory.edit' | 'inventory.delete' 
  | 'inventory.adjust' | 'inventory.bulk_price'
  // Accounting
  | 'accounting.view' | 'accounting.expenses' | 'accounting.closing' 
  | 'accounting.debts' | 'accounting.suppliers'
  // Reports
  | 'reports.view' | 'reports.export'
  // System
  | 'system.users' | 'system.settings' | 'system.backup' | 'system.audit' | 'system.patients';

export const ROLE_DISPLAY_NAMES: Record<RoleName, string> = {
  super_admin: 'مدير عام',
  pharmacy_owner: 'مالك الصيدلية',
  branch_manager: 'مدير فرع',
  pharmacist: 'صيدلي',
  cashier: 'كاشير',
  inventory_manager: 'مدير مخزون',
  accountant: 'محاسب',
  technical_support: 'دعم فني',
};

export const PERMISSION_DISPLAY_NAMES: Record<Permission, string> = {
  'pos.use': 'استخدام نقاط البيع',
  'pos.discount': 'تطبيق الخصومات',
  'pos.refund': 'مرتجع المبيعات',
  'pos.suspend': 'تعليق الفواتير',
  'inventory.view': 'عرض المخزون',
  'inventory.add': 'إضافة أدوية',
  'inventory.edit': 'تعديل الأدوية',
  'inventory.delete': 'حذف الأدوية',
  'inventory.adjust': 'تعديل الكميات',
  'inventory.bulk_price': 'تحديث الأسعار بالجملة',
  'accounting.view': 'عرض المحاسبة',
  'accounting.expenses': 'إدارة المصاريف',
  'accounting.closing': 'الإغلاق اليومي',
  'accounting.debts': 'إدارة الديون',
  'accounting.suppliers': 'إدارة الموردين',
  'reports.view': 'عرض التقارير',
  'reports.export': 'تصدير التقارير',
  'system.users': 'إدارة المستخدمين',
  'system.settings': 'إعدادات النظام',
  'system.backup': 'النسخ الاحتياطي',
  'system.audit': 'سجل التدقيق',
  'system.patients': 'إدارة المرضى',
};

// خرائط الصلاحيات لكل دور (client-side fallback)
// ملاحظة: المصدر النهائي هو قاعدة البيانات، هذا للتحقق السريع
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  super_admin: [
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'accounting.view', 'accounting.expenses', 'accounting.closing', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export',
    'system.users', 'system.settings', 'system.backup', 'system.audit', 'system.patients',
  ],
  pharmacy_owner: [
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'accounting.view', 'accounting.expenses', 'accounting.closing', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export',
    'system.settings', 'system.backup', 'system.audit', 'system.patients',
  ],
  branch_manager: [
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'accounting.view', 'accounting.expenses', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export',
    'system.audit', 'system.patients',
  ],
  pharmacist: [
    'pos.use', 'pos.discount',
    'inventory.view',
    'reports.view',
  ],
  cashier: [
    'pos.use', 'pos.discount', 'pos.refund', 'pos.suspend',
  ],
  inventory_manager: [
    'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete', 'inventory.adjust', 'inventory.bulk_price',
    'reports.view', 'reports.export',
  ],
  accountant: [
    'accounting.view', 'accounting.expenses', 'accounting.closing', 'accounting.debts', 'accounting.suppliers',
    'reports.view', 'reports.export',
  ],
  technical_support: [
    'inventory.view', 'reports.view', 'system.audit',
  ],
};

// تحويل اسم الدور القديم (الـ string من DB) إلى RoleName
export function normalizeRole(role: string): RoleName {
  const mapping: Record<string, RoleName> = {
    'Super Admin': 'super_admin',
    'super_admin': 'super_admin',
    'Pharmacy Owner': 'pharmacy_owner',
    'pharmacy_owner': 'pharmacy_owner',
    'Branch Manager': 'branch_manager',
    'branch_manager': 'branch_manager',
    'Pharmacist': 'pharmacist',
    'pharmacist': 'pharmacist',
    'Cashier': 'cashier',
    'cashier': 'cashier',
    'Inventory Manager': 'inventory_manager',
    'inventory_manager': 'inventory_manager',
    'Accountant': 'accountant',
    'accountant': 'accountant',
    'Technical Support': 'technical_support',
    'technical_support': 'technical_support',
  };
  return mapping[role] || 'cashier';
}

// التحقق من صلاحية معينة
export function hasPermission(role: string, permission: Permission): boolean {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  return permissions.includes(permission);
}

// التحقق من أي صلاحية من قائمة
export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

// التحقق من جميع الصلاحيات
export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

// الحصول على جميع صلاحيات الدور
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

// التحقق من صلاحية الإدارة (admin-like)
export function isAdmin(role: string): boolean {
  const normalized = normalizeRole(role);
  return ['super_admin', 'pharmacy_owner', 'branch_manager'].includes(normalized);
}

// قائمة جميع الأدوار (للقوائم المنسدلة)
export const ALL_ROLES: { value: RoleName; label: string }[] = [
  { value: 'super_admin', label: 'مدير عام' },
  { value: 'pharmacy_owner', label: 'مالك الصيدلية' },
  { value: 'branch_manager', label: 'مدير فرع' },
  { value: 'pharmacist', label: 'صيدلي' },
  { value: 'cashier', label: 'كاشير' },
  { value: 'inventory_manager', label: 'مدير مخزون' },
  { value: 'accountant', label: 'محاسب' },
  { value: 'technical_support', label: 'دعم فني' },
];
