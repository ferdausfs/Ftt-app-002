import { useEffect, useState, useRef, useCallback } from 'react';
import { ServerWrFilter, DEFAULT_SERVER_WR_FILTER, SERVER_WR_FILTER_KEY,
  parseServerWrFilter, sameFilter, windowCutoff, filterCacheKey,
  aggregateAllPairs, countWindowed, combineWindowed,
  PairScope, TimeRange, StatsPairRow, CoverageSummary,
} from '../utils/serverWr';
import { isSupportedPair } from '../utils/signalMeta';
import { fetchPairStats, fetchAllStats, fetchHistory } from '../lib/api';

const CACHE_TTL = 5 * 60 * 1000;

export interface ServerPairStats {
  pair: string;
  totalSignals?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
  sampleSize?: number;
  lastUpdated?: string;
  dynamicConfidenceAdjustment?: number;
}

export interface ServerAggregateStats {
  isAggregate: true;
  scope: PairScope;
  window: TimeRange;
  totalWins: number;
  totalLosses: number;
  totalSignals: number;
  winRate: number;
  pairCount?: number;
  recordsConsidered?: number;
  coverage?: CoverageSummary;
  lastUpdated?: string;
}

export function isAggregateStats(s: ServerPairStats | ServerAggregateStats | null): s is ServerAggregateStats {
  return !!s && (s as ServerAggregateStats).isAggregate === true;
}

export interface ServerStatsState {
  pair: string;
  filter: ServerWrFilter;
  loading: boolean;
  stats: ServerPairStats | ServerAggregateStats | null;
  message?: string;
  fallbackNote?: string;
  retryable?: boolean;
}

export function useServerStats(selectedPair: string, activeTab: string) {
  const [serverWrFilter, setServerWrFilter] = useState<ServerWrFilter>(() => {
    try {
      const saved = localStorage.getItem(SERVER_WR_FILTER_KEY);
      return saved ? parseServerWrFilter(saved) : { ...DEFAULT_SERVER_WR_FILTER };
    } catch { return { ...DEFAULT_SERVER_WR_FILTER }; }
  });
  const [serverWrReloadKey, setServerWrReloadKey] = useState(0);
  const [serverStatsState, setServerStatsState] = useState<ServerStatsState | null>(null);
  const cacheRef = useRef<Map<string, { at: number; state: ServerStatsState }>>(new Map());
  const lastReloadRef = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(SERVER_WR_FILTER_KEY, JSON.stringify(serverWrFilter)); } catch {}
  }, [serverWrFilter]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    let cancelled = false;
    const controller = new AbortController();
    const budgetMs = serverWrFilter.pairScope === 'all' && serverWrFilter.timeRange !== 'all' ? 20000 : 10000;
    const timeoutId = setTimeout(() => controller.abort(), budgetMs);

    const cacheKey = filterCacheKey(serverWrFilter, selectedPair);
    const cached = cacheRef.current.get(cacheKey);
    const cacheFresh = cached && Date.now() - cached.at < CACHE_TTL;
    if (cacheFresh && serverWrReloadKey === lastReloadRef.current) {
      setServerStatsState(cached.state);
      clearTimeout(timeoutId);
      return () => { cancelled = true; controller.abort(); clearTimeout(timeoutId); };
    }
    lastReloadRef.current = serverWrReloadKey;

    setServerStatsState(prev => ({
      pair: selectedPair,
      filter: serverWrFilter,
      loading: true,
      stats: prev && sameFilter(prev.filter, serverWrFilter) && prev.pair === selectedPair ? prev.stats : null,
      message: undefined,
    }));

    const publish = (next: ServerStatsState) => {
      if (next.stats) cacheRef.current.set(cacheKey, { at: Date.now(), state: next });
      setServerStatsState(next);
    };

    const fetchPairList = async (): Promise<StatsPairRow[]> => {
      const payload = await fetchAllStats(controller.signal) as any;
      const pairs = Array.isArray(payload?.pairs) ? (payload.pairs as StatsPairRow[]) : [];
      return pairs.filter(p => p && typeof p.pair === 'string' && isSupportedPair(p.pair));
    };

    const compute = async () => {
      const { pairScope, timeRange } = serverWrFilter;
      const cutoff = windowCutoff(timeRange);

      // selected + all time
      if (pairScope === 'selected' && timeRange === 'all') {
        const payload = await fetchPairStats(selectedPair, controller.signal) as any;
        if (cancelled) return;
        publish({
          pair: payload?.pair || selectedPair,
          filter: serverWrFilter,
          loading: false,
          stats: payload?.stats || null,
          message: payload?.message,
        });
        return;
      }

      // all + all
      if (pairScope === 'all' && timeRange === 'all') {
        const pairs = await fetchPairList();
        if (cancelled) return;
        const agg = aggregateAllPairs(pairs);
        publish({
          pair: selectedPair, filter: serverWrFilter, loading: false,
          stats: {
            isAggregate: true, scope: 'all', window: 'all',
            totalWins: agg.totalWins, totalLosses: agg.totalLosses,
            totalSignals: agg.totalSignals, winRate: agg.winRate,
            pairCount: agg.pairCount, lastUpdated: agg.lastUpdated,
            coverage: { complete: true, truncatedPairs: [] },
          },
          message: agg.totalSignals === 0 ? 'No decided signals yet.' : undefined,
        });
        return;
      }

      // selected + window
      if (pairScope === 'selected') {
        const payload = await fetchHistory(selectedPair, 500, controller.signal);
        if (cancelled) return;
        const count = countWindowed(payload, cutoff);
        publish({
          pair: selectedPair, filter: serverWrFilter, loading: false,
          stats: {
            isAggregate: true, scope: 'selected', window: timeRange,
            totalWins: count.wins, totalLosses: count.losses,
            totalSignals: count.decided,
            winRate: count.decided > 0 ? count.wins / count.decided : 0,
            recordsConsidered: count.recordsConsidered,
            coverage: { complete: count.complete, truncatedPairs: count.complete ? [] : [selectedPair] },
          },
          message: count.decided === 0 ? `No decided signals for ${selectedPair} in this window.` : undefined,
        });
        return;
      }

      // all + window: fan out
      const pairs = await fetchPairList();
      if (cancelled) return;
      if (pairs.length === 0) throw new Error('no pairs');

      const settled = await Promise.all(pairs.map(async p => {
        try {
          const payload = await fetchHistory(p.pair, 500, controller.signal);
          return { pair: p.pair, count: countWindowed(payload, cutoff) };
        } catch {
          return { pair: p.pair, count: null };
        }
      }));
      if (cancelled) return;

      const failed = settled.filter(r => r.count === null).length;
      if (failed >= Math.ceil(pairs.length / 2)) {
        setServerStatsState({
          pair: selectedPair, filter: serverWrFilter, loading: false, stats: null,
          message: `Insufficient data — ${failed} of ${pairs.length} pair requests failed.`,
          retryable: true,
        });
        return;
      }

      const combined = combineWindowed(settled);
      publish({
        pair: selectedPair, filter: serverWrFilter, loading: false,
        stats: {
          isAggregate: true, scope: 'all', window: timeRange,
          totalWins: combined.totalWins, totalLosses: combined.totalLosses,
          totalSignals: combined.totalSignals, winRate: combined.winRate,
          pairCount: combined.pairCount, recordsConsidered: combined.recordsConsidered,
          coverage: combined.coverage,
        },
        message: combined.totalSignals === 0 ? 'No decided signals across any pair in this window.' : undefined,
        retryable: failed > 0 ? true : undefined,
      });
    };

    compute().catch(async (e) => {
      if (cancelled || e?.name === 'AbortError') return;
      console.warn('Server WR fetch failed.', { filter: serverWrFilter, pair: selectedPair, error: e });
      if (serverWrFilter.pairScope === 'all') {
        try {
          const payload = await fetchPairStats(selectedPair, controller.signal) as any;
          if (cancelled) return;
          setServerStatsState({
            pair: payload?.pair || selectedPair,
            filter: { pairScope: 'selected', timeRange: 'all' },
            loading: false,
            stats: payload?.stats || null,
            fallbackNote: 'All Pairs view unavailable — showing selected pair.',
            retryable: true,
          });
          return;
        } catch { /* fall through */ }
      }
      if (!cancelled) {
        setServerStatsState({
          pair: selectedPair, filter: serverWrFilter, loading: false, stats: null,
          message: 'Server stats unavailable.', retryable: true,
        });
      }
    }).finally(() => clearTimeout(timeoutId));

    return () => {
      cancelled = true; controller.abort(); clearTimeout(timeoutId);
    };
  }, [activeTab, selectedPair, serverWrFilter, serverWrReloadKey]);

  const retry = useCallback(() => setServerWrReloadKey(k => k + 1), []);

  return { serverWrFilter, setServerWrFilter, serverStatsState, retry };
}
