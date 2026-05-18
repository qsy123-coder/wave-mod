"use client";

import { useMemo, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { rateModAction } from "@/actions/mods/rating-actions";

const ratingOptions = [1, 2, 3, 4, 5] as const;

type RatingPanelProps = {
  modId: string;
  isLoggedIn: boolean;
  ratingAverage: number;
  ratingCount: number;
  userRating: number | null;
};

export function RatingPanel({ modId, isLoggedIn, ratingAverage, ratingCount, userRating }: RatingPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);

  const activeScore = hoveredScore ?? userRating ?? 0;
  const summaryText = useMemo(() => {
    if (hoveredScore) {
      return `准备打 ${hoveredScore} 星`;
    }

    if (userRating) {
      return `你已评分 ${userRating}/5`;
    }

    return "点击星星立即评分";
  }, [hoveredScore, userRating]);

  const handleRate = (score: number) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("modId", modId);
      formData.set("score", String(score));

      try {
        await rateModAction(formData);
        toast.success("评分已提交。", {
          description: `你刚刚给这条 MOD 打了 ${score} 星。`,
        });
      } catch (error) {
        toast.error("评分失败", {
          description: error instanceof Error ? error.message : "请稍后再试。",
        });
      }
    });
  };

  return (
    <div className="border-4 border-black bg-[#bcaeff] p-5 shadow-[8px_8px_0px_0px_#000]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="neo-label text-black/65">玩家评分</p>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-5xl font-black text-black">{ratingAverage.toFixed(1)}</p>
            <div className="pb-1 text-sm font-bold text-black/65">
              <p>{ratingCount} 人评分</p>
              <p>{summaryText}</p>
            </div>
          </div>
        </div>

        <div className="rounded-none border-4 border-black bg-[#ffd84f] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] shadow-[4px_4px_0px_0px_#000] text-black">
          Avg Score
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1">
        {Array.from({ length: 5 }, (_, index) => index + 1).map((score) => (
          <Star
            key={`avg-${score}`}
            className={`size-6 ${score <= Math.round(ratingAverage) ? "fill-black text-black" : "text-black/25"}`}
          />
        ))}
      </div>

      {!isLoggedIn ? (
        <a
          href={`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`}
          className="neo-button-outline mt-5 inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-black uppercase tracking-[0.16em]"
        >
          <Star className="size-4" />
          登录后评分
        </a>
      ) : (
        <div className="mt-5 rounded-none border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-black">点击星星评分</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ratingOptions.map((score) => {
              const active = score <= activeScore;

              return (
                <button
                  key={score}
                  type="button"
                  disabled={isPending}
                  onMouseEnter={() => setHoveredScore(score)}
                  onMouseLeave={() => setHoveredScore(null)}
                  onFocus={() => setHoveredScore(score)}
                  onBlur={() => setHoveredScore(null)}
                  onClick={() => handleRate(score)}
                  className="group inline-flex size-12 items-center justify-center rounded-none border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-1 hover:bg-[#ffd84f] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`评分 ${score} 星`}
                >
                  <Star className={`size-6 transition ${active ? "fill-[#ff7a00] text-[#ff7a00]" : "text-black/30 group-hover:text-[#ff7a00]"}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
