// ========================================
// PharmIQ Services (Cleaned)
// ========================================
// خدمات أساسية فقط: باركود + وصفات + جرد + عملات

import { invoke } from '@tauri-apps/api/core';

// ===== 1. Barcode Intelligence Service =====
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

// ===== 2. Payment Methods Service =====
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

// ===== 3. Prescription Service =====
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

// ===== 4. Loyalty Service =====
export const loyaltyService = {
  async getPoints(patientId: string) {
    return invoke<any>('get_patient_loyalty_db', { patientId });
  },

  async redeem(patientId: string, points: number, description: string) {
    return invoke('redeem_loyalty_points_db', { patientId, points, description });
  },
};

// ===== 5. Stock Count Service (الجرد) =====
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

// ===== 6. Controlled Medicines =====
export const controlledMedicineService = {
  async check(medicineId: string) {
    return invoke<any>('check_controlled_medicine_db', { medicineId });
  },
};

// ===== 7. Seed Iraqi Medicines =====
export const seedService = {
  async seedIraqiMedicines() {
    return invoke<number>('seed_iraqi_medicines_db');
  },
};

// ===== 8. Currency Service =====
export const currencyService = {
  async convert(amount: number, from: string, to: string) {
    return invoke<number>('convert_currency_db', { amount, fromCurrency: from, toCurrency: to });
  },

  async updateRate(rate: number) {
    return invoke('update_exchange_rate_db', { rate });
  },
};
