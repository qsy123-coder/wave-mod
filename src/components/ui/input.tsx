import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-14 w-full min-w-0 border-4 border-black bg-white px-4 py-2 text-base font-bold text-black shadow-[6px_6px_0px_0px_#000] outline-none placeholder:text-black/45 focus-visible:bg-[var(--neo-secondary)] focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-lg",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
