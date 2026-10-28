"use client";

/** Shared Exhibit pieces: top bar with the theme toggle, icons, state block, run steps. Styles live in app/brand.css. */
import { useEffect, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";

export function Icon({ name }: { name: "mic" | "alert" | "theme" }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      {name === "mic" ? (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <path d="M12 19v3" />
        </>
      ) : name === "alert" ? (
        <>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** Light by default; the head script in app/layout.tsx sets data-theme before first paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);
  const other = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-btn"
      aria-label={`Switch to ${other} theme`}
      onClick={() => {
        document.documentElement.setAttribute("data-theme", other);
        try {
          localStorage.setItem("iyw-theme", other);
        } catch {
          // Storage blocked: the choice lasts for this page only.
        }
        setTheme(other);
        track("feature_used", { feature_name: "theme_toggle", theme: other });
      }}
    >
      <Icon name="theme" />
      <span className="theme-label">{other === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

export function TopBar({ nav, right }: { nav?: ReactNode; right?: ReactNode }) {
  return (
    <header className="bar no-print">
      <div className="bar-in">
        <a href="/" className="mark" aria-label="In Your Words, home">
          In your <b>words</b>
        </a>
        {nav}
        <ThemeToggle />
        {right}
      </div>
    </header>
  );
}

export function StateBlock({ title, children, action, alert = false }: { title: string; children?: ReactNode; action?: ReactNode; alert?: boolean }) {
  return (
    <div className="state" role={alert ? "alert" : "status"}>
      <b>{title}</b>
      {children}
      {action ? <div className="row">{action}</div> : null}
    </div>
  );
}

export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="err" id={id} role="alert">
      <Icon name="alert" />
      <span>{children}</span>
    </p>
  );
}

export type StepState = "waiting" | "running" | "done" | "failed";

const STEP_NAMES = ["Reading the posting and company", "Drafting from your stories", "Checking every sentence"];
const DATA_S: Record<StepState, string> = { waiting: "wait", running: "run", done: "done", failed: "fail" };

export function RunSteps({ steps, seconds }: { steps: [StepState, StepState, StepState]; seconds: number }) {
  return (
    <ol className="steps-run" aria-label="Steps" aria-live="polite">
      {steps.map((st, i) => (
        <li key={i} data-s={DATA_S[st]}>
          <span className="num">{i + 1}</span>
          <span>{STEP_NAMES[i]}</span>
          <span className="t">
            {st === "running" ? (
              <>
                <span className="spin" aria-hidden="true" />
                {formatSeconds(seconds)}
              </>
            ) : st === "done" ? (
              "done"
            ) : st === "failed" ? (
              "stopped"
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
