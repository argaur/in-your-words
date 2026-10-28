import { expect, test, type Page } from "@playwright/test";
import saved from "../samples/meera/run.json";

const PHONE = { width: 390, height: 844 };

async function noSidewaysScroll(page: Page) {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(width);
}

test.describe("saved run for judges", () => {
  test.use({ viewport: PHONE });

  test("landing shows a backed line with its sticker open and a flagged line with its question above the fold", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI writes it. Every claim is something you said.");
    await expect(page.getByText("Meera Iyer (fictional)").first()).toBeVisible();
    const sticker = page.locator(".proof .stk:not(.empty)").first();
    const flag = page.locator(".proof .stk.empty").first();
    for (const el of [page.getByRole("heading", { level: 1 }), page.getByRole("link", { name: "Try the demo" }), sticker, flag]) {
      const box = await el.boundingBox();
      expect(box?.y ?? 9999).toBeLessThan(844); // C4
    }
    await noSidewaysScroll(page);
    await page.screenshot({ path: "test-results/landing-390.png", fullPage: true });
  });

  test("the read-only studio opens her words, flags a line with its question, and the defend sheet renders", async ({ page }) => {
    await page.goto("/sample");
    await expect(page.getByText("Saved sample run · Meera Iyer, fictional")).toBeVisible();
    const stickers = page.locator(".ln .stk-btn").first();
    await stickers.click();
    await expect(stickers).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".exh blockquote").first()).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: "test-results/studio-390.png", fullPage: true });

    await page.getByRole("button", { name: "Q2" }).click();
    const flagged = page.locator(".ln.flag").first();
    await expect(flagged.locator(".asked")).toHaveText("Asked back");
    await expect(page.locator(".count")).toContainText("1 line needs your words");
    await expect(page.getByText(/[✓✔]/)).toHaveCount(0); // C11

    await page.getByRole("button", { name: "Defend sheet" }).click();
    await expect(page.getByRole("heading", { name: "Defend sheet" })).toBeVisible();
    await noSidewaysScroll(page);
    await page.screenshot({ path: "test-results/defend-390.png", fullPage: true });
  });
});

test.describe("theme as rendered", () => {
  test.use({ viewport: PHONE, colorScheme: "dark" });

  test("a dark browser still gets light, and ?theme=dark or the toggle switches it", async ({ page }) => {
    await page.goto("/sample");
    const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(await bg()).toBe("rgb(233, 237, 241)"); // C5: light by default
    await page.goto("/sample?theme=dark");
    expect(await bg()).toBe("rgb(18, 22, 27)");
    await page.screenshot({ path: "test-results/studio-390-dark.png" });
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.goto("/sample");
    expect(await bg()).toBe("rgb(233, 237, 241)");
  });
});

test("local run flow goes from the bank to the proof view (engine stubbed)", async ({ page }) => {
  const usage = { tokens: 0, seconds: 0, cost_estimate: 0 };
  const ok = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data, error: null }) });
  await page.route("**/api/research", (r) =>
    r.fulfill(ok({ run_token: "t", company: saved.company, posting_text: "", extract_words: 600, web_lines: saved.web_lines, usage })),
  );
  await page.route("**/api/draft", (r) =>
    r.fulfill(
      ok({
        drafts: saved.answers.map((a) => ({
          question_id: a.question_id,
          unanswered: a.unanswered,
          sentences: a.sentences.map((s) => ({ text: s.text, label: s.label, source_ids: s.source_ids, quote: s.quote })),
        })),
        fallback_model: false,
        usage,
        retries: 0,
      }),
    ),
  );
  await page.route("**/api/judge", (r) => {
    const id = (r.request().postDataJSON() as { question: { id: string } }).question.id;
    return r.fulfill(ok({ answer: saved.answers.find((a) => a.question_id === id), usage }));
  });
  const savedRuns: { run: { timer_active_seconds: number; answers: { sentences: { verdict: string; marked_blind: boolean }[] }[] } }[] = [];
  await page.route("**/api/runs/local", (r) => {
    savedRuns.push(r.request().postDataJSON());
    return r.fulfill(ok({ path: "runs/local/stub.json" }));
  });

  await page.goto("/run");
  await page.getByRole("button", { name: "Use the sample persona" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("story lines ready");
  await page.getByRole("button", { name: "Next: the role" }).click();
  await page.getByLabel("Posting link").fill(saved.posting_url);
  await page.getByLabel("Question 1").fill(saved.questions[0].text);
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.getByLabel("Question 2").fill(saved.questions[1].text);
  await page.getByRole("button", { name: "Check my answers" }).click();

  // Local runs open in blind mode: no tags, IDs or cut lines until Show labels.
  await expect(page.getByRole("heading", { name: "Mark without labels" })).toBeVisible();
  await expect(page.locator(".row .tag, .row .id")).toHaveCount(0); // the Fictional sample banner tag stays
  await expect(page.locator(".row.cut")).toHaveCount(0);
  await page.locator("[data-blind] .mark button", { hasText: "True" }).first().click();
  await expect(page.getByText("1 of")).toBeVisible();
  await page.getByRole("button", { name: "Show labels" }).click();

  await expect(page.locator(".counts")).toBeVisible();
  await expect(page.locator(".timer")).toContainText("editing");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy answer" }).click();
  await expect(page.getByText("runs/local/stub.json")).toBeVisible();
  await expect.poll(() => savedRuns.at(-1)?.run.answers.flatMap((a) => a.sentences).some((s) => s.verdict === "true" && s.marked_blind)).toBe(true);
});

test("a capped live run shows the cap state and points back to the saved run", async ({ page }) => {
  await page.route("**/api/research", (r) =>
    r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ data: null, error: { code: "capped_visitor", message: "Today's live runs are used up" } }) }),
  );
  await page.goto("/run");
  await page.getByRole("button", { name: "Use the sample persona" }).click();
  await page.getByRole("button", { name: "Next: the role" }).click();
  await page.getByLabel("Posting link").fill(saved.posting_url);
  await page.getByLabel("Question 1").fill(saved.questions[0].text);
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Today's live runs are used up")).toBeVisible();
  await expect(page.getByRole("link", { name: "See the saved run" })).toHaveAttribute("href", "/sample");
});

test("the retry after a thin posting sends the pasted text with the retry token", async ({ page }) => {
  const bodies: { posting_text?: string; retry_token?: string }[] = [];
  await page.route("**/api/research", (r) => {
    bodies.push(r.request().postDataJSON());
    if (bodies.length === 1) {
      return r.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: { code: "thin_posting", message: "Only 40 words could be read from the posting", retry_token: "retry-1" } }),
      });
    }
    return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ data: null, error: { code: "capped_visitor", message: "Today's live runs are used up" } }) });
  });
  await page.goto("/run");
  await page.getByRole("button", { name: "Use the sample persona" }).click();
  await page.getByRole("button", { name: "Next: the role" }).click();
  await page.getByLabel("Posting link").fill(saved.posting_url);
  await page.getByLabel("Question 1").fill(saved.questions[0].text);
  await page.getByRole("button", { name: "Check my answers" }).click();
  await page.getByLabel("Posting text").fill("word ".repeat(160));
  await page.getByRole("button", { name: "Use this text" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0].retry_token).toBeUndefined();
  expect(bodies[1].retry_token).toBe("retry-1");
  expect(bodies[1].posting_text?.length).toBeGreaterThan(0);
});

test("baseline mode times a pasted draft and saves only the time", async ({ page }) => {
  const bodies: { run: { mode: string; timer_active_seconds: number; answers: unknown[] } }[] = [];
  await page.route("**/api/runs/local", (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { path: "runs/local/base.json" }, error: null }) });
  });
  await page.goto("/run");
  await page.getByRole("button", { name: /Baseline mode/ }).click();
  await page.getByLabel("The draft").fill("A plain draft from a chat tool.");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.waitForTimeout(2100);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("runs/local/base.json")).toBeVisible();
  expect(bodies[0].run.mode).toBe("baseline");
  expect(bodies[0].run.timer_active_seconds).toBeGreaterThanOrEqual(2);
  expect(bodies[0].run.answers).toEqual([]);
});
