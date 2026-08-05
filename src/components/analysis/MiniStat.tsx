export function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[#27272d] rounded-lg p-2">
      <div className="text-[10px] text-[#b0b3b8] uppercase">{label}</div>
      <div className="font-medium text-xs number-tabular" style={{ color: color || '#e3e2e6' }}>{value}</div>
    </div>
  );
}
