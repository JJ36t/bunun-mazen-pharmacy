// ========================================
// PharmIQ Intelligence Service
// ========================================
// خدمة شاملة لجميع ميزات PharmIQ الجديدة

import { invoke } from '@tauri-apps/api/core';

// ===== 1. Drug Master Service =====
export const drugMasterService = {
  async getAll() {
    return invoke<any[]>('get_drug_master_db');
  },

  async search(query: string) {
    return invoke<any[]>('search_drug_master_db', { query });
  },

  async add(drug: any) {
    return invoke<string>('add_drug_master_db', { drugJson: JSON.stringify(drug) });
  },

  async getSubstitutes(drugId: string) {
    return invoke<any[]>('get_drug_substitutes_db', { drugId });
  },

  async checkInteractions(drugIds: string[]) {
    return invoke<any[]>('check_drug_interactions_db', { drugIdsJson: JSON.stringify(drugIds) });
  },
};

// ===== 2. Barcode Intelligence Service =====
export const barcodeService = {
  async lookup(barcode: string) {
    return invoke<any | null>('lookup_barcode_db', { barcode });
  },

  async bind(barcode: string, medicineId: string, type = 'EAN13', scope = 'manufacturer', batch?: string, expiry?: string) {
    return invoke<string>('bind_barcode_to_medicine_db', {
      barcode, medicineId, barcodeType: type, barcodeScope: scope,
      batchNumber: batch || null, expiryDate: expiry || null,
    });
  },

  async generateInternal(medicineId: string) {
    return invoke<string>('generate_internal_barcode_db', { medicineId });
  },

  async logScan(barcode: string, mode: string, result: string, medicineId?: string, duration?: number, userRole?: string) {
    return invoke('log_barcode_scan_db', {
      barcodeScanned: barcode, scanMode: mode, scanResult: result,
      matchedMedicineId: medicineId || null,
      scanDurationMs: duration || null,
      userRole: userRole || 'Unknown',
    });
  },

  async getAnalytics() {
    return invoke<any>('get_barcode_analytics_db');
  },
};

// ===== 3. Pricing Service =====
export const pricingService = {
  async getTiers() {
    return invoke<any[]>('get_pricing_tiers_db');
  },

  async getMedicinePricing(medicineId: string) {
    return invoke<any[]>('get_medicine_pricing_db', { medicineId });
  },
};

// ===== 4. Supplier Intelligence Service =====
export const supplierIntelligenceService = {
  async get(supplierId: string) {
    return invoke<any>('get_supplier_intelligence_db', { supplierId });
  },
};

// ===== 5. Purchase Suggestions Service =====
export const purchaseService = {
  async getSuggestions() {
    return invoke<any[]>('get_purchase_suggestions_db');
  },
};

// ===== 6. Dead Stock Service =====
export const deadStockService = {
  async analyze(daysThreshold = 90) {
    return invoke<any[]>('analyze_dead_stock_db', { daysThreshold });
  },
};

// ===== 7. Expiry Risk Service =====
export const expiryRiskService = {
  async assess() {
    return invoke<any[]>('get_expiry_risk_assessment_db');
  },
};

// ===== 8. Hardware Service =====
export const hardwareService = {
  async getAll() {
    return invoke<any[]>('get_hardware_devices_db');
  },

  async add(type: string, name: string, connection: string, port: string, config = '{}') {
    return invoke<string>('add_hardware_device_db', {
      deviceType: type, deviceName: name, connectionType: connection, port, config,
    });
  },

  async setDefault(deviceId: string, deviceType: string) {
    return invoke('set_default_hardware_device_db', { deviceId, deviceType });
  },
};

// ===== 9. Branch Service =====
export const branchService = {
  async getAll() {
    return invoke<any[]>('get_branches_db');
  },

  async add(name: string, address: string, phone: string, manager: string) {
    return invoke<string>('add_branch_db', { name, address, phone, manager });
  },
};

// ===== 10. Task Queue Service =====
export const taskQueueService = {
  async enqueue(type: string, name: string, payload: any, priority = 5) {
    return invoke<string>('enqueue_task_db', {
      taskType: type, taskName: name, payload: JSON.stringify(payload), priority,
    });
  },

  async get(status?: string) {
    return invoke<any[]>('get_task_queue_db', { statusFilter: status || null });
  },

  async updateStatus(taskId: string, status: string, progress: number, error?: string) {
    return invoke('update_task_status_db', {
      taskId, status, progress, errorMessage: error || null,
    });
  },
};

// ===== 11. Notification Service =====
export const notificationService = {
  async get(unreadOnly = false) {
    return invoke<any[]>('get_notifications_db', { unreadOnly });
  },

  async create(type: string, title: string, message: string, severity = 'info', priority = 5, category = 'system', actionData?: any, targetUser?: string) {
    return invoke<string>('create_notification_db', {
      notificationType: type, title, message, severity, priority, category,
      actionData: actionData ? JSON.stringify(actionData) : null,
      targetUser: targetUser || null,
    });
  },

  async markRead(id: string) {
    return invoke('mark_notification_read_db', { notificationId: id });
  },

  async dismiss(id: string) {
    return invoke('dismiss_notification_db', { notificationId: id });
  },
};

// ===== 12. Payment Methods Service =====
export const paymentService = {
  async getMethods() {
    return invoke<any[]>('get_payment_methods_db');
  },

  async recordPayment(invoiceId: string, methodId: string, amount: number, reference?: string, chequeDate?: string, bankName?: string) {
    return invoke('record_invoice_payment_db', {
      invoiceId, paymentMethodId: methodId, amount,
      referenceNumber: reference || null,
      chequeDate: chequeDate || null,
      bankName: bankName || null,
    });
  },
};

// ===== 13. Prescription Service =====
export const prescriptionService = {
  async add(patientId: string, doctorName: string, doctorLicense: string | undefined, date: string, diagnosis: string | undefined, notes: string | undefined, isAntibiotic: boolean, items: any[]) {
    return invoke<string>('add_prescription_db', {
      patientId, doctorName, doctorLicense, prescriptionDate: date,
      diagnosis, notes, isAntibiotic,
      itemsJson: JSON.stringify(items),
    });
  },

  async get(patientId?: string) {
    return invoke<any[]>('get_prescriptions_db', { patientId: patientId || null });
  },
};

// ===== 14. Loyalty Service =====
export const loyaltyService = {
  async getPoints(patientId: string) {
    return invoke<any>('get_patient_loyalty_db', { patientId });
  },

  async redeem(patientId: string, points: number, description: string) {
    return invoke('redeem_loyalty_points_db', { patientId, points, description });
  },
};

// ===== 15. Stock Count Service (الجرد) =====
export const stockCountService = {
  async create(type: string, startedBy: string) {
    return invoke<string>('create_stock_count_db', { countType: type, startedBy });
  },

  async updateItem(itemId: string, countedQuantity: number, notes?: string) {
    return invoke('update_stock_count_item_db', { itemId, countedQuantity, notes: notes || null });
  },

  async complete(countId: string) {
    return invoke<any>('complete_stock_count_db', { countId });
  },
};

// ===== 16. Controlled Medicines =====
export const controlledMedicineService = {
  async check(medicineId: string) {
    return invoke<any>('check_controlled_medicine_db', { medicineId });
  },
};

// ===== 17. Seed Iraqi Medicines =====
export const seedService = {
  async seedIraqiMedicines() {
    return invoke<number>('seed_iraqi_medicines_db');
  },
};

// ===== 18. Currency Service =====
export const currencyService = {
  async convert(amount: number, from: string, to: string) {
    return invoke<number>('convert_currency_db', { amount, fromCurrency: from, toCurrency: to });
  },

  async updateRate(rate: number) {
    return invoke('update_exchange_rate_db', { rate });
  },
};
