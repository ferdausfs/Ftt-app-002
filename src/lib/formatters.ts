/**
 * Formatting utilities extracted from App.tsx.
 * Pure functions — no React, no DOM, fully testable.
 */
import { SignalData } from '../types';

/** Format server win rate (accepts 0..1 ratio or already-scaled percentage). */
export function formatServerWinRate(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

/** Extract crypto pair from the `cryptoAlternative` string e.g. "Try /api/signal?pair=BTC/USD" → "BTC/USD". */
export function getCryptoAlternativePair(data: SignalData): string {
  const fallback = 'BTC/USD';
  const alt = data.cryptoAlternative || '';
  const match = alt.match(/pair=([^\s&]+)/i) || alt.match(/([A-Z]{3,5}\/[A-Z]{3,5}|[A-Z]{6,10})/i);
  const raw = match?.[1];
  if (!raw) return fallback;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep raw */ }
  const cleaned = decoded.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (cleaned.includes('/')) return cleaned;
  if (cleaned.length === 6) return `${cleaned.slice(0, 3)}/${cleaned.slice(3)}`;
  return fallback;
}

/** Format a Date to a locale time string, or null if invalid. */
export function formatTimeLabel(dateLike?: string | null): string | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Format epoch ms to HH:MM. */
export function formatHourMinute(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
