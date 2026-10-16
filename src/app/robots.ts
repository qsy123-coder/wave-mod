import type { MetadataRoute } from "next";

/**
 * robots.txt —— 2026-09-24 新增（此前站里完全没有，爬虫完全不受限）。
 *
 * 背景：`/mods/[id]` 的 HTML 里**并不含该 mod 的内容** —— 它渲染的是「默认列表页
 * + 一个客户端才填充的详情抽屉」，5292 个 URL 在爬虫眼里近乎重复。这本来就是
 * 一笔纯浪费的抓取开销，而 2026-09-23 Vercel 因 Fast Origin Transfer 300% 暂停整站，
 * 爬虫流量正是当时的嫌疑之一。
 *
 * 两条策略：
 *   1. 登录后才有意义的页面全部挡掉（挡了不会丢搜索流量，因为爬虫本来就看不到内容）。
 *   2. `/mods?…` 的筛选/翻页组合挡掉 —— 这些是近乎无限的近似重复页，
 *      每多一个参数组合就多一个抓取目标。用户照常能用，只是不进索引。
 *      （规范地址是 `/mods`，见 mods 页的 alternates.canonical。）
 *
 * 刻意**不做**的事：
 *   - **绝不写 `Disallow: /`**（2026-10-15 全站去索引时的决定，见下）。
 *   - 不挡 `/mods/[id]`。那是被分享出去的具体链接，挡掉会让分享链接在搜索引擎里
 *     指向一个不可索引的页面；用页面自身的 `noindex` 处理更精确。
 *   - 不写 sitemap。现在没有 sitemap，主动提交会**增加**抓取量；
 *     等页面缓存化上线、抓取成本确认降下来之后再单独加。
 *
 * ⚠️ 2026-10-15 起全站去索引（根 layout 的 `metadata.robots` + `X-Robots-Tag` 响应头），
 * **不要**因为「想让站从索引里消失」就往这里加 `Disallow: /` —— 那是反效果：
 * 被 Disallow 挡住的 URL，爬虫**读不到** noindex，已收录的会**永远**留在索引里
 * （2026-10-13 那次关站已经踩过）。正确姿势是「允许抓取 + 让它读到 noindex」。
 *
 * 只写规则、不写绝对域名，因此不需要 site URL 辅助函数。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // 后台（proxy.ts 也已在服务端守卫，这里是避免爬虫撞登录跳转）
          "/admin/",
          // 接口：不是页面，抓了只有开销
          "/api/",
          // 登录/回调，进去就是跳转
          "/auth/",
          // 登录后才有内容的页面：根路径 + 各游戏分站下的同路径。
          // `/*/profile` 采用前缀匹配，因此也覆盖 `/[game]/profile/edit`。
          "/favorites",
          "/profile",
          "/*/favorites",
          "/*/profile",
          // mod 列表的筛选与翻页组合（近似重复页，规范地址是 /mods）
          "/mods?",
        ],
      },
    ],
  };
}
