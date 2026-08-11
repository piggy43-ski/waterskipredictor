import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'vault_sound_on';

/** Muted by default. One toggle drives both audio cues and mobile haptics. */
export function useVaultSound() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const tone = useCallback(
    (freq: number, ms: number, gain: number) => {
      if (!on) return;
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = (ctxRef.current ??= new Ctx());
        if (ctx.state === 'suspended') void ctx.resume();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
        osc.connect(g).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + ms / 1000);
      } catch {
        /* audio blocked */
      }
    },
    [on]
  );

  const buzz = useCallback(
    (pattern: number | number[]) => {
      if (!on) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* no haptics */
      }
    },
    [on]
  );

  /** Soft tick — someone bid. */
  const tick = useCallback(() => {
    tone(660, 90, 0.05);
    buzz(12);
  }, [tone, buzz]);

  /** Sharper cue — you were outbid. */
  const alarm = useCallback(() => {
    tone(880, 150, 0.09);
    setTimeout(() => tone(540, 220, 0.09), 160);
    buzz([40, 60, 90]);
  }, [tone, buzz]);

  /** Bright cue — a milestone unlocked for the whole room. */
  const chime = useCallback(() => {
    tone(720, 140, 0.06);
    setTimeout(() => tone(1080, 260, 0.06), 130);
    buzz(30);
  }, [tone, buzz]);

  return { on, toggle, tick, alarm, chime };
}
