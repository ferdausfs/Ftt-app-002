/**
 * Phase 8 — client side of the Phase 7 unified worker cache.
 *
 * Pure logic only (no React, no DOM) so the routing, fallback and timer maths
 * can be tested headlessly in `scripts/phase8_smoke.mjs`. App.tsx stays one file.
 *
 * ── Endpoint contract, verified live 2026-07-29 ─────────────────────────────
 *   GET /api/signals/latest?pair=X
 *     200 -> full signal + { cached:true, generatedAt, generationAge,
 *                            nextRefreshIn, generationId, stale:false }
 *     404 -> { error:true, stale:true, scanned:<bool> }  (never scanned/expired)
 *     400 -> invalid pair
 *   GET /api/signal?pair=X
 *     200 -> full signal + { cached:false, forceRefresh:true }
 *
 * `nextRefreshIn` was measured against two real cron boundaries: it counts down
 * to ~0 exactly as a new generationId appears, so it is safe to drive the
 * auto-refresh timer from it.
 */

import { SignalData } from '../types';

export type SignalSource = 'cache' | 'fresh' | 'cache_miss_fallback';

/** Cache metadata the worker adds on top of a normal signal payload. */
export interface CacheMeta {
  cached?: boolean;
  generatedAt?: string;
  generationAge?: number;   // seconds since generation
  nextRefreshIn?: number;   // seconds until the next scheduled scan
  generationId?: string;
  opportunistic?: boolean;  // warmed by a user request, not by the cron
  stale?: boolean;
  forceRefresh?: boolean;
  /** set by this client, not the worker */
  fallback?: 'cache_miss';
  source?: SignalSource;
}

export type CachedSignalData = SignalData & CacheMeta;

/** Worker default when nextRefreshIn is missing — matches SCAN_INTERVAL. */
export const DEFAULT_REFRESH_SECONDS = 60;
export const SCAN_INTERVAL_SECONDS = 300;
/** Small buffer so we never poll a fraction of a second before the scan lands. */
export const REFRESH_BUFFER_MS = 3000;

export function cleanPairForApi(pair: string): string {
  return pair.replace(/\//g, '').toLowerCase();
}

/**
 * How long to wait before the next automatic fetch.
 *
 * Driven by the server's own countdown so the App wakes up just after a new
 * generation lands instead of on an arbitrary 60s tick. Falls back to the old
 * fixed interval whenever the field is missing or nonsensical, so a worker
 * change can never leave the App without a refresh loop.
 */
export function computeRefreshDelayMs(
  nextRefreshIn: unknown,
  fallbackSeconds: number = DEFAULT_REFRESH_SECONDS,
): number {
  const n = typeof nextRefreshIn === 'number' && Number.isFinite(nextRefreshIn)
    ? nextRefreshIn
    : NaN;
  if (Number.isNaN(n)) return fallbackSeconds * 1000;
  // Guard both ends: never hammer (<5s) and never sleep past one scan cycle.
  const clamped = Math.min(Math.max(n, 5), SCAN_INTERVAL_SECONDS);
  return clamped * 1000 + REFRESH_BUFFER_MS;
}

/** "4m 13s" / "47s" — for the freshness pill countdown. */
export function formatCountdown(seconds: unknown): string {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
  if (s === null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/** "Generated 47s ago" / "Generated 2m 5s ago". */
export function formatAge(seconds: unknown): string {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
  if (s === null) return 'just now';
  if (s < 5) return 'just now';
  return `${formatCountdown(s)} ago`;
}

export interface FreshnessBadge {
  kind: 'cached' | 'live' | 'on_demand';
  label: string;
  detail: string | null;
  className: string;
}

/**
 * What the freshness pill should say (spec §A.5).
 *  - cron cache      -> "Generated 47s ago" + next-refresh countdown
 *  - fresh generation-> "LIVE — just generated"
 *  - cache miss      -> amber "On-demand — pair not in scheduled scan"
 */
export function freshnessBadge(data: CachedSignalData | null): FreshnessBadge | null {
  if (!data) return null;

  if (data.fallback === 'cache_miss' || data.source === 'cache_miss_fallback') {
    return {
      kind: 'on_demand',
      label: 'On-demand',
      detail: 'pair not in scheduled scan',
      className: 'bg-[#ffb74d]/15 text-[#ffb74d]',
    };
  }
  if (data.cached === true) {
    return {
      kind: 'cached',
      label: `Generated ${formatAge(data.generationAge)}`,
      detail: typeof data.nextRefreshIn === 'number'
        ? `Next refresh in ${formatCountdown(data.nextRefreshIn)}`
        : null,
      className: 'bg-[#42a5f5]/15 text-[#42a5f5]',
    };
  }
  return {
    kind: 'live',
    label: 'LIVE',
    detail: 'just generated',
    className: 'bg-[#ef5350]/15 text-[#ef5350]',
  };
}

export interface FetchDeps {
  apiBase: string;
  signal?: AbortSignal;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
}

export interface FetchOutcome {
  data: CachedSignalData;
  source: SignalSource;
}

/**
 * Normal view: read the cron cache, fall back to a fresh run only when the pair
 * is not cached (404). Any other status is a real error and is thrown so the
 * existing error UI handles it.
 */
export async function fetchCachedSignal(pair: string, deps: FetchDeps): Promise<FetchOutcome> {
  const f = deps.fetchImpl || fetch;
  const clean = cleanPairForApi(pair);

  const cacheRes = await f(
    `${deps.apiBase}/api/signals/latest?pair=${encodeURIComponent(clean)}`,
    { signal: deps.signal },
  );

  if (cacheRes.ok) {
    const data = await cacheRes.json();
    // Defensive: a 200 that somehow carries no signal is treated as a miss
    // rather than rendered as an empty card.
    if (data && data.signal) {
      return { data: { ...data, source: 'cache' }, source: 'cache' };
    }
  } else if (cacheRes.status !== 404) {
    throw new Error(`HTTP ${cacheRes.status}`);
  }

  // 404 (never scanned / expired) or a 200 without a signal -> generate fresh
  const freshRes = await f(
    `${deps.apiBase}/api/signal?pair=${encodeURIComponent(clean)}`,
    { signal: deps.signal },
  );
  if (!freshRes.ok) throw new Error(`HTTP ${freshRes.status}`);
  const fresh = await freshRes.json();
  return {
    data: { ...fresh, cached: false, fallback: 'cache_miss', source: 'cache_miss_fallback' },
    source: 'cache_miss_fallback',
  };
}

/** Force Refresh: always a fresh engine run, never the cache. */
export async function fetchFreshSignal(pair: string, deps: FetchDeps): Promise<FetchOutcome> {
  const f = deps.fetchImpl || fetch;
  const clean = cleanPairForApi(pair);
  const res = await f(
    `${deps.apiBase}/api/signal?pair=${encodeURIComponent(clean)}`,
    { signal: deps.signal },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { data: { ...data, cached: false, source: 'fresh' }, source: 'fresh' };
}

// ── scanner support ────────────────────────────────────────────────────
export interface LatestAllResponse {
  signals?: Record<string, CachedSignalData>;
  pairCount?: number;
  scannedPairs?: string[];
  oldestCachedAge?: number;
  newestCachedAge?: number;
}

/**
 * Pull the whole cache in one request (spec §A6). One round trip replaces the
 * scanner's per-group /api/batch calls for every pair the cron already covers.
 */
export async function fetchLatestAll(deps: FetchDeps): Promise<LatestAllResponse> {
  const f = deps.fetchImpl || fetch;
  const res = await f(`${deps.apiBase}/api/signals/latest`, { signal: deps.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data && typeof data === 'object' ? data : {};
}

/** Case/format-insensitive lookup into the all-pairs map ("BTCUSD" -> "BTC/USD"). */
export function pickFromLatestAll(
  all: LatestAllResponse,
  pair: string,
): CachedSignalData | null {
  const signals = all && all.signals;
  if (!signals) return null;
  if (signals[pair]) return signals[pair];
  const want = pair.toUpperCase().replace(/[^A-Z]/g, '');
  for (const key of Object.keys(signals)) {
    if (key.toUpperCase().replace(/[^A-Z]/g, '') === want) return signals[key];
  }
  return null;
}
