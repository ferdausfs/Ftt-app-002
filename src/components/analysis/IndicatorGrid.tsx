import { cn } from '../../utils/cn';
import { Gauge, Activity, Zap } from 'lucide-react';
import { TimeframeRec } from '../../types';
import { GaugeBar } from './GaugeBar';
import { MiniStat } from './MiniStat';
import { TrendingUp as TrendIcon } from 'lucide-react';

interface IndicatorGridProps {
  recommendations: Record<string, TimeframeRec>;
  timeframeAnalysis?: Record<string, any>;
  selectedTF: string;
  onSelectTF: (tf: string) => void;
}

export function IndicatorGrid({ recommendations, timeframeAnalysis, selectedTF, onSelectTF }: IndicatorGridProps) {
  const rec = recommendations[selectedTF];
  const indicators = timeframeAnalysis?.[selectedTF]?.indicators || (rec as any)?.indicators;

  return (
    <div className="space-y-3">
      {/* TF switcher */}
      <div className="md-surface p-1 flex gap-1">
        {Object.keys(recommendations).map(tf => (
          <button key={tf} onClick={() => onSelectTF(tf)} className={cn("flex-1 py-2 text-xs font-medium rounded-xl transition-all", selectedTF === tf ? "bg-[var(--c-info)]/20 text-[var(--c-info)]" : "text-[#b0b3b8]")}>
            {tf.toUpperCase()}
          </button>
        ))}
      </div>

      {indicators && (
        <>
          {/* Momentum */}
          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-[var(--c-info)]" /><span className="text-sm font-medium">Momentum</span></div>
            <div className="space-y-3">
              <GaugeBar label="RSI" value={parseFloat(indicators.rsi)} />
              <GaugeBar label="Stoch K" value={parseFloat(indicators.stochK)} />
              <GaugeBar label="Stoch D" value={parseFloat(indicators.stochD)} />
            </div>
          </div>

          {/* Trend (EMA) */}
          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><TrendIcon className="w-4 h-4 text-[var(--c-buy)]" /><span className="text-sm font-medium">Trend (EMA)</span></div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="EMA 5" value={indicators.ema5} />
              <MiniStat label="EMA 13" value={indicators.ema13} />
              <MiniStat label="EMA 55" value={indicators.ema55} />
            </div>
            <div className={cn("px-3 py-2 rounded-lg text-center text-xs font-medium",
              indicators.emaAlignment === 'FULL_BULL_STACK' ? "bg-[var(--c-buy)]/15 text-[var(--c-buy)]" :
              indicators.emaAlignment === 'FULL_BEAR_STACK' ? "bg-[var(--c-sell)]/15 text-[var(--c-sell)]" :
              "bg-[#27272d] text-[#b0b3b8]")}>
              {indicators.emaAlignment?.replace(/_/g, ' ')}
            </div>
          </div>

          {/* MACD */}
          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[#b39ddb]" /><span className="text-sm font-medium">MACD</span></div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Line" value={indicators.macdLine} />
              <MiniStat label="Signal" value={indicators.macdSignal} />
              <MiniStat label="Hist" value={indicators.macdHist} color={parseFloat(indicators.macdHist) > 0 ? 'var(--c-buy)' : 'var(--c-sell)'} />
            </div>
          </div>

          {/* ADX */}
          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-[#ffb74d]" /><span className="text-sm font-medium">ADX</span></div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="ADX" value={indicators.adx} color={parseFloat(indicators.adx) > 25 ? 'var(--c-buy)' : '#9e9e9e'} />
              <MiniStat label="+DI" value={indicators.plusDI} color="var(--c-buy)" />
              <MiniStat label="-DI" value={indicators.minusDI} color="var(--c-sell)" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
