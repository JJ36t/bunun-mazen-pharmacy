import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { UserPlus, UserX, Check, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

export function UserManagementDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Cashier');

  const fetchUsers = async () => {
    try { setUsers(await invoke<any[]>('get_users_db')); } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    try {
      await invoke('add_user_db', { username, password, role });
      toast.success('تمت إضافة المستخدم بنجاح.');
      setUsername(''); setPassword(''); setShowForm(false);
      fetchUsers();
    } catch (e: any) { toast.error("فشل إضافة المستخدم: " + e); }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    await invoke('toggle_user_status_db', { userId: id, isActive: !currentStatus });
    toast.success('تم تحديث حالة المستخدم.');
    fetchUsers();
  };

  const handleResetPassword = async (id: string, name: string) => {
    const newPass = prompt(`أدخل كلمة المرور الجديدة للمستخدم ${name}:`);
    if (newPass && newPass.length >= 4) {
      try {
        await invoke('reset_user_password_db', { userId: id, newPassword: newPass });
        toast.success('تم تغيير كلمة المرور بنجاح.');
      } catch (e: any) { toast.error("فشل التغيير: " + e); }
    } else if (newPass !== null) {
      toast.error("كلمة المرور يجب أن تكون 4 أحرف على الأقل.");
    }
  };

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h1><p className="text-sm text-slate-500 mt-1">إضافة موظفين وتعطيل الحسابات وإعادة التعيين</p></div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><UserPlus className="w-4 h-4" />مستخدم جديد</button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم المستخدم</label><input className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">كلمة المرور</label><input type="password" className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">الصلاحية</label><select className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm" value={role} onChange={e => setRole(e.target.value)}><option value="Cashier">كاشير</option><option value="Super Admin">مدير</option></select></div>
          <button type="submit" className="btn-success col-span-3">حفظ المستخدم</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-200"><tr><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">المستخدم</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الصلاحية</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">الحالة</th><th className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right p-4">إجراءات</th></tr></thead>
          <tbody>
            {users.map(usr => (
              <tr key={usr.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-4 text-sm font-semibold text-slate-800">{usr.username}</td>
                <td className="p-4"><span className={`px-2 py-1 rounded-md text-xs font-bold ${usr.role === 'Super Admin' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>{usr.role}</span></td>
                <td className="p-4">{usr.isActive ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" />نشط</span> : <span className="text-xs text-red-500 font-medium">موقوف</span>}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleResetPassword(usr.id, usr.username)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> تغيير كلمة المرور
                    </button>
                    {usr.username !== 'admin' && (
                      <button onClick={() => handleToggle(usr.id, usr.isActive)} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${usr.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                        {usr.isActive ? <span className="flex items-center gap-1"><UserX className="w-3 h-3" />تعطيل</span> : 'تفعيل'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}