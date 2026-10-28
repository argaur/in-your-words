"use client";

/** v2 coming-soon screens: one shared page that names the feature and what it will do. */
import { use } from "react";
import { AppShell, Soon } from "@/components/v2/shell";
import { SOON } from "@/lib/product";

export default function SoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const page = SOON.find((s) => s.slug === slug);
  return (
    <AppShell>
      <section className="stack loose" aria-labelledby="soon-h">
        <div className="head-block">
          <div>
            <a className="textbtn" href="/app">Back home</a>
          </div>
          <div>
            <Soon />
          </div>
          <h1 id="soon-h" className="title">{page?.name ?? "Coming soon"}</h1>
          {page ? <p className="meta">{page.what}</p> : null}
        </div>
        {page ? (
          <ol className="howto">
            {page.how.slice(0, 3).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        ) : null}
        <p>It builds on the same story bank you use for job applications today.</p>
        <div>
          <a className="btn" href="/app/new">Start a job application</a>
        </div>
      </section>
    </AppShell>
  );
}
