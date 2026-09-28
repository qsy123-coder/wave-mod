import { NextRequest, NextResponse } from "next/server";

import { parseGamebananaGbId } from "@/lib/gamebanana-domain/filter-params";
import { getGamebananaModById } from "@/lib/gamebanana-domain/public";

/**
 * 详情抽屉的取数口。
 *
 * 列表页把全库一次下发到客户端，而那份 payload **刻意不含 `images` / `description`**
 * （见 mappers.ts 的 `publicGamebananaColumns`：相册是那一坨 JSON 里最大的一块，
 * 而卡片只渲染一张封面）。所以点开抽屉时才按 id 单独取一次 —— 这个口就是那次取数。
 *
 * ## 与 `/api/mods/[id]` 的关键差别，别互相抄
 *
 * 那边合并了**当前用户**的点赞/收藏/评分（`getViewerModState`），只能
 * `private, no-store`；本表没有收藏也没有评分，响应里**没有任何 per-user 状态**，
 * 同一件作品谁打开都一样，所以它可以公开缓存。
 *
 * ## 为什么 404 不跟着一起缓存
 *
 * 「读不到」有两种来源：这件作品真的没发布/不存在，以及**上游读失败且兜底快照里
 * 也没有**。后者是暂时的（网关在锁、快照没发出去），把它的 404 缓存住会让这件作品
 * 在缓存期内一直显示成不存在。宁可多打一次口，也不要缓存一个可能只是「没读到」的
 * 否定结论 —— 与 `/api/mods/[id]` 同一条理由。
 *
 * 这里**刻意不写** `export const dynamic`：本路由有动态段、也没有
 * `generateStaticParams`，本来就是按需渲染的。写 `force-dynamic` 反而会把
 * `Cache-Control: no-store` 加到响应上，把下面那几个头白费掉 ——
 * 「路由不预渲染」与「响应可以被缓存」是两件事，别用同一个开关去表达。
 */

/**
 * 5 分钟浏览器缓存 + 1 小时共享缓存。数据本身来自 6 小时 TTL 的表，
 * 给 5 分钟的浏览器缓存换来的是「同一件作品关掉抽屉再点开不重新请求」，
 * 而代价（最长 5 分钟的旧值）远小于这一页的更新频率。
 */
const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(_request: NextRequest, context: { params: Promise<{ gb_id: string }> }) {
  const { gb_id } = await context.params;
  const gbId = parseGamebananaGbId(gb_id);

  // 格式不对是**请求**的问题，不是「这件作品不存在」。也刻意不缓存：
  // 这个分支唯一的触发源是别处在拼错的链接，缓存它只会把错误固化下来。
  if (gbId === null) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const mod = await getGamebananaModById(gbId);
    if (!mod) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(mod, { headers: { "Cache-Control": PUBLIC_CACHE } });
  } catch {
    // getGamebananaModById 自己已经兜过一层（快照），走到这里说明两条来源都断了。
    // 500 而不是 404：让抽屉的提示落在「加载失败」而不是「内容不存在」上，
    // 也避免把一个瞬时故障说成永久事实。
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
