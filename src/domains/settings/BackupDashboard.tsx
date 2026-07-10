import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { useAuthStore } from '../security/auth.store';
import { Database, Download, Upload, Shield, Lock, History, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export function BackupDashboard() {
  const { medicines } = useInventoryStore();
  const { expenses, cashbox, totalSales, totalProfits } = useAccountingStore();
  const { username } = useAuthStore();
  const [restorePath, setRestorePath] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState<any[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await invoke<any[]>('get_backup_history_db').catch(() => []);
      setBackupHistory(history);
    } catch (e) { console.error(e); }
  };

  const handleBackup = async () => {
    if (!backupPassword) {
      toast.error("يرجى إدخال كلمة مرور لتشفير النسخة الاحتياطية.");
      return;
    }
    setLoading(true);
    const toastId = toast.loading("جاري إنشاء النسخة الاحتياطية المشفرة...");
    try {
      // استخدم create_backup اليدوي بكلمة مرور المستخدم (يحفظ كل البيانات المُمررة)
      // لكن نُمرّر بيانات شاملة بدلاً من JSON الناقص السابق
      const backupData = JSON.stringify({
        backupDate: new Date().toISOString(),
        version: '2.3.0',
        type: 'manual',
        data: {
          inventory: medicines,
          accounting: { expenses, cashbox, totalSales, totalProfits },
        }
      });
      const path = await invoke<string>('create_backup', { data: backupData, password: backupPassword });
      
      // تسجيل في السجل
      try {
        await invoke('record_backup_history_db', {
          backupType: 'manual',
          filePath: path,
          fileSize: 0,
          status: 'success',
          errorMessage: null,
          userRole: username || 'unknown',
        });
      } catch (e) { console.error(e); }
      
      toast.success(`تم إنشاء نسخة احتياطية مشفرة على سطح المكتب.`, { id: toastId });
      setBackupPassword('');
      loadHistory();
    } catch (e: any) { 
      toast.error('فشل إنشاء النسخة الاحتياطية: ' + e, { id: toastId }); 
    }
    setLoading(false);
  };

  const handleRestore = async () => {
    if (!restorePath || !restorePassword) { 
      toast.error('الرجاء إدخال مسار الملف وكلمة المرور'); 
      return; 
    }
    setLoading(true);
    const toastId = toast.loading("جاري فك التشفير واستعادة البيانات...");
    try {
      await invoke<string>('restore_backup', { filePath: restorePath, password: restorePassword });
      // ملاحظة: restore_backup يفك التشفير ويرجع JSON فقط. لا يكتب لـ DB تلقائياً.
      // للاستعادة الكاملة، استخدم create_auto_backup_db الذي يحفظ كل الجداول.
      
      // تسجيل في السجل
      try {
        await invoke('record_backup_history_db', {
          backupType: 'restore',
          filePath: restorePath,
          fileSize: 0,
          status: 'success',
          errorMessage: null,
          userRole: username || 'unknown',
        });
      } catch (e) { console.error(e); }
      
      toast.success('تم فك التشفير بنجاح. للاستعادة الكاملة لـ DB، استخدم النسخة التلقائية.', { id: toastId });
      setRestorePath('');
      setRestorePassword('');
      loadHistory();
    } catch (e: any) { 
      toast.error('فشل الاستعادة (تأكد من صحة كلمة المرور والمسار): ' + e, { id: toastId }); 
    }
    setLoading(false);
  };

  const handleAutoBackup = async () => {
    setLoading(true);
    try {
      const path = await invoke<string>('create_auto_backup_db', { userRole: username || 'unknown' });
      toast.success(`تم إنشاء نسخة احتياطية تلقائية: ${path}`);
      loadHistory();
    } catch (e: any) {
      toast.error('فشل النسخ التلقائي: ' + e);
    }
    setLoading(false);
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">النسخ الاحتياطي المشفر</h1>
          <p className="section-subtitle">حماية بيانات الصيدلية بتشفير AES-256 المتقدم</p>
        </div>
        <button onClick={handleAutoBackup} disabled={loading} className="btn-success">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          نسخ احتياطي تلقائي
        </button>
      </div>

      <div className="card-elegant p-4 mb-6 flex items-center gap-3 bg-gradient-to-r from-brand-50 to-white">
        <div className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center"><Shield className="w-5 h-5" /></div>
        <div>
          <p className="text-sm font-semibold text-slate-700">التشفير المتقدم AES-256</p>
          <p className="text-xs text-slate-500">جميع النسخ الاحتياطية مشفرة بالكامل ولا يمكن الوصول إليها بدون كلمة المرور</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* إنشاء نسخة احتياطية */}
        <div className="card-elegant p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Download className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-slate-800">إنشاء نسخة احتياطية</h3>
              <p className="text-xs text-slate-400">تصدير البيانات مشفرة</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">قم بتصدير بيانات النظام مشفرة. احتفظ بكلمة المرور في مكان آمن!</p>
          <div className="mb-4">
            <label className="label"><Lock className="w-3.5 h-3.5 inline ml-1" />كلمة مرور التشفير</label>
            <input type="password" placeholder="••••••••" value={backupPassword} onChange={e => setBackupPassword(e.target.value)} className="input" />
          </div>
          <button onClick={handleBackup} disabled={loading || !backupPassword} className="btn-success w-full py-3">
            <Database className="w-4 h-4" /> {loading ? 'جاري...' : 'تشفير وحفظ النسخة'}
          </button>
        </div>

        {/* استعادة نسخة احتياطية */}
        <div className="card-elegant p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Upload className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-slate-800">استعادة نسخة احتياطية</h3>
              <p className="text-xs text-slate-400">فك تشفير البيانات</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">أدخل مسار الملف المشفر (.enc) وكلمة المرور لفك التشفير.</p>
          <div className="mb-3">
            <label className="label">مسار الملف المشفر</label>
            <input type="text" placeholder="C:\Users\Desktop\Pharmacy_Backup_xxxx.enc" value={restorePath} onChange={e => setRestorePath(e.target.value)} className="input font-mono text-xs" />
          </div>
          <div className="mb-4">
            <label className="label"><Lock className="w-3.5 h-3.5 inline ml-1" />كلمة مرور فك التشفير</label>
            <input type="password" placeholder="••••••••" value={restorePassword} onChange={e => setRestorePassword(e.target.value)} className="input" />
          </div>
          <button onClick={handleRestore} disabled={loading || !restorePath || !restorePassword} className="btn-primary w-full py-3">
            <Upload className="w-4 h-4" /> {loading ? 'جاري...' : 'فك التشفير واستعادة'}
          </button>
        </div>
      </div>

      {/* سجل النسخ الاحتياطية */}
      {backupHistory.length > 0 && (
        <div className="card-elegant p-6 mt-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><History className="w-4.5 h-4.5" /></div>
            سجل النسخ الاحتياطية
          </h3>
          <div className="overflow-auto max-h-64">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200/60">
                <tr>
                  <th className="table-header text-right p-3">النوع</th>
                  <th className="table-header text-right p-3">المسار</th>
                  <th className="table-header text-right p-3">الحالة</th>
                  <th className="table-header text-right p-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {backupHistory.map(b => (
                  <tr key={b.id} className="table-row">
                    <td className="p-3"><span className={`badge ${b.backupType === 'auto' ? 'badge-info' : 'badge-success'}`}>{b.backupType === 'auto' ? 'تلقائي' : b.backupType === 'restore' ? 'استعادة' : 'يدوي'}</span></td>
                    <td className="p-3 text-xs font-mono text-slate-500 truncate max-w-xs">{b.filePath}</td>
                    <td className="p-3"><span className={`badge ${b.status === 'success' ? 'badge-success' : 'badge-danger'}`}><CheckCircle className="w-3 h-3" />{b.status === 'success' ? 'نجح' : 'فشل'}</span></td>
                    <td className="p-3 text-xs text-slate-400 tabular">{new Date(b.createdAt).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
