/**
 * ⚡ INSTANT / ⏳ PENDING fill badge.
 * Always renders — when status is missing, shows a neutral fallback.
 */
export function FillBadge({
  fillStatus,
  entryDistancePct,
}: {
  fillStatus?: 'INSTANT' | 'PENDING_ENTRY';
  entryDistancePct?: number;
}) {
  if (fillStatus === 'INSTANT') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,230,118,0.12)', color: '#00e676' }}>
        ⚡ INSTANT — take now
      </span>
    );
  }
  if (fillStatus === 'PENDING_ENTRY') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(var(--rgb-warn),0.12)', color: '#ffb74d' }}>
        ⏳ PENDING{entryDistancePct != null ? ` (${entryDistancePct.toFixed(3)}%)` : ''}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: '#8e9099' }}>
      fill — not yet resolved
    </span>
  );
}
