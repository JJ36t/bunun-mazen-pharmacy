// ========================================
// Intelligence Analytics Dashboard
// ========================================
// تحليلات ذكية: التنبؤ بالطلب + الموسمية + الأدوية الراكدة + اقتراحات إيقاف الشراء

import { useState, useEffect } from 'react';
import { demandForecastService, seasonalDemandService, stopPurchaseService, expiryTransferService } from '../../lib/services/pharmiq_complete';
import { useInventoryStore } from '../inventory/inventory.store';
import { Brain, TrendingUp, Calendar, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function IntelligenceAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<'forecast' | 'seasonal' | 'stop_purchase' | 'expiry_transfer'>('forecast');
  const [medicines, setMedicines] = useState<any[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState('');
  const [forecast, setForecast] = useState<any | null>(null);
  const [seasonal, setSeasonal] = useState<any | null>(null);
  const [stopPurchase, setStopPurchase] = useState<any[]>([]);
  const [expiryTransfers, setExpiryTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { medicines: invMedicines, fetchMedicines } = useInventoryStore();

  useEffect(() => {
    fetchMedicines().then(() => {
      setMedicines(invMedicines.filter((m: any) => !m.isDeleted));
    });
  }, []);

  const handleForecast = async () => {
    if (!selectedMedicine) { toast.error('اختر دواءً'); return; }
    setLoading(true);
    try {
      const result = await demandForecastService.calculate(selectedMedicine, 30);
      setForecast(result);
    } catch (e) { toast.error('فشل التوقع: ' + e); }
    setLoading(false);
  };

  const handleSeasonal = async () => {
    setLoading(true);
    try { setSeasonal(await seasonalDemandService.analyze()); } catch (e) { toast.error('فشل التحليل: ' + e); }
    setLoading(false);
  };

  const handleStopPurchase = async () => {
    setLoading(true);
    try { setStopPurchase(await stopPurchaseService.getSuggestions()); } catch (e) { toast.error('فشل: ' + e); }
    setLoading(false);
  };

  const handleExpiryTransfers = async () => {
    setLoading(true);
    try { setExpiryTransfers(await expiryTransferService.getSuggestions()); } catch (e) { toast.error('فشل: ' + e); }
    setLoading(false);
  };

  const tabs = [
    { key: 'forecast' as const, label: 'التنبؤ بالطلب', icon: Brain },
    { key: 'seasonal' as const, label: 'الموسمية', icon: Calendar },
    { key: 'stop_purchase' as const, label: 'إيقاف الشراء', icon: AlertTriangle },
    { key: 'expiry_transfer' as const, label: 'نقل الصلاحية', icon: ArrowRight },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">التحليلات الذكية</h1>
        <p className="section-subtitle">تنبؤ بالطلب + موسمية + إيقاف شراء + نقل صلاحية</p>
      </div>

      <div className="flex gap-1 bg-white p-1 rounded-xl mb-6 border border-slate-200 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key === 'seasonal') handleSeasonal(); if (tab.key === 'stop_purchase') handleStopPurchase(); if (tab.key === 'expiry_transfer') handleExpiryTransfers(); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'forecast' && (
        <div className="card-elegant p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Brain className="w-4.5 h-4.5 text-brand-700" /></div>
            التنبؤ بالطلب لـ 30 يوم
          </h3>
          <div className="flex gap-3 mb-4">
            <select value={selectedMedicine} onChange={(e) => setSelectedMedicine(e.target.value)} className="input">
              <option value="">اختر دواءً</option>
              {medicines.map((m: any) => <option key={m.id} value={m.id}>{m.nameAr}</option>)}
            </select>
            <button onClick={handleForecast} disabled={loading} className="btn-primary">
              <TrendingUp className="w-4 h-4" /> {loading ? 'جاري...' : 'احسب التوقع'}
            </button>
          </div>
          {forecast && (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-brand-50 text-center"><p className="text-lg font-bold text-brand-700 tabular">{forecast.averageDaily?.toFixed(1)}</p><p className="text-xs text-slate-500">متوسط يومي</p></div>
                <div className="p-3 rounded-lg bg-emerald-50 text-center"><p className="text-lg font-bold text-emerald-700 tabular">{forecast.dataPoints}</p><p className="text-xs text-slate-500">نقاط بيانات</p></div>
                <div className="p-3 rounded-lg bg-amber-50 text-center"><p className="text-lg font-bold text-amber-700 tabular">{forecast.accuracyScore}%</p><p className="text-xs text-slate-500">دقة النموذج</p></div>
                <div className="p-3 rounded-lg bg-rose-50 text-center"><p className="text-lg font-bold text-rose-700">{forecast.trendDirection === 'up' ? '↑' : forecast.trendDirection === 'down' ? '↓' : '→'}</p><p className="text-xs text-slate-500">{forecast.trendDirection === 'up' ? 'صاعد' : forecast.trendDirection === 'down' ? 'هابط' : 'مستقر'}</p></div>
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-2">التوقع اليومي:</p>
              <div className="max-h-80 overflow-auto space-y-1">
                {forecast.forecast?.map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                    <span className="text-xs text-slate-400 w-12">اليوم {f.day}</span>
                    <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-brand-600 h-full" style={{ width: `${Math.min((f.predictedQuantity / (forecast.averageDaily * 2)) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-12 text-left tabular">{f.predictedQuantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'seasonal' && seasonal && (
        <div className="card-elegant p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4">تحليل الموسمية (آخر سنة)</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 rounded-xl bg-brand-50"><p className="text-xs text-slate-500">متوسط الإيراد الشهري</p><p className="text-2xl font-bold text-brand-700 tabular">{seasonal.averageRevenue?.toFixed(0)}</p></div>
            <div className="p-4 rounded-xl bg-amber-50"><p className="text-xs text-slate-500">أشهر الذروة</p><p className="text-sm font-semibold text-amber-700">{seasonal.peakMonths?.join('، ') || 'لا يوجد'}</p></div>
          </div>
          <div className="space-y-2">
            {seasonal.monthlyData?.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700 w-20">{m.monthName}</span>
                <div className="flex-1 bg-slate-200 rounded-full h-6 overflow-hidden">
                  <div className={`h-full ${m.totalRevenue > seasonal.averageRevenue * 1.2 ? 'bg-rose-500' : m.totalRevenue > seasonal.averageRevenue ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${(m.totalRevenue / Math.max(...seasonal.monthlyData.map((x: any) => x.totalRevenue))) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-24 text-left tabular">{m.totalRevenue?.toFixed(0)} د.ع</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'stop_purchase' && (
        <div className="card-elegant overflow-hidden">
          <div className="p-5 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">اقتراحات إيقاف الشراء ({stopPurchase.length})</h3></div>
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr><th className="table-header text-right p-4">الدواء</th><th className="table-header text-right p-4">المخزون</th><th className="table-header text-right p-4">أيام بدون بيع</th><th className="table-header text-right p-4">خسارة متوقعة</th><th className="table-header text-right p-4">التوصية</th></tr>
            </thead>
            <tbody>
              {stopPurchase.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state py-8"><p className="text-slate-400 text-sm">اضغط على التبويب لتحميل البيانات</p></div></td></tr>
              ) : stopPurchase.map((s, i) => (
                <tr key={i} className="table-row">
                  <td className="p-4 text-sm font-semibold text-slate-800">{s.medicineName}</td>
                  <td className="p-4 text-sm tabular">{s.currentStock}</td>
                  <td className="p-4"><span className="badge-warning tabular">{s.daysWithoutSale} يوم</span></td>
                  <td className="p-4 text-sm font-bold text-rose-600 tabular">{s.estimatedLoss?.toFixed(0)} د.ع</td>
                  <td className="p-4 text-xs text-slate-600">{s.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'expiry_transfer' && (
        <div className="card-elegant overflow-hidden">
          <div className="p-5 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">اقتراحات نقل الصلاحية ({expiryTransfers.length})</h3></div>
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr><th className="table-header text-right p-4">الدواء</th><th className="table-header text-right p-4">الانتهاء</th><th className="table-header text-right p-4">الكمية</th><th className="table-header text-right p-4">أيام متبقية</th><th className="table-header text-right p-4">الإلحاح</th></tr>
            </thead>
            <tbody>
              {expiryTransfers.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state py-8"><p className="text-slate-400 text-sm">اضغط على التبويب لتحميل البيانات</p></div></td></tr>
              ) : expiryTransfers.map((t, i) => (
                <tr key={i} className="table-row">
                  <td className="p-4 text-sm font-semibold text-slate-800">{t.medicineName}</td>
                  <td className="p-4 text-sm tabular">{t.expiryDate}</td>
                  <td className="p-4 text-sm tabular">{t.quantity}</td>
                  <td className="p-4"><span className={`badge tabular ${t.daysUntilExpiry < 30 ? 'badge-danger' : t.daysUntilExpiry < 60 ? 'badge-warning' : 'badge-info'}`}>{t.daysUntilExpiry} يوم</span></td>
                  <td className="p-4"><span className={`badge ${t.urgencyLevel === 'critical' ? 'badge-danger' : t.urgencyLevel === 'high' ? 'badge-warning' : 'badge-info'}`}>{t.urgencyLevel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
