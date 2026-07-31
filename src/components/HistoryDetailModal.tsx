/**
 * History Detail Modal — premium detail view for a single signal.
 * Shows entry/exit price, time, result, grade, AI, structure, expiry.
 */

import { X } from 'lucide-react';
import { cn } from '../utils/cn';

export interface HistoryDetail {
  pair: string;
  direction: string;
  result?: string | null;
  confidence?: string;
  grade?: string;
  entryPrice?: number;
  exitPrice?: number;
  timestamp?: number;
  expiryMinutes?: number;
  timeframe?: string;
  structureVerdict?: string;
  aiStatus?: string;
  coreConfidence?: number;
  entrySource?: string;
  autoChecked?: boolean;
}

export function HistoryDetailModal({ entry, onClose }: { entry: HistoryDetail | null; onClose: () => void }) {
  if (!entry) return null;
  const isBuy = entry.direction === 'BUY';
  const isWin = entry.result === 'WIN';
  const isLoss = entry.result === 'LOSS';
  const resultColor = isWin ? '#81c784' : isLoss ? '#ef5350' : '#ffb74d';
  const resultLabel = isWin ? '✅ WIN' : isLoss ? '❌ LOSS' : '⏳ PENDING';

  // P&L calculation
  let pnl = '';
  if (entry.exitPrice && entry.entryPrice) {
    const diff = isBuy ? entry.exitPrice - entry.entryPrice : entry.entryPrice - entry.exitPrice;
    const digits = Math.abs(entry.entryPrice) >= 100 ? 2 : 5;
    pnl = (diff >= 0 ? '+' : '') + diff.toFixed(digits);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md md-bottom-sheet p-5 pb-8 slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-[#4a4a4f] mx-auto mb-4" />

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-[#27272d] flex items-center justify-center active:scale-90 transition-transform">
          <X className="w-4 h-4 text-[#b0b3b8]" />
        </button>

        {/* Header: pair + result */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isBuy ? 'bg-[#81c784]/15' : 'bg-[#ef5350]/15')}>
              <span className={cn('text-xl font-bold', isBuy ? 'text-[#81c784]' : 'text-[#ef5350]')}>{isBuy ? '▲' : '▼'}</span>
            </div>
            <div>
              <div className="text-lg font-bold">{entry.pair}</div>
              <div className="text-xs text-[#8e9099]">{entry.direction} · {entry.timeframe || 'N/A'}</div>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl text-sm font-bold" style={{ background: `${resultColor}20`, color: resultColor }}>
            {resultLabel}
          </div>
        </div>

        {/* Price section */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="md-surface-variant p-3">
            <div className="text-xs text-[#8e9099] mb-1">Entry Price</div>
            <div className="text-lg font-medium number-tabular">{entry.entryPrice?.toLocaleString() ?? '—'}</div>
          </div>
          <div className="md-surface-variant p-3">
            <div className="text-xs text-[#8e9099] mb-1">Exit Price</div>
            <div className={cn('text-lg font-medium number-tabular', isWin ? 'text-[#81c784]' : isLoss ? 'text-[#ef5350]' : '')}>
              {entry.exitPrice?.toLocaleString() ?? '—'}
            </div>
          </div>
        </div>

        {/* P&L */}
        {pnl && (
          <div className="mb-4 p-3 rounded-xl bg-[#27272d] flex items-center justify-between">
            <span className="text-xs text-[#8e9099]">Price Move</span>
            <span className={cn('text-sm font-bold number-tabular', parseFloat(pnl) >= 0 ? 'text-[#81c784]' : 'text-[#ef5350]')}>
              {pnl}
            </span>
          </div>
        )}

        {/* Details grid */}
        <div className="space-y-2">
          {entry.confidence && (
            <DetailRow label="Confidence" value={entry.confidence} />
          )}
          {entry.grade && (
            <DetailRow label="Grade" value={entry.grade} />
          )}
          {entry.coreConfidence !== undefined && (
            <DetailRow label="Core Confidence" value={`${entry.coreConfidence}%`} />
          )}
          {entry.expiryMinutes && (
            <DetailRow label="Expiry" value={`${entry.expiryMinutes} min`} />
          )}
          {entry.entrySource && (
            <DetailRow label="Data Source" value={entry.entrySource} />
          )}
          {entry.structureVerdict && entry.structureVerdict !== 'N/A' && (
            <DetailRow label="Structure" value={entry.structureVerdict} />
          )}
          {entry.aiStatus && entry.aiStatus !== 'SKIPPED' && (
            <DetailRow label="AI Status" value={entry.aiStatus} />
          )}
          {entry.autoChecked && (
            <DetailRow label="Auto-Checked" value="Yes (backend cron)" />
          )}
          {entry.timestamp && (
            <DetailRow label="Time" value={new Date(entry.timestamp).toLocaleString()} />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#3a3a3e]/50">
      <span className="text-xs text-[#8e9099]">{label}</span>
      <span className="text-xs font-medium number-tabular">{value}</span>
    </div>
  );
}
