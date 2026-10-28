import { describe, expect, it } from "vitest";
import { hashIp, LIMITS, memoryStore, reserveRun, reserveRunOrRetry, useToken } from "./cap";

describe("live cap (plan section 4, query 1)", () => {
  it("allows 3 runs per visitor a day, then refuses with capped_visitor", async () => {
    const store = memoryStore();
    const got = [];
    for (let i = 0; i < 4; i++) got.push(await reserveRun(store, "ip-a"));
    expect(got).toEqual(["ok", "ok", "ok", "capped_visitor"]);
  });

  it("allows 20 runs a day in total, then refuses with capped_global", async () => {
    const store = memoryStore();
    for (let i = 0; i < LIMITS.global; i++) expect(await reserveRun(store, `ip-${i}`)).toBe("ok");
    expect(await reserveRun(store, "ip-new")).toBe("capped_global");
  });

  it("a visitor refused by the cap does not use up a global run", async () => {
    const store = memoryStore();
    for (let i = 0; i < 4; i++) await reserveRun(store, "ip-a");
    expect(await store.count("global")).toBe(3);
  });
});

describe("thin posting retry", () => {
  it("the retry after a thin posting does not take a second run", async () => {
    const store = memoryStore();
    expect(await reserveRun(store, "ip-a")).toBe("ok"); // the thin attempt
    expect(await reserveRunOrRetry(store, "ip-a", "tok1")).toBe("ok"); // the pasted-text retry
    expect(await store.count("ip-a")).toBe(1);
    expect(await store.count("global")).toBe(1);
  });

  it("a retry token works once, then the run is reserved as usual", async () => {
    const store = memoryStore();
    await reserveRunOrRetry(store, "ip-a", "tok1");
    expect(await reserveRunOrRetry(store, "ip-a", "tok1")).toBe("ok");
    expect(await store.count("ip-a")).toBe(1);
  });

  it("with no retry token it reserves a run", async () => {
    const store = memoryStore();
    expect(await reserveRunOrRetry(store, "ip-a", null)).toBe("ok");
    expect(await store.count("ip-a")).toBe(1);
  });
});

describe("per-token limits", () => {
  it("allows 2 draft calls per run token", async () => {
    const store = memoryStore();
    const key = "tok:abc:draft";
    expect([await useToken(store, key, LIMITS.draftPerToken), await useToken(store, key, LIMITS.draftPerToken), await useToken(store, key, LIMITS.draftPerToken)]).toEqual([true, true, false]);
  });
});

describe("ip hash", () => {
  it("is stable, salted and never the raw ip", () => {
    const a = hashIp("203.0.113.9", "salt-1");
    expect(a).toBe(hashIp("203.0.113.9", "salt-1"));
    expect(a).not.toBe(hashIp("203.0.113.9", "salt-2"));
    expect(a).not.toContain("203.0.113.9");
  });
});
