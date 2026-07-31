/**
 * Premium UI components — pro-grade signal visualization.
 * #1 ConfidenceGauge, #3 ConfluenceBar, #4 FilterBadges, #5 SignalStrengthBars
 */

import { cn } from '../utils/cn';

// ══ #1: Confidence Gauge (circular SVG) ══
export function ConfidenceGauge({ value, size = 80 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = (size - 10) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 85 ? '#4dd0e1' : pct >= 70 ? '#81c784' : pct >= 60 ? '#ffb74d' : '#ef5350';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={5}
          className="gauge-ring-bg gauge-ring" strokeDasharray={circ} strokeDashoffset={0} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={5}
          stroke={color} strokeLinecap="round"
          className="gauge-ring" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 4px ${color}66)` }} />
      </svg>
      <div className="text-center">
        <div className="text-xl font-bold number-tabular" style={{ color }}>{pct}<span className="text-xs">%</span></div>
        <div className="text-[8px] uppercase tracking-wider text-[#8e9099]">conf</div>
      </div>
    </div>
  );
}

// ══ #3: Confluence Visual Bar ══
export function ConfluenceBar({ count, total = 13, direction }: { count: number; total?: number; direction?: string }) {
  const pct = Math.max(0, Math.min(100, (count / total) * 100));
  const isBull = direction === 'BUY';
  const isBear = direction === 'SELL';
  return (
    <div className="flex items-center gap-2">
      <div className="confluence-bar-track flex-1">
        <div className={cn('confluence-bar-fill', isBull ? 'confluence-bar-bullish' : isBear ? 'confluence-bar-bearish' : 'confluence-bar-bullish')}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium number-tabular text-[#c4c6d0] whitespace-nowrap">
        {count}/{total}
      </span>
    </div>
  );
}

// ══ #4: Filter Badges (D2 block reasons + other filters) ══
export function FilterBadges({ filters }: { filters?: string[] }) {
  if (!filters || filters.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {filters.map((f, i) => {
        const isBlock = f.includes('BLOCK') || f.includes('D2_');
        const label = f.length > 40 ? f.slice(0, 38) + '…' : f;
        return (
          <span key={i} className={cn('filter-chip-block', !isBlock && 'filter-chip-info')}>
            {isBlock ? '🚫' : 'ℹ'} {label}
          </span>
        );
      })}
    </div>
  );
}

// ══ #5: Signal Strength Bars (mini indicator overview) ══
export function SignalStrengthBars({ catScores, direction }: {
  catScores?: Record<string, { up?: number; down?: number }>;
  direction?: string;
}) {
  if (!catScores) return null;
  const cats = ['trend', 'momentum', 'macd', 'stochastic', 'bands', 'adx', 'patterns', 'divergence', 'pivots', 'sr', 'volume', 'priceAction'];
  const bars = cats.map(k => {
    const c = catScores[k];
    if (!c) return null;
    const up = c.up || 0;
    const down = c.down || 0;
    const total = up + down;
    if (total === 0) return null;
    const upPct = (up / total) * 100;
    const isAligned = direction === 'BUY' ? up > down : direction === 'SELL' ? down > up : false;
    return { key: k, upPct, isAligned, total };
  }).filter(Boolean);

  if (bars.length === 0) return null;
  const maxTotal = Math.max(...bars.map(b => b!.total));

  return (
    <div className="flex items-end gap-[3px] h-10">
      {bars.map((b) => (
        <div key={b!.key} className="flex flex-col items-center gap-[2px] flex-1" title={`${b!.key}: ${b!.isAligned ? '✓' : '✗'}`}>
          <div className="w-full rounded-sm overflow-hidden flex flex-col-reverse" style={{ height: `${(b!.total / maxTotal) * 100}%` }}>
            <div className={cn('w-full transition-all', b!.isAligned ? 'bg-[#4dd0e1]' : 'bg-[#4a4a4f]')}
              style={{ height: `${b!.upPct}%` }} />
          </div>
          <div className={cn('w-1 h-1 rounded-full', b!.isAligned ? 'bg-[#4dd0e1]' : 'bg-[#4a4a4f]')} />
        </div>
      ))}
    </div>
  );
}

// ══ #6: History Card (WIN/LOSS color-coded) ══
export function HistoryCard({ direction, result, pair, confidence, expiryMinutes, bestTF }: {
  direction: string;
  result?: string | null;
  pair: string;
  confidence?: string | number;
  expiryMinutes?: number;
  bestTF?: string;
}) {
  const cls = result === 'WIN' ? 'history-card-win' : result === 'LOSS' ? 'history-card-loss' : 'history-card-pending';
  const emoji = result === 'WIN' ? '✅' : result === 'LOSS' ? '❌' : '⏳';
  const dirColor = direction === 'BUY' ? 'text-[#81c784]' : direction === 'SELL' ? 'text-[#ef5350]' : 'text-[#9e9e9e]';

  return (
    <div className={cn('rounded-xl p-3 transition-all hover:scale-[1.01]', cls)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{emoji}</span>
          <span className="text-sm font-medium">{pair}</span>
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded', dirColor, 'bg-[#27272d]')}>{direction}</span>
        </div>
        <div className="flex items-center gap-3">
          {confidence && <span className="text-xs text-[#b0b3b8] number-tabular">{typeof confidence === 'string' ? confidence : confidence + '%'}</span>}
          {bestTF && <span className="text-xs text-[#8e9099]">{bestTF}</span>}
          {expiryMinutes && <span className="text-xs text-[#8e9099]">{expiryMinutes}m</span>}
        </div>
      </div>
    </div>
  );
}

// ══ #2: Direction Pill (hero card) ══
export function DirectionPill({ direction, size = 'lg' }: { direction: string; size?: 'lg' | 'md' }) {
  const cls = direction === 'BUY' ? 'direction-pill-buy' : direction === 'SELL' ? 'direction-pill-sell' : 'direction-pill-neutral';
  const emoji = direction === 'BUY' ? '▲' : direction === 'SELL' ? '▼' : '—';
  const sz = size === 'lg' ? 'px-6 py-3 text-2xl' : 'px-4 py-2 text-lg';
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-2xl font-bold text-white', sz, cls)}>
      <span>{emoji}</span>
      <span>{direction}</span>
    </div>
  );
}
