/**
 * Typed event registry. The track() wrapper is the only analytics surface.
 * Every event maps 1:1 to a row in Documentation/solution/METRICS_PLAN.md.
 * Off when LOCAL_RUN_LOG=1 (Gaurav's local runs never reach PostHog).
 */
import posthog from "posthog-js";
import { POSTHOG_HOST, POSTHOG_KEY, POSTHOG_PROJECT } from "./posthog-keys";

type UniversalEvent =
  | "page_viewed"          // path, referrer
  | "session_started"      // utm_source, utm_medium, device_type
  | "signup_completed"     // never fires (no accounts)
  | "signup_failed"        // never fires (no accounts)
  | "login_completed"      // method. v2: fires on the sample demo login
  | "login_failed"         // never fires (no accounts)
  | "feature_used"         // feature_name (v2: theme_toggle, with theme)
  | "error_shown"          // error_type, surface, message (fixed code)
  | "cta_clicked";         // cta_name, surface, destination

type ProjectEvent =
  | "bank_loaded"          // source, items
  | "run_started"          // mode, questions
  | "research_completed"   // web_items, seconds
  | "draft_completed"      // sentences, kept, cut, by label, generic, seconds, retries, unanswered, fallback_model
  | "sentence_marked"      // label, status, verdict, blind
  | "cut_restored"         // label
  | "package_copied"       // answers, active_minutes
  | "defend_sheet_opened"  // claims
  | "replay_viewed"        // run_id
  | "live_cap_reached"     // scope
  | "credit_check_ran"     // token_factory_ok, tavily_ok (server event)
  // v2 (PRODUCT_V2.md). login_completed above now fires on the sample demo login.
  | "onboarding_completed" // use_cases, answers, skipped
  | "questions_found"      // source (scrape|text|image), count, reason
  | "line_edited"          // label
  | "gap_answered"         // status after the fix (kept|cut)
  | "line_rechecked";      // status after the recheck (kept|cut)

export type AnalyticsEvent = UniversalEvent | ProjectEvent;


export const analyticsEnabled = process.env.NEXT_PUBLIC_LOCAL_RUN_LOG !== "1";

let started = false;

export function initAnalytics(): void {
  if (!analyticsEnabled || started || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: false, persistence: "memory" });
  posthog.register({ project: POSTHOG_PROJECT });
  started = true;
}

export function track(
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean | null> = {},
): void {
  if (!analyticsEnabled || !started) return;
  posthog.capture(event, properties);
}
