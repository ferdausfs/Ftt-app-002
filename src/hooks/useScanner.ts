import { useState, useEffect, useRef, useCallback } from 'react';
import { SignalData } from '../types';
import { fireSignalNotification, ensureNotificationPermission } from '../utils/notify';
import { API_BASE } from '../config';
import { fetchLatestAll, pickFromLatestAll } from '../utils/signalCache';

export interface ScannerResult {
  pair: string;
  status: 'idle' | 'loading' | 'ok' | 'error';
  signal?: 'BUY' | 'SELL' | 'NEUTRAL' | 'NO_TRADE';
  confidence?: string;
  grade?: string;
  timeframe?: string;
  signalKey?: string; // unique id for this signal occurrence
  updatedAt?: number;
  // true once user has clicked into this signal — prevents re-notify for the same signalKey
  consumed?: boolean;
}

interface BatchResponse {
  batch?: boolean;
  requestedPairs?: number;
  processedPairs?: number;
  cappedAt?: number;
  invalidPairs?: string[];
  skippedPairs?: string[];
  results?: Record<string, SignalData | { error?: string; message?: string }>;
  timestamp?: string;
}

const STORAGE_KEY = 'ftt_scanner_pairs';
const SEEN_KEY = 'ftt_scanner_seen'; // map pair -> last consumed signalKey
// XAU/USD removed — the backend has no gold support and always answers
// "Invalid pair", so the scanner row was permanently stuck on `error`.
// BTC/USD replaces it: crypto, 24/7, high liquidity.
const DEFAULT_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'BTC/USD', 'EURUSD-OTC'];
const BATCH_MAX_PAIRS = 3;

function loadPairs(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_PAIRS;
  } catch {
    return DEFAULT_PAIRS;
  }
}

function loadSeen(): Record<string, string> {
  try {
    const saved = localStorage.getItem(SEEN_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
}

function normalizePairKey(pair: string) {
  return pair.toUpperCase().replace(/[\s/_-]/g, '');
}

function chunkPairs(pairList: string[], size: number) {
  const chunks: string[][] = [];
  for (let i = 0; i < pairList.length; i += size) chunks.push(pairList.slice(i, i + size));
  return chunks;
}

function cleanPairForSignal(pair: string) {
  return pair.replace(/\//g, '').toLowerCase();
}

function isBatchError(value: SignalData | { error?: string; message?: string }): value is { error?: string; message?: string } {
  return !!value && typeof value === 'object' && 'error' in value && !('signal' in value);
}

function findBatchResult(
  results: Record<string, SignalData | { error?: string; message?: string }>,
  localPair: string
) {
  const localKey = normalizePairKey(localPair);
  return Object.entries(results).find(([resultKey, value]) => {
    const keyMatches = normalizePairKey(resultKey) === localKey;
    const valuePair = typeof (value as SignalData).pair === 'string' ? (value as SignalData).pair : '';
    return keyMatches || (valuePair ? normalizePairKey(valuePair) === localKey : false);
  });
}

interface UseScannerOptions {
  onSignalClick: (pair: string) => void; // navigate to home with this pair
  intervalMs?: number;
}

export function useScanner({ onSignalClick, intervalMs = 60000 }: UseScannerOptions) {
  const [pairs, setPairs] = useState<string[]>(loadPairs);
  const [results, setResults] = useState<Record<string, ScannerResult>>({});
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(intervalMs / 1000);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('ftt_scanner_enabled') !== 'false'; } catch { return true; }
  });

  const seenRef = useRef<Record<string, string>>(loadSeen());
  const onSignalClickRef = useRef(onSignalClick);
  onSignalClickRef.current = onSignalClick;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs)); } catch {}
  }, [pairs]);

  useEffect(() => {
    try { localStorage.setItem('ftt_scanner_enabled', String(enabled)); } catch {}
  }, [enabled]);

  const addPair = useCallback((pair: string) => {
    setPairs(prev => (prev.includes(pair) ? prev : [...prev, pair]));
  }, []);

  const removePair = useCallback((pair: string) => {
    setPairs(prev => prev.filter(p => p !== pair));
    setResults(prev => {
      const next = { ...prev };
      delete next[pair];
      return next;
    });
  }, []);

  const setPairError = useCallback((pair: string) => {
    setResults(prev => ({ ...prev, [pair]: { ...prev[pair], pair, status: 'error', updatedAt: Date.now() } }));
  }, []);

  const applySignalData = useCallback((localPair: string, data: SignalData) => {
    const direction = data.signal?.finalSignal || (data.marketStatus === 'CLOSED' ? 'NO_TRADE' : undefined);
    if (!direction) {
      setPairError(localPair);
      return;
    }

    const bestTF = data.signal?.bestTimeframe?.timeframe || '5min';
    // Intentionally keep this as a local notification de-dupe key only.
    // Scanner results are not used for /api/report; reportable history IDs come from App.tsx.
    const signalKey = data.signal && ['BUY', 'SELL'].includes(direction)
      ? `${data.pair}-${direction}-${bestTF}-${Math.floor(Date.now() / 60000)}`
      : undefined;

    const result: ScannerResult = {
      pair: localPair,
      status: 'ok',
      signal: direction as ScannerResult['signal'],
      confidence: data.signal?.confidence,
      grade: data.signal?.grade?.grade,
      timeframe: data.signal ? bestTF : undefined,
      signalKey,
      updatedAt: Date.now(),
    };

    setResults(prev => ({ ...prev, [localPair]: result }));

    // Notify only for fresh BUY/SELL signals not yet seen for this pair
    if (data.signal && signalKey && ['BUY', 'SELL'].includes(direction)) {
      const lastSeen = seenRef.current[localPair];
      if (lastSeen !== signalKey) {
        fireSignalNotification(
          {
            pair: data.pair,
            direction: direction as 'BUY' | 'SELL',
            confidence: data.signal.confidence,
            timeframe: bestTF,
            grade: data.signal.grade?.grade,
          },
          () => {
            // Mark as consumed so it won't re-notify, then navigate
            seenRef.current = { ...seenRef.current, [localPair]: signalKey };
            saveSeen(seenRef.current);
            setResults(prevR => ({
              ...prevR,
              [localPair]: { ...prevR[localPair], consumed: true },
            }));
            onSignalClickRef.current(data.pair);
          }
        );
        // Mark as "shown but not yet consumed" so the in-app list can also
        // dedupe the sound on subsequent polls even before user clicks.
        seenRef.current = { ...seenRef.current, [localPair]: signalKey };
        saveSeen(seenRef.current);
      }
    }
  }, [setPairError]);

  const fetchOne = useCallback(async (pair: string) => {
    setResults(prev => ({ ...prev, [pair]: { ...prev[pair], pair, status: 'loading' } }));
    const controller = new AbortController();
    // BUG #2: 12s was too tight once backend AI validation + a slow mobile
    // network stack up. Scanner is background work, so it can wait longer.
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const cleanPair = cleanPairForSignal(pair);
      const res = await fetch(`${API_BASE}/api/signal?pair=${encodeURIComponent(cleanPair)}`, { signal: controller.signal });
      if (!res.ok) throw new Error('net');
      const data: SignalData = await res.json();
      applySignalData(pair, data);
    } catch {
      setPairError(pair);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [applySignalData, setPairError]);

  const fetchBatchGroup = useCallback(async (group: string[]) => {
    setResults(prev => {
      const next = { ...prev };
      for (const pair of group) next[pair] = { ...next[pair], pair, status: 'loading' };
      return next;
    });

    const controller = new AbortController();
    // BUG #2: /api/batch fans out to 3 pairs server-side; 12s was routinely
    // short of the p90 and showed the whole group as `error`.
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const params = new URLSearchParams({ pairs: group.join(',') });
      const res = await fetch(`${API_BASE}/api/batch?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error('batch');
      const batch: BatchResponse = await res.json();
      const batchResults = batch.results || {};
      const invalidKeys = new Set((batch.invalidPairs || []).map(normalizePairKey));
      const skippedKeys = new Set((batch.skippedPairs || []).map(normalizePairKey));
      const fallbackPairs: string[] = [];

      for (const pair of group) {
        const pairKey = normalizePairKey(pair);
        if (invalidKeys.has(pairKey) || skippedKeys.has(pairKey)) {
          fallbackPairs.push(pair);
          continue;
        }

        const matched = findBatchResult(batchResults, pair);
        if (!matched) {
          fallbackPairs.push(pair);
          continue;
        }

        const [, value] = matched;
        if (isBatchError(value)) {
          setPairError(pair);
        } else {
          applySignalData(pair, value);
        }
      }

      if (fallbackPairs.length > 0) {
        await Promise.all(fallbackPairs.map(pair => fetchOne(pair)));
      }
    } catch {
      for (const pair of group) setPairError(pair);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [applySignalData, fetchOne, setPairError]);

  const scanningRef = useRef(false);

  const scanAll = useCallback(async () => {
    if (pairs.length === 0) return;
    if (scanningRef.current) return; // prevent overlapping scans
    scanningRef.current = true;
    setScanning(true);
    try {
      // Phase 8 (§A6): one cache read covers every pair the worker already
      // scans, at zero backend cost. Whatever it does not cover (OTC, exotics,
      // anything outside SCAN_PAIRS) still goes through the existing /api/batch
      // path, so scanner behaviour is unchanged for those pairs.
      let remaining = pairs;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let all;
        try {
          all = await fetchLatestAll({ apiBase: API_BASE, signal: controller.signal });
        } finally { clearTimeout(timeoutId); }

        const uncovered: string[] = [];
        for (const pair of pairs) {
          const cached = pickFromLatestAll(all, pair);
          if (cached && cached.signal) applySignalData(pair, cached as unknown as SignalData);
          else uncovered.push(pair);
        }
        remaining = uncovered;
      } catch {
        // Cache unavailable — fall back to the original batch scan for everything.
        remaining = pairs;
      }

      if (remaining.length > 0) {
        const chunks = chunkPairs(remaining, BATCH_MAX_PAIRS);
        await Promise.all(chunks.map(group => fetchBatchGroup(group)));
      }
    } finally {
      scanningRef.current = false;
      setScanning(false);
      setCountdown(intervalMs / 1000);
    }
  }, [pairs, fetchBatchGroup, applySignalData, intervalMs]);

  // Request notification permission once on mount
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Initial scan + interval (timestamp-based so background/sleep doesn't
  // cause drift or a pile-up of missed ticks)
  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;
  const scanAllRef = useRef(scanAll);
  scanAllRef.current = scanAll;
  const nextScanAtRef = useRef<number>(Date.now() + intervalMs);

  useEffect(() => {
    if (!enabled || pairs.length === 0) return;

    nextScanAtRef.current = Date.now() + intervalMs;
    scanAllRef.current();

    const tick = () => {
      const now = Date.now();
      const remaining = nextScanAtRef.current - now;
      if (remaining <= 0) {
        nextScanAtRef.current = now + intervalMs;
        setCountdown(intervalMs / 1000);
        scanAllRef.current();
      } else {
        setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      }
    };

    const interval = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pairs.length, intervalMs]);

  // Click on a row in the scanner list — same dedupe + navigate behavior
  const handleRowClick = useCallback((pair: string) => {
    const r = results[pair];
    if (r?.signalKey) {
      seenRef.current = { ...seenRef.current, [pair]: r.signalKey };
      saveSeen(seenRef.current);
      setResults(prev => ({ ...prev, [pair]: { ...prev[pair], consumed: true } }));
    }
    onSignalClickRef.current(pair);
  }, [results]);

  return {
    pairs,
    results,
    scanning,
    countdown,
    enabled,
    setEnabled,
    addPair,
    removePair,
    scanAll,
    handleRowClick,
  };
}
