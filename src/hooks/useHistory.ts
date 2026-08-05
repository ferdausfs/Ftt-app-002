import { useEffect, useCallback, useRef } from 'react';
import { HistoryEntry } from './useSignal';
import { extractHistoryRecords, reconcileHistory } from '../utils/signalMeta';
import { reportResult, fetchHistory } from '../lib/api';

/**
 * History reconciliation hook.
 * Owns polling, reporting, and clearing — but NOT the history state itself
 * (that lives in useSignal so new signal entries are added in one place).
 */
export function useHistory(
  activeTab: string,
  history: HistoryEntry[],
  setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>,
) {
  const historyRef = useRef<HistoryEntry[]>(history);
  historyRef.current = history;

  // Poll /api/history for resolved PENDING entries
  useEffect(() => {
    if (activeTab !== 'history') return;
    let cancelled = false;
    const controllers = new Set<AbortController>();

    const pollHistory = async () => {
      const pending = historyRef.current.filter(h => !h.result || h.result === 'PENDING');
      if (pending.length === 0) return;
      const pairs = Array.from(new Set(pending.map(h => h.pair)));

      for (const pair of pairs) {
        if (cancelled) return;
        const controller = new AbortController();
        controllers.add(controller);
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const data = await fetchHistory(pair, 500, controller.signal);
          const records = extractHistoryRecords(data);
          if (records.length === 0 || cancelled) continue;
          setHistory(prev => reconcileHistory(prev, records));
        } catch { /* next cycle retries */ }
        finally {
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
  }, [activeTab, setHistory]);

  const handleReport = useCallback(async (id: string, result: 'WIN' | 'LOSS') => {
    const entry = historyRef.current.find(h => h.id === id);
    if (!entry) return;

    if (entry.reportable === false) {
      console.warn('Skipping report for local-only signal.', { id, result, pair: entry.pair });
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, reportStatus: 'failed' as const,
        reportError: 'Server report unavailable: this history item has no worker signal ID.',
      } : h));
      return;
    }

    setHistory(prev => prev.map(h => h.id === id ? {
      ...h, result, reportStatus: 'syncing' as const, reportError: undefined,
    } : h));

    try {
      await reportResult(id, result);
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, reportStatus: 'synced' as const, reportError: undefined,
      } : h));
    } catch (e) {
      console.warn('Failed to report signal result.', { id, result, error: e });
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, reportStatus: 'failed' as const,
        reportError: 'Server sync failed. Result saved locally only.',
      } : h));
    }
  }, [setHistory]);

  const clearHistory = useCallback(() => {
    if (confirm('Clear all local history? This only removes entries from your device — server-side results are unaffected.')) {
      setHistory([]);
    }
  }, [setHistory]);

  return { handleReport, clearHistory };
}
