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
  CheckCircle2,
  XCircle,
  Globe2,
  Activity,
  Gauge,
  Radar,
  TrendingUp as TrendIcon
} from 'lucide-react';
import { SignalData, TimeframeRec } from './types';
import { cn } from './utils/cn';
import { PairSelector } from './components/PairSelector';
import { ScannerView } from './components/ScannerView';
import { API_BASE } from './config';

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
  aiAgree?: boolean;
  autoChecked?: boolean; // true if result was set by auto win/loss check
  reportable?: boolean; // false when no worker signal ID exists (local-only fallback)
  reportStatus?: 'syncing' | 'synced' | 'failed';
  reportError?: string;
}

type Tab = 'home' | 'analysis' | 'history' | 'settings' | 'scanner';

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
      return saved ? JSON.parse(saved) : ['EUR/USD', 'GBP/USD', 'XAU/USD'];
    } catch { return ['EUR/USD', 'GBP/USD', 'XAU/USD']; }
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

  const historyRef = useRef<HistoryEntry[]>(history);
  historyRef.current = history;

  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchInFlightRef = useRef(false);

  const fetchSignal = useCallback(async (silent = false) => {
    // Prevent overlapping requests (a previous slow/hung request could
    // otherwise keep `loading=true` forever and block the UI)
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    // Abort any previous in-flight request just in case
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s hard timeout

    if (!silent) setLoading(true);
    setError(null);
    const requestedPair = selectedPair;
    try {
      const cleanPair = requestedPair.replace('/', '').toLowerCase();
      const response = await fetch(`${API_BASE}/api/signal?pair=${cleanPair}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Network error');
      const data: SignalData = await response.json();

      if (!data?.signal) throw new Error('Invalid response');

      // If the user switched pairs while this request was in flight, drop it
      if (requestedPair !== selectedPair) return;

      setSignalData(data);
      setLastUpdated(new Date());
      setRefreshCountdown(60);

      if (['BUY', 'SELL'].includes(data.signal.finalSignal)) {
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
          reportable: Boolean(workerSignalId),
        };
        setHistory(prev => {
          if (prev.find(h => h.id === historyId)) return prev;
          return [newEntry, ...prev].slice(0, 100);
        });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('Request timed out. Tap retry.');
      } else {
        setError('Unable to fetch signal. Tap retry.');
      }
    } finally {
      clearTimeout(timeoutId);
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [selectedPair]);

  useEffect(() => {
    try { localStorage.setItem('ftt_history', JSON.stringify(history)); } catch {}
  }, [history]);

  useEffect(() => { fetchSignal(); try { localStorage.setItem('ftt_selected_pair', selectedPair); } catch {} }, [selectedPair]);

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

  // Auto WIN/LOSS checker: every 30s, check PENDING entries whose expiry has
  // passed, fetch current price for that pair, and compare vs entry price.
  // Uses a ref for `history` so the interval is created ONCE, not re-created
  // every time history changes (which previously caused timer churn).

  useEffect(() => {
    let cancelled = false;

    const checkExpired = async () => {
      const now = Date.now();
      const due = historyRef.current.filter(h =>
        (!h.result || h.result === 'PENDING') &&
        h.expiryTime && h.expiryTime <= now
      );
      if (due.length === 0) return;

      const entry = due[0];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const cleanPair = entry.pair.replace('/', '').toLowerCase();
        const response = await fetch(`${API_BASE}/api/signal?pair=${cleanPair}`, { signal: controller.signal });
        if (!response.ok) return;
        const data: SignalData = await response.json();
        const currentPrice = data.signal?.recommendations?.['1min']?.entry?.price ?? null;
        if (currentPrice == null || !entry.entryPrice || cancelled) return;

        const movedUp = currentPrice > entry.entryPrice;
        const movedDown = currentPrice < entry.entryPrice;
        let result: 'WIN' | 'LOSS' | undefined;
        if (entry.direction === 'BUY' && movedUp) result = 'WIN';
        else if (entry.direction === 'BUY' && movedDown) result = 'LOSS';
        else if (entry.direction === 'SELL' && movedDown) result = 'WIN';
        else if (entry.direction === 'SELL' && movedUp) result = 'LOSS';

        if (result) {
          setHistory(prev => prev.map(h => h.id === entry.id ? {
            ...h,
            result,
            autoChecked: true,
            reportStatus: entry.reportable === false ? h.reportStatus : 'syncing',
            reportError: undefined,
          } : h));

          if (entry.reportable === false) {
            console.warn('Skipping auto report for local-only signal without worker id.', {
              id: entry.id,
              result,
              pair: entry.pair,
            });
            return;
          }

          try {
            await reportSignalResult(entry.id, result);
            setHistory(prev => prev.map(h => h.id === entry.id ? {
              ...h,
              reportStatus: 'synced',
              reportError: undefined,
            } : h));
          } catch (e) {
            console.warn('Failed to auto-report signal result to worker.', { id: entry.id, result, error: e });
            setHistory(prev => prev.map(h => h.id === entry.id ? {
              ...h,
              reportStatus: 'failed',
              reportError: 'Auto result saved locally; server sync failed.',
            } : h));
          }
        }
      } catch {
        // silent — will retry next cycle
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const interval = setInterval(checkExpired, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [reportSignalResult]);

  const pendingCount = history.filter(h => !h.result || h.result === 'PENDING').length;
  const wins = history.filter(h => h.result === 'WIN').length;
  const losses = history.filter(h => h.result === 'LOSS').length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

  const handleScannerSignalClick = (pair: string) => {
    setSelectedPair(pair);
    setActiveTab('home');
    fetchSignal();
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e3e2e6] gradient-mesh">
      {/* Top App Bar */}
      <header className="sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-xl border-b border-[#3a3a3e]/50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4dd0e1] to-[#26a69a] flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-[#00363a]" />
              </div>
              <div>
                <h1 className="font-medium text-lg leading-tight">Signal<span className="text-[#4dd0e1]">Pro</span></h1>
                <p className="text-[11px] text-[#b0b3b8]">AI Trading Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoRefresh && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e23] rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#81c784] animate-pulse" />
                  <span className="text-xs text-[#b0b3b8] font-medium number-tabular">{refreshCountdown}s</span>
                </div>
              )}
              <button 
                onClick={() => fetchSignal()}
                disabled={loading}
                className="w-10 h-10 rounded-full bg-[#1e1e23] flex items-center justify-center active:scale-90 transition-transform"
              >
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4 pb-24">
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
            <div className="h-64 bg-[#1e1e23] rounded-2xl animate-pulse" />
            <div className="h-32 bg-[#1e1e23] rounded-2xl animate-pulse" />
          </div>
        )}

        {/* HOME TAB */}
        {activeTab === 'home' && signalData && (
          <div className="space-y-3 fade-in">
            <MaterialSignalCard data={signalData} onPairClick={() => setPickerOpen(true)} />
            
            {/* AI Insights */}
            {signalData.signal.aiValidation?.combined && (
              <div className="md-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#3a0069]/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#b39ddb]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">AI Analysis</div>
                      <div className="text-xs text-[#b0b3b8]">{signalData.signal.aiValidation.combined.model || 'Multi-model'}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium",
                    signalData.signal.aiValidation.agrees 
                      ? "bg-[#81c784]/20 text-[#81c784]" 
                      : "bg-[#ffb74d]/20 text-[#ffb74d]"
                  )}>
                    {signalData.signal.aiValidation.combined.agreement === 'BOTH_AGREE' ? '✓ Both Agree' : signalData.signal.aiValidation.agrees ? '✓ Agree' : '⚠ Divergent'}
                  </div>
                </div>
                {/* Individual model status */}
                <div className="flex gap-2 mb-3">
                  {(['cerebras','groq'] as const).map(model => {
                    const m = signalData.signal.aiValidation![model];
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
                      signalData.signal.aiValidation.combined.signal === 'BUY' && "text-[#81c784]",
                      signalData.signal.aiValidation.combined.signal === 'SELL' && "text-[#ef5350]"
                    )}>{signalData.signal.aiValidation.combined.signal}</div>
                  </div>
                  <div className="bg-[#27272d] rounded-xl p-3">
                    <div className="text-xs text-[#b0b3b8] mb-1">Confidence</div>
                    <div className="text-lg font-medium number-tabular">{signalData.signal.aiValidation.combined.confidence}%</div>
                  </div>
                </div>
                <p className="text-sm text-[#c4c6d0] leading-relaxed">{signalData.signal.aiValidation.combined.reason}</p>
                {signalData.signal.aiValidation.combined.concerns && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-[#ffb74d]/10 rounded-xl border border-[#ffb74d]/20">
                    <span className="text-[#ffb74d] text-xs mt-0.5">⚠</span>
                    <p className="text-xs text-[#ffb74d]/90 leading-relaxed">{signalData.signal.aiValidation.combined.concerns}</p>
                  </div>
                )}
              </div>
            )}

            {/* Structure Verdict */}
            {signalData.signal.structureVerdict && signalData.signal.structureVerdict.overall !== 'N/A' && (
              <div className="md-surface p-4">
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
                    signalData.signal.structureVerdict.overall === 'ALIGNED' && "bg-[#81c784]/20 text-[#81c784]",
                    signalData.signal.structureVerdict.overall === 'AGAINST' && "bg-[#ef5350]/20 text-[#ef5350]",
                    signalData.signal.structureVerdict.overall === 'MIXED' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                    signalData.signal.structureVerdict.overall === 'NEUTRAL' && "bg-[#bdbdbd]/20 text-[#bdbdbd]",
                  )}>
                    {signalData.signal.structureVerdict.overall === 'ALIGNED' && '✓ ALIGNED'}
                    {signalData.signal.structureVerdict.overall === 'AGAINST' && '✗ AGAINST'}
                    {signalData.signal.structureVerdict.overall === 'MIXED' && '~ MIXED'}
                    {signalData.signal.structureVerdict.overall === 'NEUTRAL' && '— NEUTRAL'}
                  </div>
                </div>
                {/* Structure's own direction call */}
                <div className="flex items-center justify-between mb-3 bg-[#27272d] rounded-xl p-3">
                  <div className="text-xs text-[#b0b3b8]">Structure says</div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold",
                      signalData.signal.structureVerdict.direction === 'BUY' && "text-[#81c784]",
                      signalData.signal.structureVerdict.direction === 'SELL' && "text-[#ef5350]",
                      (signalData.signal.structureVerdict.direction === 'NEUTRAL' || signalData.signal.structureVerdict.direction === 'MIXED') && "text-[#bdbdbd]",
                    )}>
                      {signalData.signal.structureVerdict.direction}
                    </span>
                    {signalData.signal.structureVerdict.strength !== 'NEUTRAL' && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        signalData.signal.structureVerdict.strength === 'STRONG' ? "bg-[#42a5f5]/20 text-[#42a5f5]" : "bg-[#bdbdbd]/15 text-[#bdbdbd]"
                      )}>
                        {signalData.signal.structureVerdict.strength}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {Object.entries(signalData.signal.structureVerdict.perTimeframe).map(([tf, v]) => (
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
                {signalData.signal.structureVerdict.overall === 'AGAINST' && (
                  <p className="mt-3 text-xs text-[#ef5350]/80 bg-[#ef5350]/10 rounded-lg p-2.5">
                    ⚠ Structure is against the signal — consider skipping or wait for structure to align.
                  </p>
                )}
                {signalData.signal.structureVerdict.overall === 'MIXED' && (
                  <p className="mt-3 text-xs text-[#ffb74d]/80 bg-[#ffb74d]/10 rounded-lg p-2.5">
                    ~ Mixed structure — trade with caution, check the best timeframe.
                  </p>
                )}
              </div>
            )}

            {/* Sessions */}
            <div className="md-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe2 className="w-4 h-4 text-[#42a5f5]" />
                <span className="text-sm font-medium">Market Sessions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {signalData.session.sessions.map(s => (
                  <div key={s} className="px-3 py-1.5 bg-[#27272d] rounded-lg text-sm font-medium">
                    {s}
                  </div>
                ))}
                <div className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium",
                  signalData.session.quality === 'HIGH' && "bg-[#81c784]/20 text-[#81c784]",
                  signalData.session.quality === 'MEDIUM' && "bg-[#ffb74d]/20 text-[#ffb74d]",
                  signalData.session.quality === 'LOW' && "bg-[#ef5350]/20 text-[#ef5350]"
                )}>
                  {signalData.session.quality} Quality
                </div>
              </div>
            </div>

            {/* Entry Reason */}
            <div className="md-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-[#ffb74d]" />
                <span className="text-sm font-medium">Entry Reasoning</span>
              </div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">{signalData.signal.entryReason}</p>
            </div>

            {/* Market Regime */}
            <div className="md-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendIcon className="w-4 h-4 text-[#42a5f5]" />
                  <span className="text-sm font-medium">Market Regime</span>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium",
                  signalData.signal.marketRegime === 'TRENDING' && "bg-[#81c784]/20 text-[#81c784]",
                  signalData.signal.marketRegime === 'RANGING' && "bg-[#ffb74d]/20 text-[#ffb74d]"
                )}>{signalData.signal.marketRegime}</span>
              </div>
              <p className="text-sm text-[#b0b3b8]">{signalData.signal.regimeAdvice}</p>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && signalData && (
          <div className="space-y-3 fade-in">
            <div className="md-surface p-4">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-[#42a5f5]" />
                <span className="text-sm font-medium">Multi-Timeframe Analysis</span>
              </div>
              <p className="text-xs text-[#b0b3b8]">Signal strength across all timeframes</p>
            </div>

            {Object.entries(signalData.signal.recommendations).map(([tf, rec]) => (
              <TimeframeCard key={tf} tf={tf} rec={rec} />
            ))}

            <div className="mt-4 mb-2">
              <h3 className="text-xs uppercase tracking-wider text-[#8e9099] font-medium px-1">Technical Indicators</h3>
            </div>
            <IndicatorGrid 
              recommendations={signalData.signal.recommendations}
              timeframeAnalysis={signalData.signal.timeframeAnalysis}
              selectedTF={selectedIndicatorTF}
              onSelectTF={setSelectedIndicatorTF}
            />
          </div>
        )}

        {/* SCANNER TAB */}
        {activeTab === 'scanner' && (
          <ScannerView onSignalClick={handleScannerSignalClick} />
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-2xl font-medium mb-1">Signal History</h2>
              <p className="text-[#b0b3b8] text-sm">Track your trading performance</p>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <StatCard label="Total" value={history.length} color="#42a5f5" />
              <StatCard label="Wins" value={wins} color="#81c784" />
              <StatCard label="Losses" value={losses} color="#ef5350" />
              <StatCard label="Win %" value={`${winRate}%`} color="#ffb74d" />
            </div>

            {/* List */}
            <div className="md-surface overflow-hidden">
              {history.length === 0 ? (
                <div className="p-10 text-center">
                  <Clock className="w-12 h-12 text-[#3a3a3e] mx-auto mb-3" />
                  <p className="text-[#b0b3b8] font-medium mb-1">No history yet</p>
                  <p className="text-[#6e6e73] text-sm">Generated signals will appear here</p>
                </div>
              ) : (
                history.slice(0, 30).map((entry, idx) => (
                  <HistoryRow key={entry.id} entry={entry} onReport={handleReport} onDelete={(id) => setHistory(prev => prev.filter(h => h.id !== id))} isLast={idx === Math.min(history.length, 30) - 1} />
                ))
              )}
            </div>

            {history.length > 0 && (
              <button 
                onClick={() => setHistory([])}
                className="w-full mt-4 py-3 md-surface text-[#ef5350] font-medium active:scale-95 transition-transform"
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
              <h2 className="text-2xl font-medium mb-1">Settings</h2>
              <p className="text-[#b0b3b8] text-sm">Customize your experience</p>
            </div>

            <div className="md-surface overflow-hidden mb-4">
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

            <div className="md-surface overflow-hidden mb-4">
              <SettingRow
                icon={Trash2}
                iconColor="#ef5350"
                label="Clear History"
                description={`${history.length} entries`}
                onClick={() => setHistory([])}
                isLast
              />
            </div>

            <div className="md-surface overflow-hidden">
              <SettingRow icon={Info} iconColor="#42a5f5" label="Version" value="2.0.0" />
              <SettingRow icon={Code} iconColor="#b39ddb" label="API Method" value={signalData?.signal.method?.split('_').slice(0, 2).join(' ') || 'v6.9.2'} isLast />
            </div>

            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-xs text-[#6e6e73]">
                <Code className="w-4 h-4" />
                <span>Signal Pro · Built with Material You</span>
              </div>
              {lastUpdated && <p className="text-[10px] text-[#4a4a4f] mt-2">Last sync: {lastUpdated.toLocaleTimeString()}</p>}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/90 backdrop-blur-xl border-t border-[#3a3a3e]/50">
        <div className="flex items-center justify-around py-2">
          <NavButton icon={TrendingUp} label="Signal" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavButton icon={Radar} label="Scanner" active={activeTab === 'scanner'} onClick={() => setActiveTab('scanner')} />
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
    </div>
  );
}

// Components
function MaterialSignalCard({ data, onPairClick }: { data: SignalData; onPairClick: () => void }) {
  const signal = data.signal.finalSignal;
  const isBuy = signal === 'BUY';
  const isSell = signal === 'SELL';
  const confidenceNum = parseInt(data.signal.confidence) || 0;
  const best = data.signal.bestTimeframe;
  const entryPrice = data.signal.recommendations?.[best?.timeframe as '5min']?.entry?.price;

  return (
    <div className="md-surface-highest p-0 overflow-hidden scale-in">
      <div className={cn("h-1.5 w-full", isBuy ? "bg-gradient-to-r from-[#81c784] to-[#4caf50]" : isSell ? "bg-gradient-to-r from-[#ef5350] to-[#f44336]" : "bg-gradient-to-r from-[#bdbdbd] to-[#9e9e9e]")} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onPairClick} className="flex items-center gap-2 px-3 py-2 md-surface-variant rounded-xl active:scale-95 transition-transform">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold", data.pair.includes('OTC') ? "bg-[#ff9800]/20 text-[#ff9800]" : ['BTC','ETH'].some(c => data.pair.includes(c)) ? "bg-[#9c27b0]/20 text-[#9c27b0]" : "bg-[#2196f3]/20 text-[#2196f3]")}>
              {data.pair.slice(0, 2)}
            </div>
            <span className="font-medium">{data.pair}</span>
          </button>
          <div className={cn("px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5", data.marketStatus === 'OPEN' ? "bg-[#81c784]/20 text-[#81c784]" : "bg-[#ef5350]/20 text-[#ef5350]")}>
            <div className={cn("w-2 h-2 rounded-full", data.marketStatus === 'OPEN' ? "bg-[#81c784] animate-pulse" : "bg-[#ef5350]")} />
            {data.marketStatus}
          </div>
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", isBuy ? "bg-[#81c784]/20" : isSell ? "bg-[#ef5350]/20" : "bg-[#bdbdbd]/20")}>
              {isBuy ? <ArrowUp className="w-8 h-8 text-[#81c784]" strokeWidth={2.5} /> : isSell ? <ArrowDown className="w-8 h-8 text-[#ef5350]" strokeWidth={2.5} /> : <Minus className="w-8 h-8 text-[#bdbdbd]" strokeWidth={2.5} />}
            </div>
            <div>
              <div className="text-sm text-[#b0b3b8] mb-0.5">Signal</div>
              <div className={cn("text-3xl font-medium", isBuy ? "text-[#81c784]" : isSell ? "text-[#ef5350]" : "text-[#bdbdbd]")}>{signal}</div>
            </div>
          </div>

          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="#27272d" strokeWidth="8" fill="none" />
              <circle cx="50" cy="50" r="42" stroke={isBuy ? '#81c784' : isSell ? '#ef5350' : '#bdbdbd'} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={264} strokeDashoffset={264 - (confidenceNum / 100) * 264} className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-2xl font-light number-tabular", isBuy ? "text-[#81c784]" : isSell ? "text-[#ef5350]" : "text-[#bdbdbd]")}>{confidenceNum}</span>
              <span className="text-xs text-[#b0b3b8]">%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className={cn("px-3 py-1.5 rounded-lg text-sm font-medium", data.signal.grade.grade === 'A' ? "bg-[#81c784]/20 text-[#81c784]" : data.signal.grade.grade === 'B' ? "bg-[#42a5f5]/20 text-[#42a5f5]" : data.signal.grade.grade === 'C' ? "bg-[#ffb74d]/20 text-[#ffb74d]" : "bg-[#ef5350]/20 text-[#ef5350]")}>
            Grade {data.signal.grade.grade} · {data.signal.grade.label}
          </div>
          {best?.timeframe && <div className="px-3 py-1.5 bg-[#323238] rounded-lg text-xs font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{best.timeframe}</div>}
        </div>

        {entryPrice && (
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#3a3a3e]">
            <div><div className="text-xs text-[#b0b3b8] mb-1">Entry Price</div><div className="text-base font-medium number-tabular">{entryPrice}</div></div>
            <div><div className="text-xs text-[#b0b3b8] mb-1">Timeframe</div><div className="text-base font-medium">{best?.timeframe}</div></div>
            <div><div className="text-xs text-[#b0b3b8] mb-1">Expiry</div><div className="text-base font-medium">{best?.expiry?.humanReadable || '—'}</div></div>
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
    <div className="md-surface p-4">
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
          <div className="md-surface p-4">
            <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-[#42a5f5]" /><span className="text-sm font-medium">Momentum</span></div>
            <div className="space-y-3">
              <GaugeBar label="RSI" value={parseFloat(indicators.rsi)} />
              <GaugeBar label="Stoch K" value={parseFloat(indicators.stochK)} />
              <GaugeBar label="Stoch D" value={parseFloat(indicators.stochD)} />
            </div>
          </div>

          <div className="md-surface p-4">
            <div className="flex items-center gap-2 mb-3"><TrendIcon className="w-4 h-4 text-[#81c784]" /><span className="text-sm font-medium">Trend (EMA)</span></div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="EMA 5" value={indicators.ema5} />
              <MiniStat label="EMA 13" value={indicators.ema13} />
              <MiniStat label="EMA 55" value={indicators.ema55} />
            </div>
            <div className={cn("px-3 py-2 rounded-lg text-center text-xs font-medium", indicators.emaAlignment === 'FULL_BULL_STACK' ? "bg-[#81c784]/15 text-[#81c784]" : indicators.emaAlignment === 'FULL_BEAR_STACK' ? "bg-[#ef5350]/15 text-[#ef5350]" : "bg-[#27272d] text-[#b0b3b8]")}>{indicators.emaAlignment?.replace(/_/g, ' ')}</div>
          </div>

          <div className="md-surface p-4">
            <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[#b39ddb]" /><span className="text-sm font-medium">MACD</span></div>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Line" value={indicators.macdLine} />
              <MiniStat label="Signal" value={indicators.macdSignal} />
              <MiniStat label="Hist" value={indicators.macdHist} color={parseFloat(indicators.macdHist) > 0 ? '#81c784' : '#ef5350'} />
            </div>
          </div>

          <div className="md-surface p-4">
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

function HistoryRow({ entry, onReport, onDelete, isLast }: { entry: HistoryEntry; onReport: (id: string, result: 'WIN' | 'LOSS') => void; onDelete: (id: string) => void; isLast: boolean }) {
  const isBuy = entry.direction === 'BUY';
  const isPending = !entry.result || entry.result === 'PENDING';
  const isReportable = entry.reportable !== false;
  const expiryPassed = entry.expiryTime && entry.expiryTime <= Date.now();
  const [pressing, setPressing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    setPressing(true);
    pressTimer.current = setTimeout(() => {
      setPressing(false);
      setConfirmDelete(true);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 550);
  };
  const cancelPress = () => {
    setPressing(false);
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  if (confirmDelete) {
    return (
      <div className={cn("p-4 flex items-center justify-between gap-3 bg-[#ef5350]/10", !isLast && "border-b border-[#3a3a3e]")}>
        <span className="text-sm text-[#ef5350] font-medium">Delete {entry.pair} signal?</span>
        <div className="flex gap-2">
          <button onClick={() => onDelete(entry.id)} className="px-3 py-1.5 rounded-lg bg-[#ef5350] text-white text-xs font-medium active:scale-95 transition-transform">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg bg-[#27272d] text-[#e3e2e6] text-xs font-medium active:scale-95 transition-transform">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("p-4 transition-colors select-none", !isLast && "border-b border-[#3a3a3e]", pressing && "bg-[#ef5350]/5")}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", isBuy ? "bg-[#81c784]/15" : "bg-[#ef5350]/15")}>
            {isBuy ? <ArrowUp className="w-4 h-4 text-[#81c784]" /> : <ArrowDown className="w-4 h-4 text-[#ef5350]" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{entry.pair}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[#27272d] rounded text-[#b0b3b8]">{entry.timeframe}</span>
              {entry.grade && (
                <span className="text-[10px] px-1.5 py-0.5 bg-[#9575cd]/20 text-[#b39ddb] rounded font-bold">
                  {entry.grade}{entry.gradeLabel ? ` · ${entry.gradeLabel}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6e6e73] flex-wrap">
              <span className="number-tabular">{entry.entryPrice}</span>
              <span>·</span>
              <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span>·</span>
              <span>{entry.confidence}</span>
              {entry.expiryMinutes && (
                <>
                  <span>·</span>
                  <span>exp {entry.expiryMinutes}m</span>
                </>
              )}
            </div>
            {/* Structure verdict line */}
            {entry.structureDirection && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-[#6e6e73]">Structure:</span>
                <span className={cn(
                  "text-[9px] font-bold",
                  entry.structureDirection === 'BUY' && "text-[#81c784]",
                  entry.structureDirection === 'SELL' && "text-[#ef5350]",
                  (entry.structureDirection === 'NEUTRAL' || entry.structureDirection === 'MIXED') && "text-[#b0b3b8]",
                )}>
                  {entry.structureDirection}{entry.structureStrength && entry.structureStrength !== 'NEUTRAL' ? ` (${entry.structureStrength})` : ''}
                </span>
                {entry.structureOverall && entry.structureOverall !== 'N/A' && (
                  <span className={cn(
                    "text-[9px] px-1 rounded",
                    entry.structureOverall === 'ALIGNED' && "bg-[#81c784]/15 text-[#81c784]",
                    entry.structureOverall === 'AGAINST' && "bg-[#ef5350]/15 text-[#ef5350]",
                    entry.structureOverall === 'MIXED' && "bg-[#ffb74d]/15 text-[#ffb74d]",
                    entry.structureOverall === 'NEUTRAL' && "bg-[#bdbdbd]/15 text-[#bdbdbd]",
                  )}>
                    {entry.structureOverall}
                  </span>
                )}
                {entry.aiAgree !== undefined && (
                  <span className={cn("text-[9px]", entry.aiAgree ? "text-[#81c784]" : "text-[#ffb74d]")}>
                    {entry.aiAgree ? '· AI ✓' : '· AI ⚠'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {entry.result === 'WIN' && (
          <div className="px-2.5 py-1 rounded-full bg-[#81c784]/20 text-[#81c784] text-xs font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />WIN{entry.autoChecked && <span className="text-[8px] opacity-70">·auto</span>}
          </div>
        )}
        {entry.result === 'LOSS' && (
          <div className="px-2.5 py-1 rounded-full bg-[#ef5350]/20 text-[#ef5350] text-xs font-medium flex items-center gap-1">
            <XCircle className="w-3 h-3" />LOSS{entry.autoChecked && <span className="text-[8px] opacity-70">·auto</span>}
          </div>
        )}
        {isPending && entry.expiryMinutes && !expiryPassed && (
          <div className="px-2.5 py-1 rounded-full bg-[#42a5f5]/15 text-[#42a5f5] text-[10px] font-medium">
            running
          </div>
        )}
      </div>
      {!isReportable && (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#ffb74d]/10 border border-[#ffb74d]/20 px-3 py-2 text-[11px] text-[#ffb74d]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Local-only signal: server report is disabled because the worker did not return a signal ID.</span>
        </div>
      )}
      {entry.reportStatus === 'syncing' && (
        <div className="mt-2 rounded-xl bg-[#42a5f5]/10 border border-[#42a5f5]/20 px-3 py-2 text-[11px] text-[#42a5f5]">
          Syncing result to server…
        </div>
      )}
      {entry.reportStatus === 'synced' && (
        <div className="mt-2 rounded-xl bg-[#81c784]/10 border border-[#81c784]/20 px-3 py-2 text-[11px] text-[#81c784]">
          Server report synced.
        </div>
      )}
      {entry.reportStatus === 'failed' && (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#ef5350]/10 border border-[#ef5350]/20 px-3 py-2 text-[11px] text-[#ffb4ab]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{entry.reportError || 'Server report failed.'}</span>
        </div>
      )}
      {isPending && isReportable && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => onReport(entry.id, 'WIN')} className="flex-1 py-2 rounded-xl bg-[#81c784]/15 text-[#81c784] font-medium text-xs flex items-center justify-center gap-1 active:scale-95 transition-transform"><CheckCircle2 className="w-3.5 h-3.5" />WIN</button>
          <button onClick={() => onReport(entry.id, 'LOSS')} className="flex-1 py-2 rounded-xl bg-[#ef5350]/15 text-[#ef5350] font-medium text-xs flex items-center justify-center gap-1 active:scale-95 transition-transform"><XCircle className="w-3.5 h-3.5" />LOSS</button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="md-surface p-3 text-center">
      <div className="text-[10px] text-[#b0b3b8] uppercase mb-1">{label}</div>
      <div className="text-xl font-medium number-tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function SettingRow({ icon: Icon, iconColor, label, description, value, toggle, toggleValue, onToggle, onClick, isLast }: any) {
  return (
    <div className={cn("flex items-center gap-3 p-4", !isLast && "border-b border-[#3a3a3e]", onClick && "active:scale-95 transition-transform cursor-pointer")} onClick={onClick}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${iconColor}20` }}>
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-[#b0b3b8]">{description}</div>}
      </div>
      {value && <span className="text-[#b0b3b8] text-sm">{value}</span>}
      {toggle && (
        <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} className={cn("relative w-12 h-6 rounded-full transition-colors", toggleValue ? "bg-[#42a5f5]" : "bg-[#3a3a3e]")}>
          <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", toggleValue ? "translate-x-6" : "translate-x-0.5")} />
        </button>
      )}
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1 px-4 py-2 active:scale-90 transition-transform relative", active ? "text-[#4dd0e1]" : "text-[#6e6e73]")}>
      <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10px] font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <div className="absolute top-1 right-2 min-w-[16px] h-[16px] px-1 bg-[#ef5350] rounded-full flex items-center justify-center">
          <span className="text-[9px] text-white font-medium">{badge}</span>
        </div>
      )}
    </button>
  );
}
