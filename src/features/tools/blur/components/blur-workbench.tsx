"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BlurIndexItem } from "@/app/api/tools/blur-index/route";

import { BlurEditor } from "./blur-editor";
import { buildZip, type ZipEntry } from "../lib/zip";

type IndexPayload = { total: number; characters: string[]; items: BlurIndexItem[] };
type DoneItem = { blob: Blob; name: string; url: string };

const PAGE_SIZE = 48;

/** 与 src/lib/cos/shared.ts 同一套数据万象参数：`%3E` 不能省，否则小图会被放大 */
function thumb(url: string, width = 320) {
  if (!url || !url.includes(".cos.") || url.includes("imageMogr2")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}imageMogr2/thumbnail/${width}x%3E/format/webp`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function BlurWorkbench() {
  const [data, setData] = useState<IndexPayload | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [character, setCharacter] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<Map<string, DoneItem>>(new Map());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tools/blur-index", { cache: "no-store" });
        const payload = (await res.json()) as IndexPayload & { error?: string; hint?: string };
        if (!res.ok) throw new Error(payload.hint || payload.error || `HTTP ${res.status}`);
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((item) => {
      if (character && item.character !== character) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.character.toLowerCase().includes(q);
    });
  }, [data, query, character]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  const openItem = useMemo(() => data?.items.find((i) => i.id === openId) ?? null, [data, openId]);

  const saveResult = useCallback(
    ({ blob, name }: { blob: Blob; name: string }) => {
      if (!openItem) return;
      setDone((prev) => {
        const next = new Map(prev);
        next.set(openItem.id, { blob, name, url: openItem.image });
        return next;
      });
      setNotice(`已加入待导出：${name}（共 ${done.size + 1} 张）`);
      setOpenId(null);
    },
    [openItem, done.size]
  );

  const exportAll = useCallback(async () => {
    const entries: ZipEntry[] = [];
    const jobs: { name: string; url: string }[] = [];

    for (const item of done.values()) {
      entries.push({ name: item.name, data: new Uint8Array(await item.blob.arrayBuffer()) });
      jobs.push({ name: item.name, url: item.url });
    }
    if (entries.length === 0) return;

    downloadBlob(buildZip(entries), "blur-batch.zip");
    downloadBlob(
      new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), jobs }, null, 2)], {
        type: "application/json",
      }),
      "blur-jobs.json"
    );
    setNotice(`已导出 ${entries.length} 张：blur-batch.zip + blur-jobs.json`);
  }, [done]);

  const clearAll = () => {
    if (!confirm("清空所有打码结果？未导出的会丢失。")) return;
    setDone(new Map());
    setNotice("");
  };

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-amber-600/40 bg-amber-500/10 p-5">
        <p className="text-sm text-amber-300">清单加载失败：{error}</p>
        <p className="mt-2 text-xs text-amber-200/70">
          审阅台读的是本地快照 <code className="text-amber-200">data/mods-snapshot.json.gz</code>，
          不依赖数据库。文件不在就先用 <code className="text-amber-200">scripts/export-mods-snapshot.ps1</code> 重导一份。
        </p>
      </div>
    );
  }

  if (!data) {
    return <p className="py-20 text-center text-sm text-zinc-500">正在读快照…</p>;
  }

  return (
    <div>
      {/* 工具栏 */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="搜标题 / 角色"
            className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-500"
          />

          <select
            value={character}
            onChange={(e) => {
              setCharacter(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          >
            <option value="">全部角色</option>
            {data.characters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="text-xs text-zinc-500">
            {filtered.length} / {data.total} 张
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              已打码 <b className="text-cyan-400">{done.size}</b>
            </span>
            <button
              type="button"
              onClick={exportAll}
              disabled={done.size === 0}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-35"
            >
              打包导出
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={done.size === 0}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-35"
            >
              清空
            </button>
          </div>
        </div>

        {notice && <p className="mt-2 text-xs text-cyan-300/80">{notice}</p>}
      </div>

      {/* 网格 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {shown.map((item) => {
          const finished = done.get(item.id);
          return (
            <div
              key={item.id}
              className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
            >
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="relative block w-full"
                title="点开打码"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb(item.image, 320)}
                  alt={item.title}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                  <span className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black">
                    {finished ? "重新打码" : "打码"}
                  </span>
                </span>
                {finished && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-semibold text-black">
                    已打码
                  </span>
                )}
                {item.extraImages > 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-zinc-300">
                    +{item.extraImages} 图
                  </span>
                )}
              </button>
              <div className="px-2.5 py-2">
                <p className="truncate text-xs text-zinc-200" title={item.title}>
                  {item.title}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {item.character}
                  {item.createdAt ? ` · ${item.createdAt.slice(0, 10)}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {visible < filtered.length && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="rounded-md border border-zinc-700 px-5 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            再加载 {PAGE_SIZE} 张（还剩 {filtered.length - visible}）
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">没有匹配的图。</p>
      )}

      {openItem && (
        <BlurEditor
          item={openItem}
          alreadyDone={done.has(openItem.id)}
          onSave={saveResult}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
