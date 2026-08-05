/**
 * Typed API client — all backend communication in one place.
 * Replaces the scattered raw fetch() calls from App.tsx.
 */
import { SignalData } from '../types';
import { API_BASE } from '../config';

export { API_BASE };

const TIMEOUT_SIGNAL = 25000;
const TIMEOUT_HISTORY = 10000;
const TIMEOUT_SCANNER = 20000;
const TIMEOUT_STATS = 10000;
const TIMEOUT_WINDOWED = 20000;

async function fetchJson<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const linkedSignal = signal
    ? (() => { signal.addEventListener('abort', () => controller.abort()); return controller.signal; })()
    : controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: linkedSignal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanPair(pair: string): string {
  return pair.replace(/\//g, '').toLowerCase();
}

/** Fetch signal for a pair with optional mode. */
export function fetchSignal(pair: string, mode: 'ftt' | 'fx' | 'both', signal?: AbortSignal): Promise<SignalData> {
  const modeParam = mode === 'fx' || mode === 'both' ? `&mode=fx` : '';
  return fetchJson<SignalData>(
    `${API_BASE}/api/signal?pair=${encodeURIComponent(cleanPair(pair))}${modeParam}`,
    TIMEOUT_SIGNAL,
    signal,
  );
}

/** Fetch history for a pair. */
export function fetchHistory(pair: string, limit = 500, signal?: AbortSignal): Promise<unknown> {
  return fetchJson(
    `${API_BASE}/api/history?pair=${encodeURIComponent(cleanPair(pair))}&limit=${limit}`,
    TIMEOUT_HISTORY,
    signal,
  );
}

/** Report a signal result (WIN/LOSS). */
export function reportResult(id: string, result: 'WIN' | 'LOSS', signal?: AbortSignal): Promise<unknown> {
  return fetchJson(
    `${API_BASE}/api/report?id=${encodeURIComponent(id)}&result=${result}`,
    TIMEOUT_HISTORY,
    signal,
  );
}

/** Fetch stats for a single pair. */
export function fetchPairStats(pair: string, signal?: AbortSignal): Promise<unknown> {
  return fetchJson(`${API_BASE}/api/stats?pair=${encodeURIComponent(cleanPair(pair))}`, TIMEOUT_STATS, signal);
}

/** Fetch aggregate stats (all pairs). */
export function fetchAllStats(signal?: AbortSignal): Promise<unknown> {
  return fetchJson(`${API_BASE}/api/stats`, TIMEOUT_STATS, signal);
}

/** Batch scan multiple pairs. */
export function fetchBatch(pairs: string[], signal?: AbortSignal): Promise<unknown> {
  return fetchJson(
    `${API_BASE}/api/batch?pairs=${encodeURIComponent(pairs.join(','))}`,
    TIMEOUT_SCANNER,
    signal,
  );
}

/** Fetch health endpoint. */
export function fetchHealth(signal?: AbortSignal): Promise<unknown> {
  return fetchJson(`${API_BASE}/health`, TIMEOUT_STATS, signal);
}

export const TIMEOUTS = {
  signal: TIMEOUT_SIGNAL,
  history: TIMEOUT_HISTORY,
  scanner: TIMEOUT_SCANNER,
  stats: TIMEOUT_STATS,
  windowed: TIMEOUT_WINDOWED,
} as const;
