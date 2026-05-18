import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full border-4 border-black bg-white px-4 py-3 text-base font-bold text-black shadow-[6px_6px_0px_0px_#000] outline-none placeholder:text-black/45 focus-visible:bg-[var(--neo-secondary)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-lg",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
