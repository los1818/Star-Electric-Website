"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Record pages log a recent item while rendering, but the sidebar lives in the layout,
 * which doesn't re-render on client navigation. One refresh after mount picks it up.
 */
export function RefreshRecentItems() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
