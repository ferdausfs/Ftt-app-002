import { cn } from '../../utils/cn';

export function GaugeBar({ label, value }: { label: string; value: number }) {
  if (isNaN(value)) return null;
  const isOverbought = label.includes('RSI') ? value > 70 : value > 80;
  const isOversold = label.includes('RSI') ? value < 30 : value < 20;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#b0b3b8]">{label}</span>
        <span className={cn("text-xs font-medium number-tabular", isOverbought ? "text-[var(--c-sell)]" : isOversold ? "text-[var(--c-buy)]" : "text-[#e3e2e6]")}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 bg-[#27272d] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", isOverbought ? "bg-[var(--c-sell)]" : isOversold ? "bg-[var(--c-buy)]" : "bg-[var(--c-info)]")}
          style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
