import { describe, expect, it } from "vitest";
import { CREDIT, assessCredit, cronAuthorized, runCreditCheck, tavilyLeft } from "./credit";

describe("assessCredit", () => {
  it("is ok when the probe works and both balances sit above their floors", () => {
    const r = assessCredit({ tfProbeOk: true, runs: 10, tavilyLeft: 900 });
    expect(r.token_factory_ok).toBe(true);
    expect(r.tavily_ok).toBe(true);
    expect(r.tf_est_left_usd).toBeCloseTo(CREDIT.startUsd - 10 * CREDIT.costPerRunUsd);
  });

  it("flags Token Factory when the probe call fails, whatever the estimate says", () => {
    expect(assessCredit({ tfProbeOk: false, runs: 0, tavilyLeft: 900 }).token_factory_ok).toBe(false);
  });

  it("flags Token Factory when the estimate drops below the floor", () => {
    const runs = Math.ceil((CREDIT.startUsd - CREDIT.tfFloorUsd) / CREDIT.costPerRunUsd) + 1;
    expect(assessCredit({ tfProbeOk: true, runs, tavilyLeft: 900 }).token_factory_ok).toBe(false);
  });

  it("flags Tavily below its floor, and when usage could not be read", () => {
    expect(assessCredit({ tfProbeOk: true, runs: 0, tavilyLeft: CREDIT.tavilyFloor - 1 }).tavily_ok).toBe(false);
    expect(assessCredit({ tfProbeOk: true, runs: 0, tavilyLeft: null }).tavily_ok).toBe(false);
  });
});

describe("tavilyLeft", () => {
  it("reads the account plan from the /usage reply", () => {
    expect(tavilyLeft({ account: { plan_usage: 24, plan_limit: 1000 } })).toBe(976);
  });

  it("returns null on a reply it does not understand", () => {
    expect(tavilyLeft({ detail: "Unauthorized" })).toBeNull();
    expect(tavilyLeft(null)).toBeNull();
  });
});

describe("cronAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorized("Bearer wrong", "s3cret")).toBe(false);
    expect(cronAuthorized(null, "s3cret")).toBe(false);
  });

  it("refuses everything when no secret is set", () => {
    expect(cronAuthorized("Bearer ", "")).toBe(false);
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("runCreditCheck", () => {
  it("sends one credit_check_ran event with both flags and returns the report", async () => {
    const sent: { event: string; props: Record<string, unknown> }[] = [];
    const report = await runCreditCheck({
      probeTokenFactory: async () => true,
      tavilyLeft: async () => 500,
      runsSinceStart: async () => 4,
      capture: async (event, props) => {
        sent.push({ event, props });
      },
    });
    expect(report.token_factory_ok).toBe(true);
    expect(report.tavily_ok).toBe(true);
    expect(report.capture_ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("credit_check_ran");
    expect(sent[0].props).toMatchObject({ token_factory_ok: true, tavily_ok: true, all_ok: true, runs_since_start: 4 });
  });

  it("treats a failing dependency as not ok, and still reports", async () => {
    const report = await runCreditCheck({
      probeTokenFactory: async () => {
        throw new Error("network");
      },
      tavilyLeft: async () => 500,
      runsSinceStart: async () => {
        throw new Error("db down");
      },
      capture: async () => {
        throw new Error("posthog down");
      },
    });
    expect(report.token_factory_ok).toBe(false);
    expect(report.capture_ok).toBe(false);
    expect(report.runs_since_start).toBeNull();
  });
});
