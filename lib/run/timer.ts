/**
 * Active-time timer for H2 (METRICS_PLAN.md). Reading counts as work, so the timer pauses only
 * when the tab is hidden or 5 minutes after the last input. Pure: every call takes the time,
 * so tests need no fake clock.
 */
export const IDLE_MS = 5 * 60 * 1000;

export type TimerState = {
  activeMs: number;
  since: number | null; // start of the current counted stretch, null while paused
  lastInput: number;
  hidden: boolean;
  stopped: boolean;
};

export function startTimer(now: number): TimerState {
  return { activeMs: 0, since: now, lastInput: now, hidden: false, stopped: false };
}

/** Bank the counted stretch up to now, capped at 5 minutes after the last input. */
function settle(t: TimerState, now: number): TimerState {
  if (t.since === null) return t;
  const end = Math.min(now, t.lastInput + IDLE_MS);
  return { ...t, activeMs: t.activeMs + Math.max(0, end - t.since), since: end < now ? null : now };
}

export function onInput(t: TimerState, now: number): TimerState {
  const s = settle(t, now);
  if (s.stopped || s.hidden) return { ...s, lastInput: now };
  return { ...s, lastInput: now, since: s.since ?? now };
}

export function onVisibility(t: TimerState, hidden: boolean, now: number): TimerState {
  const s = settle(t, now);
  if (s.stopped) return { ...s, hidden };
  return hidden ? { ...s, hidden, since: null } : { ...s, hidden, since: now, lastInput: now };
}

export function stopTimer(t: TimerState, now: number): TimerState {
  return { ...settle(t, now), since: null, stopped: true };
}

export function activeSeconds(t: TimerState, now: number): number {
  return Math.floor(settle(t, now).activeMs / 1000);
}
