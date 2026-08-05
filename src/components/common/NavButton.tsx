import { cn } from '../../utils/cn';
import type { LucideIcon } from 'lucide-react';

interface NavButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

export function NavButton({ icon: Icon, label, active, onClick, badge }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 px-3 py-1.5 active:scale-95 transition-transform relative",
        active ? "text-[#4dd0e1]" : "text-[var(--t-low)]"
      )}
      style={active ? { filter: 'drop-shadow(0 0 4px rgba(var(--rgb-accent),0.3))' } : {}}
    >
      {active && (
        <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
          style={{ background: '#4dd0e1', boxShadow: '0 0 6px #4dd0e1' }} />
      )}
      <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.8} />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
      {badge !== undefined && badge > 0 && (
        <div className="absolute top-0 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center"
          style={{ background: '#ff5252', boxShadow: '0 0 4px rgba(255,82,82,0.4)' }}>
          <span className="text-[10px] text-white font-bold">{badge}</span>
        </div>
      )}
    </button>
  );
}
