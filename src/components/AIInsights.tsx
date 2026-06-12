import { Sparkles, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { SignalData } from '../types';
import { cn } from '../utils/cn';

export function AIInsights({ data }: { data: SignalData }) {
  const ai = data.signal.aiValidation?.combined;
  const agrees = data.signal.aiValidation?.agrees;

  if (!ai) return null;

  return (
    <div className="ios-card rounded-2xl p-4 overflow-hidden relative">
      {/* Decorative gradient */}
      <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl bg-[#bf5af2]/20 pointer-events-none" />
      
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#bf5af2] to-[#5e5ce6] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">AI Analysis</div>
            <div className="text-white/40 text-[10px] uppercase tracking-wider">
              {ai.model || 'Multi-model'}
            </div>
          </div>
        </div>
        <div className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold",
          agrees ? "bg-[#30d158]/20 text-[#30d158]" : "bg-[#ff9f0a]/20 text-[#ff9f0a]"
        )}>
          {agrees ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {agrees ? 'AGREE' : 'DIVERGENT'}
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white/[0.04] rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">AI Signal</div>
          <div className={cn(
            "font-bold text-base",
            ai.signal === 'BUY' && "text-[#30d158]",
            ai.signal === 'SELL' && "text-[#ff453a]",
            !['BUY','SELL'].includes(ai.signal || '') && "text-white/60"
          )}>{ai.signal}</div>
        </div>
        <div className="bg-white/[0.04] rounded-xl p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">Confidence</div>
          <div className="text-white font-bold text-base number-tabular">{ai.confidence}%</div>
        </div>
      </div>

      <p className="relative text-[12px] text-white/70 leading-relaxed mb-2">
        {ai.reason}
      </p>

      {ai.concerns && (
        <div className="relative mt-2 flex items-start gap-2 p-2.5 bg-[#ff9f0a]/10 rounded-xl border border-[#ff9f0a]/20">
          <AlertTriangle className="w-3.5 h-3.5 text-[#ff9f0a] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#ff9f0a]/90 leading-relaxed">
            {ai.concerns}
          </p>
        </div>
      )}
    </div>
  );
}
