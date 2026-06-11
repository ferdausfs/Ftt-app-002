// Sound + Notification helpers for the Scanner

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// Plays a short two-tone "ding-dong" alert using Web Audio (no asset needed)
export function playSignalSound(direction: 'BUY' | 'SELL') {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freqs = direction === 'BUY' ? [880, 1320] : [660, 440];

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.35);
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export interface SignalNotificationPayload {
  pair: string;
  direction: 'BUY' | 'SELL';
  confidence: string;
  timeframe: string;
  grade?: string;
}

// Shows a browser notification AND plays a sound.
// Tapping the notification focuses the app and runs onClick (e.g. navigate to home).
export function fireSignalNotification(payload: SignalNotificationPayload, onClick: () => void) {
  playSignalSound(payload.direction);

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const arrow = payload.direction === 'BUY' ? '📈' : '📉';
  const title = `${arrow} ${payload.pair} — ${payload.direction}`;
  const body = `Confidence ${payload.confidence}${payload.grade ? ` · Grade ${payload.grade}` : ''} · ${payload.timeframe}`;

  try {
    const notif = new Notification(title, {
      body,
      tag: `ftt-signal-${payload.pair}`, // replaces previous notif for same pair
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      requireInteraction: false,
    });
    notif.onclick = () => {
      window.focus();
      onClick();
      notif.close();
    };
  } catch {
    // ignore notification errors
  }
}
