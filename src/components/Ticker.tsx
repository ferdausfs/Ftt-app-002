import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

/**
 * Ticker — premium "market pulse" strip (UI v3).
 *
 * Shows the most recent engine signal per pair from /api/history (limit=1).
 * These are cheap KV reads — they do NOT run the engine or spend any
 * TwelveData quota, so this is safe to poll every 60s.
 *
 * Honest by design: each item shows the LAST RESOLVED signal for that pair,
 * not a live mid-price. On any failure the item degrades to "—".
 */

const TICK_PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'LINK/USD', 'EUR/USD', 'GBP/USD'];

interface TickRow {
  pair: string;
  direction?: string;   // BUY | SELL | NO_TRADE
  result?: string;      // WIN | LOSS | UNKNOWN | null
  confidence?: string;
  ts?: number;
  ok: boolean;
}

async function fetchTick(pair: string): Promise<TickRow> {
  try {
    const res = await fetch(`${API_BASE}/api/history?pair=${encodeURIComponent(pair)}&limit=1`);
    if (!res.ok) return { pair, ok: false };
    const data = await res.json();
    const row = data?.signals?.[0];
    if (!row) return { pair, ok: true };
    return {
      pair,
      direction: row.direction,
      result: row.result,
      confidence: row.confidence,
      ts: row.timestamp ? new Date(row.timestamp).getTime() : undefined,
      ok: true,
    };
  } catch {
    return { pair, ok: false };
  }
}

const REFRESH_MS = 60_000;

export function Ticker() {
  const [rows, setRows] = useState<TickRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const next = await Promise.all(TICK_PAIRS.map(fetchTick));
      if (!alive) return;
      setRows(next);
      setLoaded(true);
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const item = (r: TickRow, key: string) => {
    const dir = r.direction === 'BUY' ? '▲ BUY' : r.direction === 'SELL' ? '▼ SELL' : r.direction === 'NO_TRADE' ? '—' : '…';
    const dirColor = r.direction === 'BUY' ? '#00e676' : r.direction === 'SELL' ? '#ff5252' : '#8e9099';
    const resColor = r.result === 'WIN' ? '#00e676' : r.result === 'LOSS' ? '#ff5252' : '#55555a';
    return (
      <span key={key} className="tick-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 12, fontWeight: 600, borderRight: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 800 }}>{r.pair.split('/')[0]}</span>
        {r.ok && r.direction ? (
          <>
            <span style={{ color: dirColor }}>{dir}</span>
            {r.confidence && <span style={{ color: '#8e9099', fontSize: 10 }}>{r.confidence}</span>}
            <span style={{ width: 6, height: 6, borderRadius: 99, background: resColor, display: 'inline-block' }} />
          </>
        ) : (
          <span style={{ color: '#55555a' }}>—</span>
        )}
      </span>
    );
  };

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(255,255,255,0.015)',
      overflow: 'hidden',
    }}>
      <div className="ticker-track">
        {!loaded ? (
          <span className="tick-item" style={{ padding: '9px 16px', fontSize: 11, color: '#8e9099' }}>Loading market pulse…</span>
        ) : (
          <>
            {rows.map((r, i) => item(r, `a-${i}`))}
            {rows.map((r, i) => item(r, `b-${i}`))}
          </>
        )}
      </div>
    </div>
  );
}
