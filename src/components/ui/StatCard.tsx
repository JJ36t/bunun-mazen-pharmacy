import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color?: 'brand' | 'emerald' | 'red' | 'amber' | 'purple';
  subtitle?: string;
}

const colorMap = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
};

export function StatCard({ title, value, icon: Icon, color = 'brand', subtitle }: StatCardProps) {
  return (
    <div className="card-hover p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}