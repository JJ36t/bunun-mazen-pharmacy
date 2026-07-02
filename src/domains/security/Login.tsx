import { useState } from 'react';
import { useAuthStore } from './auth.store';
import { Lock, User, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const { login, isLicensed, deviceId, activate, activationError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activationKey, setActivationKey] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const success = await login(username, password);
    if (!success) {
      setLoginError('بيانات الدخول غير صحيحة');
      toast.error('بيانات الدخول غير صحيحة');
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    await activate(activationKey);
  };

  if (!isLicensed) {
    return (
      <div dir="rtl" className="h-screen flex items-center justify-center bg-slate-100">
        <form onSubmit={handleActivate} className="bg-white p-8 rounded-2xl shadow-2xl w-96 border-t-8 border-purple-600">
          <div className="text-center mb-6">
            <img src="/logo.png" alt="شعار صيدلية بنين مازن" className="w-20 h-20 rounded-2xl object-contain mx-auto mb-4 bg-purple-50 p-1" />
            <h1 className="text-2xl font-bold text-slate-800">صيدلية بنين مازن</h1>
            <p className="text-sm text-slate-500 mt-2">أدخل مفتاح التفعيل للمتابعة</p>
          </div>
          
          <div className="mb-4 p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">بصمة الجهاز (Device ID):</p>
            <p className="font-mono text-sm font-bold text-blue-700 break-all">{deviceId || "جاري الجلب..."}</p>
          </div>

          {activationError && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4" /> {activationError}
            </div>
          )}

          <input
            type="text"
            value={activationKey}
            onChange={(e) => setActivationKey(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg mb-4 text-center font-mono text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            placeholder="XXXX-XXXX-XXXX"
            required
          />
          <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition-colors text-lg">
            تفعيل النظام
          </button>
        </form>
      </div>
    );
  }

  return (
    <div dir="rtl" className="h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-2xl w-96 border-t-8 border-purple-600">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="شعار صيدلية بنين مازن" className="w-20 h-20 rounded-2xl object-contain mx-auto mb-4 bg-purple-50 p-1" />
          <h1 className="text-2xl font-bold text-slate-800">صيدلية بنين مازن</h1>
          <p className="text-sm text-slate-500 mt-1">نظام الإدارة</p>
        </div>
        
        {loginError && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" /> {loginError}
          </div>
        )}

        <div className="mb-4 relative">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5"><User className="w-3 h-3 inline ml-1" />اسم المستخدم</label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" required />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5"><Lock className="w-3 h-3 inline ml-1" />كلمة المرور</label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="password" className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
        </div>
        <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition-colors text-lg">دخول النظام</button>
      </form>
    </div>
  );
}