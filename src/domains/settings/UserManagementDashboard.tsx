import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { UserPlus, UserX, Check, KeyRound, User, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_ROLES, RoleName, ROLE_DISPLAY_NAMES, normalizeRole, isAdmin } from '../../lib/core/rbac';

// دوال مساعدة محلية
const isAdminRole = (role: string) => isAdmin(role);
const normalizeRoleSafe = (role: string): RoleName => normalizeRole(role);

export function UserManagementDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleName>('cashier');

  const handleDelete = async (id: string, name: string) => {
    if (name === 'admin') { toast.error('لا يمكن حذف المدير الرئيسي'); return; }
    if (window.confirm(`هل أنت متأكد من حذف المستخدم: ${name}؟`)) {
      try {
        await invoke('delete_user_db', { userId: id, deletedBy: username || 'admin' });
        toast.success('تم حذف المستخدم');
        fetchUsers();
      } catch (e: any) { toast.error('فشل الحذف: ' + e); }
    }
  };

  const fetchUsers = async () => {
    try { setUsers(await invoke<any[]>('get_users_db', { requesterRole: role || 'cashier' })); } catch (e) { console.error(e); }
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
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="section-title">إدارة المستخدمين</h1>
          <p className="section-subtitle">إضافة موظفين وتعطيل الحسابات وإعادة التعيين</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <UserPlus className="w-4 h-4" />
          مستخدم جديد
        </button>
      </div>

      {/* بطاقات إحصائية */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي المستخدمين</p>
            <p className="text-xl font-bold text-slate-800 tabular">{users.length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">مستخدمون نشطون</p>
            <p className="text-xl font-bold text-slate-800 tabular">{users.filter(u => u.isActive).length}</p>
          </div>
        </div>
        <div className="card-elegant p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">مدراء</p>
            <p className="text-xl font-bold text-slate-800 tabular">{users.filter(u => u.role === 'Super Admin').length}</p>
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="card-elegant p-6 mb-6 animate-slide-up">
          <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-brand-700" />
            </div>
            إضافة مستخدم جديد
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">اسم المستخدم</label>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="label">كلمة المرور</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="label">الصلاحية</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value as RoleName)}>
                {ALL_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn-success">
              <Check className="w-4 h-4" />
              حفظ المستخدم
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">إلغاء</button>
          </div>
        </form>
      )}

      <div className="card-elegant overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50/80 border-b border-slate-200/60">
            <tr>
              <th className="table-header text-right p-4">المستخدم</th>
              <th className="table-header text-right p-4">الصلاحية</th>
              <th className="table-header text-right p-4">الحالة</th>
              <th className="table-header text-right p-4">آخر دخول</th>
              <th className="table-header text-right p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map(usr => (
              <tr key={usr.id} className="table-row">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-1 ${
                      usr.role === 'Super Admin' 
                        ? 'bg-gradient-to-br from-brand-100 to-brand-50 ring-brand-200/50' 
                        : 'bg-gradient-to-br from-slate-100 to-slate-50 ring-slate-200/50'
                    }`}>
                      <span className={`font-bold text-sm ${usr.role === 'Super Admin' ? 'text-brand-700' : 'text-slate-600'}`}>
                        {usr.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{usr.username}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={isAdminRole(usr.role) ? 'badge-info' : 'badge-neutral'}>
                    {ROLE_DISPLAY_NAMES[normalizeRoleSafe(usr.role)] || usr.role}
                  </span>
                </td>
                <td className="p-4">
                  {usr.isActive
                    ? <span className="badge-success"><Check className="w-3 h-3" />نشط</span>
                    : <span className="badge-danger">موقوف</span>}
                </td>
                <td className="p-4">
                  <span className="text-xs text-slate-500 tabular">
                    {usr.lastLogin ? new Date(usr.lastLogin).toLocaleString('en-GB') : '— لم يدخل بعد'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleResetPassword(usr.id, usr.username)} 
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> 
                      تغيير كلمة المرور
                    </button>
                    {usr.username !== 'admin' && (
                      <button 
                        onClick={() => handleToggle(usr.id, usr.isActive)} 
                        className={`text-xs font-semibold px-3 py-2 rounded-lg border flex items-center gap-1.5 ${
                          usr.isActive 
                            ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' 
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                        }`}
                      >
                        {usr.isActive 
                          ? <><UserX className="w-3.5 h-3.5" />تعطيل</> 
                          : <><Check className="w-3.5 h-3.5" />تفعيل</>}
                      </button>
                    )}
                    {usr.username !== 'admin' && (
                      <button 
                        onClick={() => handleDelete(usr.id, usr.username)}
                        className="text-xs font-semibold px-3 py-2 rounded-lg border bg-red-50 text-red-700 hover:bg-red-100 border-red-200 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />حذف
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
