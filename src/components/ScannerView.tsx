import { useState } from 'react';
import { RefreshCw, Plus, X, ArrowUp, ArrowDown, Minus, Radar, Bell, BellOff } from 'lucide-react';
import { cn, haptic } from '../utils/cn';
import { useScanner } from '../hooks/useScanner';

interface Props {
  onSignalClick: (pair: string) => void;
}

export function ScannerView({ onSignalClick }: Props) {
  const {
    pairs,
    results,
    scanning,
    countdown,
    enabled,
    setEnabled,
    addPair,
    removePair,
    scanAll,
    handleRowClick,
  } = useScanner({ onSignalClick });

  const [input, setInput] = useState('');

  const handleAdd = () => {
    const raw = input.trim().toUpperCase();
    if (!raw) return;
    let pair = raw;
    if (!raw.includes('/') && !raw.includes('OTC')) {
      if (raw.length === 6) pair = `${raw.slice(0, 3)}/${raw.slice(3)}`;
    }
    if (pairs.length >= 12) return;
    addPair(pair);
    setInput('');
    haptic('light');
  };

  return (
    <div className="space-y-3 fade-in">
      {/* Header / controls */}
      <div className="md-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(66,165,245,0.1)' }}>
              <Radar className="w-4 h-4 text-[#64b5f6]" />
            </div>
            <div>
              <div className="text-sm font-medium">Live Scanner</div>
              <div className="text-xs text-[#b0b3b8]">
                {pairs.length}/12 pairs · scans every 60s
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform",
                enabled ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[rgba(255,255,255,0.04)] text-[#8e9099]"
              )}
            >
              {enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { haptic('light'); scanAll(); }}
              disabled={scanning}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            >
              <RefreshCw className={cn("w-4 h-4", scanning && "animate-spin")} />
            </button>
          </div>
        </div>

        {enabled && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full w-fit">
            <div className={cn("w-2 h-2 rounded-full", scanning ? "bg-[#64b5f6] animate-pulse" : "bg-[#00e676] animate-pulse")} />
            <span className="text-xs text-[#b0b3b8] font-medium number-tabular">
              {scanning ? 'Scanning…' : `Next scan in ${countdown}s`}
            </span>
          </div>
        )}

        {/* Add pair */}
        <div className="flex gap-2 mt-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. EURUSD or EURUSD-OTC"
            className="flex-1 rounded-xl px-3 py-2 text-sm text-[#e3e2e6] placeholder-[#8e9099] outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={pairs.length >= 12}
            className="w-10 h-10 rounded-xl bg-[#64b5f6]/15 text-[#64b5f6] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pair list */}
      <div style={{ borderRadius: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }} className="overflow-hidden">
        {pairs.length === 0 ? (
          <div className="p-10 text-center">
            <Radar className="w-12 h-12 text-[rgba(255,255,255,0.04)] mx-auto mb-3" />
            <p className="text-[#b0b3b8] font-medium mb-1">No pairs added</p>
            <p className="text-[#8e9099] text-sm">Add 10–12 pairs to start scanning</p>
          </div>
        ) : (
          pairs.map((pair, idx) => {
            const r = results[pair];
            const isBuy = r?.signal === 'BUY';
            const isSell = r?.signal === 'SELL';
            const hasSignal = isBuy || isSell;

            return (
              <div
                key={pair}
                onClick={() => hasSignal && handleRowClick(pair)}
                className={cn(
                  "flex items-center justify-between p-4 transition-colors",
                  idx !== pairs.length - 1 && "border-b border-[rgba(255,255,255,0.04)]",
                  hasSignal && "active:scale-[0.99] cursor-pointer",
                  isBuy && "bg-[#00e676]/[0.06]",
                  isSell && "bg-[#ff5252]/[0.06]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    isBuy ? "bg-[#00e676]/15" : isSell ? "bg-[#ff5252]/15" : "bg-[rgba(255,255,255,0.03)]"
                  )}>
                    {r?.status === 'loading' ? (
                      <RefreshCw className="w-4 h-4 text-[#8e9099] animate-spin" />
                    ) : isBuy ? (
                      <ArrowUp className="w-4 h-4 text-[#00e676]" />
                    ) : isSell ? (
                      <ArrowDown className="w-4 h-4 text-[#ff5252]" />
                    ) : (
                      <Minus className="w-4 h-4 text-[#8e9099]" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{pair}</div>
                    <div className="text-xs text-[#8e9099]">
                      {r?.status === 'error' ? 'Error' :
                       r?.status === 'loading' ? 'Scanning…' :
                       r?.signal ? `${r.signal}${r.confidence ? ` · ${r.confidence}` : ''}${r.timeframe ? ` · ${r.timeframe}` : ''}` :
                       'Waiting…'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r?.grade && hasSignal && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#b39ddb]/20 text-[#b39ddb] rounded font-bold">
                      {r.grade}
                    </span>
                  )}
                  {hasSignal && !r?.consumed && (
                    <div className="w-2 h-2 rounded-full bg-[#ff5252] animate-pulse" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removePair(pair); }}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <X className="w-3.5 h-3.5 text-[#8e9099]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
