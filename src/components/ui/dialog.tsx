"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be used within Dialog");
  return context;
}

type DialogProps = {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function Dialog({ children, defaultOpen = false, open, onOpenChange }: DialogProps) {
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
    <DialogContext.Provider value={{ open: currentOpen, setOpen }}>
      <div data-slot="dialog">{children}</div>
    </DialogContext.Provider>
  );
}

function DialogTrigger({ children, onClick, ...props }: React.ComponentProps<"button">) {
  const { setOpen } = useDialogContext();
  return (
    <button
      data-slot="dialog-trigger"
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DialogClose({ children, onClick, ...props }: React.ComponentProps<"button">) {
  const { setOpen } = useDialogContext();
  return (
    <button
      data-slot="dialog-close"
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DialogOverlay({ className, onClick, ...props }: React.ComponentProps<"div">) {
  const { setOpen } = useDialogContext();
  return (
    <div
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { open, setOpen } = useDialogContext();

  if (!open) return null;

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        data-slot="dialog-content"
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button
            type="button"
            variant="ghost"
            className="absolute top-2 right-2"
            size="icon-sm"
            onClick={() => setOpen(false)}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { setOpen } = useDialogContext();
  return (
    <div
      data-slot="dialog-footer"
      className={cn("-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="dialog-title" className={cn("font-heading text-base leading-none font-medium", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
