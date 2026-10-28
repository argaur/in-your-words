import { describe, expect, it } from "vitest";
import { buildHealth } from "./health";

describe("buildHealth", () => {
  it("reports version, commit and db status", () => {
    process.env.APP_VERSION = "0.1.0";
    process.env.COMMIT_SHA = "abc1234";
    expect(buildHealth("ok")).toEqual({ version: "0.1.0", commit_sha: "abc1234", db: "ok" });
  });

  it("falls back to local when no commit is set", () => {
    delete process.env.COMMIT_SHA;
    expect(buildHealth("unconfigured").commit_sha).toBe("local");
  });
});
