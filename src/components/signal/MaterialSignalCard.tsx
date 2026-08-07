import { cn } from '../../utils/cn';
import { deriveAiStatus, aiStatusBadge, ENTRY_SOURCE_LABEL } from '../../utils/signalMeta';
import { TradableSignalData } from '../../hooks/useSignal';
import { ConfidenceRing } from './ConfidenceRing';
import { ModeChip } from './ModeChip';
import { FillBadge } from './FillBadge';
import { SltpChip } from './SltpChip';
import { FilterBadges } from '../Premium';

interface MaterialSignalCardProps {
  data: TradableSignalData;
  onPairClick: () => void;
}

export function MaterialSignalCard({ data, onPairClick }: MaterialSignalCardProps) {
  const signal = data.signal.finalSignal;
  const isBuy = signal === 'BUY';
  const isSell = signal === 'SELL';
  const isNoTrade = signal === 'NO_TRADE';
  const confidenceNum = parseInt(data.signal.confidence) || 0;
  const best = data.signal.bestTimeframe;
  const entryPrice = data.signal.recommendations?.[best?.timeframe as '5min']?.entry?.price;
  const coreConfidence = data.signal.coreConfidence;
  const structureOverall = data.signal.structureVerdict?.overall;
  const aiBadge = aiStatusBadge(deriveAiStatus(data));
  const expiryLabel = best?.expiry?.humanReadable || '—';
  const cdLabel = best?.expiry?.countdown?.label;
  const dirColor = isBuy ? '#00e676' : isSell ? '#ff5252' : '#9e9e9e';
  const dirTint = isBuy ? 'rgba(0,230,118,0.06)' : isSell ? 'rgba(255,82,82,0.06)' : 'transparent';
  const dirGlow = isBuy ? '0 0 40px rgba(0,230,118,0.12)' : isSell ? '0 0 40px rgba(255,82,82,0.12)' : 'none';

  return (
    <div className="scale-in overflow-hidden" style={{
      borderRadius: 24,
      background: `linear-gradient(160deg, ${dirTint}, rgba(20,20,23,0.96))`,
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: `0 16px 48px rgba(0,0,0,0.5), ${dirGlow}`,
    }}>
      {/* Accent line */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${dirColor}40, transparent 80%)` }} />

      <div className="p-5">
        {/* Pair + Market */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onPairClick} className="flex items-center gap-2.5 active:scale-95 transition-transform">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
              data.pair.includes('OTC') ? "bg-[#ff9800]/12 text-[#ffb74d]" :
              ['BTC','ETH'].some(c => data.pair.includes(c)) ? "bg-[#9c27b0]/12 text-[#ce93d8]" :
              "bg-[var(--c-info)]/12 text-[var(--c-info)]"
            )}>{data.pair.slice(0, 2)}</div>
            <div>
              <div className="text-[15px] font-semibold tracking-tight">{data.pair}</div>
              <div className="text-[10px] text-[var(--t-low)] uppercase tracking-[0.15em]">{data.assetType}</div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{
            background: data.marketStatus === 'OPEN' ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)'
          }}>
            <div className={cn("w-1.5 h-1.5 rounded-full", data.marketStatus === 'OPEN' ? "bg-[#00e676]" : "bg-[#ff5252]")}
              style={data.marketStatus === 'OPEN' ? { boxShadow: '0 0 6px #00e676', animation: 'pulse 2s infinite' } : {}} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: data.marketStatus === 'OPEN' ? '#00e676' : '#ff5252' }}>{data.marketStatus}</span>
          </div>
        </div>

        {/* HERO: Direction + Confidence */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <div className="label-caption mb-1">Signal Direction</div>
            <div className="text-[44px] font-extrabold leading-none tracking-tight mb-2" style={{ color: dirColor, textShadow: `0 0 24px ${dirColor}30` }}>
              {isBuy ? 'BUY' : isSell ? 'SELL' : 'WAIT'}
            </div>
            {/* MODE + FILL + SL-TP chips */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <ModeChip mode={data.signal.mode} />
              <FillBadge fillStatus={data.signal.fillStatus} entryDistancePct={data.signal.entryDistancePct} />
              <SltpChip sl={data.signal.fxLevels?.sl} tp={data.signal.fxLevels?.tp} rr={data.signal.fxLevels?.rr} />
            </div>
            <div className="flex items-center gap-2">
              {data.signal.grade && !(data.signal.finalSignal === 'NO_TRADE') && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{
                  background: data.signal.grade.grade === 'N/A' ? 'rgba(120,130,140,0.12)' :
                    data.signal.grade.grade === 'A+' ? 'rgba(0,230,118,0.12)' :
                    data.signal.grade.grade === 'A' ? 'rgba(76,175,80,0.12)' :
                    data.signal.grade.grade === 'B' ? 'rgba(var(--rgb-info),0.12)' : 'rgba(var(--rgb-warn),0.12)',
                  color: data.signal.grade.grade === 'N/A' ? '#8896a8' :
                    data.signal.grade.grade === 'A+' ? '#00e676' :
                    data.signal.grade.grade === 'A' ? 'var(--c-buy)' :
                    data.signal.grade.grade === 'B' ? 'var(--c-info)' : '#ffb74d',
                }}>{data.signal.grade.grade} · {data.signal.grade.label}</span>
              )}
              {best?.timeframe && <span className="text-[10px] text-[var(--t-low)] font-medium uppercase">{best.timeframe}</span>}
            </div>
          </div>

          <ConfidenceRing confidenceNum={confidenceNum} dirColor={dirColor} />
        </div>

        {/* Key Data Grid */}
        {!isNoTrade && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="label-caption mb-1">Entry Price</div>
              <div className="text-[13px] font-bold number-tabular">{entryPrice?.toLocaleString() ?? '—'}</div>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="label-caption mb-1">Expiry</div>
              <div className="text-[13px] font-bold">{expiryLabel}</div>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="label-caption mb-1">Candle Close</div>
              <div className="text-[13px] font-bold number-tabular">{cdLabel || '—'}</div>
            </div>
          </div>
        )}

        {/* HTF + Regime */}
        <div className="flex items-center gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          {data.signal.higherTFTrend && (
            <div className="flex items-center gap-1.5">
              <span className="label-caption">HTF 15m</span>
              <span className="text-xs font-bold" style={{ color: data.signal.higherTFTrend === 'BUY' ? '#00e676' : data.signal.higherTFTrend === 'SELL' ? '#ff5252' : '#9e9e9e' }}>{data.signal.higherTFTrend}</span>
            </div>
          )}
          {data.signal.marketRegime && (
            <div className="flex items-center gap-1.5">
              <span className="label-caption">Regime</span>
              <span className="text-xs font-medium text-[#b0b3b8]">{data.signal.marketRegime}</span>
            </div>
          )}
          {data.signal.regimeAdvice && <span className="text-[10px] text-[var(--t-low)] truncate flex-1">{data.signal.regimeAdvice}</span>}
        </div>

        {/* Diagnostic Badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {typeof coreConfidence === 'number' && Math.abs(coreConfidence - confidenceNum) >= 5 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(var(--rgb-purple),0.1)', color: '#b39ddb' }}>Core {coreConfidence}%</span>
          )}
          {structureOverall && structureOverall !== 'N/A' && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{
              background: structureOverall === 'ALIGNED' ? 'rgba(0,230,118,0.08)' : structureOverall === 'AGAINST' ? 'rgba(255,82,82,0.08)' : 'rgba(var(--rgb-warn),0.08)',
              color: structureOverall === 'ALIGNED' ? '#00e676' : structureOverall === 'AGAINST' ? '#ff5252' : '#ffb74d',
            }}>Struct: {structureOverall}</span>
          )}
          {aiBadge && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.03)', color: '#b0b3b8' }}>{aiBadge.label}</span>
          )}
          {data.entrySource && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.03)', color: '#6e6e73' }}>{ENTRY_SOURCE_LABEL[data.entrySource] || data.entrySource}</span>
          )}
        </div>

        {/* Filter badges (D2 transparency — Honesty UI) */}
        <FilterBadges filters={data.signal.filtersApplied} />

        {/* Entry reason */}
        {data.signal.entryReason && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <p className="text-[11px] text-[#8e9099] leading-relaxed">{data.signal.entryReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
