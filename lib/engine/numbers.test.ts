import { describe, expect, it } from "vitest";
import { checkNumbers, extractNumbers } from "./numbers";

describe("extractNumbers", () => {
  it("reads digits, decimals and drops commas", () => {
    expect(extractNumbers("We closed 1,200 tickets at 3.5 per hour")).toEqual(["1200", "3.5"]);
  });
  it("turns number words into digits, but not 'one'", () => {
    expect(extractNumbers("ten years, two backend engineers and one designer")).toEqual(["10", "2"]);
  });
  it("reads compound number words", () => {
    expect(extractNumbers("twenty five dispatchers")).toEqual(["25"]);
  });
  it("treats percent and % the same", () => {
    expect(extractNumbers("cut it by 42 percent")).toEqual(["42"]);
    expect(extractNumbers("cut it by 42%")).toEqual(["42"]);
  });
  it("ignores digits inside names and ids", () => {
    expect(extractNumbers("Acme7 and S3 and W12 and Q1")).toEqual([]);
  });
  it("reads years", () => {
    expect(extractNumbers("joined in March 2021")).toEqual(["2021"]);
  });
});

describe("checkNumbers", () => {
  it("passes when every number is in the evidence", () => {
    const r = checkNumbers("We checked 400 past exceptions.", ["We took 400 past exceptions"]);
    expect(r).toEqual({ numbers: ["400"], passed: true, missing: [] });
  });
  it("cuts a number that is not in the evidence", () => {
    const r = checkNumbers("It cut response time by 42%.", ["Response time fell in the pilot"]);
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["42"]);
  });
  it("needs both ends of a range (the spike '40 to 50' gap)", () => {
    expect(checkNumbers("I ran 40 to 50 interviews.", ["I ran about 40 interviews"]).passed).toBe(false);
    expect(checkNumbers("I ran 40 to 50 interviews.", ["somewhere between 40 and 50 interviews"]).passed).toBe(true);
  });
  it("allows a rounded number only when the evidence says about or around, within 10%", () => {
    expect(checkNumbers("I spent 2 years there.", ["about two years at a bank"]).passed).toBe(true);
    expect(checkNumbers("We had 46 users.", ["around 45 users"]).passed).toBe(true);
    expect(checkNumbers("We had 52 users.", ["around 45 users"]).passed).toBe(false);
    expect(checkNumbers("We had 46 users.", ["45 users"]).passed).toBe(false);
  });
  it("matches word numbers in the evidence against digits in the sentence", () => {
    expect(checkNumbers("I have 10 years in product.", ["Ten years in product in total"]).passed).toBe(true);
  });
  it("passes a sentence with no numbers", () => {
    expect(checkNumbers("I wrote the spec.", ["I wrote the spec"])).toEqual({ numbers: [], passed: true, missing: [] });
  });
});
