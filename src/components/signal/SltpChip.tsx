/**
 * SL / TP chips — only rendered when fxLevels data is present (FX/BOTH mode).
 */
export function SltpChip({ sl, tp, rr }: { sl?: number; tp?: number; rr?: number }) {
  if (sl == null && tp == null) return null;
  return (
    <>
      {sl != null && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,82,82,0.12)', color: '#ff5252' }}>
          SL {sl}
        </span>
      )}
      {tp != null && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,230,118,0.12)', color: '#00e676' }}>
          TP {tp} (1:{rr ?? 2.5})
        </span>
      )}
    </>
  );
}
