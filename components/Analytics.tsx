"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, track } from "@/lib/analytics";

export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    initAnalytics();
    track("page_viewed", { path, referrer: document.referrer || null });
  }, [path]);
  return null;
}
