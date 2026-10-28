"use client";

/** v2 sample login (PRODUCT_V2.md section 4): screens only, no auth service, one seeded account. */
import { TopBar } from "@/components/brand";
import { track } from "@/lib/analytics";

export default function Login() {
  return (
    <>
      <TopBar />
      <main className="wrap stack loose">
        <div className="head-block">
          <h1 className="title">Welcome back</h1>
          <p className="meta">This demo has one test account with sample stories already in it. Sign-up opens later.</p>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            track("login_completed", { method: "demo" });
            window.location.href = "/app";
          }}
        >
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value="demo@inyourwords.app" readOnly />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" value="demo-account" readOnly aria-describedby="pw-hint" />
            <span className="hint" id="pw-hint">Test account. Filled in for you.</span>
          </div>
          <div className="row">
            <button className="btn" type="submit">
              Log in as the demo user
            </button>
            <a className="textbtn" href="/">
              Back
            </a>
          </div>
        </form>
        <p className="small">No password is checked and nothing you type is sent anywhere from this screen.</p>
      </main>
    </>
  );
}
