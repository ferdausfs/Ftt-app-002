interface ConfidenceRingProps {
  confidenceNum: number;
  dirColor: string;
  size?: number;
  strokeWidth?: number;
}

export function ConfidenceRing({ confidenceNum, dirColor, size = 90, strokeWidth = 5 }: ConfidenceRingProps) {
  const half = size / 2;
  const r = half - strokeWidth;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={half} cy={half} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
        <circle
          cx={half} cy={half} r={r} fill="none" stroke={dirColor} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (confidenceNum / 100) * circumference}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 5px ${dirColor}60)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold number-tabular leading-none" style={{ color: dirColor }}>{confidenceNum}</span>
        <span className="label-caption mt-0.5">confidence</span>
      </div>
    </div>
  );
}
