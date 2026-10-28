"use client";

/** Browser wiring for lib/run/timer.ts: input and tab visibility feed it, a 1 s tick shows it. */
import { useCallback, useEffect, useRef, useState } from "react";
import { activeSeconds, onInput, onVisibility, startTimer, stopTimer, type TimerState } from "@/lib/run/timer";

const INPUT_EVENTS = ["pointerdown", "keydown", "scroll", "wheel", "touchstart", "mousemove"] as const;

export function useActiveTimer(running: boolean) {
  const state = useRef<TimerState | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!running) return;
    state.current = startTimer(Date.now());
    setSeconds(0);
    let lastInput = 0;
    const input = () => {
      const now = Date.now();
      if (now - lastInput < 1000 || !state.current) return; // mousemove fires often; once a second is enough
      lastInput = now;
      state.current = onInput(state.current, now);
    };
    const visibility = () => {
      if (!state.current) return;
      state.current = onVisibility(state.current, document.hidden, Date.now());
      setHidden(document.hidden);
    };
    INPUT_EVENTS.forEach((e) => window.addEventListener(e, input, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    const tick = setInterval(() => state.current && setSeconds(activeSeconds(state.current, Date.now())), 1000);
    return () => {
      INPUT_EVENTS.forEach((e) => window.removeEventListener(e, input));
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(tick);
    };
  }, [running]);

  const read = useCallback(() => (state.current ? activeSeconds(state.current, Date.now()) : 0), []);
  const stop = useCallback(() => {
    if (state.current) state.current = stopTimer(state.current, Date.now());
    return read();
  }, [read]);

  return { seconds, hidden, read, stop };
}

export function TimerBadge({ seconds, hidden }: { seconds: number; hidden?: boolean }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="timer" aria-live="off">
      editing {mm}:{ss} · {hidden ? "paused" : "paused when hidden"}
    </span>
  );
}
