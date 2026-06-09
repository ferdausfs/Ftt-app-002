import { ArrowUp, ArrowDown, Minus, Clock } from 'lucide-react';
import { SignalData } from '../types';
import { cn } from '../utils/cn';

interface Props {
  data: SignalData;
  onPairClick: () => void;
}

export function MaterialSignalCard({ data, onPairClick }: Props) {
  const signal = data.signal.finalSignal;
  const isBuy = signal === 'BUY';
  const isSell = signal === 'SELL';
  const isNeutral = !isBuy && !isSell;

  const confidenceNum = parseInt(data.signal.confidence) || 0;
  const grade = data.signal.grade.grade;

  const best = data.signal.bestTimeframe;
  const entryPrice = data.signal.recommendations?.[best?.timeframe as '5min']?.entry?.price;

  return (
    <div className="md-surface-highest p-0 overflow-hidden scale-in relative">
      {/* Top gradient bar */}
      <div 
        className={cn(
          "h-1.5 w-full",
          isBuy && "bg-gradient-to-r from-[#81c784] to-[#4caf50]",
          isSell && "bg-gradient-to-r from-[#ef5350] to-[#f44336]",
          isNeutral && "bg-gradient-to-r from-[#bdbdbd] to-[#9e9e9e]"
        )}
      />

      <div className="p-5">
        {/* Header with pair selector */}
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={onPairClick}
            className="flex items-center gap-2 px-3 py-2 md-surface-variant rounded-xl active:scale-95 transition-transform"
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
              data.pair.includes('OTC') ? "bg-[#ff9800]/20 text-[#ff9800]" :
              ['BTC','ETH'].some(c => data.pair.includes(c)) ? "bg-[#9c27b0]/20 text-[#9c27b0]" :
              "bg-[#2196f3]/20 text-[#2196f3]"
            )}>
              {data.pair.slice(0, 2)}
            </div>
            <span className="font-medium text-base">{data.pair}</span>
          </button>

          <div className="flex items-center gap-2">
            <div className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5",
              data.marketStatus === 'OPEN' 
                ? "bg-[#81c784]/20 text-[#81c784]" 
                : "bg-[#ef5350]/20 text-[#ef5350]"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                data.marketStatus === 'OPEN' ? "bg-[#81c784] animate-pulse" : "bg-[#ef5350]"
              )} />
              {data.marketStatus}
            </div>
          </div>
        </div>

        {/* Main signal display */}
        <div className="flex items-center justify-between mb-5">
          {/* Signal direction */}
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center",
              isBuy && "bg-[#81c784]/20",
              isSell && "bg-[#ef5350]/20",
              isNeutral && "bg-[#bdbdbd]/20"
            )}>
              {isBuy && <ArrowUp className="w-8 h-8 text-[#81c784]" strokeWidth={2.5} />}
              {isSell && <ArrowDown className="w-8 h-8 text-[#ef5350]" strokeWidth={2.5} />}
              {isNeutral && <Minus className="w-8 h-8 text-[#bdbdbd]" strokeWidth={2.5} />}
            </div>
            <div>
              <div className="text-sm text-[#b0b3b8] mb-0.5">Signal</div>
              <div className={cn(
                "text-3xl font-medium",
                isBuy && "text-[#81c784]",
                isSell && "text-[#ef5350]",
                isNeutral && "text-[#bdbdbd]"
              )}>
                {signal}
              </div>
            </div>
          </div>

          {/* Confidence circular progress */}
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="var(--md-sys-color-surface-container-highest)"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke={isBuy ? '#81c784' : isSell ? '#ef5350' : '#bdbdbd'}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={264}
                strokeDashoffset={264 - (confidenceNum / 100) * 264}
                className="transition-all duration-1000"
                style={{ filter: `drop-shadow(0 0 8px ${isBuy ? '#81c784' : isSell ? '#ef5350' : '#bdbdbd'}60)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn(
                "text-2xl font-light number-tabular",
                isBuy && "text-[#81c784]",
                isSell && "text-[#ef5350]",
                isNeutral && "text-[#bdbdbd]"
              )}>
                {confidenceNum}
              </span>
              <span className="text-xs text-[#b0b3b8]">%</span>
            </div>
          </div>
        </div>

        {/* Grade badge */}
        <div className="flex items-center gap-2 mb-4">
          <div className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium",
            grade === 'A' && "bg-[#81c784]/20 text-[#81c784]",
            grade === 'B' && "bg-[#42a5f5]/20 text-[#42a5f5]",
            grade === 'C' && "bg-[#ffb74d]/20 text-[#ffb74d]",
            ['D','F'].includes(grade) && "bg-[#ef5350]/20 text-[#ef5350]"
          )}>
            Grade {grade} · {data.signal.grade.label}
          </div>
          {best?.timeframe && (
            <div className="md-chip">
              <Clock className="w-3.5 h-3.5" />
              {best.timeframe}
            </div>
          )}
        </div>

        {/* Entry info grid */}
        {entryPrice && (
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#3a3a3e]">
            <div>
              <div className="text-xs text-[#b0b3b8] mb-1">Entry Price</div>
              <div className="text-base font-medium number-tabular">{entryPrice}</div>
            </div>
            <div>
              <div className="text-xs text-[#b0b3b8] mb-1">Timeframe</div>
              <div className="text-base font-medium">{best?.timeframe}</div>
            </div>
            <div>
              <div className="text-xs text-[#b0b3b8] mb-1">Expiry</div>
              <div className="text-base font-medium">{best?.expiry?.humanReadable || '—'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
