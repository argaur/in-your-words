// Screenshot pack: node shots.mjs <baseURL> <outDir> [paths...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [base, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PAGES = only.length ? only : ["/", "/login", "/app", "/app/start", "/app/interview", "/app/stories", "/app/new", "/app/a/__example__", "/sample", "/app/soon/ledger", "/docs"];
const WIDTHS = (process.env.WIDTHS ?? "390,1440").split(",").map(Number);
const THEMES = (process.env.THEMES ?? "light,dark").split(",");

const browser = await chromium.launch({ channel: "chrome" });
const report = [];
for (const w of WIDTHS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (let p of PAGES) {
      if (p.includes("__example__")) {
        await page.goto(`${base}/app?theme=${theme}`);
        await page.waitForTimeout(800);
        const href = await page.locator('a[href^="/app/a/"]').first().getAttribute("href").catch(() => null);
        if (!href) { report.push(`${w} ${theme} ${p}: no example link`); continue; }
        p = href;
      }
      await page.goto(`${base}${p}${p.includes("?") ? "&" : "?"}theme=${theme}`);
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, th: document.documentElement.dataset.theme }));
      const name = `${p.replace(/[^a-z0-9]+/gi, "_") || "root"}-${theme}-${w}.png`;
      await page.screenshot({ path: `${out}/${name}`, fullPage: true });
      report.push(`${w} ${theme} ${p}: theme=${m.th} overflow=${m.sw > m.cw ? `YES ${m.sw}>${m.cw}` : "no"}`);
    }
    if (errors.length) report.push(`errors ${w} ${theme}: ${[...new Set(errors)].slice(0, 5).join(" | ")}`);
    await ctx.close();
  }
}
await browser.close();
console.log(report.join("\n"));
