// Studio interaction check at phone width: node scripts/studio-check.mjs <baseURL> <outDir>
import { chromium } from "playwright";

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(`${base}/app?theme=dark`);
await page.waitForTimeout(800);
await page.locator('a[href^="/app/a/"]').first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Q2" }).click();
await page.screenshot({ path: `${out}/studio-q2-dark-390.png`, fullPage: true });
await page.locator("button.ask").first().click();
const focused = await page.evaluate(() => document.activeElement?.tagName + "#" + document.activeElement?.id);
await page.getByRole("button", { name: "Use my answer" }).click();
const emptyMsg = await page.getByText("Speak your answer first.").waitFor({ timeout: 3000 }).then(() => true, () => false);
await page.screenshot({ path: `${out}/studio-gap-open-dark-390.png`, fullPage: true });
const ticks = await page.evaluate(() => /[✓✔]/.test(document.body.innerText));
const yellow = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg === "rgb(255, 196, 0)" && !el.matches(".stk, .mark b")) bad.push(el.className || el.tagName);
  }
  return bad.slice(0, 5);
});
console.log(JSON.stringify({ focused, emptyMsg, ticks, yellowOutsideStickers: yellow }));
await browser.close();
