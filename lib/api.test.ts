import { afterEach, describe, expect, it, vi } from "vitest";

describe("run token", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function load() {
    process.env.RUN_TOKEN_SECRET = "test-secret";
    return import("./api");
  }

  it("verifies a token it issued", async () => {
    const { issueRunToken, verifyRunToken } = await load();
    expect(verifyRunToken(issueRunToken())).toBe(true);
  });

  it("refuses a tampered token", async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const t = issueRunToken();
    const tampered = `${Number(t.split(".")[0]) + 999999}${t.slice(t.indexOf("."))}`;
    expect(verifyRunToken(tampered)).toBe(false);
  });

  it("refuses an expired token", async () => {
    vi.useFakeTimers();
    const { issueRunToken, verifyRunToken } = await load();
    const t = issueRunToken();
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(verifyRunToken(t)).toBe(false);
  });

  it("refuses junk", async () => {
    const { verifyRunToken } = await load();
    expect(verifyRunToken(undefined)).toBe(false);
    expect(verifyRunToken("abc")).toBe(false);
  });
});
