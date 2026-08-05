import { useEffect, useState } from 'react';
import { Activity, KeyRound, Gauge } from 'lucide-react';
import { API_BASE } from '../config';
import { WorkerHealth } from '../types';

/**
 * Small worker-health readout for the Settings tab: how many TwelveData keys the
 * worker actually loaded, and how many API calls it has spent today.
 *
 * Both numbers come from backend v6.9.2's extended /health payload
 * (`apiKeysLoaded`, `quotaUsedToday`). Renders nothing if /health is
 * unreachable — this is diagnostics, never a blocker.
 */
export function HealthPill() {
  const [health, setHealth] = useState<WorkerHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        if (!res.ok) return;
        const data: WorkerHealth = await res.json();
        if (!cancelled) setHealth(data);
      } catch {
        // silent — diagnostics only
      } finally {
        clearTimeout(timeoutId);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!health) return null;

  const keys = health.apiKeysLoaded;
  const quota = health.quotaUsedToday;

  return (
    <div className="md-surface overflow-hidden mb-4">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--c-buy)]/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-[var(--c-buy)]" />
          </div>
          <div>
            <div className="font-medium text-sm">Worker Health</div>
            <div className="text-xs text-[#b0b3b8]">
              {health.status === 'healthy' ? 'Online' : health.status || 'Unknown'}
              {health.version ? ` · v${health.version}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1e1e23] rounded-full">
            <KeyRound className="w-3 h-3 text-[var(--c-info)]" />
            <span className="text-xs text-[#b0b3b8] number-tabular">
              {typeof keys === 'number' ? keys : '—'} keys
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1e1e23] rounded-full">
            <Gauge className="w-3 h-3 text-[var(--c-warn)]" />
            <span className="text-xs text-[#b0b3b8] number-tabular">
              {typeof quota === 'number' ? quota.toLocaleString() : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
