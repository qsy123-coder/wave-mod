import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { NextResponse } from "next/server";

/**
 * 打码审阅台的图片清单。
 *
 * 直接读本地兜底快照（data/mods-snapshot.json.gz），**不查 Supabase**：
 * 库被锁或配额打穿时，审阅台仍然要能用（这正是它的使用场景）。
 *
 * 只吐审阅需要的字段。整份快照有 5500+ 行、带描述与网盘链接，原样发给浏览器
 * 就是几 MB；这里压到「标题 + 角色 + 一张图」的量级。
 */

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id?: string;
  title?: string;
  character?: string;
  images?: string[];
  created_at?: string;
  is_published?: boolean;
  game_key?: string;
};

export type BlurIndexItem = {
  id: string;
  title: string;
  character: string;
  image: string;
  extraImages: number;
  createdAt: string;
  published: boolean;
  gameKey: string;
};

let cache: { at: number; payload: unknown } | null = null;
const CACHE_MS = 10 * 60 * 1000;

function readSnapshotRows(): SnapshotRow[] {
  const path = join(process.cwd(), "data", "mods-snapshot.json.gz");
  const raw = gunzipSync(readFileSync(path)).toString("utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as SnapshotRow[];
  const maybe = parsed as { mods?: SnapshotRow[]; rows?: SnapshotRow[] };
  return maybe.mods ?? maybe.rows ?? [];
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, { headers: { "cache-control": "no-store" } });
  }

  let rows: SnapshotRow[];
  try {
    rows = readSnapshotRows();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[blur-index] 读取本地快照失败", error);
    return NextResponse.json(
      {
        error: "读取本地快照失败",
        detail: message,
        hint: "确认 data/mods-snapshot.json.gz 存在；缺了就先用 scripts/export-mods-snapshot.ps1 重导一份。",
      },
      { status: 503 }
    );
  }

  const items: BlurIndexItem[] = [];
  for (const row of rows) {
    const image = row.images?.[0];
    if (!row.id || !image) continue;

    items.push({
      id: row.id,
      title: row.title ?? "(无标题)",
      character: row.character ?? "未分类",
      image,
      extraImages: Math.max(0, (row.images?.length ?? 1) - 1),
      createdAt: row.created_at ?? "",
      published: row.is_published !== false,
      gameKey: row.game_key ?? "",
    });
  }

  // 新的在前：改图的顺序基本就是「最近入库的」顺序
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const characters = Array.from(new Set(items.map((i) => i.character))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );

  const payload = { total: items.length, characters, items };
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
