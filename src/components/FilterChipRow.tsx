import { cn } from '../utils/cn';

export interface Chip {
  id: string;
  label: string;
}

interface Props {
  chips: Chip[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Leading caption, e.g. "Pair:" / "Time:" */
  label?: string;
  disabled?: boolean;
}

export function FilterChipRow({ chips, selectedId, onSelect, label, disabled }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={label}>
      {label && <span className="text-xs text-[#b0b3b8] mr-1">{label}</span>}
      {chips.map(chip => {
        const active = selectedId === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(chip.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-95',
              active
                ? 'bg-[#4dd0e1] text-[#00363a]'
                : 'bg-[#1e1e23] text-[#b0b3b8] border border-[#3a3a3e]/50 hover:bg-[#2a2a2f]',
              disabled && 'opacity-50 pointer-events-none',
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
