import { ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn, haptic, formatTime } from '../utils/cn';

export interface HistoryEntry {
  id: string;
  pair: string;
  direction: string;
  confidence: string;
  timeframe: string;
  entryPrice: number;
  timestamp: number;
  result?: 'WIN' | 'LOSS' | 'PENDING';
  grade?: string;
  entryHit?: boolean;
}

interface Props {
  history: HistoryEntry[];
  onReport: (id: string, result: 'WIN' | 'LOSS') => void;
  onClear: () => void;
}

export function HistoryView({ history, onReport, onClear }: Props) {
  if (history.length === 0) {
    return (
      <div className="ios-card rounded-2xl p-10 text-center">
        <Clock className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <p className="text-white/60 font-semibold mb-1">No history yet</p>
        <p className="text-white/40 text-sm">Generated signals will appear here</p>
      </div>
    );
  }

  // Stats
  const wins = history.filter(h => h.result === 'WIN').length;
  const losses = history.filter(h => h.result === 'LOSS').length;
  const pending = history.filter(h => !h.result || h.result === 'PENDING').length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-3">
      {/* Stats overview */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Total" value={history.length} color="#0a84ff" />
        <StatCard label="Wins" value={wins} color="#30d158" />
        <StatCard label="Losses" value={losses} color="#ff453a" />
        <StatCard label="Win %" value={`${winRate}%`} color="#ffd60a" />
      </div>

      {/* History list */}
      <div className="ios-card rounded-2xl overflow-hidden">
        {history.slice(0, 30).map((entry, idx) => (
          <HistoryRow
            key={entry.id}
            entry={entry}
            isLast={idx === Math.min(history.length, 30) - 1}
            onReport={onReport}
          />
        ))}
      </div>

      {/* Clear button */}
      <button
        onClick={() => { haptic('heavy'); onClear(); }}
        className="w-full py-3 ios-card rounded-2xl text-[#ff453a] font-semibold text-sm haptic-tap"
      >
        Clear History
      </button>

      {pending > 0 && (
        <p className="text-center text-xs text-white/40">
          {pending} signal{pending !== 1 ? 's' : ''} awaiting result
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="ios-card rounded-xl p-3 text-center">
      <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold mb-1">{label}</div>
      <div className="font-bold number-tabular text-lg" style={{ color }}>{value}</div>
    </div>
  );
}

function HistoryRow({ entry, isLast, onReport }: { 
  entry: HistoryEntry; 
  isLast: boolean;
  onReport: (id: string, result: 'WIN' | 'LOSS') => void;
}) {
  const isBuy = entry.direction === 'BUY';
  const isPending = !entry.result || entry.result === 'PENDING';

  return (
    <div className={cn(
      "p-3.5",
      !isLast && "border-b border-white/[0.06]"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isBuy ? "bg-[#30d158]/15" : "bg-[#ff453a]/15"
          )}>
            {isBuy ? (
              <ArrowUpRight className="w-4 h-4 text-[#30d158]" strokeWidth={2.5} />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-[#ff453a]" strokeWidth={2.5} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">{entry.pair}</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-semibold">
                {entry.timeframe}
              </span>
              {entry.grade && (
                <span className="text-[9px] px-1.5 py-0.5 bg-[#bf5af2]/20 text-[#bf5af2] rounded font-bold">
                  {entry.grade}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-white/40 number-tabular">
                {entry.entryPrice}
              </span>
              <span className="text-[10px] text-white/30">·</span>
              <span className="text-[10px] text-white/40">
                {formatTime(new Date(entry.timestamp))}
              </span>
              <span className="text-[10px] text-white/30">·</span>
              <span className="text-[10px] text-white/40 number-tabular">
                {entry.confidence}
              </span>
            </div>
          </div>
        </div>

        {/* Result indicator */}
        {entry.result === 'WIN' && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#30d158]/20">
            <CheckCircle2 className="w-3 h-3 text-[#30d158]" />
            <span className="text-[10px] font-bold text-[#30d158]">WIN</span>
          </div>
        )}
        {entry.result === 'LOSS' && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#ff453a]/20">
            <XCircle className="w-3 h-3 text-[#ff453a]" />
            <span className="text-[10px] font-bold text-[#ff453a]">LOSS</span>
          </div>
        )}
        {typeof entry.entryHit === 'boolean' && (
          <div className={entry.entryHit
            ? 'flex items-center gap-1 px-2 py-1 rounded-full bg-[#30d158]/15'
            : 'flex items-center gap-1 px-2 py-1 rounded-full bg-[#ffb74d]/15'}>
            <span className={entry.entryHit
              ? 'text-[9px] font-bold text-[#30d158]'
              : 'text-[9px] font-bold text-[#ffb74d]'}>
              {entry.entryHit ? 'entry hit ✓' : 'entry miss ⚠'}
            </span>
          </div>
        )}
      </div>

      {/* Report buttons for pending */}
      {isPending && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => { haptic('medium'); onReport(entry.id, 'WIN'); }}
            className="flex-1 py-2 rounded-xl bg-[#30d158]/15 text-[#30d158] font-bold text-xs haptic-tap flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            WIN
          </button>
          <button
            onClick={() => { haptic('medium'); onReport(entry.id, 'LOSS'); }}
            className="flex-1 py-2 rounded-xl bg-[#ff453a]/15 text-[#ff453a] font-bold text-xs haptic-tap flex items-center justify-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" />
            LOSS
          </button>
        </div>
      )}
    </div>
  );
}
