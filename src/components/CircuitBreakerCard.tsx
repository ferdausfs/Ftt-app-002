import { useEffect, useState } from 'react';
import { Pause, Clock, Zap, ShieldAlert } from 'lucide-react';
import { cn } from '../utils/cn';

interface Props {
  pair: string;
  cooldownUntil: string;
  lossStreak?: number;
  /** Direction the engine would have emitted if the breaker were not tripped. */
  wouldBeSignal?: string;
  onSwitchPair?: (pair: string) => void;
}

/**
 * Backend v6.9.2 trips a per-pair circuit breaker after 2 consecutive losses and
 * forces NO_TRADE for a 6h cooldown. Without this card the user just saw a bare
 * "NO_TRADE" with no reason and no end time.
 *
 * Styling mirrors the existing MarketClosedCard (same md-surface-highest shell,
 * accent bar, 2x2 info blocks) so the two "why is there no signal" states read
 * as siblings — amber here vs cyan there.
 */
export function CircuitBreakerCard({ pair, cooldownUntil, lossStreak, wouldBeSignal, onSwitchPair }: Props) {
  const [remaining, setRemaining] = useState(() => formatRemaining(cooldownUntil));

  useEffect(() => {
    setRemaining(formatRemaining(cooldownUntil));
    // 30s cadence keeps the "1h 12m" text honest without a per-second repaint
    const interval = setInterval(() => setRemaining(formatRemaining(cooldownUntil)), 30000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const resumesAt = (() => {
    const d = new Date(cooldownUntil);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  const alternatives = suggestAlternatives(pair);

  return (
    <div className="space-y-3 fade-in">
      <div className="md-surface-highest p-0 overflow-hidden scale-in border border-[var(--c-warn)]/10">
        <div className="h-1.5 w-full bg-gradient-to-r from-[var(--c-warn)] via-[#ff9800] to-[#ef6c00]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--c-warn)]/15 flex items-center justify-center shadow-lg shadow-[var(--c-warn)]/5">
                <Pause className="w-7 h-7 text-[var(--c-warn)]" strokeWidth={2.4} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--c-warn)] font-bold mb-1">Risk control</div>
                <h2 className="text-2xl font-medium leading-tight">Circuit Breaker Active</h2>
                <p className="text-sm text-[#b0b3b8] mt-1 leading-relaxed">
                  {pair} is paused after {lossStreak ?? 2} consecutive losses.
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-[#27272d] text-[var(--c-warn)] text-xs font-bold border border-[var(--c-warn)]/20 whitespace-nowrap">
              COOLDOWN
            </div>
          </div>

          <div className="grid gap-3 mb-4">
            <div className="bg-[#1e1e23] rounded-2xl p-4 border border-[#3a3a3e]/60">
              <div className="flex items-center gap-2 text-xs text-[#b0b3b8] mb-2">
                <Clock className="w-4 h-4 text-[var(--c-warn)]" />
                <span>Trading resumes</span>
              </div>
              <div className="text-base font-medium text-[#e3e2e6] leading-snug">
                {resumesAt ? resumesAt.toLocaleString() : 'Cooldown time unavailable'}
              </div>
              <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-[var(--c-warn)]/10 text-[var(--c-warn)] text-xs font-bold">
                <div className="w-2 h-2 rounded-full bg-[var(--c-warn)] animate-pulse" />
                {remaining === 'refreshing…' ? 'Refreshing…' : `Resumes in ${remaining}`}
              </div>
            </div>

            <div className="bg-[#27272d] rounded-2xl p-4 border border-[#3a3a3e]/50">
              <div className="text-xs uppercase tracking-wider text-[#8e9099] font-medium mb-2">Why this happens</div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">
                Two losses in a row on one pair is the point where chasing a recovery trade
                usually deepens the drawdown. The pair stays muted for a fixed window; a win
                on it resets the streak immediately.
              </p>
            </div>

            {wouldBeSignal && wouldBeSignal !== 'NO_TRADE' && (
              <div className="bg-[#1e1e23] rounded-2xl p-4 border border-[#3a3a3e]/60">
                <div className="flex items-center gap-2 text-xs text-[#b0b3b8] mb-2">
                  <ShieldAlert className="w-4 h-4 text-[#b39ddb]" />
                  <span>Suppressed signal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-base font-bold',
                    wouldBeSignal === 'BUY' && 'text-[var(--c-buy)]',
                    wouldBeSignal === 'SELL' && 'text-[var(--c-sell)]',
                  )}>
                    {wouldBeSignal}
                  </span>
                  <span className="text-xs text-[#6e6e73]">
                    would have fired — logged server-side, not traded
                  </span>
                </div>
              </div>
            )}
          </div>

          {onSwitchPair && alternatives.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {alternatives.map(alt => (
                <button
                  key={alt}
                  onClick={() => onSwitchPair(alt)}
                  className="py-3 rounded-2xl bg-[#4dd0e1]/15 text-[#4dd0e1] text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Zap className="w-4 h-4" />
                  {alt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRemaining(cooldownUntil: string): string {
  const target = new Date(cooldownUntil).getTime();
  if (Number.isNaN(target)) return 'refreshing…';
  const ms = target - Date.now();
  if (ms <= 0) return 'refreshing…';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return 'under a minute';
}

/** Never suggest the pair that is currently muted. */
function suggestAlternatives(pair: string): string[] {
  const pool = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD'];
  const current = pair.toUpperCase().replace(/[^A-Z]/g, '');
  return pool.filter(p => p.replace('/', '') !== current).slice(0, 2);
}
