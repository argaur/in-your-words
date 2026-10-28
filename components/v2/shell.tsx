"use client";

/** v2 app frame: the top bar, the three places a user goes (bottom tabs on a phone), and the voice box. */
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Icon, TopBar } from "../brand";
import { useWorkspace } from "./workspace";

type Here = "home" | "stories" | "new";

export function AppShell({ children, wide = false, here, tabs = true }: { children: ReactNode; wide?: boolean; here?: Here; tabs?: boolean }) {
  const { local, seed } = useWorkspace();
  const links: [string, string, Here][] = [
    ["/app", "Home", "home"],
    ["/app/stories", "Stories", "stories"],
    ["/app/new", "New", "new"],
  ];
  const items = links.map(([href, name, key]) => (
    <a key={key} href={href} aria-current={here === key ? "page" : undefined}>
      {name}
    </a>
  ));
  return (
    <>
      <TopBar
        nav={
          <nav className="nav" aria-label="Main">
            {items}
          </nav>
        }
        right={<span className="who">{local ? "Local" : seed.persona ? "Demo" : ""}</span>}
      />
      <main className={`wrap${wide ? " wide" : ""}${tabs ? " has-tabs" : ""}`}>{children}</main>
      {tabs ? (
        <nav className="tabs no-print" aria-label="Main">
          {items}
        </nav>
      ) : null}
    </>
  );
}

/** The next story line ID, shown on the focused voice box: what she says becomes this sticker. */
export function useNextId(): string {
  const { lines } = useWorkspace();
  return `S${lines.reduce((m, l) => Math.max(m, Number(l.id.slice(1)) || 0), 0) + 1}`;
}

const PHONE = "(max-width: 767px), (pointer: coarse)";

function usePlaceholder(): string {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(PHONE);
    setPhone(m.matches);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone ? "Tap here, then the mic on your Wispr Flow keyboard." : "Hold your Wispr Flow key and speak.";
}

/** A big answer box built for dictation: Wispr Flow types straight into it. */
export const VoiceBox = forwardRef<
  HTMLTextAreaElement,
  {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    short?: boolean;
    nextId?: string;
    describedBy?: string;
    shut?: boolean;
  }
>(function VoiceBox({ id, label, value, onChange, hint, short = false, nextId, describedBy, shut = false }, ref) {
  const placeholder = usePlaceholder();
  return (
    <div className={`voice${shut ? " shut" : ""}`}>
      <div className="voice-head">
        <label htmlFor={id} className="lbl">
          <Icon name="mic" />
          {label}
        </label>
        {nextId ? (
          <span className="next" aria-hidden="true">
            Saved as <span className="stk empty">{nextId}</span>
          </span>
        ) : null}
      </div>
      <div className="field">
        <textarea
          ref={ref}
          id={id}
          className={short ? "short" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={[`${id}-hint`, describedBy].filter(Boolean).join(" ")}
          tabIndex={shut ? -1 : undefined}
        />
      </div>
      <span className="hint" id={`${id}-hint`}>
        {hint ?? "Speak it. Wispr Flow types for you. Typing works too."}
      </span>
    </div>
  );
});

export function Soon() {
  return <span className="tag">Coming soon</span>;
}
