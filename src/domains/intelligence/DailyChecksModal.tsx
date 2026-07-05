// ========================================
// Daily Inventory Checks Modal
// ========================================
// يظهر تلقائياً عند بدء التطبيق
// يعرض: منتهي + قارب الانتهاء + مخزون منخفض

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, AlertOctagon, AlertTriangle, Calendar, TrendingDown } from 'lucide-react';

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
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 shadow-2xl w-[480px] text-center">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">جاري فحص المخزون...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { expired, expiringSoon, lowStock, summary } = data;
  const totalAlerts = summary.totalAlerts;

  // لو ما في تنبيهات، ما تظهر النافذة
  if (totalAlerts === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-[640px] max-h-[85vh] overflow-auto animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
              تنبيهات المخزون اليومية
            </h3>
            <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-xs text-slate-500 mt-1">{totalAlerts} تنبيه يحتاج انتباهك</p>
        </div>

        <div className="p-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
              <AlertOctagon className="w-6 h-6 text-rose-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-rose-700 tabular">{summary.expiredCount}</p>
              <p className="text-xs text-rose-600">منتهي الصلاحية</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <Calendar className="w-6 h-6 text-amber-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-700 tabular">{summary.expiringSoonCount}</p>
              <p className="text-xs text-amber-600">قارب الانتهاء</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
              <TrendingDown className="w-6 h-6 text-yellow-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-yellow-700 tabular">{summary.lowStockCount}</p>
              <p className="text-xs text-yellow-600">مخزون منخفض</p>
            </div>
          </div>

          {/* Expired */}
          {expired.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4" />
                منتهي الصلاحية ({expired.length}) — أزل من الرف فوراً
              </h4>
              <div className="space-y-1 max-h-40 overflow-auto">
                {expired.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg p-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                      <p className="text-xs text-rose-600">انتهى: {m.expiryDate} • كمية: {m.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring Soon */}
          {expiringSoon.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                قارب الانتهاء ({expiringSoon.length})
              </h4>
              <div className="space-y-1 max-h-40 overflow-auto">
                {expiringSoon.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                      <p className="text-xs text-amber-600">ينتهي خلال {m.daysLeft} يوم • كمية: {m.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Stock */}
          {lowStock.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-yellow-700 mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                مخزون منخفض ({lowStock.length}) — يحتاج تزويد
              </h4>
              <div className="space-y-1 max-h-40 overflow-auto">
                {lowStock.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.nameAr}</p>
                      <p className="text-xs text-yellow-600">متبقي: {m.quantity} وحدة (الحد: {m.threshold})</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
            <button onClick={onClose} className="btn-primary flex-1 py-3">
              فهمت، متابعة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
