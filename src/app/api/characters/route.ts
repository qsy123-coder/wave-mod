import { getDefaultGame } from "@/config/games";
import { sortCharactersByRelease } from "@/lib/constants/character-release";
import { getAvailableCharacters } from "@/lib/mods";

/**
 * 角色分类清单。手机端三条杠抽屉（`mobile-character-nav.tsx`）用它铺「全部角色分类」网格。
 *
 * 为什么单独开一个端点，而不是复用 `/api/home/lower`：
 * 那个端点要 `getPublicMods(undefined)` 把全表 mapMod 一遍再算 totalMods / avgRating /
 * characterCounts，是整站最贵的公开读（它自己的注释里写了这件事）。这里只要一个字符串数组。
 *
 * 为什么数据源是 `getAvailableCharacters` 而不是 `character-images.ts` 里那份静态表：
 * 角色分类的权威来源是**库内 distinct character**（见 CLAUDE.md 的红线）。那份静态表里还留着
 * 已废弃的 `Skins` / `Other/Misc`，又缺库里实际存在的 `武器` 与
 * `反虚化，ui界面，场景，葫芦，特效等` —— 它只适合取头像（`getCharacterImagePath`）。
 *
 * `getAvailableCharacters` 内部已有 `unstable_cache` + tag 失效 + 网关被锁时的快照兜底，
 * 所以这里不必再包一层缓存。
 */
export const dynamic = "force-dynamic";

/**
 * CDN 缓存时长（秒），口径与 `/api/home/lower` 一致。
 *
 * 返回值与登录态无关（就是一份分类名数组），可以安全公开缓存。5 分钟滞后对分类清单
 * 完全够用 —— 新角色上线不是分钟级的事；stale-while-revalidate 保证过期瞬间不排队。
 */
const CDN_CACHE_SECONDS = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameKey = searchParams.get("game") ?? getDefaultGame().key;

  const characters = await getAvailableCharacters(gameKey);

  return Response.json(
    // 手机端「全部角色分类」网格与角色分类页侧栏用同一套顺序：按鸣潮首发日期倒序，
    // 新角色在前；非角色分类压后（见 lib/constants/character-release.ts）。
    { characters: sortCharactersByRelease(characters) },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    },
  );
}
