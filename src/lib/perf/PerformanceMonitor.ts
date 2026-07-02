// ========================================
// Performance Monitor - مراقب الأداء
// ========================================
// لقياس أداء العمليات والتأكد من تحقيق الأهداف

interface MetricRecord {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  context?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: Map<string, MetricRecord[]> = new Map();
  private readonly MAX_RECORDS_PER_METRIC = 100;
  
  // الأهداف (Performance Targets من البرومت)
  private readonly TARGETS = {
    search: 50,        // < 50ms
    invoiceOpen: 100,  // < 100ms
    startup: 3000,     // < 3s
  };

  /** قياس وقت عملية */
  async measure<T>(name: string, fn: () => Promise<T>, context?: Record<string, any>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.record(name, duration, 'ms', context);
      return result;
    } catch (e) {
      const duration = performance.now() - start;
      this.record(`${name}_error`, duration, 'ms', { ...context, error: String(e) });
      throw e;
    }
  }

  /** قياس وقت عملية متزامنة */
  measureSync<T>(name: string, fn: () => T, context?: Record<string, any>): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.record(name, duration, 'ms', context);
      return result;
    } catch (e) {
      const duration = performance.now() - start;
      this.record(`${name}_error`, duration, 'ms', { ...context, error: String(e) });
      throw e;
    }
  }

  /** تسجيل مقياس */
  record(name: string, value: number, unit: string, context?: Record<string, any>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const records = this.metrics.get(name)!;
    records.push({
      name,
      value,
      unit,
      timestamp: Date.now(),
      context,
    });
    
    // الحد الأقصى للسجلات
    if (records.length > this.MAX_RECORDS_PER_METRIC) {
      records.shift();
    }
    
    // تحذير عند تجاوز الأهداف
    this.checkTarget(name, value);
  }

  /** فحص الهدف */
  private checkTarget(name: string, value: number): void {
    let target: number | null = null;
    if (name.startsWith('search')) target = this.TARGETS.search;
    else if (name.startsWith('invoice')) target = this.TARGETS.invoiceOpen;
    else if (name === 'startup') target = this.TARGETS.startup;
    
    if (target && value > target) {
      console.warn(`[Perf] ${name} exceeded target: ${value.toFixed(2)}ms > ${target}ms`);
    }
  }

  /** الحصول على إحصائيات مقياس */
  getStats(name: string) {
    const records = this.metrics.get(name);
    if (!records || records.length === 0) return null;
    
    const values = records.map(r => r.value);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    
    return {
      count: values.length,
      avg,
      min,
      max,
      median,
      lastValue: values[values.length - 1],
    };
  }

  /** جميع المقاييس */
  getAllStats() {
    const result: Record<string, any> = {};
    for (const name of this.metrics.keys()) {
      result[name] = this.getStats(name);
    }
    return result;
  }

  /** مقارنة بالأهداف */
  getHealthReport() {
    return {
      search: this.getStats('search'),
      invoiceOpen: this.getStats('invoice_open'),
      startup: this.getStats('startup'),
      targets: this.TARGETS,
      isHealthy: this.checkHealth(),
    };
  }

  /** فحص الصحة العامة */
  private checkHealth(): boolean {
    const searchStats = this.getStats('search');
    const invoiceStats = this.getStats('invoice_open');
    
    if (searchStats && searchStats.avg > this.TARGETS.search) return false;
    if (invoiceStats && invoiceStats.avg > this.TARGETS.invoiceOpen) return false;
    
    return true;
  }

  /** مسح جميع المقاييس */
  clear(): void {
    this.metrics.clear();
  }
}

// Singleton
export const perfMonitor = new PerformanceMonitor();

// Hook لقياس وقت الرندر
export function useRenderTime(componentName: string) {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    perfMonitor.record(`render_${componentName}`, duration, 'ms');
  };
}
