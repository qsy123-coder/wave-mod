"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error("Sheet components must be used within Sheet");
  return context;
}

type SheetProps = {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function Sheet({ children, defaultOpen = false, open, onOpenChange }: SheetProps) {
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
    <SheetContext.Provider value={{ open: currentOpen, setOpen }}>
      <div data-slot="sheet">{children}</div>
    </SheetContext.Provider>
  );
}

function SheetTrigger({ children, onClick, ...props }: React.ComponentProps<"button">) {
  const { setOpen } = useSheetContext();
  return (
    <button
      data-slot="sheet-trigger"
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

function SheetClose({ children, onClick, ...props }: React.ComponentProps<"button">) {
  const { setOpen } = useSheetContext();
  return (
    <button
      data-slot="sheet-close"
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

/**
 * 抽屉内容必须 portal 到 `<body>`，不能原地渲染。
 *
 * 原地渲染时，只要调用方在带 `transform` / `translate` / `will-change`（这几种属性）
 * 的祖先里，CSS 就会把这个祖先当成 `position: fixed` 元素的**包含块** —— 抽屉不再
 * 相对视口定位，而是被塞进那个祖先的盒子里。
 *
 * 踩过的坑（2026-11-01）：手机端右上角导航图标打开「站点导航」抽屉，抽屉被塞进
 * sticky header（`will-change-[translate,opacity]`）里，只有 header 那么高、贴在
 * 页面顶部。同款地雷还有：瀑布流容器在 FLIP 过渡期间带 `transform`，
 * 以及在抽屉内部再开一层抽屉（share-mod-dialog 早就自己 portal 到 body 绕开）。
 *
 * 首帧返回 null 是给 SSR 让路：服务端没有 document，客户端首帧也要与 SSR 一致，
 * 挂载后再真正 portal。
 */
function SheetPortal({ children }: { children?: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function SheetOverlay({ className, onClick, ...props }: React.ComponentProps<"div">) {
  const { setOpen } = useSheetContext();
  return (
    <div
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-black/10 transition-opacity duration-300 ease-out will-change-[opacity] supports-backdrop-filter:backdrop-blur-xs", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  overlayClassName,
  customWidth,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * `center` 是纯增量变体（2026-10-20 加，给 mod 详情用）：不贴边、不位移，
   * 以 `inset-0 + m-auto + max-h` 居中，入场走 `.sheet-enter-center` 的淡入缩放。
   * 其余四个方向的行为一行都没改。
   */
  side?: "top" | "right" | "bottom" | "left" | "center";
  showCloseButton?: boolean;
  overlayClassName?: string;
  customWidth?: boolean;
}) {
  const { open, setOpen } = useSheetContext();
  // 初始就按 open 渲染：抽屉是「挂载即打开」的（ModDetailDrawer 的 isOpen 初值为 true），
  // 如果这里从 false 起步，第一次打开会先渲染 null、再 setState、再等两帧 —— 主线程一忙
  // 两次 rAF 可能落在同一帧里，浏览器直接画出最终位置，位移动画就“消失”了。
  const [visible, setVisible] = React.useState(open);

  // 入场由 globals.css 的 .sheet-enter-* 关键帧负责（元素插入即播放），
  // 这里只负责挂载/卸载与 body 滚动锁：
  //   打开 → visible=true；关闭 → 先让退场 transition 播完，再 visible=false。
  React.useEffect(() => {
    if (open) {
      setVisible(true);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }

    const exitTimer = setTimeout(() => setVisible(false), 300); // match duration-300
    return () => {
      clearTimeout(exitTimer);
    };
  }, [open]);

  if (!visible) return null;

  const isHorizontal = side === "left" || side === "right";
  const isCenter = side === "center";

  const translateClass = isCenter
    ? ""
    : isHorizontal
      ? side === "right"
        ? open ? "translate-x-0" : "translate-x-full"
        : open ? "translate-x-0" : "-translate-x-full"
      : side === "bottom"
        ? open ? "translate-y-0" : "translate-y-full"
        : open ? "-translate-y-0" : "-translate-y-full";

  // 居中态没有位移方向：退场用 opacity/scale 过渡，入场用 keyframes（与其它方向同一套思路）
  const enterClass = !open
    ? ""
    : side === "right"
      ? "sheet-enter-right"
      : side === "left"
        ? "sheet-enter-left"
        : side === "bottom"
          ? "sheet-enter-bottom"
          : isCenter
            ? "sheet-enter-center"
            : "sheet-enter-top";

  return (
    <SheetPortal>
      <SheetOverlay
        className={cn(
          overlayClassName,
          open ? "opacity-100 sheet-overlay-enter" : "opacity-0",
        )}
      />
      <div
        data-slot="sheet-content"
        data-side={side}
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg duration-300 ease-out will-change-transform transform-gpu",
          // 居中态退场要同时过渡 opacity 与 transform，其它方向只需要 transform
          isCenter ? "transition" : "transition-transform",
          translateClass,
          enterClass,
          // 高度上限交给调用方（手机要整屏、桌面要留边距），组件只负责居中与宽度夹层
          isCenter && [
            "inset-0 m-auto h-auto max-w-[calc(100vw-1.5rem)]",
            open ? "opacity-100 scale-100" : "opacity-0 scale-95",
          ],
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b",
          isHorizontal && !customWidth && [
            side === "left"
              ? "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-sm"
              : "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:sm:max-w-sm",
          ],
          isHorizontal && customWidth && [
            side === "left"
              ? "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:border-r"
              : "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:border-l",
          ],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button
            type="button"
            variant="ghost"
            className="absolute top-3 right-3"
            size="icon-sm"
            onClick={() => setOpen(false)}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="sheet-title" className={cn("font-heading text-base font-medium text-foreground", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
