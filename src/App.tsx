import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RefreshCw, 
  Sparkles, 
  TrendingUp,
  Layers,
  Trash2,
  Info,
  Code,
  Zap,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  BarChart3,
  History,
  Settings,
  Globe2,
  Activity,
  Gauge,
  Radar,
  TrendingUp as TrendIcon,
  LayoutGrid
} from 'lucide-react';
import { SignalData, TimeframeRec } from './types';
import { cn } from './utils/cn';
import { PairSelector } from './components/PairSelector';
import { ScannerView } from './components/ScannerView';
import { CircuitBreakerCard } from './components/CircuitBreakerCard';
import { HealthPill } from './components/HealthPill';
import { API_BASE } from './config';
import {
  deriveAiStatus, aiStatusBadge, isSupportedPair, ENTRY_SOURCE_LABEL,
  extractHistoryRecords, reconcileHistory,
} from './utils/signalMeta';
import { FilterChipRow } from './components/FilterChipRow';
import {
  ServerWrFilter, DEFAULT_SERVER_WR_FILTER, SERVER_WR_FILTER_KEY,
  parseServerWrFilter, sameFilter, windowCutoff, filterSubtitle, filterCacheKey,
  aggregateAllPairs, countWindowed, combineWindowed, TIME_RANGE_LABEL,
  PairScope, TimeRange, StatsPairRow, CoverageSummary,
} from './utils/serverWr';

// Premium UI components (#1-7)
import { FilterBadges } from './components/Premium';
import { HistoryDetailModal } from './components/HistoryDetailModal';
import { Ticker } from './components/Ticker';
import { DashboardView } from './components/DashboardView';

interface HistoryEntry {
  id: string;
  pair: string;
  direction: string;
  confidence: string;
  timeframe: string;
  entryPrice: number;
  timestamp: number;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  grade?: string;
  // detail fields for history view
  gradeLabel?: string;
  structureDirection?: string;
  structureStrength?: string;
  structureOverall?: string;
  expiryMinutes?: number;
  expiryTime?: number; // ms epoch when this trade expires
  exitPrice?: number; // resolved exit price (from backend)
  checkedAt?: string; // when result was resolved
  aiAgree?: boolean;
  autoChecked?: boolean; // true if result was set by auto win/loss check
  // ── B5 diagnostics (backend v6.9.2). All optional: entries written by an
  // older build stay valid, the row just renders without these badges. ──
  structureVerdict?: string;  // 'ALIGNED' | 'MIXED' | 'AGAINST' | 'NEUTRAL' | 'N/A'
  aiStatus?: string;          // 'BOTH_AGREE' | 'AIs_DISAGREE' | 'BOTH_UNAVAILABLE' | ...
  coreConfidence?: number;    // engine confidence before filters/AI adjustment
  entrySource?: string;       // 'FRESH_API' | 'CACHE_PARTIAL' | 'CACHE_ALL'
  reportable?: boolean; // false when no worker signal ID exists (local-only fallback)
  reportStatus?: 'syncing' | 'synced' | 'failed';
  reportError?: string;
}

type TradableSignalData = SignalData & {
  signal: NonNullable<SignalData['signal']>;
  session: NonNullable<SignalData['session']>;
};

interface ServerPairStats {
  pair: string;
  totalSignals?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
  sampleSize?: number;
  lastUpdated?: string;
  dynamicConfidenceAdjustment?: number;
}

/** Aggregate (All Pairs) or windowed (Today / 7d) result — not a single-pair payload. */
interface ServerAggregateStats {
  isAggregate: true;
  scope: PairScope;
  window: TimeRange;
  totalWins: number;
  totalLosses: number;
  totalSignals: number;          // decided count (wins + losses)
  winRate: number;               // 0..1
  pairCount?: number;
  recordsConsidered?: number;    // history rows inside the window
  coverage?: CoverageSummary;    // 50-row cap may hide older rows
  lastUpdated?: string;
}

function isAggregateStats(s: ServerPairStats | ServerAggregateStats | null): s is ServerAggregateStats {
  return !!s && (s as ServerAggregateStats).isAggregate === true;
}

interface ServerStatsState {
  pair: string;
  filter: ServerWrFilter;
  loading: boolean;
  stats: ServerPairStats | ServerAggregateStats | null;
  message?: string;
  /** set when the All Pairs view failed and we fell back to the selected pair */
  fallbackNote?: string;
  /** true when the user can retry (e.g. most parallel fetches failed) */
  retryable?: boolean;
}

type Tab = 'home' | 'analysis' | 'history' | 'settings' | 'scanner' | 'board';

const DEFAULT_FAVORITES = ['EUR/USD', 'GBP/USD', 'BTC/USD'];

/** Spec §3.4: memoise a computed Server-WR view for this long. */
const SERVER_WR_CACHE_TTL_MS = 5 * 60 * 1000;

export default function App() {
  const [selectedPair, setSelectedPair] = useState(() => {
    try { return localStorage.getItem('ftt_selected_pair') || 'EUR/USD'; } catch { return 'EUR/USD'; }
  });
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ftt_favorites');
      // XAU/USD dropped — backend rejects gold ("Invalid pair"). BTC/USD instead.
      const parsed: string[] = saved ? JSON.parse(saved) : DEFAULT_FAVORITES;
      // Strip unsupported symbols that may still be sitting in localStorage
      // from a previous install, otherwise the old favourite keeps 404-ing.
      const cleaned = Array.isArray(parsed) ? parsed.filter(isSupportedPair) : DEFAULT_FAVORITES;
      return cleaned.length > 0 ? cleaned : DEFAULT_FAVORITES;
    } catch { return DEFAULT_FAVORITES; }
  });

  const toggleFavorite = (pair: string) => {
    setFavorites(prev => {
      const next = prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair];
      try { localStorage.setItem('ftt_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ftt_history');
      const parsed: HistoryEntry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(entry => ({
        ...entry,
        reportable: entry.reportable ?? (typeof entry.id === 'string' && entry.id.startsWith('sig_')),
      }));
    } catch { return []; }
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedIndicatorTF, setSelectedIndicatorTF] = useState('5min');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  const [serverStatsState, setServerStatsState] = useState<ServerStatsState | null>(null);
  const [serverWrFilter, setServerWrFilter] = useState<ServerWrFilter>(() => {
    try {
      const saved = localStorage.getItem(SERVER_WR_FILTER_KEY);
      return saved ? parseServerWrFilter(saved) : { ...DEFAULT_SERVER_WR_FILTER };
    } catch { return { ...DEFAULT_SERVER_WR_FILTER }; }
  });
  // Manual retry: bumping this re-runs the server-stats effect.
  const [serverWrReloadKey, setServerWrReloadKey] = useState(0);
  // History detail modal (Premium #2)
  const [detailEntry, setDetailEntry] = useState<HistoryEntry | null>(null);
  // Spec §3.4 throttle: memoise each computed view for 5 min so re-entering the
  // History tab does not repeat the ~13-request fan-out. Keyed by
  // (scope, pair, window); a manual retry bypasses it.
  const serverWrCacheRef = useRef<Map<string, { at: number; state: ServerStatsState }>>(new Map());
  const lastServerWrReloadRef = useRef(0);

  const historyRef = useRef<HistoryEntry[]>(history);
  historyRef.current = history;

  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchInFlightRef = useRef(false);
  // Monotonic id: only the newest request is allowed to write state. Guards
  // against a slow earlier response landing after a newer one (last-write-wins
  // would otherwise show stale data).
  const fetchSeqRef = useRef(0);

  const fetchSignal = useCallback(async (silent = false) => {
    // BUG #1 fix: previously this early-returned whenever a fetch was in
    // flight, so tapping Retry during a slow request did *nothing* — no
    // spinner, no error, no request. The user read that as "button dead".
    // Now the in-flight request is aborted and superseded by this one.
    if (fetchInFlightRef.current && fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    fetchInFlightRef.current = true;

    const mySeq = ++fetchSeqRef.current;
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    // BUG #2 fix: 15s was too tight. Backend worst case = candles (~2-4s) +
    // Cerebras + Groq (~3-5s) + engine (~1s), plus Cloudflare cold start and a
    // slow mobile network. 25s covers the p90 without hanging the UI forever.
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    if (!silent) setLoading(true);
    setError(null);
    const requestedPair = selectedPair;
    try {
      const cleanPair = requestedPair.replace('/', '').toLowerCase();
      const response = await fetch(`${API_BASE}/api/signal?pair=${cleanPair}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Network error');
      const data: SignalData = await response.json();

      const isMarketClosedResponse = data?.marketStatus === 'CLOSED' && data.signal === null;
      if (!data?.marketStatus || (!data.signal && !isMarketClosedResponse)) {
        throw new Error('Invalid response');
      }

      // BUG #3: the user switched pairs (or a newer fetch started) while this
      // request was in flight — dropping is semantically right, but log it so
      // the "stuck loading" reports are diagnosable from the console.
      if (requestedPair !== selectedPair || mySeq !== fetchSeqRef.current) {
        console.warn('fetchSignal: superseded, dropping result', {
          requestedPair, currentPair: selectedPair, mySeq, latestSeq: fetchSeqRef.current,
        });
        return;
      }

      setSignalData(data);
      setLastUpdated(new Date());
      setRefreshCountdown(60);

      if (data.signal && ['BUY', 'SELL'].includes(data.signal.finalSignal)) {
        const workerSignalId = data.id || data.signalId;
        const bestTF = data.signal.bestTimeframe?.timeframe || '5min';
        const localDedupeKey = `local-${data.pair}-${data.signal.finalSignal}-${bestTF}-${Math.floor(Date.now()/60000)}`;
        const historyId = workerSignalId || localDedupeKey;
        const rec = data.signal.recommendations?.[bestTF as '5min'];
        const expiryMinutes = rec?.expiry?.totalMinutes;

        if (!workerSignalId) {
          console.warn('Signal response missing worker id; saving local-only history entry.', {
            pair: data.pair,
            direction: data.signal.finalSignal,
            timeframe: bestTF,
          });
        }

        const newEntry: HistoryEntry = {
          id: historyId,
          pair: data.pair,
          direction: data.signal.finalSignal,
          confidence: data.signal.confidence,
          timeframe: bestTF,
          entryPrice: rec?.entry?.price || 0,
          timestamp: Date.now(),
          result: 'PENDING',
          grade: data.signal.grade?.grade,
          gradeLabel: data.signal.grade?.label,
          structureDirection: data.signal.structureVerdict?.direction,
          structureStrength: data.signal.structureVerdict?.strength,
          structureOverall: data.signal.structureVerdict?.overall,
          expiryMinutes,
          expiryTime: expiryMinutes ? Date.now() + expiryMinutes * 60000 : undefined,
          aiAgree: data.signal.aiValidation?.agrees,
          // B5 fields — structureVerdict/coreConfidence come off the signal,
          // entrySource is a top-level response field (verified live).
          structureVerdict: data.signal.structureVerdict?.overall,
          aiStatus: deriveAiStatus(data),
          coreConfidence: data.signal.coreConfidence,
          entrySource: data.entrySource,
          reportable: Boolean(workerSignalId),
        };
        setHistory(prev => {
          if (prev.find(h => h.id === historyId)) return prev;
          return [newEntry, ...prev].slice(0, 100);
        });
      }
    } catch (e: any) {
      // A superseded request always aborts; that is not a user-visible error.
      // Only surface a failure if this is still the request the user waits on.
      if (mySeq !== fetchSeqRef.current) return;
      if (e?.name === 'AbortError') {
        setError('Request timed out. Tap retry.');
      } else {
        setError('Unable to fetch signal. Tap retry.');
      }
    } finally {
      clearTimeout(timeoutId);
      // Only the newest request clears the shared in-flight/loading state —
      // an aborted older one must not unlock the spinner for a live request.
      if (mySeq === fetchSeqRef.current) {
        fetchInFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [selectedPair]);

  useEffect(() => {
    try { localStorage.setItem('ftt_history', JSON.stringify(history)); } catch {}
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem(SERVER_WR_FILTER_KEY, JSON.stringify(serverWrFilter)); } catch {}
  }, [serverWrFilter]);

  // BUG #6 fix: clear the previous pair's signal before fetching the new one.
  // Without this the old pair's card stayed on screen for the whole 5-8s fetch,
  // so the user briefly read BTC numbers under an EUR/USD heading.
  useEffect(() => {
    setSignalData(null);
    setError(null);
    fetchSignal();
    try { localStorage.setItem('ftt_selected_pair', selectedPair); } catch {}
  }, [selectedPair]);

  // Auto-refresh: timestamp-based (not tick-counter-based) so it's resilient
  // to the tab/screen being backgrounded for a long time. When the page
  // becomes visible again, we immediately check if a refresh is overdue.
  const nextRefreshAtRef = useRef<number>(Date.now() + 60000);

  useEffect(() => {
    if (!autoRefresh) return;

    nextRefreshAtRef.current = Date.now() + 60000;

    const tick = () => {
      const now = Date.now();
      const remaining = nextRefreshAtRef.current - now;
      if (remaining <= 0) {
        nextRefreshAtRef.current = now + 60000;
        setRefreshCountdown(60);
        fetchSignal(true);
      } else {
        setRefreshCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      }
    };

    const interval = setInterval(tick, 1000);

    // When the app comes back from background/sleep, immediately re-check
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoRefresh, fetchSignal]);

  const reportSignalResult = useCallback(async (id: string, result: 'WIN' | 'LOSS') => {
    const response = await fetch(`${API_BASE}/api/report?id=${encodeURIComponent(id)}&result=${result}`);
    if (!response.ok) {
      let body = '';
      try { body = await response.text(); } catch {}
      throw new Error(`Report failed (${response.status})${body ? `: ${body}` : ''}`);
    }
    return response.json().catch(() => null);
  }, []);

  const handleReport = async (id: string, result: 'WIN' | 'LOSS') => {
    const entry = historyRef.current.find(h => h.id === id);
    if (!entry) return;

    if (entry.reportable === false) {
      console.warn('Skipping report for local-only signal without worker id.', { id, result, pair: entry.pair });
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        reportStatus: 'failed',
        reportError: 'Server report unavailable: this history item has no worker signal ID.',
      } : h));
      return;
    }

    setHistory(prev => prev.map(h => h.id === id ? {
      ...h,
      result,
      reportStatus: 'syncing',
      reportError: undefined,
    } : h));

    try {
      await reportSignalResult(id, result);
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        reportStatus: 'synced',
        reportError: undefined,
      } : h));
    } catch (e) {
      console.warn('Failed to report signal result to worker.', { id, result, error: e });
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        reportStatus: 'failed',
        reportError: 'Server sync failed. Result saved locally only.',
      } : h));
    }
  };

  // BUG #4 fix — the client-side auto WIN/LOSS checker is gone.
  //
  // It called `/api/signal?pair=...` purely to read a current price, which made
  // the worker run a full signal generation (candles + Cerebras + Groq + engine)
  // and burn TwelveData quota for every check. It also processed only `due[0]`
  // per 30s tick, so five expired signals took 150s to resolve.
  //
  // Backend v6.9.2 now resolves results authoritatively: cron `*/2 * * * *`
  // plus the B0-3 retry ladder (15 attempts before giving up as UNKNOWN).
  // The app is a display layer now — it reconciles against `/api/history`
  // while the History tab is open, and the manual WIN/LOSS buttons still work.
  useEffect(() => {
    if (activeTab !== 'history') return;

    let cancelled = false;
    const controllers = new Set<AbortController>();

    const pollHistory = async () => {
      const pending = historyRef.current.filter(h => !h.result || h.result === 'PENDING');
      if (pending.length === 0) return;

      // Only poll pairs that actually have something unresolved.
      const pairs = Array.from(new Set(pending.map(h => h.pair)));

      for (const pair of pairs) {
        if (cancelled) return;
        const controller = new AbortController();
        controllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const cleanPair = pair.replace(/\//g, '').toLowerCase();
          const res = await fetch(
            `${API_BASE}/api/history?pair=${encodeURIComponent(cleanPair)}&limit=500`,
            { signal: controller.signal },
          );
          if (!res.ok) continue;

          // /api/history returns an OBJECT ({ pair, total, signals: [...] }),
          // NOT a bare array — extractHistoryRecords handles both defensively.
          const records = extractHistoryRecords(await res.json());
          if (records.length === 0 || cancelled) continue;

          // reconcileHistory returns the same reference when nothing changed,
          // so this is a no-op render in the common "still pending" case.
          setHistory(prev => reconcileHistory(prev, records));
        } catch {
          // silent — next cycle retries
        } finally {
          clearTimeout(timeoutId);
          controllers.delete(controller);
        }
      }
    };

    pollHistory();
    const interval = setInterval(pollHistory, 45000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const c of controllers) c.abort();
    };
  }, [activeTab]);

  // ── Server Win Rate, filtered (Phase 6) ────────────────────────────────
  // Four routes, chosen by (pairScope, timeRange):
  //   selected + all   -> /api/stats?pair=X          (unchanged Phase 2 path)
  //   all      + all   -> /api/stats                 (aggregate wins/losses)
  //   selected + win   -> /api/history?pair=X        (count inside the window)
  //   all      + win   -> /api/stats then /api/history per pair, in parallel
  //
  // Windowed routes derive from history, which the worker caps at 50 rows per
  // pair with no pagination — so those counts can be a lower bound. Coverage is
  // tracked and surfaced rather than silently rounded off.
  useEffect(() => {
    if (activeTab !== 'history') return;

    let cancelled = false;
    const controller = new AbortController();
    // Windowed All-Pairs fans out to ~13 requests; give it more room than the
    // single-request paths but still bail rather than hang the tab.
    const budgetMs = serverWrFilter.pairScope === 'all' && serverWrFilter.timeRange !== 'all' ? 20000 : 10000;
    const timeoutId = setTimeout(() => controller.abort(), budgetMs);

    const cacheKey = filterCacheKey(serverWrFilter, selectedPair);
    const cached = serverWrCacheRef.current.get(cacheKey);
    const cacheFresh = cached && Date.now() - cached.at < SERVER_WR_CACHE_TTL_MS;
    if (cacheFresh && serverWrReloadKey === lastServerWrReloadRef.current) {
      setServerStatsState(cached.state);
      clearTimeout(timeoutId);
      return () => { cancelled = true; controller.abort(); clearTimeout(timeoutId); };
    }
    lastServerWrReloadRef.current = serverWrReloadKey;

    setServerStatsState(prev => ({
      pair: selectedPair,
      filter: serverWrFilter,
      loading: true,
      // keep the previous numbers visible while refetching the SAME view;
      // clear them when the view changed, so stale figures never sit under a
      // heading that now says something else
      stats: prev && sameFilter(prev.filter, serverWrFilter) && prev.pair === selectedPair ? prev.stats : null,
      message: undefined,
    }));

    // Cache only successful computations — errors must stay retryable.
    const publish = (next: ServerStatsState) => {
      if (next.stats) serverWrCacheRef.current.set(cacheKey, { at: Date.now(), state: next });
      setServerStatsState(next);
    };

    const getJson = async (url: string) => {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    };

    const cleanPair = (pair: string) => pair.replace(/\//g, '').toLowerCase();

    const fetchPairList = async (): Promise<StatsPairRow[]> => {
      const payload = await getJson(`${API_BASE}/api/stats`);
      const pairs = Array.isArray(payload?.pairs) ? (payload.pairs as StatsPairRow[]) : [];
      return pairs.filter(p => p && typeof p.pair === 'string' && isSupportedPair(p.pair));
    };

    const compute = async () => {
      const { pairScope, timeRange } = serverWrFilter;
      const cutoff = windowCutoff(timeRange);

      // ── selected + all time: the original endpoint ──
      if (pairScope === 'selected' && timeRange === 'all') {
        const payload = await getJson(`${API_BASE}/api/stats?pair=${encodeURIComponent(cleanPair(selectedPair))}`);
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

      // ── all pairs + all time: aggregate the stats index ──
      if (pairScope === 'all' && timeRange === 'all') {
        const pairs = await fetchPairList();
        if (cancelled) return;
        const agg = aggregateAllPairs(pairs);
        publish({
          pair: selectedPair,
          filter: serverWrFilter,
          loading: false,
          stats: {
            isAggregate: true, scope: 'all', window: 'all',
            totalWins: agg.totalWins, totalLosses: agg.totalLosses,
            totalSignals: agg.totalSignals, winRate: agg.winRate,
            pairCount: agg.pairCount,
            lastUpdated: agg.lastUpdated,
            // /api/stats counters are lifetime and authoritative — no cap issue
            coverage: { complete: true, truncatedPairs: [] },
          },
          message: agg.totalSignals === 0 ? 'No decided signals yet.' : undefined,
        });
        return;
      }

      // ── selected pair + window: one history call ──
      if (pairScope === 'selected') {
        const payload = await getJson(
          `${API_BASE}/api/history?pair=${encodeURIComponent(cleanPair(selectedPair))}&limit=500`);
        if (cancelled) return;
        const count = countWindowed(payload, cutoff);
        publish({
          pair: selectedPair,
          filter: serverWrFilter,
          loading: false,
          stats: {
            isAggregate: true, scope: 'selected', window: timeRange,
            totalWins: count.wins, totalLosses: count.losses,
            totalSignals: count.decided,
            winRate: count.decided > 0 ? count.wins / count.decided : 0,
            recordsConsidered: count.recordsConsidered,
            coverage: { complete: count.complete, truncatedPairs: count.complete ? [] : [selectedPair] },
          },
          message: count.decided === 0
            ? `No decided signals for ${selectedPair} in this window.` : undefined,
        });
        return;
      }

      // ── all pairs + window: fan out ──
      const pairs = await fetchPairList();
      if (cancelled) return;
      if (pairs.length === 0) throw new Error('no pairs');

      const settled = await Promise.all(pairs.map(async p => {
        try {
          const payload = await getJson(
            `${API_BASE}/api/history?pair=${encodeURIComponent(cleanPair(p.pair))}&limit=500`);
          return { pair: p.pair, count: countWindowed(payload, cutoff) };
        } catch {
          return { pair: p.pair, count: null };
        }
      }));
      if (cancelled) return;

      const failed = settled.filter(r => r.count === null).length;
      // Spec: if half or more of the fan-out fails the number is not worth
      // showing — offer a retry instead of a confidently wrong figure.
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
        pair: selectedPair,
        filter: serverWrFilter,
        loading: false,
        stats: {
          isAggregate: true, scope: 'all', window: timeRange,
          totalWins: combined.totalWins, totalLosses: combined.totalLosses,
          totalSignals: combined.totalSignals, winRate: combined.winRate,
          pairCount: combined.pairCount,
          recordsConsidered: combined.recordsConsidered,
          coverage: combined.coverage,
        },
        message: combined.totalSignals === 0
          ? `No decided signals across any pair in this window.` : undefined,
        retryable: failed > 0 ? true : undefined,
      });
    };

    compute().catch(async (e) => {
      if (cancelled || e?.name === 'AbortError') return;
      console.warn('Server win-rate fetch failed.', { filter: serverWrFilter, pair: selectedPair, error: e });

      // Spec §4.6: if the All Pairs view is unavailable, degrade to the
      // selected pair rather than showing an empty card.
      if (serverWrFilter.pairScope === 'all') {
        try {
          const payload = await getJson(
            `${API_BASE}/api/stats?pair=${encodeURIComponent(cleanPair(selectedPair))}`);
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
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [activeTab, selectedPair, serverWrFilter, serverWrReloadKey]);

  const pendingCount = history.filter(h => !h.result || h.result === 'PENDING').length;
  const wins = history.filter(h => h.result === 'WIN').length;
  const losses = history.filter(h => h.result === 'LOSS').length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

  const handleScannerSignalClick = (pair: string) => {
    setSelectedPair(pair);
    setActiveTab('home');
    fetchSignal();
  };

  const handleMarketClosedSwitch = (pair: string) => {
    setError(null);
    setActiveTab('home');
    if (pair !== selectedPair) {
      setSignalData(null);
      setSelectedPair(pair);
    } else {
      fetchSignal();
    }
  };

  const marketClosedData = signalData && (signalData.marketStatus === 'CLOSED' || signalData.signal === null)
    ? signalData
    : null;

  // BUG #7: backend v6.9.2 forces NO_TRADE while a pair is in cooldown. Show a
  // dedicated card instead of an unexplained "NO_TRADE".
  const circuitBreakerData = signalData?.circuitBreaker?.tripped && !marketClosedData
    ? {
        pair: signalData.pair,
        cooldownUntil: signalData.circuitBreaker.cooldownUntil,
        lossStreak: signalData.circuitBreaker.lossStreak,
        wouldBeSignal: signalData.circuitBreaker.wouldBeSignal,
      }
    : null;

  const tradableSignalData = signalData?.signal && signalData.session && !circuitBreakerData
    ? (signalData as TradableSignalData)
    : null;

  return (
    <div className="min-h-screen bg-[#08080a] text-[#e3e2e6] gradient-mesh">
      {/* ── Premium App Bar ── */}
      <header className="sticky top-0 z-40" style={{ background: 'rgba(8,8,10,0.7)', backdropFilter: 'blur(24px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="px-4 py-2.5 safe-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4dd0e1, #26a69a)', boxShadow: '0 4px 16px rgba(77,208,225,0.25)' }}>
                  <Sparkles className="w-5 h-5 text-[#00363a]" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#00e676] border-2 border-[#08080a]" style={{ boxShadow: '0 0 6px #00e676' }} />
              </div>
              <div>
                <h1 className="font-bold text-[17px] leading-tight tracking-tight">Signal<span style={{ color: '#4dd0e1' }}>Pro</span></h1>
                <p className="text-[9px] text-[#6e6e73] uppercase tracking-[0.15em] font-medium">AI Trading Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoRefresh && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(0,230,118,0.06)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00e676]" style={{ boxShadow: '0 0 4px #00e676', animation: 'pulse 2s infinite' }} />
                  <span className="text-[10px] text-[#81c784] font-bold number-tabular">{refreshCountdown}s</span>
                </div>
              )}
              <button
                onClick={() => fetchSignal()}
                disabled={loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <RefreshCw className={cn("w-[18px] h-[18px] text-[#b0b3b8]", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4 pb-24">
        {/* UI v3: market pulse ticker (home only, full-bleed) */}
        {activeTab === 'home' && (
          <div className="-mx-4 -mt-4 mb-3">
            <Ticker />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-center gap-3 p-4 bg-[#93000a]/20 border border-[#93000a]/30 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-[#ffb4ab] flex-shrink-0" />
            <p className="text-sm text-[#ffb4ab] flex-1">{error}</p>
            <button onClick={() => fetchSignal()} className="text-xs font-medium text-[#ffb4ab] px-3 py-1.5 bg-[#93000a]/30 rounded-full">
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && !signalData && (
          <div className="space-y-3">
            <div className="h-64 bg-[#1e1e23] rounded-2xl shimmer" />
            <div className="h-32 bg-[#1e1e23] rounded-2xl shimmer" />
          </div>
        )}

        {/* HOME TAB */}
        {activeTab === 'home' && marketClosedData && (
          <MarketClosedCard data={marketClosedData} onSwitchPair={handleMarketClosedSwitch} />
        )}

        {activeTab === 'home' && circuitBreakerData && (
          <CircuitBreakerCard
            pair={circuitBreakerData.pair}
            cooldownUntil={circuitBreakerData.cooldownUntil}
            lossStreak={circuitBreakerData.lossStreak}
            wouldBeSignal={circuitBreakerData.wouldBeSignal}
            onSwitchPair={handleMarketClosedSwitch}
          />
        )}

        {activeTab === 'home' && tradableSignalData && (
          <div className="space-y-3 fade-in">
            <MaterialSignalCard data={tradableSignalData} onPairClick={() => setPickerOpen(true)} />
            
            {/* AI Insights */}
            {tradableSignalData.signal.aiValidation?.combined && (
              <div className="premium-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#3a0069]/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#b39ddb]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">AI Analysis</div>
                      <div className="text-xs text-[#b0b3b8]">{tradableSignalData.signal.aiValidation.combined.model || 'Multi-model'}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium",
                    tradableSignalData.signal.aiValidation.agrees 
                      ? "bg-[#81c784]/20 text-[#81c784]" 
                      : "bg-[#ffb74d]/20 text-[#ffb74d]"
                  )}>
                    {tradableSignalData.signal.aiValidation.combined.agreement === 'BOTH_AGREE' ? '✓ Both Agree' : tradableSignalData.signal.aiValidation.agrees ? '✓ Agree' : '⚠ Divergent'}
                  </div>
                </div>
                {/* Individual model status */}
                <div className="flex gap-2 mb-3">
                  {(['cerebras','groq'] as const).map(model => {
                    const m = tradableSignalData.signal.aiValidation![model];
                    if (!m) return null;
                    const ok = m.status === 'OK';
                    return (
                      <div key={model} className={cn("flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium", ok ? "bg-[#81c784]/10 text-[#81c784]" : "bg-[#ef5350]/10 text-[#ef5350]")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-[#81c784]" : "bg-[#ef5350]")} />
                        {model.charAt(0).toUpperCase() + model.slice(1)} {ok ? `${m.confidence}%` : m.status}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-[#27272d] rounded-xl p-3">
                    <div className="text-xs text-[#b0b3b8] mb-1">AI Signal</div>
                    <div className={cn(
                      "text-lg font-medium",
                      tradableSignalData.signal.aiValidation.combined.signal === 'BUY' && "text-[#81c784]",
                      tradableSignalData.signal.aiValidation.combined.signal === 'SELL' && "text-[#ef5350]"
                    )}>{tradableSignalData.signal.aiValidation.combined.signal}</div>
                  </div>
                  <div className="bg-[#27272d] rounded-xl p-3">
                    <div className="text-xs text-[#b0b3b8] mb-1">Confidence</div>
                    <div className="text-lg font-medium number-tabular">{tradableSignalData.signal.aiValidation.combined.confidence}%</div>
                  </div>
                </div>
                <p className="text-sm text-[#c4c6d0] leading-relaxed">{tradableSignalData.signal.aiValidation.combined.reason}</p>
                {tradableSignalData.signal.aiValidation.combined.concerns && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-[#ffb74d]/10 rounded-xl border border-[#ffb74d]/20">
                    <span className="text-[#ffb74d] text-xs mt-0.5">⚠</span>
                    <p className="text-xs text-[#ffb74d]/90 leading-relaxed">{tradableSignalData.signal.aiValidation.combined.concerns}</p>
                  </div>
                )}
              </div>
            )}

            {/* Structure Verdict */}
            {tradableSignalData.signal.structureVerdict && tradableSignalData.signal.structureVerdict.overall !== 'N/A' && (
              <div className="premium-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0288d1]/20 flex items-center justify-center">
                      <Layers className="w-4 h-4 text-[#42a5f5]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Market Structure</div>
                      <div className="text-xs text-[#b0b3b8]">BOS / CHoCH / Bias</div>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold",
                    tradableSignalData.signal.structureVerdict.overall === 'ALIGNED' && "bg-[#81c784]/20 text-[#81c784]",
                    tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && "bg-[#ef5350]/20 text-[#ef5350]",
                    tradableSignalData.signal.structureVerdict.overall === 'MIXED' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                    tradableSignalData.signal.structureVerdict.overall === 'NEUTRAL' && "bg-[#bdbdbd]/20 text-[#bdbdbd]",
                  )}>
                    {tradableSignalData.signal.structureVerdict.overall === 'ALIGNED' && '✓ ALIGNED'}
                    {tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && '✗ AGAINST'}
                    {tradableSignalData.signal.structureVerdict.overall === 'MIXED' && '~ MIXED'}
                    {tradableSignalData.signal.structureVerdict.overall === 'NEUTRAL' && '— NEUTRAL'}
                  </div>
                </div>
                {/* Structure's own direction call */}
                <div className="flex items-center justify-between mb-3 bg-[#27272d] rounded-xl p-3">
                  <div className="text-xs text-[#b0b3b8]">Structure says</div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold",
                      tradableSignalData.signal.structureVerdict.direction === 'BUY' && "text-[#81c784]",
                      tradableSignalData.signal.structureVerdict.direction === 'SELL' && "text-[#ef5350]",
                      (tradableSignalData.signal.structureVerdict.direction === 'NEUTRAL' || tradableSignalData.signal.structureVerdict.direction === 'MIXED') && "text-[#bdbdbd]",
                    )}>
                      {tradableSignalData.signal.structureVerdict.direction}
                    </span>
                    {tradableSignalData.signal.structureVerdict.strength !== 'NEUTRAL' && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        tradableSignalData.signal.structureVerdict.strength === 'STRONG' ? "bg-[#42a5f5]/20 text-[#42a5f5]" : "bg-[#bdbdbd]/15 text-[#bdbdbd]"
                      )}>
                        {tradableSignalData.signal.structureVerdict.strength}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {Object.entries(tradableSignalData.signal.structureVerdict.perTimeframe).map(([tf, v]) => (
                    <div key={tf} className={cn(
                      "flex-1 text-center py-2 rounded-xl text-xs font-medium",
                      v.verdict === 'AGREE' && "bg-[#81c784]/10 text-[#81c784]",
                      v.verdict === 'DISAGREE' && "bg-[#ef5350]/10 text-[#ef5350]",
                      v.verdict === 'NEUTRAL' && "bg-[#27272d] text-[#b0b3b8]",
                    )}>
                      <div className="font-bold">{tf.toUpperCase()}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{v.bias?.replace('_', ' ')}</div>
                      <div className="text-[9px] mt-0.5">{v.verdict}</div>
                    </div>
                  ))}
                </div>
                {tradableSignalData.signal.structureVerdict.overall === 'AGAINST' && (
                  <p className="mt-3 text-xs text-[#ef5350]/80 bg-[#ef5350]/10 rounded-lg p-2.5">
                    ⚠ Structure is against the signal — consider skipping or wait for structure to align.
                  </p>
                )}
                {tradableSignalData.signal.structureVerdict.overall === 'MIXED' && (
                  <p className="mt-3 text-xs text-[#ffb74d]/80 bg-[#ffb74d]/10 rounded-lg p-2.5">
                    ~ Mixed structure — trade with caution, check the best timeframe.
                  </p>
                )}
              </div>
            )}

            {/* Sessions */}
            <div className="premium-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe2 className="w-4 h-4 text-[#42a5f5]" />
                <span className="text-sm font-medium">Market Sessions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {tradableSignalData.session.sessions.map(s => (
                  <div key={s} className="px-3 py-1.5 bg-[#27272d] rounded-lg text-sm font-medium">
                    {s}
                  </div>
                ))}
                <div className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium",
                  tradableSignalData.session.quality === 'HIGH' && "bg-[#81c784]/20 text-[#81c784]",
                  tradableSignalData.session.quality === 'MEDIUM' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                  tradableSignalData.session.quality === 'LOW' && "bg-[#ef5350]/20 text-[#ef5350]"
                )}>
                  {tradableSignalData.session.quality} Quality
                </div>
              </div>
            </div>

            {/* Entry Reason */}
            <div className="premium-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-[#ffb74d]" />
                <span className="text-sm font-medium">Entry Reasoning</span>
              </div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">{tradableSignalData.signal.entryReason}</p>
            </div>

            {/* Market Regime */}
            <div className="premium-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendIcon className="w-4 h-4 text-[#42a5f5]" />
                  <span className="text-sm font-medium">Market Regime</span>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  tradableSignalData.signal.marketRegime === 'TRENDING' && "bg-[#81c784]/20 text-[#81c784]",
                  tradableSignalData.signal.marketRegime === 'RANGING' && "bg-[#ffb74d]/20 text-[#ffb74d]"
                )}>{tradableSignalData.signal.marketRegime}</span>
              </div>
              <p className="text-sm text-[#b0b3b8]">{tradableSignalData.signal.regimeAdvice}</p>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && tradableSignalData && (
          <div className="space-y-3 fade-in">
            <div className="premium-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-[#42a5f5]" />
                <span className="text-sm font-medium">Multi-Timeframe Analysis</span>
              </div>
              <p className="text-xs text-[#b0b3b8]">Signal strength across all timeframes</p>
            </div>

            {Object.entries(tradableSignalData.signal.recommendations).map(([tf, rec]) => (
              <TimeframeCard key={tf} tf={tf} rec={rec} />
            ))}

            <div className="mt-4 mb-2">
              <h3 className="text-xs uppercase tracking-wider text-[#8e9099] font-medium px-1">Technical Indicators</h3>
            </div>
            <IndicatorGrid 
              recommendations={tradableSignalData.signal.recommendations}
              timeframeAnalysis={tradableSignalData.signal.timeframeAnalysis}
              selectedTF={selectedIndicatorTF}
              onSelectTF={setSelectedIndicatorTF}
            />
          </div>
        )}

        {/* SCANNER TAB */}
        {activeTab === 'scanner' && (
          <ScannerView onSignalClick={handleScannerSignalClick} />
        )}

        {/* BOARD TAB (UI v3 premium dashboard) */}
        {activeTab === 'board' && (
          <DashboardView onPairSelect={(pair) => { setSelectedPair(pair); setActiveTab('home'); }} />
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-[26px] font-bold mb-0.5 tracking-tight">Signal History</h2>
              <p className="text-[11px] text-[#6e6e73] uppercase tracking-[0.15em] font-medium">Track your trading performance</p>
            </div>
            
            {/* Stats */}
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs uppercase tracking-wider text-[#8e9099] font-medium">Your Local History</h3>
              <span className="text-[10px] text-[#6e6e73]">This device only</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <StatCard label="Total" value={history.length} color="#42a5f5" />
              <StatCard label="Wins" value={wins} color="#81c784" />
              <StatCard label="Losses" value={losses} color="#ef5350" />
              <StatCard label="Win %" value={`${winRate}%`} color="#ffb74d" />
            </div>

            <div className="space-y-2 mb-3">
              <FilterChipRow
                label="Pair:"
                chips={[
                  { id: 'all', label: 'All Pairs' },
                  { id: 'selected', label: selectedPair },
                ]}
                selectedId={serverWrFilter.pairScope}
                onSelect={(id) => setServerWrFilter(prev => ({ ...prev, pairScope: id as PairScope }))}
              />
              <FilterChipRow
                label="Time:"
                chips={[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: '7d', label: 'Last 7 Days' },
                ]}
                selectedId={serverWrFilter.timeRange}
                onSelect={(id) => setServerWrFilter(prev => ({ ...prev, timeRange: id as TimeRange }))}
              />
            </div>

            <ServerStatsCard
              state={serverStatsState}
              selectedPair={selectedPair}
              onRetry={() => setServerWrReloadKey(k => k + 1)}
            />

            {/* List */}
            <div className="overflow-hidden" style={{ borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              {history.length === 0 ? (
                <div className="p-10 text-center">
                  <Clock className="w-12 h-12 text-[#3a3a3e] mx-auto mb-3" />
                  <p className="text-[#b0b3b8] font-medium mb-1">No history yet</p>
                  <p className="text-[#6e6e73] text-sm">Generated signals will appear here</p>
                </div>
              ) : (
                history.slice(0, 30).map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} onReport={handleReport} onDelete={(id) => setHistory(prev => prev.filter(h => h.id !== id))} onDetail={(e) => setDetailEntry(e)} />
                ))
              )}
            </div>

            {history.length > 0 && (
              <button
                onClick={() => { if (confirm('Clear all local history? This only removes entries from your device — server-side results are unaffected.')) setHistory([]); }}
                className="w-full mt-4 py-3 text-[#ff5252] font-medium text-sm active:scale-95 transition-transform"
              >
                Clear History
              </button>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-[26px] font-bold mb-0.5 tracking-tight">Settings</h2>
              <p className="text-[11px] text-[#6e6e73] uppercase tracking-[0.15em] font-medium">Customize your experience</p>
            </div>

            <HealthPill />

            <div className="overflow-hidden mb-3" style={{ borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <SettingRow
                icon={autoRefresh ? RefreshCw : Zap}
                iconColor="#42a5f5"
                label="Auto Refresh"
                description="Update signals every 60s"
                toggle
                toggleValue={autoRefresh}
                onToggle={() => setAutoRefresh(!autoRefresh)}
              />
            </div>

            <div className="overflow-hidden mb-3" style={{ borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <SettingRow
                icon={Trash2}
                iconColor="#ef5350"
                label="Clear History"
                description={`${history.length} entries`}
                onClick={() => setHistory([])}
                isLast
              />
            </div>

            <div className="overflow-hidden" style={{ borderRadius: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <SettingRow icon={Info} iconColor="#42a5f5" label="Version" value="2.0.0" />
              <SettingRow icon={Code} iconColor="#b39ddb" label="API Method" value={signalData?.signal?.method?.split('_').slice(0, 2).join(' ') || 'v6.9.2'} isLast />
            </div>

            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-xs text-[#6e6e73]">
                <Code className="w-4 h-4" />
                <span>SignalPro · AI Trading Intelligence</span>
              </div>
              {lastUpdated && <p className="text-[10px] text-[#4a4a4f] mt-2">Last sync: {lastUpdated.toLocaleTimeString()}</p>}
            </div>
          </div>
        )}
      </main>

      {/* ── Premium Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom" style={{ background: 'rgba(8,8,10,0.85)', backdropFilter: 'blur(24px) saturate(180%)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-around py-1.5">
          <NavButton icon={TrendingUp} label="Signal" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavButton icon={Radar} label="Scanner" active={activeTab === 'scanner'} onClick={() => setActiveTab('scanner')} />
          <NavButton icon={LayoutGrid} label="Board" active={activeTab === 'board'} onClick={() => setActiveTab('board')} />
          <NavButton icon={BarChart3} label="Analysis" active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} />
          <NavButton icon={History} label="History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} badge={pendingCount} />
          <NavButton icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </nav>

      {/* Pair Picker with search */}
      <PairSelector
        isOpen={pickerOpen}
        selectedPair={selectedPair}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onSelect={(p) => { setSelectedPair(p); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />

      {/* History Detail Modal (Premium #2) */}
      <HistoryDetailModal
        entry={detailEntry ? {
          pair: detailEntry.pair,
          direction: detailEntry.direction,
          result: detailEntry.result,
          confidence: detailEntry.confidence,
          grade: detailEntry.grade,
          entryPrice: detailEntry.entryPrice,
          exitPrice: detailEntry.exitPrice,
          timestamp: detailEntry.timestamp,
          expiryMinutes: detailEntry.expiryMinutes,
          timeframe: detailEntry.timeframe,
          structureVerdict: detailEntry.structureVerdict,
          aiStatus: detailEntry.aiStatus,
          coreConfidence: detailEntry.coreConfidence,
          entrySource: detailEntry.entrySource,
          autoChecked: detailEntry.autoChecked,
        } : null}
        onClose={() => setDetailEntry(null)}
      />
    </div>
  );
}

// Components
function getCryptoAlternativePair(data: SignalData): string {
  const fallback = 'BTC/USD';
  const alt = data.cryptoAlternative || '';
  const match = alt.match(/pair=([^\s&]+)/i) || alt.match(/([A-Z]{3,5}\/[A-Z]{3,5}|[A-Z]{6,10})/i);
  const raw = match?.[1];
  if (!raw) return fallback;

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}

  const cleaned = decoded.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (cleaned.includes('/')) return cleaned;
  if (cleaned.length === 6) return `${cleaned.slice(0, 3)}/${cleaned.slice(3)}`;
  return fallback;
}

function MarketClosedCard({ data, onSwitchPair }: { data: SignalData; onSwitchPair: (pair: string) => void }) {
  const cryptoPair = getCryptoAlternativePair(data);
  const nextOpen = data.nextOpen ? new Date(data.nextOpen) : null;
  const nextOpenLabel = data.nextOpenReadable || (nextOpen && !Number.isNaN(nextOpen.getTime()) ? nextOpen.toUTCString() : null);

  return (
    <div className="space-y-3 fade-in">
      <div className="premium-card p-0 overflow-hidden scale-in border border-[#4dd0e1]/10">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#4dd0e1] via-[#26a69a] to-[#42a5f5]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#4dd0e1]/15 flex items-center justify-center shadow-lg shadow-[#4dd0e1]/5">
                <Clock className="w-7 h-7 text-[#4dd0e1]" strokeWidth={2.4} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[#4dd0e1] font-bold mb-1">Market status</div>
                <h2 className="text-2xl font-medium leading-tight">Forex Market Closed</h2>
                <p className="text-sm text-[#b0b3b8] mt-1 leading-relaxed">
                  {data.message || 'Forex market is currently closed.'}
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-[#27272d] text-[#ffb74d] text-xs font-bold border border-[#ffb74d]/20">
              CLOSED
            </div>
          </div>

          <div className="grid gap-3 mb-4">
            <div className="bg-[#1e1e23] rounded-2xl p-4 border border-[#3a3a3e]/60">
              <div className="flex items-center gap-2 text-xs text-[#b0b3b8] mb-2">
                <Globe2 className="w-4 h-4 text-[#42a5f5]" />
                <span>Next forex open</span>
              </div>
              <div className="text-base font-medium text-[#e3e2e6] leading-snug">
                {nextOpenLabel || 'Next open time unavailable'}
              </div>
              {data.opensIn && (
                <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-[#4dd0e1]/10 text-[#4dd0e1] text-xs font-bold">
                  <div className="w-2 h-2 rounded-full bg-[#4dd0e1] animate-pulse" />
                  Opens in {data.opensIn}
                </div>
              )}
            </div>

            <div className="bg-[#27272d] rounded-2xl p-4 border border-[#3a3a3e]/50">
              <div className="text-xs uppercase tracking-wider text-[#8e9099] font-medium mb-2">What to do now</div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">
                {data.advice || 'Wait for forex to reopen, or switch to crypto markets which run 24/7.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onSwitchPair(cryptoPair)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#4dd0e1] to-[#26a69a] text-[#00363a] font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-[#4dd0e1]/10"
          >
            <Zap className="w-4 h-4" />
            Switch to {cryptoPair} (24/7)
          </button>
        </div>
      </div>
    </div>
  );
}

function formatServerWinRate(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

function ServerStatsCard({ state, selectedPair, onRetry }: {
  state: ServerStatsState | null;
  selectedPair: string;
  onRetry?: () => void;
}) {
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
  // Confidence adjustment is a lifetime per-pair number — meaningless once the
  // view is aggregated or windowed, so it is only shown on the original path.
  const showConfidenceAdj = !windowed && state.filter.pairScope === 'selected' && pairStats;
  const truncated = aggregate?.coverage && !aggregate.coverage.complete;

  return (
    <div className="md-surface p-4 mb-4 border border-[#42a5f5]/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#42a5f5]/15 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-[#42a5f5]" />
          </div>
          <div>
            <div className="text-sm font-medium">Server Win Rate</div>
            <div className="text-xs text-[#8e9099]">{subtitle}</div>
          </div>
        </div>
        {state.loading && <RefreshCw className="w-4 h-4 text-[#42a5f5] animate-spin" />}
      </div>

      {state.fallbackNote && (
        <div className="mb-3 rounded-xl bg-[#ffb74d]/10 border border-[#ffb74d]/20 px-3 py-2 text-[11px] text-[#ffb74d]">
          {state.fallbackNote}
        </div>
      )}

      {state.loading && !hasStats ? (
        <div className="rounded-xl bg-[#1e1e23] p-3 text-xs text-[#b0b3b8] flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {state.filter.pairScope === 'all' && windowed
            ? 'Computing across all pairs…'
            : 'Loading server stats…'}
        </div>
      ) : hasStats ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#1e1e23] rounded-xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">Server Win %</div>
              <div className="text-lg font-medium number-tabular text-[#4dd0e1]">{formatServerWinRate(winRate)}</div>
            </div>
            <div className="bg-[#1e1e23] rounded-xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">{windowed ? 'Decided' : 'Signals'}</div>
              <div className="text-lg font-medium number-tabular">{signals ?? '—'}</div>
            </div>
            <div className="bg-[#1e1e23] rounded-xl p-3">
              <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">W / L</div>
              <div className="text-lg font-medium number-tabular">
                <span className="text-[#81c784]">{wins}</span>
                <span className="text-[#6e6e73]"> / </span>
                <span className="text-[#ef5350]">{losses}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#6e6e73]">
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
          {state.retryable && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-full bg-[#42a5f5]/15 text-[#42a5f5] text-[11px] font-medium active:scale-95 transition-transform whitespace-nowrap"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialSignalCard({ data, onPairClick }: { data: TradableSignalData; onPairClick: () => void }) {
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
        {/* ── Pair + Market ── */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onPairClick} className="flex items-center gap-2.5 active:scale-95 transition-transform">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
              data.pair.includes('OTC') ? "bg-[#ff9800]/12 text-[#ffb74d]" :
              ['BTC','ETH'].some(c => data.pair.includes(c)) ? "bg-[#9c27b0]/12 text-[#ce93d8]" :
              "bg-[#42a5f5]/12 text-[#64b5f6]"
            )}>{data.pair.slice(0, 2)}</div>
            <div>
              <div className="text-[15px] font-semibold tracking-tight">{data.pair}</div>
              <div className="text-[9px] text-[#6e6e73] uppercase tracking-[0.15em]">{data.assetType}</div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{
            background: data.marketStatus === 'OPEN' ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)'
          }}>
            <div className={cn("w-1.5 h-1.5 rounded-full", data.marketStatus === 'OPEN' ? "bg-[#00e676]" : "bg-[#ff5252]")}
              style={data.marketStatus === 'OPEN' ? { boxShadow: '0 0 6px #00e676', animation: 'pulse 2s infinite' } : {}} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: data.marketStatus === 'OPEN' ? '#00e676' : '#ff5252' }}>{data.marketStatus}</span>
          </div>
        </div>

        {/* ── HERO: Direction + Confidence ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <div className="text-[9px] uppercase tracking-[0.25em] text-[#6e6e73] mb-1">Signal Direction</div>
            <div className="text-[44px] font-extrabold leading-none tracking-tight mb-2" style={{ color: dirColor, textShadow: `0 0 24px ${dirColor}30` }}>
              {isBuy ? 'BUY' : isSell ? 'SELL' : 'WAIT'}
            </div>
            <div className="flex items-center gap-2">
              {data.signal.grade && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{
                  background: data.signal.grade.grade === 'A+' ? 'rgba(0,230,118,0.12)' :
                    data.signal.grade.grade === 'A' ? 'rgba(76,175,80,0.12)' :
                    data.signal.grade.grade === 'B' ? 'rgba(66,165,245,0.12)' : 'rgba(255,183,77,0.12)',
                  color: data.signal.grade.grade === 'A+' ? '#00e676' :
                    data.signal.grade.grade === 'A' ? '#4caf50' :
                    data.signal.grade.grade === 'B' ? '#42a5f5' : '#ffb74d',
                }}>{data.signal.grade.grade} · {data.signal.grade.label}</span>
              )}
              {best?.timeframe && <span className="text-[9px] text-[#6e6e73] font-medium uppercase">{best.timeframe}</span>}
            </div>
          </div>

          {/* Confidence Ring */}
          <div className="relative flex-shrink-0" style={{ width: 90, height: 90 }}>
            <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
              <circle cx="45" cy="45" r="38" fill="none" stroke={dirColor} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={239} strokeDashoffset={239 - (confidenceNum / 100) * 239}
                style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 5px ${dirColor}60)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[26px] font-bold number-tabular leading-none" style={{ color: dirColor }}>{confidenceNum}</span>
              <span className="text-[8px] uppercase tracking-[0.15em] text-[#6e6e73] mt-0.5">confidence</span>
            </div>
          </div>
        </div>

        {/* ── Key Data Grid ── */}
        {!isNoTrade && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-[8px] uppercase tracking-[0.15em] text-[#6e6e73] mb-1">Entry Price</div>
              <div className="text-[13px] font-bold number-tabular">{entryPrice?.toLocaleString() ?? '—'}</div>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-[8px] uppercase tracking-[0.15em] text-[#6e6e73] mb-1">Expiry</div>
              <div className="text-[13px] font-bold">{expiryLabel}</div>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-[8px] uppercase tracking-[0.15em] text-[#6e6e73] mb-1">Candle Close</div>
              <div className="text-[13px] font-bold number-tabular">{cdLabel || '—'}</div>
            </div>
          </div>
        )}

        {/* ── HTF + Regime ── */}
        <div className="flex items-center gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          {data.signal.higherTFTrend && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-wider text-[#6e6e73]">HTF 15m</span>
              <span className="text-xs font-bold" style={{ color: data.signal.higherTFTrend === 'BUY' ? '#00e676' : data.signal.higherTFTrend === 'SELL' ? '#ff5252' : '#9e9e9e' }}>{data.signal.higherTFTrend}</span>
            </div>
          )}
          {data.signal.marketRegime && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-wider text-[#6e6e73]">Regime</span>
              <span className="text-xs font-medium text-[#b0b3b8]">{data.signal.marketRegime}</span>
            </div>
          )}
          {data.signal.regimeAdvice && <span className="text-[10px] text-[#6e6e73] truncate flex-1">{data.signal.regimeAdvice}</span>}
        </div>

        {/* ── Diagnostic Badges ── */}
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {typeof coreConfidence === 'number' && Math.abs(coreConfidence - confidenceNum) >= 5 && (
            <span className="text-[9px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(149,117,205,0.1)', color: '#b39ddb' }}>Core {coreConfidence}%</span>
          )}
          {structureOverall && structureOverall !== 'N/A' && (
            <span className="text-[9px] font-medium px-2 py-0.5 rounded-md" style={{
              background: structureOverall === 'ALIGNED' ? 'rgba(0,230,118,0.08)' : structureOverall === 'AGAINST' ? 'rgba(255,82,82,0.08)' : 'rgba(255,183,77,0.08)',
              color: structureOverall === 'ALIGNED' ? '#00e676' : structureOverall === 'AGAINST' ? '#ff5252' : '#ffb74d',
            }}>Struct: {structureOverall}</span>
          )}
          {aiBadge && (
            <span className="text-[9px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.03)', color: '#b0b3b8' }}>{aiBadge.label}</span>
          )}
          {data.entrySource && (
            <span className="text-[9px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.03)', color: '#6e6e73' }}>{ENTRY_SOURCE_LABEL[data.entrySource] || data.entrySource}</span>
          )}
        </div>

        {/* Filter badges (D2 transparency) */}
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

function TimeframeCard({ tf, rec }: { tf: string; rec: TimeframeRec }) {
  const isBuy = rec.direction === 'BUY';
  const isSell = rec.direction === 'SELL';
  const color = isBuy ? '#81c784' : isSell ? '#ef5350' : '#bdbdbd';
  const upPercent = rec.score.up + rec.score.down > 0 ? (rec.score.up / (rec.score.up + rec.score.down)) * 100 : 50;

  return (
    <div className="premium-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isBuy ? "bg-[#81c784]/15" : isSell ? "bg-[#ef5350]/15" : "bg-[#bdbdbd]/15")}>
            {isBuy ? <ArrowUp className="w-5 h-5 text-[#81c784]" /> : isSell ? <ArrowDown className="w-5 h-5 text-[#ef5350]" /> : <Minus className="w-5 h-5 text-[#bdbdbd]" />}
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
          <span className="text-[#81c784] font-medium">▲ {rec.score.up.toFixed(1)}</span>
          <span className="text-[#b0b3b8]">DIFF {rec.score.diff.toFixed(1)}</span>
          <span className="text-[#ef5350] font-medium">▼ {rec.score.down.toFixed(1)}</span>
        </div>
        <div className="h-1.5 bg-[#27272d] rounded-full overflow-hidden flex">
          <div className="bg-[#81c784] transition-all duration-500" style={{ width: `${upPercent}%` }} />
          <div className="bg-[#ef5350] transition-all duration-500" style={{ width: `${100 - upPercent}%` }} />
        </div>
      </div>
      {rec.entry && (
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#3a3a3e]">
          <div><div className="text-xs text-[#b0b3b8]">Entry</div><div className="text-sm font-medium number-tabular">{rec.entry.price}</div></div>
          <div><div className="text-xs text-[#b0b3b8]">Candle</div><div className={cn("text-sm font-medium", rec.entry.candleDirection === 'BULLISH' ? "text-[#81c784]" : "text-[#ef5350]")}>{rec.entry.candleDirection}</div></div>
        </div>
      )}
    </div>
  );
}

function IndicatorGrid({ recommendations, timeframeAnalysis, selectedTF, onSelectTF }: { recommendations: Record<string, TimeframeRec>; timeframeAnalysis?: Record<string, any>; selectedTF: string; onSelectTF: (tf: string) => void }) {
  const rec = recommendations[selectedTF];
  // indicators live in timeframeAnalysis, fallback to rec for older responses
  const indicators = timeframeAnalysis?.[selectedTF]?.indicators || (rec as any)?.indicators;

  return (
    <div className="space-y-3">
      <div className="md-surface p-1 flex gap-1">
        {Object.keys(recommendations).map(tf => (
          <button key={tf} onClick={() => onSelectTF(tf)} className={cn("flex-1 py-2 text-xs font-medium rounded-xl transition-all", selectedTF === tf ? "bg-[#42a5f5]/20 text-[#42a5f5]" : "text-[#b0b3b8]")}>{tf.toUpperCase()}</button>
        ))}
      </div>

      {indicators && (
        <>
          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-[#42a5f5]" /><span className="text-sm font-medium">Momentum</span></div>
            <div className="space-y-3">
              <GaugeBar label="RSI" value={parseFloat(indicators.rsi)} />
              <GaugeBar label="Stoch K" value={parseFloat(indicators.stochK)} />
              <GaugeBar label="Stoch D" value={parseFloat(indicators.stochD)} />
            </div>
          </div>

          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><TrendIcon className="w-4 h-4 text-[#81c784]" /><span className="text-sm font-medium">Trend (EMA)</span></div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="EMA 5" value={indicators.ema5} />
              <MiniStat label="EMA 13" value={indicators.ema13} />
              <MiniStat label="EMA 55" value={indicators.ema55} />
            </div>
            <div className={cn("px-3 py-2 rounded-lg text-center text-xs font-medium", indicators.emaAlignment === 'FULL_BULL_STACK' ? "bg-[#81c784]/15 text-[#81c784]" : indicators.emaAlignment === 'FULL_BEAR_STACK' ? "bg-[#ef5350]/15 text-[#ef5350]" : "bg-[#27272d] text-[#b0b3b8]")}>{indicators.emaAlignment?.replace(/_/g, ' ')}</div>
          </div>

          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[#b39ddb]" /><span className="text-sm font-medium">MACD</span></div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Line" value={indicators.macdLine} />
              <MiniStat label="Signal" value={indicators.macdSignal} />
              <MiniStat label="Hist" value={indicators.macdHist} color={parseFloat(indicators.macdHist) > 0 ? '#81c784' : '#ef5350'} />
            </div>
          </div>

          <div className="premium-card p-4">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-[#ffb74d]" /><span className="text-sm font-medium">ADX</span></div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="ADX" value={indicators.adx} color={parseFloat(indicators.adx) > 25 ? '#81c784' : '#bdbdbd'} />
              <MiniStat label="+DI" value={indicators.plusDI} color="#81c784" />
              <MiniStat label="-DI" value={indicators.minusDI} color="#ef5350" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GaugeBar({ label, value }: { label: string; value: number }) {
  if (isNaN(value)) return null;
  const isOverbought = label.includes('RSI') ? value > 70 : value > 80;
  const isOversold = label.includes('RSI') ? value < 30 : value < 20;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#b0b3b8]">{label}</span>
        <span className={cn("text-xs font-medium number-tabular", isOverbought ? "text-[#ef5350]" : isOversold ? "text-[#81c784]" : "text-[#e3e2e6]")}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-[#27272d] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", isOverbought ? "bg-[#ef5350]" : isOversold ? "bg-[#81c784]" : "bg-[#42a5f5]")} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[#27272d] rounded-lg p-2">
      <div className="text-[9px] text-[#b0b3b8] uppercase">{label}</div>
      <div className="font-medium text-xs number-tabular" style={{ color: color || '#e3e2e6' }}>{value}</div>
    </div>
  );
}

function HistoryRow({ entry, onReport, onDelete, onDetail }: { entry: HistoryEntry; onReport: (id: string, result: 'WIN' | 'LOSS') => void; onDelete: (id: string) => void; onDetail: (entry: HistoryEntry) => void }) {
  const isBuy = entry.direction === 'BUY';
  const isPending = !entry.result || entry.result === 'PENDING';
  const isReportable = entry.reportable !== false;
  const expiryPassed = entry.expiryTime && entry.expiryTime <= Date.now();
  const [pressing, setPressing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    setPressing(true);
    pressTimer.current = setTimeout(() => { setPressing(false); setConfirmDelete(true); if (navigator.vibrate) navigator.vibrate(40); }, 550);
  };
  const cancelPress = () => { setPressing(false); if (pressTimer.current) clearTimeout(pressTimer.current); };

  const resultColor = entry.result === 'WIN' ? '#00e676' : entry.result === 'LOSS' ? '#ff5252' : '#ffb74d';
  const resultBg = entry.result === 'WIN' ? 'rgba(0,230,118,0.04)' : entry.result === 'LOSS' ? 'rgba(255,82,82,0.04)' : 'rgba(255,183,77,0.03)';
  const resultLabel = entry.result === 'WIN' ? '✅ WIN' : entry.result === 'LOSS' ? '❌ LOSS' : '⏳';
  const dirColor = isBuy ? '#00e676' : '#ff5252';

  if (confirmDelete) {
    return (
      <div className="p-4 flex items-center justify-between gap-3 rounded-2xl mb-1" style={{ background: 'rgba(255,82,82,0.08)' }}>
        <span className="text-xs text-[#ff5252] font-medium">Delete this signal?</span>
        <div className="flex gap-2">
          <button onClick={() => onDelete(entry.id)} className="px-3 py-1.5 rounded-xl text-white text-[10px] font-bold active:scale-95 transition-transform" style={{ background: '#ff5252' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform" style={{ background: 'rgba(255,255,255,0.05)' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("p-3.5 mb-1 cursor-pointer active:scale-[0.98] transition-transform", pressing && "scale-[0.98]")}
      style={{ borderRadius: 16, background: resultBg, border: `1px solid rgba(255,255,255,0.04)`, borderLeft: `3px solid ${resultColor}` }}
      onClick={() => { if (!confirmDelete) onDetail(entry); }}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
    >
      {/* Row 1: pair + result badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: `${dirColor}15`, color: dirColor }}>
            {isBuy ? '▲' : '▼'}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold">{entry.pair}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${dirColor}12`, color: dirColor }}>{entry.direction}</span>
            {entry.grade && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#b0b3b8' }}>{entry.grade}</span>}
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: `${resultColor}12`, color: resultColor }}>
          {resultLabel}{entry.autoChecked && entry.result ? <span className="text-[7px] opacity-60 ml-0.5">auto</span> : ''}
        </span>
      </div>

      {/* Row 2: data line */}
      <div className="flex items-center gap-3 text-[10px] text-[#6e6e73] flex-wrap">
        {entry.entryPrice > 0 && <span className="number-tabular font-medium text-[#b0b3b8]">{entry.entryPrice.toLocaleString()}</span>}
        <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="number-tabular">{entry.confidence}</span>
        {entry.expiryMinutes && <span>{entry.expiryMinutes}m</span>}
        {entry.timeframe && <span className="uppercase">{entry.timeframe}</span>}
      </div>

      {/* Row 3: diagnostics (only if present) */}
      {(entry.structureVerdict || entry.aiStatus || typeof entry.coreConfidence === 'number') && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {entry.structureVerdict && entry.structureVerdict !== 'N/A' && (
            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded" style={{
              background: entry.structureVerdict === 'ALIGNED' ? 'rgba(0,230,118,0.08)' : entry.structureVerdict === 'AGAINST' ? 'rgba(255,82,82,0.08)' : 'rgba(255,183,77,0.08)',
              color: entry.structureVerdict === 'ALIGNED' ? '#00e676' : entry.structureVerdict === 'AGAINST' ? '#ff5252' : '#ffb74d',
            }}>{entry.structureVerdict}</span>
          )}
          {entry.aiStatus && entry.aiStatus !== 'SKIPPED' && (
            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: '#8e9099' }}>AI: {entry.aiStatus}</span>
          )}
          {typeof entry.coreConfidence === 'number' && (
            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(149,117,205,0.1)', color: '#b39ddb' }}>Core {entry.coreConfidence}%</span>
          )}
        </div>
      )}

      {/* Exit price */}
      {entry.exitPrice && entry.exitPrice > 0 && (
        <div className="mt-1.5 text-[10px] flex items-center gap-2">
          <span className="text-[#6e6e73]">Exit:</span>
          <span className="number-tabular font-medium" style={{ color: resultColor }}>{entry.exitPrice.toLocaleString()}</span>
        </div>
      )}

      {/* Pending actions */}
      {isPending && isReportable && expiryPassed && (
        <div className="flex gap-2 mt-2">
          <button onClick={(e) => { e.stopPropagation(); onReport(entry.id, 'WIN'); }} className="flex-1 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-1" style={{ background: 'rgba(0,230,118,0.1)', color: '#00e676' }}>✅ Mark WIN</button>
          <button onClick={(e) => { e.stopPropagation(); onReport(entry.id, 'LOSS'); }} className="flex-1 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-1" style={{ background: 'rgba(255,82,82,0.1)', color: '#ff5252' }}>❌ Mark LOSS</button>
        </div>
      )}
    </div>
  );
}


function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="text-[8px] uppercase tracking-[0.15em] text-[#6e6e73] mb-1.5 font-medium">{label}</div>
      <div className="text-xl font-bold number-tabular" style={{ color, textShadow: `0 0 8px ${color}30` }}>{value}</div>
    </div>
  );
}
function SettingRow({ icon: Icon, iconColor, label, description, value, toggle, toggleValue, onToggle, onClick, isLast }: any) {
  return (
    <div className={cn("flex items-center gap-3 p-4", onClick && "active:scale-[0.98] transition-transform cursor-pointer")} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.03)' }} onClick={onClick}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${iconColor}12` }}>
        <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{label}</div>
        {description && <div className="text-[11px] text-[#6e6e73]">{description}</div>}
      </div>
      {value && <span className="text-[#8e9099] text-xs font-medium">{value}</span>}
      {toggle && (
        <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} className="relative w-11 h-6 rounded-full transition-all active:scale-90" style={{
          background: toggleValue ? '#00e676' : 'rgba(255,255,255,0.08)',
          boxShadow: toggleValue ? '0 0 8px rgba(0,230,118,0.3)' : 'none',
        }}>
          <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform" style={{ transform: toggleValue ? 'translateX(22px)' : 'translateX(2px)' }} />
        </button>
      )}
    </div>
  );
}
function NavButton({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5 active:scale-90 transition-transform relative", active ? "text-[#4dd0e1]" : "text-[#6e6e73]")} style={active ? { filter: 'drop-shadow(0 0 4px rgba(77,208,225,0.3))' } : {}}>
      {active && <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: '#4dd0e1', boxShadow: '0 0 6px #4dd0e1' }} />}
      <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.8} />
      <span className="text-[9px] font-medium tracking-wide">{label}</span>
      {badge !== undefined && badge > 0 && (
        <div className="absolute top-0 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center" style={{ background: '#ff5252', boxShadow: '0 0 4px rgba(255,82,82,0.4)' }}>
          <span className="text-[8px] text-white font-bold">{badge}</span>
        </div>
      )}
    </button>
  );
}
