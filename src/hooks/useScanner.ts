import { useState, useEffect, useRef, useCallback } from 'react';
import { SignalData } from '../types';
import { fireSignalNotification, ensureNotificationPermission } from '../utils/notify';

const API_BASE = 'https://fttotcv6.umuhammadiswa.workers.dev';

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

const STORAGE_KEY = 'ftt_scanner_pairs';
const SEEN_KEY = 'ftt_scanner_seen'; // map pair -> last consumed signalKey
const DEFAULT_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'EURUSD-OTC'];

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

  const fetchOne = useCallback(async (pair: string) => {
    setResults(prev => ({ ...prev, [pair]: { ...prev[pair], pair, status: 'loading' } }));
    try {
      const cleanPair = pair.replace('/', '').toLowerCase();
      const res = await fetch(`${API_BASE}/api/signal?pair=${cleanPair}`);
      if (!res.ok) throw new Error('net');
      const data: SignalData = await res.json();
      if (!data?.signal) throw new Error('invalid');

      const direction = data.signal.finalSignal;
      const bestTF = data.signal.bestTimeframe?.timeframe || '5min';
      const signalKey = ['BUY', 'SELL'].includes(direction)
        ? `${data.pair}-${direction}-${bestTF}-${Math.floor(Date.now() / 60000)}`
        : undefined;

      const result: ScannerResult = {
        pair,
        status: 'ok',
        signal: direction,
        confidence: data.signal.confidence,
        grade: data.signal.grade?.grade,
        timeframe: bestTF,
        signalKey,
        updatedAt: Date.now(),
      };

      setResults(prev => ({ ...prev, [pair]: result }));

      // Notify only for fresh BUY/SELL signals not yet seen for this pair
      if (signalKey && ['BUY', 'SELL'].includes(direction)) {
        const lastSeen = seenRef.current[pair];
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
              seenRef.current = { ...seenRef.current, [pair]: signalKey };
              saveSeen(seenRef.current);
              setResults(prevR => ({
                ...prevR,
                [pair]: { ...prevR[pair], consumed: true },
              }));
              onSignalClickRef.current(data.pair);
            }
          );
          // Mark as "shown but not yet consumed" so the in-app list can also
          // dedupe the sound on subsequent polls even before user clicks.
          seenRef.current = { ...seenRef.current, [pair]: signalKey };
          saveSeen(seenRef.current);
        }
      }
    } catch {
      setResults(prev => ({ ...prev, [pair]: { ...prev[pair], pair, status: 'error', updatedAt: Date.now() } }));
    }
  }, []);

  const scanAll = useCallback(async () => {
    if (pairs.length === 0) return;
    setScanning(true);
    // sequential to be gentle on the API
    for (const pair of pairs) {
      await fetchOne(pair);
    }
    setScanning(false);
    setCountdown(intervalMs / 1000);
  }, [pairs, fetchOne, intervalMs]);

  // Request notification permission once on mount
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Initial scan + interval
  useEffect(() => {
    if (!enabled) return;
    scanAll();
    const interval = setInterval(() => {
      setCountdown(s => {
        if (s <= 1) {
          scanAll();
          return intervalMs / 1000;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, JSON.stringify(pairs), intervalMs]);

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
