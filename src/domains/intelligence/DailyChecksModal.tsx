// ========================================
// Daily Inventory Checks Modal
// ========================================
// يظهر تلقائياً عند بدء التطبيق
// يعرض: منتهي + قارب الانتهاء + مخزون منخفض

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, AlertOctagon, AlertTriangle, TrendingDown, Package } from 'lucide-react';

interface DailyChecksModalProps {
  onClose: () => void;
}

export function DailyChecksModal({ onClose }: DailyChecksModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChecks();
  }, []);

  const loadChecks = async () => {
    setLoading(true);
    try {
      const result = await invoke<any>('get_daily_inventory_checks_db');
      setData(result);
    } catch (e) {
      console.error('Daily checks failed:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-brand-900/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 shadow-2xl w-[400px] text-center">
          <div className="w-10 h-10 border-4 border-brand-100 border-t-brand-700 rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">جاري فحص المخزون...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { expired, expiringSoon, lowStock, summary } = data;
  const totalAlerts = summary.totalAlerts;

  // لو ما فيه تنبيهات، لا تظهر النافذة (السلوك الأصلي)
  if (totalAlerts === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-brand-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] overflow-auto">

        {/* ===== Header ===== */}
        <div className="px-6 py-5 flex items-center justify-between bg-gradient-to-l from-amber-50 to-white border-b border-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-100">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">تنبيهات المخزون ({totalAlerts})</h3>
              <p className="text-xs text-slate-500">راجع التنبيهات التالية</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* ===== بطاقات ملخص ===== */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className={`rounded-xl p-4 text-center border-2 ${summary.expiredCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
              <AlertOctagon className={`w-6 h-6 mx-auto mb-1 ${summary.expiredCount > 0 ? 'text-rose-600' : 'text-slate-300'}`} />
              <p className={`text-2xl font-bold tabular ${summary.expiredCount > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{summary.expiredCount}</p>
              <p className={`text-xs ${summary.expiredCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>منتهي</p>
            </div>
            <div className={`rounded-xl p-4 text-center border-2 ${summary.expiringSoonCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
              <AlertTriangle className={`w-6 h-6 mx-auto mb-1 ${summary.expiringSoonCount > 0 ? 'text-amber-600' : 'text-slate-300'}`} />
              <p className={`text-2xl font-bold tabular ${summary.expiringSoonCount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{summary.expiringSoonCount}</p>
              <p className={`text-xs ${summary.expiringSoonCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>قارب الانتهاء</p>
            </div>
            <div className={`rounded-xl p-4 text-center border-2 ${summary.lowStockCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-100'}`}>
              <TrendingDown className={`w-6 h-6 mx-auto mb-1 ${summary.lowStockCount > 0 ? 'text-yellow-600' : 'text-slate-300'}`} />
              <p className={`text-2xl font-bold tabular ${summary.lowStockCount > 0 ? 'text-yellow-700' : 'text-slate-400'}`}>{summary.lowStockCount}</p>
              <p className={`text-xs ${summary.lowStockCount > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>مخزون منخفض</p>
            </div>
          </div>

          {/* ===== منتهي الصلاحية ===== */}
          {expired.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                <h4 className="text-sm font-bold text-rose-700">منتهي الصلاحية — أزل من الرف فوراً</h4>
              </div>
              <div className="space-y-1 max-h-32 overflow-auto bg-rose-50/50 rounded-xl p-2 border border-rose-100">
                {expired.map((m: unknown) => (
                  <div key={m.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-rose-100">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-rose-400" />
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                    </div>
                    <p className="text-xs text-rose-600 tabular">انتهى: {m.expiryDate} • كمية: {m.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== قارب الانتهاء ===== */}
          {expiringSoon.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-amber-700">قارب الانتهاء</h4>
              </div>
              <div className="space-y-1 max-h-32 overflow-auto bg-amber-50/50 rounded-xl p-2 border border-amber-100">
                {expiringSoon.map((m: unknown) => (
                  <div key={m.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                    </div>
                    <p className="text-xs text-amber-600 tabular">باقي {m.daysLeft} يوم • كمية: {m.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== مخزون منخفض ===== */}
          {lowStock.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-yellow-600" />
                <h4 className="text-sm font-bold text-yellow-700">مخزون منخفض — يحتاج تزويد</h4>
              </div>
              <div className="space-y-1 max-h-32 overflow-auto bg-yellow-50/50 rounded-xl p-2 border border-yellow-100">
                {lowStock.map((m: unknown) => (
                  <div key={m.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-yellow-100">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-yellow-400" />
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                    </div>
                    <p className="text-xs text-yellow-600 tabular">متبقي: {m.quantity} وحدة</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== زر الإغلاق ===== */}
          <button onClick={onClose} className="btn-primary w-full py-3 mt-2">
            فهمت، متابعة العمل
          </button>
        </div>
      </div>
    </div>
  );
}
