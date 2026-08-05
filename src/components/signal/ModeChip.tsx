/**
 * ⏱ FTT / 💹 FX / 🔄 BOTH mode chip — always visible.
 * Renders defaults ('FTT') when the worker omits the mode field.
 */
export function ModeChip({ mode }: { mode?: 'ftt' | 'fx' | 'both' }) {
  const label = mode === 'fx' ? '💹 FX' : mode === 'both' ? '🔄 BOTH' : '⏱ FTT';
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-md"
      style={{ background: 'rgba(var(--rgb-purple),0.12)', color: '#b39ddb' }}
    >
      {label}
    </span>
  );
}
