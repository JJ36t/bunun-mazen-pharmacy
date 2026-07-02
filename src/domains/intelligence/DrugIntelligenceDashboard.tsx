// ========================================
// Drug Intelligence Dashboard
// ========================================
// إدارة قاعدة بيانات الأدوية الذكية + البدائل + التفاعلات

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { drugMasterService } from '../../lib/services/pharmiq';
import { Search, Pill, AlertTriangle, Package, Plus, BookOpen, Activity, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function DrugIntelligenceDashboard() {
  const [drugs, setDrugs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<any | null>(null);
  const [substitutes, setSubstitutes] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [needSeed, setNeedSeed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);

  useEffect(() => { fetchDrugs(); }, []);

  const handleSyncToInventory = async () => {
    setSyncing(true);
    try {
      const count = await invoke<number>('sync_drug_master_to_medicines_db', { userRole: 'admin' });
      if (count > 0) {
        toast.success(`تمت مزامنة ${count} دواء إلى المخزون بنجاح`);
      } else {
        toast.info('جميع الأدوية موجودة مسبقاً في المخزون');
      }
    } catch (e) {
      toast.error('فشلت المزامنة: ' + e);
    }
    setSyncing(false);
  };

  const fetchDrugs = async () => {
    setLoading(true);
    try {
      const result = await drugMasterService.getAll();
      setDrugs(result);
      if (result.length === 0) setNeedSeed(true);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      try { setDrugs(await drugMasterService.search(q)); } catch (e) { console.error(e); }
    } else if (!q.trim()) { fetchDrugs(); }
  };

  const handleSelectDrug = async (drug: any) => {
    setSelectedDrug(drug);
    try {
      setSubstitutes(await drugMasterService.getSubstitutes(drug.id));
      setInteractions(await drugMasterService.checkInteractions([drug.id]));
    } catch (e) { console.error(e); }
  };

  const handleSeed = async () => {
    try {
      const count = await invoke<number>('seed_iraqi_medicines_db');
      toast.success(`تم إدراج ${count} دواء عراقي بنجاح`);
      setNeedSeed(false);
      fetchDrugs();
    } catch (e) { toast.error('فشل الإدراج: ' + e); }
  };

  const categoryLabels: any = {
    antibiotics: 'مضادات حيوية', analgesics: 'مسكنات', antihistamines: 'مضادات هيستامين',
    diabetes: 'أدوية السكري', hypertension: 'أدوية الضغط', pediatric: 'أدوية أطفال',
    vitamins: 'فيتامينات', gastrointestinal: 'جهاز هضمي', neurological: 'أعصاب',
    dermatology: 'جلدية', respiratory: 'تنفسي',
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">ذكاء الأدوية</h1>
          <p className="section-subtitle">قاعدة بيانات الأدوية الذكية + البدائل + التفاعلات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSyncToInventory} disabled={syncing} className="btn-success">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'جاري المزامنة...' : 'مزامنة للمخزون'}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> إضافة دواء
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Pill className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي الأدوية</p><p className="text-xl font-bold text-slate-800 tabular">{drugs.length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">أدوية مضبوطة</p><p className="text-xl font-bold text-slate-800 tabular">{drugs.filter(d => d.isControlled).length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">بوصفة طبية</p><p className="text-xl font-bold text-slate-800 tabular">{drugs.filter(d => d.isPrescription).length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><BookOpen className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">بدون وصفة (OTC)</p><p className="text-xl font-bold text-slate-800 tabular">{drugs.filter(d => d.isOtc).length}</p></div>
        </div>
      </div>

      {needSeed && (
        <div className="card-elegant p-5 mb-6 bg-gradient-to-r from-amber-50 to-white border-amber-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><BookOpen className="w-6 h-6" /></div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">قاعدة بيانات الأدوية فارغة</h3>
              <p className="text-xs text-slate-500 mt-0.5">يمكنك إدراج 48 دواء عراقي شائع بنقرة واحدة</p>
            </div>
            <button onClick={handleSeed} className="btn-warning">إدراج الأدوية العراقية</button>
          </div>
        </div>
      )}

      <div className="relative mb-5">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" value={searchQuery} onChange={handleSearch} placeholder="ابحث بالاسم العربي أو العلمي أو التجاري..." className="input-lg pr-12 pl-4 shadow-sm" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 card-elegant overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <th className="table-header text-right p-4">اسم الدواء</th>
                <th className="table-header text-right p-4">الجرعة</th>
                <th className="table-header text-right p-4">الشكل</th>
                <th className="table-header text-right p-4">التصنيف</th>
                <th className="table-header text-right p-4">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">جاري التحميل...</td></tr>
              ) : drugs.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state py-12"><div className="empty-state-icon"><Pill className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لا توجد أدوية</p></div></td></tr>
              ) : drugs.map(drug => (
                <tr key={drug.id} onClick={() => handleSelectDrug(drug)} className="table-row cursor-pointer">
                  <td className="p-4"><div><p className="text-sm font-semibold text-slate-800">{drug.arabicName}</p><p className="text-xs text-slate-400">{drug.tradeName} • {drug.scientificName}</p></div></td>
                  <td className="p-4 text-sm text-slate-600 tabular">{drug.dosageStrength || '-'}</td>
                  <td className="p-4 text-sm text-slate-600">{drug.dosageForm || '-'}</td>
                  <td className="p-4"><span className="badge-info">{categoryLabels[drug.category] || drug.category}</span></td>
                  <td className="p-4"><div className="flex gap-1 flex-wrap">{drug.isOtc && <span className="badge-success">OTC</span>}{drug.isPrescription && <span className="badge-warning">Rx</span>}{drug.isControlled && <span className="badge-danger">مضبوط</span>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-elegant p-5">
          {selectedDrug ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-800">تفاصيل الدواء</h3>
                <button onClick={() => setSelectedDrug(null)} className="btn-icon"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div><p className="text-xs text-slate-400">الاسم العربي</p><p className="text-sm font-semibold text-slate-800">{selectedDrug.arabicName}</p></div>
                <div><p className="text-xs text-slate-400">الاسم التجاري</p><p className="text-sm text-slate-700">{selectedDrug.tradeName}</p></div>
                <div><p className="text-xs text-slate-400">الاسم العلمي</p><p className="text-sm text-slate-700">{selectedDrug.scientificName || '-'}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-slate-400">الجرعة</p><p className="text-sm text-slate-700 tabular">{selectedDrug.dosageStrength || '-'}</p></div>
                  <div><p className="text-xs text-slate-400">الشكل</p><p className="text-sm text-slate-700">{selectedDrug.dosageForm || '-'}</p></div>
                </div>
                <div><p className="text-xs text-slate-400">الشركة المصنّعة</p><p className="text-sm text-slate-700">{selectedDrug.manufacturer || '-'}</p></div>
                {substitutes.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-600 mb-2">البدائل المتاحة</p>
                    <div className="space-y-1.5">
                      {substitutes.map((sub, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                          <div><p className="text-xs font-semibold text-slate-700">{sub.arabicName}</p><p className="text-[10px] text-slate-400">{sub.dosageStrength} • {sub.dosageForm}</p></div>
                          <span className="badge-success text-[10px]">{sub.compatibilityScore}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {interactions.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-rose-600 mb-2">تفاعلات دوائية</p>
                    <div className="space-y-1.5">
                      {interactions.map((inter, i) => (
                        <div key={i} className={`p-2 rounded-lg border ${inter.severity === 'severe' ? 'bg-rose-50 border-rose-200' : inter.severity === 'moderate' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-xs font-semibold text-slate-700">{inter.drugA} + {inter.drugB}</p>
                          <p className="text-[10px] text-slate-500">{inter.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state py-12"><div className="empty-state-icon"><Activity className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">اختر دواءً لعرض التفاصيل</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
