import { describe, expect, it } from "vitest";
import { activeSeconds, onInput, onVisibility, startTimer, stopTimer } from "./timer";

const S = 1000;
const MIN = 60 * S;

describe("active-time timer (H2)", () => {
  it("counts time while the tab is shown and the user is active", () => {
    let t = startTimer(0);
    t = onInput(t, 30 * S);
    expect(activeSeconds(t, 60 * S)).toBe(60);
  });

  it("pauses while the tab is hidden", () => {
    let t = startTimer(0);
    t = onVisibility(t, true, 10 * S);
    t = onVisibility(t, false, 70 * S);
    expect(activeSeconds(t, 80 * S)).toBe(20);
  });

  it("stops counting 5 minutes after the last input", () => {
    const t = startTimer(0);
    expect(activeSeconds(t, 12 * MIN)).toBe(5 * 60);
  });

  it("resumes on the next input after an idle gap, without counting the gap", () => {
    let t = startTimer(0);
    t = onInput(t, 20 * MIN);
    expect(activeSeconds(t, 21 * MIN)).toBe(5 * 60 + 60);
  });

  it("freezes when stopped", () => {
    let t = startTimer(0);
    t = stopTimer(t, 90 * S);
    t = onInput(t, 100 * S);
    expect(activeSeconds(t, 10 * MIN)).toBe(90);
  });

  it("a hidden tab that comes back counts as activity", () => {
    let t = startTimer(0);
    t = onVisibility(t, true, 1 * MIN);
    t = onVisibility(t, false, 30 * MIN);
    expect(activeSeconds(t, 31 * MIN)).toBe(2 * 60);
  });
});
