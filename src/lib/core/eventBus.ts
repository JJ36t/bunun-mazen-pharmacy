// ========================================
// Event Bus - نظام الأحداث الداخلي
// ========================================
// يستخدم لنشر الأحداث بين المجالات المختلفة
// مثال: InvoiceCreated → stock deduction + audit log + dashboard refresh

type EventHandler<T = any> = (payload: T) => void | Promise<void>;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /** تسجيل مستمع لحدث معين */
  on<T = any>(eventName: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler as EventHandler);
    
    // إرجاع دالة إلغاء التسجيل
    return () => this.off(eventName, handler);
  }

  /** نشر حدث لجميع المستمعين */
  async emit<T = any>(eventName: string, payload?: T): Promise<void> {
    const handlers = this.handlers.get(eventName);
    if (!handlers || handlers.size === 0) return;
    
    const errors: Error[] = [];
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (e) {
        errors.push(e as Error);
        console.error(`[EventBus] Error in handler for "${eventName}":`, e);
      }
    }
    
    if (errors.length > 0) {
      console.error(`[EventBus] ${errors.length} errors occurred for event "${eventName}"`);
    }
  }

  /** إلغاء تسجيل مستمع */
  off<T = any>(eventName: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    }
  }

  /** مسح جميع المستمعين لحدث معين أو كل الأحداث */
  clear(eventName?: string): void {
    if (eventName) {
      this.handlers.delete(eventName);
    } else {
      this.handlers.clear();
    }
  }

  /** قائمة الأحداث المسجّلة (للتشخيص) */
  getRegisteredEvents(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Singleton instance
export const eventBus = new EventBus();

// ========================================
// أسماء الأحداث المعتمدة (Typed Events)
// ========================================
export const EventNames = {
  // POS Events
  INVOICE_CREATED: 'InvoiceCreated',
  INVOICE_REFUNDED: 'InvoiceRefunded',
  REFUND_REVERSED: 'RefundReversed',
  INVOICE_SUSPENDED: 'InvoiceSuspended',
  INVOICE_RECALLED: 'InvoiceRecalled',
  
  // Inventory Events
  STOCK_ADJUSTED: 'StockAdjusted',
  MEDICINE_ADDED: 'MedicineAdded',
  MEDICINE_UPDATED: 'MedicineUpdated',
  MEDICINE_DELETED: 'MedicineDeleted',
  BATCH_ADDED: 'BatchAdded',
  LOW_STOCK_ALERT: 'LowStockAlert',
  EXPIRY_ALERT: 'ExpiryAlert',
  BULK_PRICE_UPDATE: 'BulkPriceUpdate',
  
  // Accounting Events
  EXPENSE_ADDED: 'ExpenseAdded',
  DAILY_CLOSING: 'DailyClosing',
  DEBT_ADDED: 'DebtAdded',
  DEBT_PAID: 'DebtPaid',
  
  // Supplier Events
  SUPPLIER_ADDED: 'SupplierAdded',
  PURCHASE_RECORDED: 'PurchaseRecorded',
  SUPPLIER_PAID: 'SupplierPaid',
  
  // User & Security Events
  USER_LOGGED_IN: 'UserLoggedIn',
  USER_LOGGED_OUT: 'UserLoggedOut',
  USER_ADDED: 'UserAdded',
  USER_TOGGLED: 'UserToggled',
  SHIFT_STARTED: 'ShiftStarted',
  SHIFT_CLOSED: 'ShiftClosed',
  
  // System Events
  SETTINGS_UPDATED: 'SettingsUpdated',
  BACKUP_CREATED: 'BackupCreated',
  BACKUP_RESTORED: 'BackupRestored',
  LICENSE_ACTIVATED: 'LicenseActivated',
  FRAUD_DETECTED: 'FraudDetected',
  PLUGIN_LOADED: 'PluginLoaded',
  
  // UI Events
  DASHBOARD_REFRESH: 'DashboardRefresh',
  TAB_CHANGED: 'TabChanged',
} as const;

export type EventName = typeof EventNames[keyof typeof EventNames];
