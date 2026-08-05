import { Clock, Globe2, Zap } from 'lucide-react';
import { SignalData } from '../../types';
import { getCryptoAlternativePair } from '../../lib/formatters';

interface MarketClosedCardProps {
  data: SignalData;
  onSwitchPair: (pair: string) => void;
}

export function MarketClosedCard({ data, onSwitchPair }: MarketClosedCardProps) {
  const cryptoPair = getCryptoAlternativePair(data);
  const nextOpen = data.nextOpen ? new Date(data.nextOpen) : null;
  const nextOpenLabel = data.nextOpenReadable || (nextOpen && !Number.isNaN(nextOpen.getTime()) ? nextOpen.toUTCString() : null);

  return (
    <div className="space-y-3 fade-in">
      <div className="premium-card p-0 overflow-hidden scale-in border border-[#4dd0e1]/10">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#4dd0e1] via-[#26a69a] to-[var(--c-info)]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#4dd0e1]/15 flex items-center justify-center shadow-lg shadow-[#4dd0e1]/5">
                <Clock className="w-7 h-7 text-[#4dd0e1]" strokeWidth={2.4} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[#4dd0e1] font-bold mb-1">Market status</div>
                <h2 className="text-2xl font-medium leading-tight">Forex Market Closed</h2>
                <p className="text-sm text-[#b0b3b8] mt-1 leading-relaxed">
                  {data.message || 'Forex market is currently closed.'}
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-[#27272d] text-[#ffb74d] text-xs font-bold border border-[#ffb74d]/20">
              CLOSED
            </div>
          </div>

          <div className="grid gap-3 mb-4">
            <div className="bg-[#1e1e23] rounded-2xl p-4 border border-[#3a3a3e]/60">
              <div className="flex items-center gap-2 text-xs text-[#b0b3b8] mb-2">
                <Globe2 className="w-4 h-4 text-[var(--c-info)]" />
                <span>Next forex open</span>
              </div>
              <div className="text-base font-medium text-[#e3e2e6] leading-snug">
                {nextOpenLabel || 'Next open time unavailable'}
              </div>
              {data.opensIn && (
                <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-[#4dd0e1]/10 text-[#4dd0e1] text-xs font-bold">
                  <div className="w-2 h-2 rounded-full bg-[#4dd0e1] animate-pulse" />
                  Opens in {data.opensIn}
                </div>
              )}
            </div>

            <div className="bg-[#27272d] rounded-2xl p-4 border border-[#3a3a3e]/50">
              <div className="text-xs uppercase tracking-wider text-[#8e9099] font-medium mb-2">What to do now</div>
              <p className="text-sm text-[#c4c6d0] leading-relaxed">
                {data.advice || 'Wait for forex to reopen, or switch to crypto markets which run 24/7.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onSwitchPair(cryptoPair)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#4dd0e1] to-[#26a69a] text-[#00363a] font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-[#4dd0e1]/10"
          >
            <Zap className="w-4 h-4" />
            Switch to {cryptoPair} (24/7)
          </button>
        </div>
      </div>
    </div>
  );
}
