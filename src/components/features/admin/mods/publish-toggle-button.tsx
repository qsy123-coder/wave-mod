"use client";

import { useTransition } from "react";
import { EyeOff, RadioTower } from "lucide-react";
import { toast } from "sonner";

import { togglePublishAction } from "@/actions/admin/mod-actions";

type PublishToggleButtonProps = {
  id: string;
  isPublished: boolean;
  title: string;
};

export function PublishToggleButton({ id, isPublished, title }: PublishToggleButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const nextPublished = !isPublished;
    const confirmed = window.confirm(
      nextPublished
        ? `确定发布《${title}》吗？发布后会出现在首页、列表页和详情页。`
        : `确定下线《${title}》吗？下线后前台将不再展示，但后台仍会保留。`,
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("isPublished", String(nextPublished));

      try {
        await togglePublishAction(formData);
        toast.success(nextPublished ? "MOD 已发布。" : "MOD 已下线。", {
          description: nextPublished
            ? `《${title}》现在会展示在前台页面。`
            : `《${title}》已从前台隐藏，但后台记录仍然保留。`,
        });
      } catch (error) {
        toast.error("状态切换失败", {
          description: error instanceof Error ? error.message : "请稍后再试。",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className="neo-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPublished ? <EyeOff className="size-4" /> : <RadioTower className="size-4" />}
      {isPending ? "切换中" : isPublished ? "下线" : "发布"}
    </button>
  );
}
