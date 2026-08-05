export function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="label-caption mb-1.5">{label}</div>
      <div className="text-xl font-bold number-tabular" style={{ color, textShadow: `0 0 8px ${color}30` }}>{value}</div>
    </div>
  );
}
