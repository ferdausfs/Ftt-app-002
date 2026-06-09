import { Activity, TrendingUp, BarChart2, Zap, Gauge } from 'lucide-react';
import { TimeframeRec } from '../types';
import { cn } from '../utils/cn';

interface Props {
  recommendations: Record<string, TimeframeRec>;
  selectedTF: string;
  onSelectTF: (tf: string) => void;
}

export function IndicatorGrid({ recommendations, selectedTF, onSelectTF }: Props) {
  const rec = recommendations[selectedTF];
  const indicators = (rec as any)?.indicators;

  return (
    <div className="space-y-3">
      {/* TF Selector */}
      <div className="ios-card rounded-2xl p-1 flex gap-1">
        {Object.keys(recommendations).map(tf => (
          <button
            key={tf}
            onClick={() => onSelectTF(tf)}
            className={cn(
              "flex-1 py-2 text-xs font-semibold rounded-xl transition-all haptic-tap",
              selectedTF === tf 
                ? "bg-white/15 text-white" 
                : "text-white/50"
            )}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>

      {!indicators ? (
        <div className="ios-card rounded-2xl p-8 text-center">
          <p className="text-white/40 text-sm">No indicator data available</p>
        </div>
      ) : (
        <>
          {/* RSI / Stoch Card */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-[#0a84ff]" />
              <span className="text-white font-semibold text-sm">Momentum</span>
            </div>
            <div className="space-y-3">
              <GaugeBar label="RSI (14)" value={parseFloat(indicators.rsi)} max={100} dangerZones={[30, 70]} />
              <GaugeBar label="Stoch %K" value={parseFloat(indicators.stochK)} max={100} dangerZones={[20, 80]} />
              <GaugeBar label="Stoch %D" value={parseFloat(indicators.stochD)} max={100} dangerZones={[20, 80]} />
              <GaugeBar label="Williams %R" value={Math.abs(parseFloat(indicators.williamsR))} max={100} dangerZones={[20, 80]} invert />
            </div>
          </div>

          {/* Trend Indicators */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#30d158]" />
              <span className="text-white font-semibold text-sm">Trend (EMA)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="EMA 5" value={indicators.ema5} />
              <MiniStat label="EMA 13" value={indicators.ema13} />
              <MiniStat label="EMA 55" value={indicators.ema55} />
            </div>
            <div className={cn(
              "px-3 py-2 rounded-lg text-center text-xs font-bold",
              indicators.emaAlignment === 'FULL_BULL_STACK' && "bg-[#30d158]/15 text-[#30d158]",
              indicators.emaAlignment === 'FULL_BEAR_STACK' && "bg-[#ff453a]/15 text-[#ff453a]",
              !['FULL_BULL_STACK','FULL_BEAR_STACK'].includes(indicators.emaAlignment) && "bg-white/5 text-white/60"
            )}>
              {indicators.emaAlignment?.replace(/_/g, ' ')}
            </div>
          </div>

          {/* MACD */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-[#bf5af2]" />
              <span className="text-white font-semibold text-sm">MACD</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Line" value={indicators.macdLine} />
              <MiniStat label="Signal" value={indicators.macdSignal} />
              <MiniStat 
                label="Histogram" 
                value={indicators.macdHist}
                color={parseFloat(indicators.macdHist) > 0 ? '#30d158' : '#ff453a'}
              />
            </div>
          </div>

          {/* ADX & DI */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#ff9f0a]" />
              <span className="text-white font-semibold text-sm">Trend Strength</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat 
                label="ADX" 
                value={indicators.adx}
                color={parseFloat(indicators.adx) > 25 ? '#30d158' : '#8e8e93'}
              />
              <MiniStat label="+DI" value={indicators.plusDI} color="#30d158" />
              <MiniStat label="-DI" value={indicators.minusDI} color="#ff453a" />
            </div>
            <div className="text-[10px] text-white/40 text-center">
              {parseFloat(indicators.adx) > 25 ? '🔥 Strong Trend' : '😴 Weak/No Trend'}
            </div>
          </div>

          {/* Bollinger Bands */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-[#64d2ff]" />
              <span className="text-white font-semibold text-sm">Bollinger Bands</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="Upper" value={indicators.bbUpper} color="#ff453a" />
              <MiniStat label="Middle" value={indicators.bbMiddle} />
              <MiniStat label="Lower" value={indicators.bbLower} color="#30d158" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Bandwidth" value={indicators.bbBandwidth} />
              <MiniStat label="%B" value={indicators.bbPercentB} />
            </div>
          </div>

          {/* Pivots */}
          <div className="ios-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-[#ffd60a]" />
              <span className="text-white font-semibold text-sm">Pivot Points</span>
            </div>
            <div className="space-y-1.5">
              <PivotRow label="R2" value={indicators.r2val} color="#ff453a" />
              <PivotRow label="R1" value={indicators.r1} color="#ff453a" />
              <PivotRow label="Pivot" value={indicators.pivot} color="#ffd60a" highlight />
              <PivotRow label="S1" value={indicators.s1} color="#30d158" />
              <PivotRow label="S2" value={indicators.s2} color="#30d158" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GaugeBar({ label, value, max, dangerZones, invert }: { 
  label: string; 
  value: number; 
  max: number;
  dangerZones: [number, number];
  invert?: boolean;
}) {
  if (isNaN(value)) return null;
  const percent = (value / max) * 100;
  const isOversold = invert ? value > dangerZones[1] : value < dangerZones[0];
  const isOverbought = invert ? value < dangerZones[0] : value > dangerZones[1];
  
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-white/60 font-medium">{label}</span>
        <span className={cn(
          "text-xs font-bold number-tabular",
          isOversold && "text-[#30d158]",
          isOverbought && "text-[#ff453a]",
          !isOversold && !isOverbought && "text-white"
        )}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full rounded-full transition-all",
            isOversold && "bg-[#30d158]",
            isOverbought && "bg-[#ff453a]",
            !isOversold && !isOverbought && "bg-[#0a84ff]"
          )}
          style={{ width: `${percent}%` }}
        />
        {/* Danger zone markers */}
        <div 
          className="absolute top-0 bottom-0 w-px bg-white/20" 
          style={{ left: `${(dangerZones[0]/max)*100}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-px bg-white/20" 
          style={{ left: `${(dangerZones[1]/max)*100}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white/[0.04] rounded-lg p-2">
      <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">{label}</div>
      <div className="font-bold number-tabular text-xs" style={{ color: color || '#fff' }}>
        {value}
      </div>
    </div>
  );
}

function PivotRow({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between px-2.5 py-1.5 rounded-lg",
      highlight ? "bg-white/10" : "bg-white/[0.03]"
    )}>
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
      <span className="text-xs font-bold text-white number-tabular">{value}</span>
    </div>
  );
}
