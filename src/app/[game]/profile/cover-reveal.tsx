"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";

type CoverRevealProps = {
  coverImage: string;
  coverAlt: string;
  height: string;
  children: ReactNode;
  actions?: ReactNode;
};

interface Stamp {
  x: number; y: number; born: number; seed: number; rmax: number;
}

/**
 * 封面区域 — 遮罩为封面图，鼠标擦除后露出页面背景
 */
export function CoverReveal({
  coverImage,
  coverAlt: _coverAlt,
  height,
  children,
  actions,
}: CoverRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stampsRef = useRef<Stamp[]>([]);
  const runningRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  // object-fit: cover 绘制参数缓存
  const coverRef = useRef({ sx: 0, sy: 0, sw: 0, sh: 0 });

  const brushSize = 80;
  const lifetime = 500;
  const rStart = 6;
  const rVary = 0.35;
  const stampStep = 8;
  const maxStamps = 120;

  // resize 必须在 useEffect 之前声明
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    dimsRef.current = { w, h };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx || !imgRef.current) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // object-fit: cover — 保持比例填满，居中裁剪
    const img = imgRef.current;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    coverRef.current = { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
    ctx.drawImage(img, coverRef.current.sx, coverRef.current.sy, sw, sh);
  }, []);

  // 加载封面图到内存（必须在 resize 之后）
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = coverImage;
    img.onload = () => {
      imgRef.current = img;
      resize();
    };
    return () => { imgRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverImage]);

  const addStamp = useCallback((x: number, y: number) => {
    const stamps = stampsRef.current;
    if (stamps.length >= maxStamps) stamps.shift();
    stamps.push({ x, y, born: performance.now(), seed: Math.random() * Math.PI * 2, rmax: brushSize * (1 - rVary + Math.random() * rVary) });
  }, []);

  const stampAlong = useCallback((x: number, y: number) => {
    const last = lastPosRef.current;
    if (!last) { addStamp(x, y); }
    else {
      const dx = x - last.x, dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / stampStep));
      for (let i = 1; i <= steps; i++) addStamp(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
    }
    lastPosRef.current = { x, y };
  }, [addStamp]);

  // loop 必须在 startLoop 之前声明
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = dimsRef.current;
    const now = performance.now();
    const stamps = stampsRef.current;
    const img = imgRef.current;

    // 重绘封面图（object-fit: cover）
    ctx.globalCompositeOperation = "source-over";
    if (img) {
      const { sx, sy, sw, sh } = coverRef.current;
      ctx.drawImage(img, sx, sy, sw, sh);
    }

    // 擦除
    ctx.globalCompositeOperation = "destination-out";
    for (let i = stamps.length - 1; i >= 0; i--) {
      const t = (now - stamps[i].born) / lifetime;
      if (t >= 1) { stamps.splice(i, 1); continue; }
      const ease = 1 - Math.pow(1 - t, 3);
      const r = rStart + (stamps[i].rmax - rStart) * ease;
      const alpha = 1 - t * t;
      const g = ctx.createRadialGradient(stamps[i].x, stamps[i].y, r * 0.2, stamps[i].x, stamps[i].y, r);
      g.addColorStop(0, `rgba(0,0,0,${0.95 * alpha})`);
      g.addColorStop(0.5, `rgba(0,0,0,${0.85 * alpha})`);
      g.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(stamps[i].x, stamps[i].y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (stamps.length) requestAnimationFrame(loop);
    else runningRef.current = false;
  }, []);

  const startLoop = useCallback(() => {
    if (!runningRef.current) { runningRef.current = true; requestAnimationFrame(loop); }
  }, [loop]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const getPos = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <section className={`relative ${height} shrink-0 overflow-hidden border-4 border-black shadow-[5px_5px_0px_0px_#000]`}>
      {/* Canvas：绘制封面图，鼠标移动擦除 → 露出下层页面背景 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        style={{ cursor: "none" }}
        onMouseEnter={(e) => {
          const pos = getPos(e);
          lastPosRef.current = pos;
          stampAlong(pos.x, pos.y);
          startLoop();
        }}
        onMouseMove={(e) => {
          const pos = getPos(e);
          stampAlong(pos.x, pos.y);
          startLoop();
        }}
        onMouseLeave={() => { lastPosRef.current = null; }}
      />

      {/* 内容层 — pointer-events-none 穿透到 canvas */}
      <div className="relative z-10 flex h-full items-center p-3 sm:p-4 pointer-events-none">
        {children}
        {/* 右下角操作按钮 */}
        {actions && (
          <div className="absolute right-3 bottom-3 sm:right-4 sm:bottom-4">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
