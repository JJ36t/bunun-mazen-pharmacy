// ========================================
// Enterprise Management Dashboard
// ========================================
// يدمج: Financial Ledger + Quarantine + System Health + Feature Flags + 
//        Historical Pricing + Expiry Sales + Drug Recall + State Recovery

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { Shield, Activity, Flag, History, Lock, TrendingDown, RotateCcw, RefreshCw, Heart, Database, Server } from 'lucide-react';
import { toast } from 'sonner';

export function EnterpriseDashboard() {
  const [activeTab, setActiveTab] = useState<'health' | 'ledger' | 'quarantine' | 'flags' | 'pricing' | 'expiry' | 'recall'>('health');
  const { medicines, fetchMedicines } = useInventoryStore();
  const { username } = useAuthStore();

  useEffect(() => { fetchMedicines(); }, []);

  const tabs = [
    { key: 'health' as const, label: 'صحة النظام', icon: Activity },
    { key: 'ledger' as const, label: 'الدفتر المحاسبي', icon: Shield },
    { key: 'quarantine' as const, label: 'العزل', icon: Lock },
    { key: 'flags' as const, label: 'الميزات', icon: Flag },
    { key: 'pricing' as const, label: 'تاريخ الأسعار', icon: History },
    { key: 'expiry' as const, label: 'خصومات الانتهاء', icon: TrendingDown },
    { key: 'recall' as const, label: 'استرجاع الأدوية', icon: RotateCcw },
  ];

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">الإدارة المؤسسية</h1>
        <p className="section-subtitle">صحة النظام + الدفتر المحاسبي + العزل + الميزات + الأسعار + الانتهاء + الاسترجاع</p>
      </div>

      <div className="flex gap-1 bg-white p-1 rounded-xl mb-6 border border-slate-200 w-fit overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'health' && <SystemHealthTab />}
      {activeTab === 'ledger' && <LedgerTab />}
      {activeTab === 'quarantine' && <QuarantineTab medicines={medicines} username={username} />}
      {activeTab === 'flags' && <FeatureFlagsTab />}
      {activeTab === 'pricing' && <PricingHistoryTab medicines={medicines} />}
      {activeTab === 'expiry' && <ExpirySalesTab />}
      {activeTab === 'recall' && <DrugRecallTab medicines={medicines} />}
    </div>
  );
}

// ===== 1. System Health =====
function SystemHealthTab() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHealth(); }, []);

  const loadHealth = async () => {
    setLoading(true);
    try { setHealth(await invoke<any>('get_system_health_db')); } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="card-elegant p-12 text-center text-slate-400">جاري التحميل...</div>;
  if (!health) return <div className="card-elegant p-12 text-center text-slate-400">فشل التحميل</div>;

  const metrics = [
    { label: 'حالة قاعدة البيانات', value: health.dbHealthy ? 'سليم' : 'خطأ', icon: Database, color: health.dbHealthy ? 'emerald' : 'rose' },
    { label: 'عدد الجداول', value: health.tableCount, icon: Server, color: 'brand' },
    { label: 'الأدوية (المخزون)', value: health.medicinesCount, icon: Activity, color: 'brand' },
    { label: 'الفواتير', value: health.invoicesCount, icon: Activity, color: 'amber' },
    { label: 'الأدوية العالمية', value: health.globalMedicinesCount || 0, icon: Database, color: 'brand' },
    { label: 'سجلات التدقيق', value: health.auditLogsCount, icon: History, color: 'brand' },
    { label: 'مخزون معزول', value: health.quarantinedCount || 0, icon: Lock, color: health.quarantinedCount > 0 ? 'amber' : 'emerald' },
  ];

  return (
    <div className="space-y-5">
      <div className="card-elegant p-6 bg-gradient-to-r from-emerald-50 to-white border-emerald-200">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl ${health.status === 'healthy' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center`}>
            <Heart className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">حالة النظام: {health.status === 'healthy' ? 'سليم ✅' : 'خطأ ❌'}</h3>
            <p className="text-xs text-slate-500">آخر فحص: {new Date(health.timestamp).toLocaleString('en-GB')}</p>
          </div>
          <button onClick={loadHealth} className="btn-ghost mr-auto"><RefreshCw className="w-4 h-4" /> تحديث</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          const colorMap: any = { emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', brand: 'bg-brand-50 text-brand-600', amber: 'bg-amber-50 text-amber-600' };
          return (
            <div key={i} className="card-elegant p-4 flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl ${colorMap[m.color]} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-500">{m.label}</p><p className="text-xl font-bold text-slate-800 tabular">{m.value}</p></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== 2. Financial Ledger =====
function LedgerTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [b, e] = await Promise.all([
        invoke<any[]>('get_trial_balance_db'),
        invoke<any[]>('get_ledger_entries_db', { startDate: new Date(Date.now() - 30 * 86400000).toISOString(), endDate: new Date().toISOString(), accountCode: null }),
      ]);
      setBalances(b); setEntries(e);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-5">
      <div className="card-elegant p-5">
        <h3 className="text-base font-bold text-slate-800 mb-4">ميزان المراجعة</h3>
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr><th className="table-header text-right p-3">الرمز</th><th className="table-header text-right p-3">الحساب</th><th className="table-header text-right p-3">النوع</th><th className="table-header text-right p-3">مدين</th><th className="table-header text-right p-3">دائن</th></tr>
          </thead>
          <tbody>
            {balances.map((b, i) => (
              <tr key={i} className="table-row">
                <td className="p-3 text-xs font-mono text-slate-500">{b.accountCode}</td>
                <td className="p-3 text-sm font-semibold text-slate-700">{b.accountName}</td>
                <td className="p-3"><span className="badge-neutral">{b.accountType}</span></td>
                <td className="p-3 text-sm font-bold text-emerald-600 tabular">{b.debit > 0 ? b.debit.toFixed(0) : '-'}</td>
                <td className="p-3 text-sm font-bold text-rose-600 tabular">{b.credit > 0 ? b.credit.toFixed(0) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-elegant p-5">
        <h3 className="text-base font-bold text-slate-800 mb-4">آخر القيود (30 يوم)</h3>
        <div className="max-h-64 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60 sticky top-0">
              <tr><th className="table-header text-right p-3">التاريخ</th><th className="table-header text-right p-3">الحساب</th><th className="table-header text-right p-3">مدين</th><th className="table-header text-right p-3">دائن</th><th className="table-header text-right p-3">الوصف</th></tr>
            </thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا توجد قيود بعد</td></tr> :
                entries.map((e, i) => (
                  <tr key={i} className="table-row">
                    <td className="p-3 text-xs text-slate-400 tabular">{new Date(e.entryDate).toLocaleDateString('en-GB')}</td>
                    <td className="p-3 text-sm text-slate-700">{e.accountName}</td>
                    <td className="p-3 text-sm font-bold text-emerald-600 tabular">{e.debit > 0 ? e.debit.toFixed(0) : '-'}</td>
                    <td className="p-3 text-sm font-bold text-rose-600 tabular">{e.credit > 0 ? e.credit.toFixed(0) : '-'}</td>
                    <td className="p-3 text-xs text-slate-500">{e.description || '-'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===== 3. Quarantine =====
function QuarantineTab({ medicines, username }: { medicines: any[]; username: string | null }) {
  const [quarantined, setQuarantined] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [medId, setMedId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('damaged');
  const [notes, setNotes] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setQuarantined(await invoke<any[]>('get_quarantined_stock_db')); } catch (e) { console.error(e); }
  };

  const handleQuarantine = async () => {
    if (!medId || qty <= 0) { toast.error('اختر دواءً وكمية'); return; }
    try {
      await invoke('quarantine_stock_db', { medicineId: medId, batchNumber: null, quantity: qty, reason, notes, quarantinedBy: username || 'unknown' });
      toast.success('تم عزل الدواء');
      setShowForm(false); setMedId(''); setQty(1); setNotes('');
      load();
    } catch (e: any) { toast.error('فشل: ' + e); }
  };

  const handleResolve = async (id: string, resolution: string) => {
    try {
      await invoke('resolve_quarantine_db', { quarantineId: id, resolution, notes: '', resolvedBy: username || 'unknown' });
      toast.success('تم الحل');
      load();
    } catch (e: any) { toast.error('فشل: ' + e); }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-bold text-slate-800">المخزون المعزول ({quarantined.length})</h3>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Lock className="w-4 h-4" /> عزل دواء</button>
      </div>

      {showForm && (
        <div className="card-elegant p-5 animate-slide-up">
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div className="col-span-2"><label className="label">الدواء</label><select value={medId} onChange={e => setMedId(e.target.value)} className="input"><option value="">اختر</option>{medicines.filter((m: any) => !m.isDeleted).map((m: any) => <option key={m.id} value={m.id}>{m.nameAr}</option>)}</select></div>
            <div><label className="label">الكمية</label><input type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} className="input tabular" /></div>
            <div><label className="label">السبب</label><select value={reason} onChange={e => setReason(e.target.value)} className="input"><option value="damaged">تالف</option><option value="expired">منتهي</option><option value="recalled">مسترجع</option><option value="suspicious">مشبوه</option></select></div>
          </div>
          <div className="mb-3"><label className="label">ملاحظات</label><input value={notes} onChange={e => setNotes(e.target.value)} className="input" /></div>
          <button onClick={handleQuarantine} className="btn-danger">عزل</button>
        </div>
      )}

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60"><tr><th className="table-header text-right p-3">الدواء</th><th className="table-header text-right p-3">الكمية</th><th className="table-header text-right p-3">السبب</th><th className="table-header text-right p-3">التاريخ</th><th className="table-header text-right p-3">إجراءات</th></tr></thead>
          <tbody>
            {quarantined.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا يوجد مخزون معزول</td></tr> :
              quarantined.map(q => (
                <tr key={q.id} className="table-row">
                  <td className="p-3 text-sm font-semibold text-slate-700">{q.medicineName}</td>
                  <td className="p-3 text-sm tabular">{q.quantity}</td>
                  <td className="p-3"><span className="badge-warning">{q.reason}</span></td>
                  <td className="p-3 text-xs text-slate-400 tabular">{new Date(q.quarantineDate).toLocaleDateString('en-GB')}</td>
                  <td className="p-3"><div className="flex gap-1"><button onClick={() => handleResolve(q.id, 'released')} className="btn-success text-xs px-2 py-1">إرجاع</button><button onClick={() => handleResolve(q.id, 'disposed')} className="btn-danger text-xs px-2 py-1">إتلاف</button></div></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== 4. Feature Flags =====
function FeatureFlagsTab() {
  const [flags, setFlags] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setFlags(await invoke<any[]>('get_feature_flags_db')); } catch (e) { console.error(e); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try { await invoke('toggle_feature_flag_db', { flagId: id, isEnabled: !enabled }); load(); } catch (e) { console.error(e); }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {flags.map(f => (
        <div key={f.id} className="card-elegant p-4 flex items-center justify-between">
          <div><p className="text-sm font-semibold text-slate-700">{f.displayName}</p><p className="text-xs text-slate-400">{f.description || f.flagName}</p></div>
          <button onClick={() => handleToggle(f.id, f.isEnabled)} className={`relative w-12 h-6 rounded-full transition-colors ${f.isEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${f.isEnabled ? 'left-0.5' : 'right-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ===== 5. Pricing History =====
function PricingHistoryTab({ medicines }: { medicines: any[] }) {
  const [selectedMed, setSelectedMed] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    if (!selectedMed) return;
    try { setHistory(await invoke<any[]>('get_price_history_db', { medicineId: selectedMed })); } catch (e) { console.error(e); }
  };

  useEffect(() => { if (selectedMed) loadHistory(); }, [selectedMed]);

  return (
    <div className="space-y-5">
      <div className="card-elegant p-5">
        <label className="label-lg">اختر دواءً لعرض تاريخ أسعاره</label>
        <select value={selectedMed} onChange={e => setSelectedMed(e.target.value)} className="input">
          <option value="">اختر دواءً</option>
          {medicines.filter((m: any) => !m.isDeleted).map((m: any) => <option key={m.id} value={m.id}>{m.nameAr}</option>)}
        </select>
      </div>
      {selectedMed && (
        <div className="card-elegant overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60"><tr><th className="table-header text-right p-3">الحقل</th><th className="table-header text-right p-3">القديم</th><th className="table-header text-right p-3">الجديد</th><th className="table-header text-right p-3">بواسطة</th><th className="table-header text-right p-3">التاريخ</th></tr></thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا يوجد تاريخ أسعار</td></tr> :
                history.map(h => (
                  <tr key={h.id} className="table-row">
                    <td className="p-3 text-sm font-semibold text-slate-700">{h.fieldName}</td>
                    <td className="p-3 text-sm text-rose-600 tabular">{h.oldValue?.toFixed(0) || '-'}</td>
                    <td className="p-3 text-sm text-emerald-600 tabular">{h.newValue?.toFixed(0)}</td>
                    <td className="p-3 text-xs text-slate-400">{h.changedBy}</td>
                    <td className="p-3 text-xs text-slate-400 tabular">{new Date(h.changeDate).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== 6. Expiry Sales =====
function ExpirySalesTab() {
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setRules(await invoke<any[]>('get_expiry_sale_rules_db')); } catch (e) { console.error(e); }
  };

  return (
    <div className="card-elegant p-6">
      <h3 className="text-base font-bold text-slate-800 mb-4">قواعد الخصم التلقائي قرب الانتهاء</h3>
      <p className="text-xs text-slate-500 mb-4">يتم تطبيق خصم تلقائي على الأدوية قريبة الانتهاء حسب هذه القواعد</p>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div><p className="text-sm font-semibold text-slate-700">عند تبقي {r.daysUntilExpiry} يوم على الانتهاء</p></div>
            <span className="badge-warning text-base px-4 py-2">{r.discountPercentage}% خصم</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== 7. Drug Recall =====
function DrugRecallTab({ medicines: _medicines }: { medicines: any[] }) {
  return (
    <div className="card-elegant p-6">
      <h3 className="text-base font-bold text-slate-800 mb-4">استرجاع الأدوية (Drug Recall)</h3>
      <p className="text-xs text-slate-500 mb-4">نظام استرجاع الدفعات المعطوبة أو المستدعاة من الشركة المصنّعة</p>
      <div className="empty-state py-12">
        <div className="empty-state-icon"><RotateCcw className="w-10 h-10 text-slate-300" /></div>
        <p className="text-slate-400 text-sm">لا توجد استرجاعات حالية</p>
        <p className="text-slate-300 text-xs mt-1">سيتم إضافة استرجاع عند الحاجة</p>
      </div>
    </div>
  );
}
