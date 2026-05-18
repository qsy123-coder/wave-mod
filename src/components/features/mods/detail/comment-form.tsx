"use client";

import { useState, useTransition } from "react";
import { MessageCircleMore } from "lucide-react";

import { createCommentAction } from "@/actions/mods/comment-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CreatedComment = {
  content: string;
  createdAt: string;
  id: string;
  user: {
    avatarUrl: string | null;
    displayName: string;
    id: string | null;
  };
};

type CommentFormProps = {
  modId: string;
  isLoggedIn: boolean;
  onOptimisticCreate?: (comment: { clientId: string; content: string }) => void;
  onOptimisticFailure?: (clientId: string) => void;
  onOptimisticSuccess?: (clientId: string, comment: CreatedComment) => void;
};

export function CommentForm({ modId, isLoggedIn, onOptimisticCreate, onOptimisticFailure, onOptimisticSuccess }: CommentFormProps) {
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");

  const handleSubmit = () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const clientId = `optimistic-${crypto.randomUUID()}`;
    setContent("");
    onOptimisticCreate?.({ clientId, content: trimmedContent });

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", modId);
      formData.set("content", trimmedContent);

      try {
        const createdComment = await createCommentAction(formData);
        onOptimisticSuccess?.(clientId, createdComment);
      } catch {
        onOptimisticFailure?.(clientId);
      }
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000]">
        <p className="text-sm font-bold leading-7 text-black/75">登录后即可发表评论，分享安装体验、适配版本和使用反馈。</p>
        <a href={`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`} className="neo-button-outline mt-4 inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-black uppercase tracking-[0.16em]">
          <MessageCircleMore className="size-4" />
          登录后评论
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000]">
      <div className="space-y-2">
        <Label htmlFor="content" className="text-sm font-black uppercase tracking-[0.14em] text-black">
          发表评论
        </Label>
        <Textarea
          id="content"
          name="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="写下你的安装体验、兼容版本、推荐理由或问题反馈……"
          maxLength={1000}
          required
        />
      </div>
      <Button type="button" className="w-full justify-center sm:w-auto" onClick={handleSubmit} disabled={!content.trim() || isPending}>
        <MessageCircleMore className="size-4" />
        {isPending ? "发布中" : "发布评论"}
      </Button>
    </div>
  );
}
