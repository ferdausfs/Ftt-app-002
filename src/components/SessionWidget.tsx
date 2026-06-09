import { Globe2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface Props {
  sessions: string[];
  quality: string;
  hour: number;
  overlap?: string;
}

const SESSIONS = [
  { name: 'SYDNEY', start: 22, end: 7, color: '#ff9f0a', emoji: '🇦🇺' },
  { name: 'TOKYO', start: 0, end: 9, color: '#bf5af2', emoji: '🇯🇵' },
  { name: 'LONDON', start: 8, end: 17, color: '#0a84ff', emoji: '🇬🇧' },
  { name: 'NEW_YORK', start: 13, end: 22, color: '#30d158', emoji: '🇺🇸' },
];

export function SessionWidget({ sessions, quality, hour }: Props) {
  const qualityColors = {
    HIGH: { bg: 'bg-[#30d158]/20', text: 'text-[#30d158]', dot: 'bg-[#30d158]' },
    MEDIUM: { bg: 'bg-[#ffd60a]/20', text: 'text-[#ffd60a]', dot: 'bg-[#ffd60a]' },
    LOW: { bg: 'bg-[#ff453a]/20', text: 'text-[#ff453a]', dot: 'bg-[#ff453a]' },
  };
  const q = qualityColors[quality as keyof typeof qualityColors] || qualityColors.MEDIUM;

  return (
    <div className="ios-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-[#0a84ff]" />
          <span className="text-white font-semibold text-sm">Market Sessions</span>
        </div>
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full", q.bg)}>
          <div className={cn("w-1.5 h-1.5 rounded-full", q.dot)} />
          <span className={cn("text-[10px] font-bold uppercase tracking-wider", q.text)}>
            {quality}
          </span>
        </div>
      </div>

      {/* Session timeline */}
      <div className="relative h-16 bg-white/[0.03] rounded-xl overflow-hidden mb-3">
        {/* Hour markers */}
        <div className="absolute inset-0 flex">
          {[0, 6, 12, 18].map(h => (
            <div key={h} className="flex-1 border-r border-white/5 relative">
              <span className="absolute bottom-0.5 left-1 text-[9px] text-white/30 font-mono">
                {h.toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Session blocks */}
        {SESSIONS.map((s, idx) => {
          const isActive = sessions.includes(s.name);
          const startPercent = (s.start / 24) * 100;
          let endPercent = (s.end / 24) * 100;
          if (s.end < s.start) endPercent = 100;
          const width = endPercent - startPercent;
          
          return (
            <div
              key={s.name}
              className={cn(
                "absolute h-2.5 rounded-full transition-all",
                isActive ? "opacity-100" : "opacity-30"
              )}
              style={{
                left: `${startPercent}%`,
                width: `${width}%`,
                top: `${4 + idx * 7}px`,
                background: s.color,
                boxShadow: isActive ? `0 0 10px ${s.color}` : 'none'
              }}
            />
          );
        })}

        {/* Current time indicator */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
          style={{ left: `${(hour / 24) * 100}%` }}
        />
      </div>

      {/* Active sessions list */}
      <div className="flex flex-wrap gap-1.5">
        {SESSIONS.map(s => {
          const isActive = sessions.includes(s.name);
          return (
            <div
              key={s.name}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all",
                isActive ? "bg-white/10 text-white" : "bg-white/[0.03] text-white/30"
              )}
            >
              <span>{s.emoji}</span>
              <span>{s.name.replace('_', ' ')}</span>
              {isActive && (
                <div className="w-1 h-1 rounded-full" style={{ background: s.color }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
