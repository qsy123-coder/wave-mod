"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteModAction } from "@/actions/admin/mod-actions";

type DeleteModButtonProps = {
  id: string;
  title: string;
};

export function DeleteModButton({ id, title }: DeleteModButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const confirmed = window.confirm(`确定删除《${title}》吗？此操作无法撤销。`);

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);

      try {
        await deleteModAction(formData);
        toast.success("MOD 已删除。", {
          description: `《${title}》已从后台列表和前台公开页移除。`,
        });
      } catch (error) {
        toast.error("删除失败", {
          description: error instanceof Error ? error.message : "请稍后再试。",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="neo-button-primary inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="size-4" />
      {isPending ? "删除中" : "删除"}
    </button>
  );
}
