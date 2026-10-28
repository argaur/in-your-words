// F01 check on a deployed site: answer the example's flagged line once, then confirm a second try is refused.
// node scripts/f01-check.mjs <baseURL> <outDir>. Spends one line call of credit.
import { chromium } from "playwright";

const [base, out] = process.argv.slice(2);
const ANSWER = "It was a pilot with three customers. Median time to first action went from about 19 minutes to about 11.";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const calls = [];
page.on("response", async (r) => {
  if (r.url().endsWith("/api/line")) calls.push({ status: r.status(), body: (await r.text().catch(() => "")).slice(0, 300) });
});

async function answerOnce() {
  await page.goto(`${base}/app`);
  await page.waitForTimeout(1000);
  await page.locator('a[href^="/app/a/"]').first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Q2" }).click();
  await page.locator("textarea[id^=gap-]").first().fill(ANSWER);
  await page.getByRole("button", { name: "Use my answer" }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 90_000 });
  await page.waitForTimeout(500);
}

await answerOnce();
const first = await page.evaluate(() => ({
  flagged: document.querySelectorAll(".ln.flag").length,
  error: document.querySelector(".ln-err")?.textContent ?? null,
  count: document.querySelector(".count")?.textContent ?? null,
}));
await page.screenshot({ path: `${out}/f01-after-answer-1440.png`, fullPage: true });

// Fresh browser storage, same visitor: the example is flagged again, and the server must refuse.
await ctx.clearCookies();
await page.evaluate(() => localStorage.clear());
await answerOnce();
const second = await page.evaluate(() => document.querySelector(".ln-err")?.textContent ?? null);
console.log(JSON.stringify({ first, second, calls: calls.map((c) => ({ status: c.status, body: c.status === 200 ? c.body.slice(0, 160) : c.body })) }, null, 1));
await browser.close();
