"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Wraps SiteFooter with pathname-based visibility.
 * Hidden on /guide page; shown everywhere else.
 */
export function ConditionalFooter() {
  const pathname = usePathname();

  if (pathname === "/guide") return null;

  return <SiteFooter />;
}
