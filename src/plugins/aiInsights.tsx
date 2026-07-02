// ========================================
// Sample Plugin: AI Insights (مثال)
// ========================================
// plugin جاهز للمستقبل - غير مفعّل افتراضياً

import { PharmacyPlugin } from '../lib/core/pluginRegistry';
import { Brain, TrendingUp, AlertCircle, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

function AIDashboard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // محاكاة توليد رؤى (في المستقبل سيستدعي AI API)
    setTimeout(() => {
      setInsights([
        {
          type: 'trend',
          icon: TrendingUp,
          title: 'اتجاه تصاعدي في مبيعات المسكنات',
          description: 'زيادة 23% في مبيعات الباراسيتامول خلال آخر أسبوع',
          color: 'emerald',
        },
        {
          type: 'warning',
          icon: AlertCircle,
          title: 'تنبيه: نفاد دواء Panaدول Extra',
          description: 'متوقع النفاد خلال 3 أيام بناءً على معدل البيع',
          color: 'amber',
        },
        {
          type: 'suggestion',
          icon: Sparkles,
          title: 'اقتراح: زيادة مخزون أدوية البرد',
          description: 'قرب موسم الشتاء - يُنصح بزيادة المخزون بنسبة 40%',
          color: 'brand',
        },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <Brain className="w-16 h-16 text-brand-400 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-500">جاري تحليل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50">
      <div className="mb-6">
        <h1 className="section-title">الرؤى الذكية</h1>
        <p className="section-subtitle">تحليلات مدعومة بالذكاء الاصطناعي</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          const colorMap: any = {
            emerald: 'bg-emerald-50 text-emerald-600',
            amber: 'bg-amber-50 text-amber-600',
            brand: 'bg-brand-50 text-brand-600',
          };
          return (
            <div key={i} className="card-elegant p-5">
              <div className={`w-11 h-11 rounded-xl ${colorMap[insight.color]} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">{insight.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{insight.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const aiInsightsPlugin: PharmacyPlugin = {
  name: 'ai-insights',
  version: '0.1.0',
  displayName: 'الرؤى الذكية',
  description: 'تحليلات وتنبؤات مدعومة بالذكاء الاصطناعي',
  icon: Brain,
  author: 'Bunun Mazen Pharmacy',
  
  dashboard: AIDashboard,
  navLabel: 'الرؤى الذكية',
  navOrder: 120,
  
  async onLoad() {
    console.log('[Plugin:AI] Loaded');
  },
  
  async onInvoiceCreated(invoice: any) {
    // في المستقبل: تعليم النموذج بالبيانات الجديدة
    console.log('[Plugin:AI] Learning from invoice:', invoice);
  },
};
