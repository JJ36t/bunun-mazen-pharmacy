// ========================================
// PharmIQ Complete Services
// ========================================
// خدمات الميزات الناقصة المكملة

import { invoke } from '@tauri-apps/api/core';

// ===== 1. Import Service =====
export const importService = {
  async importCsv(csvData: string, userRole: string) {
    return invoke<any>('import_medicines_csv_db', { csvData, userRole });
  },
};

// ===== 2. Label Printing Service =====
export const labelPrintService = {
  async createJob(labelType: string, medicineId: string, barcode: string, count: number, size: string, data: any, printer: string) {
    return invoke<string>('create_label_print_job_db', {
      labelType, medicineId, barcode, labelCount: count, labelSize: size,
      printData: JSON.stringify(data), printerName: printer,
    });
  },

  async getJobs() {
    return invoke<any[]>('get_label_print_jobs_db');
  },

  async printDirect(labelData: string, printerName: string) {
    return invoke('print_labels_direct_db', { labelData, printerName });
  },
};

// ===== 3. Refund Service =====
export const refundService = {
  async getReasons() {
    return invoke<any[]>('get_refund_reasons_db');
  },

  async recordWithReason(totalAmount: number, items: any[], userRole: string, reasonCode: string, notes: string, approvedBy?: string) {
    return invoke('record_refund_with_reason_db', {
      totalAmount, itemsJson: JSON.stringify(items), userRole,
      refundReasonCode: reasonCode, refundNotes: notes, approvedBy: approvedBy || null,
    });
  },
};

// ===== 4. Cash Drawer Service =====
export const cashDrawerService = {
  async getEvents(shiftId: string) {
    return invoke<any[]>('get_cash_drawer_events_db', { shiftId });
  },

  async recordEvent(shiftId: string, eventType: string, amount: number, description: string, userRole: string) {
    return invoke('record_cash_drawer_event_db', { shiftId, eventType, amount, description, userRole });
  },

  async balance(shiftId: string, countedAmount: number, notes: string, balancedBy: string) {
    return invoke<any>('balance_cash_drawer_db', { shiftId, countedAmount, notes, balancedBy });
  },
};

// ===== 5. Expiry Loss Service =====
export const expiryLossService = {
  async get(startDate: string, endDate: string) {
    return invoke<any[]>('get_expiry_losses_db', { startDate, endDate });
  },

  async record(medicineId: string, batchNumber: string | undefined, expiryDate: string, quantityLost: number, costPerUnit: number, disposalMethod: string, disposalNotes: string, recordedBy: string) {
    return invoke<string>('record_expiry_loss_db', {
      medicineId, batchNumber: batchNumber || null, expiryDate,
      quantityLost, costPerUnit, disposalMethod, disposalNotes, recordedBy,
    });
  },
};

// ===== 6. Expiry Transfer Service =====
export const expiryTransferService = {
  async getSuggestions() {
    return invoke<any[]>('get_expiry_transfer_suggestions_db');
  },
};

// ===== 7. Stop Purchase Service =====
export const stopPurchaseService = {
  async getSuggestions() {
    return invoke<any[]>('get_stop_purchase_suggestions_db');
  },
};

// ===== 8. Supplier Intelligence Extended =====
export const supplierPricingHistoryService = {
  async get(supplierId: string, medicineId?: string) {
    return invoke<any[]>('get_supplier_pricing_history_db', { supplierId, medicineId: medicineId || null });
  },
};

export const supplierReturnsService = {
  async create(supplierId: string, totalAmount: number, reason: string, requestedBy: string) {
    return invoke<string>('create_supplier_return_db', { supplierId, totalAmount, reason, requestedBy });
  },

  async get(supplierId?: string) {
    return invoke<any[]>('get_supplier_returns_db', { supplierId: supplierId || null });
  },
};

// ===== 9. Seasonal Demand Service =====
export const seasonalDemandService = {
  async analyze() {
    return invoke<any>('get_seasonal_demand_analysis_db');
  },
};

// ===== 10. Demand Forecast Service =====
export const demandForecastService = {
  async calculate(medicineId: string, horizonDays = 30) {
    return invoke<any>('calculate_demand_forecast_db', { medicineId, horizonDays });
  },
};

// ===== 11. Parent Drug Group Service =====
export const parentDrugGroupService = {
  async getAll() {
    return invoke<any[]>('get_parent_drug_groups_db');
  },

  async create(groupName: string, scientificName: string, description: string) {
    return invoke<string>('create_parent_drug_group_db', { groupName, scientificName, description });
  },

  async assignDrug(drugId: string, parentGroupId: string) {
    return invoke('assign_drug_to_parent_group_db', { drugId, parentGroupId });
  },
};

// ===== 12. Dosage Compatibility Service =====
export const dosageCompatibilityService = {
  async check(fromForm: string, toForm: string) {
    return invoke<any>('check_dosage_compatibility_db', { fromForm, toForm });
  },
};

// ===== 13. GS1 Parsing Service =====
export const gs1Service = {
  async parse(rawBarcode: string) {
    return invoke<any>('parse_gs1_barcode_db', { rawBarcode });
  },
};

// ===== 14. Multi-Pack Barcode Service =====
export const multiPackBarcodeService = {
  async get(medicineId: string) {
    return invoke<any[]>('get_multi_pack_barcodes_db', { medicineId });
  },

  async add(medicineId: string, packType: string, barcode: string, unitsInPack: number, pricePerPack?: number) {
    return invoke<string>('add_multi_pack_barcode_db', {
      medicineId, packType, barcode, unitsInPack,
      pricePerPack: pricePerPack || null,
    });
  },
};

// ===== 15. Smart Profit Service =====
export const smartProfitService = {
  async calculate(invoiceId: string) {
    return invoke<any>('calculate_smart_profit_db', { invoiceId });
  },
};

// ===== 16. Alias Service =====
export const aliasService = {
  async get(drugId: string) {
    return invoke<any[]>('get_drug_aliases_db', { drugId });
  },

  async add(drugId: string, aliasName: string, aliasType: string) {
    return invoke<string>('add_drug_alias_db', { drugId, aliasName, aliasType });
  },
};

// ===== 17. Scan Mode Service =====
export const scanModeService = {
  async getAll() {
    return invoke<any[]>('get_scan_modes_db');
  },

  async update(modeId: string, soundOnSuccess: boolean, soundOnFailure: boolean, autoAdd: boolean) {
    return invoke('update_scan_mode_db', { modeId, soundOnSuccess, soundOnFailure, autoAdd });
  },
};

// ===== 18. Scan Sounds (Frontend) =====
export const scanSoundService = {
  playSuccess() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { console.error('Sound error:', e); }
  },

  playFailure() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 300;
      oscillator.type = 'square';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) { console.error('Sound error:', e); }
  },

  playWarning() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 500;
      oscillator.type = 'triangle';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) { console.error('Sound error:', e); }
  },
};
