/**
 * Server Win Rate filtering — pure logic (Phase 6).
 *
 * Kept out of App.tsx so the aggregation and date-window maths can be tested
 * without a DOM (see `scripts/phase6_smoke.mjs`). No component was moved;
 * App.tsx remains a single file.
 *
 * ── Data-coverage caveat, verified live 2026-07-29 ──────────────────────────
 * The worker keeps only MAX_SIGNALS_PER_PAIR = 500 history rows per pair and
 * `/api/history` supports no pagination (`offset`/`cursor`/`page` are ignored;
 * `limit` is capped at 50). So a windowed count derived from history is exact
 * only when the pair's oldest retained row predates the window cutoff.
 * For a busy pair (BTC/USD retains ~24h) a "Last 7 Days" figure is a LOWER
 * BOUND. `computeCoverage()` detects this and the UI labels it, rather than
 * printing a truncated number as if it were the truth.
 */

import { extractHistoryRecords, WorkerHistoryRecord } from './signalMeta';

export type PairScope = 'all' | 'selected';
export type TimeRange = 'all' | 'today' | '7d';

export interface ServerWrFilter {
  pairScope: PairScope;
  timeRange: TimeRange;
}

export const DEFAULT_SERVER_WR_FILTER: ServerWrFilter = {
  pairScope: 'selected',
  timeRange: 'all',
};

export const SERVER_WR_FILTER_KEY = 'ftt_server_wr_filter';

const PAIR_SCOPES: PairScope[] = ['all', 'selected'];
const TIME_RANGES: TimeRange[] = ['all', 'today', '7d'];

/** Parse persisted filter defensively — a hand-edited or stale value must not crash the tab. */
export function parseServerWrFilter(raw: unknown): ServerWrFilter {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return { ...DEFAULT_SERVER_WR_FILTER }; }
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_SERVER_WR_FILTER };
  const v = value as Partial<ServerWrFilter>;
  return {
    pairScope: PAIR_SCOPES.includes(v.pairScope as PairScope)
      ? (v.pairScope as PairScope) : DEFAULT_SERVER_WR_FILTER.pairScope,
    timeRange: TIME_RANGES.includes(v.timeRange as TimeRange)
      ? (v.timeRange as TimeRange) : DEFAULT_SERVER_WR_FILTER.timeRange,
  };
}

export function sameFilter(a?: ServerWrFilter | null, b?: ServerWrFilter | null): boolean {
  if (!a || !b) return false;
  return a.pairScope === b.pairScope && a.timeRange === b.timeRange;
}

export function filterCacheKey(filter: ServerWrFilter, selectedPair: string): string {
  // selected-pair scope is pair-specific; "all" scope is not
  return filter.pairScope === 'selected'
    ? `selected:${selectedPair}:${filter.timeRange}`
    : `all:${filter.timeRange}`;
}

/**
 * Start of the window, in epoch ms. `today` uses LOCAL midnight (the user's
 * day, not UTC's) — deliberate: "Today" should mean today where the user is.
 */
export function windowCutoff(timeRange: TimeRange, now: number = Date.now()): number {
  if (timeRange === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (timeRange === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export const TIME_RANGE_LABEL: Record<TimeRange, string> = {
  all: 'All time',
  today: 'Today',
  '7d': 'Last 7 days',
};

/** Card subtitle for the active filter (spec §4.3). */
export function filterSubtitle(filter: ServerWrFilter, selectedPair: string): string {
  const scope = filter.pairScope === 'all' ? 'All pairs' : selectedPair;
  if (filter.pairScope === 'selected' && filter.timeRange === 'all') {
    return `All users · ${selectedPair}`;   // preserve the existing wording
  }
  return `${scope} · ${TIME_RANGE_LABEL[filter.timeRange]}`;
}

// ── /api/stats aggregation ─────────────────────────────────────────────
export interface StatsPairRow {
  pair: string;
  wins?: number;
  losses?: number;
  totalSignals?: number;
  winRate?: number;
  lastUpdated?: string;
}

export interface AggregateResult {
  totalWins: number;
  totalLosses: number;
  totalSignals: number;   // decided count (wins + losses)
  winRate: number;        // 0..1
  pairCount: number;
  lastUpdated?: string;
}

/**
 * All Pairs + All Time, from `/api/stats` (no pair).
 *
 * WR denominator is wins+losses (decided only), per the spec's "prefer
 * decided-only for WR honesty". Note: live data shows totalSignals ALWAYS
 * equals wins+losses for every pair, i.e. the worker's `totalSignals` counter
 * is only incremented for decided results — UNKNOWN never lands in stats at
 * all (updatePairStats early-returns on UNKNOWN). So the two are identical
 * today; using wins+losses keeps that true even if the worker changes.
 */
export function aggregateAllPairs(pairs: StatsPairRow[]): AggregateResult {
  let totalWins = 0;
  let totalLosses = 0;
  let latest: number | null = null;
  let pairCount = 0;

  for (const p of pairs) {
    const w = Number(p?.wins) || 0;
    const l = Number(p?.losses) || 0;
    totalWins += w;
    totalLosses += l;
    if (w + l > 0) pairCount++;
    if (p?.lastUpdated) {
      const t = new Date(p.lastUpdated).getTime();
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
  }

  const decided = totalWins + totalLosses;
  return {
    totalWins,
    totalLosses,
    totalSignals: decided,
    winRate: decided > 0 ? totalWins / decided : 0,
    pairCount,
    lastUpdated: latest !== null ? new Date(latest).toISOString() : undefined,
  };
}

// ── history-derived windowed counts ────────────────────────────────────
export interface WindowedCount {
  wins: number;
  losses: number;
  decided: number;
  recordsConsidered: number;
  /** false when the 50-row cap may hide older rows inside the window. */
  complete: boolean;
}

/**
 * Count decided results at or after `cutoff` in one pair's history payload.
 *
 * `complete` is false when the response is at the 50-row cap AND the oldest
 * retained row is itself newer than the cutoff — meaning rows inside the
 * window have already been evicted, so the count is a lower bound.
 */
export function countWindowed(payload: unknown, cutoff: number): WindowedCount {
  const records = extractHistoryRecords(payload) as Array<WorkerHistoryRecord & { timestamp?: string }>;
  let wins = 0;
  let losses = 0;
  let considered = 0;
  let oldest: number | null = null;

  for (const r of records) {
    const ts = r?.timestamp ? new Date(r.timestamp).getTime() : NaN;
    if (!Number.isNaN(ts)) {
      if (oldest === null || ts < oldest) oldest = ts;
    }
    if (Number.isNaN(ts) || ts < cutoff) continue;
    considered++;
    if (r.result === 'WIN') wins++;
    else if (r.result === 'LOSS') losses++;
  }

  const atCap = records.length >= HISTORY_ROW_CAP;
  const complete = cutoff === 0
    ? !atCap                                   // "all time" is only exact below the cap
    : !(atCap && oldest !== null && oldest > cutoff);

  return { wins, losses, decided: wins + losses, recordsConsidered: considered, complete };
}

/** Worker-side MAX_SIGNALS_PER_PAIR; /api/history cannot return more than this. */
export const HISTORY_ROW_CAP = 500;

export interface CoverageSummary {
  complete: boolean;
  truncatedPairs: string[];
}

/** Merge per-pair windowed counts into one aggregate plus a coverage verdict. */
export function combineWindowed(
  entries: Array<{ pair: string; count: WindowedCount | null }>,
): AggregateResult & { coverage: CoverageSummary; recordsConsidered: number } {
  let totalWins = 0;
  let totalLosses = 0;
  let recordsConsidered = 0;
  let pairCount = 0;
  const truncatedPairs: string[] = [];

  for (const { pair, count } of entries) {
    if (!count) continue;
    totalWins += count.wins;
    totalLosses += count.losses;
    recordsConsidered += count.recordsConsidered;
    if (!count.complete) truncatedPairs.push(pair);
    if (count.decided > 0) pairCount++;
  }

  const decided = totalWins + totalLosses;
  return {
    totalWins,
    totalLosses,
    totalSignals: decided,
    winRate: decided > 0 ? totalWins / decided : 0,
    pairCount,
    recordsConsidered,
    coverage: { complete: truncatedPairs.length === 0, truncatedPairs },
  };
}
