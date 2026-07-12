// ========================================
// Crash Recovery Manager
// ========================================
// يسترجع العمليات غير المكتملة بعد الانهيار

import { invoke } from '@tauri-apps/api/core';

class CrashRecoveryManager {
  private pendingOperations: Map<string, { type: string; payload: unknown; userRole: string }> = new Map();
  private isRecovering = false;

  /** تسجيل بداية عملية */
  async startOperation(operationType: string, payload: unknown, userRole: string): Promise<string> {
    const operationId = crypto.randomUUID();
    
    try {
      await invoke('create_journal_entry_db', {
        operationType,
        operationId,
        payload: JSON.stringify(payload),
        userRole,
      });
    } catch (e) {
      console.error('[Recovery] Failed to log operation start:', e);
    }
    
    this.pendingOperations.set(operationId, { type: operationType, payload, userRole });
    return operationId;
  }

  /** تسجيل إكمال عملية */
  async completeOperation(operationId: string): Promise<void> {
    try {
      await invoke('complete_journal_entry_db', { operationId });
    } catch (e) {
      console.error('[Recovery] Failed to log operation completion:', e);
    }
    this.pendingOperations.delete(operationId);
  }

  /** تسجيل فشل عملية */
  async failOperation(operationId: string, error: string): Promise<void> {
    try {
      await invoke('fail_journal_entry_db', { operationId, errorMessage: error });
    } catch (e) {
      console.error('[Recovery] Failed to log operation failure:', e);
    }
    this.pendingOperations.delete(operationId);
  }

  /** استرجاع العمليات غير المكتملة عند بدء التشغيل */
  async recoverPendingOperations(): Promise<{
    recovered: number;
    failed: number;
    details: unknown[];
  }> {
    if (this.isRecovering) {
      return { recovered: 0, failed: 0, details: [] };
    }
    
    this.isRecovering = true;
    const details: unknown[] = [];
    let recovered = 0;
    let failed = 0;
    
    try {
      const pending = await invoke<any[]>('get_pending_journal_entries_db').catch(() => []);
      
      for (const entry of pending) {
        try {
          // محاولة إعادة تنفيذ العملية
          await this.retryOperation(entry);
          recovered++;
          details.push({ id: entry.id, status: 'recovered', type: entry.operation_type });
        } catch (e) {
          failed++;
          details.push({ id: entry.id, status: 'failed', error: (typeof e === "string" ? e : (e as Error)?.message || String(e)), type: entry.operation_type });
        }
      }
      
      if (pending.length > 0) {
        console.log(`[Recovery] Recovery complete: ${recovered} recovered, ${failed} failed`);
      }
    } catch (e) {
      console.error('[Recovery] Failed to recover operations:', e);
    } finally {
      this.isRecovering = false;
    }
    
    return { recovered, failed, details };
  }

  /** إعادة محاولة عملية — مع idempotency عبر operationId */
  private async retryOperation(entry: { operation_type: string; operation_id: string; payload: string; user_role: string }): Promise<void> {
    const payload = JSON.parse(entry.payload);
    const operationId = entry.operation_id; // idempotency key
    
    switch (entry.operation_type) {
      case 'sale':
        // إعادة محاولة تسجيل بيع — مع operationId لمنع التكرار
        await invoke('record_sale_db', {
          discountPercentage: payload.discountPercentage || 0,
          itemsJson: JSON.stringify(payload.items),
          userRole: entry.user_role,
          operationId, // idempotency key — لو سُجّل البيع مسبقاً يُعاد نفسه دون تكرار
        });
        break;
        
      case 'refund':
        await invoke('record_refund_db', {
          totalAmount: payload.totalAmount,
          itemsJson: JSON.stringify(payload.items),
          userRole: entry.user_role,
        });
        break;
        
      case 'purchase':
        await invoke('record_purchase_db', {
          supplierId: payload.supplierId,
          medicineId: payload.medicineId,
          quantity: payload.quantity,
          costPrice: payload.costPrice,
          sellingPrice: payload.sellingPrice,
          wholesalePrice: payload.wholesalePrice,
          userRole: entry.user_role,
        });
        break;
        
      default:
        console.warn(`[Recovery] Unknown operation type: ${entry.operation_type}`);
        // تعليمها كمكتملة لتجنب إعادة المحاولة
        await invoke('complete_journal_entry_db', { operationId }).catch(() => {});
        return; // لا ندعو complete مرة أخرى
    }
    
    await invoke('complete_journal_entry_db', { operationId }).catch(() => {});
  }

  /** فحص صحة النظام عند بدء التشغيل */
  async validateSystemIntegrity(): Promise<{
    isHealthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      // فحص العمليات المعلقة
      const pending = await invoke<any[]>('get_pending_journal_entries_db').catch(() => []);
      if (pending.length > 0) {
        issues.push(`${pending.length} عمليات غير مكتملة تحتاج استرجاع`);
      }
      
      // فحص الـ DB connection
      // (سيتم فحصها تلقائياً عند أي invoke)
      
    } catch (e) {
      issues.push(`فشل فحص النظام: ${e}`);
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
    };
  }
}

// Singleton
export const crashRecovery = new CrashRecoveryManager();
