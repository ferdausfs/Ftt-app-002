import { Home, BarChart3, History, Settings } from 'lucide-react';
import { cn, haptic } from '../utils/cn';

export type Tab = 'home' | 'analysis' | 'history' | 'settings';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  pendingCount?: number;
}

export function BottomNav({ active, onChange, pendingCount = 0 }: Props) {
  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: 'home', icon: Home, label: 'Signal' },
    { id: 'analysis', icon: BarChart3, label: 'Analysis' },
    { id: 'history', icon: History, label: 'History' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 ios-blur-strong border-t border-white/[0.06] safe-bottom">
      <div className="max-w-lg mx-auto px-2 pt-2 flex items-center justify-around">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { haptic('light'); onChange(tab.id); }}
              className={cn(
                "relative flex flex-col items-center gap-1 px-3 py-2 haptic-tap min-w-[60px]",
                isActive ? "text-[#0a84ff]" : "text-white/40"
              )}
            >
              <div className="relative">
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                {tab.id === 'history' && pendingCount > 0 && (
                  <div className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 bg-[#ff453a] rounded-full flex items-center justify-center">
                    <span className="text-[9px] text-white font-bold">{pendingCount}</span>
                  </div>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-semibold",
                isActive && "font-bold"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
