import type { Medicine, Debt, Supplier } from "../../types";
// ========================================
// Service Layer - طبقة الخدمات
// ========================================
// طبقة وسيطة بين الـ UI و backend commands
// تطبق validation + caching + event publishing + crash recovery + fraud detection
//
// P1 fix: previously the UI bypassed this layer and called invoke() directly,
// disabling caching, fraud detection, and crash recovery. The service layer
// is now the single entry point — stores call services, services call invoke().
//
// All mutating methods accept a sessionToken parameter (required by backend).

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
  async getAll(): Promise<Medicine[]> {
    return perfMonitor.measure('inventory_getAll', async () => {
      return cache.getOrSet<Medicine[]>('medicines:all', async () => {
        return invoke<Medicine[]>('get_medicines_db');
      }, 30 * 1000); // 30 ثانية
    });
  },

  async add(data: Omit<Medicine, 'id' | 'isDeleted'>, userRole: string, sessionToken: string): Promise<string> {
    void userRole; // reserved for fraud detection when wired
    const result = await invoke<string>('add_medicine_db', {
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      scientificName: data.scientificName || null,
      barcode: data.barcode,
      price: data.price,
      wholesalePrice: 0,
      costPrice: data.costPrice,
      quantity: data.quantity,
      batchNumber: data.batchNumber,
      expiryDate: data.expiryDate,
      sessionToken,
    });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_ADDED, { id: result, ...data });
    return result;
  },

  async update(id: string, data: Omit<Medicine, 'id' | 'isDeleted'>, _userRole: string, sessionToken: string): Promise<void> {
    void _userRole;
    await invoke('update_medicine_db', {
      medicineId: id,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      scientificName: data.scientificName || null,
      barcode: data.barcode,
      price: data.price,
      costPrice: data.costPrice,
      quantity: data.quantity,
      batchNumber: data.batchNumber,
      expiryDate: data.expiryDate,
      wholesalePrice: 0,
      sessionToken,
    });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_UPDATED, { id, ...data });
  },

  async delete(id: string, userRole: string, medName: string, sessionToken: string): Promise<void> {
    fraudDetector.checkDeletion(userRole, 'medicine', medName);
    await invoke('soft_delete_medicine_db', { medicineId: id, userRole, medName, sessionToken });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.MEDICINE_DELETED, { id, name: medName });
  },

  async adjustStock(id: string, amount: number, userRole: string, currentQty: number, sessionToken: string): Promise<void> {
    fraudDetector.checkInventoryAdjustment(userRole, id, amount, currentQty);
    await invoke('adjust_stock_db', { medicineId: id, amount, sessionToken });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.STOCK_ADJUSTED, { id, amount, newQty: currentQty + amount });
  },

  async bulkUpdatePrices(type: 'percentage' | 'amount', value: number, sessionToken: string): Promise<void> {
    await invoke('bulk_update_prices_db', { updateType: type, value, userRole, sessionToken });
    CacheInvalidator.invalidateMedicines();
    eventBus.emit(EventNames.BULK_PRICE_UPDATE, { type, value, userRole });
  },
};

// ========================================
// POS Service
// ========================================
export const posService = {
  async recordSale(
    items: Array<{ id: string; nameAr: string; price: number; quantity: number; costPrice?: number }>,
    discountPercentage: number,
    userRole: string,
    sessionToken: string,
    discountAmount?: number,
  ): Promise<{ invoiceId: string }> {
    return perfMonitor.measure('pos_record_sale', async () => {
      // فحص الاحتيال
      const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
      fraudDetector.checkDiscount(userRole, discountPercentage, subtotal);
      fraudDetector.checkRapidSuccession(userRole, 'sale');

      // Idempotency: سجّل العملية في journal قبل التنفيذ
      const operationId = await crashRecovery.startOperation('sale', { items, discountPercentage }, userRole);

      try {
        const result = await invoke<{ invoiceId: string }>('record_sale_db', {
          discountPercentage,
          itemsJson: JSON.stringify(items),
          userRole,
          sessionToken,
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
        await crashRecovery.failOperation(operationId, (typeof e === "string" ? e : (e as Error)?.message || String(e)));
        throw e;
      }
    });
  },

  async recordRefund(items: Array<{ id: string; nameAr: string; price: number; quantity: number }>, totalAmount: number, sessionToken: string, invoiceId?: string): Promise<void> {
    fraudDetector.checkRefund(userRole, totalAmount, invoiceId);

    const operationId = await crashRecovery.startOperation('refund', { totalAmount, items }, userRole);

    try {
      await invoke('record_refund_db', {
        totalAmount,
        itemsJson: JSON.stringify(items),
        userRole,
        sessionToken,
      });
      await crashRecovery.completeOperation(operationId);

      CacheInvalidator.invalidateMedicines();
      CacheInvalidator.invalidateAccounting();
      CacheInvalidator.invalidateDashboard();

      eventBus.emit(EventNames.INVOICE_REFUNDED, { items, totalAmount, userRole });
      eventBus.emit(EventNames.DASHBOARD_REFRESH);
    } catch (e) {
      await crashRecovery.failOperation(operationId, (typeof e === "string" ? e : (e as Error)?.message || String(e)));
      throw e;
    }
  },

  async reverseRefund(invoiceId: string, sessionToken: string): Promise<void> {
    await invoke('reverse_refund_db', { invoiceId, userRole, sessionToken });
    CacheInvalidator.invalidateMedicines();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.REFUND_REVERSED, { invoiceId, userRole });
  },
};

// ========================================
// Accounting Service
// ========================================
export const accountingService = {
  async getSummary(sessionToken?: string): Promise<Record<string, unknown>> {
    return perfMonitor.measure('accounting_getSummary', async () => {
      return cache.getOrSet('accounting:summary', async () => {
        return invoke<Record<string, unknown>>('get_accounting_summary_db', { sessionToken: sessionToken || '' });
      }, 30 * 1000);
    });
  },

  async addExpense(description: string, amount: number, userRole: string, sessionToken: string): Promise<void> {
    await invoke('add_expense_db', { description, amount, userRole, sessionToken });
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.EXPENSE_ADDED, { description, amount, userRole });
  },

  async dailyClose(userRole: string, sessionToken: string): Promise<void> {
    await invoke('reset_daily_db', { userRole, sessionToken });
    CacheInvalidator.invalidateAll();
    eventBus.emit(EventNames.DAILY_CLOSING, { userRole });
    eventBus.emit(EventNames.DASHBOARD_REFRESH);
  },
};

// ========================================
// Debts Service
// ========================================
export const debtsService = {
  async getAll(sessionToken?: string): Promise<Debt[]> {
    return cache.getOrSet('debts:all', async () => {
      return invoke<Debt[]>('get_customer_debts_db', { sessionToken: sessionToken || '' });
    }, 30 * 1000);
  },

  async add(customerName: string, amount: number, note: string | undefined, userRole: string, sessionToken: string): Promise<string> {
    const id = await invoke<string>('add_customer_debt_db', {
      customerName, amount, note, userRole, sessionToken,
    });
    CacheInvalidator.invalidateDebts();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.DEBT_ADDED, { id, customerName, amount });
    return id;
  },

  async pay(debtId: string, amount: number, userRole: string, sessionToken: string): Promise<void> {
    await invoke('pay_customer_debt_db', { debtId, amount, userRole, sessionToken });
    CacheInvalidator.invalidateDebts();
    CacheInvalidator.invalidateAccounting();
    CacheInvalidator.invalidateDashboard();
    eventBus.emit(EventNames.DEBT_PAID, { debtId, amount, userRole });
  },

  async delete(debtId: string, sessionToken: string): Promise<void> {
    await invoke('delete_customer_debt_db', { debtId, sessionToken });
    CacheInvalidator.invalidateDebts();
  },
};

// ========================================
// Suppliers Service
// ========================================
export const suppliersService = {
  async getAll(): Promise<Supplier[]> {
    return cache.getOrSet('suppliers:all', async () => {
      return invoke<Supplier[]>('get_suppliers_db');
    }, 60 * 1000);
  },

  async add(name: string, phone: string | undefined, sessionToken: string): Promise<string> {
    const id = await invoke<string>('add_supplier_db', { name, phone, sessionToken });
    CacheInvalidator.invalidateSuppliers();
    eventBus.emit(EventNames.SUPPLIER_ADDED, { id, name, phone });
    return id;
  },

  recordPurchase: async (
    supplierId: string,
    medicineId: string,
    quantity: number,
    costPrice: number,
    sellingPrice: number,
    wholesalePrice: number,
    userRole: string,
    sessionToken: string,
  ): Promise<void> => {
    const operationId = await crashRecovery.startOperation('purchase', { supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice }, userRole);

    try {
      await invoke('record_purchase_db', {
        supplierId, medicineId, quantity, costPrice, sellingPrice, wholesalePrice, userRole, sessionToken,
      });
      await crashRecovery.completeOperation(operationId);

      CacheInvalidator.invalidateMedicines();
      CacheInvalidator.invalidateSuppliers();
      CacheInvalidator.invalidateAccounting();

      eventBus.emit(EventNames.PURCHASE_RECORDED, { supplierId, medicineId, quantity });
      eventBus.emit(EventNames.DASHBOARD_REFRESH);
    } catch (e) {
      await crashRecovery.failOperation(operationId, (typeof e === "string" ? e : (e as Error)?.message || String(e)));
      throw e;
    }
  },

  async pay(supplierId: string, amount: number, userRole: string, sessionToken: string): Promise<void> {
    await invoke('pay_supplier_db', { supplierId, amount, userRole, sessionToken });
    CacheInvalidator.invalidateSuppliers();
    CacheInvalidator.invalidateAccounting();
    eventBus.emit(EventNames.SUPPLIER_PAID, { supplierId, amount });
  },
};

// ========================================
// Settings Service
// ========================================
export const settingsService = {
  async getAll(): Promise<Record<string, string>> {
    return cache.getOrSet('settings:all', async () => {
      return invoke<Record<string, string>>('get_settings_db');
    }, 5 * 60 * 1000);
  },

  async save(settings: Record<string, string>, sessionToken: string): Promise<void> {
    await invoke('save_settings_db', { settingsJson: JSON.stringify(settings), sessionToken });
    CacheInvalidator.invalidateSettings();
    eventBus.emit(EventNames.SETTINGS_UPDATED, settings);
  },

  /** P1 fix: configure offsite backup replication target */
  async setOffsiteBackupPath(path: string, sessionToken: string): Promise<void> {
    const settings = await this.getAll();
    settings['offsite_backup_path'] = path;
    await this.save(settings, sessionToken);
    cache.delete('settings:all');
  },
};

// ========================================
// Audit Service
// ========================================
export const auditService = {
  async log(userRole: string, actionType: string, description: string, sessionToken: string): Promise<void> {
    await invoke('log_action_db', { userRole, actionType, description, sessionToken });
    cache.delete('audit:recent');
  },

  async getRecent(sessionToken?: string): Promise<Array<Record<string, unknown>>> {
    return cache.getOrSet('audit:recent', async () => {
      return invoke<Array<Record<string, unknown>>>('get_audit_logs_db', { sessionToken: sessionToken || '' });
    }, 30 * 1000);
  },
};

// ========================================
// Reporting Service
// ========================================
export const reportingService = {
  async getFilteredSales(startDate: string, endDate: string, userFilter: string, sessionToken: string): Promise<Record<string, unknown>> {
    return perfMonitor.measure('reporting_sales', async () => {
      return invoke<Record<string, unknown>>('get_filtered_sales_report', { startDate, endDate, userFilter, sessionToken });
    });
  },

  async getInvoiceDetails(startDate: string, endDate: string, userFilter: string, sessionToken: string): Promise<Array<Record<string, unknown>>> {
    return perfMonitor.measure('reporting_invoices', async () => {
      return invoke<Array<Record<string, unknown>>>('get_invoice_details_report', { startDate, endDate, userFilter, sessionToken });
    });
  },

  async getTopMedicines(): Promise<Array<Record<string, unknown>>> {
    return cache.getOrSet('medicines:top', async () => {
      return invoke<Array<Record<string, unknown>>>('get_top_medicines_db');
    }, 5 * 60 * 1000);
  },

  async getDashboardStats(): Promise<Record<string, unknown>> {
    return cache.getOrSet('dashboard:stats', async () => {
      return invoke<Record<string, unknown>>('get_dashboard_stats');
    }, 30 * 1000);
  },

  async getWeeklySales(): Promise<Array<Record<string, unknown>>> {
    return cache.getOrSet('dashboard:weekly', async () => {
      return invoke<Array<Record<string, unknown>>>('get_weekly_sales_stats');
    }, 5 * 60 * 1000);
  },
};

// ========================================
// Backup Service
// ========================================
export const backupService = {
  async create(data: string, password: string, sessionToken: string): Promise<string> {
    const path = await invoke<string>('create_backup', { data, password, sessionToken });
    eventBus.emit(EventNames.BACKUP_CREATED, { path, userRole });
    return path;
  },

  async restore(filePath: string, password: string): Promise<string> {
    const data = await invoke<string>('restore_backup', { filePath, password });
    eventBus.emit(EventNames.BACKUP_RESTORED, { filePath });
    return data;
  },

  async restoreToDb(filePath: string, password: string, sessionToken: string): Promise<Record<string, unknown>> {
    const result = await invoke<Record<string, unknown>>('restore_backup_to_db', { filePath, password, sessionToken });
    CacheInvalidator.invalidateAll();
    eventBus.emit(EventNames.BACKUP_RESTORED, { filePath });
    return result;
  },

  async checkAuto(): Promise<boolean> {
    return invoke<boolean>('check_auto_backup');
  },
};
