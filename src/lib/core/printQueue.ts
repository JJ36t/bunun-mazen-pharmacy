// ========================================
// Print Queue Manager - إدارة طباعة الانتظار
// ========================================
// يطبي طابور طباعة مع إعادة المحاولة التلقائية

import { invoke } from '@tauri-apps/api/core';
// EventBus مستورد للاستخدام المستقبلي عند نشر أحداث الطباعة

interface PrintJob {
  id: string;
  type: 'receipt' | 'report' | 'barcode';
  printerName: string;
  content: string;
  relatedInvoiceId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  retryCount: number;
  maxRetries: number;
  error?: string;
  createdAt: number;
  processedAt?: number;
}

class PrintQueueManager {
  private queue: PrintJob[] = [];
  private isProcessing = false;
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;
  
  // مستمعو الحالة
  private listeners: Set<(queue: PrintJob[]) => void> = new Set();

  /** إضافة مهمة طباعة للطابور */
  async enqueue(job: Omit<PrintJob, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const printJob: PrintJob = {
      ...job,
      id,
      status: 'queued',
      retryCount: 0,
      maxRetries: job.maxRetries || this.DEFAULT_MAX_RETRIES,
      createdAt: Date.now(),
    };
    
    this.queue.push(printJob);
    this.notifyListeners();
    
    // حفظ في DB (best-effort)
    try {
      await invoke('create_print_job_db', {
        jobType: printJob.type,
        printerName: printJob.printerName,
        content: printJob.content,
        relatedInvoiceId: printJob.relatedInvoiceId || null,
      }).catch(() => {});
    } catch (e) {
      console.error('[PrintQueue] Failed to persist job:', e);
    }
    
    // بدء المعالجة
    this.processQueue();
    
    return id;
  }

  /** معالجة الطابور */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const job = this.queue[0];
      if (job.status === 'completed' || job.status === 'cancelled') {
        this.queue.shift();
        this.notifyListeners();
        continue;
      }
      
      await this.processJob(job);
      
      // إزالة من الطابور إذا اكتملت أو فشلت نهائياً
      const currentStatus = this.queue[0]?.status;
      if (currentStatus === 'completed' || currentStatus === 'failed') {
        this.queue.shift();
      }
      
      this.notifyListeners();
    }
    
    this.isProcessing = false;
  }

  /** معالجة مهمة واحدة */
  private async processJob(job: PrintJob): Promise<void> {
    job.status = 'processing';
    job.processedAt = Date.now();
    this.notifyListeners();
    
    try {
      if (job.type === 'receipt') {
        // طباعة فاتورة حرارية
        const items = JSON.parse(job.content);
        await invoke('print_receipt_direct', {
          printerName: job.printerName,
          pharmacyName: items.pharmacyName || 'صيدلية بنين مازن',
          invoiceNum: items.invoiceNum,
          itemsJson: JSON.stringify(items.items),
          total: items.total,
        });
      }
      
      job.status = 'completed';
      console.log(`[PrintQueue] Job ${job.id} completed`);
      
    } catch (e: any) {
      job.retryCount++;
      job.error = e.toString();
      
      if (job.retryCount >= job.maxRetries) {
        job.status = 'failed';
        console.error(`[PrintQueue] Job ${job.id} failed permanently:`, e);
      } else {
        // إعادة المحاولة بعد تأخير
        job.status = 'queued';
        console.warn(`[PrintQueue] Job ${job.id} retry ${job.retryCount}/${job.maxRetries}`);
        
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
      }
    }
  }

  /** إلغاء مهمة */
  cancel(jobId: string): void {
    const job = this.queue.find(j => j.id === jobId);
    if (job && job.status === 'queued') {
      job.status = 'cancelled';
      this.notifyListeners();
    }
  }

  /** إعادة محاولة مهمة فاشلة */
  retry(jobId: string): void {
    const job = this.queue.find(j => j.id === jobId);
    if (job && job.status === 'failed') {
      job.status = 'queued';
      job.retryCount = 0;
      job.error = undefined;
      this.notifyListeners();
      this.processQueue();
    }
  }

  /** مسح المهام المكتملة */
  clearCompleted(): void {
    this.queue = this.queue.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    this.notifyListeners();
  }

  /** الاشتراك في تحديثات الطابور */
  subscribe(listener: (queue: PrintJob[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** إعلام المستمعين */
  private notifyListeners(): void {
    const snapshot = [...this.queue];
    this.listeners.forEach(l => l(snapshot));
  }

  /** الطابور الحالي */
  getQueue(): PrintJob[] {
    return [...this.queue];
  }

  /** إحصائيات */
  stats() {
    return {
      total: this.queue.length,
      queued: this.queue.filter(j => j.status === 'queued').length,
      processing: this.queue.filter(j => j.status === 'processing').length,
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
    };
  }
}

// Singleton
export const printQueue = new PrintQueueManager();
