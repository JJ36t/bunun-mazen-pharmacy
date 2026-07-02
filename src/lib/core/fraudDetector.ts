// ========================================
// Fraud Detector - كاشف الاحتيال
// ========================================
// يكتشف العمليات المشبوهة وينشئ تنبيهات

import { invoke } from '@tauri-apps/api/core';
import { eventBus, EventNames } from './eventBus';

type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

type FraudType = 
  | 'suspicious_refund'
  | 'repeated_deletions'
  | 'unusual_discount'
  | 'abnormal_cashier_behavior'
  | 'inventory_manipulation'
  | 'after_hours_activity'
  | 'rapid_succession';

interface FraudContext {
  userRole?: string;
  amount?: number;
  description?: string;
  relatedId?: string;
  metadata?: Record<string, any>;
}

class FraudDetector {
  // عتبات الكشف
  private readonly THRESHOLDS = {
    highDiscount: 30,           // خصم > 30% مشبوه
    refundCountPerDay: 5,       // أكثر من 5 مرتجعات/يوم
    deletionCountPerHour: 10,   // أكثر من 10 حذفات/ساعة
    refundAmount: 100000,       // مرتجع > 100,000 د.ع
    rapidSuccessionMs: 5000,    // عمليات متتالية سريعة
    afterHoursStart: 22,        // بعد الساعة 10 مساءً
    afterHoursEnd: 6,           // قبل الساعة 6 صباحاً
  };

  // عدادات الجلسة الحالية
  private sessionCounts = {
    refunds: 0,
    deletions: 0,
    discounts: 0,
    lastOperationTime: 0,
  };

  /** فحص الخصم المشبوه */
  checkDiscount(userRole: string, discountPercentage: number, invoiceTotal: number): void {
    if (discountPercentage >= this.THRESHOLDS.highDiscount) {
      this.reportFraud(
        'unusual_discount',
        'high',
        {
          userRole,
          amount: invoiceTotal,
          description: `خصم مرتفع: ${discountPercentage}% على فاتورة بقيمة ${invoiceTotal}`,
          metadata: { discountPercentage, invoiceTotal },
        }
      );
    }
    this.sessionCounts.discounts++;
  }

  /** فحص المرتجع المشبوه */
  checkRefund(userRole: string, refundAmount: number, invoiceId?: string): void {
    this.sessionCounts.refunds++;
    
    // مرتجع بمبلغ كبير
    if (refundAmount >= this.THRESHOLDS.refundAmount) {
      this.reportFraud(
        'suspicious_refund',
        'high',
        {
          userRole,
          amount: refundAmount,
          description: `مرتجع بمبلغ كبير: ${refundAmount} د.ع`,
          relatedId: invoiceId,
          metadata: { refundAmount },
        }
      );
    }
    
    // مرتجعات متعددة في نفس اليوم
    if (this.sessionCounts.refunds >= this.THRESHOLDS.refundCountPerDay) {
      this.reportFraud(
        'suspicious_refund',
        'medium',
        {
          userRole,
          description: `عدد مرتجعات مرتفع في الجلسة: ${this.sessionCounts.refunds}`,
          metadata: { count: this.sessionCounts.refunds },
        }
      );
    }
  }

  /** فحص الحذف المتكرر */
  checkDeletion(userRole: string, itemType: string, itemName: string): void {
    this.sessionCounts.deletions++;
    
    if (this.sessionCounts.deletions >= this.THRESHOLDS.deletionCountPerHour) {
      this.reportFraud(
        'repeated_deletions',
        'medium',
        {
          userRole,
          description: `حذف ${this.sessionCounts.deletions} عناصر في جلسة قصيرة (${itemType}: ${itemName})`,
          metadata: { count: this.sessionCounts.deletions, itemType },
        }
      );
    }
  }

  /** فحص النشاط في ساعات متأخرة */
  checkAfterHoursActivity(userRole: string, action: string): void {
    const hour = new Date().getHours();
    if (hour >= this.THRESHOLDS.afterHoursStart || hour < this.THRESHOLDS.afterHoursEnd) {
      this.reportFraud(
        'after_hours_activity',
        'low',
        {
          userRole,
          description: `نشاط في ساعات متأخرة (${hour}:00): ${action}`,
          metadata: { hour, action },
        }
      );
    }
  }

  /** فحص العمليات المتتالية السريعة */
  checkRapidSuccession(userRole: string, operation: string): void {
    const now = Date.now();
    if (this.sessionCounts.lastOperationTime > 0) {
      const diff = now - this.sessionCounts.lastOperationTime;
      if (diff < this.THRESHOLDS.rapidSuccessionMs) {
        this.reportFraud(
          'rapid_succession',
          'low',
          {
            userRole,
            description: `عمليات متتالية سريعة (${diff}ms بين العمليات): ${operation}`,
            metadata: { diff, operation },
          }
        );
      }
    }
    this.sessionCounts.lastOperationTime = now;
  }

  /** فحص تلاعب المخزون */
  checkInventoryAdjustment(userRole: string, medicineId: string, adjustment: number, currentQty: number): void {
    // تعديل كبير في الكمية
    if (Math.abs(adjustment) > 100 || (currentQty + adjustment) < 0) {
      this.reportFraud(
        'inventory_manipulation',
        'high',
        {
          userRole,
          description: `تعديل مخزون كبير: ${adjustment} على الدواء ${medicineId} (الحالي: ${currentQty})`,
          relatedId: medicineId,
          metadata: { adjustment, currentQty },
        }
      );
    }
  }

  /** إعادة تعيين عدادات الجلسة */
  resetSession(): void {
    this.sessionCounts = {
      refunds: 0,
      deletions: 0,
      discounts: 0,
      lastOperationTime: 0,
    };
  }

  /** إبلاغ عن احتيال */
  private async reportFraud(
    type: FraudType,
    severity: FraudSeverity,
    context: FraudContext
  ): Promise<void> {
    const alert = {
      type,
      severity,
      ...context,
      timestamp: new Date().toISOString(),
    };
    
    console.warn(`[Fraud] ${severity.toUpperCase()}: ${type}`, alert);
    
    // نشر حدث
    eventBus.emit(EventNames.FRAUD_DETECTED, alert);
    
    // حفظ في قاعدة البيانات (best-effort)
    try {
      await invoke('create_fraud_alert_db', {
        alertType: type,
        severity,
        userRole: context.userRole || 'Unknown',
        description: context.description || '',
        relatedId: context.relatedId || null,
        metadata: JSON.stringify(context.metadata || {}),
      });
    } catch (e) {
      console.error('[Fraud] Failed to save alert:', e);
    }
  }

  /** الحصول على التنبيهات */
  async getAlerts(unresolvedOnly = true): Promise<any[]> {
    try {
      return await invoke<any[]>('get_fraud_alerts_db', { unresolvedOnly });
    } catch (e) {
      console.error('[Fraud] Failed to fetch alerts:', e);
      return [];
    }
  }

  /** حل تنبيه */
  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    try {
      await invoke('resolve_fraud_alert_db', { alertId, resolvedBy });
    } catch (e) {
      console.error('[Fraud] Failed to resolve alert:', e);
    }
  }
}

// Singleton
export const fraudDetector = new FraudDetector();
