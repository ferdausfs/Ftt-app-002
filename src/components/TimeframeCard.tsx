import { ArrowUpRight, ArrowDownRight, Minus, CheckCircle2, AlertCircle } from 'lucide-react';
import { TimeframeRec } from '../types';
import { cn } from '../utils/cn';
import { CountdownTimer } from './CountdownTimer';

export function TimeframeCard({ tf, rec }: { tf: string; rec: TimeframeRec }) {
  const isBuy = rec.direction === 'BUY';
  const isSell = rec.direction === 'SELL';
  const isNeutral = !isBuy && !isSell;
  const color = isBuy ? '#30d158' : isSell ? '#ff453a' : '#8e8e93';

  const upPercent = rec.score.up + rec.score.down > 0 
    ? (rec.score.up / (rec.score.up + rec.score.down)) * 100 
    : 50;

  return (
    <div className="ios-card rounded-2xl p-4 fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center",
            isBuy && "bg-[#30d158]/15",
            isSell && "bg-[#ff453a]/15",
            isNeutral && "bg-white/10"
          )}>
            {isBuy && <ArrowUpRight className="w-5 h-5 text-[#30d158]" strokeWidth={2.5} />}
            {isSell && <ArrowDownRight className="w-5 h-5 text-[#ff453a]" strokeWidth={2.5} />}
            {isNeutral && <Minus className="w-5 h-5 text-white/60" strokeWidth={2.5} />}
          </div>
          <div>
            <div className="text-white font-bold text-base">{tf.toUpperCase()}</div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-white/60 font-medium">{rec.confluence}</span>
              {rec.alignedWithHTF && (
                <CheckCircle2 className="w-3 h-3 text-[#30d158]" />
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={cn("font-bold text-sm", `text-[${color}]`)} style={{ color }}>
            {rec.direction}
          </div>
          {rec.expiry?.countdown && (
            <CountdownTimer secondsLeft={rec.expiry.countdown.secondsLeft} size="sm" />
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-[#30d158] font-bold number-tabular">▲ {rec.score.up.toFixed(2)}</span>
          <span className="text-white/40">DIFF {rec.score.diff.toFixed(2)}</span>
          <span className="text-[#ff453a] font-bold number-tabular">▼ {rec.score.down.toFixed(2)}</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
          <div 
            className="bg-gradient-to-r from-[#30d158] to-[#30d158]/70 transition-all duration-500"
            style={{ width: `${upPercent}%` }}
          />
          <div 
            className="bg-gradient-to-r from-[#ff453a]/70 to-[#ff453a] transition-all duration-500"
            style={{ width: `${100 - upPercent}%` }}
          />
        </div>
      </div>

      {/* Entry info */}
      {rec.entry && (
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.06]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">Entry Price</div>
            <div className="text-white font-bold number-tabular text-[13px]">{rec.entry.price}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">Candle</div>
            <div className={cn(
              "font-bold text-[13px]",
              rec.entry.candleDirection === 'BULLISH' ? "text-[#30d158]" : "text-[#ff453a]"
            )}>
              {rec.entry.candleDirection}
            </div>
          </div>
        </div>
      )}

      {/* Divergence warning */}
      {rec.divergence && (rec.divergence.rsi !== 'NONE' || rec.divergence.macd !== 'NONE') && (
        <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-[#ff9f0a]/10 rounded-lg">
          <AlertCircle className="w-3 h-3 text-[#ff9f0a] flex-shrink-0" />
          <span className="text-[10px] text-[#ff9f0a] font-medium">
            {rec.divergence.rsi !== 'NONE' ? rec.divergence.rsi.replace(/_/g, ' ') : ''}
            {rec.divergence.macd !== 'NONE' ? ' · ' + rec.divergence.macd.replace(/_/g, ' ') : ''}
          </span>
        </div>
      )}
    </div>
  );
}
