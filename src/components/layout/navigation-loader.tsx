"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CubeLoader from "@/components/ui/cube-loader";

/** 已知游戏 slug 集合 */
const GAME_SLUGS = new Set(["zenless-zone-zero", "genshin-impact"]);

function normalizeGameKey(segment: string): string {
  if (!segment) return "";
  if (GAME_SLUGS.has(segment)) return segment;
  return "";
}

function getGameName(key: string): string {
  if (!key) return "鸣潮";
  const map: Record<string, string> = { "zenless-zone-zero": "绝区零", "genshin-impact": "原神" };
  return map[key] ?? key;
}

/**
 * 跨游戏导航加载动画
 * 仅跨游戏切换时显示，同游戏内不触发
 */
export function NavigationLoader() {
  const pathname = usePathname();
  const gameKey = normalizeGameKey(pathname.split("/")[1] ?? "");
  const prevGameRef = useRef<string | null>(null);
  const isFirstRender = useRef(true);
  const [show, setShow] = useState(false);
  const [targetName, setTargetName] = useState("");

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevGameRef.current = gameKey;
      return;
    }
    if (gameKey !== prevGameRef.current) {
      setTargetName(getGameName(gameKey));
      setShow(true);
      prevGameRef.current = gameKey;
      const t = setTimeout(() => setShow(false), 1800);
      return () => clearTimeout(t);
    }
  }, [gameKey]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--neo-panel)]">
      {/* neo 网格背景 */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #000 1.5px, transparent 1.6px), linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)",
          backgroundSize: "24px 24px, 44px 44px, 44px 44px",
        }}
      />

      {/* 四角色块装饰 */}
      <div className="absolute left-10 top-10 h-14 w-14 -rotate-12 border-4 border-black shadow-[4px_4px_0_0_#000]"
        style={{ backgroundColor: "var(--neo-accent)" }} />
      <div className="absolute right-14 top-16 h-16 w-16 rotate-6 border-4 border-black rounded-full shadow-[4px_4px_0_0_#000]"
        style={{ backgroundColor: "var(--neo-muted)" }} />
      <div className="absolute bottom-16 left-16 h-12 w-12 -rotate-6 border-4 border-black shadow-[4px_4px_0_0_#000]"
        style={{ backgroundColor: "var(--neo-secondary)" }} />
      <div className="absolute right-10 bottom-10 h-10 w-10 rotate-12 border-4 border-black shadow-[4px_4px_0_0_#000]"
        style={{ backgroundColor: "var(--neo-accent)" }} />

      <CubeLoader targetName={targetName} />
    </div>
  );
}
