import { cn } from '../../utils/cn';
import type { LucideIcon } from 'lucide-react';

interface SettingRowProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  description?: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  isLast?: boolean;
}

export function SettingRow({ icon: Icon, iconColor, label, description, value, toggle, toggleValue, onToggle, onClick, isLast }: SettingRowProps) {
  return (
    <div
      className={cn("flex items-center gap-3 p-4", onClick && "active:scale-[0.98] transition-transform cursor-pointer")}
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.03)' }}
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${iconColor}12` }}>
        <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{label}</div>
        {description && <div className="text-[11px] text-[var(--t-low)]">{description}</div>}
      </div>
      {value && <span className="text-[#8e9099] text-xs font-medium">{value}</span>}
      {toggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          className="relative w-11 h-6 rounded-full transition-all active:scale-95"
          style={{
            background: toggleValue ? '#00e676' : 'rgba(255,255,255,0.08)',
            boxShadow: toggleValue ? '0 0 8px rgba(0,230,118,0.3)' : 'none',
          }}
        >
          <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform"
            style={{ transform: toggleValue ? 'translateX(22px)' : 'translateX(2px)' }} />
        </button>
      )}
    </div>
  );
}
