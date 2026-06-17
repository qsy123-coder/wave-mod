"use client";

import { useTransition } from "react";
import { Wrench } from "lucide-react";
import { toast } from "sonner";

import { fixMissingCreatedByAction } from "@/actions/admin/fix-creator-action";

export function FixCreatorButton() {
  const [isPending, startTransition] = useTransition();

  const handleFix = () => {
    startTransition(async () => {
      try {
        const result = await fixMissingCreatedByAction();

        if (result.error) {
          toast.error("修复失败", { description: result.error });
          return;
        }

        if (result.fixed === 0) {
          toast.success("无需修复", {
            description: "所有 MOD 都已关联创作者，没有缺失项。",
          });
        } else {
          toast.success(`已修复 ${result.fixed} 个 MOD`, {
            description: `${result.fixed} 个 MOD 的创作者信息已补齐，个人中心和排行榜将立即更新。`,
          });
        }
      } catch (error) {
        toast.error("修复失败", {
          description:
            error instanceof Error ? error.message : "请稍后再试。",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleFix}
      disabled={isPending}
      className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Wrench className="size-4" />
      {isPending ? "修复中…" : "补齐创作者"}
    </button>
  );
}
