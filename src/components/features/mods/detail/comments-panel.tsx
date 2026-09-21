"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import type { ModComment, PaginatedResult } from "@/lib/mods";
import { resolveCommentsViewState } from "@/lib/mods-domain/comments-status";

import { CommentDeleteButton } from "./comment-delete-button";
import { CommentForm } from "./comment-form";

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

type CommentItem = ModComment & {
  optimistic?: boolean;
};

type CommentsPanelProps = {
  admin: boolean;
  currentUserId?: string;
  currentUserName?: string;
  initialComments: ModComment[];
  /**
   * 服务端已经取不到评论（如 Supabase 网关被 restriction）。
   * 用于让首屏 HTML 就说实话，而不是先渲染「还没有玩家发表评论」再被客户端纠正。
   */
  initialDegraded?: boolean;
  isLoggedIn: boolean;
  modId: string;
};

const COMMENTS_PAGE_SIZE = 10;

async function fetchCommentsPage(url: string): Promise<PaginatedResult<ModComment>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("加载评论失败。");
  return response.json();
}

export function CommentsPanel({ admin, currentUserId, currentUserName = "我", initialComments, initialDegraded = false, isLoggedIn, modId }: CommentsPanelProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [optimisticComments, setOptimisticComments] = useState<CommentItem[]>([]);
  const [removedCommentIds, setRemovedCommentIds] = useState<string[]>([]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isError, isFetchedAfterMount, refetch } = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: ["mod-comments", modId],
    queryFn: async ({ pageParam }) => fetchCommentsPage(`/api/mods/${modId}/comments?page=${pageParam}&pageSize=${COMMENTS_PAGE_SIZE}`),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialData: {
      pageParams: [1],
      pages: [
        {
          hasMore: initialComments.length === COMMENTS_PAGE_SIZE,
          items: initialComments,
          nextPage: initialComments.length === COMMENTS_PAGE_SIZE ? 2 : null,
          page: 1,
          pageSize: COMMENTS_PAGE_SIZE,
          totalPages: initialComments.length > 0 ? 1 : 1,
        },
      ],
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "420px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const serverComments = useMemo(() => data?.pages.flatMap((page) => page.items) ?? initialComments, [data, initialComments]);
  const filteredServerComments = useMemo<CommentItem[]>(() => serverComments.filter((comment) => !removedCommentIds.includes(comment.id)), [removedCommentIds, serverComments]);
  const comments = useMemo<CommentItem[]>(() => [...optimisticComments, ...filteredServerComments], [filteredServerComments, optimisticComments]);

  // 「取不到」和「真的没有」必须分开：服务端降级时回 503，react-query 转成 isError，
  // 这里据此显示不同文案。此前两者都显示「还没有玩家发表评论」，把故障说成了空库。
  //
  // 第二个条件是给 SSR 首屏用的：服务端已经说取不到时，在客户端重新取成功之前
  // 一律按「取不到」渲染，免得先闪一下「还没有玩家发表评论」。
  const failed = isError || (initialDegraded && !isFetchedAfterMount);
  const viewState = resolveCommentsViewState({ itemCount: comments.length, failed });

  const handleOptimisticCreate = ({ clientId, content }: { clientId: string; content: string }) => {
    setOptimisticComments((currentComments) => [
      {
        id: clientId,
        content,
        createdAt: new Date().toISOString(),
        optimistic: true,
        user: {
          avatarUrl: null,
          displayName: currentUserName,
          id: currentUserId ?? null,
        },
      },
      ...currentComments,
    ]);
  };

  const handleOptimisticSuccess = (clientId: string, createdComment: CreatedComment) => {
    setOptimisticComments((currentComments) => [
      {
        content: createdComment.content,
        createdAt: createdComment.createdAt,
        id: createdComment.id,
        user: createdComment.user,
      },
      ...currentComments.filter((comment) => comment.id !== clientId),
    ]);
  };

  const handleOptimisticFailure = (clientId: string) => {
    setOptimisticComments((currentComments) => currentComments.filter((comment) => comment.id !== clientId));
  };

  const handleOptimisticDelete = (commentId: string) => {
    setOptimisticComments((currentComments) => currentComments.filter((comment) => comment.id !== commentId));
    setRemovedCommentIds((currentIds) => (currentIds.includes(commentId) ? currentIds : [...currentIds, commentId]));
  };

  const handleDeleteFailure = (commentId: string) => {
    setRemovedCommentIds((currentIds) => currentIds.filter((id) => id !== commentId));
  };

  return (
    <section data-comments-panel className="neo-card-lg bg-[#fff8ef] p-6 text-black">
      <div className="flex items-center gap-2"><MessageCircle className="size-5" /><h2 className="text-2xl font-black uppercase">评论区</h2></div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-black/55">
        {viewState === "unavailable" ? "评论数量暂时不可用" : `当前评论 ${comments.length} 条`}
      </p>
      <div className="mt-5">
        <CommentForm
          modId={modId}
          isLoggedIn={isLoggedIn}
          onOptimisticCreate={handleOptimisticCreate}
          onOptimisticFailure={handleOptimisticFailure}
          onOptimisticSuccess={handleOptimisticSuccess}
        />
      </div>
      <div className="mt-6 space-y-4">
        {viewState === "empty" ? (
          <div className="border-4 border-dashed border-black bg-white p-5 text-sm font-bold leading-7 text-black/70">还没有玩家发表评论。你可以先分享安装体验、适配版本或使用反馈，后面再继续接 Realtime 实时刷新。</div>
        ) : viewState === "unavailable" ? (
          <div role="alert" className="border-4 border-black bg-[#ffb5c3] p-5 text-sm font-bold leading-7 text-black shadow-[6px_6px_0px_0px_#000]">
            <p className="font-black">评论暂时加载不出来。</p>
            <p className="mt-1">这不是「没有评论」，是服务端现在取不到数据。</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <RefreshCw className="size-3.5" />
              重试
            </button>
          </div>
        ) : comments.map((comment, index) => {
          const canDelete = Boolean(currentUserId && (comment.user.id === currentUserId || admin)) && !comment.optimistic;
          const label = comment.user.id === currentUserId ? "我的评论" : admin ? "可管理" : "玩家评论";

          return (
            <MotionReveal key={comment.id} delay={0.08 + (index % 8) * 0.02} y={18} rotate={index % 2 === 0 ? -1 : 1}>
              <article className={`border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000] ${comment.optimistic ? "opacity-75" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center border-4 border-black bg-[#ffd84f] text-sm font-black uppercase shadow-[4px_4px_0px_0px_#000]">{comment.user.displayName.slice(0, 1)}</div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.14em] text-black">{comment.user.displayName}</p>
                      <p className="text-xs font-bold text-black/55">{comment.optimistic ? "刚刚" : new Date(comment.createdAt).toLocaleString("zh-CN")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="neo-sticker bg-[#bcaeff] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[#bcaeff]">{label}</Badge>
                    {canDelete ? <CommentDeleteButton commentId={comment.id} modId={modId} isAdmin={Boolean(admin && comment.user.id !== currentUserId)} onDeleteFailure={handleDeleteFailure} onOptimisticDelete={handleOptimisticDelete} /> : null}
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-7 text-black/80">{comment.content}</p>
              </article>
            </MotionReveal>
          );
        })}
      </div>

      {/* 降级时不显示「已全部加载完成」—— 取不到数据时那句话是误导 */}
      {viewState === "unavailable" ? null : (
        <div ref={sentinelRef} className="mt-6 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
            <LoaderCircle className={`size-4 ${isFetchingNextPage ? "animate-spin" : ""}`} />
            {hasNextPage ? "下滑自动加载更多评论" : "评论已经全部加载完成"}
          </div>
        </div>
      )}
    </section>
  );
}
