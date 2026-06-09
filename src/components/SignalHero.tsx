import { ArrowUpRight, ArrowDownRight, Minus, ChevronDown } from 'lucide-react';
import { SignalData } from '../types';
import { cn } from '../utils/cn';
import { CircularCountdown } from './CountdownTimer';

interface Props {
  data: SignalData;
  onPairClick: () => void;
}

export function SignalHero({ data, onPairClick }: Props) {
  const signal = data.signal.finalSignal;
  const isBuy = signal === 'BUY';
  const isSell = signal === 'SELL';
  const isNeutral = !isBuy && !isSell;

  const color = isBuy ? '#30d158' : isSell ? '#ff453a' : '#8e8e93';
  const bgGradient = isBuy ? 'gradient-buy' : isSell ? 'gradient-sell' : 'gradient-neutral';
  const shadowClass = isBuy ? 'ios-shadow-green' : isSell ? 'ios-shadow-red' : '';

  const best = data.signal.bestTimeframe;
  const entryPrice = data.signal.recommendations?.[best?.timeframe as '5min']?.entry?.price;

  return (
    <div className={cn("relative ios-card rounded-3xl p-6 overflow-hidden scale-in", bgGradient)}>
      {/* Decorative glow */}
      <div 
        className={cn("absolute -top-32 -right-32 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none")}
        style={{ background: color }}
      />

      {/* Pair selector button */}
      <button 
        onClick={onPairClick}
        className="relative flex items-center gap-2 mb-5 haptic-tap"
      >
        <div className="flex items-center gap-2 bg-white/5 rounded-full pl-2 pr-3 py-1.5 border border-white/10">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
            data.pair.includes('OTC') ? "bg-[#ff9f0a]/30 text-[#ff9f0a]" :
            ['BTC','ETH'].some(c => data.pair.includes(c)) ? "bg-[#bf5af2]/30 text-[#bf5af2]" :
            "bg-[#0a84ff]/30 text-[#0a84ff]"
          )}>
            {data.pair.slice(0, 2)}
          </div>
          <span className="text-white font-bold text-base">{data.pair}</span>
          <ChevronDown className="w-4 h-4 text-white/60" />
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            data.marketStatus === 'OPEN' ? "bg-[#30d158]" : "bg-[#ff453a]"
          )}>
            {data.marketStatus === 'OPEN' && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#30d158] pulse-ring" />
            )}
          </div>
          <span className="text-[10px] text-white/60 font-medium uppercase tracking-wider">
            {data.marketStatus}
          </span>
        </div>
      </button>

      {/* Main Signal Display */}
      <div className="relative flex items-center justify-between">
        <div className="flex-1">
          {/* Direction badge */}
          <div 
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3",
              isBuy && "bg-[#30d158]/20 text-[#30d158]",
              isSell && "bg-[#ff453a]/20 text-[#ff453a]",
              isNeutral && "bg-white/10 text-white/60"
            )}
          >
            {isBuy && <ArrowUpRight className="w-3.5 h-3.5" />}
            {isSell && <ArrowDownRight className="w-3.5 h-3.5" />}
            {isNeutral && <Minus className="w-3.5 h-3.5" />}
            <span>{signal}</span>
          </div>

          {/* Confidence */}
          <div className="flex items-baseline gap-2 mb-1">
            <span 
              className="text-6xl font-bold tracking-tight number-tabular"
              style={{ color }}
            >
              {data.signal.confidence.replace('%', '')}
            </span>
            <span className="text-2xl text-white/60 font-bold">%</span>
          </div>
          <div className="text-white/50 text-xs font-medium uppercase tracking-wider">
            Confidence Level
          </div>

          {/* Grade */}
          <div className="mt-4 flex items-center gap-2">
            <div className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-bold",
              data.signal.grade.grade === 'A' && "bg-[#30d158]/20 text-[#30d158]",
              data.signal.grade.grade === 'B' && "bg-[#0a84ff]/20 text-[#0a84ff]",
              data.signal.grade.grade === 'C' && "bg-[#ffd60a]/20 text-[#ffd60a]",
              ['D','F'].includes(data.signal.grade.grade) && "bg-[#ff453a]/20 text-[#ff453a]"
            )}>
              Grade {data.signal.grade.grade} · {data.signal.grade.label}
            </div>
          </div>
        </div>

        {/* Countdown circle */}
        {best?.expiry?.countdown && (
          <div className={cn("flex-shrink-0", shadowClass)}>
            <CircularCountdown 
              secondsLeft={best.expiry.countdown.secondsLeft}
              total={best.timeframe === '1min' ? 60 : best.timeframe === '5min' ? 300 : 900}
              direction={signal}
            />
          </div>
        )}
      </div>

      {/* Entry info */}
      {entryPrice && (
        <div className="relative mt-5 pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Entry</div>
            <div className="text-white font-bold number-tabular text-[15px]">{entryPrice}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Timeframe</div>
            <div className="text-white font-bold text-[15px]">{best?.timeframe}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Expiry</div>
            <div className="text-white font-bold text-[15px]">{best?.expiry?.humanReadable || '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
