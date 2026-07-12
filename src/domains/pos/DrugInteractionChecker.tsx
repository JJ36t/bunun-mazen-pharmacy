// ========================================
// Drug Interaction Checker
// ========================================
// يظهر في POS لتنبيه الصيدلي من التفاعلات الخطيرة

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, X, Shield, CheckCircle, AlertOctagon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../security/auth.store';

interface DrugInteractionCheckerProps {
  drugNames: string[];  // قائمة المواد الفعالية في السلة
  invoiceId?: string | null;  // ربط التجاوز بالفاتورة
  onOverride: () => void;  // متابعة البيع بعد التجاوز
  onClose: () => void;
}

export function DrugInteractionChecker({ drugNames, invoiceId, onOverride, onClose }: DrugInteractionCheckerProps) {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkInteractions();
  }, []);

  const checkInteractions = async () => {
    setLoading(true);
    try {
      const results = await invoke<any[]>('check_drug_interactions_db', {
        drugNamesJson: JSON.stringify(drugNames),
      });
      setInteractions(results);
    } catch (e: unknown) {
      console.error('Interaction check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideReason.trim()) {
      toast.error('سبب التجاوز إلزامي');
      return;
    }
    if (submitting) return; // منع الـ double-click
    setSubmitting(true);
    try {
      const currentUser = useAuthStore.getState().username || 'unknown';
      // سجّل تجاوز كل تفاعل بالتوازي (بدل sequential await)
      await Promise.all(interactions.map(interaction =>
        invoke('log_interaction_override_db', {
          interactionId: interaction.interactionId,
          userRole: currentUser,
          reason: overrideReason,
          invoiceId: invoiceId || null, // ربط بالفاتورة بدل null
        })
      ));
      toast.success('تم تسجيل التجاوز. يمكنك متابعة البيع.');
      onOverride();
      onClose();
    } catch (e: unknown) {
      toast.error('فشل تسجيل التجاوز: ' + e);
    } finally {
      setSubmitting(false);
    }
  };

  const hasHigh = interactions.some(i => i.severity === 'High');
  const hasMedium = interactions.some(i => i.severity === 'Medium');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-[640px] max-h-[90vh] overflow-auto animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-5 border-b ${hasHigh ? 'bg-rose-50 border-rose-200' : hasMedium ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Shield className={`w-6 h-6 ${hasHigh ? 'text-rose-600' : hasMedium ? 'text-amber-600' : 'text-emerald-600'}`} />
              فحص تفاعلات الأدوية
            </h3>
            <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {drugNames.length} دواء في السلة
          </p>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto"></div>
              <p className="text-sm text-slate-500 mt-3">جاري فحص التفاعلات...</p>
            </div>
          ) : interactions.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
              <p className="text-lg font-bold text-emerald-700 mt-3">لا توجد تفاعلات خطيرة</p>
              <p className="text-sm text-slate-500 mt-1">جميع الأدوية في السلة آمنة للاستخدام معاً</p>
              <button onClick={() => { onOverride(); onClose(); }} className="btn-success mt-5 px-8 py-2">
                <CheckCircle className="w-4 h-4" /> متابعة البيع
              </button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className={`rounded-xl p-3 mb-4 flex items-center gap-2 ${hasHigh ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                <AlertTriangle className={`w-5 h-5 ${hasHigh ? 'text-rose-600' : 'text-amber-600'}`} />
                <p className={`text-sm font-semibold ${hasHigh ? 'text-rose-700' : 'text-amber-700'}`}>
                  تم اكتشاف {interactions.length} تفاعل دوائي
                  {hasHigh && ' — يوجد تفاعل خطير!'}
                </p>
              </div>

              {/* Interactions list */}
              <div className="space-y-3 mb-4">
                {interactions.map((int, idx) => {
                  const severityConfig = {
                    High: { color: 'rose', icon: AlertOctagon, label: 'خطير', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
                    Medium: { color: 'amber', icon: AlertTriangle, label: 'متوسط', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
                    Low: { color: 'yellow', icon: AlertCircle, label: 'منخفض', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
                  };
                  const cfg = severityConfig[int.severity as keyof typeof severityConfig] || severityConfig.Low;
                  const Icon = cfg.icon;
                  return (
                    <div key={idx} className={`rounded-xl p-4 border-2 ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-start gap-3">
                        <Icon className={`w-6 h-6 ${cfg.text} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-bold text-slate-800">{int.drugA} + {int.drugB}</p>
                            <span className={`badge ${cfg.color === 'rose' ? 'badge-danger' : cfg.color === 'amber' ? 'badge-warning' : 'badge-neutral'} text-xs`}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{int.description}</p>
                          {int.recommendation && (
                            <div className="bg-white/60 rounded-lg p-2 mt-2">
                              <p className="text-xs text-slate-600">
                                <strong>التوصية:</strong> {int.recommendation}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Override form */}
              {!showOverrideForm ? (
                <div className="flex gap-2">
                  <button onClick={() => setShowOverrideForm(true)} className="btn-danger flex-1 py-3">
                    <AlertTriangle className="w-4 h-4" /> تجاوز التحذيرات
                  </button>
                  <button onClick={onClose} className="btn-ghost border border-slate-200 flex-1 py-3">
                    إلغاء البيع
                  </button>
                </div>
              ) : (
                <div className="border-t border-slate-100 pt-4 animate-slide-up">
                  <label className="label">سبب التجاوز (إلزامي) *</label>
                  <textarea
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="مثلاً: الصيدلاني أكد الجرعة آمنة مع تعديل الجرعة، أو: الدكتور وصفها بناءً على حالة المريض..."
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleOverride}
                      disabled={!overrideReason.trim()}
                      className="btn-danger flex-1 py-3 disabled:opacity-40"
                    >
                      <AlertTriangle className="w-4 h-4" /> تأكيد التجاوز + متابعة
                    </button>
                    <button onClick={() => setShowOverrideForm(false)} className="btn-ghost border border-slate-200 px-6">
                      رجوع
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
