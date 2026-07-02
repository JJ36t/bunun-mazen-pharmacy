import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAccountingStore } from '../accounting/accounting.store';
import { Database, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

export function BackupDashboard() {
  const { medicines } = useInventoryStore();
  const { expenses, cashbox, totalSales, totalProfits } = useAccountingStore();
  const [restorePath, setRestorePath] = useState('');
  const [password, setPassword] = useState('');

  const handleBackup = async () => {
    if (!password) {
      toast.error("يرجى إدخال كلمة مرور لتشفير النسخة الاحتياطية.");
      return;
    }
    toast.loading("جاري إنشاء النسخة الاحتياطية المشفرة...");
    try {
      const backupData = JSON.stringify({ backupDate: new Date().toISOString(), inventory: medicines, accounting: { expenses, cashbox, totalSales, totalProfits } });
      const path = await invoke<string>('create_backup', { data: backupData, password });
      toast.success(`تم إنشاء نسخة احتياطية مشفرة على سطح المكتب.`);
      console.log("Backup saved at:", path);
      setPassword('');
    } catch (e: any) { 
      toast.error('فشل إنشاء النسخة الاحتياطية: ' + e); 
    }
  };

  const handleRestore = async () => {
    if (!restorePath || !password) { 
      toast.error('الرجاء إدخال مسار الملف وكلمة المرور'); 
      return; 
    }
    toast.loading("جاري فك التشفير واستعادة البيانات...");
    try {
      const data = await invoke<string>('restore_backup', { filePath: restorePath, password });
      console.log('Restored Data:', JSON.parse(data));
      toast.success('تم فك التشفير واستعادة البيانات بنجاح! يُفضل إعادة تشغيل التطبيق.');
    } catch (e: any) { 
      toast.error('فشل الاستعادة (تأكد من صحة كلمة المرور): ' + e); 
    }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="mb-6"><h1 className="text-2xl font-bold text-slate-800">النسخ الاحتياطي المشفر</h1><p className="text-sm text-slate-500 mt-1">حماية بيانات الصيدلية بتشفير AES-256</p></div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4"><div className="p-2.5 rounded-lg bg-emerald-50"><Download className="w-5 h-5 text-emerald-600" /></div><h3 className="text-base font-bold text-slate-800">إنشاء نسخة احتياطية</h3></div>
          <p className="text-sm text-slate-500 mb-4">قم بتصدير بيانات النظام مشفرة. احتفظ بكلمة المرور في مكان آمن، لا يمكن استعادة البيانات بدونها!</p>
          <input type="password" placeholder="كلمة مرور التشفير" value={password} onChange={e => setPassword(e.target.value)} className="input mb-3" />
          <button onClick={handleBackup} className="btn-success w-full"><Database className="w-4 h-4" />تشفير وحفظ النسخة</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4"><div className="p-2.5 rounded-lg bg-blue-50"><Upload className="w-5 h-5 text-blue-600" /></div><h3 className="text-base font-bold text-slate-800">استعادة نسخة احتياطية</h3></div>
          <p className="text-sm text-slate-500 mb-4">أدخل مسار الملف المشفر (.enc) وكلمة المرور لفك التشفير.</p>
          <input type="text" placeholder="C:\Users\Desktop\Pharmacy_Backup_xxxx.enc" value={restorePath} onChange={e => setRestorePath(e.target.value)} className="input mb-3 font-mono text-xs" />
          <input type="password" placeholder="كلمة مرور فك التشفير" value={password} onChange={e => setPassword(e.target.value)} className="input mb-3" />
          <button onClick={handleRestore} className="btn-primary w-full">فك التشفير واستعادة</button>
        </div>
      </div>
    </div>
  );
}