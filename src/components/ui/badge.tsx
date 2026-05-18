import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 border-4 border-black px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0px_0px_#000] transition-all duration-100 ease-linear [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-[var(--neo-accent)]",
        secondary: "bg-[var(--neo-secondary)]",
        destructive: "bg-[#ff5470]",
        outline: "bg-white",
        ghost: "border-2 border-transparent bg-transparent shadow-none",
        link: "border-0 bg-transparent p-0 shadow-none underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
