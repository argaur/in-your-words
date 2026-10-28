"use client";

import { use } from "react";
import { StateBlock } from "@/components/brand";
import { AppShell } from "@/components/v2/shell";
import { Studio } from "@/components/v2/studio";
import { useWorkspace } from "@/components/v2/workspace";

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, ws } = useWorkspace();
  if (!ready) return <AppShell>{null}</AppShell>;
  const app = ws.apps.find((a) => a.id === decodeURIComponent(id));
  if (!app) {
    return (
      <AppShell>
        <StateBlock title="This application is not in this browser" action={<a className="btn" href="/app">Back home</a>}>
          <p>Applications are saved in the browser you made them in.</p>
        </StateBlock>
      </AppShell>
    );
  }
  return <Studio key={app.id} app={app} />;
}
