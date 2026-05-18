"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SeparatorProps = React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
};

function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
