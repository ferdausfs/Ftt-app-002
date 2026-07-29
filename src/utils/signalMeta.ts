/**
 * Pure helpers for backend v6.9.2 metadata (B5 diagnostic fields, worker
 * history reconciliation, unsupported-symbol filtering).
 *
 * These live outside App.tsx purely so they can be exercised by
 * `scripts/phase5_smoke.mjs` without a DOM or a React renderer — no component
 * was moved and App.tsx remains one file.
 */

import { SignalData } from '../types';

// ── unsupported symbols ────────────────────────────────────────────────
// Gold/silver/oil were never implemented worker-side: /api/signal?pair=xauusd
// answers `{"error":true,"message":"Invalid pair..."}`. Anything still stored
// in a user's localStorage favourites from an older build is filtered on load.
export const UNSUPPORTED_PREFIXES = ['XAU', 'XAG', 'WTI', 'XPT', 'XPD'];

export function isSupportedPair(pair: unknown): pair is string {
  if (typeof pair !== 'string' || pair.length === 0) return false;
  const upper = pair.toUpperCase();
  return !UNSUPPORTED_PREFIXES.some(prefix => upper.startsWith(prefix));
}

// ── B5: entry source ───────────────────────────────────────────────────
export const ENTRY_SOURCE_LABEL: Record<string, string> = {
  FRESH_API: 'Fresh data',
  CACHE_PARTIAL: 'Partly cached',
  CACHE_ALL: 'Cached data',
};

// ── B5: AI status ──────────────────────────────────────────────────────
/**
 * Normalise the AI outcome into one short token, mirroring the worker's own
 * derivedAiStatus(): forex/crypto go through the dual-AI combiner (which
 * reports an `agreement`), OTC has a single validation with its own status.
 */
export function deriveAiStatus(data: SignalData): string | undefined {
  const ai = data.signal?.aiValidation;
  if (!ai) return undefined;
  if (ai.status === 'SKIPPED') return 'SKIPPED';
  const combined = ai.combined;
  if (!combined) {
    if (ai.status === 'OK') return ai.agrees ? 'OTC_AGREE' : 'OTC_DISAGREE';
    return ai.status || undefined;
  }
  if (combined.status === 'OK' && combined.agreement) return combined.agreement;
  return combined.status || undefined;
}

export interface AiBadge { label: string; className: string; }

/** Badge for a normalised aiStatus token, or null when not worth showing. */
export function aiStatusBadge(status?: string): AiBadge | null {
  switch (status) {
    case 'BOTH_AGREE':
      return { label: '✓ AI Consensus', className: 'bg-[#81c784]/15 text-[#81c784]' };
    case 'OTC_AGREE':
    case 'OK':
      return { label: '✓ AI OK', className: 'bg-[#81c784]/15 text-[#81c784]' };
    case 'AIs_DISAGREE':
      return { label: '⚠ AI Split', className: 'bg-[#ffb74d]/15 text-[#ffb74d]' };
    case 'OTC_DISAGREE':
      return { label: '⚠ AI Disagrees', className: 'bg-[#ffb74d]/15 text-[#ffb74d]' };
    case 'BOTH_UNAVAILABLE':
      return { label: 'AI Offline', className: 'bg-[#bdbdbd]/15 text-[#bdbdbd]' };
    case 'SKIPPED':
    default:
      return null;
  }
}

// ── worker history reconciliation ──────────────────────────────────────
/**
 * One row of GET /api/history.
 *
 * IMPORTANT: that endpoint returns an OBJECT — `{ pair, total, showing,
 * decided, pending, winRate, signals: [...] }` — not a bare array. Treating the
 * payload as an array yields zero matches and fails silently, which is exactly
 * how the old client-side auto-checker would have "worked".
 */
export interface WorkerHistoryRecord {
  id: string;
  result?: string | null;      // 'WIN' | 'LOSS' | 'UNKNOWN' | null
  exitPrice?: number | null;
  structureVerdict?: string;
  aiStatus?: string;
  coreConfidence?: number;
  entrySource?: string;
}

/**
 * Minimal shape reconcileHistory needs. Deliberately NOT an index-signature
 * type: App's HistoryEntry has narrower literal unions (result, reportStatus)
 * and must survive the round trip with its own type intact.
 */
export interface ReconcilableEntry {
  id: string;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  autoChecked?: boolean;
  reportStatus?: 'syncing' | 'synced' | 'failed';
  reportError?: string;
  structureVerdict?: string;
  aiStatus?: string;
  coreConfidence?: number;
  entrySource?: string;
}

/** Safely pull the rows out of an /api/history payload of unknown shape. */
export function extractHistoryRecords(payload: unknown): WorkerHistoryRecord[] {
  if (Array.isArray(payload)) return payload as WorkerHistoryRecord[];
  if (payload && typeof payload === 'object') {
    const signals = (payload as { signals?: unknown }).signals;
    if (Array.isArray(signals)) return signals as WorkerHistoryRecord[];
  }
  return [];
}

/**
 * Apply worker-resolved outcomes onto local history.
 *
 * Rules:
 *  - never overwrite an already-decided local entry (manual report wins)
 *  - only WIN/LOSS are applied; UNKNOWN means the worker gave up, so the row
 *    stays PENDING and the user can still report it by hand
 *  - B5 diagnostics are backfilled without clobbering values already present
 *  - returns the SAME array reference when nothing changed, so React can skip
 *    the re-render
 */
export function reconcileHistory<T extends ReconcilableEntry>(
  local: T[],
  records: WorkerHistoryRecord[],
): T[] {
  if (records.length === 0) return local;
  const byId = new Map(records.map(r => [r.id, r]));
  let changed = false;

  const next = local.map(entry => {
    if (entry.result && entry.result !== 'PENDING') return entry;
    const worker = byId.get(entry.id);
    if (!worker) return entry;
    if (worker.result !== 'WIN' && worker.result !== 'LOSS') return entry;
    changed = true;
    return {
      ...entry,
      result: worker.result as 'WIN' | 'LOSS',
      autoChecked: true,
      reportStatus: 'synced' as const,
      reportError: undefined,
      structureVerdict: entry.structureVerdict ?? worker.structureVerdict,
      aiStatus: entry.aiStatus ?? worker.aiStatus,
      coreConfidence: entry.coreConfidence ?? worker.coreConfidence,
      entrySource: entry.entrySource ?? worker.entrySource,
    } as T;
  });

  return changed ? next : local;
}
