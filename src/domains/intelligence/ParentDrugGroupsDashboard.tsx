// ========================================
// Parent Drug Groups Dashboard
// ========================================
// إدارة مجموعات الأدوية الأم + ربط الأدوية

import { useState, useEffect } from 'react';
import { parentDrugGroupService } from '../../lib/services/pharmiq_complete';
import { drugMasterService } from '../../lib/services/pharmiq';
import { Plus, Link2, Package, Layers, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function ParentDrugGroupsDashboard() {
  const [groups, setGroups] = useState<any[]>([]);
  const [drugs, setDrugs] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newScientificName, setNewScientificName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [assignDrugId, setAssignDrugId] = useState('');

  useEffect(() => {
    loadGroups();
    loadDrugs();
  }, []);

  const loadGroups = async () => {
    try { setGroups(await parentDrugGroupService.getAll()); } catch (e) { console.error(e); }
  };

  const loadDrugs = async () => {
    try { setDrugs(await drugMasterService.getAll()); } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    if (!newGroupName.trim()) { toast.error('أدخل اسم المجموعة'); return; }
    try {
      await parentDrugGroupService.create(newGroupName, newScientificName, newDescription);
      toast.success('تم إنشاء المجموعة');
      setNewGroupName(''); setNewScientificName(''); setNewDescription('');
      setShowCreateForm(false);
      loadGroups();
    } catch (e) { toast.error('فشل الإنشاء: ' + e); }
  };

  const handleAssign = async () => {
    if (!selectedGroup || !assignDrugId) { toast.error('اختر مجموعة ودواء'); return; }
    try {
      await parentDrugGroupService.assignDrug(assignDrugId, selectedGroup);
      toast.success('تم ربط الدواء بالمجموعة');
      setAssignDrugId('');
      loadGroups();
    } catch (e) { toast.error('فشل الربط: ' + e); }
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">مجموعات الأدوية الأم</h1>
          <p className="section-subtitle">تجميع الأسماء التجارية المختلفة تحت هوية دواء موحدة</p>
        </div>
        <button onClick={() => setShowCreateForm(!showCreateForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> مجموعة جديدة
        </button>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Layers className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">إجمالي المجموعات</p><p className="text-xl font-bold text-slate-800 tabular">{groups.length}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">أدوى مرتبطة</p><p className="text-xl font-bold text-slate-800 tabular">{groups.reduce((s, g) => s + g.drugCount, 0)}</p></div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Link2 className="w-5 h-5" /></div>
          <div><p className="text-xs text-slate-500">أدوى غير مرتبطة</p><p className="text-xl font-bold text-slate-800 tabular">{drugs.length - groups.reduce((s, g) => s + g.drugCount, 0)}</p></div>
        </div>
      </div>

      {/* نموذج إنشاء مجموعة */}
      {showCreateForm && (
        <div className="card-elegant p-5 mb-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-800">مجموعة جديدة</h3>
            <button onClick={() => setShowCreateForm(false)} className="btn-icon"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="label">اسم المجموعة *</label><input className="input" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="مثال: باراسيتامول" /></div>
            <div><label className="label">الاسم العلمي</label><input className="input" value={newScientificName} onChange={(e) => setNewScientificName(e.target.value)} placeholder="Paracetamol" /></div>
            <div><label className="label">الوصف</label><input className="input" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="وصف المجموعة" /></div>
          </div>
          <button onClick={handleCreate} className="btn-success"><CheckCircle className="w-4 h-4" /> إنشاء</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* قائمة المجموعات */}
        <div className="card-elegant overflow-hidden">
          <div className="p-4 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">المجموعات</h3></div>
          <div className="max-h-[500px] overflow-auto">
            {groups.length === 0 ? (
              <div className="empty-state py-12"><div className="empty-state-icon"><Layers className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">لا توجد مجموعات</p></div>
            ) : groups.map(g => (
              <div key={g.id} onClick={() => setSelectedGroup(g.id)} className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${selectedGroup === g.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{g.groupName}</p>
                    <p className="text-xs text-slate-400">{g.scientificName || '-'}</p>
                  </div>
                  <span className="badge-info">{g.drugCount} دواء</span>
                </div>
                {g.description && <p className="text-xs text-slate-500 mt-1">{g.description}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* ربط الأدوية */}
        <div className="card-elegant p-5">
          <h3 className="text-base font-bold text-slate-800 mb-4">ربط دواء بمجموعة</h3>
          {selectedGroup ? (
            <div>
              <div className="p-3 rounded-xl bg-brand-50 mb-4">
                <p className="text-xs text-slate-500">المجموعة المحددة</p>
                <p className="text-sm font-bold text-brand-700">{groups.find(g => g.id === selectedGroup)?.groupName}</p>
              </div>
              <label className="label">اختر الدواء</label>
              <select value={assignDrugId} onChange={(e) => setAssignDrugId(e.target.value)} className="input mb-3">
                <option value="">اختر دواءً</option>
                {drugs.map(d => <option key={d.id} value={d.id}>{d.arabicName} ({d.tradeName})</option>)}
              </select>
              <button onClick={handleAssign} disabled={!assignDrugId} className="btn-primary w-full">
                <Link2 className="w-4 h-4" /> ربط الدواء
              </button>
            </div>
          ) : (
            <div className="empty-state py-12"><div className="empty-state-icon"><Link2 className="w-8 h-8 text-slate-300" /></div><p className="text-slate-400 text-sm">اختر مجموعة من القائمة</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
