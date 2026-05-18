import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-4 border-black text-sm font-black uppercase tracking-[0.16em] text-black outline-none transition-all duration-100 ease-linear select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:not-aria-[haspopup]:translate-x-[2px] active:not-aria-[haspopup]:translate-y-[2px] active:not-aria-[haspopup]:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--neo-accent)] shadow-[6px_6px_0px_0px_#000]",
        outline: "bg-white shadow-[6px_6px_0px_0px_#000]",
        secondary: "bg-[var(--neo-secondary)] shadow-[6px_6px_0px_0px_#000]",
        ghost: "border-2 border-transparent bg-transparent shadow-none hover:border-black hover:bg-[var(--neo-accent)] hover:shadow-[4px_4px_0px_0px_#000]",
        destructive: "bg-[#ff5470] shadow-[6px_6px_0px_0px_#000]",
        link: "border-0 bg-transparent p-0 shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-4 py-2",
        xs: "h-8 px-3 text-[11px]",
        sm: "h-10 px-3 text-xs",
        lg: "h-14 px-6 text-base",
        icon: "size-12 p-0",
        "icon-xs": "size-8 border-2 p-0",
        "icon-sm": "size-10 p-0",
        "icon-lg": "size-14 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

function Button({ className, variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
