import { useCallback, useEffect, useRef, useState } from 'react';
import { SignalData } from '../types';
import { fetchSignal } from '../lib/api';
import { deriveAiStatus, isSupportedPair } from '../utils/signalMeta';

export interface HistoryEntry {
  id: string;
  pair: string;
  direction: string;
  confidence: string;
  timeframe: string;
  entryPrice: number;
  timestamp: number;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  grade?: string;
  entryHit?: boolean;
  gradeLabel?: string;
  structureDirection?: string;
  structureStrength?: string;
  structureOverall?: string;
  expiryMinutes?: number;
  expiryTime?: number;
  exitPrice?: number;
  checkedAt?: string;
  aiAgree?: boolean;
  autoChecked?: boolean;
  structureVerdict?: string;
  aiStatus?: string;
  coreConfidence?: number;
  entrySource?: string;
  reportable?: boolean;
  reportStatus?: 'syncing' | 'synced' | 'failed';
  reportError?: string;
}

export type TradableSignalData = SignalData & {
  signal: NonNullable<SignalData['signal']>;
  session: NonNullable<SignalData['session']>;
};

const DEFAULT_FAVORITES = ['EUR/USD', 'GBP/USD', 'BTC/USD'];

function loadFavorites(): string[] {
  try {
    const saved = localStorage.getItem('ftt_favorites');
    const parsed: string[] = saved ? JSON.parse(saved) : DEFAULT_FAVORITES;
    const cleaned = Array.isArray(parsed) ? parsed.filter(isSupportedPair) : DEFAULT_FAVORITES;
    return cleaned.length > 0 ? cleaned : DEFAULT_FAVORITES;
  } catch { return DEFAULT_FAVORITES; }
}

function loadSelectedPair(): string {
  try { return localStorage.getItem('ftt_selected_pair') || 'EUR/USD'; } catch { return 'EUR/USD'; }
}

function loadSignalMode(): 'ftt' | 'fx' | 'both' {
  try { const m = localStorage.getItem('ftt_signal_mode'); return m === 'fx' || m === 'both' ? m : 'ftt'; } catch { return 'ftt'; }
}

export function useSignal() {
  const [selectedPair, setSelectedPair] = useState(loadSelectedPair);
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signalMode, setSignalMode] = useState<'ftt' | 'fx' | 'both'>(loadSignalMode);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState(60);

  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ftt_history');
      const parsed: HistoryEntry[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(e => ({ ...e, reportable: e.reportable ?? (typeof e.id === 'string' && e.id.startsWith('sig_')) }));
    } catch { return []; }
  });

  const historyRef = useRef<HistoryEntry[]>(history);
  historyRef.current = history;

  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchInFlightRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const nextRefreshAtRef = useRef<number>(Date.now() + 60000);

  const toggleFavorite = useCallback((pair: string) => {
    setFavorites(prev => {
      const next = prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair];
      try { localStorage.setItem('ftt_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const doFetch = useCallback(async (silent = false) => {
    if (fetchInFlightRef.current && fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    fetchInFlightRef.current = true;
    const mySeq = ++fetchSeqRef.current;
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    if (!silent) setLoading(true);
    setError(null);
    const requestedPair = selectedPair;
    try {
      const data = await fetchSignal(requestedPair, signalMode, controller.signal);
      const isMarketClosed = data?.marketStatus === 'CLOSED' && data.signal === null;
      if (!data?.marketStatus || (!data.signal && !isMarketClosed)) {
        throw new Error('Invalid response');
      }
      if (requestedPair !== selectedPair || mySeq !== fetchSeqRef.current) {
        console.warn('fetchSignal: superseded', { requestedPair, currentPair: selectedPair, mySeq, latestSeq: fetchSeqRef.current });
        return;
      }
      setSignalData(data);
      setLastUpdated(new Date());
      setRefreshCountdown(60);

      if (data.signal && ['BUY', 'SELL'].includes(data.signal.finalSignal)) {
        const workerSignalId = data.id || data.signalId;
        const bestTF = data.signal.bestTimeframe?.timeframe || '5min';
        const localKey = `local-${data.pair}-${data.signal.finalSignal}-${bestTF}-${Math.floor(Date.now() / 60000)}`;
        const historyId = workerSignalId || localKey;
        const rec = data.signal.recommendations?.[bestTF as '5min'];
        const expiryMinutes = rec?.expiry?.totalMinutes;

        if (!workerSignalId) {
          console.warn('Signal missing worker id; saving local-only entry.', { pair: data.pair, direction: data.signal.finalSignal });
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
      if (mySeq !== fetchSeqRef.current) return;
      if (e?.name === 'AbortError') {
        setError('Request timed out. Tap retry.');
      } else {
        setError('Unable to fetch signal. Tap retry.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (mySeq === fetchSeqRef.current) {
        fetchInFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [selectedPair, signalMode]);

  // Clear old signal on pair change
  useEffect(() => {
    setSignalData(null);
    setError(null);
    doFetch();
    try { localStorage.setItem('ftt_selected_pair', selectedPair); } catch {}
  }, [selectedPair]);

  // Persist history
  useEffect(() => {
    try { localStorage.setItem('ftt_history', JSON.stringify(history)); } catch {}
  }, [history]);

  // Persist signalMode
  useEffect(() => {
    try { localStorage.setItem('ftt_signal_mode', signalMode); } catch {}
  }, [signalMode]);

  // Auto-refresh loop
  useEffect(() => {
    if (!autoRefresh) return;
    nextRefreshAtRef.current = Date.now() + 60000;

    const tick = () => {
      const now = Date.now();
      const remaining = nextRefreshAtRef.current - now;
      if (remaining <= 0) {
        nextRefreshAtRef.current = now + 60000;
        setRefreshCountdown(60);
        doFetch(true);
      } else {
        setRefreshCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      }
    };

    const interval = setInterval(tick, 1000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoRefresh, doFetch]);

  const setMode = useCallback((next: 'ftt' | 'fx' | 'both') => {
    setSignalMode(next);
    try { localStorage.setItem('ftt_signal_mode', next); } catch {}
  }, []);

  return {
    selectedPair, setSelectedPair,
    signalData, setSignalData,
    loading, error, setError,
    signalMode, setMode,
    autoRefresh, setAutoRefresh,
    lastUpdated, refreshCountdown,
    favorites, setFavorites, toggleFavorite,
    history, setHistory, historyRef,
    doFetch,
  };
}
