"use client";

/**
 * GalleryRenderer — 完整参照 chenglou/chenglou.github.io。
 *
 * 图片 DOM 完全命令式管理（createElement/appendChild），消除 React 重渲染导致的
 * body childList 突变 → scroll 重置问题。
 * 仅覆盖层和占位 div 由 React 渲染。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImageResolved, ViewMode } from "../types";

// ============================================================================
// 弹簧物理
// ============================================================================
const MS_PER_STEP = 4;
type Spring = { pos: number; dest: number; v: number };
const spring = (v: number): Spring => ({ pos: v, dest: v, v: 0 });
function springStep(s: Spring): void {
  const t = MS_PER_STEP / 1000;
  const a = -290 * (s.pos - s.dest) - 30 * s.v;
  s.v += a * t; s.pos += s.v * t;
}
function atRest(s: Spring): boolean { return Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01; }

// ============================================================================
// 布局常量
// ============================================================================
const GAP_X = 24, GAP_Y = 24, GAP_1D_X = 52;
const PAD_TOP = 40, GAP_TOP_PEEK = 40, HIT_AREA_1D = 100;
const PROMPT_H = 52, PROMPT_H_1D = 72;
const BOX_MIN_W = 220;

function calcCols(Wv: number): { cols: number; boxMaxW: number } {
  const cols = Math.max(1, Math.min(7, Math.floor((Wv - GAP_X) / (BOX_MIN_W + GAP_X))));
  return { cols, boxMaxW: Math.max(1, (Wv - GAP_X - cols * GAP_X) / cols) };
}

// ============================================================================
// prompt
// ============================================================================
const WORDS = ["starlight","crystal","phantom","velvet","hollow","ember","astral","neon","void","serene","prism","bloom","lunar","zenith","echo","drift","aurora","cascade","mirage","onyx","radiant","solace","twilight","verdant","wisp","arcane","blaze","celestial","divine","ethereal"];
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h = h & h; } return Math.abs(h); }
function genPrompt(id: number): string { const n = 4 + (hashStr(`g_${id}`) % 8); const w: string[] = []; for (let i = 0; i < n; i++) w.push(WORDS[hashStr(`g_${id}_${i}`) % WORDS.length]!); return w.join(" "); }

// ============================================================================
interface Box {
  id: number; naturalW: number; ar: number;
  sx: Spring; sy: Spring; x: Spring; y: Spring; scale: Spring; fx: Spring;
  node: HTMLDivElement; imgEl: HTMLImageElement; promptEl: HTMLElement;
}
interface Props {
  images: GalleryImageResolved[]; viewMode: ViewMode; activeIndex: number | null;
  onImageClick: (index: number) => void; onDismiss: () => void; onNext: () => void; onPrev: () => void;
}

// ============================================================================
export function GalleryRenderer(p: Props) {
  const { images, viewMode, activeIndex, onImageClick, onDismiss, onNext, onPrev } = p;

  const [ready, setReady] = useState(false);
  const [ph, setPh] = useState(0);
  const vpW = useRef(0); const vpH = useRef(0);

  const R = useRef({
    boxes: [] as Box[],
    focused: null as number | null,
    scrollY: 0,
    pointer: { x: -Infinity, y: -Infinity },
    raf: 0, prevT: 0, scheduled: false,
    anchor: 0,
    mode: "grid" as ViewMode,
    _rowsTop: [] as number[], _cols: 7,
    _initialFocused: null as number | null, _initialScrollY: 0, // 进入 1D 时的图片和滚动位置
  }).current;

  useEffect(() => { R.focused = activeIndex; }, [activeIndex]);

  // ---- 命令式创建图片 DOM（只执行一次，避免 React 重渲染导致 scroll 重置） ----
  const domCreated = useRef(false);
  const placeholderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (domCreated.current) return;
    domCreated.current = true;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const frag = document.createDocumentFragment();
    images.forEach((img, i) => {
      const node = document.createElement("div");
      node.setAttribute("data-id", String(img.id));
      Object.assign(node.style, {
        position: "absolute", top: "0", left: "0", overflow: "hidden",
        backgroundColor: "rgb(34, 36, 53)", borderRadius: "16px",
        boxShadow: "0 0px 2px 0 rgba(255, 255, 255, 0.2), 0 4px 28px 0 rgba(0, 0, 0, 0.4)",
        backgroundImage: `url(${img.src})`, backgroundSize: "100%", backgroundRepeat: "no-repeat",
        display: "none",
      });

      const imgEl = document.createElement("img");
      imgEl.alt = img.alt;
      imgEl.src = img.src;
      imgEl.style.cssText = "display:none;width:100%";

      const promptEl = document.createElement("figcaption");
      promptEl.style.cssText = "position:absolute;width:100%;box-sizing:border-box;padding:8px 12px 0 12px;color:rgb(192,198,205);font-size:14px;cursor:text;display:-webkit-box;-webkit-box-orient:vertical;font-family:\"DM Sans\",system-ui,-apple-system,sans-serif";
      // prompt 文本
      const textSpan = document.createElement("span");
      textSpan.innerHTML = `<span style="color:rgb(122,126,130);padding-right:2px">❝</span>${genPrompt(img.id)}`;
      textSpan.style.cssText = "overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical";
      promptEl.appendChild(textSpan);
      // 下载按钮（1D 模式可见）
      const dl = document.createElement("a");
      dl.href = `/api/gallery/${encodeURIComponent(img.filename)}`;
      dl.download = img.filename;
      dl.title = "下载图片";
      dl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(192,198,205)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      dl.style.cssText = "display:none;position:absolute;right:12px;bottom:8px;width:24px;height:24px;cursor:pointer;align-items:center;justify-content:center;border-radius:4px";
      dl.addEventListener("mouseenter", () => { dl.style.backgroundColor = "rgba(255,255,255,0.1)"; });
      dl.addEventListener("mouseleave", () => { dl.style.backgroundColor = "transparent"; });
      dl.addEventListener("click", (e) => { e.stopPropagation(); });
      promptEl.appendChild(dl);
      (node as any)._dlBtn = dl;

      node.append(imgEl, promptEl);
      frag.append(node);

      // 暂存引用，init effect 中创建 Box 时填充
      (node as any)._imgEl = imgEl;
      (node as any)._promptEl = promptEl;
    });

    // 插入占位 div 之后（占位 div 由 React 渲染）
    const placeholder = placeholderRef.current;
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(frag, placeholder.nextSibling);
    } else {
      document.body.appendChild(frag);
    }
  }, [images]);

  // ---- 滚动/视口 ----
  useEffect(() => {
    const upd = () => { vpW.current = window.innerWidth; vpH.current = window.innerHeight; setReady(true); };
    upd();
    window.addEventListener("resize", upd);
    const onScroll = () => { R.scrollY = window.scrollY; schedule(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("resize", upd); window.removeEventListener("scroll", onScroll); };
  }, [R]);

  // ---- render ----
  const render = useCallback((now: number): boolean => {
    const data = R.boxes; if (data.length === 0) return false;
    const Wv = vpW.current, Hv = vpH.current;
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scr = R.scrollY;
    const pointerX = R.pointer.x + window.scrollX;
    const pointerY = R.pointer.y + scr;
    const f = R.focused;

    const { cols, boxMaxW } = calcCols(Wv);
    const imgMaxH = boxMaxW + 100;

    // 第一遍：尺寸和行高
    const szX: number[] = [], szY: number[] = [], rowsTop: number[] = [PAD_TOP];
    { let rowMaxH = 0;
      for (let i = 0; i < data.length; i++) {
        const d = data[i]!;
        const ar = d.ar;
        const maxH = ar === 1 ? boxMaxW * 0.85 : ar < 1 ? imgMaxH : boxMaxW;
        const sx = Math.min(d.naturalW, boxMaxW, maxH * ar);
        const sy = sx / ar + PROMPT_H;
        szX.push(sx); szY.push(sy);
        rowMaxH = Math.max(rowMaxH, sy);
        if (i % cols === cols - 1 || i === data.length - 1) {
          rowsTop.push(rowsTop.at(-1)! + rowMaxH + GAP_Y);
          rowMaxH = 0;
        }
      }
    }

    let cursor = "auto";
    let adjustedScrollY = scr;
    const MAGNET = 40;

    if (f == null) {
      // === 2D grid ===
      for (let i = 0; i < data.length; i++) {
        const d = data[i]!;
        const r = Math.floor(i / cols);
        const rowMaxH = rowsTop[r + 1]! - GAP_Y - rowsTop[r]!;
        d.sx.dest = szX[i]!;
        d.sy.dest = szY[i]!;
        d.x.dest = GAP_X + (boxMaxW + GAP_X) * (i % cols) + (boxMaxW - szX[i]!) / 2;
        d.y.dest = rowsTop[r]! + (rowMaxH - szY[i]!) / 2;
        d.scale.dest = 1; d.fx.dest = 1;
      }
      // 磁吸
      const hit = hitTest2D(data, pointerX, pointerY);
      if (hit != null) {
        cursor = "zoom-in";
        const h = data[hit]!;
        h.x.dest += (pointerX - (h.x.dest + h.sx.dest / 2)) / MAGNET;
        h.y.dest += (pointerY - (h.y.dest + h.sy.dest / 2)) / MAGNET;
        h.scale.dest = 1.02;
      }
      // 锚点保持（忽略滚动条导致的微小宽度变化）
      const actualW = window.innerWidth;
      if (Math.abs(Wv - actualW) > 30) {
        const anchorY = data[R.anchor]!.y.dest - GAP_TOP_PEEK;
        adjustedScrollY = Math.max(0, anchorY);
        if (Math.abs(anchorY - adjustedScrollY) > Hv / 10) {
          let na = 0;
          for (; na < data.length; na += cols) {
            if (data[na]!.y.dest + data[na]!.sy.dest - adjustedScrollY > Hv / 5) break;
          }
          R.anchor = na;
        }
      }
    } else {
      // === 1D line ===
      const img1DH = Math.max(1, Hv - PAD_TOP - PROMPT_H_1D - GAP_Y);
      const box1DMaxW = Math.max(1, Wv - GAP_1D_X * 2 - HIT_AREA_1D * 2);

      let cl = HIT_AREA_1D + GAP_1D_X;
      for (let i = f - 1; i >= 0; i--) {
        cl -= Math.min(data[i]!.naturalW, box1DMaxW, img1DH * data[i]!.ar) * 0.7 + GAP_1D_X;
      }
      for (let i = 0; i < data.length; i++) {
        const d = data[i]!;
        const isF = i === f, sc = isF ? 1 : 0.7;
        const isx = Math.min(d.naturalW, box1DMaxW, img1DH * d.ar) * sc;
        const isy = isx / d.ar + PROMPT_H_1D;
        d.sx.dest = isx; d.sy.dest = isy;
        d.y.dest = Math.max(PAD_TOP, (Hv - isy) / 2) + adjustedScrollY;
        d.x.dest = isF ? (Wv - isx) / 2 : cl;
        d.scale.dest = 1; d.fx.dest = isF ? 1 : 0.2;
        if (isF) cl = Wv - HIT_AREA_1D; else cl += isx + GAP_1D_X;
      }
      const hit = hitTest1D(data, f, Wv, pointerX);
      cursor = hit == null ? "zoom-out" : "zoom-in";
      if (hit != null) { data[hit]!.scale.dest = 1.02; data[hit]!.fx.dest = 0.5; }
    }

    // 滚动补偿
    for (const d of data) d.y.pos += adjustedScrollY - scr;

    // 动画步进
    const dt = R.prevT ? now - R.prevT : 16.6; R.prevT = now;
    const steps = Math.max(1, Math.round(dt / MS_PER_STEP));
    let anim = false;
    if (!rm) {
      for (const d of data) {
        for (let s = 0; s < steps; s++) {
          springStep(d.sx); springStep(d.sy); springStep(d.x);
          springStep(d.y); springStep(d.scale); springStep(d.fx);
        }
        if (!atRest(d.sx)) anim = true; if (!atRest(d.sy)) anim = true;
        if (!atRest(d.x)) anim = true; if (!atRest(d.y)) anim = true;
        if (!atRest(d.scale)) anim = true; if (!atRest(d.fx)) anim = true;
      }
    } else {
      for (const d of data) {
        d.sx.pos = d.sx.dest; d.sy.pos = d.sy.dest; d.x.pos = d.x.dest;
        d.y.pos = d.y.dest; d.scale.pos = d.scale.dest; d.fx.pos = d.fx.dest;
      }
    }

    // DOM 写入
    const BUF_TOP = 100, BUF_BOT = 150;
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const n = d.node;
      const pn = d.promptEl;
      const imgEl = d.imgEl;

      const screenY = d.y.pos - adjustedScrollY;
      const onScreen =
        screenY <= Hv + BUF_BOT && screenY + d.sy.pos >= -BUF_TOP &&
        d.x.pos + d.sx.pos >= 0 && d.x.pos <= Wv + 100;

      if (!onScreen) { n.style.display = "none"; continue; }

      n.style.display = "";
      n.style.width = `${d.sx.pos}px`;
      n.style.height = `${d.sy.pos}px`;
      n.style.transform = `translate3d(${d.x.pos}px,${d.y.pos}px,0) scale(${d.scale.pos})`;
      n.style.zIndex = i === f ? `${data.length + 1}` : `${i + 1}`;

      if (f != null) {
        const near = i === f - 1 || i === f || i === f + 1;
        n.style.filter = near
          ? `brightness(${d.fx.pos * 100}%) blur(${Math.max(0, 6 - d.fx.pos * 6)}px)`
          : `brightness(${d.fx.pos * 100}%)`;
      } else { n.style.filter = "none"; }

      if (pn) {
        pn.style.top = `${d.sx.pos / d.ar}px`;
        const textSpan = pn.firstElementChild as HTMLElement | null;
        if (i === f) {
          pn.style.overflowY = "auto"; pn.style.height = `${PROMPT_H_1D - 8}px`;
          pn.style.webkitLineClamp = "999";
          if (textSpan) textSpan.style.paddingRight = "28px"; // 为下载按钮留空间
        } else {
          pn.style.overflowY = "hidden"; pn.style.height = `${PROMPT_H - 8}px`;
          pn.style.webkitLineClamp = "2";
          if (textSpan) textSpan.style.paddingRight = "0";
        }
      }
      if (imgEl) {
        imgEl.style.display = i === f && !anim ? "block" : "none";
        if (i === f && !anim) {
          const fullSrc = images[i]?.src;
          if (fullSrc && imgEl.src !== fullSrc) imgEl.src = fullSrc;
        }
      }
      // 下载按钮：仅在 1D 聚焦图且动画结束后显示
      const dlBtn = (n as any)._dlBtn as HTMLElement | undefined;
      if (dlBtn) {
        dlBtn.style.display = i === f && !anim ? "flex" : "none";
      }
    }

    document.body.style.cursor = cursor;
    document.body.style.overflowY = f == null ? "auto" : "hidden";

    // 仅在非模式转换时 scrollTo（模式转换由 dismiss handler 直接处理）
    const sameMode = R.mode === (f == null ? "grid" : "line");
    if (sameMode && Math.abs(adjustedScrollY - scr) > 0.5) {
      window.scrollTo({ top: adjustedScrollY, behavior: "instant" as ScrollBehavior });
    }

    R.scrollY = adjustedScrollY;
    R.mode = f == null ? "grid" : "line";
    R._rowsTop = rowsTop;
    R._cols = cols;
    return anim;
  }, [R, images]);

  function hitTest2D(data: Box[], px: number, py: number): number | null {
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      if (d.x.dest <= px && px < d.x.dest + d.sx.dest &&
          d.y.dest <= py && py < d.y.dest + d.sy.dest) return i;
    }
    return null;
  }
  function hitTest1D(data: Box[], focused: number, Wv: number, px: number): number | null {
    return focused > 0 && px <= HIT_AREA_1D ? Math.max(0, focused - 1)
      : focused < data.length - 1 && px >= Wv - HIT_AREA_1D ? Math.min(data.length - 1, focused + 1)
      : null;
  }

  // ---- schedule ----
  const schedule = useCallback(() => {
    if (R.scheduled) return; R.scheduled = true;
    R.raf = requestAnimationFrame((now: number) => {
      R.scheduled = false;
      if (render(now)) schedule();
    });
  }, [R, render]);

  // ---- 初始化 boxes + ph ----
  const initRef = useRef(false);
  useEffect(() => {
    if (!ready || initRef.current || !domCreated.current) return;
    const Wv = vpW.current, Hv = vpH.current;
    if (Wv === 0) return;

    const { cols, boxMaxW } = calcCols(Wv);
    const imgMaxH = boxMaxW + 100;

    R.boxes = images.map((img, i) => {
      const ar = img.aspectRatio;
      const maxH = ar === 1 ? boxMaxW * 0.85 : ar < 1 ? imgMaxH : boxMaxW;
      const sx = Math.min(img.width, boxMaxW, maxH * ar);
      const sy = sx / ar + PROMPT_H;

      // 找到对应的 DOM 节点
      const node = document.querySelector(`[data-id="${img.id}"]`) as HTMLDivElement;

      return {
        id: img.id, naturalW: img.width, ar,
        sx: spring(sx), sy: spring(sy),
        x: spring(Math.floor(i / cols) * -Wv - Wv),
        y: spring(Hv + Math.floor(i / cols) * imgMaxH),
        scale: spring(1), fx: spring(1),
        node: node!,
        imgEl: (node as any)?._imgEl as HTMLImageElement || null!,
        promptEl: (node as any)?._promptEl as HTMLElement || null!,
      };
    });

    let totalH = PAD_TOP; let rowMaxH = 0;
    for (let i = 0; i < R.boxes.length; i++) {
      const d = R.boxes[i]!;
      const ar = d.ar;
      const maxH = ar === 1 ? boxMaxW * 0.85 : ar < 1 ? imgMaxH : boxMaxW;
      const sy = Math.min(d.naturalW, boxMaxW, maxH * ar) / ar + PROMPT_H;
      rowMaxH = Math.max(rowMaxH, sy);
      if (i % cols === cols - 1 || i === R.boxes.length - 1) { totalH += rowMaxH + GAP_Y; rowMaxH = 0; }
    }
    setPh(totalH);
    initRef.current = true;
    schedule();
  }, [ready, images, R, schedule]);

  // ---- resize 重算 ph ----
  useEffect(() => {
    if (!ready || R.boxes.length === 0) return;
    const Wv = vpW.current; if (Wv === 0) return;
    const { cols, boxMaxW } = calcCols(Wv);
    const imgMaxH = boxMaxW + 100;
    let totalH = PAD_TOP; let rowMaxH = 0;
    for (let i = 0; i < R.boxes.length; i++) {
      const d = R.boxes[i]!;
      const ar = d.ar;
      const maxH = ar === 1 ? boxMaxW * 0.85 : ar < 1 ? imgMaxH : boxMaxW;
      const sy = Math.min(d.naturalW, boxMaxW, maxH * ar) / ar + PROMPT_H;
      rowMaxH = Math.max(rowMaxH, sy);
      if (i % cols === cols - 1 || i === R.boxes.length - 1) { totalH += rowMaxH + GAP_Y; rowMaxH = 0; }
    }
    setPh(totalH);
  }, [ready, viewMode]);

  useEffect(() => { if (ready) schedule(); }, [viewMode, activeIndex, ready, schedule]);

  // ---- body 背景 ----
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "rgb(1, 5, 19)";
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  // ---- 指针事件 ----
  useEffect(() => {
    const move = (e: PointerEvent) => { R.pointer = { x: e.clientX, y: e.clientY }; schedule(); };
    const leave = () => { R.pointer = { x: -Infinity, y: -Infinity }; schedule(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerleave", leave); };
  }, [R, schedule]);

  // ---- 点击 ----
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("figcaption")) return;

      const onImage = target?.closest("[data-id]");
      const f = R.focused;
      if (f == null) {
        if (onImage) {
          doClick(e.clientX, e.clientY);
        }
      } else {
        if (onImage) { doClick(e.clientX, e.clientY); }
        else if (R.focused != null) {
          dismiss1D();
        }
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [R, onDismiss]);

  // 退出 1D 模式，恢复滚动位置
  // 未切换图片 → 回到进入 1D 前的原位；切换过图片 → 滚动到最后查看图片的网格位置
  const dismiss1D = useCallback(() => {
    const idx = R.focused;
    const initialIdx = R._initialFocused;
    const initialScrollY = R._initialScrollY;
    onDismiss();
    document.body.style.overflowY = "auto";
    if (idx === initialIdx && initialScrollY > 0) {
      // 没有切换过图片，恢复原位
      window.scrollTo({ top: initialScrollY, behavior: "instant" as ScrollBehavior });
    } else if (idx != null && R._rowsTop.length > 0) {
      // 切换过图片，滚动到最后查看图片的网格行位置
      const row = Math.floor(idx / R._cols);
      const targetY = Math.max(0, (R._rowsTop[row] ?? 0) - GAP_Y - GAP_TOP_PEEK);
      if (targetY > 0) window.scrollTo({ top: targetY, behavior: "instant" as ScrollBehavior });
    }
  }, [onDismiss, R]);

  const doClick = useCallback((clientX: number, clientY: number) => {
    const pxLocal = clientX + window.scrollX;
    const pyLocal = clientY + window.scrollY; // 用实时值，不用可能过期的 R.scrollY
    const f = R.focused;
    if (f == null) {
      for (let i = 0; i < R.boxes.length; i++) {
        const b = R.boxes[i]!;
        if (b.x.dest <= pxLocal && pxLocal < b.x.dest + b.sx.dest &&
            b.y.dest <= pyLocal && pyLocal < b.y.dest + b.sy.dest) {
          // 在 1D 模式启动前同步保存 scroll 位置
          R._initialFocused = i;
          R._initialScrollY = window.scrollY;
          R.focused = i; schedule(); onImageClick(i); return;
        }
      }
    } else {
      const Wv = vpW.current;
      if (clientX <= HIT_AREA_1D) { onPrev(); schedule(); }
      else if (clientX >= Wv - HIT_AREA_1D) { onNext(); schedule(); }
      else { dismiss1D(); }
    }
  }, [R, schedule, onImageClick, onNext, onPrev, onDismiss]);

  // ---- 键盘 ----
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const f = R.focused;
      if (e.key === "Escape" && f != null) { dismiss1D(); return; }
      if (f != null) {
        if (e.key === "ArrowRight") onNext(); else if (e.key === "ArrowLeft") onPrev();
        schedule();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        R.focused = 0; onImageClick(0); schedule();
      }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [R, schedule, onImageClick, onDismiss, onNext, onPrev]);

  // ---- 滚轮 ----
  useEffect(() => {
    const wh = (e: WheelEvent) => {
      if (R.focused == null) return;
      e.preventDefault();
      (e.deltaY > 0 || e.deltaX > 0) ? onNext() : onPrev();
      schedule();
    };
    window.addEventListener("wheel", wh, { passive: false });
    return () => window.removeEventListener("wheel", wh);
  }, [R, schedule, onNext, onPrev]);

  const NOISE_BG = `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39ra2uRkZGZmZlpaWmXl5dvb29xcXGTk5NnZ2c8TV1mAAAAG3RSTlNAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAvEOwtAAAFVklEQVR4XpWWB67c2BUFb3g557T/hRo9/WUMZHlgr4Bg8Z4qQgQJlHI4A8SzFVrapvmTF9O7dmYRFZ60YiBhJRCgh1FYhiLAmdvX0CzTOpNE77ME0Zty/nWWzchDtiqrmQDeuv3powQ5ta2eN0FY0InkqDD73lT9c9lEzwUNqgFHs9VQce3TVClFCQrSTfOiYkVJQBmpbq2L6iZavPnAPcoU0dSw0SUTqz/GtrGuXfbyyBniKykOWQWGqwwMA7QiYAxi+IlPdqo+hYHnUt5ZPfnsHJyNiDtnpJyayNBkF6cWoYGAMY92U2hXHF/C1M8uP/ZtYdiuj26UdAdQQSXQErwSOMzt/XWRWAz5GuSBIkwG1H3FabJ2OsUOUhGC6tK4EMtJO0ttC6IBD3kM0ve0tJwMdSfjZo+EEISaeTr9P3wYrGjXqyC1krcKdhMpxEnt5JetoulscpyzhXN5FRpuPHvbeQaKxFAEB6EN+cYN6xD7RYGpXpNndMmZgM5Dcs3YSNFDHUo2LGfZuukSWyUYirJAdYbF3MfqEKmjM+I2EfhA94iG3L7uKrR+GdWD73ydlIB+6hgref1QTlmgmbM3/LeX5GI1Ux1RWpgxpLuZ2+I+IjzZ8wqE4nilvQdkUdfhzI5QDWy+kw5Wgg2pGpeEVeCCA7b85BO3F9DzxB3cdqvBzWcmzbyMiqhzuYqtHRVG2y4x+KOlnyqla8AoWWpuBoYRxzXrfKuILl6SfiWCbjxoZJUaCBj1CjH7GIaDbc9kqBY3W/Rgjda1iqQcOJu2WW+76pZC9QG7M00dffe9hNnseupFL53r8F7YHSwJWUKP2q+k7RdsxyOB11n0xtOvnW4irMMFNV4H0uqwS5ExsmP9AxbDTc9JwgneAT5vTiUSm1E7BSflSt3bfa1tv8Di3R8n3Af7MNWzs49hmauE2wP+ttrq+AsWpFG2awvsuOqbipWHgtuvuaAE+A1Z/7gC9hesnr+7wqCwG8c5yAg3AL1fm8T9AZtp/bbJGwl1pNrE7RuOX7PeMRUERVaPpEs+yqeoSmuOlokqw49pgomjLeh7icHNlG19yjs6XXOMedYm5xH2YxpV2tc0Ro2jJfxC50ApuxGob7lMsxfTbeUv07TyYxpeLucEH1gNd4IKH2LAg5TdVhlCafZvpskfncCfx8pOhJzd76bJWeYFnFciwcYfubRc12Ip/ppIhA1/mSZ/RxjFDrJC5xifFjJpY2Xl5zXdguFqYyTR1zSp1Y9p+tktDYYSNflcxI0iyO4TPBdlRcpeqjK/piF5bklq77VSEaA+z8qmJTFzIWiitbnzR794USKBUaT0NTEsVjZqLaFVqJoPN9ODG70IPbfBHKK+/q/AWR0tJzYHRULOa4MP+W/HfGadZUbfw177G7j/OGbIs8TahLyynl4X4RinF793Oz+BU0saXtUHrVBFT/DnA3ctNPoGbs4hRIjTok8i+algT1lTHi4SxFvONKNrgQFAq2/gFnWMXgwffgYMJpiKYkmW3tTg3ZQ9Jq+f8XN+A5eeUKHWvJWJ2sgJ1Sop+wwhqFVijqWaJhwtD8MNlSBeWNNWTa5Z5kPZw5+LbVT99wqTdx29lMUH4OIG/D86ruKEauBjvH5xy6um/Sfj7ei6UUVk4AIl3MyD4MSSTOFgSwsH/QJWaQ5as7ZcmgBZkzjjU1UrQ74ci1gWBCSGHtuV1H2mhSnO3Wp/3fEV5a+4wz//6qy8JxjZsmxxy5+4w9CDNJY09T072iKG0EnOS0arEYgXqYnXcYHwjTtUNAcMelOd4xpkoqiTYICWFq0JSiPfPDQdnt+4/wuqcXY47QILbgAAAABJRU5ErkJggg==")`;

  // ==========================================================================
  // React 只渲染占位 div + 覆盖层。图片由命令式 DOM 管理，不会因 React 重渲染改变 body childList
  // ==========================================================================
  return (
    <>
      {/* 占位 div — 在正常流中撑开 body 高度 */}
      {viewMode === "grid" && ph > 0 && (
        <div ref={placeholderRef} style={{ width: 1, height: ph }} />
      )}
      {/* 覆盖层：背景 — pointer-events:none 让交互穿透到图片 */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        pointerEvents: "none",
        backgroundImage: NOISE_BG,
        backgroundColor: "rgb(1, 5, 19)",
      }} />
    </>
  );
}
