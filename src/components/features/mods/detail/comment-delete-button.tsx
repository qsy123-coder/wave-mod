"use client";

import { useTransition } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import { deleteCommentAction } from "@/actions/mods/comment-actions";
import { Button } from "@/components/ui/button";

type CommentDeleteButtonProps = {
  commentId: string;
  modId: string;
  isAdmin: boolean;
  onDeleteFailure?: (commentId: string) => void;
  onOptimisticDelete?: (commentId: string) => void;
};

export function CommentDeleteButton({ commentId, modId, isAdmin, onDeleteFailure, onOptimisticDelete }: CommentDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (isPending) return;

    onOptimisticDelete?.(commentId);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("commentId", commentId);
      formData.set("modId", modId);

      try {
        await deleteCommentAction(formData);
      } catch {
        onDeleteFailure?.(commentId);
      }
    });
  };

  return (
    <Button variant="destructive" size="sm" type="button" onClick={handleDelete} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      {isPending ? "删除中" : isAdmin ? "管理员删除" : "删除评论"}
    </Button>
  );
}
