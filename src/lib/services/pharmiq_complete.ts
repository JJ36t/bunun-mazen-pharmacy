// ========================================
// PharmIQ Complete Services (Cleaned)
// ========================================
// خدمات أساسية فقط — كل الأوامر مسجّلة وتشتغل

import { invoke } from '@tauri-apps/api/core';

// ===== 1. Import Service (استيراد CSV) =====
export const importService = {
  async importCsv(csvData: string, userRole: string) {
    return invoke<any>('import_medicines_csv_db', { csvData, userRole });
  },
};

// ===== 2. Label Printing Service =====
export const labelPrintService = {
  async createJob(labelType: string, medicineId: string, barcode: string, count: number, size: string, data: unknown, printer: string) {
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

  async recordWithReason(totalAmount: number, items: unknown[], userRole: string, reasonCode: string, notes: string, approvedBy?: string) {
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

// ===== 6. Parent Drug Group Service =====
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

// ===== 7. Smart Profit Service =====
export const smartProfitService = {
  async calculate(invoiceId: string) {
    return invoke<any>('calculate_smart_profit_db', { invoiceId });
  },
};

// ===== 8. Scan Sounds (Frontend only — لا تحتاج backend) =====
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
