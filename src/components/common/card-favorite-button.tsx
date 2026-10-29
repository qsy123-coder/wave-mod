"use client";

import { Heart } from "lucide-react";
import { toast } from "sonner";

/**
 * 卡片上的收藏按钮。
 *
 * 已改成**受控组件**：收藏态与切换动作都由父级（ModCard）从互动 store 里取。
 * 原来的「未登录就跳登录页」整段删掉了 —— 现在游客点一下就直接收藏。
 * 乐观更新发生在 store 层，所以 `isFavorited` 在点击后立刻就会变。
 */
type Props = {
  isFavorited: boolean;
  onToggle: () => Promise<boolean>;
  inline?: boolean;
  /**
   * 追加类名。卡片用它按断点隐藏 —— 手机端卡片只留预览图，
   * 收藏按钮与名称都收进详情页（用户 2026-10-29 要求）。
   */
  className?: string;
};

export function CardFavoriteButton({ isFavorited, onToggle, inline, className }: Props) {
  const sharedClass = inline
    ? "inline-flex items-center gap-0.5 border-[2px] border-black bg-[var(--neo-panel)] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5"
    : "absolute bottom-12 right-2 z-20 inline-flex items-center gap-0.5 border-[2px] border-black bg-[var(--neo-panel)] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    void onToggle().then((ok) => {
      // 失败时 store 已经回滚了状态，这里只负责让用户知道原因
      if (!ok) toast.error("收藏没存上，稍后再试一次");
    });
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={isFavorited}
      className={`${sharedClass} cursor-pointer ${className ?? ""}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          handleClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      <Heart className={`size-2.5 ${isFavorited ? "fill-[var(--neo-accent)] text-[var(--neo-accent)]" : "text-black/50"}`} />
      <span className={`text-[8px] font-black uppercase ${isFavorited ? "text-[var(--neo-accent)]" : "text-black/50"}`}>收藏</span>
    </span>
  );
}
