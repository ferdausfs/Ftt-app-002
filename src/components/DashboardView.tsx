import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ArrowUp, ArrowDown, Minus, LayoutGrid, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '../utils/cn';
import { API_BASE } from '../config';

/**
 * DashboardView — "Board" tab (UI v3 premium).
 *
 * Every pair at a glance: latest signal direction + confidence (from
 * /api/history?limit=1) and the pair's lifetime server win rate + sample
 * size (from /api/stats). Both are cheap KV reads — no engine run, no
 * TwelveData quota spend.
 *
 * Honesty rules baked in:
 *  - every win rate ships with its sample size n
 *  - "LIVE" badge only when the last signal is < 15 min old
 *  - a "no-move" flag when a LOSS had |entry − exit| ≈ 0 (feed artifact)
 *  - a breakeven note so WR is never read as profit
 */

export interface DashPair {
  pair: string;
  direction?: string;
  confidence?: string;
  result?: string;
  ts?: number;
  entryPrice?: number;
  exitPrice?: number;
  stats?: { wins: number; losses: number; total: number; winRate: number };
  ok: boolean;
  statsOk: boolean;
}

const BOARD_PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'DOGE/USD', 'LINK/USD', 'ADA/USD', 'AVAX/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY'];

const CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_MS = 15 * 60 * 1000;

let cache: { at: number; data: DashPair[] } | null = null;

async function fetchPair(pair: string): Promise<DashPair> {
  const out: DashPair = { pair, ok: false, statsOk: false };
  try {
    const [histRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/api/history?pair=${encodeURIComponent(pair)}&limit=1`),
      fetch(`${API_BASE}/api/stats?pair=${encodeURIComponent(pair)}`),
    ]);

    if (histRes.ok) {
      try {
        const h = await histRes.json();
        const row = h?.signals?.[0];
        if (row) {
          out.direction = row.direction;
          out.result = row.result;
          out.confidence = row.confidence;
          out.entryPrice = row.entryPrice;
          out.exitPrice = row.exitPrice;
          out.ts = row.timestamp ? new Date(row.timestamp).getTime() : undefined;
        }
      } catch { /* keep partial */ }
      out.ok = true;
    }

    if (statsRes.ok) {
      try {
        const s = await statsRes.json();
        // Live contract: ?pair=X → { pair, stats: { wins, losses, totalSignals, winRate, ... } }.
        // Accept a flat legacy shape too, and ignore error payloads ({error:true}).
        const st = s && typeof s === 'object'
          ? (s.stats && typeof s.stats === 'object' ? s.stats : s)
          : null;
        if (st && 'winRate' in st) {
          const wins = Number(st.wins) || 0;
          const losses = Number(st.losses) || 0;
          out.stats = {
            wins,
            losses,
            total: Number(st.totalSignals) || (wins + losses),
            winRate: Number(st.winRate) || 0,
          };
          out.statsOk = true;
        }
      } catch { /* keep partial */ }
    }
  } catch { /* out stays failure */ }
  return out;
}

async function loadBoard(force: boolean): Promise<DashPair[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await Promise.all(BOARD_PAIRS.map(fetchPair));
  cache = { at: Date.now(), data };
  return data;
}

/** A LOSS whose entry price equals its exit price ≈ worker tie convention → feed artifact, not a real loss edge. */
function isNoMove(p: DashPair): boolean {
  return p.result === 'LOSS'
    && typeof p.entryPrice === 'number'
    && typeof p.exitPrice === 'number'
    && Math.abs(p.entryPrice - p.exitPrice) < 1e-9;
}

function sortPairs(list: DashPair[]): DashPair[] {
  return [...list].sort((a, b) => {
    const aLive = a.ts !== undefined && Date.now() - a.ts < LIVE_MS ? 1 : 0;
    const bLive = b.ts !== undefined && Date.now() - b.ts < LIVE_MS ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    const aw = a.statsOk ? a.stats!.winRate : -1;
    const bw = b.statsOk ? b.stats!.winRate : -1;
    return bw - aw;
  });
}

interface Props {
  onPairSelect?: (pair: string) => void;
}

export function DashboardView({ onPairSelect }: Props) {
  const [pairs, setPairs] = useState<DashPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const run = useCallback(async (force: boolean) => {
    if (!force && pairs.length > 0) return;
    setLoading(true);
    try {
      const data = await loadBoard(force);
      setPairs(sortPairs(data));
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [pairs.length]);

  useEffect(() => { run(false); }, [run]);

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const skeleton = Array.from({ length: 6 }, (_, i) => (
    <div key={i} className="h-[118px] rounded-[20px] shimmer" style={{ background: '#1e1e23' }} />
  ));

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(77,208,225,0.12)' }}>
            <LayoutGrid className="w-4 h-4 text-[#4dd0e1]" />
          </div>
          <div>
            <div className="text-sm font-medium">Board · All Pairs</div>
            <div className="text-[10px] text-[#8e9099] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {updatedAt ? `updated ${fmtTime(updatedAt)}` : '…'}
            </div>
          </div>
        </div>
        <button
          onClick={() => run(true)}
          disabled={loading}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <RefreshCw className={cn('w-4 h-4 text-[#b0b3b8]', loading && 'animate-spin')} />
        </button>
      </div>

      {loading && pairs.length === 0 ? (
        <div className="grid grid-cols-2 gap-2.5">{skeleton}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {pairs.map(p => {
            const isBuy = p.direction === 'BUY';
            const isSell = p.direction === 'SELL';
            const live = p.ts !== undefined && Date.now() - p.ts < LIVE_MS;
            const noMove = isNoMove(p);
            const wr = p.statsOk ? Math.round(p.stats!.winRate * 1000) / 10 : null;
            const n = p.statsOk ? p.stats!.total : null;
            return (
              <div
                key={p.pair}
                onClick={() => p.direction === 'BUY' || p.direction === 'SELL' ? onPairSelect?.(p.pair) : undefined}
                className={cn(
                  'rounded-[20px] p-3 transition-transform',
                  (isBuy || isSell) ? 'active:scale-[0.97] cursor-pointer' : '',
                )}
                style={{
                  background: 'rgba(30,30,35,0.9)',
                  border: live ? '1px solid rgba(77,208,225,0.45)' : '1px solid rgba(255,255,255,0.05)',
                  boxShadow: live ? '0 8px 22px -12px rgba(77,208,225,0.5)' : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[13px]">{p.pair}</span>
                  {live && (
                    <span className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(77,208,225,0.15)', color: '#4dd0e1' }}>
                      LIVE
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1.5">
                  {isBuy && <ArrowUp className="w-3.5 h-3.5 text-[#00e676]" />}
                  {isSell && <ArrowDown className="w-3.5 h-3.5 text-[#ff5252]" />}
                  {!isBuy && !isSell && <Minus className="w-3.5 h-3.5 text-[#8e9099]" />}
                  <span className={cn('font-black text-[13px]', isBuy ? 'text-[#00e676]' : isSell ? 'text-[#ff5252]' : 'text-[#8e9099]')}>
                    {p.direction ?? '…'}
                  </span>
                  {p.confidence && <span className="text-[10px] text-[#8e9099] font-bold number-tabular">{p.confidence}</span>}
                </div>

                {/* mini win-rate bar */}
                <div className="h-[5px] rounded-full mt-2.5 mb-1.5" style={{ background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${wr ?? 0}%`,
                      background: wr !== null && wr >= 50 ? 'linear-gradient(90deg,#26a69a,#4dd0e1)' : 'linear-gradient(90deg,#8a4a3a,#c25b45)',
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#8e9099] number-tabular">
                  <span>
                    {p.ok ? (
                      <>WR <b style={{ color: '#e3e2e6' }}>{wr !== null ? `${wr}%` : '—'}</b> · n={n ?? '—'}</>
                    ) : (
                      <span style={{ color: '#ffb4ab' }}>offline</span>
                    )}
                  </span>
                  {noMove && (
                    <span className="inline-flex items-center gap-0.5" style={{ color: '#ffb74d' }}>
                      <AlertTriangle className="w-2.5 h-2.5" /> tie
                    </span>
                  )}
                  {p.result && !noMove && (
                    <span style={{ color: p.result === 'WIN' ? '#00e676' : p.result === 'LOSS' ? '#ff5252' : '#55555a' }}>
                      {p.result}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-2xl p-3" style={{ border: '1px solid rgba(245,192,68,0.35)', background: 'rgba(245,192,68,0.06)' }}>
        <div className="text-[10px] leading-relaxed" style={{ color: '#e8d9a8' }}>
          <b style={{ color: '#f5c044' }}>⚖ Read honestly:</b> win rate ≠ profit — at 80% payout, breakeven is 55.6%.
          Small n means small evidence; “LIVE” = last signal under 15 min old; “tie” = entry ≈ exit (feed artifact, not an edge).
          Server WR is lifetime (no 50-row cap). We never show a win rate we can't defend.
        </div>
      </div>
    </div>
  );
}
