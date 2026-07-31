"use client";

import Image from "next/image";
import Link from "next/link";
import { isExternalStorageUrl } from "@/lib/storage/shared";
import {
  Download,
  LoaderCircle,
  MoreVertical,
  Pin,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createCommentAction,
  deleteCommentAction,
  replyCommentAction,
  toggleCommentReactionAction,
  togglePinCommentAction,
} from "@/actions/mods/comment-actions";
import { rateModAction } from "@/actions/mods/rating-actions";
import type { GameConfig } from "@/config/games";
import type {
  ModComment,
  ModCommentSort,
  PaginatedResult,
  SiteMod,
} from "@/lib/mods";

type ViewerUser = {
  email?: string;
  id?: string;
  user_metadata?: { display_name?: string };
} | null;

type LocalComment = ModComment & { optimistic?: boolean };

type ZenlessCommentsSectionProps = {
  admin: boolean;
  comments: ModComment[];
  game: GameConfig;
  loggedIn: boolean;
  mod: SiteMod;
  recommendedMods: SiteMod[];
  user: ViewerUser;
  userName: string;
};

const COMMENTS_PAGE_SIZE = 10;
const ratingRows = [5, 4, 3, 2, 1];
const sortOptions: { label: string; value: ModCommentSort }[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Most liked", value: "most-liked" },
];
const panelClass =
  "border-4 border-black bg-[#07111f]/24 shadow-[5px_5px_0px_0px_#000] ring-1 ring-white/10 backdrop-blur-[2px]";

function compactNumber(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function commentLikes(comment: ModComment) {
  return (
    comment.likesCount ??
    Math.max(0, comment.id.length + (comment.content.length % 17))
  );
}

async function fetchCommentsPage(
  modId: string,
  page: number,
  sort: ModCommentSort,
) {
  const response = await fetch(
    `/api/mods/${modId}/comments?page=${page}&limit=${COMMENTS_PAGE_SIZE}&sort=${sort}`,
  );
  if (!response.ok) throw new Error("加载评论失败。");
  return response.json() as Promise<PaginatedResult<ModComment>>;
}

function formatCommentDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function userInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "U";
}

function CommentBadge({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-black uppercase ${tone}`}
    >
      {icon}
      {children}
    </span>
  );
}

function CommentComposer({
  loggedIn,
  modId,
  onCreate,
}: {
  loggedIn: boolean;
  modId: string;
  onCreate: (content: string) => void;
}) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const nextContent = content.trim();
    if (!nextContent) return;
    setContent("");
    startTransition(() => onCreate(nextContent));
  };

  if (!loggedIn) {
    return (
      <div className="flex items-center justify-between gap-4 border border-white/10 bg-[#0b1220]/34 p-4 text-sm font-bold text-slate-300">
        <span>登录后即可发表评论。</span>
        <Link
          href={`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`}
          className="border border-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white"
        >
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-3 border border-white/10 bg-[#0b1220]/34 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-[#111827] text-xs font-black text-white">
        ME
      </div>
      <div className="min-w-0 flex-1">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          placeholder="Write a comment..."
          className="min-h-16 w-full resize-none border border-white/10 bg-[#050914]/70 px-3 py-2 text-sm font-bold text-white outline-none placeholder:text-slate-500"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex gap-3 text-xs text-slate-500">
            <span>B</span>
            <span>I</span>
            <span>@</span>
            <span>◉</span>
            <span>{`</>`}</span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!content.trim()}
            className="border-2 border-black bg-[#172033]/80 px-5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_0_#000] disabled:opacity-45"
          >
            {pending ? "Posting" : "Post Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingSidebar({
  game,
  loggedIn,
  mod,
  recommendedMods,
}: {
  game: GameConfig;
  loggedIn: boolean;
  mod: SiteMod;
  recommendedMods: SiteMod[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticUserRating, setOptimisticUserRating] = useState(mod.userRating ?? null);
  const activeScore =
    hovered ?? optimisticUserRating ?? Math.round(mod.ratingAverage);
  const total = Math.max(mod.ratingCount, 1);

  const rate = (score: number) => {
    if (!loggedIn) {
      toast.error("请先登录后评分。");
      return;
    }

    const previousRating = optimisticUserRating;
    setOptimisticUserRating(score);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("modId", mod.id);
      formData.set("score", String(score));
      try {
        await rateModAction(formData);
        toast.success(`已提交 ${score} 星评分。`);
      } catch (error) {
        setOptimisticUserRating(previousRating);
        toast.error(
          error instanceof Error ? error.message : "评分失败，请稍后再试。",
        );
      }
    });
  };

  return (
    <aside className="space-y-4 animate-[zzzRatingRise_360ms_ease-out_both]">
      <section className={`${panelClass} p-4`}>
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
          Overall Rating
        </h3>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-4xl font-black text-white">
            {mod.ratingAverage.toFixed(1)}
          </span>
          <div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((score) => (
                <Star
                  key={score}
                  className={`size-4 ${score <= Math.round(mod.ratingAverage) ? "fill-white text-white" : "text-slate-600"}`}
                />
              ))}
            </div>
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              {mod.ratingCount} ratings
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          {ratingRows.map((score) => {
            const count = Math.max(1, Math.round((total / (6 - score)) * 0.18));
            const width = Math.min(92, Math.max(8, (count / total) * 100));
            return (
              <div
                key={score}
                className="grid grid-cols-[18px_1fr_34px] items-center gap-2 text-[10px] font-bold text-slate-400"
              >
                <span>{score}</span>
                <div className="h-1.5 border border-black bg-[#050914]">
                  <div
                    className="h-full bg-slate-300"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-right">{count}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Rate This Mod
          </p>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                disabled={pending}
                onMouseEnter={() => setHovered(score)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(score)}
                onBlur={() => setHovered(null)}
                onClick={() => rate(score)}
                className="border-2 border-black bg-[#0b1220]/70 p-1.5 shadow-[2px_2px_0_0_#000]"
              >
                <Star
                  className={`size-4 ${score <= activeScore ? "fill-white text-white" : "text-slate-600"}`}
                />
              </button>
            ))}
          </div>
        </div>
      </section>
      <section
        className={`${panelClass} animate-[zzzSideDrop_420ms_ease-out_80ms_both] p-4`}
      >
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
          Comment Rules
        </h3>
        <ul className="mt-3 list-inside list-disc space-y-1 text-[11px] font-bold leading-5 text-slate-400">
          <li>Be respectful and civil to others.</li>
          <li>Do not spam or self-promote.</li>
          <li>No offensive or inappropriate content.</li>
          <li>Report bugs or issues politely.</li>
          <li>Follow modding guidelines.</li>
        </ul>
      </section>
      <section
        className={`${panelClass} animate-[zzzSideDrop_420ms_ease-out_140ms_both] p-4`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">
            Related Mods
          </h3>
          <Link
            href={game.nav.mods}
            className="text-[10px] font-black uppercase text-slate-500"
          >
            View All
          </Link>
        </div>
        <div className="mt-3 space-y-2.5">
          {recommendedMods.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={`${game.nav.mods}/${item.id}`}
              className="group grid grid-cols-[52px_1fr] gap-3 border-2 border-black bg-[#08111f]/60 p-2 shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 hover:bg-[#111c2e]/75"
            >
              <div className="relative size-[52px] overflow-hidden border-2 border-black bg-[#050914]">
                <Image
                  src={item.coverImage}
                  alt={item.title}
                  fill
                  sizes="52px"
                  className="object-cover transition duration-300 group-hover:scale-110"
                  unoptimized={isExternalStorageUrl(item.coverImage ?? "")}
                />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-1 text-[12px] font-black text-white">
                  {item.title}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <div className="relative size-4 overflow-hidden rounded-full border border-black bg-[#111827]">
                    <Image
                      src={item.coverImage}
                      alt={item.character}
                      fill
                      sizes="16px"
                      className="object-cover"
                    />
                  </div>
                  <span className="line-clamp-1">{item.character}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] font-black text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3" />
                    {compactNumber(item.downloads)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3 fill-slate-300 text-slate-300" />
                    {item.ratingAverage.toFixed(1)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function ZenlessCommentsSection({
  admin,
  comments,
  game,
  loggedIn,
  mod,
  recommendedMods,
  user,
  userName,
}: ZenlessCommentsSectionProps) {
  const [sort, setSort] = useState<ModCommentSort>("newest");
  const [localComments, setLocalComments] = useState<LocalComment[]>(comments);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(
    comments.length >= COMMENTS_PAGE_SIZE ? 2 : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingReactionId, setPendingReactionId] = useState<string | null>(
    null,
  );
  const [replyContent, setReplyContent] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [expandedReplyIds, setExpandedReplyIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const visibleComments = useMemo(() => {
    const list = localComments.filter(
      (comment) => !removedIds.includes(comment.id),
    );
    const pinnedWeight = (comment: LocalComment) => comment.isPinned ? 1 : 0;
    if (sort === "oldest")
      return [...list].sort(
        (a, b) => pinnedWeight(b) - pinnedWeight(a) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
    if (sort === "most-liked")
      return [...list].sort(
        (a, b) =>
          pinnedWeight(b) - pinnedWeight(a) ||
          commentLikes(b) - commentLikes(a) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    return [...list].sort(
      (a, b) => pinnedWeight(b) - pinnedWeight(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [localComments, removedIds, sort]);

  const createComment = (content: string) => {
    const clientId = `optimistic-${crypto.randomUUID()}`;
    setSort("newest");
    setRemovedIds((current) => current.filter((id) => id !== clientId));
    setLocalComments((current) => [
      {
        id: clientId,
        content,
        createdAt: new Date().toISOString(),
        optimistic: true,
        user: { avatarUrl: null, displayName: userName, id: user?.id ?? null },
      },
      ...current,
    ]);
    const formData = new FormData();
    formData.set("id", mod.id);
    formData.set("content", content);
    void createCommentAction(formData)
      .then((created) =>
        setLocalComments((current) =>
          current.map((comment) =>
            comment.id === clientId ? (created as LocalComment) : comment,
          ),
        ),
      )
      .catch(() =>
        setLocalComments((current) =>
          current.filter((comment) => comment.id !== clientId),
        ),
      );
  };

  const changeSort = async (nextSort: ModCommentSort) => {
    if (nextSort === sort || isLoading) return;
    setSort(nextSort);
    setIsLoading(true);
    try {
      const page = await fetchCommentsPage(mod.id, 1, nextSort);
      setLocalComments(page.items);
      setRemovedIds([]);
      setNextPage(page.nextPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换排序失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextPage || isLoading) return;
    setIsLoading(true);
    try {
      const page = await fetchCommentsPage(mod.id, nextPage, sort);
      setLocalComments((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((comment) => comment.id === item.id),
        ),
      ]);
      setNextPage(page.nextPage);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "加载更多评论失败。",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const reactToComment = async (comment: LocalComment, value: 1 | -1) => {
    if (!loggedIn) {
      toast.error("请先登录后再评价评论。");
      return;
    }

    setPendingReactionId(comment.id);
    const previousReaction = comment.userReaction ?? null;
    const nextReaction = previousReaction === value ? null : value;
    const likeDelta =
      (nextReaction === 1 ? 1 : 0) - (previousReaction === 1 ? 1 : 0);
    const dislikeDelta =
      (nextReaction === -1 ? 1 : 0) - (previousReaction === -1 ? 1 : 0);
    setLocalComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              dislikesCount: Math.max(
                0,
                (item.dislikesCount ?? 0) + dislikeDelta,
              ),
              likesCount: Math.max(0, (item.likesCount ?? 0) + likeDelta),
              userReaction: nextReaction,
            }
          : item,
      ),
    );

    const formData = new FormData();
    formData.set("commentId", comment.id);
    formData.set("modId", mod.id);
    formData.set("value", String(value));
    try {
      const result = await toggleCommentReactionAction(formData);
      const userReaction = result.userReaction === 1 || result.userReaction === -1 ? result.userReaction : null;
      setLocalComments((current) =>
        current.map((item) =>
          item.id === result.commentId
            ? {
                ...item,
                dislikesCount: result.dislikesCount,
                likesCount: result.likesCount,
                userReaction,
              }
            : item,
        ),
      );
    } catch (error) {
      setLocalComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                dislikesCount: comment.dislikesCount ?? 0,
                likesCount: comment.likesCount ?? 0,
                userReaction: previousReaction,
              }
            : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : "评价失败。");
    } finally {
      setPendingReactionId(null);
    }
  };

  const replyToComment = async (comment: LocalComment) => {
    const content = replyContent.trim();
    if (!content) return;
    if (!loggedIn) {
      toast.error("请先登录后再回复评论。");
      return;
    }

    const clientId = `reply-${crypto.randomUUID()}`;
    const optimisticReply: LocalComment = {
      id: clientId,
      content,
      createdAt: new Date().toISOString(),
      optimistic: true,
      parentId: comment.id,
      replies: [],
      user: { avatarUrl: null, displayName: userName, id: user?.id ?? null },
    };
    setReplyContent("");
    setExpandedReplyIds((current) => current.includes(comment.id) ? current : [...current, comment.id]);
    setLocalComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? { ...item, replies: [...(item.replies ?? []), optimisticReply] }
          : item,
      ),
    );

    const formData = new FormData();
    formData.set("content", content);
    formData.set("modId", mod.id);
    formData.set("parentId", comment.id);
    try {
      const created = await replyCommentAction(formData);
      setLocalComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                replies: (item.replies ?? []).map((reply) =>
                  reply.id === clientId ? (created as LocalComment) : reply,
                ),
              }
            : item,
        ),
      );
    } catch (error) {
      setLocalComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                replies: (item.replies ?? []).filter(
                  (reply) => reply.id !== clientId,
                ),
              }
            : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : "回复失败。");
    }
  };

  const removeComment = (comment: LocalComment) => {
    if (comment.optimistic) return;
    setOpenMenuId(null);
    setPendingDeleteId(comment.id);
    setRemovedIds((current) => [...current, comment.id]);
    const formData = new FormData();
    formData.set("commentId", comment.id);
    formData.set("modId", mod.id);
    void deleteCommentAction(formData)
      .catch(() =>
        setRemovedIds((current) => current.filter((id) => id !== comment.id)),
      )
      .finally(() => setPendingDeleteId(null));
  };

  const togglePinnedComment = async (comment: LocalComment) => {
    if (!admin || comment.optimistic) return;
    const nextPinned = !comment.isPinned;
    setOpenMenuId(null);
    setLocalComments((current) => current.map((item) => item.id === comment.id ? { ...item, isPinned: nextPinned } : item));

    const formData = new FormData();
    formData.set("commentId", comment.id);
    formData.set("isPinned", String(nextPinned));
    formData.set("modId", mod.id);

    try {
      const result = await togglePinCommentAction(formData);
      setLocalComments((current) => current.map((item) => item.id === result.commentId ? { ...item, isPinned: result.isPinned } : item));
    } catch (error) {
      setLocalComments((current) => current.map((item) => item.id === comment.id ? { ...item, isPinned: comment.isPinned } : item));
      toast.error(error instanceof Error ? error.message : "置顶失败。");
    }
  };

  return (
    <section className="animate-[zzzCommentsExpand_420ms_ease-out_both]">
      <style>{`@keyframes zzzCommentsExpand{from{opacity:.35;transform:translateY(42px) scaleY(.94);transform-origin:top}to{opacity:1;transform:translateY(0) scaleY(1)}}@keyframes zzzRatingRise{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:translateY(0)}}@keyframes zzzSideDrop{from{opacity:0;transform:translateY(-38px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`${panelClass} p-4`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">
              Comments ({visibleComments.length})
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Sort by
              </span>
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void changeSort(option.value)}
                  className={`border border-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] transition ${sort === option.value ? "bg-white text-black" : "bg-[#0b1220]/55 text-slate-400 hover:text-white"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <CommentComposer
            loggedIn={loggedIn}
            modId={mod.id}
            onCreate={createComment}
          />
          <div className="mt-4 divide-y divide-white/10 border-t border-white/10">
            {visibleComments.length ? (
              visibleComments.map((comment) => {
                const canDelete =
                  Boolean(user?.id && (comment.user.id === user.id || admin)) &&
                  !comment.optimistic;
                const isCurrentUser = Boolean(
                  user?.id && comment.user.id === user.id,
                );
                const isCreator =
                  comment.user.role === "creator" ||
                  comment.user.displayName
                    .toLowerCase()
                    .includes(mod.character.toLowerCase()) ||
                  comment.user.displayName.toLowerCase().includes("creator");
                const isPinned = Boolean(comment.isPinned);
                const likes = commentLikes(comment);
                const dislikes = comment.dislikesCount ?? 0;
                const repliesCount = comment.replies?.length ?? 0;
                const repliesExpanded = expandedReplyIds.includes(comment.id);
                return (
                  <article
                    key={comment.id}
                    className={`py-4 ${comment.optimistic ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-[#111827] text-xs font-black text-white">
                        {comment.user.avatarUrl ? (
                          <Image
                            src={comment.user.avatarUrl}
                            alt={comment.user.displayName}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : (
                          userInitial(comment.user.displayName)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-white">
                            {comment.user.displayName}
                          </p>
                          {isPinned ? (
                            <CommentBadge
                              tone="border-[#8aa4ff]/50 bg-[#13244a]/75 text-[#cbd7ff]"
                              icon={<Pin className="size-3" />}
                            >
                              Pinned
                            </CommentBadge>
                          ) : null}
                          {isCreator ? (
                            <CommentBadge
                              tone="border-[#f7d37a]/50 bg-[#3d2b0b]/75 text-[#ffe1a3]"
                              icon={<Star className="size-3 fill-current" />}
                            >
                              Creator
                            </CommentBadge>
                          ) : null}
                          {comment.user.role === "admin" ? (
                            <CommentBadge
                              tone="border-[#ff8a8a]/50 bg-[#3a1116]/75 text-[#ffc3c3]"
                              icon={<ShieldCheck className="size-3" />}
                            >
                              Admin
                            </CommentBadge>
                          ) : null}
                          {isCurrentUser ? (
                            <CommentBadge
                              tone="border-white/15 bg-white/10 text-white"
                              icon={<UserRound className="size-3" />}
                            >
                              Author
                            </CommentBadge>
                          ) : null}
                          <span className="text-[11px] font-bold text-slate-500">
                            {comment.optimistic
                              ? "Just now"
                              : formatCommentDate(comment.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-300">
                          {comment.content}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-bold text-slate-500">
                          <button
                            type="button"
                            onClick={() => void reactToComment(comment, 1)}
                            disabled={pendingReactionId === comment.id}
                            className={`inline-flex items-center gap-1 transition hover:text-white ${comment.userReaction === 1 ? "text-white" : ""}`}
                          >
                            <ThumbsUp className="size-3" />
                            {likes}
                          </button>
                          <button
                            type="button"
                            onClick={() => void reactToComment(comment, -1)}
                            disabled={pendingReactionId === comment.id}
                            className={`inline-flex items-center gap-1 transition hover:text-white ${comment.userReaction === -1 ? "text-white" : ""}`}
                          >
                            <ThumbsDown className="size-3" />
                            {dislikes}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setReplyToId(
                                replyToId === comment.id ? null : comment.id,
                              )
                            }
                            className="transition hover:text-white"
                          >
                            Reply
                          </button>
                          {repliesCount ? (
                            <button
                              type="button"
                              onClick={() => setExpandedReplyIds((current) => current.includes(comment.id) ? current.filter((id) => id !== comment.id) : [...current, comment.id])}
                              className="transition hover:text-white"
                            >
                              {repliesExpanded ? "Hide replies" : `Expand replies (${repliesCount})`}
                            </button>
                          ) : null}
                        </div>
                        {replyToId === comment.id ? (
                          <div className="mt-3 border border-white/10 bg-[#050914]/50 p-2">
                            <textarea
                              value={replyContent}
                              onChange={(event) =>
                                setReplyContent(event.target.value)
                              }
                              placeholder={`Reply to ${comment.user.displayName}...`}
                              className="min-h-14 w-full resize-none border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-white outline-none placeholder:text-slate-500"
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setReplyToId(null)}
                                className="px-3 py-1 text-[10px] font-black uppercase text-slate-500"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void replyToComment(comment)}
                                className="border border-white/15 px-3 py-1 text-[10px] font-black uppercase text-white"
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {repliesExpanded && comment.replies?.length ? (
                          <div className="mt-3 space-y-2 border-l-2 border-white/10 pl-3">
                            {comment.replies.map((reply) => (
                              <div
                                key={reply.id}
                                className="border border-white/10 bg-[#050914]/35 p-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-black text-white">
                                    {reply.user.displayName}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {(reply as LocalComment).optimistic
                                      ? "Just now"
                                      : formatCommentDate(reply.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-300">
                                  {reply.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="relative flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === comment.id ? null : comment.id)}
                          className="text-slate-500 hover:text-white"
                          aria-label="Comment actions"
                        >
                          <MoreVertical className="size-4" />
                        </button>
                        {openMenuId === comment.id ? (
                          <div className="absolute right-0 top-6 z-20 min-w-32 border-2 border-black bg-[#07111f] p-1 shadow-[4px_4px_0_0_#000] ring-1 ring-white/10">
                            {admin ? (
                              <button
                                type="button"
                                onClick={() => void togglePinnedComment(comment)}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-300 hover:bg-white/10 hover:text-white"
                              >
                                <Pin className="size-3" />
                                {comment.isPinned ? "Unpin" : "Pin"}
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => removeComment(comment)}
                                disabled={pendingDeleteId === comment.id}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                              >
                                <Trash2 className="size-3" />
                                Delete
                              </button>
                            ) : null}
                            {!admin && !canDelete ? (
                              <span className="block px-2 py-1.5 text-[10px] font-bold text-slate-500">No actions</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="py-8 text-center text-sm font-bold text-slate-400">
                暂无评论，成为第一个评论的玩家。
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={!nextPage || isLoading}
              className="inline-flex items-center gap-2 border border-white/10 px-6 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isLoading ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {isLoading
                ? "Loading"
                : nextPage
                  ? "Load More Comments"
                  : "No More Comments"}
            </button>
          </div>
        </div>
        <RatingSidebar
          game={game}
          loggedIn={loggedIn}
          mod={mod}
          recommendedMods={recommendedMods}
        />
      </div>
    </section>
  );
}
