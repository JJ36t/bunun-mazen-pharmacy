import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { Database, Download, Upload, Shield, Lock } from 'lucide-react';
import { toast } from 'sonner';

export function BackupDashboard() {
  const { medicines } = useInventoryStore();
  const { expenses, cashbox, totalSales, totalProfits } = useAccountingStore();
  const [restorePath, setRestorePath] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  const handleBackup = async () => {
    if (!backupPassword) {
      toast.error("يرجى إدخال كلمة مرور لتشفير النسخة الاحتياطية.");
      return;
    }
    toast.loading("جاري إنشاء النسخة الاحتياطية المشفرة...");
    try {
      const backupData = JSON.stringify({ backupDate: new Date().toISOString(), inventory: medicines, accounting: { expenses, cashbox, totalSales, totalProfits } });
      const path = await invoke<string>('create_backup', { data: backupData, password: backupPassword });
      toast.success(`تم إنشاء نسخة احتياطية مشفرة على سطح المكتب.`);
      console.log("Backup saved at:", path);
      setBackupPassword('');
    } catch (e: any) { 
      toast.error('فشل إنشاء النسخة الاحتياطية: ' + e); 
    }
  };

  const handleRestore = async () => {
    if (!restorePath || !restorePassword) { 
      toast.error('الرجاء إدخال مسار الملف وكلمة المرور'); 
      return; 
    }
    toast.loading("جاري فك التشفير واستعادة البيانات...");
    try {
      const data = await invoke<string>('restore_backup', { filePath: restorePath, password: restorePassword });
      console.log('Restored Data:', JSON.parse(data));
      toast.success('تم فك التشفير واستعادة البيانات بنجاح! يُفضل إعادة تشغيل التطبيق.');
    } catch (e: any) { 
      toast.error('فشل الاستعادة (تأكد من صحة كلمة المرور): ' + e); 
    }
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">النسخ الاحتياطي المشفر</h1>
        <p className="section-subtitle">حماية بيانات الصيدلية بتشفير AES-256 المتقدم</p>
      </div>

      {/* بطاقة معلومات */}
      <div className="card-elegant p-4 mb-6 flex items-center gap-3 bg-gradient-to-r from-brand-50 to-white">
        <div className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">التشفير المتقدم AES-256</p>
          <p className="text-xs text-slate-500">جميع النسخ الاحتياطية مشفرة بالكامل ولا يمكن الوصول إليها بدون كلمة المرور</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* إنشاء نسخة احتياطية */}
        <div className="card-elegant p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">إنشاء نسخة احتياطية</h3>
              <p className="text-xs text-slate-400">تصدير البيانات مشفرة</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">قم بتصدير بيانات النظام مشفرة. احتفظ بكلمة المرور في مكان آمن، لا يمكن استعادة البيانات بدونها!</p>
          <div className="mb-4">
            <label className="label">
              <Lock className="w-3.5 h-3.5 inline ml-1" />
              كلمة مرور التشفير
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={backupPassword} 
              onChange={e => setBackupPassword(e.target.value)} 
              className="input" 
            />
          </div>
          <button onClick={handleBackup} className="btn-success w-full py-3">
            <Database className="w-4 h-4" />
            تشفير وحفظ النسخة
          </button>
        </div>

        {/* استعادة نسخة احتياطية */}
        <div className="card-elegant p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">استعادة نسخة احتياطية</h3>
              <p className="text-xs text-slate-400">فك تشفير البيانات</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">أدخل مسار الملف المشفر (.enc) وكلمة المرور لفك التشفير.</p>
          <div className="mb-3">
            <label className="label">مسار الملف المشفر</label>
            <input 
              type="text" 
              placeholder="C:\Users\Desktop\Pharmacy_Backup_xxxx.enc" 
              value={restorePath} 
              onChange={e => setRestorePath(e.target.value)} 
              className="input font-mono text-xs" 
            />
          </div>
          <div className="mb-4">
            <label className="label">
              <Lock className="w-3.5 h-3.5 inline ml-1" />
              كلمة مرور فك التشفير
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={restorePassword} 
              onChange={e => setRestorePassword(e.target.value)} 
              className="input" 
            />
          </div>
          <button onClick={handleRestore} className="btn-primary w-full py-3">
            <Upload className="w-4 h-4" />
            فك التشفير واستعادة
          </button>
        </div>
      </div>
    </div>
  );
}
