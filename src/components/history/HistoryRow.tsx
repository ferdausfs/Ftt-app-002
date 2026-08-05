import { useState, useRef } from 'react';
import { cn } from '../../utils/cn';
import { HistoryEntry } from '../../hooks/useSignal';

interface HistoryRowProps {
  entry: HistoryEntry;
  onReport: (id: string, result: 'WIN' | 'LOSS') => void;
  onDelete: (id: string) => void;
  onDetail: (entry: HistoryEntry) => void;
}

export function HistoryRow({ entry, onReport, onDelete, onDetail }: HistoryRowProps) {
  const isBuy = entry.direction === 'BUY';
  const isPending = !entry.result || entry.result === 'PENDING';
  const isReportable = entry.reportable !== false;
  const expiryPassed = entry.expiryTime && entry.expiryTime <= Date.now();
  const [pressing, setPressing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    setPressing(true);
    pressTimer.current = setTimeout(() => { setPressing(false); setConfirmDelete(true); if (navigator.vibrate) navigator.vibrate(40); }, 550);
  };
  const cancelPress = () => { setPressing(false); if (pressTimer.current) clearTimeout(pressTimer.current); };

  const resultColor = entry.result === 'WIN' ? '#00e676' : entry.result === 'LOSS' ? '#ff5252' : '#ffb74d';
  const resultBg = entry.result === 'WIN' ? 'rgba(0,230,118,0.04)' : entry.result === 'LOSS' ? 'rgba(255,82,82,0.04)' : 'rgba(var(--rgb-warn),0.03)';
  const resultLabel = entry.result === 'WIN' ? '✅ WIN' : entry.result === 'LOSS' ? '❌ LOSS' : '⏳';
  const dirColor = isBuy ? '#00e676' : '#ff5252';

  if (confirmDelete) {
    return (
      <div className="p-4 flex items-center justify-between gap-3 rounded-2xl mb-1" style={{ background: 'rgba(255,82,82,0.08)' }}>
        <span className="text-xs text-[#ff5252] font-medium">Delete this signal?</span>
        <div className="flex gap-2">
          <button onClick={() => onDelete(entry.id)} className="px-3 py-1.5 rounded-xl text-white text-[10px] font-bold active:scale-95 transition-transform" style={{ background: '#ff5252' }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform" style={{ background: 'rgba(255,255,255,0.05)' }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("p-3.5 mb-1 cursor-pointer active:scale-[0.98] transition-transform", pressing && "scale-[0.98]")}
      style={{ borderRadius: 16, background: resultBg, border: `1px solid rgba(255,255,255,0.04)`, borderLeft: `3px solid ${resultColor}` }}
      onClick={() => { if (!confirmDelete) onDetail(entry); }}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
    >
      {/* Row 1 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: `${dirColor}15`, color: dirColor }}>
            {isBuy ? '▲' : '▼'}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold">{entry.pair}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${dirColor}12`, color: dirColor }}>{entry.direction}</span>
            {entry.grade && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#b0b3b8' }}>{entry.grade}</span>}
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: `${resultColor}12`, color: resultColor }}>
          {resultLabel}{entry.autoChecked && entry.result ? <span className="text-[8px] opacity-60 ml-0.5">auto</span> : ''}
        </span>
      </div>

      {/* Row 2 */}
      <div className="flex items-center gap-3 text-[10px] text-[var(--t-low)] flex-wrap">
        {entry.entryPrice > 0 && <span className="number-tabular font-medium text-[#b0b3b8]">{entry.entryPrice.toLocaleString()}</span>}
        <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="number-tabular">{entry.confidence}</span>
        {entry.expiryMinutes && <span>{entry.expiryMinutes}m</span>}
        {entry.timeframe && <span className="uppercase">{entry.timeframe}</span>}
      </div>

      {/* Row 3: diagnostics */}
      {(entry.structureVerdict || entry.aiStatus || typeof entry.coreConfidence === 'number') && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {entry.structureVerdict && entry.structureVerdict !== 'N/A' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{
              background: entry.structureVerdict === 'ALIGNED' ? 'rgba(0,230,118,0.08)' : entry.structureVerdict === 'AGAINST' ? 'rgba(255,82,82,0.08)' : 'rgba(var(--rgb-warn),0.08)',
              color: entry.structureVerdict === 'ALIGNED' ? '#00e676' : entry.structureVerdict === 'AGAINST' ? '#ff5252' : '#ffb74d',
            }}>{entry.structureVerdict}</span>
          )}
          {entry.aiStatus && entry.aiStatus !== 'SKIPPED' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: '#8e9099' }}>AI: {entry.aiStatus}</span>
          )}
          {typeof entry.coreConfidence === 'number' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--rgb-purple),0.1)', color: '#b39ddb' }}>Core {entry.coreConfidence}%</span>
          )}
        </div>
      )}

      {/* Exit price */}
      {entry.exitPrice && entry.exitPrice > 0 && (
        <div className="mt-1.5 text-[10px] flex items-center gap-2">
          <span className="text-[var(--t-low)]">Exit:</span>
          <span className="number-tabular font-medium" style={{ color: resultColor }}>{entry.exitPrice.toLocaleString()}</span>
        </div>
      )}

      {/* Pending actions */}
      {isPending && isReportable && expiryPassed && (
        <div className="flex gap-2 mt-2">
          <button onClick={(e) => { e.stopPropagation(); onReport(entry.id, 'WIN'); }} className="flex-1 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-1" style={{ background: 'rgba(0,230,118,0.1)', color: '#00e676' }}>✅ Mark WIN</button>
          <button onClick={(e) => { e.stopPropagation(); onReport(entry.id, 'LOSS'); }} className="flex-1 py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-1" style={{ background: 'rgba(255,82,82,0.1)', color: '#ff5252' }}>❌ Mark LOSS</button>
        </div>
      )}
    </div>
  );
}
