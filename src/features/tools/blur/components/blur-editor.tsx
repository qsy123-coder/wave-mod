"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BlurIndexItem } from "@/app/api/tools/blur-index/route";

/**
 * 单张图的打码编辑器（模态）。
 *
 * 画布逻辑是命令式的（拖拽时每帧重绘），所以区域数组放在 ref 里，
 * React state 只负责工具栏这类低频 UI —— 避免每次 pointermove 都走一遍渲染。
 */

type Mode = "mosaic" | "blur";
type Point = { x: number; y: number };
type Region = { x: number; y: number; w: number; h: number; mode: Mode; strength: number };
type Drag =
  | { kind: "new"; start: Point; cur: Point }
  | { kind: "move"; index: number; start: Point; orig: Point }
  | { kind: "resize"; index: number; start: Point; orig: Region };

const MODE_CONF: Record<Mode, { min: number; max: number; step: number; def: number; label: string }> = {
  mosaic: { min: 4, max: 80, step: 2, def: 16, label: "方块" },
  blur: { min: 2, max: 60, step: 1, def: 12, label: "半径" },
};

const MIN_REGION = 8;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function baseNameOf(url: string) {
  try {
    const last = decodeURIComponent(url.split("?")[0].split("/").pop() || "");
    return (last || "image").replace(/\.[^.]+$/, "") || "image";
  } catch {
    return "image";
  }
}

export function BlurEditor({
  item,
  onSave,
  onClose,
  alreadyDone,
}: {
  item: BlurIndexItem;
  onSave: (result: { blob: Blob; name: string }) => void;
  onClose: () => void;
  alreadyDone: boolean;
}) {
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    src: null as HTMLCanvasElement | null,
    regions: [] as Region[],
    selected: -1,
    drag: null as Drag | null,
    history: [] as string[],
    mode: "mosaic" as Mode,
    strength: MODE_CONF.mosaic.def,
  });

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [selected, setSelected] = useState(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [mode, setMode] = useState<Mode>("mosaic");
  const [strength, setStrength] = useState(MODE_CONF.mosaic.def);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* ---------- 绘制 ---------- */

  const paintRegion = useCallback((ctx: CanvasRenderingContext2D, r: Region) => {
    const src = stateRef.current.src;
    if (!src) return;

    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const sx = Math.max(0, x);
    const sy = Math.max(0, y);
    const ex = Math.min(src.width, x + Math.round(r.w));
    const ey = Math.min(src.height, y + Math.round(r.h));
    const sw = ex - sx;
    const sh = ey - sy;
    if (sw < 1 || sh < 1) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();

    const tmp = document.createElement("canvas");

    if (r.mode === "mosaic") {
      const block = Math.max(2, Math.round(r.strength));
      const tw = Math.max(1, Math.round(sw / block));
      const th = Math.max(1, Math.round(sh / block));
      tmp.width = tw;
      tmp.height = th;
      const tctx = tmp.getContext("2d");
      if (!tctx) {
        ctx.restore();
        return;
      }
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tw, th, sx, sy, sw, sh);
      ctx.imageSmoothingEnabled = true;
    } else {
      const radius = Math.max(1, r.strength);
      // 多取一圈源像素：否则模糊在裁剪边缘会露出透明的"描边"
      const pad = Math.ceil(radius * 3);
      const px = Math.max(0, sx - pad);
      const py = Math.max(0, sy - pad);
      const pex = Math.min(src.width, ex + pad);
      const pey = Math.min(src.height, ey + pad);
      const pw = pex - px;
      const ph = pey - py;

      tmp.width = pw;
      tmp.height = ph;
      const tctx = tmp.getContext("2d");
      if (!tctx) {
        ctx.restore();
        return;
      }
      tctx.filter = `blur(${radius}px)`;
      tctx.drawImage(src, px, py, pw, ph, 0, 0, pw, ph);
      tctx.filter = "none";
      ctx.drawImage(tmp, px, py);
    }
    ctx.restore();
  }, []);

  const renderImageInto = useCallback(
    (target: HTMLCanvasElement) => {
      const src = stateRef.current.src;
      const ctx = target.getContext("2d");
      if (!src || !ctx) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(src, 0, 0);
      for (const r of stateRef.current.regions) paintRegion(ctx, r);
    },
    [paintRegion]
  );

  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const ctx = overlay?.getContext("2d");
    if (!overlay || !ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const rect = overlay.getBoundingClientRect();
    const scale = rect.width > 0 ? overlay.width / rect.width : 1;

    stateRef.current.regions.forEach((r, i) => {
      const on = i === stateRef.current.selected;
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.setLineDash(on ? [] : [6 * scale, 4 * scale]);
      ctx.strokeStyle = on ? "#22d3ee" : "rgba(255,255,255,.82)";
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      if (on) {
        const hs = 11 * scale;
        ctx.setLineDash([]);
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(r.x + r.w - hs / 2, r.y + r.h - hs / 2, hs, hs);
      }
    });

    const drag = stateRef.current.drag;
    if (drag?.kind === "new") {
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.strokeStyle = "#22d3ee";
      ctx.strokeRect(
        Math.min(drag.start.x, drag.cur.x),
        Math.min(drag.start.y, drag.cur.y),
        Math.abs(drag.cur.x - drag.start.x),
        Math.abs(drag.cur.y - drag.start.y)
      );
    }
    ctx.setLineDash([]);
  }, []);

  const renderAll = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (canvas) renderImageInto(canvas);
    renderOverlay();
  }, [renderImageInto, renderOverlay]);

  /* ---------- 载入 ---------- */

  const adoptBitmap = useCallback(
    (bitmap: ImageBitmap) => {
      const src = document.createElement("canvas");
      src.width = bitmap.width;
      src.height = bitmap.height;
      src.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close?.();

      const imgCanvas = imgCanvasRef.current;
      const overlay = overlayRef.current;
      if (imgCanvas) {
        imgCanvas.width = src.width;
        imgCanvas.height = src.height;
      }
      if (overlay) {
        overlay.width = src.width;
        overlay.height = src.height;
      }

      stateRef.current.src = src;
      stateRef.current.regions = [];
      stateRef.current.selected = -1;
      stateRef.current.history = [];
      setSelected(-1);
      setCanUndo(false);
      setStatus("ready");
      // 等 DOM 尺寸落定再画
      requestAnimationFrame(() => renderAll());
    },
    [renderAll]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorText("");

    (async () => {
      try {
        // 跨域取原图：桶的 CORS 只放行站点自身的域名，从 file:// 打开会被拦。
        const res = await fetch(item.image, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        if (cancelled) {
          bitmap.close?.();
          return;
        }
        adoptBitmap(bitmap);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setStatus("error");
        setErrorText(
          `取不到原图（${message}）。多半是 COS 没给当前域名开放跨域读取 —— ` +
            "点下面的「换成本地图」直接把原图拖进来即可。"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item.id, item.image, adoptBitmap]);

  useEffect(() => {
    const onResize = () => renderOverlay();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderOverlay]);

  const loadLocalFile = useCallback(
    async (file: File) => {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        adoptBitmap(bitmap);
        setErrorText("");
      } catch (error) {
        setErrorText("本地文件读不出来：" + (error instanceof Error ? error.message : String(error)));
      }
    },
    [adoptBitmap]
  );

  /* ---------- 交互 ---------- */

  const toNatural = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const scale = rect.width > 0 ? overlay.width / rect.width : 1;
    return {
      x: clamp((e.clientX - rect.left) * scale, 0, overlay.width),
      y: clamp((e.clientY - rect.top) * scale, 0, overlay.height),
    };
  };

  const pushHistory = () => {
    stateRef.current.history.push(JSON.stringify(stateRef.current.regions));
    if (stateRef.current.history.length > 50) stateRef.current.history.shift();
    setCanUndo(true);
  };

  const syncToolbar = (index: number) => {
    const r = stateRef.current.regions[index];
    if (!r) return;
    stateRef.current.mode = r.mode;
    stateRef.current.strength = r.strength;
    setMode(r.mode);
    setStrength(r.strength);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    if (!state.src || status !== "ready") return;
    e.preventDefault();

    const p = toNatural(e);
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const scale = rect.width > 0 ? overlay.width / rect.width : 1;
    const tol = 10 * scale;

    const sel = state.regions[state.selected];
    if (sel && Math.abs(p.x - (sel.x + sel.w)) <= tol && Math.abs(p.y - (sel.y + sel.h)) <= tol) {
      pushHistory();
      state.drag = { kind: "resize", index: state.selected, start: p, orig: { ...sel } };
    } else {
      let hit = -1;
      for (let i = state.regions.length - 1; i >= 0; i--) {
        const r = state.regions[i];
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          hit = i;
          break;
        }
      }
      if (hit >= 0) {
        state.selected = hit;
        setSelected(hit);
        syncToolbar(hit);
        pushHistory();
        state.drag = { kind: "move", index: hit, start: p, orig: { x: state.regions[hit].x, y: state.regions[hit].y } };
      } else {
        state.selected = -1;
        setSelected(-1);
        state.drag = { kind: "new", start: p, cur: p };
      }
    }
    overlay.setPointerCapture(e.pointerId);
    renderOverlay();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    const drag = state.drag;
    if (!drag || !state.src) return;

    const p = toNatural(e);

    if (drag.kind === "new") {
      drag.cur = p;
      renderOverlay();
      return;
    }

    const r = state.regions[drag.index];
    if (!r) return;

    if (drag.kind === "move") {
      r.x = clamp(drag.orig.x + (p.x - drag.start.x), 0, state.src.width - r.w);
      r.y = clamp(drag.orig.y + (p.y - drag.start.y), 0, state.src.height - r.h);
    } else {
      r.w = clamp(drag.orig.w + (p.x - drag.start.x), MIN_REGION, state.src.width - drag.orig.x);
      r.h = clamp(drag.orig.h + (p.y - drag.start.y), MIN_REGION, state.src.height - drag.orig.y);
    }
    renderAll();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    const drag = state.drag;
    if (!drag) return;
    state.drag = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 指针已经释放 */
    }

    if (drag.kind === "new") {
      const w = Math.abs(drag.cur.x - drag.start.x);
      const h = Math.abs(drag.cur.y - drag.start.y);
      if (w >= MIN_REGION && h >= MIN_REGION) {
        pushHistory();
        state.regions.push({
          x: Math.min(drag.start.x, drag.cur.x),
          y: Math.min(drag.start.y, drag.cur.y),
          w,
          h,
          mode: state.mode,
          strength: state.strength,
        });
        state.selected = state.regions.length - 1;
        setSelected(state.selected);
        syncToolbar(state.selected);
      }
    }
    renderAll();
  };

  const undo = useCallback(() => {
    const state = stateRef.current;
    const previous = state.history.pop();
    if (!previous) return;
    state.regions = JSON.parse(previous) as Region[];
    if (state.selected >= state.regions.length) {
      state.selected = -1;
      setSelected(-1);
    }
    setCanUndo(state.history.length > 0);
    renderAll();
  }, [renderAll]);

  const removeSelected = useCallback(() => {
    const state = stateRef.current;
    if (state.selected < 0) return;
    pushHistory();
    state.regions.splice(state.selected, 1);
    state.selected = -1;
    setSelected(-1);
    renderAll();
  }, [renderAll]);

  const applyMode = (next: Mode) => {
    const state = stateRef.current;
    const conf = MODE_CONF[next];
    state.mode = next;

    const r = state.regions[state.selected];
    if (r) {
      r.mode = next;
      r.strength = clamp(r.strength, conf.min, conf.max);
      state.strength = r.strength;
      setStrength(r.strength);
      setMode(next);
      renderAll();
    } else {
      state.strength = clamp(state.strength, conf.min, conf.max);
      setStrength(state.strength);
      setMode(next);
    }
  };

  const applyStrength = (next: number) => {
    const state = stateRef.current;
    state.strength = next;
    setStrength(next);
    const r = state.regions[state.selected];
    if (r) {
      r.strength = next;
      renderAll();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if ((e.key === "Delete" || e.key === "Backspace") && stateRef.current.selected >= 0) {
        e.preventDefault();
        removeSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, removeSelected, undo]);

  /* ---------- 导出 ---------- */

  const exportBlob = useCallback(async (): Promise<Blob | null> => {
    const src = stateRef.current.src;
    if (!src) return null;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    renderImageInto(out);
    return new Promise((resolve) => out.toBlob((blob) => resolve(blob), "image/webp", 0.92));
  }, [renderImageInto]);

  const handleSave = async () => {
    setBusy(true);
    try {
      const blob = await exportBlob();
      if (!blob) {
        setErrorText("导出失败：浏览器没能编码这张图。");
        return;
      }
      onSave({ blob, name: `${baseNameOf(item.image)}-blur.webp` });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadOne = async () => {
    const blob = await exportBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseNameOf(item.image)}-blur.webp`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const conf = MODE_CONF[mode];
  const dims = stateRef.current.src;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
        {/* 头部 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
            <p className="truncate text-xs text-zinc-500">
              {item.character}
              {dims ? ` · ${dims.width}×${dims.height}` : ""}
              {alreadyDone ? " · 已打码（再保存会覆盖）" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            关闭
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
            {(["mosaic", "blur"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => applyMode(m)}
                className={`px-3 py-1.5 text-sm ${
                  mode === m ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {m === "mosaic" ? "马赛克" : "高斯模糊"}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-20 tabular-nums">
              {conf.label} {strength}px
            </span>
            <input
              type="range"
              min={conf.min}
              max={conf.max}
              step={conf.step}
              value={strength}
              onChange={(e) => applyStrength(Number(e.target.value))}
              className="w-32 accent-cyan-400"
            />
          </label>

          <button
            type="button"
            onClick={removeSelected}
            disabled={selected < 0}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
          >
            删除选中
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
          >
            撤销
          </button>

          <span className="ml-auto text-xs text-zinc-500">在图上拖出矩形 · Delete 删除 · Ctrl+Z 撤销</span>
        </div>

        {/* 画布 */}
        <div className="flex-1 overflow-auto bg-zinc-950 p-3">
          {status === "loading" && <p className="py-16 text-center text-sm text-zinc-500">正在取原图…</p>}

          {status === "error" && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <p className="whitespace-pre-wrap text-sm text-amber-400">{errorText}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black"
              >
                换成本地图
              </button>
            </div>
          )}

          <div className={`relative mx-auto w-fit max-w-full ${status === "ready" ? "" : "hidden"}`}>
            <canvas ref={imgCanvasRef} className="block h-auto max-w-full" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadLocalFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={status !== "ready" || busy}
            className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {busy ? "处理中…" : alreadyDone ? "覆盖这张的打码结果" : "保存打码结果"}
          </button>
          <button
            type="button"
            onClick={handleDownloadOne}
            disabled={status !== "ready"}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40"
          >
            只下载这张
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
          >
            改用本地文件
          </button>
          <span className="ml-auto text-xs text-zinc-500">
            {item.image.split("/").pop()}
          </span>
        </div>
      </div>
    </div>
  );
}
