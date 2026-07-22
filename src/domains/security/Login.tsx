import { useState } from 'react';
import { useAuthStore } from './auth.store';
import { Lock, User, AlertCircle, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const { login, isLicensed, deviceId, activate, activationError, error: authError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activationKey, setActivationKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const success = await login(username, password);
    if (!success) {
      // Show actual error from auth store (not hardcoded message)
      const errMsg = authError || 'بيانات الدخول غير صحيحة';
      setLoginError(errMsg);
      toast.error(errMsg);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    await activate(activationKey);
  };

  // صفحة التفعيل
  if (!isLicensed) {
    return (
      <div dir="rtl" className="h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 relative overflow-hidden">
        {/* عناصر زخرفية في الخلفية */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>
        
        <div className="relative bg-white/95 backdrop-blur-xl p-9 rounded-3xl shadow-2xl w-[420px] border border-white/40 animate-scale-in">
          {/* الشعار */}
          <div className="text-center mb-7">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-50 to-white p-2 mx-auto mb-4 shadow-elegant ring-1 ring-brand-100">
              <img src="/logo.png" alt="شعار صيدلية بنين مازن" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">صيدلية بنين مازن</h1>
            <p className="text-sm text-slate-500 mt-1.5 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-500" />
              تفعيل النظام للمتابعة
            </p>
          </div>
          
          {/* بصمة الجهاز */}
          <div className="mb-5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              بصمة الجهاز (Device ID)
            </p>
            <p className="font-mono text-sm font-bold text-brand-700 break-all tracking-tight">{deviceId || "جاري الجلب..."}</p>
          </div>

          {activationError && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 animate-slide-up">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> 
              <span>{activationError}</span>
            </div>
          )}

          <form onSubmit={handleActivate}>
            <input
              type="text"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              className="input-lg text-center font-mono text-lg tracking-wider mb-5"
              placeholder="XXXX-XXXX-XXXX"
              required
              autoFocus
            />
            <button type="submit" className="btn-primary w-full py-3.5 text-base shadow-elegant">
              <ShieldCheck className="w-5 h-5" />
              تفعيل النظام
            </button>
          </form>
        </div>
      </div>
    );
  }

  // صفحة تسجيل الدخول
  return (
    <div dir="rtl" className="h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 relative overflow-hidden">
      {/* عناصر زخرفية */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>
      
      <div className="relative bg-white/95 backdrop-blur-xl p-9 rounded-3xl shadow-2xl w-[420px] border border-white/40 animate-scale-in">
        {/* الشعار */}
        <div className="text-center mb-7">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-50 to-white p-2 mx-auto mb-4 shadow-elegant ring-1 ring-brand-100">
            <img src="/logo.png" alt="شعار صيدلية بنين مازن" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">صيدلية بنين مازن</h1>
          <p className="text-sm text-slate-500 mt-1.5">نظام الإدارة</p>
        </div>
        
        {loginError && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 animate-slide-up">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> 
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          {/* اسم المستخدم */}
          <div className="mb-4">
            <label className="label-lg">
              <User className="w-3.5 h-3.5 inline ml-1" />
              اسم المستخدم
            </label>
            <div className="relative">
              <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                className="input-lg pr-12 pl-4" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="admin" 
                required 
                autoFocus
              />
            </div>
          </div>
          
          {/* كلمة المرور */}
          <div className="mb-7">
            <label className="label-lg">
              <Lock className="w-3.5 h-3.5 inline ml-1" />
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type={showPassword ? "text" : "password"} 
                className="input-lg pr-12 pl-12" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••" 
                required 
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <button type="submit" className="btn-primary w-full py-3.5 text-base shadow-elegant">
            <Lock className="w-5 h-5" />
            دخول النظام
          </button>
        </form>
        
        {/* تذييل */}
        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 صيدلية بنين مازن - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
