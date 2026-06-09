import { useState, useEffect } from 'react';
import { cn } from '../utils/cn';

interface Props {
  secondsLeft: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  label?: string;
  urgent?: boolean;
}

export function CountdownTimer({ secondsLeft, size = 'md', showLabel = false, label = 'Next Candle', urgent = false }: Props) {
  const [seconds, setSeconds] = useState(secondsLeft);

  useEffect(() => {
    setSeconds(secondsLeft);
  }, [secondsLeft]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isUrgent = urgent || seconds < 30;

  const sizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-4xl'
  };

  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        "number-tabular font-bold tracking-tight",
        sizes[size],
        isUrgent ? "text-[#ff453a]" : "text-white"
      )}>
        {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </div>
      {showLabel && (
        <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5 font-medium">
          {label}
        </div>
      )}
    </div>
  );
}

export function CircularCountdown({ secondsLeft, total = 300, direction }: { secondsLeft: number; total?: number; direction: string }) {
  const [seconds, setSeconds] = useState(secondsLeft);

  useEffect(() => {
    setSeconds(secondsLeft);
  }, [secondsLeft]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min(100, ((total - seconds) / total) * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (progress / 100) * circumference;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const isBuy = direction === 'BUY';
  const isSell = direction === 'SELL';
  const color = isBuy ? '#30d158' : isSell ? '#ff453a' : '#8e8e93';

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s linear',
            filter: `drop-shadow(0 0 8px ${color}80)`
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="number-tabular text-2xl font-bold text-white">
          {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
          Expires
        </div>
      </div>
    </div>
  );
}
