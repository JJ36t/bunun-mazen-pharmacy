import type { Medicine, Invoice, InvoiceItem, Debt, Supplier } from "../../types";
// ========================================
// Service Layer - طبقة الخدمات
// ========================================
// طبقة وسيطة بين الـ UI و backend commands
// تطبق validation + caching + event publishing

import { invoke } from '@tauri-apps/api/core';
import { eventBus, EventNames } from '../core/eventBus';
import { cache, CacheInvalidator } from '../cache/MemoryCache';
import { perfMonitor } from '../perf/PerformanceMonitor';
import { fraudDetector } from '../core/fraudDetector';
import { crashRecovery } from '../core/crashRecovery';

// ========================================
// Inventory Service
// ========================================
export const inventoryService = {
  async getAll() {
    return perfMonitor.measure('inventory_getAll', async () => {
      return cache.getOrSet('medicines:all', async () => {
        return invoke<any[]>('get_medicines_db');
      }, 30 * 1000); // 30 ثانية
    });
  },

  async add(data: any, userRole: string) {
    const result = await invoke<string>('add_medicine_db', { ...data, userRole });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_ADDED, { id: result, ...data });
    return result;
  },

  async update(id: string, data: any) {
    await invoke('update_medicine_db', { medicineId: id, ...data });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_UPDATED, { id, ...data });
  },

  async delete(id: string, userRole: string, medName: string) {
    fraudDetector.checkDeletion(userRole, 'medicine', medName);
    await invoke('soft_delete_medicine_db', { medicineId: id, userRole, medName });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_DELETED, { id, name: medName });
  },

  async adjustStock(id: string, amount: number, userRole: string, currentQty: number) {
    fraudDetector.checkInventoryAdjustment(userRole, id, amount, currentQty);
    await invoke('adjust_stock_db', { medicineId: id, amount });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.STOCK_ADJUSTED, { id, amount, newQty: currentQty + amount });
  },

  async bulkUpdatePrices(type: 'percentage' | 'amount', value: number, userRole: string) {
    await invoke('bulk_update_prices_db', { updateType: type, value, userRole });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.BULK_PRICE_UPDATE, { type, value, userRole });
  },
};

// ========================================
// POS Service
// ========================================
export const posService = {
  async recordSale(items: Medicine[], discountPercentage: number, userRole: string, discountAmount?: number) {
    return perfMonitor.measure('pos_record_sale', async () => {
      // فحص الاحتيال
      const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
      fraudDetector.checkDiscount(userRole, discountPercentage, subtotal);
      fraudDetector.checkRapidSuccession(userRole, 'sale');
      
      // Idempotency: سجّل العملية في journal قبل التنفيذ
      const operationId = await crashRecovery.startOperation('sale', { items, discountPercentage }, userRole);
      
      try {
        const result = await invoke<any>('record_sale_db', {
          discountPercentage,
          itemsJson: JSON.stringify(items),
          userRole,
          operationId,
          discountAmount: discountAmount || null,
        });
        await crashRecovery.completeOperation(operationId);
        
        CacheInvalidator.invalidateMedicines();
        CacheInvalidator.invalidateAccounting();
        CacheInvalidator.invalidateDashboard();
        
        const total = discountAmount ? subtotal - discountAmount : subtotal * (1 - discountPercentage / 100);
        eventBus.emit(EventNames.INVOICE_CREATED, { invoiceId: result?.invoiceId, items, discountPercentage, userRole, total });
        eventBus.emit(EventNames.DASHBOARD_REFRESH);
        return result;
      } catch (e) {
        await crashRecovery.failOperation(operationId, String(e));
        throw e;
      }
    });
  },

  async recordRefund(items: Medicine[], totalAmount: number, userRole: string, invoiceId?: string) {
    fraudDetector.checkRefund(userRole, totalAmount, invoiceId);

    const operationId = await crashRecovery.startOperation('refund', { totalAmount, items }, userRole);

    try {
      await invoke('record_refund_db', {
        totalAmount,
        itemsJson: JSON.stringify(items),
        userRole,
      });
      await crashRecovery.completeOperation(operationId);

      CacheInvalidator.invalidateMedicines();
      CacheInvalidator.invalidateAccounting();
      CacheInvalidator.invalidateDashboard();

      eventBus.emit(EventNames.INVOICE_REFUNDED, { items, totalAmount, userRole });
      eventBus.emit(EventNames.DASHBOARD_REFRESH);
    } catch (e) {
      await crashRecovery.failOperation(operationId, String(e));
      throw e;
    }
  },

  async suspendInvoice(items: Medicine[], userRole: string) {
    const id = await invoke<string>('suspend_invoice_db', {
      username: userRole,
      itemsJson: JSON.stringify(items),
    });
    eventBus.emit(EventNames.INVOICE_SUSPENDED, { id, items, userRole });
    return id;
  },

  async getSuspended() {
    return invoke<any[]>('get_suspended_invoices_db');
  },

  async deleteSuspended(id: string) {
    await invoke('delete_suspended_invoice_db', { invId: id });
  },

  async reverseRefund(invoiceId: string, userRole: string) {
    await invoke('reverse_refund_db', { invoiceId, userRole });
    CacheInvalidator.invalidateMedicines();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.REFUND_REVERSED, { invoiceId, userRole });
  },
};

// ========================================
// Accounting Service
// ========================================
export const accountingService = {
  async getSummary() {
    return perfMonitor.measure('accounting_getSummary', async () => {
      return cache.getOrSet('accounting:summary', async () => {
        return invoke<any>('get_accounting_summary_db');
      }, 30 * 1000);
    });
  },

  async addExpense(description: string, amount: number, userRole: string) {
    await invoke('add_expense_db', { description, amount, userRole });
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.EXPENSE_ADDED, { description, amount, userRole });
  },

  async dailyClose(userRole: string) {
    await invoke('reset_daily_db', { userRole });
    CacheInvalidator.invalidateAll();
    eventBus.emit(EventNames.DAILY_CLOSING, { userRole });
    eventBus.emit(EventNames.DASHBOARD_REFRESH);
  },
};

// ========================================
// Debts Service
// ========================================
export const debtsService = {
  async getAll() {
    return cache.getOrSet('debts:all', async () => {
      return invoke<any[]>('get_customer_debts_db');
    }, 30 * 1000);
  },

  async add(customerName: string, amount: number, note: string | undefined, userRole: string) {
    const id = await invoke<string>('add_customer_debt_db', {
      customerName, amount, note, userRole,
    });
    CacheInvalidator.invalidateDebts();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.DEBT_ADDED, { id, customerName, amount });
    return id;
  },

  async pay(debtId: string, amount: number, userRole: string) {
    await invoke('pay_customer_debt_db', { debtId, amount, userRole });
    CacheInvalidator.invalidateDebts();
    CacheInvalidator.invalidateAccounting();
    CacheInvalidator.invalidateDashboard();
    eventBus.emit(EventNames.DEBT_PAID, { debtId, amount, userRole });
  },

  async delete(debtId: string) {
    await invoke('delete_customer_debt_db', { debtId });
    CacheInvalidator.invalidateDebts();
  },
};

// ========================================
// Suppliers Service
// ========================================
export const suppliersService = {
  async getAll() {
    return cache.getOrSet('suppliers:all', async () => {
      return invoke<any[]>('get_suppliers_db');
    }, 60 * 1000);
  },

  async add(name: string, phone: string | undefined) {
    const id = await invoke<string>('add_supplier_db', { name, phone });
    CacheInvalidator.invalidateSuppliers();
    eventBus.emit(EventNames.SUPPLIER_ADDED, { id, name, phone });
    return id;
  },

  recordPurchase: async (supplierId: string, medicineId: string, quantity: number, costPrice: number, sellingPrice: number, wholesalePrice: number, userRole: string) => {
    const operationId = await crashRecovery.startOperation('purchase', { supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice }, userRole);

    try {
      await invoke('record_purchase_db', {
        supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice, userRole,
      });
      await crashRecovery.completeOperation(operationId);

      CacheInvalidator.invalidateMedicines();
      CacheInvalidator.invalidateSuppliers();
      CacheInvalidator.invalidateAccounting();

      eventBus.emit(EventNames.PURCHASE_RECORDED, { supplierId, medicineId, quantity });
      eventBus.emit(EventNames.DASHBOARD_REFRESH);
    } catch (e) {
      await crashRecovery.failOperation(operationId, String(e));
      throw e;
    }
  },

  async pay(supplierId: string, amount: number, userRole: string) {
    await invoke('pay_supplier_db', { supplierId, amount, userRole });
    CacheInvalidator.invalidateSuppliers();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.SUPPLIER_PAID, { supplierId, amount });
  },
};

// ========================================
// Patients Service
// ========================================
export const patientsService = {
  async getAll() {
    return cache.getOrSet('patients:all', async () => {
      return invoke<any[]>('get_patients_db');
    }, 60 * 1000);
  },

  async add(name: string, nationalId: string, phone: string, notes: string | undefined) {
    const id = await invoke<string>('add_patient_db', { name, nationalId, phone, notes });
    CacheInvalidator.invalidatePatients();
    return id;
  },
};

// ========================================
// Users Service
// ========================================
export const usersService = {
  async getAll() {
    return cache.getOrSet('users:all', async () => {
      return invoke<any[]>('get_users_db');
    }, 60 * 1000);
  },

  async add(username: string, password: string, role: string) {
    await invoke('add_user_db', { username, password, role });
    CacheInvalidator.invalidateUsers();
    eventBus.emit(EventNames.USER_ADDED, { username, role });
  },

  async toggleStatus(userId: string, isActive: boolean) {
    await invoke('toggle_user_status_db', { userId, isActive });
    CacheInvalidator.invalidateUsers();
    eventBus.emit(EventNames.USER_TOGGLED, { userId, isActive });
  },

  async resetPassword(userId: string, newPassword: string) {
    await invoke('reset_user_password_db', { userId, newPassword });
  },

  async verifyAdminPassword(password: string) {
    return invoke<boolean>('verify_admin_password_db', { password });
  },
};

// ========================================
// Settings Service
// ========================================
export const settingsService = {
  async getAll() {
    return cache.getOrSet('settings:all', async () => {
      return invoke<Record<string, string>>('get_settings_db');
    }, 5 * 60 * 1000);
  },

  async save(settings: Record<string, string>) {
    await invoke('save_settings_db', { settingsJson: JSON.stringify(settings) });
    CacheInvalidator.invalidateSettings();
    eventBus.emit(EventNames.SETTINGS_UPDATED, settings);
  },
};

// ========================================
// Audit Service
// ========================================
export const auditService = {
  async log(userRole: string, actionType: string, description: string) {
    await invoke('log_action_db', { userRole, actionType, description });
    cache.delete('audit:recent');
  },

  async getRecent() {
    return cache.getOrSet('audit:recent', async () => {
      return invoke<any[]>('get_audit_logs_db');
    }, 30 * 1000);
  },
};

// ========================================
// Reporting Service
// ========================================
export const reportingService = {
  async getFilteredSales(startDate: string, endDate: string, userFilter: string) {
    return perfMonitor.measure('reporting_sales', async () => {
      return invoke<any>('get_filtered_sales_report', { startDate, endDate, userFilter });
    });
  },

  async getInvoiceDetails(startDate: string, endDate: string, userFilter: string) {
    return perfMonitor.measure('reporting_invoices', async () => {
      return invoke<any[]>('get_invoice_details_report', { startDate, endDate, userFilter });
    });
  },

  async getTopMedicines() {
    return cache.getOrSet('medicines:top', async () => {
      return invoke<any[]>('get_top_medicines_db');
    }, 5 * 60 * 1000);
  },

  async getDashboardStats() {
    return cache.getOrSet('dashboard:stats', async () => {
      return invoke<any>('get_dashboard_stats');
    }, 30 * 1000);
  },

  async getWeeklySales() {
    return cache.getOrSet('dashboard:weekly', async () => {
      return invoke<any[]>('get_weekly_sales_stats');
    }, 5 * 60 * 1000);
  },
};

// ========================================
// Backup Service
// ========================================
export const backupService = {
  async create(data: string, password: string, userRole: string) {
    const path = await invoke<string>('create_backup', { data, password });
    eventBus.emit(EventNames.BACKUP_CREATED, { path, userRole });
    return path;
  },

  async restore(filePath: string, password: string) {
    const data = await invoke<string>('restore_backup', { filePath, password });
    eventBus.emit(EventNames.BACKUP_RESTORED, { filePath });
    return data;
  },

  async checkAuto() {
    return invoke<boolean>('check_auto_backup');
  },
};
