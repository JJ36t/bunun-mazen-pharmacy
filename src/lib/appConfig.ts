// ========================================
// App Configuration - الأنواع المشتركة وتكوين التنقل
// ========================================
// تم استخراجها من App.tsx (P1 fix: تقسيم God component)
// يحتوي على: TabKey type, navItems array, ensurePluginsInitialized

import type { ComponentType } from 'react';
import {
  ShoppingCart, RotateCcw, ScrollText, Calculator as CalcIcon, Package, Database,
  Settings, Truck, UserCog, FileBarChart, Users,
} from 'lucide-react';
import { registerAllPlugins } from '../plugins';
import { hasPermission, Permission } from './core/rbac';

export type TabKey =
  | 'dashboard'
  | 'pos'
  | 'refund'
  | 'inventory'
  | 'accounting'
  | 'debts'
  | 'suppliers'
  | 'quick_purchase'
  | 'patients'
  | 'reporting'
  | 'invoices'
  | 'audit'
  | 'backup'
  | 'settings'
  | 'users'
  | 'stock_count'
  | 'prescriptions'
  | 'import'
  | 'cash_drawer'
  | 'label_printing'
  | 'enterprise';

export interface NavItem {
  key: TabKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: string;
  permission?: Permission;
}

export const navItems: NavItem[] = [
  { key: 'pos', label: 'نقاط البيع', icon: ShoppingCart, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'refund', label: 'مرتجع المبيعات', icon: RotateCcw, group: 'العمليات', permission: 'pos.refund' as Permission },
  { key: 'prescriptions', label: 'الوصفات الطبية', icon: ScrollText, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'cash_drawer', label: 'موازنة الصندوق', icon: CalcIcon, group: 'العمليات', permission: 'pos.use' as Permission },
  { key: 'inventory', label: 'المخزون', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'label_printing', label: 'طباعة الملصقات', icon: Package, group: 'الإدارة', permission: 'inventory.view' as Permission },
  { key: 'stock_count', label: 'الجرد', icon: Package, group: 'الإدارة', permission: 'inventory.adjust' as Permission },
  { key: 'import', label: 'استيراد الأدوية', icon: Package, group: 'الإدارة', permission: 'inventory.add' as Permission },
  { key: 'enterprise', label: 'الإدارة المؤسسية', icon: Database, group: 'النظام', permission: 'system.settings' as Permission },
  { key: 'accounting', label: 'المحاسبة', icon: CalcIcon, group: 'الإدارة', permission: 'accounting.view' as Permission },
  { key: 'debts', label: 'الديون', icon: Users, group: 'الإدارة', permission: 'accounting.debts' as Permission },
  { key: 'suppliers', label: 'الموردون', icon: Truck, group: 'الإدارة', permission: 'accounting.suppliers' as Permission },
  { key: 'quick_purchase', label: 'الشراء السريع', icon: Truck, group: 'الإدارة', permission: 'accounting.suppliers' as Permission },
  { key: 'patients', label: 'المرضى', icon: UserCog, group: 'الإدارة', permission: 'system.patients' as Permission },
  { key: 'reporting', label: 'التقارير', icon: FileBarChart, group: 'النظام', permission: 'reports.view' as Permission },
  { key: 'invoices', label: 'الفواتير الشاملة', icon: FileBarChart, group: 'النظام', permission: 'reports.view' as Permission },
  { key: 'audit', label: 'سجل التدقيق', icon: ScrollText, group: 'النظام', permission: 'system.audit' as Permission },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: Database, group: 'النظام', permission: 'system.backup' as Permission },
  { key: 'users', label: 'المستخدمون', icon: UserCog, group: 'النظام', permission: 'system.users' as Permission },
  { key: 'settings', label: 'الإعدادات', icon: Settings, group: 'النظام', permission: 'system.settings' as Permission },
];

/** فلترة navItems حسب صلاحيات الدور */
export function getVisibleNavItems(role: string): NavItem[] {
  return navItems.filter(item => !item.permission || hasPermission(role, item.permission));
}

/** تجميع navItems حسب المجموعة */
export function groupNavItems(items: NavItem[]): Record<string, NavItem[]> {
  return items.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);
}

// تهيئة الـ plugins مرة واحدة
let pluginsInitialized = false;
export async function ensurePluginsInitialized() {
  if (!pluginsInitialized) {
    await registerAllPlugins();
    pluginsInitialized = true;
  }
}
