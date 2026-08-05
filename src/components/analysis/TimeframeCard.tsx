import { cn } from '../../utils/cn';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { TimeframeRec } from '../../types';

export function TimeframeCard({ tf, rec }: { tf: string; rec: TimeframeRec }) {
  const isBuy = rec.direction === 'BUY';
  const isSell = rec.direction === 'SELL';
  const color = isBuy ? 'var(--c-buy)' : isSell ? 'var(--c-sell)' : '#9e9e9e';
  const upPercent = rec.score.up + rec.score.down > 0 ? (rec.score.up / (rec.score.up + rec.score.down)) * 100 : 50;

  return (
    <div className="premium-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isBuy ? "bg-[var(--c-buy)]/15" : isSell ? "bg-[var(--c-sell)]/15" : "bg-[#9e9e9e]/15")}>
            {isBuy ? <ArrowUp className="w-5 h-5 text-[var(--c-buy)]" /> : isSell ? <ArrowDown className="w-5 h-5 text-[var(--c-sell)]" /> : <Minus className="w-5 h-5 text-[#9e9e9e]" />}
          </div>
          <div>
            <div className="font-medium">{tf.toUpperCase()}</div>
            <div className="text-xs text-[#b0b3b8]">{rec.confluence}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium" style={{ color }}>{rec.direction}</div>
          {rec.expiry?.countdown && <div className="text-xs text-[#b0b3b8] number-tabular">{Math.floor(rec.expiry.countdown.secondsLeft / 60)}:{(rec.expiry.countdown.secondsLeft % 60).toString().padStart(2, '0')}</div>}
        </div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-[var(--c-buy)] font-medium">▲ {rec.score.up.toFixed(1)}</span>
          <span className="text-[#b0b3b8]">DIFF {rec.score.diff.toFixed(1)}</span>
          <span className="text-[var(--c-sell)] font-medium">▼ {rec.score.down.toFixed(1)}</span>
        </div>
        <div className="h-1.5 bg-[#27272d] rounded-full overflow-hidden flex">
          <div className="bg-[var(--c-buy)] transition-all duration-500" style={{ width: `${upPercent}%` }} />
          <div className="bg-[var(--c-sell)] transition-all duration-500" style={{ width: `${100 - upPercent}%` }} />
        </div>
      </div>
      {rec.entry && (
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#3a3a3e]">
          <div><div className="text-xs text-[#b0b3b8]">Entry</div><div className="text-sm font-medium number-tabular">{rec.entry.price}</div></div>
          <div><div className="text-xs text-[#b0b3b8]">Candle</div><div className={cn("text-sm font-medium", rec.entry.candleDirection === 'BULLISH' ? "text-[var(--c-buy)]" : "text-[var(--c-sell)]")}>{rec.entry.candleDirection}</div></div>
        </div>
      )}
    </div>
  );
}
