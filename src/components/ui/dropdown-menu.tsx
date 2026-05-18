"use client";

import * as React from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type DropdownMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenu components must be used within DropdownMenu");
  return context;
}

type DropdownMenuProps = {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function DropdownMenu({ children, defaultOpen = false, open, onOpenChange }: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const currentOpen = open ?? uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  return (
    <DropdownMenuContext.Provider value={{ open: currentOpen, setOpen }}>
      <div data-slot="dropdown-menu" className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuTrigger({ children, onClick, ...props }: React.ComponentProps<"button">) {
  const { open, setOpen } = useDropdownMenuContext();
  return (
    <button
      data-slot="dropdown-menu-trigger"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuContent({
  align: _align,
  alignOffset: _alignOffset,
  side: _side,
  sideOffset: _sideOffset,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "start" | "center" | "end";
  alignOffset?: number;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}) {
  void _align;
  void _alignOffset;
  void _side;
  void _sideOffset;

  const { open } = useDropdownMenuContext();
  if (!open) return null;

  return (
    <DropdownMenuPortal>
      <div
        data-slot="dropdown-menu-content"
        role="menu"
        className={cn("absolute z-50 mt-2 min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none", className)}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-group" role="group" {...props} />;
}

function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<"div"> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("px-1.5 py-1 text-xs font-medium text-muted-foreground data-[inset=true]:pl-7", className)}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      role="menuitem"
      type="button"
      className={cn(
        "group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[inset=true]:pl-7 data-[variant=destructive]:text-destructive disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ children }: { children?: React.ReactNode }) {
  return <div data-slot="dropdown-menu-sub">{children}</div>;
}

function DropdownMenuSubTrigger({ className, inset, children, ...props }: React.ComponentProps<"button"> & { inset?: boolean }) {
  return (
    <DropdownMenuItem data-slot="dropdown-menu-sub-trigger" data-inset={inset} className={className} {...props}>
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuItem>
  );
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent data-slot="dropdown-menu-sub-content" className={cn("w-auto min-w-[96px]", className)} {...props} />;
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<"button"> & {
  checked?: boolean;
  inset?: boolean;
}) {
  return (
    <DropdownMenuItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      role="menuitemcheckbox"
      aria-checked={checked}
      className={cn("pr-8", className)}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-checkbox-item-indicator">
        {checked ? <CheckIcon /> : null}
      </span>
      {children}
    </DropdownMenuItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-radio-group" role="radiogroup" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<"button"> & {
  checked?: boolean;
  inset?: boolean;
}) {
  return (
    <DropdownMenuItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      role="menuitemradio"
      aria-checked={checked}
      className={cn("pr-8", className)}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-radio-item-indicator">
        {checked ? <CheckIcon /> : null}
      </span>
      {children}
    </DropdownMenuItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-separator" role="separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
