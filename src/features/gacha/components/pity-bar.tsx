"use client";

/** 保底进度条：垫抽 / 硬保底。快满时换成强调色。 */
export function PityBar({ current, hardPity }: { current: number; hardPity: number }) {
  const percentage = Math.min(100, Math.max(0, (current / hardPity) * 100));

  return (
    <div
      className="h-3.5 w-full border-2 border-black bg-white"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={hardPity}
      aria-valuenow={current}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{
          width: `${percentage}%`,
          background: percentage >= 90 ? "var(--neo-accent)" : "var(--neo-secondary)",
        }}
      />
    </div>
  );
}
