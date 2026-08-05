import { RefreshCw, BarChart3, AlertCircle } from 'lucide-react';
import { formatServerWinRate } from '../../lib/formatters';
import { filterSubtitle, TIME_RANGE_LABEL } from '../../utils/serverWr';
import { ServerStatsState, ServerPairStats, isAggregateStats } from '../../hooks/useServerStats';

interface ServerStatsCardProps {
  state: ServerStatsState | null;
  selectedPair: string;
  onRetry: () => void;
}

export function ServerStatsCard({ state, selectedPair, onRetry }: ServerStatsCardProps) {
  if (!state) return null;

  const stats = state.stats;
  const hasStats = !!stats;
  const aggregate = isAggregateStats(stats) ? stats : null;
  const pairStats = !aggregate && stats ? (stats as ServerPairStats) : null;

  const wins = aggregate ? aggregate.totalWins : (pairStats?.wins ?? 0);
  const losses = aggregate ? aggregate.totalLosses : (pairStats?.losses ?? 0);
  const signals = aggregate ? aggregate.totalSignals : pairStats?.totalSignals;
  const winRate = aggregate ? aggregate.winRate : pairStats?.winRate;
  const lastUpdatedRaw = aggregate ? aggregate.lastUpdated : pairStats?.lastUpdated;
  const lastUpdated = lastUpdatedRaw ? new Date(lastUpdatedRaw) : null;
  const lastUpdatedLabel = lastUpdated && !Number.isNaN(lastUpdated.getTime())
    ? lastUpdated.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const subtitle = filterSubtitle(state.filter, state.pair || selectedPair);
  const windowed = state.filter.timeRange !== 'all';
  const showConfidenceAdj = !windowed && state.filter.pairScope === 'selected' && pairStats;
  const truncated = aggregate?.coverage && !aggregate.coverage.complete;

  return (
    <div className="premium-card p-4 mb-4 border border-[var(--c-info)]/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--c-info)]/15 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-[var(--c-info)]" />
          </div>
          <div>
            <div className="text-sm font-medium">Server Win Rate</div>
            <div className="text-xs text-[#8e9099]">{subtitle}</div>
          </div>
        </div>
        {state.loading && <RefreshCw className="w-4 h-4 text-[var(--c-info)] animate-spin" />}
      </div>

      {state.fallbackNote && (
        <div className="mb-3 rounded-xl bg-[#ffb74d]/10 border border-[#ffb74d]/20 px-3 py-2 text-[11px] text-[#ffb74d]">
          {state.fallbackNote}
        </div>
      )}

      {state.loading && !hasStats ? (
        <div className="space-y-2" role="status" aria-label="Loading server stats">
          <div className="grid grid-cols-3 gap-2">
            <div className="h-[64px] bg-[#1e1e23] rounded-xl shimmer" />
            <div className="h-[64px] bg-[#1e1e23] rounded-xl shimmer" />
            <div className="h-[64px] bg-[#1e1e23] rounded-xl shimmer" />
          </div>
          <p className="text-[11px] text-[var(--t-low)] pl-1">
            {state.filter.pairScope === 'all' && windowed ? 'Computing across all pairs…' : 'Loading server stats…'}
          </p>
        </div>
      ) : hasStats ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#1e1e23] rounded-2xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">Server Win %</div>
              <div className="text-lg font-medium number-tabular text-[#4dd0e1]">{formatServerWinRate(winRate)}</div>
            </div>
            <div className="bg-[#1e1e23] rounded-2xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">{windowed ? 'Decided' : 'Signals'}</div>
              <div className="text-lg font-medium number-tabular">{signals ?? '—'}</div>
            </div>
            <div className="bg-[#1e1e23] rounded-2xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">W / L</div>
              <div className="text-lg font-medium number-tabular">
                <span className="text-[var(--c-buy)]">{wins}</span>
                <span className="text-[var(--t-low)]"> / </span>
                <span className="text-[var(--c-sell)]">{losses}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--t-low)]">
            {windowed && typeof aggregate?.recordsConsidered === 'number' && (
              <span>Filtered from {aggregate.recordsConsidered} recent records · {TIME_RANGE_LABEL[state.filter.timeRange]}</span>
            )}
            {!windowed && aggregate && typeof aggregate.pairCount === 'number' && (
              <span>{aggregate.pairCount} pairs contributing</span>
            )}
            {!windowed && pairStats && typeof pairStats.sampleSize === 'number' && (
              <span>Lookback sample: {pairStats.sampleSize}</span>
            )}
            {showConfidenceAdj && typeof pairStats.dynamicConfidenceAdjustment === 'number' && (
              <span>· Confidence adj: {pairStats.dynamicConfidenceAdjustment > 0 ? '+' : ''}{pairStats.dynamicConfidenceAdjustment}</span>
            )}
            {lastUpdatedLabel && <span>· Updated {lastUpdatedLabel}</span>}
          </div>

          {truncated && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#ffb74d]/10 border border-[#ffb74d]/20 px-3 py-2 text-[11px] text-[#ffb74d]">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                At least {signals} — the server keeps only the 50 most recent signals per pair,
                so older results inside this window are no longer retrievable
                {aggregate?.coverage?.truncatedPairs?.length
                  ? ` (${aggregate.coverage.truncatedPairs.slice(0, 3).join(', ')}${aggregate.coverage.truncatedPairs.length > 3 ? ` +${aggregate.coverage.truncatedPairs.length - 3} more` : ''})`
                  : ''}.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl bg-[#1e1e23] p-3 text-xs text-[#b0b3b8] flex items-center justify-between gap-3">
          <span>{state.message || 'No server stats yet for this pair.'}</span>
          {state.retryable && (
            <button onClick={onRetry} className="px-3 py-1.5 rounded-full bg-[var(--c-info)]/15 text-[var(--c-info)] text-[11px] font-medium active:scale-95 transition-transform whitespace-nowrap">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
