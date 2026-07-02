// ========================================
// Plugins Management Dashboard
// ========================================
// إدارة الإضافات المثبّتة

import { useState, useEffect } from 'react';
import { pluginRegistry, PharmacyPlugin } from '../../lib/core/pluginRegistry';
import { Cloud, MessageCircle, Brain, Puzzle, CheckCircle, XCircle, Settings } from 'lucide-react';
import { toast } from 'sonner';

export function PluginsDashboard() {
  const [plugins, setPlugins] = useState<PharmacyPlugin[]>([]);
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());

  useEffect(() => {
    // تحميل الـ plugins من الـ registry
    setPlugins(pluginRegistry.getAll());
    setEnabledPlugins(new Set(pluginRegistry.getEnabled().map(p => p.name)));
  }, []);

  const handleToggle = async (plugin: PharmacyPlugin) => {
    try {
      if (enabledPlugins.has(plugin.name)) {
        await pluginRegistry.disable(plugin.name);
        setEnabledPlugins(prev => {
          const next = new Set(prev);
          next.delete(plugin.name);
          return next;
        });
        toast.success(`تم تعطيل: ${plugin.displayName}`);
      } else {
        await pluginRegistry.enable(plugin.name);
        setEnabledPlugins(prev => new Set(prev).add(plugin.name));
        toast.success(`تم تفعيل: ${plugin.displayName}`);
      }
    } catch (e) {
      toast.error(`فشل تبديل حالة الـ plugin: ${e}`);
    }
  };

  const iconMap: Record<string, any> = {
    'cloud-sync': Cloud,
    'whatsapp-integration': MessageCircle,
    'ai-insights': Brain,
  };

  return (
    <div className="p-8 overflow-auto h-full bg-slate-50 animate-fade-in">
      <div className="mb-6">
        <h1 className="section-title">إدارة الإضافات</h1>
        <p className="section-subtitle">تفعيل وإدارة الإضافات المثبّتة في النظام</p>
      </div>

      {/* بطاقة معلومات */}
      <div className="card-elegant p-4 mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
          <Puzzle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">نظام الإضافات</p>
          <p className="text-xs text-slate-500">
            {plugins.length} إضافة متاحة • {enabledPlugins.size} مفعّلة
          </p>
        </div>
      </div>

      {/* قائمة الإضافات */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {plugins.map(plugin => {
          const Icon = plugin.icon || iconMap[plugin.name] || Puzzle;
          const isEnabled = enabledPlugins.has(plugin.name);
          
          return (
            <div key={plugin.name} className="card-elegant p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    isEnabled ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{plugin.displayName}</h3>
                    <p className="text-xs text-slate-400">v{plugin.version} • {plugin.author}</p>
                  </div>
                </div>
                {isEnabled ? (
                  <span className="badge-success">
                    <CheckCircle className="w-3 h-3" />
                    مفعّل
                  </span>
                ) : (
                  <span className="badge-neutral">
                    <XCircle className="w-3 h-3" />
                    معطّل
                  </span>
                )}
              </div>
              
              <p className="text-sm text-slate-500 mb-4 leading-relaxed">{plugin.description}</p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(plugin)}
                  className={isEnabled ? 'btn-danger' : 'btn-success'}
                >
                  {isEnabled ? 'تعطيل' : 'تفعيل'}
                </button>
                {plugin.configSchema && (
                  <button className="btn-ghost">
                    <Settings className="w-4 h-4" />
                    إعدادات
                  </button>
                )}
              </div>
            </div>
          );
        })}
        
        {plugins.length === 0 && (
          <div className="col-span-2 card-elegant p-12">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Puzzle className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-slate-400 text-sm">لا توجد إضافات مثبّتة</p>
              <p className="text-slate-300 text-xs mt-1">سيتم إضافة إضافات جديدة في الإصدارات القادمة</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
