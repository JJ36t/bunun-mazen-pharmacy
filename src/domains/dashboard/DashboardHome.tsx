// ========================================
// DashboardHome - الصفحة الرئيسية مع شبكة التنقل
// ========================================
// تم استخراجها من App.tsx (P1 fix: تقسيم God component)
// تعرض أزرار التنقل مجمّعة حسب القسم + إحصائيات سريعة

import { ShoppingCart, Package, Database, Shield } from 'lucide-react';
import { useInventoryStore } from '../inventory/inventory.store';
import { useAuthStore } from '../security/auth.store';
import { getVisibleNavItems, groupNavItems, type TabKey } from '../../lib/appConfig';

interface DashboardHomeProps {
  setActiveTab: (tab: TabKey) => void;
}

export function DashboardHome({ setActiveTab }: DashboardHomeProps) {
  const { role } = useAuthStore();
  const { medicines } = useInventoryStore();

  const visibleItems = getVisibleNavItems(role || 'cashier');
  const grouped = groupNavItems(visibleItems);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* ترحيب */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">مرحباً بك في نظام الصيدلية</h1>
          <p className="text-sm text-slate-500 mt-1">اختر القسم من القائمة أدناه</p>
        </div>

        {/* مجموعات التنقل */}
        {Object.entries(grouped).map(([groupName, items]) => (
          <div key={groupName} className="mb-6">
            <h2 className="text-sm font-bold text-slate-600 mb-3 px-1">{groupName}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {items.map(item => {
                const Icon = item.icon;
                const tileColor =
                  groupName === 'العمليات' ? 'bg-brand-50 text-brand-700'
                  : groupName === 'الإدارة' ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700';
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className="nav-tile h-40 p-4"
                  >
                    <div className={`nav-tile-icon w-16 h-16 ${tileColor}`}>
                      <Icon className="w-8 h-8" />
                    </div>
                    <p className="nav-tile-label text-base">{item.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* الإحصائيات السريعة */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-200">
          <StatCard
            icon={<ShoppingCart className="w-5 h-5" />}
            label="مبيعات اليوم"
            value="— د.ع"
            colorClass="bg-brand-50 text-brand-700"
          />
          <StatCard
            icon={<Package className="w-5 h-5" />}
            label="الأصناف في المخزون"
            value={`${medicines.length} صنف`}
            colorClass="bg-emerald-50 text-emerald-700"
          />
          <StatCard
            icon={<Database className="w-5 h-5" />}
            label="قاعدة الأدوية العالمية"
            value="9,375 دواء"
            colorClass="bg-amber-50 text-amber-700"
          />
          <StatCard
            icon={<Shield className="w-5 h-5" />}
            label="تفاعلات دوائية"
            value="1,051 تفاعل"
            colorClass="bg-purple-50 text-purple-700"
          />
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
}

function StatCard({ icon, label, value, colorClass }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular">{value}</p>
      </div>
    </div>
  );
}
